"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type ChipTone = "solid" | "soft" | "outline";

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
      ? "bg-[#111111] text-white"
      : tone === "outline"
        ? "bg-white text-[#52525B] ring-1 ring-inset ring-[#D4D4D8]"
        : "bg-[#EFEFF2] text-[#18181B]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold leading-none ${styles}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            tone === "solid"
              ? "bg-white"
              : tone === "outline"
                ? "bg-[#71717A]"
                : "bg-[#111111]"
          }`}
        />
      )}
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
    return <span className="text-xs text-[#A1A1AA]">—</span>;
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#52525B] transition hover:border-[#E4E4E7] hover:bg-white hover:text-[#111111]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-44 rounded-2xl border border-[#E4E4E7] bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.10)]"
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
                  ? "text-[#71717A] hover:bg-[#F4F4F6] hover:text-[#111111]"
                  : "text-[#111111] hover:bg-[#F4F4F6]"
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
    <div className="flex flex-col items-center justify-center rounded-2xl bg-[#F8F8FA] px-6 py-10 text-center">
      {icon && (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#71717A] ring-1 ring-[#E8E8EC]">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-[#111111]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs font-normal text-[#71717A]">
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
      ? "border-[#111111] bg-[#111111] text-white"
      : tone === "success"
        ? "border-[#D4D4D8] bg-white text-[#111111]"
        : "border-[#E4E4E7] bg-[#F4F4F6] text-[#111111]";

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
          className={`shrink-0 text-xs font-semibold underline ${
            tone === "error" ? "text-white/80 hover:text-white" : "text-[#52525B] hover:text-[#111111]"
          }`}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
