import { describe, expect, it } from "vitest";
import {
  buildChunkGrid,
  contiguousRuns,
  freeChunks,
  getWeekRange,
  localToUtc,
  weekDates,
} from "../time";
import type { TimeWindow } from "../types";
import { DEFAULT_WINDOWS, TZ, kst } from "./fixtures";

describe("getWeekRange", () => {
  it("서울 기준 주 경계는 월요일 00:00 ~ 다음 월요일 00:00", () => {
    const r = getWeekRange(kst("2026-12-02T10:00"), TZ);
    expect(r.start.toISOString()).toBe("2026-11-29T15:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-12-06T15:00:00.000Z");
  });

  it("일요일 밤과 월요일 0시는 서로 다른 주", () => {
    const sun = getWeekRange(kst("2026-12-06T23:59"), TZ);
    const mon = getWeekRange(kst("2026-12-07T00:00"), TZ);
    expect(sun.start.toISOString()).toBe("2026-11-29T15:00:00.000Z");
    expect(mon.start.toISOString()).toBe("2026-12-06T15:00:00.000Z");
    expect(sun.end.getTime()).toBe(mon.start.getTime());
  });

  it("UTC 날짜와 로컬 날짜가 달라도 로컬 기준으로 계산한다", () => {
    // UTC로는 일요일 20:00이지만 서울은 월요일 05:00
    const r = getWeekRange(new Date("2026-11-29T20:00:00Z"), TZ);
    expect(r.start.toISOString()).toBe("2026-11-29T15:00:00.000Z");
  });
});

describe("buildChunkGrid", () => {
  it("기본 시간대(월~금)는 하루 20청크, 주 100청크이고 UTC로 정확히 변환된다", () => {
    const weekRange = getWeekRange(kst("2026-11-30T09:00"), TZ);
    const grid = buildChunkGrid({
      windows: DEFAULT_WINDOWS,
      weekRange,
      tz: TZ,
    });
    expect(grid).toHaveLength(100);
    expect(grid[0].localDate).toBe("2026-11-30");
    expect(grid[0].startAt.toISOString()).toBe("2026-11-29T22:30:00.000Z"); // 07:30 KST
    expect(grid[0].endAt.getTime() - grid[0].startAt.getTime()).toBe(
      15 * 60_000,
    );
    // 주말 청크 없음
    expect(
      grid.every((c) => !["2026-12-05", "2026-12-06"].includes(c.localDate)),
    ).toBe(true);
  });

  it("America/New_York 서머타임 종료 주에도 모든 청크 경계가 15분 단위", () => {
    const windows: TimeWindow[] = [
      {
        id: "w",
        kind: "AFTER_WORK",
        startMinute: 480,
        endMinute: 600,
        slotType: "FOCUS",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      },
    ];
    const tz = "America/New_York";
    const now = new Date("2026-10-28T12:00:00Z");
    const weekRange = getWeekRange(now, tz);
    expect(weekRange.start.toISOString()).toBe("2026-10-26T04:00:00.000Z"); // EDT
    expect(weekRange.end.toISOString()).toBe("2026-11-02T05:00:00.000Z"); // EST
    const grid = buildChunkGrid({ windows, weekRange, tz });
    expect(grid).toHaveLength(7 * 8);
    for (const c of grid) {
      expect(c.startAt.getTime() % (15 * 60_000)).toBe(0);
      expect(c.endAt.getTime() - c.startAt.getTime()).toBe(15 * 60_000);
    }
    // 전환일 전후로 08:00 로컬의 UTC가 1시간 달라진다
    const sat = grid.find(
      (c) => c.localDate === "2026-10-31" && c.minute === 480,
    )!;
    const sun = grid.find(
      (c) => c.localDate === "2026-11-01" && c.minute === 480,
    )!;
    expect(sat.startAt.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(sun.startAt.toISOString()).toBe("2026-11-01T13:00:00.000Z");
  });

  it("minute 1440은 다음 날 00:00", () => {
    expect(localToUtc("2026-11-30", 1440, TZ).toISOString()).toBe(
      "2026-11-30T15:00:00.000Z",
    );
  });

  it("weekDates는 월~일 7개", () => {
    const wr = getWeekRange(kst("2026-11-30T09:00"), TZ);
    expect(weekDates(wr, TZ)).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]);
  });
});

describe("freeChunks / contiguousRuns", () => {
  const weekRange = getWeekRange(kst("2026-11-30T09:00"), TZ);
  const grid = buildChunkGrid({ windows: DEFAULT_WINDOWS, weekRange, tz: TZ });

  it("과거·바쁜 일정·점유 구간을 제외한다 (끝=시작은 겹치지 않음)", () => {
    const free = freeChunks(grid, {
      now: kst("2026-11-30T13:00"),
      busyIntervals: [
        { start: kst("2026-11-30T18:30"), end: kst("2026-11-30T19:00") },
      ],
      occupiedIntervals: [
        { start: kst("2026-11-30T20:00"), end: kst("2026-11-30T20:15") },
      ],
    });
    const mon = free.filter((c) => c.localDate === "2026-11-30");
    expect(mon[0].minute).toBe(19 * 60); // 점심은 과거라 빠지고 18:30–19:00은 바쁨
    expect(mon.find((c) => c.minute === 1200)).toBeUndefined();
    expect(mon.find((c) => c.minute === 1215)).toBeDefined(); // 점유 끝=다음 청크 시작
  });

  it("연속 묶음은 같은 시간대 인스턴스 안에서만 만든다", () => {
    const free = freeChunks(grid, {
      now: kst("2026-11-30T09:00"),
      busyIntervals: [],
      occupiedIntervals: [],
    });
    const day = free.filter(
      (c) => c.localDate === "2026-11-30" && c.slotType === "MICRO",
    );
    // 점심 2청크 + 퇴근 3청크 + (출근은 과거). 4개 연속은 불가
    expect(contiguousRuns(day, 4)).toHaveLength(0);
    expect(contiguousRuns(day, 3)).toHaveLength(1);
    expect(contiguousRuns(day, 2)).toHaveLength(1 + 2);
  });
});
