import { formatInTimeZone } from "date-fns-tz";
import type {
  AssignmentInput,
  BusyEventInput,
  EngineGoal,
  EngineTask,
  SlotType,
  TimeWindow,
} from "../types";

export const TZ = "Asia/Seoul";

/** "2026-11-30T09:00" 형태의 KST 시각 */
export const kst = (s: string): Date => new Date(`${s}:00+09:00`);

export const fmt = (d: Date, tz = TZ): string =>
  formatInTimeZone(d, tz, "MM-dd HH:mm");

/** 05 문서 §3 기본 시간대 (월~금) */
export const DEFAULT_WINDOWS: TimeWindow[] = [
  {
    id: "w-am",
    kind: "COMMUTE_TO_WORK",
    startMinute: 450,
    endMinute: 495,
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: "w-lunch",
    kind: "LUNCH",
    startMinute: 750,
    endMinute: 780,
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: "w-pm",
    kind: "COMMUTE_FROM_WORK",
    startMinute: 1110,
    endMinute: 1155,
    slotType: "MICRO",
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    id: "w-after",
    kind: "AFTER_WORK",
    startMinute: 1200,
    endMinute: 1380,
    slotType: "FOCUS",
    weekdays: [1, 2, 3, 4, 5],
  },
];

export const MON_9AM = kst("2026-11-30T09:00");

export function task(
  id: string,
  slotType: SlotType,
  remaining: number,
  extra: Partial<EngineTask> = {},
): EngineTask {
  const focus = slotType === "FOCUS";
  return {
    id,
    sortOrder: 1,
    slotType,
    minChunks: focus ? 2 : 1,
    maxChunks: focus ? 4 : 1,
    remaining,
    existingAssignmentCount: 0,
    ...extra,
  };
}

export function goal(
  id: string,
  examDate: string,
  tasks: EngineTask[],
  extra: Partial<EngineGoal> = {},
): EngineGoal {
  return {
    id,
    priority: 100,
    examDate,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    tasks,
    ...extra,
  };
}

export function assignment(
  id: string,
  goalId: string,
  slotType: SlotType,
  start: string,
  chunkCount: number,
  extra: Partial<AssignmentInput> = {},
): AssignmentInput {
  const startAt = kst(start);
  return {
    id,
    taskId: `t-${id}`,
    goalId,
    slotType,
    windowId: slotType === "FOCUS" ? "w-after" : "w-lunch",
    windowKind: slotType === "FOCUS" ? "AFTER_WORK" : "LUNCH",
    startAt,
    endAt: new Date(startAt.getTime() + chunkCount * 15 * 60_000),
    chunkCount,
    status: "PLANNED",
    ...extra,
  };
}

export function busy(
  start: string,
  end: string,
  extra: Partial<BusyEventInput> = {},
): BusyEventInput {
  return {
    startAt: kst(start),
    endAt: kst(end),
    isAllDay: false,
    isBusy: true,
    status: "ACTIVE",
    ...extra,
  };
}
