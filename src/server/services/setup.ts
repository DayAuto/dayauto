import "server-only";
import {
  validateWindows,
  type WindowErrors,
  type WindowRow,
} from "@/lib/windows";
import { getNow } from "@/server/clock";
import { getDb } from "@/server/db";
import { TASK_RULES, calendarDaysUntil, localDateOf } from "@/server/engine";
import { mutateAndReallocate } from "./allocation";

/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: WindowErrors,
  ) {
    super(message);
    this.name = "UserFacingError";
  }
}

const dateStr = (d: Date) => d.toISOString().slice(0, 10);

/** 생활 시간대 저장 = 전부 교체(delete + create) 후 이번 주 재배분 (05 문서 §3) */
export async function saveWindows(
  userId: string,
  rows: WindowRow[],
): Promise<{ hasGoals: boolean }> {
  const { ok, errors } = validateWindows(rows);
  if (!ok) throw new UserFacingError("입력값을 확인해 주세요.", errors);

  await mutateAndReallocate(userId, async (tx) => {
    await tx.availabilityWindow.deleteMany({ where: { userId } });
    await tx.availabilityWindow.createMany({
      data: rows
        .filter((r) => r.enabled)
        .map((r) => ({
          userId,
          kind: r.kind,
          startMinute: r.startMinute,
          endMinute: r.endMinute,
          slotType: r.slotType,
          weekdays: [...r.weekdays].sort((a, b) => a - b),
        })),
    });
  });
  const goals = await getDb().goal.count({
    where: { userId, status: { not: "EXPIRED" } },
  });
  return { hasGoals: goals > 0 };
}

/** 목표 등록: Goal 생성 → CurriculumUnit을 Task로 복사 → 이번 주 재배분 (05 문서 §4) */
export async function registerGoal(
  userId: string,
  examId: string,
  examSessionId: string,
): Promise<void> {
  const db = getDb();
  const now = getNow();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const today = localDateOf(now, user.timezone);

  const session = await db.examSession.findFirst({
    where: { id: examSessionId, examId },
    include: { exam: true },
  });
  if (!session)
    throw new UserFacingError("선택한 종목·회차를 찾을 수 없습니다.");
  if (dateStr(session.examDate) <= today)
    throw new UserFacingError("이미 지난 회차는 등록할 수 없습니다.");

  const dup = await db.goal.findFirst({ where: { userId, examSessionId } });
  if (dup) throw new UserFacingError("이미 등록된 회차입니다.");

  const units = await db.curriculumUnit.findMany({
    where: { examId },
    orderBy: { sortOrder: "asc" },
  });
  if (units.length === 0)
    throw new UserFacingError("이 종목의 커리큘럼이 아직 없습니다.");

  await mutateAndReallocate(
    userId,
    async (tx) => {
      const goal = await tx.goal.create({
        data: {
          userId,
          examId,
          examSessionId,
          title: session.exam.name,
          examDate: session.examDate,
        },
      });
      await tx.task.createMany({
        data: units.map((u) => {
          const rule = TASK_RULES[u.taskType];
          return {
            goalId: goal.id,
            curriculumUnitId: u.id,
            subject: u.subject,
            unitName: u.unitName,
            taskType: u.taskType,
            slotType: rule.slotType,
            minChunks: rule.minChunks,
            maxChunks: rule.maxChunks,
            estimatedChunks: u.estimatedChunks,
            sortOrder: u.sortOrder,
          };
        }),
      });
    },
    now,
  );
}

/** 목표 삭제(Cascade로 태스크·배정·제안 항목 삭제) 후 재배분 */
export async function deleteGoal(
  userId: string,
  goalId: string,
): Promise<void> {
  const goal = await getDb().goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw new UserFacingError("목표를 찾을 수 없습니다.");
  await mutateAndReallocate(userId, async (tx) => {
    await tx.goal.delete({ where: { id: goalId } });
  });
}

// ---------- 화면용 조회 ----------

export async function getWindowRows(
  userId: string,
): Promise<WindowRow[] | null> {
  const rows = await getDb().availabilityWindow.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) return null;
  return rows.map((w) => ({
    kind: w.kind,
    enabled: true,
    startMinute: w.startMinute,
    endMinute: w.endMinute,
    slotType: w.slotType,
    weekdays: w.weekdays,
  }));
}

export interface ExamOption {
  id: string;
  name: string;
  sessions: { id: string; label: string }[];
}

export interface GoalListItem {
  id: string;
  title: string;
  examDate: string;
  dDay: number;
  taskCount: number;
  totalChunks: number;
}

export async function getGoalsPageData(userId: string): Promise<{
  exams: ExamOption[];
  goals: GoalListItem[];
}> {
  const db = getDb();
  const now = getNow();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const today = localDateOf(now, user.timezone);

  const [exams, goals] = await Promise.all([
    db.exam.findMany({
      orderBy: { name: "asc" },
      include: { sessions: { orderBy: { examDate: "asc" } } },
    }),
    db.goal.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { tasks: { select: { estimatedChunks: true } } },
    }),
  ]);

  return {
    exams: exams.map((e) => ({
      id: e.id,
      name: e.name,
      // 오늘 이후 회차만 (05 문서 §4)
      sessions: e.sessions
        .filter((s) => dateStr(s.examDate) > today)
        .map((s) => ({
          id: s.id,
          label: `${dateStr(s.examDate)} (D-${calendarDaysUntil(today, dateStr(s.examDate))}) ${s.name}`,
        })),
    })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      examDate: dateStr(g.examDate),
      dDay: calendarDaysUntil(today, dateStr(g.examDate)),
      taskCount: g.tasks.length,
      totalChunks: g.tasks.reduce((s, t) => s + t.estimatedChunks, 0),
    })),
  };
}

/** `/` 진입 분기용: 시간대·활성 목표 개수 */
export async function getSetupStatus(
  userId: string,
): Promise<{ windows: number; activeGoals: number }> {
  const db = getDb();
  const [windows, activeGoals] = await Promise.all([
    db.availabilityWindow.count({ where: { userId } }),
    db.goal.count({ where: { userId, status: { not: "EXPIRED" } } }),
  ]);
  return { windows, activeGoals };
}
