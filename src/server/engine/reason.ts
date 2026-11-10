export interface ReasonInput {
  /** 트리거 일정 제목 */
  eventTitle: string;
  /** 충돌 배정이 있는 목표를 긴급도 높은 순으로 (3개 이상이어도 2위까지만 언급) */
  goals: { title: string; daysLeft: number }[];
  /** 충돌한 배정 전체 건수 */
  totalCount: number;
  /** 이번 주에 옮길 곳이 없어 배정 해제되는 건수 */
  unscheduledCount: number;
}

/** 사유 한 줄 (04 문서 §7). LLM 없이 템플릿으로 결정론적으로 고른다. */
export function buildReason(input: ReasonInput): string {
  const { eventTitle, goals, totalCount, unscheduledCount } = input;
  if (totalCount <= 0 || goals.length === 0)
    return "외부 일정 변경으로 학습 일정 조정이 필요합니다.";

  if (unscheduledCount >= totalCount) {
    return `'${eventTitle}' 일정과 겹치는 학습 ${totalCount}건을 옮길 빈 시간이 이번 주에 없습니다. 배정을 해제하고 다음 주 배분으로 넘기는 안을 제안합니다.`;
  }

  let text: string;
  if (goals.length === 1) {
    const [g] = goals;
    text = `'${eventTitle}' 일정과 겹치는 학습 ${totalCount}건을 이번 주 빈 시간으로 옮기는 안을 제안합니다. 사유: ${g.title} 시험이 ${g.daysLeft}일 남아 이번 주 안에 소화해야 합니다.`;
  } else {
    const [g1, g2] = goals;
    text = `'${eventTitle}' 일정과 겹치는 학습 ${totalCount}건을 옮기는 안을 제안합니다. 사유: ${g1.title} 시험이 ${g1.daysLeft}일 남아 ${g2.title}보다 긴급도가 높아 더 이른 빈 시간에 먼저 배치했습니다.`;
  }
  if (unscheduledCount > 0) {
    text += ` 단, ${unscheduledCount}건은 이번 주 빈 시간이 없어 배정을 해제하고 다음 주 배분으로 넘깁니다.`;
  }
  return text;
}
