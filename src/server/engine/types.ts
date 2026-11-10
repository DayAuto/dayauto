// 엔진 공용 타입. DB·Prisma 타입에 의존하지 않는다(서비스 계층에서 변환해서 넘긴다).

export type TaskType =
  "CONCEPT" | "SET_PRACTICE" | "PRACTICE" | "REVIEW" | "MEMORIZE" | "UNKNOWN";
export type SlotType = "MICRO" | "FOCUS";
export type WindowKind =
  "COMMUTE_TO_WORK" | "LUNCH" | "COMMUTE_FROM_WORK" | "AFTER_WORK";
export type AssignmentStatus = "PLANNED" | "DONE" | "MISSED" | "UNSCHEDULED";
export type ExternalEventStatus = "ACTIVE" | "CANCELLED";

export const SLOT_TYPES: readonly SlotType[] = ["FOCUS", "MICRO"];

/** 반열린 구간 [start, end) */
export interface Interval {
  start: Date;
  end: Date;
}

/** 생활 시간대. 분은 사용자 로컬 자정부터의 정수(0~1440, 15의 배수), 요일은 0=일 ~ 6=토 */
export interface TimeWindow {
  id: string;
  kind: WindowKind;
  startMinute: number;
  endMinute: number;
  slotType: SlotType;
  weekdays: number[];
}

/** 15분 청크 하나 */
export interface Chunk {
  windowId: string;
  windowKind: WindowKind;
  slotType: SlotType;
  /** 사용자 로컬 날짜 yyyy-MM-dd */
  localDate: string;
  /** 로컬 자정부터의 분 */
  minute: number;
  startAt: Date;
  endAt: Date;
}

export interface EngineTask {
  id: string;
  sortOrder: number;
  slotType: SlotType;
  minChunks: number;
  maxChunks: number;
  /** 잔여 청크 (03 문서 §6: estimatedChunks − PLANNED/DONE 배정 청크 합) */
  remaining: number;
  /** 이 태스크의 기존 배정 수 (splitIndex 이어 붙이기용) */
  existingAssignmentCount: number;
}

export interface EngineGoal {
  id: string;
  /** 작을수록 높음 */
  priority: number;
  /** 사용자 로컬 날짜 yyyy-MM-dd */
  examDate: string;
  createdAt: Date;
  tasks: EngineTask[];
}

export interface AssignmentInput {
  id: string;
  taskId: string;
  goalId: string;
  slotType: SlotType;
  windowId: string | null;
  windowKind: WindowKind;
  startAt: Date;
  endAt: Date;
  chunkCount: number;
  status: AssignmentStatus;
}

export interface NewAssignment {
  taskId: string;
  goalId: string;
  windowId: string;
  windowKind: WindowKind;
  startAt: Date;
  endAt: Date;
  chunkCount: number;
  splitIndex: number;
  isCarryOver: boolean;
}

export interface StoredEvent {
  googleEventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  isBusy: boolean;
  status: ExternalEventStatus;
  googleUpdatedAt: Date;
}

export interface FetchedEvent {
  googleEventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  isBusy: boolean;
  googleUpdatedAt: Date;
  cancelled: boolean;
}

/** 빈 시간·충돌 계산에 쓰는 외부 일정 최소 형태 */
export interface BusyEventInput {
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  isBusy: boolean;
  status: ExternalEventStatus;
}
