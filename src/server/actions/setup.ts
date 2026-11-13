"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { WindowRow } from "@/lib/windows";
import { deleteGoal, registerGoal, saveWindows } from "@/server/services/setup";
import { UNAUTHENTICATED, toActionError } from "./result";
import type { ActionResult } from "./types";

export async function saveWindowsAction(
  rows: WindowRow[],
): Promise<ActionResult<{ next: string }>> {
  const session = await auth();
  if (!session?.user?.id) return UNAUTHENTICATED;
  try {
    const { hasGoals } = await saveWindows(session.user.id, rows);
    revalidatePath("/");
    return { ok: true, data: { next: hasGoals ? "/" : "/setup/goals" } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function registerGoalAction(
  examId: string,
  examSessionId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return UNAUTHENTICATED;
  try {
    await registerGoal(session.user.id, examId, examSessionId);
    revalidatePath("/");
    revalidatePath("/setup/goals");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteGoalAction(goalId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return UNAUTHENTICATED;
  try {
    await deleteGoal(session.user.id, goalId);
    revalidatePath("/");
    revalidatePath("/setup/goals");
    return { ok: true, data: undefined };
  } catch (err) {
    return toActionError(err);
  }
}
