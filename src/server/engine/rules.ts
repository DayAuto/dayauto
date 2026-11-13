import type { SlotType, TaskType } from "./types";

export interface TaskRule {
  slotType: SlotType;
  minChunks: number;
  maxChunks: number;
}

/** 학습 유형 → 슬롯·청크 규칙 (03 문서 §3). 이 표는 여기에만 둔다. */
export const TASK_RULES: Record<TaskType, TaskRule> = {
  CONCEPT: { slotType: "FOCUS", minChunks: 2, maxChunks: 4 },
  SET_PRACTICE: { slotType: "FOCUS", minChunks: 2, maxChunks: 4 },
  PRACTICE: { slotType: "MICRO", minChunks: 1, maxChunks: 1 },
  REVIEW: { slotType: "MICRO", minChunks: 1, maxChunks: 1 },
  MEMORIZE: { slotType: "MICRO", minChunks: 1, maxChunks: 1 },
  UNKNOWN: { slotType: "FOCUS", minChunks: 2, maxChunks: 4 },
};
