"use client";

import { useState } from "react";

export interface MonochromeBarDatum {
  label: string;
  primary: number;
  secondary: number;
}

interface MonochromeBarChartProps {
  title: string;
  subtitle?: string;
  primaryLabel: string;
  secondaryLabel: string;
  data: MonochromeBarDatum[];
  formatValue?: (val: number) => string;
}

export function MonochromeBarChart({
  title,
  subtitle,
  primaryLabel,
  secondaryLabel,
  data,
  formatValue = (v) => String(v),
}: MonochromeBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.primary, d.secondary])
  );

  return (
    <div className="av-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold tracking-tight text-[#111111]">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs font-normal text-[#71717A]">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold text-[#52525B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#111111]" />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#E4E4E7]" />
            {secondaryLabel}
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="mt-6 flex h-52 items-center justify-center rounded-2xl bg-[#F8F8FA] text-xs font-medium text-[#71717A]">
          No chart data available yet.
        </div>
      ) : (
        <div className="relative mt-6">
          {/* Subtle Horizontal Gridlines */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 flex h-48 flex-col justify-between"
          >
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="w-full border-b border-dashed border-[#ECECEF]"
              />
            ))}
          </div>

          {/* Bars */}
          <div className="relative flex h-56 items-end justify-between gap-2 pt-4">
            {data.map((item, idx) => {
              const pHeight = Math.max(4, Math.round((item.primary / maxVal) * 100));
              const sHeight = Math.max(
                4,
                Math.round((item.secondary / maxVal) * 100)
              );
              const isHovered = hoveredIndex === idx;

              return (
                <div
                  key={item.label}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(idx)}
                  onBlur={() => setHoveredIndex(null)}
                  tabIndex={0}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
                >
                  {/* Floating Solid Black Tooltip Bubble */}
                  {isHovered && (
                    <div className="pointer-events-none absolute -top-2 z-20 -translate-y-full whitespace-nowrap rounded-2xl bg-[#111111] px-3.5 py-2.5 text-left text-[11px] text-white shadow-[0_12px_28px_rgba(17,17,17,0.22)]">
                      <div className="font-bold text-white">{item.label}</div>
                      <div className="mt-1 flex items-center justify-between gap-4 text-white/80">
                        <span>{primaryLabel}</span>
                        <span className="font-bold tabular-nums text-white">
                          {formatValue(item.primary)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-white/65">
                        <span>{secondaryLabel}</span>
                        <span className="font-semibold tabular-nums text-white/90">
                          {formatValue(item.secondary)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex h-44 w-full max-w-[44px] items-end justify-center gap-1.5">
                    <div
                      className={`w-1/2 rounded-t-lg transition-all duration-200 ${
                        isHovered ? "bg-black" : "bg-[#111111]"
                      }`}
                      style={{ height: `${pHeight}%` }}
                    />
                    <div
                      className={`w-1/2 rounded-t-lg transition-all duration-200 ${
                        isHovered ? "bg-[#D4D4D8]" : "bg-[#E4E4E7]"
                      }`}
                      style={{ height: `${sHeight}%` }}
                    />
                  </div>

                  <span
                    className={`mt-2.5 truncate text-[11px] font-medium ${
                      isHovered ? "font-semibold text-[#111111]" : "text-[#71717A]"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
