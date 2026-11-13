"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { deleteGoalAction, registerGoalAction } from "@/server/actions/setup";
import type { ExamOption, GoalListItem } from "@/server/services/setup";

export function GoalsForm({
  exams,
  goals,
}: {
  exams: ExamOption[];
  goals: GoalListItem[];
}) {
  const router = useRouter();
  const [examId, setExamId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sessions = exams.find((e) => e.id === examId)?.sessions ?? [];

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    after?: () => void,
  ) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else {
        setMessage(res.message ?? "처리하지 못했습니다.");
      }
    });
  };

  const hours = (chunks: number) => `${Math.round((chunks / 4) * 10) / 10}시간`;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">목표 등록</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <NativeSelect
            aria-label="종목"
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value);
              setSessionId("");
            }}
          >
            <option value="">종목 선택</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="회차"
            value={sessionId}
            disabled={!examId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            <option value="">회차 선택</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            disabled={!examId || !sessionId || pending}
            onClick={() =>
              run(
                () => registerGoalAction(examId, sessionId),
                () => {
                  setExamId("");
                  setSessionId("");
                },
              )
            }
          >
            {pending ? "처리 중…" : "등록"}
          </Button>
        </div>
        {examId && sessions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            등록할 수 있는 미래 회차가 없습니다.
          </p>
        )}
        {message && <p className="text-sm text-destructive">{message}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">등록된 목표</h2>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 등록된 목표가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {goals.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{g.title}</div>
                  <div className="text-muted-foreground">
                    {g.examDate} (D-{g.dDay}) · 태스크 {g.taskCount}개 · 총{" "}
                    {hours(g.totalChunks)}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `'${g.title}' 목표를 삭제할까요? 배정된 학습 일정도 함께 삭제됩니다.`,
                      )
                    ) {
                      run(() => deleteGoalAction(g.id));
                    }
                  }}
                >
                  삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
