import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MainView, type ServerError } from "@/components/main-view";
import { toActionError } from "@/server/actions/result";
import { ensureWeekAllocated } from "@/server/services/allocation";
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
  return <MainView data={data} serverError={serverError} />;
}
