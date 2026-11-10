import { describe, expect, it } from "vitest";
import { toFetchedEvent } from "./google-events";

const TZ = "Asia/Seoul";

describe("toFetchedEvent (04 문서 §5.1)", () => {
  it("시간 지정 일정", () => {
    const e = toFetchedEvent(
      {
        id: "a",
        summary: "팀 회식",
        start: { dateTime: "2026-11-30T19:00:00+09:00" },
        end: { dateTime: "2026-11-30T23:00:00+09:00" },
        updated: "2026-11-30T00:10:00.000Z",
      },
      TZ,
    )!;
    expect(e).toMatchObject({
      googleEventId: "a",
      title: "팀 회식",
      isAllDay: false,
      isBusy: true,
      cancelled: false,
    });
    expect(e.startAt.toISOString()).toBe("2026-11-30T10:00:00.000Z");
  });

  it("종일 일정은 사용자 타임존 자정으로", () => {
    const e = toFetchedEvent(
      { id: "b", start: { date: "2026-12-01" }, end: { date: "2026-12-02" } },
      TZ,
    )!;
    expect(e.isAllDay).toBe(true);
    expect(e.startAt.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(e.endAt.toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(e.title).toBe("(제목 없음)");
  });

  it("한가함·거절한 일정은 바쁨이 아니다", () => {
    const base = {
      id: "c",
      start: { dateTime: "2026-12-01T10:00:00+09:00" },
      end: { dateTime: "2026-12-01T11:00:00+09:00" },
    };
    expect(
      toFetchedEvent({ ...base, transparency: "transparent" }, TZ)!.isBusy,
    ).toBe(false);
    expect(
      toFetchedEvent(
        { ...base, attendees: [{ self: true, responseStatus: "declined" }] },
        TZ,
      )!.isBusy,
    ).toBe(false);
    expect(
      toFetchedEvent(
        { ...base, attendees: [{ self: false, responseStatus: "declined" }] },
        TZ,
      )!.isBusy,
    ).toBe(true);
  });

  it("취소 일정은 시간 정보가 없어도 변환된다", () => {
    const e = toFetchedEvent({ id: "d", status: "cancelled" }, TZ)!;
    expect(e.cancelled).toBe(true);
  });

  it("시간 정보 없는 비취소 일정은 null", () => {
    expect(toFetchedEvent({ id: "e" }, TZ)).toBeNull();
  });
});
