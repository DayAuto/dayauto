import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { SyncDebug } from "@/components/sync-debug";
import { logout } from "@/server/actions/auth";

// 임시 확인 화면 (P3). P5에서 메인(주간표 + 우측 패널)으로 교체한다.
export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">DayAuto</h1>
      <p className="text-sm text-muted-foreground">
        로그인: {session.user.email}
      </p>
      <SyncDebug />
      <form action={logout}>
        <Button type="submit" variant="outline">
          로그아웃
        </Button>
      </form>
    </main>
  );
}
