import "server-only";
import {
  buildProposal,
  buildReason,
  calendarDaysUntil,
  computeUrgencies,
  getWeekRange,
  localDateOf,
  sortGoals,
  type AssignmentInput,
  type Interval,
  type ProposalDraft,
} from "@/server/engine";
import {
  loadEngineGoals,
  loadWeekAssignments,
  loadWeekEventRows,
  loadWindows,
  toBusyInput,
  type Db,
} from "./engine-input";

export interface DraftResult {
  draft: ProposalDraft;
  reason: string;
}

/**
 * 충돌 배정에 대한 재배분안과 사유 문장을 만든다 (DB는 읽기만 한다).
 * 다른 PENDING 제안의 목표 시간은 예약으로 취급한다 (ignoreProposalIds는 제외).
 */
export async function draftProposal(
  db: Db,
  input: {
    userId: string;
    now: Date;
    conflicted: AssignmentInput[];
    excluded: Record<string, Interval[]>;
    triggerTitle: string;
    ignoreProposalIds?: string[];
  },
): Promise<DraftResult | null> {
  const {
    userId,
    now,
    conflicted,
    excluded,
    triggerTitle,
    ignoreProposalIds = [],
  } = input;
  if (conflicted.length === 0) return null;

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const tz = user.timezone;
  const weekRange = getWeekRange(now, tz);
  const today = localDateOf(now, tz);

  const [windows, eventRows, assignments, { goals, titles }, pending] =
    await Promise.all([
      loadWindows(db, userId),
      loadWeekEventRows(db, userId, weekRange),
      loadWeekAssignments(db, userId, weekRange),
      loadEngineGoals(db, userId),
      db.proposal.findMany({
        where: { userId, status: "PENDING", id: { notIn: ignoreProposalIds } },
        include: { items: true },
      }),
    ]);

  const reserved: Interval[] = pending
    .flatMap((p) => p.items)
    .filter((i) => i.toStartAt && i.toEndAt)
    .map((i) => ({ start: i.toStartAt!, end: i.toEndAt! }));

  const goalsOrder = sortGoals(computeUrgencies({ goals, windows, today })).map(
    (u) => u.goalId,
  );

  const draft = buildProposal({
    conflicted,
    goalsOrder,
    windows,
    externalEvents: eventRows.map(toBusyInput),
    assignments,
    reserved,
    excluded,
    now,
    tz,
  });
  if (!draft) return null;

  const examDateById = new Map(goals.map((g) => [g.id, g.examDate]));
  const reason = buildReason({
    eventTitle: triggerTitle,
    goals: draft.meta.byGoal.map((g) => ({
      title: titles.get(g.goalId) ?? "목표",
      daysLeft: calendarDaysUntil(today, examDateById.get(g.goalId) ?? today),
    })),
    totalCount: draft.meta.conflictedCount,
    unscheduledCount: draft.meta.unscheduledCount,
  });
  return { draft, reason };
}

/** 조정안 저장. replacesId가 있으면 그 안을 SUPERSEDED로 바꾸고 replacedBy로 잇는다. */
export async function saveProposal(
  db: Db,
  input: {
    userId: string;
    now: Date;
    triggerExternalEventId: string | null;
    result: DraftResult;
    replacesId?: string;
  },
): Promise<string> {
  const { userId, now, triggerExternalEventId, result, replacesId } = input;
  const created = await db.proposal.create({
    data: {
      userId,
      triggerExternalEventId,
      reason: result.reason,
      items: {
        create: result.draft.items.map((it) => ({
          assignmentId: it.assignmentId,
          fromStartAt: it.fromStartAt,
          fromEndAt: it.fromEndAt,
          toStartAt: it.toStartAt,
          toEndAt: it.toEndAt,
          toAvailabilityWindowId: it.toWindowId,
          toWindowKind: it.toWindowKind,
        })),
      },
    },
  });
  if (replacesId) {
    await db.proposal.update({
      where: { id: replacesId },
      data: { status: "SUPERSEDED", decidedAt: now, replacedById: created.id },
    });
  }
  return created.id;
}
