import "server-only";
import { GoogleCalendarError } from "@/server/calendar/errors";
import { UserFacingError } from "@/server/services/setup";
import type { ActionResult } from "./types";

export const AUTH_EXPIRED_MESSAGE =
  "구글 연결이 만료되었습니다. 다시 로그인해 주세요.";
export const UNAVAILABLE_MESSAGE =
  "구글 캘린더를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 서비스에서 던진 오류를 화면용 결과로 바꾼다 (05 문서 §5.3 실패 처리 문구) */
export function toActionError(
  err: unknown,
): Extract<ActionResult, { ok: false }> {
  if (err instanceof UserFacingError) {
    return {
      ok: false,
      code: "INVALID",
      message: err.message,
      fieldErrors: err.fieldErrors,
    };
  }
  if (err instanceof GoogleCalendarError) {
    return err.code === "AUTH_EXPIRED"
      ? { ok: false, code: "AUTH_EXPIRED", message: AUTH_EXPIRED_MESSAGE }
      : { ok: false, code: "UNAVAILABLE", message: UNAVAILABLE_MESSAGE };
  }
  console.error("[action]", err);
  return {
    ok: false,
    code: "UNKNOWN",
    message: "처리 중 오류가 발생했습니다.",
  };
}

export const UNAUTHENTICATED: Extract<ActionResult, { ok: false }> = {
  ok: false,
  code: "UNAUTHENTICATED",
  message: "로그인이 필요합니다.",
};
