import { Suspense } from "react";
import { LoginForm } from "@/app/_components/login-form";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--av-backdrop)] px-4 py-8">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
