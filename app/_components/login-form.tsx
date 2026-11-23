"use client";

import { Droplets, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ThemeToggleButton } from "@/app/_components/theme-provider";

interface AuthenticatedUser {
  id: string;
  email: string | null;
  role?: string | null;
  fullName?: string | null;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email: email.trim(), password }),
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
      setError("Connection error. Please try again.");
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
      <div className="av-card w-full max-w-md p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)] ring-1 ring-[var(--av-blue-border)]">
              <Droplets className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--av-ink)]">
                Signed in
              </h1>
              <p className="text-xs font-normal text-[var(--av-muted)]">
                {user.email}
              </p>
            </div>
          </div>
          <ThemeToggleButton compact />
        </div>

        {user.role && (
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs">
            <span className="font-semibold text-[var(--av-muted)]">Role</span>
            <span className="rounded-full bg-[var(--av-accent)] px-3 py-1 font-semibold capitalize text-[var(--av-accent-ink)]">
              {user.role}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={loading}
          className="av-btn-outline mt-6 w-full rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing out..." : "Sign out"}
        </button>
      </div>
    );
  }

  return (
    <div className="av-card w-full max-w-md overflow-hidden p-0">
      <div aria-hidden="true" className="av-top-accent" />
      <div className="p-8">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)] ring-1 ring-[var(--av-blue-border)]">
              <Droplets className="h-6 w-6" strokeWidth={2} />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--av-ink)]">
                G &amp; A Aqua Vitae
              </h1>
              <p className="text-sm font-normal text-[var(--av-muted)]">
                Sign in to your station account
              </p>
            </div>
          </div>
          <ThemeToggleButton compact />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-xs font-semibold text-[var(--av-ink)]"
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
              className="av-input w-full rounded-2xl px-4 py-3 text-sm font-normal"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-xs font-semibold text-[var(--av-ink)]"
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
                className="av-input w-full rounded-2xl px-4 py-3 pr-12 text-sm font-normal"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-3 my-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--av-muted)] transition hover:bg-[var(--av-surface-hover)] hover:text-[var(--av-ink)]"
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
              className="rounded-2xl bg-[var(--av-accent)] px-4 py-3 text-xs font-medium text-[var(--av-accent-ink)]"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="av-btn-primary w-full rounded-full px-5 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
