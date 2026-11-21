"use client";

import { Droplets, Eye, EyeOff } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

interface AuthenticatedUser {
  id: string;
  email: string | null;
  role?: string | null;
  fullName?: string | null;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email") ?? "";
  const switchMode = searchParams.get("mode");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as {
        user?: AuthenticatedUser;
        error?: string;
      };

      if (!response.ok || !data.user) {
        setError(data.error ?? "Unable to sign in. Please try again.");
        return;
      }

      setPassword("");

      if (data.user.role === "superadmin") {
        router.replace("/superadmin/health");
        router.refresh();
        return;
      }

      if (data.user.role === "owner") {
        router.replace("/owner");
        router.refresh();
        return;
      }

      if (data.user.role === "cashier") {
        router.replace("/cashier");
        router.refresh();
        return;
      }

      setUser(data.user);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    setLoading(true);
    setError(null);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    } catch {
      setError("Failed to sign out.");
    } finally {
      setLoading(false);
    }
  }

  if (user) {
    return (
      <div className="w-full max-w-md rounded-[28px] border border-[#E8E8EC] bg-white p-8 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111111] text-white">
            <Droplets className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#111111]">
              Signed in
            </h1>
            <p className="text-xs font-normal text-[#71717A]">{user.email}</p>
          </div>
        </div>

        {user.role && (
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#F7F7F9] px-4 py-3 text-xs">
            <span className="font-semibold text-[#71717A]">Role</span>
            <span className="rounded-full bg-[#111111] px-3 py-1 font-semibold capitalize text-white">
              {user.role}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={loading}
          className="mt-6 w-full rounded-full border border-[#D4D4D8] bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[#F4F4F6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-[28px] border border-[#E8E8EC] bg-white p-8 shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
      <div className="mb-8 flex items-center gap-3.5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-white">
          <Droplets className="h-6 w-6" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            AquaVitae
          </h1>
          <p className="text-sm font-normal text-[#71717A]">
            Sign in to your station account
          </p>
        </div>
      </div>

      {switchMode === "owner-cashier" && (
        <div className="mb-5 rounded-2xl border border-[#E4E4E7] bg-[#F7F7F9] px-4 py-3 text-xs text-[#111111]">
          <span className="font-semibold">Cashier Account Switch:</span> Enter
          the password for your marked &ldquo;My Account&rdquo; Cashier login to
          open the Cashier Dashboard.
        </div>
      )}

      {switchMode === "return-owner" && (
        <div className="mb-5 rounded-2xl border border-[#E4E4E7] bg-[#F7F7F9] px-4 py-3 text-xs text-[#111111]">
          <span className="font-semibold">Owner Login:</span> Sign in with your
          Station Owner credentials to open the Owner Dashboard.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-xs font-semibold text-[#111111]"
          >
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@aquavitae.ph"
            className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-3 text-sm font-normal text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-2 block text-xs font-semibold text-[#111111]"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-4 py-3 pr-12 text-sm font-normal text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-3 my-auto flex h-8 w-8 items-center justify-center rounded-full text-[#71717A] transition hover:bg-[#EFEFF2] hover:text-[#111111]"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-2xl bg-[#111111] px-4 py-3 text-xs font-medium text-white"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-[#111111] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
