"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { syncCalendar } from "@/server/services/sync";
import { UNAUTHENTICATED, toActionError } from "./result";
import type { SyncActionResult } from "./types";

export async function syncCalendarAction(): Promise<SyncActionResult> {
  const session = await auth();
  if (!session?.user?.id) return UNAUTHENTICATED;
  try {
    const summary = await syncCalendar(session.user.id);
    revalidatePath("/");
    return { ok: true, summary };
  } catch (err) {
    return toActionError(err);
  }
}
