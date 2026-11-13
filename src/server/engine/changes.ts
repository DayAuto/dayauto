import type { AssignmentInput, FetchedEvent, StoredEvent } from "./types";
import { compareStr, overlaps } from "./util";

export interface EventDiff {
  added: FetchedEvent[];
  updated: FetchedEvent[];
  /** stored 기준 (취소로 바뀌는 일정) */
  cancelled: StoredEvent[];
  unchanged: FetchedEvent[];
}

function differs(s: StoredEvent, f: FetchedEvent): boolean {
  return (
    s.googleUpdatedAt.getTime() !== f.googleUpdatedAt.getTime() ||
    s.startAt.getTime() !== f.startAt.getTime() ||
    s.endAt.getTime() !== f.endAt.getTime() ||
    s.title !== f.title ||
    s.isAllDay !== f.isAllDay ||
    s.isBusy !== f.isBusy
  );
}

/** 외부 일정 변경 식별 (04 문서 §5.2). stored는 이번 주 범위 DB 일정(모든 상태), fetched는 조회 결과(취소 포함). */
export function diffEvents(
  stored: StoredEvent[],
  fetched: FetchedEvent[],
): EventDiff {
  const storedById = new Map(stored.map((s) => [s.googleEventId, s]));
  const fetchedIds = new Set(fetched.map((f) => f.googleEventId));
  const diff: EventDiff = {
    added: [],
    updated: [],
    cancelled: [],
    unchanged: [],
  };

  for (const f of fetched) {
    const s = storedById.get(f.googleEventId);
    if (f.cancelled) {
      if (s && s.status === "ACTIVE") diff.cancelled.push(s);
      else diff.unchanged.push(f);
    } else if (!s || s.status === "CANCELLED") {
      diff.added.push(f);
    } else if (differs(s, f)) {
      diff.updated.push(f);
    } else {
      diff.unchanged.push(f);
    }
  }
  // 조회에 아예 없는 ACTIVE 일정 = 삭제되었거나 다른 주로 이동
  for (const s of stored) {
    if (s.status === "ACTIVE" && !fetchedIds.has(s.googleEventId))
      diff.cancelled.push(s);
  }
  return diff;
}

/**
 * 변경된(추가·변경) 일정과 겹치는 앞으로의 PLANNED 배정 (04 문서 §5.3).
 * 종일·한가함·취소 일정은 충돌이 아니다.
 */
export function findConflicts(
  event: {
    startAt: Date;
    endAt: Date;
    isAllDay: boolean;
    isBusy: boolean;
    cancelled?: boolean;
  },
  assignments: AssignmentInput[],
  now: Date,
): AssignmentInput[] {
  if (event.cancelled || event.isAllDay || !event.isBusy) return [];
  const iv = { start: event.startAt, end: event.endAt };
  return assignments
    .filter(
      (a) =>
        a.status === "PLANNED" &&
        a.startAt >= now &&
        overlaps({ start: a.startAt, end: a.endAt }, iv),
    )
    .sort(
      (a, b) =>
        a.startAt.getTime() - b.startAt.getTime() || compareStr(a.id, b.id),
    );
}
