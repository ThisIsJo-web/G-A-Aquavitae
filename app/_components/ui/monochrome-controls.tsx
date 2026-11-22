"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type ChipTone = "solid" | "soft" | "outline" | "green" | "yellow" | "red";

interface StatusChipProps {
  label: string;
  tone?: ChipTone;
  dot?: boolean;
}

export function StatusChip({
  label,
  tone = "soft",
  dot = false,
}: StatusChipProps) {
  const styles =
    tone === "solid"
      ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
      : tone === "outline"
        ? "bg-[var(--av-surface)] text-[var(--av-ink-secondary)] ring-1 ring-inset ring-[var(--av-border-strong)]"
        : tone === "green"
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-700/70"
          : tone === "yellow"
            ? "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-700/70"
            : tone === "red"
              ? "bg-red-100 text-red-900 ring-1 ring-inset ring-red-300 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-700/70"
              : "bg-[var(--av-surface-subtle)] text-[var(--av-ink)]";

  const dotStyle =
    tone === "solid"
      ? "bg-[var(--av-accent-ink)]"
      : tone === "outline"
        ? "bg-[var(--av-muted)]"
        : tone === "green"
          ? "bg-emerald-600 dark:bg-emerald-400"
          : tone === "yellow"
            ? "bg-amber-500 dark:bg-amber-400"
            : tone === "red"
              ? "bg-red-600 dark:bg-red-400"
              : "bg-[var(--av-ink)]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold leading-none ${styles}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotStyle}`} />}
      {label}
    </span>
  );
}

export interface RowActionItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: "default" | "muted";
}

interface RowActionMenuProps {
  actions: RowActionItem[];
  ariaLabel?: string;
}

export function RowActionMenu({
  actions,
  ariaLabel = "Row actions",
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  if (actions.length === 0) {
    return <span className="text-xs text-[var(--av-subtle)]">—</span>;
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[var(--av-muted)] transition hover:border-[var(--av-border-strong)] hover:bg-[var(--av-surface)] hover:text-[var(--av-ink)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-48 rounded-2xl border border-[var(--av-border-strong)] bg-[var(--av-surface)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.16)]"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-40 ${
                action.emphasis === "muted"
                  ? "text-[var(--av-muted)] hover:bg-[var(--av-surface-subtle)] hover:text-[var(--av-ink)]"
                  : "text-[var(--av-ink)] hover:bg-[var(--av-surface-subtle)]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-[var(--av-surface-subtle)] px-6 py-10 text-center">
      {icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--av-surface)] text-[var(--av-muted)] ring-1 ring-[var(--av-border)]">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-[var(--av-ink)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs font-normal text-[var(--av-muted)]">
          {description}
        </p>
      )}
    </div>
  );
}

export function NoticeBanner({
  tone = "error",
  message,
  onDismiss,
}: {
  tone?: "error" | "success" | "info";
  message: string;
  onDismiss?: () => void;
}) {
  const styles =
    tone === "error"
      ? "border-red-300 bg-red-100/90 text-red-950 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100"
      : tone === "success"
        ? "border-emerald-300 bg-emerald-100/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100"
        : "border-[var(--av-border-strong)] bg-[var(--av-surface-subtle)] text-[var(--av-ink)]";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium ${styles}`}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold underline opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
