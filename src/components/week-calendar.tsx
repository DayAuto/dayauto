"use client";

import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  dateFnsLocalizer,
  type EventProps,
} from "react-big-calendar";
import { formatTime, goalColor, shortGoalTitle } from "@/lib/format";
import {
  KIND_LABEL,
  type SlotTypeValue,
  type WindowKindValue,
} from "@/lib/windows";
import type { MainData } from "@/server/services/main-data";

/** 사용자 생활 시간대 (표시 범위 계산·마이크로 묶음용). 분은 사용자 타임존 기준 자정부터. */
export interface CalWindow {
  id: string;
  kind: WindowKindValue;
  startMinute: number;
  endMinute: number;
  slotType: SlotTypeValue;
  weekdays: number[];
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales: { ko },
});

/** 1시간 높이(px). 요구 범위 48~56 */
const PX_PER_HOUR = 52;
const MARGIN_MIN = 30;
const EXTERNAL_COLOR = "#d1d5db";
const CONFLICT_COLOR = "#dc2626";

interface GroupItem {
  id: string;
  label: string; // "[목표] 단원"
  detail: string; // "[목표] 과목 · 단원 · 시작~종료"
  conflicting: boolean;
}

interface CalEvent {
  id: string;
  kind: "external" | "focus" | "micro-group" | "ghost";
  title: string;
  start: Date;
  end: Date;
  colorIndex: number;
  conflicting?: boolean;
  done?: boolean;
  proposalId?: string;
  /** 시간 범위 문구 (팝오버용) */
  timeText: string;
  items?: GroupItem[];
}

// ---------- 시간 유틸 ----------

interface LocalInfo {
  dateKey: string;
  dow: number;
  minute: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 사용자 타임존 기준 날짜·요일·자정부터의 분 */
function localInfo(iso: string, tz: string): LocalInfo {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const m: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) m[p.type] = p.value;
  return {
    dateKey: `${m.year}-${m.month}-${m.day}`,
    dow: WEEKDAY_INDEX[m.weekday] ?? 0,
    minute: Number(m.hour) * 60 + Number(m.minute),
  };
}

/** 배정이 속한 생활 시간대를 찾는다. 없으면 null */
function findWindow(
  windows: CalWindow[],
  info: LocalInfo,
  durationMin: number,
): CalWindow | null {
  const endMinute = info.minute + durationMin;
  return (
    windows.find(
      (w) =>
        w.weekdays.includes(info.dow) &&
        info.minute >= w.startMinute &&
        endMinute <= w.endMinute,
    ) ?? null
  );
}

const floorTo = (m: number, unit: number) => Math.floor(m / unit) * unit;
const ceilTo = (m: number, unit: number) => Math.ceil(m / unit) * unit;

/** 표시 시간 범위(분). 생활 시간대 ±30분, 외부 일정 등이 벗어나면 넓힘 */
function displayRange(
  windows: CalWindow[],
  events: CalEvent[],
): { minMinute: number; maxMinute: number } {
  let lo = 6 * 60;
  let hi = 24 * 60;
  if (windows.length > 0) {
    lo = Math.min(...windows.map((w) => w.startMinute)) - MARGIN_MIN;
    hi = Math.max(...windows.map((w) => w.endMinute)) + MARGIN_MIN;
  }
  for (const e of events) {
    const dayStart = new Date(
      e.start.getFullYear(),
      e.start.getMonth(),
      e.start.getDate(),
    );
    const startMin = (e.start.getTime() - dayStart.getTime()) / 60_000;
    const endMin = (e.end.getTime() - dayStart.getTime()) / 60_000;
    lo = Math.min(lo, floorTo(startMin, MARGIN_MIN));
    if (endMin > 1440) {
      // 자정을 넘기면 다음 날 0시부터 이어서 그려진다
      hi = 1440;
      lo = 0;
    } else {
      hi = Math.max(hi, ceilTo(endMin, MARGIN_MIN));
    }
  }
  return {
    minMinute: Math.max(0, floorTo(lo, MARGIN_MIN)),
    maxMinute: Math.min(1440, ceilTo(hi, MARGIN_MIN)),
  };
}

const minuteToDate = (m: number) =>
  m >= 1440
    ? new Date(1970, 0, 1, 23, 59, 59, 999)
    : new Date(1970, 0, 1, Math.floor(m / 60), m % 60);

// ---------- 팝오버 ----------

interface PopPos {
  left: number;
  top: number;
}

/** 마우스를 올리면 열리고, 클릭하면 고정(바깥 클릭·Esc로 닫힘)되는 안내 팝오버 */
function Pop({ pop, children }: { pop: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<PopPos | null>(null);
  const open = (hover || pinned) && pos !== null;

  const measure = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 320;
    let left = rect.right + 8;
    if (left + width > window.innerWidth - 8) left = rect.left - width - 8;
    left = Math.max(8, left);
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 220));
    setPos({ left, top });
  };

  useEffect(() => {
    if (!pinned) return;
    const onDown = (ev: PointerEvent) => {
      if (ref.current && ev.target instanceof Node) {
        if (ref.current.contains(ev.target)) return;
      }
      setPinned(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <div
      ref={ref}
      className="h-full"
      onMouseEnter={() => {
        measure();
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        measure();
        setPinned((p) => !p);
      }}
    >
      {children}
      {open &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 max-h-[70vh] w-80 overflow-hidden rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
            style={{ left: pos.left, top: pos.top }}
          >
            {pop}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------- 이벤트 렌더 ----------

function ConflictBadge() {
  return (
    <span className="shrink-0 rounded bg-red-600 px-1 text-[10px] font-semibold text-white">
      겹침
    </span>
  );
}

function EventView({ event }: EventProps<CalEvent>) {
  if (event.kind === "micro-group") {
    const items = event.items ?? [];
    const heightPx =
      ((event.end.getTime() - event.start.getTime()) / 3_600_000) * PX_PER_HOUR;
    // 제목 한 줄(약 15px) 아래에 항목 줄(약 13px)이 들어갈 수 있는 만큼만 나열
    const fit = Math.max(0, Math.floor((heightPx - 4 - 15) / 13));
    // 제목에 건수가 있으므로 들어가는 만큼만 나열한다 (나머지는 팝오버)
    const shown = items.slice(0, fit);
    return (
      <Pop
        pop={
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">
              {event.title}
              <span className="ml-1 font-normal text-muted-foreground">
                {event.timeText}
              </span>
            </p>
            <ul className="flex flex-col gap-1">
              {items.map((it) => (
                <li key={it.id} className="flex items-start gap-1">
                  <span className="min-w-0 flex-1 break-words">
                    {it.detail}
                  </span>
                  {it.conflicting && <ConflictBadge />}
                </li>
              ))}
            </ul>
          </div>
        }
      >
        <div className="flex h-full flex-col overflow-hidden text-[11px] leading-[13px]">
          <div className="flex items-center gap-1">
            {event.conflicting && <ConflictBadge />}
            <span className="truncate font-semibold">{event.title}</span>
          </div>
          {shown.map((it) => (
            <span
              key={it.id}
              className={`truncate ${it.conflicting ? "font-semibold text-red-700" : ""}`}
            >
              {it.label}
            </span>
          ))}
        </div>
      </Pop>
    );
  }

  return (
    <Pop
      pop={
        <div className="flex flex-col gap-1">
          <p className="break-words font-semibold">{event.title}</p>
          <p className="text-muted-foreground">{event.timeText}</p>
          {event.kind === "ghost" && <p>조정안 미리보기</p>}
          {event.conflicting && (
            <p className="font-semibold text-red-600">외부 일정과 겹칩니다</p>
          )}
        </div>
      }
    >
      <div className="flex h-full items-center gap-1 overflow-hidden text-[11px] leading-tight">
        {event.kind === "ghost" && (
          <span className="shrink-0 rounded px-1 text-[10px] font-semibold">
            제안
          </span>
        )}
        {event.conflicting && <ConflictBadge />}
        <span className="truncate font-medium">{event.title}</span>
      </div>
    </Pop>
  );
}

// ---------- 범례 ----------

function Legend({ goals }: { goals: MainData["goals"] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {goals.map((g) => (
          <span key={g.id} className="flex items-center gap-1">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: goalColor(g.colorIndex) }}
            />
            {shortGoalTitle(g.title)}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{
            backgroundColor: "#6b728033",
            borderLeft: "4px solid #6b7280",
          }}
        />
        마이크로(연한 색)
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ backgroundColor: "#4b5563" }}
        />
        집중(진한 색)
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ backgroundColor: EXTERNAL_COLOR }}
        />
        외부 일정
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-5 rounded-sm"
          style={{ border: "2px dashed #6b7280" }}
        />
        조정안 미리보기
      </span>
      <span className="flex items-center gap-1">
        <span
          className="inline-block h-3 w-5 rounded-sm bg-white"
          style={{ border: `2px solid ${CONFLICT_COLOR}` }}
        />
        외부 일정과 겹침
      </span>
    </div>
  );
}

// ---------- 본체 ----------

export function WeekCalendar({
  data,
  windows,
  highlightProposalId,
}: {
  data: MainData;
  windows: CalWindow[];
  highlightProposalId: string | null;
}) {
  const events = useMemo<CalEvent[]>(() => {
    const tz = data.tz;
    const range = (startIso: string, endIso: string) =>
      `${formatTime(startIso, tz)}~${formatTime(endIso, tz)}`;
    const out: CalEvent[] = [];

    for (const e of data.events) {
      out.push({
        id: `ext-${e.id}`,
        kind: "external",
        title: e.title,
        start: new Date(e.startIso),
        end: new Date(e.endIso),
        colorIndex: 0,
        timeText: range(e.startIso, e.endIso),
      });
    }

    // 집중 배정은 개별 블록, 마이크로는 같은 날짜·같은 시간대 안에서 이어지는 것끼리 묶는다 (화면 전용)
    const microBuckets = new Map<string, typeof data.assignments>();
    for (const a of data.assignments) {
      if (a.slotType === "FOCUS") {
        out.push({
          id: `asg-${a.id}`,
          kind: "focus",
          title: `[${shortGoalTitle(a.goalTitle)}] ${a.unitName}`,
          start: new Date(a.startIso),
          end: new Date(a.endIso),
          colorIndex: a.colorIndex,
          conflicting: a.conflicting,
          done: a.status === "DONE",
          timeText: range(a.startIso, a.endIso),
        });
        continue;
      }
      const info = localInfo(a.startIso, tz);
      const dur =
        (new Date(a.endIso).getTime() - new Date(a.startIso).getTime()) /
        60_000;
      const w = findWindow(windows, info, dur);
      const key = `${info.dateKey}|${w?.id ?? "none"}`;
      const list = microBuckets.get(key);
      if (list) list.push(a);
      else microBuckets.set(key, [a]);
    }

    for (const [key, list] of microBuckets) {
      const windowId = key.split("|")[1];
      const w = windows.find((x) => x.id === windowId);
      const name = w ? KIND_LABEL[w.kind] : "마이크로";
      const sorted = [...list].sort((x, y) =>
        x.startIso.localeCompare(y.startIso),
      );
      // 시간이 끊기면 별도 묶음
      const runs: (typeof sorted)[] = [];
      let runEnd = -Infinity;
      for (const a of sorted) {
        const s = new Date(a.startIso).getTime();
        const e = new Date(a.endIso).getTime();
        if (runs.length > 0 && s <= runEnd) {
          runs[runs.length - 1].push(a);
          runEnd = Math.max(runEnd, e);
        } else {
          runs.push([a]);
          runEnd = e;
        }
      }
      for (const run of runs) {
        const startIso = run[0].startIso;
        const endIso = run.reduce(
          (m, a) => (a.endIso > m ? a.endIso : m),
          run[0].endIso,
        );
        out.push({
          id: `grp-${run[0].id}`,
          kind: "micro-group",
          title: `${name} · 학습 ${run.length}건`,
          start: new Date(startIso),
          end: new Date(endIso),
          colorIndex: run[0].colorIndex,
          conflicting: run.some((a) => a.conflicting),
          done: run.every((a) => a.status === "DONE"),
          timeText: range(startIso, endIso),
          items: run.map((a) => ({
            id: a.id,
            label: `[${shortGoalTitle(a.goalTitle)}] ${a.unitName}`,
            detail: `[${shortGoalTitle(a.goalTitle)}] ${a.subject} · ${a.unitName} · ${range(a.startIso, a.endIso)}`,
            conflicting: a.conflicting,
          })),
        });
      }
    }

    // 조정안 미리보기: 묶지 않고 항목 단위 고스트 블록
    for (const p of data.proposals) {
      for (const it of p.items) {
        if (!it.toStartIso || !it.toEndIso) continue;
        out.push({
          id: `ghost-${p.id}-${it.assignmentId}`,
          kind: "ghost",
          title: `[${shortGoalTitle(it.goalTitle)}] ${it.label}`,
          start: new Date(it.toStartIso),
          end: new Date(it.toEndIso),
          colorIndex: it.colorIndex,
          proposalId: p.id,
          timeText: range(it.toStartIso, it.toEndIso),
        });
      }
    }
    return out;
  }, [data, windows]);

  const { minMinute, maxMinute } = useMemo(
    () => displayRange(windows, events),
    [windows, events],
  );
  const hours = (maxMinute - minMinute) / 60;

  return (
    <div>
      <Legend goals={data.goals} />
      <div
        className="week-cal"
        style={{ height: Math.round(hours * PX_PER_HOUR) + 72 }}
      >
        <Calendar<CalEvent>
          localizer={localizer}
          culture="ko"
          events={events}
          date={new Date(data.weekStartIso)}
          view="week"
          views={["week"]}
          onNavigate={() => {}}
          onView={() => {}}
          toolbar={false}
          selectable={false}
          dayLayoutAlgorithm="no-overlap"
          step={15}
          timeslots={2}
          min={minuteToDate(minMinute)}
          max={minuteToDate(maxMinute)}
          scrollToTime={minuteToDate(minMinute)}
          getNow={() => new Date(data.nowIso)}
          formats={{
            dayFormat: (d, culture, l) =>
              l?.format(d, "M/d(EEE)", culture) ?? "",
            timeGutterFormat: (d, culture, l) =>
              l?.format(d, "HH:mm", culture) ?? "",
            eventTimeRangeFormat: () => "",
          }}
          components={{ event: EventView }}
          titleAccessor="title"
          tooltipAccessor={() => ""}
          eventPropGetter={(e) => {
            const color = goalColor(e.colorIndex);
            const conflictRing = e.conflicting
              ? { outline: `2px solid ${CONFLICT_COLOR}`, outlineOffset: -2 }
              : {};
            if (e.kind === "external") {
              return {
                style: {
                  backgroundColor: EXTERNAL_COLOR,
                  color: "#374151",
                  border: "none",
                },
              };
            }
            if (e.kind === "ghost") {
              const hot = e.proposalId === highlightProposalId;
              return {
                style: {
                  backgroundColor: hot ? `${color}55` : `${color}1f`,
                  color,
                  border: `2px dashed ${color}`,
                  boxShadow: hot ? `0 0 0 2px ${color}` : undefined,
                  zIndex: hot ? 5 : undefined,
                },
              };
            }
            if (e.kind === "micro-group") {
              return {
                style: {
                  backgroundColor: `${color}26`,
                  color: "#1f2937",
                  border: "none",
                  borderLeft: `5px solid ${color}`,
                  opacity: e.done ? 0.6 : 1,
                  ...conflictRing,
                },
              };
            }
            return {
              style: {
                backgroundColor: color,
                color: "#fff",
                border: "none",
                opacity: e.done ? 0.6 : 1,
                ...conflictRing,
              },
            };
          }}
        />
      </div>
    </div>
  );
}
