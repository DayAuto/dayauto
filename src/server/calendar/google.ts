import "server-only";
import type { GoogleEventItem } from "@/lib/google-events";
import type { Interval } from "@/server/engine/types";
import { getDb } from "@/server/db";
import { GoogleCalendarError } from "./errors";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIMEOUT_MS = 10_000;
/** 만료 직전 토큰을 미리 갱신하는 여유 (초) */
const EXPIRY_MARGIN_SEC = 60;

interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
}

async function loadTokens(
  userId: string,
): Promise<{ accountId: string; tokens: TokenSet }> {
  const account = await getDb().account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account?.access_token) {
    throw new GoogleCalendarError("AUTH_EXPIRED", "구글 연결 정보가 없습니다.");
  }
  return {
    accountId: account.id,
    tokens: {
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
    },
  };
}

/** refresh token으로 access token 갱신 후 Account 테이블에 반영 */
async function refreshAccessToken(
  accountId: string,
  tokens: TokenSet,
): Promise<TokenSet> {
  if (!tokens.refreshToken) {
    throw new GoogleCalendarError("AUTH_EXPIRED", "refresh token이 없습니다.");
  }
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      "토큰 갱신 요청에 실패했습니다.",
    );
  }
  if (res.status === 429 || res.status >= 500) {
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      `토큰 갱신 서버 오류(${res.status})`,
    );
  }
  if (!res.ok) {
    // invalid_grant 등: refresh token 만료·폐기
    throw new GoogleCalendarError(
      "AUTH_EXPIRED",
      `토큰 갱신 실패(${res.status})`,
    );
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const next: TokenSet = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? tokens.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + body.expires_in,
  };
  await getDb().account.update({
    where: { id: accountId },
    data: {
      access_token: next.accessToken,
      expires_at: next.expiresAt,
      ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}),
    },
  });
  return next;
}

interface EventsPage {
  items?: GoogleEventItem[];
  nextPageToken?: string;
}

/** 한 페이지 조회. 401이면 null(토큰 갱신 후 재시도 신호) */
async function fetchPage(
  accessToken: string,
  range: Interval,
  pageToken?: string,
): Promise<EventsPage | null> {
  const params = new URLSearchParams({
    timeMin: range.start.toISOString(),
    timeMax: range.end.toISOString(),
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
  });
  if (pageToken) params.set("pageToken", pageToken);

  let res: Response;
  try {
    res = await fetch(`${EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      "구글 캘린더 요청에 실패했습니다.",
    );
  }
  if (res.status === 401) return null;
  if (res.status === 403)
    throw new GoogleCalendarError(
      "AUTH_EXPIRED",
      "캘린더 접근 권한이 없습니다.",
    );
  if (res.status === 429 || res.status >= 500) {
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      `구글 캘린더 서버 오류(${res.status})`,
    );
  }
  if (!res.ok)
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      `구글 캘린더 응답 오류(${res.status})`,
    );
  return (await res.json()) as EventsPage;
}

/**
 * primary 캘린더의 range 안 일정 조회 (취소 포함, 반복 일정 전개).
 * 토큰 만료 시 갱신 후 1회 재시도한다.
 */
export async function listWeekEvents(
  userId: string,
  range: Interval,
): Promise<GoogleEventItem[]> {
  const loaded = await loadTokens(userId);
  let tokens = loaded.tokens;
  let refreshed = false;

  const refresh = async () => {
    tokens = await refreshAccessToken(loaded.accountId, tokens);
    refreshed = true;
  };

  if (
    tokens.expiresAt !== null &&
    tokens.expiresAt - EXPIRY_MARGIN_SEC <= Date.now() / 1000
  ) {
    await refresh();
  }

  const items: GoogleEventItem[] = [];
  let pageToken: string | undefined;
  do {
    let page = await fetchPage(tokens.accessToken, range, pageToken);
    if (page === null) {
      if (refreshed)
        throw new GoogleCalendarError(
          "AUTH_EXPIRED",
          "구글 인증이 거부되었습니다.",
        );
      await refresh();
      page = await fetchPage(tokens.accessToken, range, pageToken);
      if (page === null)
        throw new GoogleCalendarError(
          "AUTH_EXPIRED",
          "구글 인증이 거부되었습니다.",
        );
    }
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}
