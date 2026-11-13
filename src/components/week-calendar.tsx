"use client";

import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { useMemo } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type EventProps,
} from "react-big-calendar";
import { formatChunks, goalColor, shortGoalTitle } from "@/lib/format";
import type { MainData } from "@/server/services/main-data";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (d: Date) => startOfWeek(d, { weekStartsOn: 1 }),
  getDay,
  locales: { ko },
});

interface CalEvent {
  id: string;
  kind: "external" | "assignment" | "ghost";
  title: string;
  start: Date;
  end: Date;
  colorIndex: number;
  slotType?: "MICRO" | "FOCUS";
  conflicting?: boolean;
  done?: boolean;
  proposalId?: string;
}

const MIN_TIME = new Date(1970, 0, 1, 6, 0);
const MAX_TIME = new Date(1970, 0, 1, 23, 59, 59);
const SCROLL_TO = new Date(1970, 0, 1, 7, 0);

function EventView({ event }: EventProps<CalEvent>) {
  return (
    <div className="flex h-full flex-col overflow-hidden text-[11px] leading-tight">
      <div className="flex flex-wrap items-center gap-1">
        {event.kind === "assignment" && event.slotType && (
          <span className="rounded bg-white/25 px-1 text-[10px]">
            {event.slotType === "FOCUS" ? "집중" : "마이크로"}
          </span>
        )}
        {event.kind === "ghost" && (
          <span className="rounded px-1 text-[10px] font-semibold">제안</span>
        )}
        {event.conflicting && (
          <span className="rounded bg-red-600 px-1 text-[10px] font-semibold text-white">
            겹침
          </span>
        )}
      </div>
      <span className="font-medium">{event.title}</span>
    </div>
  );
}

export function WeekCalendar({
  data,
  highlightProposalId,
}: {
  data: MainData;
  highlightProposalId: string | null;
}) {
  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    for (const e of data.events) {
      out.push({
        id: `ext-${e.id}`,
        kind: "external",
        title: e.title,
        start: new Date(e.startIso),
        end: new Date(e.endIso),
        colorIndex: 0,
      });
    }
    for (const a of data.assignments) {
      out.push({
        id: `asg-${a.id}`,
        kind: "assignment",
        title: `[${shortGoalTitle(a.goalTitle)}] ${a.unitName} · ${formatChunks(a.chunkCount)}`,
        start: new Date(a.startIso),
        end: new Date(a.endIso),
        colorIndex: a.colorIndex,
        slotType: a.slotType,
        conflicting: a.conflicting,
        done: a.status === "DONE",
      });
    }
    // 조정안 미리보기: 목표 시간에 점선 고스트 블록
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
          slotType: it.slotType,
          proposalId: p.id,
        });
      }
    }
    return out;
  }, [data]);

  return (
    <div className="h-full min-h-[640px]">
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
        step={15}
        timeslots={4}
        min={MIN_TIME}
        max={MAX_TIME}
        scrollToTime={SCROLL_TO}
        getNow={() => new Date(data.nowIso)}
        formats={{
          dayFormat: (d, culture, l) => l?.format(d, "M/d(EEE)", culture) ?? "",
          timeGutterFormat: (d, culture, l) =>
            l?.format(d, "HH:mm", culture) ?? "",
          eventTimeRangeFormat: () => "",
        }}
        components={{ event: EventView }}
        titleAccessor="title"
        tooltipAccessor={(e) => e.title}
        eventPropGetter={(e) => {
          const color = goalColor(e.colorIndex);
          if (e.kind === "external") {
            return {
              style: {
                backgroundColor: "#d1d5db",
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
          return {
            style: {
              backgroundColor: color,
              color: "#fff",
              border: e.conflicting ? "2px solid #dc2626" : "none",
              opacity: e.done ? 0.6 : 1,
            },
          };
        }}
      />
    </div>
  );
}
