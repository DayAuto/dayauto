import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getNow } from "@/server/clock";
import { getDb } from "@/server/db";
import {
  findConflicts,
  getWeekRange,
  hasNoAlternative,
  validateProposal,
  type AssignmentInput,
  type Interval,
  type ProposalItemDraft,
} from "@/server/engine";
import {
  loadWeekAssignments,
  loadWeekEventRows,
  toBusyInput,
} from "./engine-input";
import { draftProposal, saveProposal } from "./proposal-builder";
import { UserFacingError } from "./setup";

type Tx = Prisma.TransactionClient;

export type ProposalOutcome =
  /** 수락해서 배정을 옮김 */
  | "ACCEPTED"
  /** 수락 시 재검증 실패 → 새 안을 자동 생성 (04 §6.2) */
  | "REGENERATED"
  /** 재검증 실패 + 더 이상 충돌이 없어 새 안이 필요 없음 */
  | "OBSOLETE"
  /** [다시 배분]으로 다른 안으로 교체 */
  | "REPLACED"
  /** 다른 배분안이 없어 현재 안 유지 (04 §6.1) */
  | "NO_ALTERNATIVE"
  /** [원래 일정대로] */
  | "REJECTED";

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

async function loadOwnedPending(tx: Tx, userId: string, proposalId: string) {
  const p = await tx.proposal.findFirst({
    where: { id: proposalId, userId },
    include: { items: true, triggerExternalEvent: true },
  });
  if (!p) throw new UserFacingError("조정안을 찾을 수 없습니다.");
  if (p.status !== "PENDING")
    throw new UserFacingError("이미 처리된 조정안입니다.");
  return p;
}

type LoadedProposal = Awaited<ReturnType<typeof loadOwnedPending>>;

function toDraftItems(p: LoadedProposal): ProposalItemDraft[] {
  return p.items.map((i) => ({
    assignmentId: i.assignmentId,
    fromStartAt: i.fromStartAt,
    fromEndAt: i.fromEndAt,
    toStartAt: i.toStartAt,
    toEndAt: i.toEndAt,
    toWindowId: i.toAvailabilityWindowId,
    toWindowKind: i.toWindowKind,
  }));
}

/** 제안의 배정 중 아직 제안 시점 그대로(PLANNED·시간 동일)인 것 */
function stillConflicted(
  p: LoadedProposal,
  assignments: AssignmentInput[],
  now: Date,
): AssignmentInput[] {
  const byId = new Map(assignments.map((a) => [a.id, a]));
  return p.items
    .map((i) => byId.get(i.assignmentId))
    .filter(
      (a): a is AssignmentInput =>
        a !== undefined && a.status === "PLANNED" && a.startAt >= now,
    );
}

/** [이대로 진행]: 재검증 → 배정 이동/해제 → ACCEPTED. 재검증 실패 시 새 안을 자동 생성 */
export async function acceptProposal(
  userId: string,
  proposalId: string,
): Promise<ProposalOutcome> {
  return getDb().$transaction(async (tx): Promise<ProposalOutcome> => {
    const now = getNow();
    const p = await loadOwnedPending(tx, userId, proposalId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const weekRange = getWeekRange(now, user.timezone);
    const assignments = await loadWeekAssignments(tx, userId, weekRange);
    const eventRows = await loadWeekEventRows(tx, userId, weekRange);

    const items = toDraftItems(p);
    const check = validateProposal({
      items,
      assignments,
      externalEvents: eventRows.map(toBusyInput),
      now,
    });

    if (check.ok) {
      for (const it of p.items) {
        await tx.assignment.update({
          where: { id: it.assignmentId },
          data:
            it.toStartAt && it.toEndAt && it.toWindowKind
              ? {
                  startAt: it.toStartAt,
                  endAt: it.toEndAt,
                  availabilityWindowId: it.toAvailabilityWindowId,
                  windowKind: it.toWindowKind,
                }
              : { status: "UNSCHEDULED" },
        });
      }
      await tx.proposal.update({
        where: { id: p.id },
        data: { status: "ACCEPTED", decidedAt: now },
      });
      return "ACCEPTED";
    }

    // 그 사이 일정이 바뀜: 현재 안을 SUPERSEDED 처리하고 새 안을 자동 생성 (D-13)
    const trigger = p.triggerExternalEvent;
    const conflicted =
      trigger && trigger.status === "ACTIVE"
        ? findConflicts(
            trigger,
            assignments.filter((a) => a.status === "PLANNED"),
            now,
          )
        : [];
    const result = await draftProposal(tx, {
      userId,
      now,
      conflicted,
      excluded: {},
      triggerTitle: trigger?.title ?? "일정",
      ignoreProposalIds: [p.id],
    });
    if (!result) {
      await tx.proposal.update({
        where: { id: p.id },
        data: { status: "SUPERSEDED", decidedAt: now },
      });
      return "OBSOLETE";
    }
    await saveProposal(tx, {
      userId,
      now,
      triggerExternalEventId: p.triggerExternalEventId,
      result,
      replacesId: p.id,
    });
    return "REGENERATED";
  }, TX_OPTIONS);
}

/** [다시 배분]: 이전 안들의 목표 시간을 제외하고 다른 안을 만든다. 대안이 없으면 현재 안 유지 */
export async function reallocateProposal(
  userId: string,
  proposalId: string,
): Promise<ProposalOutcome> {
  return getDb().$transaction(async (tx): Promise<ProposalOutcome> => {
    const now = getNow();
    const p = await loadOwnedPending(tx, userId, proposalId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const weekRange = getWeekRange(now, user.timezone);
    const assignments = await loadWeekAssignments(tx, userId, weekRange);

    // replacedBy 체인을 거슬러 올라가며 이전에 제안했던 목표 구간 수집
    const excluded: Record<string, Interval[]> = {};
    const addTargets = (
      items: {
        assignmentId: string;
        toStartAt: Date | null;
        toEndAt: Date | null;
      }[],
    ) => {
      for (const i of items) {
        if (i.toStartAt && i.toEndAt) {
          (excluded[i.assignmentId] ??= []).push({
            start: i.toStartAt,
            end: i.toEndAt,
          });
        }
      }
    };
    addTargets(p.items);
    let cursorId = p.id;
    for (;;) {
      const prev = await tx.proposal.findFirst({
        where: { replacedById: cursorId },
        include: { items: true },
      });
      if (!prev) break;
      addTargets(prev.items);
      cursorId = prev.id;
    }

    const conflicted = stillConflicted(p, assignments, now);
    const result = await draftProposal(tx, {
      userId,
      now,
      conflicted,
      excluded,
      triggerTitle: p.triggerExternalEvent?.title ?? "일정",
      ignoreProposalIds: [p.id],
    });

    if (!result || hasNoAlternative(result.draft)) return "NO_ALTERNATIVE";

    await saveProposal(tx, {
      userId,
      now,
      triggerExternalEventId: p.triggerExternalEventId,
      result,
      replacesId: p.id,
    });
    return "REPLACED";
  }, TX_OPTIONS);
}

/** [원래 일정대로]: 배정은 그대로 두고 REJECTED */
export async function rejectProposal(
  userId: string,
  proposalId: string,
): Promise<ProposalOutcome> {
  return getDb().$transaction(async (tx): Promise<ProposalOutcome> => {
    const p = await loadOwnedPending(tx, userId, proposalId);
    await tx.proposal.update({
      where: { id: p.id },
      data: { status: "REJECTED", decidedAt: getNow() },
    });
    return "REJECTED";
  }, TX_OPTIONS);
}
