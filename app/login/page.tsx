import { Suspense } from "react";
import { LoginForm } from "@/app/_components/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFEFF2] px-4 py-8">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
