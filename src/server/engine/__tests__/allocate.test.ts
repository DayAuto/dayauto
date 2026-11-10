import { describe, expect, it } from "vitest";
import { allocateWeek, type AllocateInput } from "../allocate";
import {
  DEFAULT_WINDOWS,
  MON_9AM,
  TZ,
  assignment,
  busy,
  fmt,
  goal,
  kst,
  task,
} from "./fixtures";

const base = (over: Partial<AllocateInput>): AllocateInput => ({
  goals: [],
  windows: DEFAULT_WINDOWS,
  externalEvents: [],
  existingAssignments: [],
  now: MON_9AM,
  tz: TZ,
  ...over,
});

const EXAM = "2026-12-07"; // 월요일 → 월~금 5일 가용

describe("allocateWeek", () => {
  it("단일 목표: 일일 할당량만큼 퇴근 후 집중 슬롯에 배정하고 남는 시간은 채우지 않는다 (R4)", () => {
    const r = allocateWeek(
      base({ goals: [goal("g", EXAM, [task("t", "FOCUS", 8)])] }),
    );
    // need = ceil(8/5) = 2 → 월~목 2청크씩 4번, 금요일은 이미 소진
    expect(r.assignments.map((a) => [fmt(a.startAt), a.chunkCount])).toEqual([
      ["11-30 20:00", 2],
      ["12-01 20:00", 2],
      ["12-02 20:00", 2],
      ["12-03 20:00", 2],
    ]);
    expect(r.assignments.every((a) => a.windowKind === "AFTER_WORK")).toBe(
      true,
    );
    expect(r.unmet).toEqual([]);
  });

  it("마이크로는 항상 1청크이고 마이크로 시간대에만 배정된다", () => {
    const r = allocateWeek(
      base({ goals: [goal("g", EXAM, [task("t", "MICRO", 5)])] }),
    );
    expect(r.assignments).toHaveLength(5);
    expect(r.assignments.every((a) => a.chunkCount === 1)).toBe(true);
    expect(r.assignments.every((a) => a.windowKind !== "AFTER_WORK")).toBe(
      true,
    );
    expect(fmt(r.assignments[0].startAt)).toBe("11-30 12:30"); // 07:30은 과거
  });

  it("집중 배정은 [min, max]를 지키고 마지막 조각만 min보다 작을 수 있다", () => {
    const r = allocateWeek(
      base({ goals: [goal("g", EXAM, [task("t", "FOCUS", 3)])] }),
    );
    expect(r.assignments.map((a) => a.chunkCount)).toEqual([2, 1]);
  });

  it("날짜를 넘는 분할은 splitIndex를 기존 배정 수부터 이어 붙인다", () => {
    const r = allocateWeek(
      base({
        goals: [
          goal("g", EXAM, [
            task("t", "FOCUS", 8, { existingAssignmentCount: 2 }),
          ]),
        ],
      }),
    );
    expect(r.assignments.map((a) => a.splitIndex)).toEqual([2, 3, 4, 5]);
  });

  it("두 목표: 긴급도가 높은 목표가 같은 날 더 이른 빈 시간을 가진다", () => {
    const slow = goal("slow", "2026-12-14", [task("t", "FOCUS", 10)]); // 1/일
    const fast = goal("fast", EXAM, [task("t", "FOCUS", 10)]); // 2/일
    const r = allocateWeek(base({ goals: [slow, fast] }));
    const mon = r.assignments.filter((a) => fmt(a.startAt).startsWith("11-30"));
    expect(r.goalOrder).toEqual(["fast", "slow"]);
    expect(mon[0].goalId).toBe("fast");
    expect(fmt(mon[0].startAt)).toBe("11-30 20:00");
    expect(mon[1].goalId).toBe("slow");
    expect(mon[1].startAt.getTime()).toBe(mon[0].endAt.getTime());
  });

  it("과거 청크는 제외한다", () => {
    const r = allocateWeek(
      base({
        now: kst("2026-11-30T21:00"),
        goals: [goal("g", EXAM, [task("t", "FOCUS", 8)])],
      }),
    );
    expect(
      r.assignments.every((a) => a.startAt >= kst("2026-11-30T21:00")),
    ).toBe(true);
    expect(fmt(r.assignments[0].startAt)).toBe("11-30 21:00");
  });

  it("외부 일정과 기존 배정을 피한다", () => {
    const r = allocateWeek(
      base({
        goals: [goal("g", EXAM, [task("t", "FOCUS", 8)])],
        externalEvents: [busy("2026-11-30T20:00", "2026-11-30T20:30")],
        existingAssignments: [
          assignment("x", "g", "FOCUS", "2026-12-01T20:00", 2),
        ],
      }),
    );
    const starts = r.assignments.map((a) => fmt(a.startAt));
    expect(starts[0]).toBe("11-30 20:30");
    expect(starts).not.toContain("12-01 20:00");
  });

  it("종일·한가함·취소 일정은 빈 시간을 막지 않는다", () => {
    const r = allocateWeek(
      base({
        goals: [goal("g", EXAM, [task("t", "FOCUS", 2)])],
        externalEvents: [
          busy("2026-11-30T00:00", "2026-12-01T00:00", { isAllDay: true }),
          busy("2026-11-30T20:00", "2026-11-30T23:00", { isBusy: false }),
          busy("2026-11-30T20:00", "2026-11-30T23:00", { status: "CANCELLED" }),
        ],
      }),
    );
    expect(fmt(r.assignments[0].startAt)).toBe("11-30 20:00");
  });

  it("못 채운 날의 할당량은 다음 날로 이월되고 isCarryOver가 켜진다", () => {
    const r = allocateWeek(
      base({
        goals: [goal("g", EXAM, [task("t", "FOCUS", 8)])],
        externalEvents: [busy("2026-11-30T09:00", "2026-12-01T00:00")],
      }),
    );
    expect(
      r.assignments.map((a) => [fmt(a.startAt), a.chunkCount, a.isCarryOver]),
    ).toEqual([
      ["12-01 20:00", 4, true],
      ["12-02 20:00", 2, false],
      ["12-03 20:00", 2, false],
    ]);
  });

  it("가용 시간이 전혀 없으면 배정하지 않고 unmet으로 반환한다 (가용 초과 금지)", () => {
    const r = allocateWeek(
      base({
        goals: [goal("g", EXAM, [task("t", "FOCUS", 8)])],
        externalEvents: [busy("2026-11-30T00:00", "2026-12-05T00:00")],
      }),
    );
    expect(r.assignments).toHaveLength(0);
    expect(r.unmet).toEqual([{ goalId: "g", slotType: "FOCUS", chunks: 8 }]); // 이월량은 잔여(8)를 넘지 않는다
  });

  it("배정끼리 겹치지 않고 slotType에 맞는 시간대에만 놓인다", () => {
    const r = allocateWeek(
      base({
        goals: [
          goal("a", EXAM, [
            task("f", "FOCUS", 20),
            task("m", "MICRO", 10, { sortOrder: 2 }),
          ]),
          goal("b", "2026-12-14", [
            task("f", "FOCUS", 20),
            task("m", "MICRO", 10, { sortOrder: 2 }),
          ]),
        ],
      }),
    );
    const sorted = [...r.assignments].sort(
      (x, y) => x.startAt.getTime() - y.startAt.getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startAt.getTime()).toBeGreaterThanOrEqual(
        sorted[i - 1].endAt.getTime(),
      );
    }
    const taskSlot = new Map([
      ["f", "FOCUS"],
      ["m", "MICRO"],
    ]);
    for (const a of r.assignments) {
      expect(a.windowKind === "AFTER_WORK").toBe(
        taskSlot.get(a.taskId) === "FOCUS",
      );
    }
  });

  it("같은 입력이면 같은 결과 (결정론)", () => {
    const input = base({
      goals: [
        goal("a", EXAM, [
          task("f", "FOCUS", 12),
          task("m", "MICRO", 7, { sortOrder: 2 }),
        ]),
        goal("b", "2026-12-14", [task("f", "FOCUS", 9)]),
      ],
    });
    expect(allocateWeek(input)).toEqual(allocateWeek(input));
  });

  it("ACTIVE가 아닌 목표(시험일 지남)는 배분에서 제외된다", () => {
    const r = allocateWeek(
      base({ goals: [goal("old", "2026-11-29", [task("t", "FOCUS", 8)])] }),
    );
    expect(r.assignments).toHaveLength(0);
    expect(r.goalOrder).toEqual([]);
  });
});
