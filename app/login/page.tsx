import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/app/_components/login-form";

export const metadata: Metadata = {
  title: "Sign In | G & A Aqua Vitae",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--av-backdrop)] px-4 py-8">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
