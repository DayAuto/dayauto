import "server-only";

export type CalendarErrorCode =
  /** 토큰 갱신 실패·401/403: 다시 로그인 필요 */
  | "AUTH_EXPIRED"
  /** 429/5xx/타임아웃/네트워크: 잠시 후 재시도 */
  | "UNAVAILABLE";

export class GoogleCalendarError extends Error {
  constructor(
    readonly code: CalendarErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}
