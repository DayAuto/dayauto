import type { WindowErrors } from "@/lib/windows";
import type { SyncSummary } from "@/server/services/sync";

export type ActionErrorCode =
  "UNAUTHENTICATED" | "AUTH_EXPIRED" | "UNAVAILABLE" | "INVALID" | "UNKNOWN";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ActionErrorCode;
      message: string;
      fieldErrors?: WindowErrors;
    };

export type SyncActionResult =
  | { ok: true; summary: SyncSummary }
  | { ok: false; code: ActionErrorCode; message: string };
