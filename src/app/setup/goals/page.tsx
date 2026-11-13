import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoalsForm } from "@/components/goals-form";
import { getGoalsPageData, getSetupStatus } from "@/server/services/setup";

export default async function GoalsSetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const status = await getSetupStatus(session.user.id);
  if (status.windows === 0) redirect("/setup/windows");
  const { exams, goals } = await getGoalsPageData(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">목표 관리</h1>
        <Link
          href="/setup/windows"
          className="text-sm text-muted-foreground underline"
        >
          시간대 수정
        </Link>
      </header>
      <GoalsForm exams={exams} goals={goals} />
      {goals.length > 0 && (
        <Link href="/" className="text-sm font-medium underline">
          주간표 보기 →
        </Link>
      )}
    </main>
  );
}
