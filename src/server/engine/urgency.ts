import { addDaysToDate, daysBetween, weekdayOfDate } from "./time";
import {
  SLOT_TYPES,
  type EngineGoal,
  type SlotType,
  type TimeWindow,
} from "./types";
import { ceilDiv, compareStr } from "./util";

export type GoalState = "ACTIVE" | "EXPIRED" | "ON_HOLD" | "NO_DAYS";

export interface GoalUrgency {
  goalId: string;
  state: GoalState;
  priority: number;
  examDate: string;
  createdAt: Date;
  remaining: number;
  remainingBySlot: Record<SlotType, number>;
  /** 오늘 이상 시험일 미만 중 시간대가 있는 날 수 (D-01) */
  days: number;
  daysBySlot: Record<SlotType, number>;
  /** 표시·저장용. 정렬에는 쓰지 않는다 */
  urgency: number | null;
  /** 목표·slotType별 일일 할당량 */
  need: Record<SlotType, number>;
}

const zeroBySlot = (): Record<SlotType, number> => ({ FOCUS: 0, MICRO: 0 });

export function computeUrgencies(input: {
  goals: EngineGoal[];
  windows: TimeWindow[];
  /** 사용자 로컬 날짜 yyyy-MM-dd */
  today: string;
}): GoalUrgency[] {
  const { goals, windows, today } = input;

  // 요일(0~6)별로 시간대가 있는 slotType
  const slotsByWeekday: Record<number, Set<SlotType>> = {};
  for (let d = 0; d < 7; d++) slotsByWeekday[d] = new Set();
  for (const w of windows)
    for (const d of w.weekdays) slotsByWeekday[d].add(w.slotType);

  return goals.map((g) => {
    const remainingBySlot = zeroBySlot();
    for (const t of g.tasks) remainingBySlot[t.slotType] += t.remaining;
    const remaining = remainingBySlot.FOCUS + remainingBySlot.MICRO;

    const daysBySlot = zeroBySlot();
    let days = 0;
    const span = daysBetween(today, g.examDate);
    for (let i = 0; i < span; i++) {
      const slots = slotsByWeekday[weekdayOfDate(addDaysToDate(today, i))];
      if (slots.size > 0) days++;
      for (const s of slots) daysBySlot[s]++;
    }

    let state: GoalState = "ACTIVE";
    if (g.examDate < today) state = "EXPIRED";
    else if (g.tasks.length === 0 || remaining === 0) state = "ON_HOLD";
    else if (days === 0) state = "NO_DAYS";

    const need = zeroBySlot();
    for (const s of SLOT_TYPES) {
      need[s] =
        daysBySlot[s] === 0 ? 0 : ceilDiv(remainingBySlot[s], daysBySlot[s]);
    }

    return {
      goalId: g.id,
      state,
      priority: g.priority,
      examDate: g.examDate,
      createdAt: g.createdAt,
      remaining,
      remainingBySlot,
      days,
      daysBySlot,
      urgency: state === "ACTIVE" ? remaining / days : null,
      need,
    };
  });
}

/** 배분 순서(D-02): 우선순위 → 요구 속도(교차 곱) → 시험일 → 생성일 → id. ACTIVE만 남긴다. */
export function sortGoals(urgencies: GoalUrgency[]): GoalUrgency[] {
  return urgencies
    .filter((u) => u.state === "ACTIVE")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const left = a.remaining * b.days;
      const right = b.remaining * a.days;
      if (left !== right) return left > right ? -1 : 1;
      if (a.examDate !== b.examDate) return compareStr(a.examDate, b.examDate);
      if (a.createdAt.getTime() !== b.createdAt.getTime()) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      return compareStr(a.goalId, b.goalId);
    });
}
