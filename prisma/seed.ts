// Exam·ExamSession·CurriculumUnit 멱등 시드. 원본: docs/prototype/seed/curriculum.sample.json
// 실행: npm run db:seed (prisma db seed → tsx prisma/seed.ts)
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TaskType } from "../src/generated/prisma/client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local 없음 — 환경변수에 이미 있을 수 있다
}

interface SeedFile {
  exams: {
    name: string;
    sessions: { name: string; examDate: string }[];
    units: {
      subject: string;
      unitName: string;
      taskType: TaskType;
      estimatedChunks: number;
    }[];
  }[];
}

const TASK_TYPES = new Set<string>([
  "CONCEPT",
  "SET_PRACTICE",
  "PRACTICE",
  "REVIEW",
  "MEMORIZE",
  "UNKNOWN",
]);

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 설정되지 않았습니다.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const file = path.resolve(
    process.cwd(),
    "docs/prototype/seed/curriculum.sample.json",
  );
  const seed = JSON.parse(readFileSync(file, "utf-8")) as SeedFile;

  try {
    for (const exam of seed.exams) {
      const e = await db.exam.upsert({
        where: { name: exam.name },
        update: {},
        create: { name: exam.name },
      });

      for (const s of exam.sessions) {
        const examDate = new Date(`${s.examDate}T00:00:00.000Z`);
        await db.examSession.upsert({
          where: { examId_examDate: { examId: e.id, examDate } },
          update: { name: s.name },
          create: { examId: e.id, name: s.name, examDate },
        });
      }

      for (const [i, u] of exam.units.entries()) {
        if (!TASK_TYPES.has(u.taskType)) {
          throw new Error(
            `알 수 없는 taskType: ${u.taskType} (${exam.name} / ${u.unitName})`,
          );
        }
        const sortOrder = i + 1;
        const data = {
          subject: u.subject,
          unitName: u.unitName,
          taskType: u.taskType,
          estimatedChunks: u.estimatedChunks,
        };
        await db.curriculumUnit.upsert({
          where: { examId_sortOrder: { examId: e.id, sortOrder } },
          update: data,
          create: { examId: e.id, sortOrder, ...data },
        });
      }
      // JSON에서 줄어든 단원은 정리 (이미 복사된 Task는 curriculumUnitId가 SetNull)
      await db.curriculumUnit.deleteMany({
        where: { examId: e.id, sortOrder: { gt: exam.units.length } },
      });
    }

    const [exams, sessions, units] = await Promise.all([
      db.exam.count(),
      db.examSession.count(),
      db.curriculumUnit.count(),
    ]);
    console.log(
      `시드 완료: Exam ${exams}, ExamSession ${sessions}, CurriculumUnit ${units}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
