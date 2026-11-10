import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/server/db";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

const GOOGLE_SCOPE =
  "openid email profile https://www.googleapis.com/auth/calendar.events.readonly";

// 설정을 함수로 넘겨 처음 요청 시점에 DB 클라이언트를 만든다 (DATABASE_URL 없는 CI 빌드 대비).
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(getDb()),
  session: { strategy: "database" },
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPE,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    /**
     * 재로그인 시 Account 토큰 갱신 (06 문서 N-07).
     * Auth.js는 기존 계정으로 다시 로그인해도 DB의 Account를 갱신하지 않는다
     * (@auth/core handle-login.js: 기존 계정이면 세션만 생성). 그래서 [다시 로그인]으로
     * 만료된 refresh token이 복구되지 않는다. 로그인 응답의 새 토큰을 직접 저장한다.
     */
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.id) return;
      await getDb().account.updateMany({
        where: {
          userId: user.id,
          provider: "google",
          providerAccountId: account.providerAccountId,
        },
        data: {
          ...(account.access_token
            ? { access_token: account.access_token }
            : {}),
          ...(account.refresh_token
            ? { refresh_token: account.refresh_token }
            : {}),
          ...(account.expires_at ? { expires_at: account.expires_at } : {}),
          ...(account.scope ? { scope: account.scope } : {}),
          ...(account.id_token ? { id_token: account.id_token } : {}),
        },
      });
    },
  },
}));
