"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { GoogleCalendarError } from "@/server/calendar/errors";
import { syncCalendar } from "@/server/services/sync";
import type { SyncActionResult } from "./types";

export async function syncCalendarAction(): Promise<SyncActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      message: "로그인이 필요합니다.",
    };
  }
  try {
    const summary = await syncCalendar(session.user.id);
    revalidatePath("/");
    return { ok: true, summary };
  } catch (err) {
    if (err instanceof GoogleCalendarError) {
      return err.code === "AUTH_EXPIRED"
        ? {
            ok: false,
            code: "AUTH_EXPIRED",
            message: "구글 연결이 만료되었습니다. 다시 로그인해 주세요.",
          }
        : {
            ok: false,
            code: "UNAVAILABLE",
            message:
              "구글 캘린더를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
          };
    }
    console.error("[syncCalendarAction]", err);
    return {
      ok: false,
      code: "UNKNOWN",
      message: "동기화 중 오류가 발생했습니다.",
    };
  }
}
