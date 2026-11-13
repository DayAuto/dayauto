import { describe, expect, it } from "vitest";
import { buildReason } from "../reason";

const g1 = { title: "산업안전기사", daysLeft: 76 };
const g2 = { title: "토익", daysLeft: 20 };

describe("buildReason (템플릿 5종)", () => {
  it("전부 이동, 목표 1개", () => {
    expect(
      buildReason({
        eventTitle: "팀 회식",
        goals: [g1],
        totalCount: 2,
        unscheduledCount: 0,
      }),
    ).toBe(
      "'팀 회식' 일정과 겹치는 학습 2건을 이번 주 빈 시간으로 옮기는 안을 제안합니다. 사유: 산업안전기사 시험이 76일 남아 이번 주 안에 소화해야 합니다.",
    );
  });

  it("전부 이동, 목표 2개 이상: 1·2위만 언급", () => {
    const text = buildReason({
      eventTitle: "팀 회식",
      goals: [g2, g1, { title: "기타", daysLeft: 5 }],
      totalCount: 3,
      unscheduledCount: 0,
    });
    expect(text).toBe(
      "'팀 회식' 일정과 겹치는 학습 3건을 옮기는 안을 제안합니다. 사유: 토익 시험이 20일 남아 산업안전기사보다 긴급도가 높아 더 이른 빈 시간에 먼저 배치했습니다.",
    );
    expect(text).not.toContain("기타");
  });

  it("일부 배치 불가: 기본 문장 + 꼬리 문장", () => {
    const text = buildReason({
      eventTitle: "팀 회식",
      goals: [g1],
      totalCount: 3,
      unscheduledCount: 1,
    });
    expect(text).toContain("학습 3건을 이번 주 빈 시간으로");
    expect(
      text.endsWith(
        " 단, 1건은 이번 주 빈 시간이 없어 배정을 해제하고 다음 주 배분으로 넘깁니다.",
      ),
    ).toBe(true);
  });

  it("전부 배치 불가", () => {
    expect(
      buildReason({
        eventTitle: "팀 회식",
        goals: [g1],
        totalCount: 2,
        unscheduledCount: 2,
      }),
    ).toBe(
      "'팀 회식' 일정과 겹치는 학습 2건을 옮길 빈 시간이 이번 주에 없습니다. 배정을 해제하고 다음 주 배분으로 넘기는 안을 제안합니다.",
    );
  });

  it("기본(예외)", () => {
    expect(
      buildReason({
        eventTitle: "x",
        goals: [],
        totalCount: 0,
        unscheduledCount: 0,
      }),
    ).toBe("외부 일정 변경으로 학습 일정 조정이 필요합니다.");
  });
});
