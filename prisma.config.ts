import { defineConfig } from "prisma/config";

// Prisma 7은 .env를 자동으로 읽지 않는다. Next.js와 같은 .env.local을 직접 로드한다.
// 파일이 없거나(CI) DATABASE_URL이 없어도 `prisma generate`는 동작해야 한다.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local 없음
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
