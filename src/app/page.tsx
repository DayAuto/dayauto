import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { SyncDebug } from "@/components/sync-debug";
import { logout } from "@/server/actions/auth";
import { toActionError } from "@/server/actions/result";
import { ensureWeekAllocated } from "@/server/services/allocation";
import { getSetupStatus } from "@/server/services/setup";

// 임시 확인 화면 (P3~P4). P5에서 메인(주간표 + 우측 패널)으로 교체한다.
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const status = await getSetupStatus(userId);
  if (status.windows === 0) redirect("/setup/windows");
  if (status.activeGoals === 0) redirect("/setup/goals");

  // 동기화가 먼저, 배분이 나중 (05 문서 §5.2)
  let error: string | null = null;
  try {
    await ensureWeekAllocated(userId);
  } catch (err) {
    error = toActionError(err).message;
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">DayAuto</h1>
      <p className="text-sm text-muted-foreground">
        로그인: {session.user.email}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <nav className="flex gap-4 text-sm underline">
        <Link href="/setup/windows">시간대 수정</Link>
        <Link href="/setup/goals">목표 관리</Link>
      </nav>
      <SyncDebug />
      <form action={logout}>
        <Button type="submit" variant="outline">
          로그아웃
        </Button>
      </form>
    </main>
  );
}
