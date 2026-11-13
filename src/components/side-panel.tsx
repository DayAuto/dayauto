"use client";

import { Button } from "@/components/ui/button";
import {
  formatChunks,
  formatSlot,
  goalColor,
  shortGoalTitle,
} from "@/lib/format";
import type { MainGoal, MainProposal } from "@/server/services/main-data";

export interface SyncLogEntry {
  id: number;
  text: string;
}

export function ProposalCard({
  proposal,
  tz,
  busy,
  onAccept,
  onReallocate,
  onReject,
  onHover,
}: {
  proposal: MainProposal;
  tz: string;
  busy: boolean;
  onAccept: () => void;
  onReallocate: () => void;
  onReject: () => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm"
      onMouseEnter={() => onHover(proposal.id)}
      onMouseLeave={() => onHover(null)}
    >
      <h3 className="font-semibold">{proposal.title}</h3>
      <p className="text-muted-foreground">{proposal.reason}</p>
      <ul className="flex flex-col gap-1.5">
        {proposal.items.map((it) => (
          <li key={it.assignmentId} className="flex gap-2 text-xs">
            <span
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: goalColor(it.colorIndex) }}
            />
            <span>
              <span className="font-medium">
                [{shortGoalTitle(it.goalTitle)}]
              </span>{" "}
              {it.label}
              <br />
              <span className="text-muted-foreground">
                {formatSlot(it.fromStartIso, tz)} →{" "}
                {it.toStartIso
                  ? formatSlot(it.toStartIso, tz)
                  : "이번 주 배정 해제"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onAccept}>
          이대로 진행
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onReallocate}
        >
          다시 배분
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
          원래 일정대로
        </Button>
      </div>
    </article>
  );
}

export function GoalStatusList({ goals }: { goals: MainGoal[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {goals.map((g) => (
        <li key={g.id} className="rounded-xl border border-border p-3 text-xs">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: goalColor(g.colorIndex) }}
            />
            {g.title}
            <span className="ml-auto font-normal text-muted-foreground">
              D-{g.dDay}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
            <dt>잔여</dt>
            <dd className="text-right text-foreground">
              {formatChunks(g.remainingChunks)}
            </dd>
            <dt>이번 주 배정</dt>
            <dd className="text-right text-foreground">
              {formatChunks(g.weekChunks)}
            </dd>
            <dt>긴급도</dt>
            <dd className="text-right text-foreground">
              {g.urgency === null ? "-" : g.urgency.toFixed(1)}
            </dd>
            {g.unmetChunks > 0 && (
              <>
                <dt className="text-orange-600">이번 주 미배정</dt>
                <dd className="text-right text-orange-600">
                  {g.unmetChunks}청크
                </dd>
              </>
            )}
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function SyncLog({ entries }: { entries: SyncLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        아직 동기화 기록이 없습니다.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {entries.map((e) => (
        <li key={e.id} className="rounded-lg bg-muted px-2 py-1.5">
          {e.text}
        </li>
      ))}
    </ul>
  );
}
