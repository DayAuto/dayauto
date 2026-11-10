import { describe, expect, it } from "vitest";
import { computeUrgencies, sortGoals } from "../urgency";
import { DEFAULT_WINDOWS, goal, task } from "./fixtures";

const TODAY = "2026-11-30"; // 월요일
const run = (goals: ReturnType<typeof goal>[], today = TODAY) =>
  computeUrgencies({ goals, windows: DEFAULT_WINDOWS, today });
const order = (goals: ReturnType<typeof goal>[]) =>
  sortGoals(run(goals)).map((u) => u.goalId);

describe("가용일 계산", () => {
  it("주말은 시간대가 없어 분모에서 제외한다", () => {
    const [u] = run([goal("g", "2026-12-14", [task("t", "FOCUS", 10)])]);
    expect(u.days).toBe(10); // 11/30~12/13 중 평일
    expect(u.daysBySlot).toEqual({ FOCUS: 10, MICRO: 10 });
    expect(u.urgency).toBe(1);
  });

  it("slotType별 일일 할당량은 올림 나눗셈", () => {
    const [u] = run([
      goal("g", "2026-12-07", [task("a", "FOCUS", 8), task("b", "MICRO", 6)]),
    ]);
    expect(u.need).toEqual({ FOCUS: 2, MICRO: 2 }); // ceil(8/5), ceil(6/5)
  });
});

describe("상태 분기", () => {
  it("시험일 지남 → EXPIRED", () => {
    expect(
      run([goal("g", "2026-11-29", [task("t", "FOCUS", 4)])])[0].state,
    ).toBe("EXPIRED");
  });
  it("태스크 없음/잔여 0 → ON_HOLD", () => {
    expect(run([goal("g", "2026-12-14", [])])[0].state).toBe("ON_HOLD");
    expect(
      run([goal("g", "2026-12-14", [task("t", "FOCUS", 0)])])[0].state,
    ).toBe("ON_HOLD");
  });
  it("시험 당일 / 가용 시간대 없음 → NO_DAYS, 긴급도 null", () => {
    const u1 = run([goal("g", TODAY, [task("t", "FOCUS", 4)])])[0];
    expect(u1.state).toBe("NO_DAYS");
    expect(u1.urgency).toBeNull();
    // 토요일부터 월요일 시험: 토·일에는 시간대가 없다
    const u2 = run(
      [goal("g", "2026-12-07", [task("t", "FOCUS", 4)])],
      "2026-12-05",
    )[0];
    expect(u2.state).toBe("NO_DAYS");
  });
  it("ACTIVE가 아닌 목표는 정렬 결과에서 빠진다", () => {
    const goals = [
      goal("expired", "2026-11-29", [task("t", "FOCUS", 4)]),
      goal("ok", "2026-12-14", [task("t", "FOCUS", 4)]),
    ];
    expect(order(goals)).toEqual(["ok"]);
  });
});

describe("정렬 (D-02)", () => {
  it("우선순위가 요구 속도보다 먼저", () => {
    const fast = goal("fast", "2026-12-07", [task("t", "FOCUS", 50)]);
    const high = goal("high", "2027-01-01", [task("t", "FOCUS", 1)], {
      priority: 50,
    });
    expect(order([fast, high])).toEqual(["high", "fast"]);
  });

  it("요구 속도는 교차 곱으로 비교 (마감이 멀어도 속도가 크면 먼저)", () => {
    const a = goal("a", "2026-12-07", [task("t", "FOCUS", 10)]); // 10/5 = 2
    const b = goal("b", "2026-12-14", [task("t", "FOCUS", 30)]); // 30/10 = 3
    expect(order([a, b])).toEqual(["b", "a"]);
  });

  it("요구 속도가 같으면 시험일 → 생성일 → id", () => {
    const a = goal("a", "2026-12-07", [task("t", "FOCUS", 10)]); // 2
    const b = goal("b", "2026-12-14", [task("t", "FOCUS", 20)]); // 2
    expect(order([b, a])).toEqual(["a", "b"]);

    const c = goal("c", "2026-12-07", [task("t", "FOCUS", 10)], {
      createdAt: new Date("2026-11-02T00:00:00Z"),
    });
    expect(order([c, a])).toEqual(["a", "c"]);

    const d = goal("d", "2026-12-07", [task("t", "FOCUS", 10)]);
    expect(order([d, a])).toEqual(["a", "d"]);
  });
});
