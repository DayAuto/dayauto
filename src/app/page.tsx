import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MainView, type ServerError } from "@/components/main-view";
import { toActionError } from "@/server/actions/result";
import { getDb } from "@/server/db";
import { ensureWeekAllocated } from "@/server/services/allocation";
import { loadWindows } from "@/server/services/engine-input";
import { getMainData } from "@/server/services/main-data";
import { getSetupStatus } from "@/server/services/setup";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // 진입 분기 (05 문서 §1)
  const status = await getSetupStatus(userId);
  if (status.windows === 0) redirect("/setup/windows");
  if (status.activeGoals === 0) redirect("/setup/goals");

  // 동기화가 먼저, 배분이 나중 (05 문서 §5.2). 실패해도 현재 주간표는 보여 주고 안내만 띄운다.
  let serverError: ServerError | null = null;
  try {
    await ensureWeekAllocated(userId);
  } catch (err) {
    const e = toActionError(err);
    serverError = { code: e.code, message: e.message };
  }

  const data = await getMainData(userId);
  // 주간표 표시 범위·마이크로 묶음용 생활 시간대 (읽기 전용 조회)
  const windows = await loadWindows(getDb(), userId);
  return <MainView data={data} windows={windows} serverError={serverError} />;
}
