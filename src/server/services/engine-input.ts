import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type {
  AssignmentInput,
  BusyEventInput,
  EngineGoal,
  Interval,
  TimeWindow,
} from "@/server/engine";

/** PrismaClient 또는 트랜잭션 클라이언트 */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Prisma 모델 → 엔진 입력 변환 (서비스 계층 책임, 05 문서 §6) */

export async function loadWindows(
  db: Db,
  userId: string,
): Promise<TimeWindow[]> {
  const rows = await db.availabilityWindow.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
  return rows.map((w) => ({
    id: w.id,
    kind: w.kind,
    startMinute: w.startMinute,
    endMinute: w.endMinute,
    slotType: w.slotType,
    weekdays: w.weekdays,
  }));
}

/** 이번 주 범위와 겹치는 외부 일정 (모든 상태) */
export async function loadWeekEventRows(
  db: Db,
  userId: string,
  range: Interval,
) {
  return db.externalEvent.findMany({
    where: { userId, startAt: { lt: range.end }, endAt: { gt: range.start } },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });
}

export function toBusyInput(e: {
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  isBusy: boolean;
  status: "ACTIVE" | "CANCELLED";
}): BusyEventInput {
  return {
    startAt: e.startAt,
    endAt: e.endAt,
    isAllDay: e.isAllDay,
    isBusy: e.isBusy,
    status: e.status,
  };
}

/** 이번 주 범위 안의 배정 (모든 상태) */
export async function loadWeekAssignments(
  db: Db,
  userId: string,
  range: Interval,
): Promise<AssignmentInput[]> {
  const rows = await db.assignment.findMany({
    where: {
      task: { goal: { userId } },
      startAt: { gte: range.start },
      endAt: { lte: range.end },
    },
    include: { task: { select: { goalId: true, slotType: true } } },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
  });
  return rows.map((a) => ({
    id: a.id,
    taskId: a.taskId,
    goalId: a.task.goalId,
    slotType: a.task.slotType,
    windowId: a.availabilityWindowId,
    windowKind: a.windowKind,
    startAt: a.startAt,
    endAt: a.endAt,
    chunkCount: a.chunkCount,
    status: a.status,
  }));
}

export interface LoadedGoals {
  goals: EngineGoal[];
  titles: Map<string, string>;
}

/**
 * 목표와 태스크 잔여량 (03 문서 §6: 잔여 = estimatedChunks − PLANNED/DONE 배정 청크 합).
 * UNSCHEDULED·MISSED는 잔여로 돌아간다.
 */
export async function loadEngineGoals(
  db: Db,
  userId: string,
): Promise<LoadedGoals> {
  const rows = await db.goal.findMany({
    where: { userId },
    include: {
      tasks: {
        orderBy: { sortOrder: "asc" },
        include: {
          assignments: { select: { chunkCount: true, status: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const titles = new Map<string, string>();
  const goals = rows.map<EngineGoal>((g) => {
    titles.set(g.id, g.title);
    return {
      id: g.id,
      priority: g.priority,
      examDate: g.examDate.toISOString().slice(0, 10),
      createdAt: g.createdAt,
      tasks: g.tasks.map((t) => {
        const used = t.assignments
          .filter((a) => a.status === "PLANNED" || a.status === "DONE")
          .reduce((sum, a) => sum + a.chunkCount, 0);
        return {
          id: t.id,
          sortOrder: t.sortOrder,
          slotType: t.slotType,
          minChunks: t.minChunks,
          maxChunks: t.maxChunks,
          remaining: Math.max(t.estimatedChunks - used, 0),
          existingAssignmentCount: t.assignments.length,
        };
      }),
    };
  });
  return { goals, titles };
}
