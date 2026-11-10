import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allocateWeek } from "../allocate";
import { diffEvents, findConflicts } from "../changes";
import { buildProposal } from "../reallocate";
import { buildReason } from "../reason";
import { TASK_RULES } from "../rules";
import { calendarDaysUntil } from "../time";
import type {
  AssignmentInput,
  EngineGoal,
  FetchedEvent,
  TaskType,
} from "../types";
import { DEFAULT_WINDOWS, MON_9AM, TZ, fmt, kst } from "./fixtures";

interface SeedUnit {
  subject: string;
  unitName: string;
  taskType: TaskType;
  estimatedChunks: number;
}
interface SeedExam {
  name: string;
  sessions: { name: string; examDate: string }[];
  units: SeedUnit[];
}

const seed = JSON.parse(
  readFileSync(
    path.resolve(process.cwd(), "docs/prototype/seed/curriculum.sample.json"),
    "utf-8",
  ),
) as { exams: SeedExam[] };

const goalTitles = new Map<string, string>();
const taskInfo = new Map<
  string,
  { label: string; slotType: "FOCUS" | "MICRO" }
>();

function toGoal(exam: SeedExam, createdAt: string): EngineGoal {
  const id = exam.name;
  goalTitles.set(id, exam.name);
  return {
    id,
    priority: 100,
    examDate: exam.sessions[0].examDate,
    createdAt: new Date(createdAt),
    tasks: exam.units.map((u, i) => {
      const rule = TASK_RULES[u.taskType];
      const tid = `${id}#${i + 1}`;
      taskInfo.set(tid, {
        label: `${u.subject} · ${u.unitName}`,
        slotType: rule.slotType,
      });
      return {
        id: tid,
        sortOrder: i + 1,
        slotType: rule.slotType,
        minChunks: rule.minChunks,
        maxChunks: rule.maxChunks,
        remaining: u.estimatedChunks,
        existingAssignmentCount: 0,
      };
    }),
  };
}

describe("시연 재현 (11/30 월요일 09:00 KST)", () => {
  const goals = [
    toGoal(seed.exams[0], "2026-11-29T00:00:00Z"),
    toGoal(seed.exams[1], "2026-11-29T01:00:00Z"),
  ];

  const alloc = allocateWeek({
    goals,
    windows: DEFAULT_WINDOWS,
    externalEvents: [],
    existingAssignments: [],
    now: MON_9AM,
    tz: TZ,
  });

  const planned: AssignmentInput[] = alloc.assignments.map((a, i) => ({
    id: `A${i + 1}`,
    taskId: a.taskId,
    goalId: a.goalId,
    slotType: taskInfo.get(a.taskId)!.slotType,
    windowId: a.windowId,
    windowKind: a.windowKind,
    startAt: a.startAt,
    endAt: a.endAt,
    chunkCount: a.chunkCount,
    status: "PLANNED",
  }));

  it("월~금에 마이크로·집중 슬롯으로 배분된다", () => {
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((a) => a.startAt >= MON_9AM)).toBe(true);
    const monFocus = planned.filter(
      (a) => a.slotType === "FOCUS" && fmt(a.startAt).startsWith("11-30"),
    );
    expect(monFocus.length).toBeGreaterThan(0);
    console.log(
      "[월요일 배분표]\n" +
        planned
          .filter((a) => fmt(a.startAt).startsWith("11-30"))
          .map(
            (a) =>
              `${fmt(a.startAt).slice(6)}–${fmt(a.endAt).slice(6)} ${a.slotType === "FOCUS" ? "집중" : "마이크로"} [${a.goalId}] ${taskInfo.get(a.taskId)!.label} (${a.chunkCount}청크)`,
          )
          .join("\n"),
    );
  });

  it("회식(월 19:00–23:00) 추가 → 월요일 저녁 배정이 화요일 이후로 이동하는 제안", () => {
    const dinner: FetchedEvent = {
      googleEventId: "dinner",
      title: "팀 회식",
      startAt: kst("2026-11-30T19:00"),
      endAt: kst("2026-11-30T23:00"),
      isAllDay: false,
      isBusy: true,
      googleUpdatedAt: new Date("2026-11-30T00:10:00Z"),
      cancelled: false,
    };
    const diff = diffEvents([], [dinner]);
    expect(diff.added).toHaveLength(1);

    const conflicted = findConflicts(dinner, planned, MON_9AM);
    expect(conflicted.length).toBeGreaterThan(0);

    const draft = buildProposal({
      conflicted,
      goalsOrder: alloc.goalOrder,
      windows: DEFAULT_WINDOWS,
      externalEvents: [{ ...dinner, status: "ACTIVE" }],
      assignments: planned,
      reserved: [],
      excluded: {},
      now: MON_9AM,
      tz: TZ,
    })!;

    for (const it of draft.items) {
      expect(it.toStartAt).not.toBeNull();
      expect(fmt(it.toStartAt!) > "11-30 23:59").toBe(true); // 화요일 이후
      expect(it.toStartAt! >= it.fromStartAt).toBe(true);
    }

    const today = "2026-11-30";
    const byId = new Map(goals.map((g) => [g.id, g]));
    const reason = buildReason({
      eventTitle: dinner.title,
      goals: draft.meta.byGoal.map((g) => ({
        title: goalTitles.get(g.goalId)!,
        daysLeft: calendarDaysUntil(today, byId.get(g.goalId)!.examDate),
      })),
      totalCount: draft.meta.conflictedCount,
      unscheduledCount: draft.meta.unscheduledCount,
    });
    expect(reason).toContain("'팀 회식'");

    const byAssign = new Map(planned.map((a) => [a.id, a]));
    console.log(
      `[조정안]\n${reason}\n` +
        draft.items
          .map((it) => {
            const a = byAssign.get(it.assignmentId)!;
            return `[${a.goalId}] ${taskInfo.get(a.taskId)!.label}  ${fmt(it.fromStartAt)} → ${it.toStartAt ? fmt(it.toStartAt) : "이번 주 배정 해제"}`;
          })
          .join("\n"),
    );
  });
});
