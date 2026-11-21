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
      className={`rounded-[24px] border p-6 transition ${
        highlighted
          ? "border-[#111111] bg-[#111111] text-white shadow-[0_12px_28px_rgba(17,17,17,0.16)]"
          : "border-[#E8E8EC] bg-white text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_rgba(0,0,0,0.025)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            highlighted
              ? "bg-white/15 text-white"
              : "bg-[#F3F3F5] text-[#111111]"
          }`}
        >
          {icon}
        </span>
        <span
          className={`text-xs font-semibold ${
            highlighted ? "text-white/70" : "text-[#71717A]"
          }`}
        >
          {label}
        </span>
      </div>

      <div className="mt-5 text-[28px] font-bold leading-none tracking-tight tabular-nums">
        {value}
      </div>

      {sublabel && (
        <p
          className={`mt-2 text-xs font-normal ${
            highlighted ? "text-white/65" : "text-[#71717A]"
          }`}
        >
          {sublabel}
        </p>
      )}
    </div>
  );
}
