import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { loginWithGoogle } from "@/server/actions/auth";

export default async function LoginPage() {
  if ((await auth())?.user?.id) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">DayAuto</h1>
      <p className="text-muted-foreground">
        일정이 바뀌어도 학습 계획이 알아서 따라옵니다.
      </p>
      <form action={loginWithGoogle}>
        <Button type="submit" size="lg">
          Google로 시작하기
        </Button>
      </form>
    </main>
  );
}
