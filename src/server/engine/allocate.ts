import {
  buildChunkGrid,
  contiguousRuns,
  freeChunks,
  getWeekRange,
  localDateOf,
  weekDates,
} from "./time";
import { computeUrgencies, sortGoals, type GoalUrgency } from "./urgency";
import {
  SLOT_TYPES,
  type AssignmentInput,
  type BusyEventInput,
  type Chunk,
  type EngineGoal,
  type EngineTask,
  type NewAssignment,
  type SlotType,
  type TimeWindow,
} from "./types";
import { busyIntervals, occupiedIntervals } from "./util";

export interface AllocateInput {
  goals: EngineGoal[];
  windows: TimeWindow[];
  externalEvents: BusyEventInput[];
  existingAssignments: AssignmentInput[];
  now: Date;
  tz: string;
}

export interface UnmetQuota {
  goalId: string;
  slotType: SlotType;
  chunks: number;
}

export interface AllocateResult {
  assignments: NewAssignment[];
  /** 이번 주 안에 할당량을 못 채운 양 */
  unmet: UnmetQuota[];
  /** 모든 목표의 긴급도 (Goal.urgency 저장·표시용) */
  urgencies: GoalUrgency[];
  /** 배분 순서대로 정렬된 목표 id (ACTIVE만) */
  goalOrder: string[];
}

interface WorkTask extends EngineTask {
  created: number;
}

/** 주간 배분 (04 문서 §4.2). 순수 함수. */
export function allocateWeek(input: AllocateInput): AllocateResult {
  const { goals, windows, externalEvents, existingAssignments, now, tz } =
    input;

  const weekRange = getWeekRange(now, tz);
  const today = localDateOf(now, tz);
  const grid = buildChunkGrid({ windows, weekRange, tz });
  let free = freeChunks(grid, {
    now,
    busyIntervals: busyIntervals(externalEvents),
    occupiedIntervals: occupiedIntervals(existingAssignments),
  });

  const urgencies = computeUrgencies({ goals, windows, today });
  const ordered = sortGoals(urgencies);
  const goalById = new Map(goals.map((g) => [g.id, g]));

  const queue = new Map<string, WorkTask[]>();
  const carry = new Map<string, number>();
  const key = (goalId: string, s: SlotType) => `${goalId}|${s}`;
  for (const u of ordered) {
    const g = goalById.get(u.goalId)!;
    for (const s of SLOT_TYPES) {
      const tasks = g.tasks
        .filter((t) => t.slotType === s && t.remaining > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1))
        .map((t) => ({ ...t, created: 0 }));
      queue.set(key(g.id, s), tasks);
      carry.set(key(g.id, s), 0);
    }
  }

  const assignments: NewAssignment[] = [];

  for (const date of weekDates(weekRange, tz).filter((d) => d >= today)) {
    for (const u of ordered) {
      for (const s of SLOT_TYPES) {
        const k = key(u.goalId, s);
        const tasks = queue.get(k)!;
        const remainingSum = () =>
          tasks.reduce((sum, t) => sum + t.remaining, 0);

        let q = Math.min(u.need[s] + carry.get(k)!, remainingSum());
        let fromCarry = carry.get(k)!;

        while (q > 0 && tasks.length > 0) {
          const t = tasks[0];
          const lb = s === "MICRO" ? 1 : Math.min(t.remaining, t.minChunks);
          const size =
            s === "MICRO"
              ? 1
              : Math.min(t.remaining, t.maxChunks, Math.max(q, t.minChunks));

          const dayFree = free.filter(
            (c) => c.localDate === date && c.slotType === s,
          );
          let run: Chunk[] | undefined;
          let placed = 0;
          for (let sz = size; sz >= lb; sz--) {
            run = contiguousRuns(dayFree, sz)[0];
            if (run) {
              placed = sz;
              break;
            }
          }
          if (!run) break;

          assignments.push({
            taskId: t.id,
            goalId: u.goalId,
            windowId: run[0].windowId,
            windowKind: run[0].windowKind,
            startAt: run[0].startAt,
            endAt: run[run.length - 1].endAt,
            chunkCount: placed,
            splitIndex: t.existingAssignmentCount + t.created,
            isCarryOver: fromCarry > 0,
          });
          const taken = new Set(run);
          free = free.filter((c) => !taken.has(c));
          t.created += 1;
          t.remaining -= placed;
          q -= placed;
          fromCarry -= placed;
          if (t.remaining === 0) tasks.shift();
        }

        carry.set(k, remainingSum() > 0 ? Math.max(q, 0) : 0);
      }
    }
  }

  const unmet: UnmetQuota[] = [];
  for (const u of ordered) {
    for (const s of SLOT_TYPES) {
      const chunks = carry.get(key(u.goalId, s))!;
      if (chunks > 0) unmet.push({ goalId: u.goalId, slotType: s, chunks });
    }
  }

  return {
    assignments,
    unmet,
    urgencies,
    goalOrder: ordered.map((u) => u.goalId),
  };
}
