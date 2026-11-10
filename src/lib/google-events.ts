import { localToUtc } from "@/server/engine/time";
import type { FetchedEvent } from "@/server/engine/types";

/** Google Calendar events.list 응답 항목 중 쓰는 필드만 */
export interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  transparency?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  updated?: string;
}

/**
 * 구글 이벤트 → 엔진 입력 (04 문서 §5.1).
 * 취소된 일정은 시간 정보가 없을 수 있어 epoch로 채운다(diff에서 저장된 값을 쓴다).
 * 시작·종료가 없는 비취소 일정은 null.
 */
export function toFetchedEvent(
  item: GoogleEventItem,
  tz: string,
): FetchedEvent | null {
  const cancelled = item.status === "cancelled";
  const isAllDay = Boolean(item.start?.date);

  const toDate = (p: GoogleEventItem["start"]): Date | null => {
    if (p?.dateTime) return new Date(p.dateTime);
    if (p?.date) return localToUtc(p.date, 0, tz);
    return null;
  };
  const startAt = toDate(item.start);
  const endAt = toDate(item.end);
  if (!cancelled && (!startAt || !endAt)) return null;

  const self = item.attendees?.find((a) => a.self);
  const isBusy =
    item.transparency !== "transparent" && self?.responseStatus !== "declined";

  return {
    googleEventId: item.id,
    title: item.summary ?? "(제목 없음)",
    startAt: startAt ?? new Date(0),
    endAt: endAt ?? new Date(0),
    isAllDay,
    isBusy,
    googleUpdatedAt: item.updated ? new Date(item.updated) : new Date(0),
    cancelled,
  };
}
