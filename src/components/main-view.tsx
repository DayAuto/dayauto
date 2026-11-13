"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  GoalStatusList,
  ProposalCard,
  SyncLog,
  type SyncLogEntry,
} from "@/components/side-panel";
import { WeekCalendar, type CalWindow } from "@/components/week-calendar";
import { formatMonthDay, formatTime } from "@/lib/format";
import { loginWithGoogle, logout } from "@/server/actions/auth";
import {
  acceptProposalAction,
  reallocateProposalAction,
  rejectProposalAction,
} from "@/server/actions/proposals";
import { syncCalendarAction } from "@/server/actions/sync";
import type { ActionErrorCode } from "@/server/actions/types";
import type { MainData } from "@/server/services/main-data";
import type { ProposalOutcome } from "@/server/services/proposals";

const OUTCOME_MESSAGE: Record<ProposalOutcome, string> = {
  ACCEPTED: "주간표에 반영했습니다",
  REGENERATED: "그 사이 일정이 바뀌어 조정안을 새로 만들었습니다",
  OBSOLETE: "그 사이 일정이 바뀌어 더 이상 조정이 필요하지 않습니다",
  REPLACED: "다른 배분안으로 바꿨습니다",
  NO_ALTERNATIVE: "더 이상 다른 배분안이 없습니다",
  REJECTED: "기존 일정을 유지합니다",
};

export interface ServerError {
  code: ActionErrorCode;
  message: string;
}

export function MainView({
  data,
  windows,
  serverError,
}: {
  data: MainData;
  windows: CalWindow[];
  serverError: ServerError | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<ServerError | null>(serverError);
  const logSeq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const weekEnd = new Date(
    new Date(data.weekStartIso).getTime() + 6 * 86_400_000,
  ).toISOString();

  const sync = () =>
    startTransition(async () => {
      setError(null);
      const res = await syncCalendarAction();
      if (!res.ok) {
        setError({ code: res.code, message: res.message });
        return;
      }
      const s = res.summary;
      const text =
        `${formatTime(s.syncedAt, data.tz)} 새 일정 ${s.added}건 · 변경 ${s.updated}건 · 삭제 ${s.cancelled}건` +
        ` · 학습 일정과 겹침 ${s.conflicts}건 → 조정안 ${s.proposalsCreated}개`;
      logSeq.current += 1;
      setLog((prev) => [{ id: logSeq.current, text }, ...prev]);

      if (s.conflicts > 0) {
        setToast(
          `새 일정 ${s.added + s.updated}건, 학습 일정과 겹침 ${s.conflicts}건`,
        );
      } else if (s.cancelled > 0) {
        setToast(`일정 삭제가 감지되었습니다 (${s.cancelled}건)`);
      } else if (s.added + s.updated === 0) {
        setToast("변경된 일정이 없습니다");
      } else {
        setToast(
          `새 일정 ${s.added + s.updated}건 — 학습 일정과 겹치지 않습니다`,
        );
      }
      router.refresh();
    });

  const decide = (
    action: (id: string) => ReturnType<typeof acceptProposalAction>,
    id: string,
  ) =>
    startTransition(async () => {
      setError(null);
      const res = await action(id);
      if (!res.ok) {
        setError({ code: res.code, message: res.message });
        router.refresh();
        return;
      }
      setToast(OUTCOME_MESSAGE[res.data.outcome]);
      setHighlight(null);
      router.refresh();
    });

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold">DayAuto</h1>
        <span className="text-sm">
          {formatMonthDay(data.weekStartIso, data.tz)} –{" "}
          {formatMonthDay(weekEnd, data.tz)}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={sync} disabled={pending}>
            {pending ? "처리 중…" : "동기화"}
          </Button>
          <span className="text-xs text-muted-foreground">
            마지막 동기화{" "}
            {data.lastSyncedAtIso
              ? formatTime(data.lastSyncedAtIso, data.tz)
              : "-"}
          </span>
        </div>
        <nav className="ml-auto flex items-center gap-3 text-sm">
          <Link href="/setup/windows" className="underline">
            시간대 수정
          </Link>
          <Link href="/setup/goals" className="underline">
            목표 관리
          </Link>
          <form action={logout}>
            <Button type="submit" size="xs" variant="ghost">
              로그아웃
            </Button>
          </form>
        </nav>
      </header>

      {error && (
        <div className="flex items-center gap-3 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span>{error.message}</span>
          {error.code === "AUTH_EXPIRED" && (
            <form action={loginWithGoogle}>
              <Button type="submit" size="sm" variant="outline">
                다시 로그인
              </Button>
            </form>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-3">
          <WeekCalendar
            data={data}
            windows={windows}
            highlightProposalId={highlight}
          />
        </main>
        <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border p-4">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              조정안 ({data.proposals.length})
            </h2>
            {data.proposals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                대기 중인 조정안이 없습니다.
              </p>
            ) : (
              data.proposals.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  tz={data.tz}
                  busy={pending}
                  onHover={setHighlight}
                  onAccept={() => decide(acceptProposalAction, p.id)}
                  onReallocate={() => decide(reallocateProposalAction, p.id)}
                  onReject={() => decide(rejectProposalAction, p.id)}
                />
              ))
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">목표 현황</h2>
            <GoalStatusList goals={data.goals} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">동기화 기록</h2>
            <SyncLog entries={log} />
          </section>
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
