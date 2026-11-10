import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma client 싱글턴. 연결 문자열이 없는 환경(CI 빌드 등)에서도 import만으로는 실패하지 않도록
 * 처음 쓰는 시점에 만든다.
 */
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error("DATABASE_URL이 설정되지 않았습니다.");
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  return globalForPrisma.prisma;
}
