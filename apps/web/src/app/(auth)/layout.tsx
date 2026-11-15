// Full-screen pages without the app shell: sign-in, password reset and
// first-time setup. One narrow column, phone first.
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    // Room above and below as well as the phone's notch and home bar (pt-safe on its own would replace the padding).
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+2.5rem)] md:pt-[calc(env(safe-area-inset-top)+4rem)] md:pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      <div className="flex items-center gap-3">
        <img src="/icon/96" alt="" width={48} height={48} className="size-12 rounded-xl" />
        <div>
          <p className="text-3xl font-bold tracking-tight">Grid</p>
          <p className="text-sm text-muted-foreground">One Grid. Built Block by Block.</p>
        </div>
      </div>
      {children}
    </main>
  );
}
