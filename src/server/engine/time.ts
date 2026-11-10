import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Chunk, Interval, TimeWindow } from "./types";
import { CHUNK_MINUTES, CHUNK_MS, compareStr, overlaps } from "./util";

const pad = (n: number) => String(n).padStart(2, "0");

/** yyyy-MM-dd 문자열에 일수를 더한다 (달력 연산, 타임존 무관) */
export function addDaysToDate(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0=일 ~ 6=토 */
export function weekdayOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** from → to 달력 일수 (to − from) */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function localDateOf(instant: Date, tz: string): string {
  return formatInTimeZone(instant, tz, "yyyy-MM-dd");
}

/** 로컬 날짜 + 자정부터의 분 → UTC 시각. minute이 1440이면 다음 날 00:00 */
export function localToUtc(dateStr: string, minute: number, tz: string): Date {
  const dayOffset = Math.floor(minute / 1440);
  const m = minute - dayOffset * 1440;
  const date = addDaysToDate(dateStr, dayOffset);
  return fromZonedTime(
    `${date}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`,
    tz,
  );
}

/** now가 속한 주의 월요일 00:00(로컬) ~ 다음 월요일 00:00(로컬) */
export function getWeekRange(now: Date, tz: string): Interval {
  const today = localDateOf(now, tz);
  const isoDow = Number(formatInTimeZone(now, tz, "i")); // 1=월 ~ 7=일
  const monday = addDaysToDate(today, -(isoDow - 1));
  return {
    start: localToUtc(monday, 0, tz),
    end: localToUtc(addDaysToDate(monday, 7), 0, tz),
  };
}

/** 주 범위의 로컬 날짜 7개 (월~일) */
export function weekDates(weekRange: Interval, tz: string): string[] {
  const first = localDateOf(weekRange.start, tz);
  return Array.from({ length: 7 }, (_, i) => addDaysToDate(first, i));
}

export function instanceKey(c: Chunk): string {
  return `${c.localDate}|${c.windowId}`;
}

export function buildChunkGrid(input: {
  windows: TimeWindow[];
  weekRange: Interval;
  tz: string;
}): Chunk[] {
  const { windows, weekRange, tz } = input;
  const chunks: Chunk[] = [];
  for (const date of weekDates(weekRange, tz)) {
    const dow = weekdayOfDate(date);
    for (const w of windows) {
      if (!w.weekdays.includes(dow)) continue;
      for (
        let minute = w.startMinute;
        minute + CHUNK_MINUTES <= w.endMinute;
        minute += CHUNK_MINUTES
      ) {
        const startAt = localToUtc(date, minute, tz);
        chunks.push({
          windowId: w.id,
          windowKind: w.kind,
          slotType: w.slotType,
          localDate: date,
          minute,
          startAt,
          endAt: new Date(startAt.getTime() + CHUNK_MS),
        });
      }
    }
  }
  return chunks.sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      compareStr(a.windowId, b.windowId),
  );
}

export function freeChunks(
  grid: Chunk[],
  opts: { now: Date; busyIntervals: Interval[]; occupiedIntervals: Interval[] },
): Chunk[] {
  const { now, busyIntervals, occupiedIntervals } = opts;
  return grid.filter((c) => {
    if (c.startAt < now) return false;
    const iv = { start: c.startAt, end: c.endAt };
    return (
      !busyIntervals.some((b) => overlaps(iv, b)) &&
      !occupiedIntervals.some((o) => overlaps(iv, o))
    );
  });
}

/**
 * startAt 오름차순으로 정렬된 빈 청크에서, 같은 시간대 인스턴스 안의 연속 size개 묶음을 모두 찾는다.
 * 결과는 시작 시각 오름차순.
 */
export function contiguousRuns(free: Chunk[], size: number): Chunk[][] {
  const runs: Chunk[][] = [];
  for (let i = 0; i + size <= free.length; i++) {
    let ok = true;
    for (let k = 1; k < size; k++) {
      const prev = free[i + k - 1];
      const cur = free[i + k];
      if (
        instanceKey(prev) !== instanceKey(cur) ||
        cur.minute !== prev.minute + CHUNK_MINUTES
      ) {
        ok = false;
        break;
      }
    }
    if (ok) runs.push(free.slice(i, i + size));
  }
  return runs;
}

/** 오늘부터 시험일까지의 달력 일수 (표시용, 사유 문장) */
export function calendarDaysUntil(today: string, examDate: string): number {
  return daysBetween(today, examDate);
}
