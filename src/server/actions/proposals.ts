"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  acceptProposal,
  rejectProposal,
  reallocateProposal,
  type ProposalOutcome,
} from "@/server/services/proposals";
import { UNAUTHENTICATED, toActionError } from "./result";
import type { ActionResult } from "./types";

async function run(
  proposalId: string,
  fn: (userId: string, proposalId: string) => Promise<ProposalOutcome>,
): Promise<ActionResult<{ outcome: ProposalOutcome }>> {
  // 모든 액션은 로그인 확인 → 서비스에서 제안 소유자·PENDING 상태 확인
  const session = await auth();
  if (!session?.user?.id) return UNAUTHENTICATED;
  try {
    const outcome = await fn(session.user.id, proposalId);
    revalidatePath("/");
    return { ok: true, data: { outcome } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function acceptProposalAction(proposalId: string) {
  return run(proposalId, acceptProposal);
}

export async function reallocateProposalAction(proposalId: string) {
  return run(proposalId, reallocateProposal);
}

export async function rejectProposalAction(proposalId: string) {
  return run(proposalId, rejectProposal);
}
