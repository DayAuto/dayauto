import { describe, expect, it } from "vitest";
import {
  buildProposal,
  hasNoAlternative,
  validateProposal,
  type BuildProposalInput,
} from "../reallocate";
import {
  DEFAULT_WINDOWS,
  MON_9AM,
  TZ,
  assignment,
  busy,
  fmt,
  kst,
} from "./fixtures";

const input = (over: Partial<BuildProposalInput>): BuildProposalInput => ({
  conflicted: [],
  goalsOrder: ["g1", "g2"],
  windows: DEFAULT_WINDOWS,
  externalEvents: [],
  assignments: [],
  reserved: [],
  excluded: {},
  now: MON_9AM,
  tz: TZ,
  ...over,
});

describe("buildProposal", () => {
  it("충돌이 없으면 null", () => {
    expect(buildProposal(input({}))).toBeNull();
  });

  it("미루기 우선: 더 이른 빈 곳이 있어도 원래 시작 이후를 먼저 고른다", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:30", 2);
    const p = buildProposal(
      input({
        conflicted: [a],
        assignments: [a],
        externalEvents: [busy("2026-11-30T20:45", "2026-11-30T23:00")],
      }),
    )!;
    expect(fmt(p.items[0].toStartAt!)).toBe("12-01 20:00");
  });

  it("이후에 빈 곳이 없으면 원래 시작 이전(now 이후)에서 가장 이른 곳", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:30", 2);
    const p = buildProposal(
      input({
        conflicted: [a],
        assignments: [a],
        externalEvents: [busy("2026-11-30T20:45", "2026-12-06T23:00")],
      }),
    )!;
    expect(fmt(p.items[0].toStartAt!)).toBe("11-30 20:00");
  });

  it("긴급도 순(goalsOrder)으로 먼저 처리해 더 이른 칸을 준다", () => {
    const a1 = assignment("a1", "g1", "FOCUS", "2026-11-30T20:00", 2);
    const a2 = assignment("a2", "g2", "FOCUS", "2026-11-30T20:00", 2, {
      startAt: kst("2026-11-30T20:00"),
    });
    const p = buildProposal(
      input({
        conflicted: [a2, a1],
        assignments: [a1, a2],
        goalsOrder: ["g1", "g2"],
        externalEvents: [busy("2026-11-30T19:30", "2026-11-30T23:00")],
      }),
    )!;
    const to = Object.fromEntries(
      p.items.map((i) => [i.assignmentId, fmt(i.toStartAt!)]),
    );
    expect(to).toEqual({ a1: "12-01 20:00", a2: "12-01 20:30" });
    expect(p.meta.byGoal.map((g) => g.goalId)).toEqual(["g1", "g2"]);
  });

  it("reserved(다른 제안의 목표 시간)를 존중한다", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
    const p = buildProposal(
      input({
        conflicted: [a],
        assignments: [a],
        externalEvents: [busy("2026-11-30T19:00", "2026-11-30T23:00")],
        reserved: [
          { start: kst("2026-12-01T20:00"), end: kst("2026-12-01T20:30") },
        ],
      }),
    )!;
    expect(fmt(p.items[0].toStartAt!)).toBe("12-01 20:30");
  });

  it("excluded(이전 제안 목표 구간)와 겹치는 후보는 탈락 → 다른 안", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
    const common = {
      conflicted: [a],
      assignments: [a],
      externalEvents: [busy("2026-11-30T19:00", "2026-11-30T23:00")],
    };
    const first = buildProposal(input(common))!;
    const second = buildProposal(
      input({
        ...common,
        excluded: {
          a: [
            { start: first.items[0].toStartAt!, end: first.items[0].toEndAt! },
          ],
        },
      }),
    )!;
    expect(fmt(first.items[0].toStartAt!)).toBe("12-01 20:00");
    expect(fmt(second.items[0].toStartAt!)).toBe("12-01 20:30"); // 20:15–20:45는 제외 구간과 겹친다
  });

  it("빈 곳이 없으면 to=null(배정 해제)이고 모두 null이면 대안 없음", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
    const p = buildProposal(
      input({
        conflicted: [a],
        assignments: [a],
        externalEvents: [busy("2026-11-30T19:00", "2026-12-07T00:00")],
      }),
    )!;
    expect(p.items[0]).toMatchObject({
      toStartAt: null,
      toEndAt: null,
      toWindowId: null,
      toWindowKind: null,
    });
    expect(p.meta.unscheduledCount).toBe(1);
    expect(hasNoAlternative(p)).toBe(true);
    expect(hasNoAlternative(null)).toBe(true);
  });

  it("slotType을 바꾸지 않는다(집중은 집중 시간대, 마이크로는 마이크로)", () => {
    const m = assignment("m", "g1", "MICRO", "2026-11-30T12:30", 1);
    const p = buildProposal(
      input({
        conflicted: [m],
        assignments: [m],
        externalEvents: [busy("2026-11-30T12:00", "2026-11-30T13:00")],
      }),
    )!;
    expect(p.items[0].toWindowKind).not.toBe("AFTER_WORK");
  });

  it("같은 입력이면 같은 결과 (결정론)", () => {
    const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
    const i = input({
      conflicted: [a],
      assignments: [a],
      externalEvents: [busy("2026-11-30T19:00", "2026-11-30T23:00")],
    });
    expect(buildProposal(i)).toEqual(buildProposal(i));
  });
});

describe("동시 제안 충돌 (같은 배정이 두 일정과 겹침)", () => {
  const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
  const e1 = busy("2026-11-30T19:30", "2026-11-30T20:15");
  const e2 = busy("2026-11-30T20:15", "2026-11-30T21:00");
  const events = [e1, e2];

  const p1 = buildProposal(
    input({ conflicted: [a], assignments: [a], externalEvents: events }),
  )!;
  const p2 = buildProposal(
    input({
      conflicted: [a],
      assignments: [a],
      externalEvents: events,
      reserved: [{ start: p1.items[0].toStartAt!, end: p1.items[0].toEndAt! }],
    }),
  )!;

  it("두 번째 제안은 첫 제안의 목표 칸을 노리지 않는다", () => {
    expect(fmt(p1.items[0].toStartAt!)).toBe("11-30 21:00");
    expect(fmt(p2.items[0].toStartAt!)).toBe("11-30 21:30");
  });

  it("첫 제안을 수락해 배정이 옮겨지면 두 번째 제안은 재검증에서 실패한다", () => {
    expect(
      validateProposal({
        items: p1.items,
        assignments: [a],
        externalEvents: events,
        now: MON_9AM,
      }).ok,
    ).toBe(true);
    const moved = {
      ...a,
      startAt: p1.items[0].toStartAt!,
      endAt: p1.items[0].toEndAt!,
    };
    const r = validateProposal({
      items: p2.items,
      assignments: [moved],
      externalEvents: events,
      now: MON_9AM,
    });
    expect(r).toEqual({ ok: false, failedAssignmentIds: ["a"] });
  });
});

describe("validateProposal", () => {
  const a = assignment("a", "g1", "FOCUS", "2026-11-30T20:00", 2);
  const items = [
    {
      assignmentId: "a",
      fromStartAt: a.startAt,
      fromEndAt: a.endAt,
      toStartAt: kst("2026-12-01T20:00"),
      toEndAt: kst("2026-12-01T20:30"),
      toWindowId: "w-after",
      toWindowKind: "AFTER_WORK" as const,
    },
  ];
  const v = (over: Partial<Parameters<typeof validateProposal>[0]>) =>
    validateProposal({
      items,
      assignments: [a],
      externalEvents: [],
      now: MON_9AM,
      ...over,
    });

  it("정상", () => expect(v({}).ok).toBe(true));
  it("목표 시간에 새 외부 일정이 생기면 실패", () => {
    expect(
      v({ externalEvents: [busy("2026-12-01T20:15", "2026-12-01T21:00")] }).ok,
    ).toBe(false);
  });
  it("목표 시간이 다른 배정에 점유되면 실패", () => {
    const other = assignment("o", "g2", "FOCUS", "2026-12-01T20:00", 2);
    expect(v({ assignments: [a, other] }).ok).toBe(false);
  });
  it("목표 시간이 이미 과거면 실패", () => {
    expect(v({ now: kst("2026-12-01T20:10") }).ok).toBe(false);
  });
  it("배정이 PLANNED가 아니면 실패", () => {
    expect(v({ assignments: [{ ...a, status: "DONE" }] }).ok).toBe(false);
  });
  it("배정 해제 항목(to=null)은 배정이 그대로면 통과", () => {
    const rel = [
      {
        ...items[0],
        toStartAt: null,
        toEndAt: null,
        toWindowId: null,
        toWindowKind: null,
      },
    ];
    expect(v({ items: rel }).ok).toBe(true);
  });
});
