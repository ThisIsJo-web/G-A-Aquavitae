"use client";

import type { ReactNode } from "react";

interface QuickStatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: ReactNode;
  highlighted?: boolean;
}

export function QuickStatCard({
  label,
  value,
  sublabel,
  icon,
  highlighted = false,
}: QuickStatCardProps) {
  return (
    <div
      className={`flex min-w-0 flex-col justify-between rounded-[22px] border p-4 transition sm:rounded-[24px] sm:p-5 2xl:p-6 ${
        highlighted
          ? "border-[var(--av-accent)] bg-[var(--av-accent)] text-[var(--av-accent-ink)] shadow-[0_12px_28px_rgba(20,18,14,0.16)]"
          : "border-[var(--av-border)] bg-[var(--av-surface)] text-[var(--av-ink)] shadow-[0_1px_2px_rgba(20,18,14,0.04),0_8px_24px_rgba(20,18,14,0.03)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 ${
            highlighted
              ? "bg-[var(--av-blue)] text-white shadow-[0_4px_12px_rgba(37,99,235,0.28)]"
              : "bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)] ring-1 ring-[var(--av-blue-border)]"
          }`}
        >
          {icon}
        </span>
        <span
          className={`min-w-0 truncate text-right text-xs font-semibold ${
            highlighted ? "opacity-75" : "text-[var(--av-muted)]"
          }`}
        >
          {label}
        </span>
      </div>

      <div className="mt-4 break-words text-2xl font-bold leading-tight tracking-tight tabular-nums sm:mt-5 sm:text-[26px] 2xl:text-[28px]">
        {value}
      </div>

      {sublabel && (
        <p
          className={`mt-1.5 break-words text-xs font-normal leading-relaxed sm:mt-2 ${
            highlighted ? "opacity-70" : "text-[var(--av-muted)]"
          }`}
        >
          {sublabel}
        </p>
      )}
    </div>
  );
}
