import "server-only";
import { toFetchedEvent } from "@/lib/google-events";
import { listWeekEvents } from "@/server/calendar/google";
import { getNow } from "@/server/clock";
import { getDb } from "@/server/db";
import {
  buildProposal,
  buildReason,
  calendarDaysUntil,
  computeUrgencies,
  diffEvents,
  findConflicts,
  getWeekRange,
  localDateOf,
  sortGoals,
  type FetchedEvent,
  type Interval,
  type StoredEvent,
} from "@/server/engine";
import {
  loadEngineGoals,
  loadWeekAssignments,
  loadWeekEventRows,
  loadWindows,
  toBusyInput,
} from "./engine-input";

export interface SyncSummary {
  /** 새 일정 */
  added: number;
  /** 변경된 일정 */
  updated: number;
  /** 삭제(취소)된 일정 */
  cancelled: number;
  /** 변경된 일정과 겹친 학습 배정 수 */
  conflicts: number;
  /** 이번 동기화에서 만든 조정안 수 */
  proposalsCreated: number;
  /** 동기화 기준 시각 (ISO) */
  syncedAt: string;
}

/**
 * 구글 캘린더 동기화 (02 문서 §4 흐름 1~5).
 * 1) 이번 주 일정 조회 2) DB와 diff 3) upsert/CANCELLED 4) 추가·변경 일정의 겹침 검사
 * 5) 겹침이 있으면 조정안(PENDING) 저장. Assignment는 바꾸지 않는다.
 * 구글 호출은 트랜잭션 밖에서 하고, 실패하면 DB를 바꾸지 않는다.
 */
export async function syncCalendar(
  userId: string,
  now: Date = getNow(),
): Promise<SyncSummary> {
  const db = getDb();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const tz = user.timezone;
  const weekRange = getWeekRange(now, tz);

  const items = await listWeekEvents(userId, weekRange);
  const fetched = items
    .map((i) => toFetchedEvent(i, tz))
    .filter((e): e is FetchedEvent => e !== null);

  return db.$transaction(
    async (tx) => {
      const storedRows = await loadWeekEventRows(tx, userId, weekRange);
      const stored: StoredEvent[] = storedRows.map((r) => ({
        googleEventId: r.googleEventId,
        title: r.title,
        startAt: r.startAt,
        endAt: r.endAt,
        isAllDay: r.isAllDay,
        isBusy: r.isBusy,
        status: r.status,
        googleUpdatedAt: r.googleUpdatedAt,
      }));
      const diff = diffEvents(stored, fetched);

      // 3) upsert / CANCELLED 처리
      const upsert = (e: FetchedEvent) => {
        const data = {
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt,
          isAllDay: e.isAllDay,
          isBusy: e.isBusy,
          status: "ACTIVE" as const,
          googleUpdatedAt: e.googleUpdatedAt,
          lastSeenAt: now,
        };
        return tx.externalEvent.upsert({
          where: {
            userId_googleEventId: { userId, googleEventId: e.googleEventId },
          },
          update: data,
          create: { userId, googleEventId: e.googleEventId, ...data },
        });
      };
      const changedRows = [] as { event: FetchedEvent; id: string }[];
      for (const e of [...diff.added, ...diff.updated]) {
        const row = await upsert(e);
        changedRows.push({ event: e, id: row.id });
      }
      if (diff.unchanged.length > 0) {
        await tx.externalEvent.updateMany({
          where: {
            userId,
            googleEventId: { in: diff.unchanged.map((e) => e.googleEventId) },
          },
          data: { lastSeenAt: now },
        });
      }
      if (diff.cancelled.length > 0) {
        await tx.externalEvent.updateMany({
          where: {
            userId,
            googleEventId: { in: diff.cancelled.map((e) => e.googleEventId) },
          },
          data: { status: "CANCELLED", lastSeenAt: now },
        });
      }

      // 4) 추가·변경 일정만 겹침 검사 (삭제는 기록만, D-06/D-07)
      const assignments = await loadWeekAssignments(tx, userId, weekRange);
      const eventRows = await loadWeekEventRows(tx, userId, weekRange);
      const externalEvents = eventRows.map(toBusyInput);
      const windows = await loadWindows(tx, userId);
      const { goals, titles } = await loadEngineGoals(tx, userId);
      const today = localDateOf(now, tz);

      let conflicts = 0;
      let proposalsCreated = 0;
      const planned = assignments.filter((a) => a.status === "PLANNED");
      const goalOrder = sortGoals(
        computeUrgencies({ goals, windows, today }),
      ).map((u) => u.goalId);

      for (const { event, id: eventRowId } of changedRows) {
        const conflicted = findConflicts(event, planned, now);
        if (conflicted.length === 0) continue;
        conflicts += conflicted.length;

        // 같은 트리거의 PENDING 제안은 SUPERSEDED, 다른 PENDING 제안의 목표 시간은 예약
        await tx.proposal.updateMany({
          where: {
            userId,
            triggerExternalEventId: eventRowId,
            status: "PENDING",
          },
          data: { status: "SUPERSEDED", decidedAt: now },
        });
        const pending = await tx.proposal.findMany({
          where: { userId, status: "PENDING" },
          include: { items: true },
        });
        const reserved: Interval[] = pending
          .flatMap((p) => p.items)
          .filter((i) => i.toStartAt && i.toEndAt)
          .map((i) => ({ start: i.toStartAt!, end: i.toEndAt! }));

        const draft = buildProposal({
          conflicted,
          goalsOrder: goalOrder,
          windows,
          externalEvents,
          assignments,
          reserved,
          excluded: {},
          now,
          tz,
        });
        if (!draft) continue;

        const examDateById = new Map(goals.map((g) => [g.id, g.examDate]));
        const reason = buildReason({
          eventTitle: event.title,
          goals: draft.meta.byGoal.map((g) => ({
            title: titles.get(g.goalId) ?? "목표",
            daysLeft: calendarDaysUntil(
              today,
              examDateById.get(g.goalId) ?? today,
            ),
          })),
          totalCount: draft.meta.conflictedCount,
          unscheduledCount: draft.meta.unscheduledCount,
        });

        await tx.proposal.create({
          data: {
            userId,
            triggerExternalEventId: eventRowId,
            reason,
            items: {
              create: draft.items.map((it) => ({
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
        proposalsCreated += 1;
      }

      await tx.user.update({
        where: { id: userId },
        data: { lastSyncedAt: now },
      });

      return {
        added: diff.added.length,
        updated: diff.updated.length,
        cancelled: diff.cancelled.length,
        conflicts,
        proposalsCreated,
        syncedAt: now.toISOString(),
      };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * 이번 주 안에 동기화한 적이 없으면 1회 동기화 (05 문서 §5.2).
 * 동기화한 경우 요약을, 건너뛴 경우 null을 반환한다.
 */
export async function ensureWeekSynced(
  userId: string,
  now: Date = getNow(),
): Promise<SyncSummary | null> {
  const user = await getDb().user.findUniqueOrThrow({ where: { id: userId } });
  const weekStart = getWeekRange(now, user.timezone).start;
  if (user.lastSyncedAt && user.lastSyncedAt >= weekStart) return null;
  return syncCalendar(userId, now);
}
