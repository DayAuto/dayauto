import { describe, expect, it } from "vitest";
import { diffEvents, findConflicts } from "../changes";
import type { FetchedEvent, StoredEvent } from "../types";
import { assignment, kst } from "./fixtures";

const fetched = (
  id: string,
  over: Partial<FetchedEvent> = {},
): FetchedEvent => ({
  googleEventId: id,
  title: "회의",
  startAt: kst("2026-12-01T10:00"),
  endAt: kst("2026-12-01T11:00"),
  isAllDay: false,
  isBusy: true,
  googleUpdatedAt: new Date("2026-11-30T00:00:00Z"),
  cancelled: false,
  ...over,
});

const stored = (id: string, over: Partial<StoredEvent> = {}): StoredEvent => {
  const { cancelled: _c, ...f } = fetched(id);
  void _c;
  return { ...f, status: "ACTIVE", ...over };
};

describe("diffEvents", () => {
  it("없던 일정은 added, 취소 상태로 저장된 일정이 다시 살아나도 added", () => {
    const d = diffEvents(
      [stored("b", { status: "CANCELLED" })],
      [fetched("a"), fetched("b")],
    );
    expect(d.added.map((e) => e.googleEventId)).toEqual(["a", "b"]);
  });

  it("updated는 수정 시각·시간·제목·종일·바쁨 중 하나라도 다를 때", () => {
    const cases: Partial<FetchedEvent>[] = [
      { googleUpdatedAt: new Date("2026-11-30T01:00:00Z") },
      { startAt: kst("2026-12-01T10:30") },
      { endAt: kst("2026-12-01T11:30") },
      { title: "다른 제목" },
      { isAllDay: true },
      { isBusy: false },
    ];
    for (const c of cases) {
      const d = diffEvents([stored("a")], [fetched("a", c)]);
      expect(d.updated).toHaveLength(1);
    }
  });

  it("같으면 unchanged", () => {
    const d = diffEvents([stored("a")], [fetched("a")]);
    expect(d.unchanged).toHaveLength(1);
    expect(d.added.length + d.updated.length + d.cancelled.length).toBe(0);
  });

  it("취소 표시된 일정, 조회에서 사라진 일정은 cancelled", () => {
    const d = diffEvents(
      [stored("a"), stored("gone")],
      [fetched("a", { cancelled: true })],
    );
    expect(d.cancelled.map((e) => e.googleEventId).sort()).toEqual([
      "a",
      "gone",
    ]);
  });

  it("이미 취소된 일정이 또 취소로 오면 무시(unchanged)", () => {
    const d = diffEvents(
      [stored("a", { status: "CANCELLED" })],
      [fetched("a", { cancelled: true })],
    );
    expect(d.cancelled).toHaveLength(0);
    expect(d.unchanged).toHaveLength(1);
  });
});

describe("findConflicts", () => {
  const now = kst("2026-11-30T09:00");
  const a1 = assignment("a1", "g", "FOCUS", "2026-11-30T20:00", 2);
  const ev = (over = {}) => ({
    startAt: kst("2026-11-30T19:00"),
    endAt: kst("2026-11-30T23:00"),
    isAllDay: false,
    isBusy: true,
    ...over,
  });

  it("겹치는 앞으로의 PLANNED 배정만 반환", () => {
    const done = assignment("d", "g", "FOCUS", "2026-11-30T21:00", 2, {
      status: "DONE",
    });
    const past = assignment("p", "g", "FOCUS", "2026-11-30T08:00", 2);
    expect(findConflicts(ev(), [a1, done, past], now).map((a) => a.id)).toEqual(
      ["a1"],
    );
  });

  it("종일·한가함·취소 일정은 충돌이 아니다", () => {
    expect(findConflicts(ev({ isAllDay: true }), [a1], now)).toEqual([]);
    expect(findConflicts(ev({ isBusy: false }), [a1], now)).toEqual([]);
    expect(findConflicts(ev({ cancelled: true }), [a1], now)).toEqual([]);
  });

  it("경계(끝=시작)는 겹치지 않는다", () => {
    expect(
      findConflicts(
        ev({
          startAt: kst("2026-11-30T20:30"),
          endAt: kst("2026-11-30T21:00"),
        }),
        [a1],
        now,
      ),
    ).toEqual([]);
    expect(
      findConflicts(
        ev({
          startAt: kst("2026-11-30T19:00"),
          endAt: kst("2026-11-30T20:00"),
        }),
        [a1],
        now,
      ),
    ).toEqual([]);
  });

  it("변경 없는 기존 겹침은 무시: diff의 added/updated에 없으면 검사 대상이 아니다", () => {
    // [원래 일정대로] 이후 재동기화: 일정은 unchanged → 서비스는 added+updated만 findConflicts에 넘긴다
    const d = diffEvents([stored("dinner")], [fetched("dinner")]);
    const targets = [...d.added, ...d.updated];
    expect(targets.flatMap((e) => findConflicts(e, [a1], now))).toEqual([]);
  });
});
