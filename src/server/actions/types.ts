import type { SyncSummary } from "@/server/services/sync";

export type ActionErrorCode =
  "UNAUTHENTICATED" | "AUTH_EXPIRED" | "UNAVAILABLE" | "UNKNOWN";

export type SyncActionResult =
  | { ok: true; summary: SyncSummary }
  | { ok: false; code: ActionErrorCode; message: string };
