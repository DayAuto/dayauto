import {
  buildChunkGrid,
  contiguousRuns,
  freeChunks,
  getWeekRange,
} from "./time";
import type {
  AssignmentInput,
  BusyEventInput,
  Interval,
  TimeWindow,
  WindowKind,
} from "./types";
import { busyIntervals, compareStr, occupiedIntervals, overlaps } from "./util";

export interface ProposalItemDraft {
  assignmentId: string;
  fromStartAt: Date;
  fromEndAt: Date;
  /** null = 이번 주 배치 불가 → 배정 해제 (UNSCHEDULED) */
  toStartAt: Date | null;
  toEndAt: Date | null;
  toWindowId: string | null;
  toWindowKind: WindowKind | null;
}

export interface ProposalMeta {
  conflictedCount: number;
  movedCount: number;
  unscheduledCount: number;
  /** 충돌 배정이 있는 목표, 긴급도 순 */
  byGoal: {
    goalId: string;
    count: number;
    moved: number;
    unscheduled: number;
  }[];
}

export interface ProposalDraft {
  items: ProposalItemDraft[];
  meta: ProposalMeta;
}

export interface BuildProposalInput {
  conflicted: AssignmentInput[];
  /** 긴급도 순 목표 id (allocateWeek의 goalOrder) */
  goalsOrder: string[];
  windows: TimeWindow[];
  externalEvents: BusyEventInput[];
  /** 현재 모든 배정 (conflicted 포함) */
  assignments: AssignmentInput[];
  /** 다른 PENDING 제안들의 목표 시간 */
  reserved: Interval[];
  /** [다시 배분] 체인에서 이전에 제안했던 목표 구간 (assignmentId별) */
  excluded: Record<string, Interval[]>;
  now: Date;
  tz: string;
}

/** 재배분안 생성 (04 문서 §6). 분할하지 않고 통째로 이동, 미루기 우선, 이번 주 안. */
export function buildProposal(input: BuildProposalInput): ProposalDraft | null {
  const {
    conflicted,
    goalsOrder,
    windows,
    externalEvents,
    assignments,
    reserved,
    excluded,
    now,
    tz,
  } = input;
  if (conflicted.length === 0) return null;

  const conflictedIds = new Set(conflicted.map((a) => a.id));
  const grid = buildChunkGrid({
    windows,
    weekRange: getWeekRange(now, tz),
    tz,
  });
  let free = freeChunks(grid, {
    now,
    busyIntervals: busyIntervals(externalEvents),
    occupiedIntervals: [
      ...occupiedIntervals(assignments.filter((a) => !conflictedIds.has(a.id))),
      ...reserved,
    ],
  });

  const rank = (goalId: string) => {
    const i = goalsOrder.indexOf(goalId);
    return i === -1 ? goalsOrder.length : i;
  };
  const sorted = [...conflicted].sort(
    (a, b) =>
      rank(a.goalId) - rank(b.goalId) ||
      a.startAt.getTime() - b.startAt.getTime() ||
      compareStr(a.id, b.id),
  );

  const items: ProposalItemDraft[] = [];
  for (const a of sorted) {
    const blocked = excluded[a.id] ?? [];
    const runs = contiguousRuns(
      free.filter((c) => c.slotType === a.slotType),
      a.chunkCount,
    ).filter((run) => {
      const iv = { start: run[0].startAt, end: run[run.length - 1].endAt };
      return !blocked.some((b) => overlaps(iv, b));
    });
    // 1순위: 원래 시작 이후 중 가장 이른 것, 2순위: 원래 시작 이전(now 이후) 중 가장 이른 것
    const pick = runs.find((r) => r[0].startAt >= a.startAt) ?? runs[0];

    if (pick) {
      const taken = new Set(pick);
      free = free.filter((c) => !taken.has(c));
      items.push({
        assignmentId: a.id,
        fromStartAt: a.startAt,
        fromEndAt: a.endAt,
        toStartAt: pick[0].startAt,
        toEndAt: pick[pick.length - 1].endAt,
        toWindowId: pick[0].windowId,
        toWindowKind: pick[0].windowKind,
      });
    } else {
      items.push({
        assignmentId: a.id,
        fromStartAt: a.startAt,
        fromEndAt: a.endAt,
        toStartAt: null,
        toEndAt: null,
        toWindowId: null,
        toWindowKind: null,
      });
    }
  }

  const goalOf = new Map(conflicted.map((a) => [a.id, a.goalId]));
  const byGoalMap = new Map<
    string,
    { goalId: string; count: number; moved: number; unscheduled: number }
  >();
  for (const it of items) {
    const goalId = goalOf.get(it.assignmentId)!;
    const e = byGoalMap.get(goalId) ?? {
      goalId,
      count: 0,
      moved: 0,
      unscheduled: 0,
    };
    e.count += 1;
    if (it.toStartAt) e.moved += 1;
    else e.unscheduled += 1;
    byGoalMap.set(goalId, e);
  }
  const byGoal = [...byGoalMap.values()].sort(
    (a, b) => rank(a.goalId) - rank(b.goalId),
  );
  const movedCount = items.filter((i) => i.toStartAt).length;

  return {
    items,
    meta: {
      conflictedCount: items.length,
      movedCount,
      unscheduledCount: items.length - movedCount,
      byGoal,
    },
  };
}

/** [다시 배분]에서 "더 이상 다른 배분안이 없음" 판정 (04 문서 §6.1) */
export function hasNoAlternative(draft: ProposalDraft | null): boolean {
  return draft === null || draft.items.every((i) => i.toStartAt === null);
}

export interface ValidateInput {
  items: ProposalItemDraft[];
  /** 현재 DB 기준 모든 배정 */
  assignments: AssignmentInput[];
  externalEvents: BusyEventInput[];
  now: Date;
}

/** 수락 시 재검증 (04 문서 §6.2). 하나라도 실패하면 ok=false. */
export function validateProposal(input: ValidateInput): {
  ok: boolean;
  failedAssignmentIds: string[];
} {
  const { items, assignments, externalEvents, now } = input;
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const ownIds = new Set(items.map((i) => i.assignmentId));
  const others = occupiedIntervals(
    assignments.filter((a) => !ownIds.has(a.id)),
  );
  const busy = busyIntervals(externalEvents);
  const failed: string[] = [];
  const accepted: Interval[] = [];

  for (const it of items) {
    const a = byId.get(it.assignmentId);
    if (
      !a ||
      a.status !== "PLANNED" ||
      a.startAt.getTime() !== it.fromStartAt.getTime()
    ) {
      failed.push(it.assignmentId);
      continue;
    }
    if (!it.toStartAt || !it.toEndAt) continue;
    const iv = { start: it.toStartAt, end: it.toEndAt };
    const blocked =
      it.toStartAt < now ||
      busy.some((b) => overlaps(iv, b)) ||
      others.some((o) => overlaps(iv, o)) ||
      accepted.some((o) => overlaps(iv, o));
    if (blocked) failed.push(it.assignmentId);
    else accepted.push(iv);
  }
  return { ok: failed.length === 0, failedAssignmentIds: failed };
}
