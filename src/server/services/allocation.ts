import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { allocateWeek, getWeekRange, type UnmetQuota } from "@/server/engine";
import {
  loadEngineGoals,
  loadWeekAssignments,
  loadWeekEventRows,
  loadWindows,
  toBusyInput,
} from "./engine-input";
import { ensureWeekSynced } from "./sync";

type Tx = Prisma.TransactionClient;

export interface AllocationResult {
  created: number;
  unmet: UnmetQuota[];
}

/**
 * 이번 주의 미래(startAt >= now) PLANNED 배정을 지우고 PENDING 제안을 SUPERSEDED로 바꾼 뒤
 * 주간 배분을 다시 실행한다 (04 문서 §4.1, D-11). 호출하는 쪽의 트랜잭션 안에서 쓴다.
 */
export async function replaceFutureAllocation(
  tx: Tx,
  userId: string,
  now: Date,
): Promise<AllocationResult> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const tz = user.timezone;
  const weekRange = getWeekRange(now, tz);

  await tx.assignment.deleteMany({
    where: {
      task: { goal: { userId } },
      status: "PLANNED",
      startAt: { gte: now, lt: weekRange.end },
    },
  });
  await tx.proposal.updateMany({
    where: { userId, status: "PENDING" },
    data: { status: "SUPERSEDED", decidedAt: now },
  });

  const windows = await loadWindows(tx, userId);
  const eventRows = await loadWeekEventRows(tx, userId, weekRange);
  const { goals } = await loadEngineGoals(tx, userId);
  const existing = (await loadWeekAssignments(tx, userId, weekRange)).filter(
    (a) => a.status === "PLANNED" || a.status === "DONE",
  );

  const result = allocateWeek({
    goals,
    windows,
    externalEvents: eventRows.map(toBusyInput),
    existingAssignments: existing,
    now,
    tz,
  });

  if (result.assignments.length > 0) {
    await tx.assignment.createMany({
      data: result.assignments.map((a) => ({
        taskId: a.taskId,
        availabilityWindowId: a.windowId,
        windowKind: a.windowKind,
        startAt: a.startAt,
        endAt: a.endAt,
        chunkCount: a.chunkCount,
        splitIndex: a.splitIndex,
        isCarryOver: a.isCarryOver,
      })),
    });
  }

  // 목표의 긴급도·상태 갱신 (표시·기록용)
  for (const u of result.urgencies) {
    await tx.goal.update({
      where: { id: u.goalId },
      data: {
        urgency: u.urgency,
        urgencyComputedAt: now,
        status:
          u.state === "EXPIRED"
            ? "EXPIRED"
            : u.state === "ON_HOLD"
              ? "ON_HOLD"
              : "ACTIVE",
      },
    });
  }

  return { created: result.assignments.length, unmet: result.unmet };
}

/**
 * 시간대·목표를 바꾸는 변경과 재배분을 한 트랜잭션으로 실행한다.
 * 배분 직전에 외부 일정을 먼저 동기화한다(05 문서 §5.2). 동기화가 실패하면 아무것도 바꾸지 않는다.
 */
export async function mutateAndReallocate<T>(
  userId: string,
  mutate: (tx: Tx) => Promise<T>,
  now: Date = getNow(),
): Promise<T> {
  await ensureWeekSynced(userId, now);
  return getDb().$transaction(
    async (tx) => {
      const out = await mutate(tx);
      await replaceFutureAllocation(tx, userId, now);
      return out;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * 메인 진입 시: 동기화가 먼저, 배분이 나중 (05 문서 §5.2).
 * 이번 주에 PLANNED/DONE 배정이 하나도 없고 시간대·활성 목표가 있으면 배분을 실행한다.
 */
export async function ensureWeekAllocated(
  userId: string,
  now: Date = getNow(),
): Promise<void> {
  const db = getDb();
  await ensureWeekSynced(userId, now);

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const weekRange = getWeekRange(now, user.timezone);
  const [existing, windows, goals] = await Promise.all([
    db.assignment.count({
      where: {
        task: { goal: { userId } },
        status: { in: ["PLANNED", "DONE"] },
        startAt: { gte: weekRange.start, lt: weekRange.end },
      },
    }),
    db.availabilityWindow.count({ where: { userId } }),
    db.goal.count({ where: { userId, status: "ACTIVE" } }),
  ]);
  if (existing > 0 || windows === 0 || goals === 0) return;

  await db.$transaction((tx) => replaceFutureAllocation(tx, userId, now), {
    timeout: 30_000,
    maxWait: 10_000,
  });
}
