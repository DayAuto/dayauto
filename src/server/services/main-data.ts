import "server-only";
import { getNow } from "@/server/clock";
import { getDb } from "@/server/db";
import {
  allocateWeek,
  busyIntervals,
  calendarDaysUntil,
  getWeekRange,
  localDateOf,
  overlaps,
  type AssignmentInput,
} from "@/server/engine";
import {
  loadEngineGoals,
  loadWeekAssignments,
  loadWeekEventRows,
  loadWindows,
  toBusyInput,
} from "./engine-input";

export interface MainGoal {
  id: string;
  title: string;
  colorIndex: number;
  dDay: number;
  /** 잔여 청크 (배정되지 않은 양) */
  remainingChunks: number;
  /** 이번 주 PLANNED/DONE 배정 청크 */
  weekChunks: number;
  urgency: number | null;
  /** 지금 재배분하면 이번 주 안에 못 채우는 일일 할당량 (N-22) */
  unmetChunks: number;
}

export interface MainEvent {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
}

export interface MainAssignment {
  id: string;
  goalId: string;
  goalTitle: string;
  colorIndex: number;
  subject: string;
  unitName: string;
  slotType: "MICRO" | "FOCUS";
  status: "PLANNED" | "DONE" | "MISSED";
  startIso: string;
  endIso: string;
  chunkCount: number;
  /** 바쁜 외부 일정과 겹침 */
  conflicting: boolean;
}

export interface MainProposalItem {
  assignmentId: string;
  goalTitle: string;
  colorIndex: number;
  /** "과목 · 단원" */
  label: string;
  slotType: "MICRO" | "FOCUS";
  fromStartIso: string;
  toStartIso: string | null;
  toEndIso: string | null;
}

export interface MainProposal {
  id: string;
  title: string;
  reason: string;
  items: MainProposalItem[];
}

export interface MainData {
  tz: string;
  nowIso: string;
  weekStartIso: string;
  lastSyncedAtIso: string | null;
  goals: MainGoal[];
  events: MainEvent[];
  assignments: MainAssignment[];
  proposals: MainProposal[];
}

export async function getMainData(userId: string): Promise<MainData> {
  const db = getDb();
  const now = getNow();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const tz = user.timezone;
  const weekRange = getWeekRange(now, tz);
  const today = localDateOf(now, tz);

  const [
    windows,
    eventRows,
    weekAssignments,
    { goals, titles },
    taskRows,
    pending,
  ] = await Promise.all([
    loadWindows(db, userId),
    loadWeekEventRows(db, userId, weekRange),
    loadWeekAssignments(db, userId, weekRange),
    loadEngineGoals(db, userId),
    db.task.findMany({
      where: { goal: { userId } },
      select: { id: true, subject: true, unitName: true },
    }),
    db.proposal.findMany({
      where: { userId, status: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { items: true, triggerExternalEvent: true },
    }),
  ]);

  const colorIndex = new Map(goals.map((g, i) => [g.id, i]));
  const taskInfo = new Map(taskRows.map((t) => [t.id, t]));
  const busy = busyIntervals(eventRows.map(toBusyInput));

  const events: MainEvent[] = eventRows
    .filter((e) => e.status === "ACTIVE" && !e.isAllDay)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startIso: e.startAt.toISOString(),
      endIso: e.endAt.toISOString(),
    }));

  const shown = weekAssignments.filter(
    (a): a is AssignmentInput & { status: "PLANNED" | "DONE" | "MISSED" } =>
      a.status !== "UNSCHEDULED",
  );
  const assignments: MainAssignment[] = shown.map((a) => {
    const t = taskInfo.get(a.taskId);
    return {
      id: a.id,
      goalId: a.goalId,
      goalTitle: titles.get(a.goalId) ?? "",
      colorIndex: colorIndex.get(a.goalId) ?? 0,
      subject: t?.subject ?? "",
      unitName: t?.unitName ?? "",
      slotType: a.slotType,
      status: a.status,
      startIso: a.startAt.toISOString(),
      endIso: a.endAt.toISOString(),
      chunkCount: a.chunkCount,
      conflicting:
        a.status === "PLANNED" &&
        busy.some((b) => overlaps({ start: a.startAt, end: a.endAt }, b)),
    };
  });

  // 목표 현황. 미배정은 "지금 재배분하면" 시뮬레이션 (N-22): 앞으로의 PLANNED를 잔여로 되돌려 다시 배분해 본다.
  const futurePlanned = weekAssignments.filter(
    (a) => a.status === "PLANNED" && a.startAt >= now,
  );
  const futureByTask = new Map<string, number>();
  for (const a of futurePlanned)
    futureByTask.set(
      a.taskId,
      (futureByTask.get(a.taskId) ?? 0) + a.chunkCount,
    );
  const simulation = allocateWeek({
    goals: goals.map((g) => ({
      ...g,
      tasks: g.tasks.map((t) => ({
        ...t,
        remaining: t.remaining + (futureByTask.get(t.id) ?? 0),
      })),
    })),
    windows,
    externalEvents: eventRows.map(toBusyInput),
    existingAssignments: weekAssignments.filter(
      (a) => (a.status === "PLANNED" || a.status === "DONE") && a.startAt < now,
    ),
    now,
    tz,
  });
  const unmetByGoal = new Map<string, number>();
  for (const u of simulation.unmet)
    unmetByGoal.set(u.goalId, (unmetByGoal.get(u.goalId) ?? 0) + u.chunks);

  const goalRows = await db.goal.findMany({
    where: { userId },
    select: { id: true, urgency: true },
  });
  const urgencyById = new Map(goalRows.map((g) => [g.id, g.urgency]));
  const examDateById = new Map(goals.map((g) => [g.id, g.examDate]));

  const goalItems: MainGoal[] = goals.map((g, i) => ({
    id: g.id,
    title: titles.get(g.id) ?? "",
    colorIndex: i,
    dDay: calendarDaysUntil(today, examDateById.get(g.id)!),
    remainingChunks: g.tasks.reduce((s, t) => s + t.remaining, 0),
    weekChunks: weekAssignments
      .filter(
        (a) =>
          a.goalId === g.id && (a.status === "PLANNED" || a.status === "DONE"),
      )
      .reduce((s, a) => s + a.chunkCount, 0),
    urgency: urgencyById.get(g.id) ?? null,
    unmetChunks: unmetByGoal.get(g.id) ?? 0,
  }));

  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const proposals: MainProposal[] = pending.map((p) => ({
    id: p.id,
    title: `'${p.triggerExternalEvent?.title ?? "일정"}' 일정 변경`,
    reason: p.reason,
    items: p.items
      .map((i) => {
        const a = assignmentById.get(i.assignmentId);
        if (!a) return null;
        return {
          assignmentId: i.assignmentId,
          goalTitle: a.goalTitle,
          colorIndex: a.colorIndex,
          label: `${a.subject} · ${a.unitName}`,
          slotType: a.slotType,
          fromStartIso: i.fromStartAt.toISOString(),
          toStartIso: i.toStartAt?.toISOString() ?? null,
          toEndIso: i.toEndAt?.toISOString() ?? null,
        };
      })
      .filter((i): i is MainProposalItem => i !== null)
      .sort((x, y) => x.fromStartIso.localeCompare(y.fromStartIso)),
  }));

  return {
    tz,
    nowIso: now.toISOString(),
    weekStartIso: weekRange.start.toISOString(),
    lastSyncedAtIso: user.lastSyncedAt?.toISOString() ?? null,
    goals: goalItems,
    events,
    assignments,
    proposals,
  };
}
