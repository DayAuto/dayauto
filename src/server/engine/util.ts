import type { BusyEventInput, AssignmentInput, Interval } from "./types";

export const CHUNK_MINUTES = 15;
export const CHUNK_MS = CHUNK_MINUTES * 60_000;

/** 정수 올림 나눗셈 (REQ-DT-01) */
export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

export function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 반열린 구간 겹침: 끝과 시작이 같으면 겹치지 않는다 */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** 충돌에 쓰이는 바쁜 외부 일정 구간 (ACTIVE && 종일 아님 && 바쁨) */
export function busyIntervals(events: BusyEventInput[]): Interval[] {
  return events
    .filter((e) => e.status === "ACTIVE" && !e.isAllDay && e.isBusy)
    .map((e) => ({ start: e.startAt, end: e.endAt }));
}

/** 이미 점유된 배정 구간 (PLANNED/DONE) */
export function occupiedIntervals(assignments: AssignmentInput[]): Interval[] {
  return assignments
    .filter((a) => a.status === "PLANNED" || a.status === "DONE")
    .map((a) => ({ start: a.startAt, end: a.endAt }));
}
