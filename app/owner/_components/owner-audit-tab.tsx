"use client";

import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  History,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addIsoDaysClient,
  clampIsoDate,
} from "@/app/_components/ui/input-validation";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import type {
  AuditBucketFilter,
  EnrichedAuditLogRow,
  OwnerAuditLedgerResult,
} from "@/backend/services/audit-ledger";

interface OwnerAuditTabProps {
  todayDate: string;
  stationAmpParam: string;
  stationQueryParam: string;
  refreshSignal: number;
  onTotalEntriesChange?: (total: number) => void;
}

function fmtCents(centavos: number, signed = false): string {
  const num = Number(centavos || 0);
  if (num === 0) return "₱0.00";
  const prefix = num < 0 ? "-" : signed ? "+" : "";
  return `${prefix}₱${(Math.abs(num) / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moduleLabel(mod: string): string {
  switch (mod) {
    case "pos":
      return "Walk-in POS";
    case "delivery":
      return "Delivery";
    case "vendo":
      return "Vendo";
    case "expense":
      return "Expense";
    case "shift":
      return "Shift";
    case "supervision":
      return "Supervision";
    case "inventory":
      return "Inventory";
    case "security":
      return "Security";
    default:
      return mod;
  }
}

function humanEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    "pos.sale.created": "Walk-in Sale",
    "pos.sale.voided": "Walk-in Voided",
    "pos.sale.backfilled_voided": "Past Voided Sale",
    "delivery.created": "Delivery Recorded",
    "delivery.updated": "Delivery Updated",
    "delivery.cancelled": "Delivery Cancelled",
    "delivery.backfilled_cancelled": "Past Cancelled Delivery",
    "vendo.collected": "Vendo Collection",
    "expense.created": "Expense Added",
    "expense.deleted": "Expense Removed",
    "shift.closed": "Shift Closed",
    "borrow.deposit_received": "Container Deposit",
    "correction.requested": "Correction Requested",
    "correction.direct_applied": "Direct Fix Applied",
    "correction.approved": "Correction Approved",
    "correction.rejected": "Correction Rejected",
    "superadmin.audit_access": "Admin Inspection",
  };
  return map[eventType] ?? eventType.replace(/[._]/g, " ");
}

function humanFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function renderSnapshotPairs(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return (
      <p className="mt-2 text-xs text-[var(--av-muted)]">No previous values</p>
    );
  }
  const entries = Object.entries(snapshot as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) {
    return <p className="mt-2 text-xs text-[var(--av-muted)]">None</p>;
  }
  return (
    <dl className="mt-2 space-y-1.5 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <dt className="text-[var(--av-muted)]">{humanFieldLabel(k)}</dt>
          <dd className="font-semibold text-[var(--av-ink)] tabular-nums">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function OwnerAuditTab({
  todayDate,
  stationAmpParam,
  stationQueryParam,
  refreshSignal,
  onTotalEntriesChange,
}: OwnerAuditTabProps) {
  const minAllowedDate = addIsoDaysClient(todayDate, -365);
  const [ledger, setLedger] = useState<OwnerAuditLedgerResult | null>(null);
  const [fromDate, setFromDate] = useState(addIsoDaysClient(todayDate, -29));
  const [toDate, setToDate] = useState(todayDate);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState<AuditBucketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [inspected, setInspected] = useState<EnrichedAuditLogRow | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success" | "info";
    message: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildQueryString = useCallback(
    (overrides?: {
      from?: string;
      to?: string;
      module?: string;
      bucket?: AuditBucketFilter;
      q?: string;
    }) => {
      const params = new URLSearchParams();
      params.set("from", overrides?.from ?? fromDate);
      params.set("to", overrides?.to ?? toDate);
      const mod = overrides?.module ?? moduleFilter;
      if (mod !== "all") params.set("module", mod);
      const bkt = overrides?.bucket ?? bucketFilter;
      if (bkt !== "all") params.set("bucket", bkt);
      const q = (overrides?.q ?? searchQuery).trim();
      if (q) params.set("q", q);
      return `${params.toString()}${stationAmpParam}`;
    },
    [bucketFilter, fromDate, moduleFilter, searchQuery, stationAmpParam, toDate]
  );

  const fetchLedger = useCallback(
    async (
      overrides?: {
        from?: string;
        to?: string;
        module?: string;
        bucket?: AuditBucketFilter;
        q?: string;
      },
      announceVerify = false
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const qs = buildQueryString(overrides);
        const res = await fetch(`/api/owner/audit?${qs}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setFeedback({
            tone: "error",
            message: payload.error ?? "Failed to load audit trail.",
          });
          return;
        }
        const data = (await res.json()) as OwnerAuditLedgerResult;
        setLedger(data);
        onTotalEntriesChange?.(data.chain.totalEntries);
        if (announceVerify) {
          setFeedback({
            tone: data.chain.verified ? "success" : "error",
            message: data.chain.verified
              ? `All ${data.chain.totalEntries} financial records verified with no missing entries.`
              : `Attention needed: ${data.chain.brokenSeqNos.length} changed and ${data.chain.missingSeqNos.length} missing records found.`,
          });
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setFeedback({
            tone: "error",
            message: "Connection error while loading audit trail.",
          });
        }
      } finally {
        if (abortRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [buildQueryString, onTotalEntriesChange]
  );

  // Lazy-load on first mount & reload when live pulse updates
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const qs = buildQueryString();
    fetch(`/api/owner/audit?${qs}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setFeedback({
            tone: "error",
            message: payload.error ?? "Failed to load audit trail.",
          });
          return;
        }
        const data = (await res.json()) as OwnerAuditLedgerResult;
        if (!active) return;
        setLedger(data);
        onTotalEntriesChange?.(data.chain.totalEntries);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if ((err as { name?: string })?.name !== "AbortError") {
          setFeedback({
            tone: "error",
            message: "Connection error while loading audit trail.",
          });
        }
      })
      .finally(() => {
        if (active && abortRef.current === controller) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, stationAmpParam]);

  async function handleBackfill() {
    setFeedback(null);
    setBackfilling(true);
    try {
      const res = await fetch(`/api/owner/audit${stationQueryParam}`, {
        method: "POST",
      });
      const payload = (await res.json()) as {
        importedCount?: number;
        ledger?: OwnerAuditLedgerResult;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Could not sync past records.",
        });
        return;
      }
      if (payload.ledger) setLedger(payload.ledger);
      setFeedback({
        tone: "success",
        message:
          payload.importedCount && payload.importedCount > 0
            ? `Synced ${payload.importedCount} past record(s) into your audit trail.`
            : "All existing station records are already synced.",
      });
    } catch {
      setFeedback({ tone: "error", message: "Connection error while syncing." });
    } finally {
      setBackfilling(false);
    }
  }

  const exportQs = buildQueryString();

  if (!ledger) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)]"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ledger.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="Financial audit trail is still being set up. Please contact your system administrator."
        />
      )}

      {feedback && (
        <NoticeBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Top 4 Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <QuickStatCard
          highlighted
          label="Record Check"
          value={
            ledger.chain.verified
              ? `Verified · ${ledger.chain.totalEntries}`
              : "Needs Review"
          }
          sublabel={
            ledger.chain.verified
              ? "All recorded entries match"
              : "Discrepancy detected in history"
          }
          icon={
            ledger.chain.verified ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )
          }
        />

        <QuickStatCard
          label="Cash Drawer Net"
          value={fmtCents(ledger.periodTotals.cashNetCentavos, true)}
          sublabel={`${ledger.totalMatching} matching entries in range`}
          icon={<Banknote className="h-5 w-5" />}
        />

        <QuickStatCard
          label="GCash / Bank Net"
          value={fmtCents(ledger.periodTotals.digitalNetCentavos, true)}
          sublabel="Total online movement"
          icon={<CreditCard className="h-5 w-5" />}
        />

        <QuickStatCard
          label="Utang & Expenses"
          value={fmtCents(ledger.periodTotals.utangNetCentavos, true)}
          sublabel={`Expenses: ${fmtCents(ledger.periodTotals.expenseNetCentavos)} · ${ledger.periodTotals.voidAndCorrectionCount} void/fix`}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      {/* Totals Match Bar */}
      {!ledger.schemaMissing && (
        <div className="av-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--av-accent)] text-[var(--av-accent-ink)]">
              {ledger.reconciliation.isBalanced ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <History className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--av-ink)]">
                  Totals Match
                </h2>
                <StatusChip
                  label={
                    ledger.reconciliation.isBalanced
                      ? "Matched · ₱0.00 Diff"
                      : `Difference ${fmtCents(ledger.reconciliation.grossDiffCentavos, true)}`
                  }
                  tone={ledger.reconciliation.isBalanced ? "green" : "yellow"}
                  dot
                />
              </div>
              <p className="mt-0.5 text-xs text-[var(--av-muted)] tabular-nums">
                Recorded Sales {fmtCents(ledger.reconciliation.ledgerGrossCentavos)}{" "}
                vs. Station Total{" "}
                {fmtCents(ledger.reconciliation.operationalGrossCentavos)} ·
                Expenses{" "}
                {fmtCents(ledger.reconciliation.ledgerExpenseCentavos)} vs.{" "}
                {fmtCents(ledger.reconciliation.operationalExpenseCentavos)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ledger.hasPreLedgerRecords && (
              <button
                type="button"
                onClick={() => void handleBackfill()}
                disabled={backfilling}
                className="av-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
              >
                <History className="h-3.5 w-3.5" />
                {backfilling ? "Syncing..." : "Sync Past Records"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void fetchLedger(undefined, true)}
              disabled={loading}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {loading ? "Checking..." : "Recheck Records"}
            </button>
          </div>
        </div>
      )}

      {/* Filter & Export Controls */}
      <div className="av-card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--av-subtle)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchLedger();
              }}
              placeholder="Search receipt, customer, staff name, or date..."
              className="av-input w-full rounded-full py-2 pl-10 pr-4 text-xs font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              min={minAllowedDate}
              max={toDate}
              value={fromDate}
              aria-label="From date"
              onChange={(e) => {
                const next = clampIsoDate(
                  e.target.value,
                  minAllowedDate,
                  toDate
                );
                setFromDate(next);
                void fetchLedger({ from: next });
              }}
              className="av-input rounded-full px-3.5 py-2 text-xs font-semibold tabular-nums"
            />
            <span className="text-xs font-semibold text-[var(--av-muted)]">
              to
            </span>
            <input
              type="date"
              min={fromDate}
              max={todayDate}
              value={toDate}
              aria-label="To date"
              onChange={(e) => {
                const next = clampIsoDate(
                  e.target.value,
                  fromDate,
                  todayDate
                );
                setToDate(next);
                void fetchLedger({ to: next });
              }}
              className="av-input rounded-full px-3.5 py-2 text-xs font-semibold tabular-nums"
            />

            <button
              type="button"
              onClick={() => void fetchLedger()}
              disabled={loading}
              className="av-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Filter
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--av-border)] pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Areas" },
                { id: "pos", label: "Walk-in POS" },
                { id: "delivery", label: "Deliveries" },
                { id: "vendo", label: "Vendo" },
                { id: "expense", label: "Expenses" },
                { id: "shift", label: "Shifts" },
                { id: "supervision", label: "Supervision" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModuleFilter(m.id);
                  void fetchLedger({ module: m.id });
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  moduleFilter === m.id
                    ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)]"
                    : "border border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink-secondary)] hover:bg-[var(--av-surface-subtle)]"
                }`}
              >
                {m.label}
              </button>
            ))}

            <select
              value={bucketFilter}
              aria-label="Filter by payment type"
              onChange={(e) => {
                const next = e.target.value as AuditBucketFilter;
                setBucketFilter(next);
                void fetchLedger({ bucket: next });
              }}
              className="av-input rounded-full bg-[var(--av-surface)] px-3.5 py-1.5 text-xs font-semibold"
            >
              <option value="all">All Types</option>
              <option value="cash">Cash Only</option>
              <option value="digital">GCash / Bank Only</option>
              <option value="utang">Utang / Unpaid Only</option>
              <option value="expense">Expenses Only</option>
              <option value="exceptions">Voids &amp; Corrections</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/owner/audit/export?${exportQs}&format=csv`}
              className="av-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
            <a
              href={`/api/owner/audit/export?${exportQs}&format=txt`}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
            >
              TXT
            </a>
            <a
              href={`/api/owner/audit/export?${exportQs}&format=json`}
              className="av-btn-outline inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
            >
              JSON
            </a>
          </div>
        </div>
      </div>

      {/* Financial Audit Trail Card — "Immutable" and description below removed (Item #9) */}
      <section className="av-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
            Financial Audit Trail ({ledger.entries.length}
            {ledger.totalMatching > ledger.entries.length
              ? ` of ${ledger.totalMatching}`
              : ""}
            )
          </h2>
        </div>

        {ledger.entries.length === 0 ? (
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="No audit entries in this date range"
            description={
              ledger.hasPreLedgerRecords
                ? 'Click "Sync Past Records" above to include earlier station sales, or record a new transaction.'
                : "Every new Walk-in sale, delivery, vendo count, expense, void, and approval will appear here automatically."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Time &amp; User</th>
                  <th className="px-3 py-2">Area / Activity</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2 text-right">Cash</th>
                  <th className="px-3 py-2 text-right">GCash</th>
                  <th className="px-3 py-2 text-right">Utang</th>
                  <th className="px-3 py-2 text-right">Expense</th>
                  <th className="w-12 px-3 py-2 text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((row) => (
                  <tr
                    key={row.id}
                    className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                  >
                    <td className="rounded-l-2xl whitespace-nowrap px-3 py-3.5 font-bold tabular-nums">
                      #{row.seq_no}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <div className="font-semibold text-[var(--av-ink)]">
                        {row.actor_name}
                      </div>
                      <div className="text-[11px] font-normal text-[var(--av-muted)] tabular-nums">
                        {row.business_date} ·{" "}
                        {new Date(row.created_at).toLocaleTimeString()} ·{" "}
                        <span className="capitalize">{row.actor_role}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <StatusChip
                        label={moduleLabel(row.module)}
                        tone={
                          row.event_type.includes("void") ||
                          row.event_type.includes("deleted") ||
                          row.event_type.includes("approved")
                            ? "solid"
                            : "outline"
                        }
                      />
                      <div className="mt-1 text-[11px] text-[var(--av-muted)]">
                        {humanEventLabel(row.event_type)}
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-3.5">
                      <div className="truncate font-semibold text-[var(--av-ink)]">
                        {row.reference_label}
                      </div>
                      <div className="line-clamp-2 text-[11px] font-normal text-[var(--av-ink-secondary)]">
                        {row.summary}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.cash_delta_centavos !== 0 ? (
                        fmtCents(row.cash_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[var(--av-subtle)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.digital_delta_centavos !== 0 ? (
                        fmtCents(row.digital_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[var(--av-subtle)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.utang_delta_centavos !== 0 ? (
                        fmtCents(row.utang_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[var(--av-subtle)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.expense_delta_centavos !== 0 ? (
                        fmtCents(row.expense_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[var(--av-subtle)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="rounded-r-2xl px-3 py-3.5 text-right">
                      <RowActionMenu
                        ariaLabel={`View details for entry #${row.seq_no}`}
                        actions={[
                          {
                            label: "View Details",
                            onClick: () => setInspected(row),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Plain-English Details Modal */}
      {inspected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="av-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={`#${inspected.seq_no}`} tone="solid" />
                  <StatusChip
                    label={moduleLabel(inspected.module)}
                    tone="outline"
                  />
                  <span className="text-xs font-semibold text-[var(--av-muted)]">
                    {humanEventLabel(inspected.event_type)}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-[var(--av-ink)]">
                  {inspected.reference_label}
                </h3>
                <p className="text-xs text-[var(--av-muted)]">
                  {inspected.actor_name} ({inspected.actor_role}) ·{" "}
                  {new Date(inspected.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                aria-label="Close details"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)] hover:bg-[var(--av-surface-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 rounded-2xl bg-[var(--av-surface-subtle)] px-4 py-3 text-xs font-medium text-[var(--av-ink)]">
              {inspected.summary}
            </p>

            {/* Impact Summary */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {[
                { label: "Cash", val: inspected.cash_delta_centavos },
                { label: "GCash", val: inspected.digital_delta_centavos },
                { label: "Utang", val: inspected.utang_delta_centavos },
                { label: "Expense", val: inspected.expense_delta_centavos },
                { label: "Total Sales", val: inspected.gross_sales_delta_centavos },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="rounded-2xl bg-[var(--av-surface-subtle)] p-3 text-center"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                    {cell.label}
                  </div>
                  <div className="mt-1 text-xs font-bold tabular-nums text-[var(--av-ink)]">
                    {fmtCents(cell.val, true)}
                  </div>
                </div>
              ))}
            </div>

            {/* Before vs After Readable Summary */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface-subtle)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--av-muted)]">
                  Before
                </div>
                {renderSnapshotPairs(inspected.before_snapshot)}
              </div>
              <div className="rounded-2xl border border-[var(--av-border)] bg-[var(--av-surface-subtle)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--av-muted)]">
                  After
                </div>
                {renderSnapshotPairs(inspected.after_snapshot)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
