"use client";

import { useState } from "react";

export interface MonochromeBarDatum {
  label: string;
  tooltipLabel?: string;
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

  const hasAnyValue = data.some((d) => d.primary > 0 || d.secondary > 0);
  const maxVal = Math.max(
    1,
    ...data.flatMap((d) => [d.primary, d.secondary])
  );
  const isDense = data.length > 7;

  return (
    <div className="av-card min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs font-normal text-[var(--av-muted)]">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs font-semibold text-[var(--av-ink-secondary)] sm:gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--av-accent)]" />
            {primaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--av-bar-secondary)]" />
            {secondaryLabel}
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="mt-5 flex h-48 items-center justify-center rounded-2xl bg-[var(--av-surface-subtle)] text-xs font-medium text-[var(--av-muted)] sm:mt-6 sm:h-52">
          No chart data available yet.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto pb-1 sm:mt-6 sm:overflow-visible sm:pb-0">
          <div
            className={`relative ${
              isDense ? "min-w-[440px] sm:min-w-0" : "min-w-[300px] sm:min-w-0"
            }`}
          >
            {/* Subtle Horizontal Gridlines with Peak Reference */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 flex h-44 flex-col justify-between sm:h-48"
            >
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex w-full items-center border-b border-dashed border-[var(--av-border)]"
                >
                  {row === 0 && hasAnyValue && (
                    <span className="-mt-4 ml-auto text-[10px] font-medium tabular-nums text-[var(--av-muted)]">
                      Peak: {formatValue(maxVal)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Bars */}
            <div
              className={`relative flex h-52 items-end justify-between pt-4 sm:h-56 ${
                isDense ? "gap-1 sm:gap-1.5" : "gap-1.5 sm:gap-2"
              }`}
            >
              {data.map((item, idx) => {
                const pHeight =
                  item.primary > 0
                    ? Math.max(6, Math.round((item.primary / maxVal) * 100))
                    : 0;
                const sHeight =
                  item.secondary > 0
                    ? Math.max(6, Math.round((item.secondary / maxVal) * 100))
                    : 0;
                const isHovered = hoveredIndex === idx;
                const tooltipPosition =
                  idx <= 1
                    ? "left-0"
                    : idx >= data.length - 2
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2";

                return (
                  <div
                    key={`${item.label}-${idx}`}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(idx)}
                    onBlur={() => setHoveredIndex(null)}
                    onClick={() =>
                      setHoveredIndex((prev) => (prev === idx ? null : idx))
                    }
                    tabIndex={0}
                    className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none"
                  >
                    {/* Edge-Safe Floating Tooltip */}
                    {isHovered && (
                      <div
                        className={`pointer-events-none absolute top-0 z-20 -translate-y-full whitespace-nowrap rounded-2xl bg-[var(--av-accent)] px-3.5 py-2.5 text-left text-[11px] text-[var(--av-accent-ink)] shadow-[0_12px_28px_rgba(20,18,14,0.24)] ${tooltipPosition}`}
                      >
                        <div className="font-bold">
                          {item.tooltipLabel || item.label}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-4 opacity-90">
                          <span>{primaryLabel}</span>
                          <span className="font-bold tabular-nums">
                            {formatValue(item.primary)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 opacity-75">
                          <span>{secondaryLabel}</span>
                          <span className="font-semibold tabular-nums">
                            {formatValue(item.secondary)}
                          </span>
                        </div>
                      </div>
                    )}

                    <div
                      className={`flex h-40 w-full items-end justify-center sm:h-44 ${
                        isDense
                          ? "max-w-[24px] gap-0.5 sm:max-w-[28px] sm:gap-1"
                          : "max-w-[40px] gap-1 sm:max-w-[44px] sm:gap-1.5"
                      }`}
                    >
                      <div
                        className={`w-1/2 rounded-t-md transition-all duration-200 ${
                          item.primary === 0
                            ? "bg-[var(--av-border-strong)]/45"
                            : isHovered
                              ? "bg-[var(--av-accent-hover)]"
                              : "bg-[var(--av-accent)]"
                        }`}
                        style={{
                          height: item.primary === 0 ? "2px" : `${pHeight}%`,
                        }}
                      />
                      <div
                        className={`w-1/2 rounded-t-md transition-all duration-200 ${
                          item.secondary === 0
                            ? "bg-[var(--av-border-strong)]/45"
                            : isHovered
                              ? "bg-[var(--av-bar-secondary-hover)]"
                              : "bg-[var(--av-bar-secondary)]"
                        }`}
                        style={{
                          height: item.secondary === 0 ? "2px" : `${sHeight}%`,
                        }}
                      />
                    </div>

                    <span
                      className={`mt-2 max-w-full truncate text-[10px] font-medium sm:mt-2.5 ${
                        isDense ? "sm:text-[10px]" : "sm:text-[11px]"
                      } ${
                        isHovered
                          ? "font-semibold text-[var(--av-ink)]"
                          : "text-[var(--av-muted)]"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
