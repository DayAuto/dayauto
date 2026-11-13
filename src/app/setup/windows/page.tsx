import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WindowsForm } from "@/components/windows-form";
import {
  DEFAULT_WINDOW_ROWS,
  WINDOW_KINDS,
  type WindowRow,
} from "@/lib/windows";
import { getWindowRows } from "@/server/services/setup";

export default async function WindowsSetupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const saved = await getWindowRows(session.user.id);
  // 저장된 값이 있으면 그것을, 사용하지 않는 구분은 기본값을 꺼진 상태로 보여 준다
  const initial: WindowRow[] = WINDOW_KINDS.map((kind) => {
    const found = saved?.find((r) => r.kind === kind);
    if (found) return found;
    const def = DEFAULT_WINDOW_ROWS.find((r) => r.kind === kind)!;
    return saved ? { ...def, enabled: false } : def;
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">생활 시간대</h1>
        {saved && (
          <Link href="/" className="text-sm text-muted-foreground underline">
            주간표로
          </Link>
        )}
      </header>
      <p className="text-sm text-muted-foreground">
        학습에 쓸 수 있는 시간대를 알려 주세요. 15분 단위로 입력하고, 같은
        요일에는 겹치지 않아야 합니다.
      </p>
      <WindowsForm initial={initial} />
    </main>
  );
}
