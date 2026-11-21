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
  initialLedger: OwnerAuditLedgerResult;
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
      return "Container";
    case "security":
      return "Security";
    default:
      return mod;
  }
}

export function OwnerAuditTab({
  initialLedger,
  refreshSignal,
  onTotalEntriesChange,
}: OwnerAuditTabProps) {
  const [ledger, setLedger] = useState<OwnerAuditLedgerResult>(initialLedger);
  const [fromDate, setFromDate] = useState(initialLedger.fromDate);
  const [toDate, setToDate] = useState(initialLedger.toDate);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState<AuditBucketFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
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
      return params.toString();
    },
    [bucketFilter, fromDate, moduleFilter, searchQuery, toDate]
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
            message: payload.error ?? "Failed to load audit ledger.",
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
              ? `SHA-256 Chain Verified: all ${data.chain.totalEntries} immutable entries intact with 0 gaps.`
              : `Chain Integrity Warning: ${data.chain.brokenSeqNos.length} altered and ${data.chain.missingSeqNos.length} missing sequence numbers detected.`,
          });
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setFeedback({
            tone: "error",
            message: "Network error while querying audit ledger.",
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

  // Sync automatically whenever the Owner workspace's live 10s pulse detects a DB change
  useEffect(() => {
    if (refreshSignal === 0) return;
    const controller = new AbortController();
    async function silentReload() {
      try {
        const res = await fetch(`/api/owner/audit?${buildQueryString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as OwnerAuditLedgerResult;
        setLedger(data);
        onTotalEntriesChange?.(data.chain.totalEntries);
      } catch {
        // Ignore abort
      }
    }
    void silentReload();
    return () => controller.abort();
  }, [refreshSignal, buildQueryString, onTotalEntriesChange]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function handleBackfill() {
    setFeedback(null);
    setBackfilling(true);
    try {
      const res = await fetch("/api/owner/audit", { method: "POST" });
      const payload = (await res.json()) as {
        importedCount?: number;
        ledger?: OwnerAuditLedgerResult;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Could not import pre-ledger records.",
        });
        return;
      }
      if (payload.ledger) setLedger(payload.ledger);
      setFeedback({
        tone: "success",
        message:
          payload.importedCount && payload.importedCount > 0
            ? `Imported ${payload.importedCount} pre-ledger record(s) into the immutable SHA-256 audit chain.`
            : "All existing station records are already in the audit ledger.",
      });
    } catch {
      setFeedback({ tone: "error", message: "Network error during backfill." });
    } finally {
      setBackfilling(false);
    }
  }

  function copyHash(hash: string) {
    void navigator.clipboard?.writeText(hash);
    setFeedback({
      tone: "info",
      message: `Copied SHA-256 hash (${hash.slice(0, 16)}...) to clipboard.`,
    });
  }

  const exportQs = buildQueryString();

  return (
    <div className="space-y-6">
      {ledger.schemaMissing && (
        <NoticeBanner
          tone="info"
          message="The financial_audit_logs table is not created yet. Run Section 12e of backend/db/schema.sql in Supabase SQL Editor to activate the append-only centavo audit trail."
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
          label="SHA-256 Chain"
          value={
            ledger.chain.verified
              ? `Intact · #${ledger.chain.totalEntries}`
              : "Tamper Alert"
          }
          sublabel={
            ledger.chain.latestHash
              ? `Latest hash ${ledger.chain.latestHash.slice(0, 14)}…`
              : "Append-only ledger ready"
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
          sublabel="Exact centavo online movement"
          icon={<CreditCard className="h-5 w-5" />}
        />

        <QuickStatCard
          label="Utang & Expenses"
          value={fmtCents(ledger.periodTotals.utangNetCentavos, true)}
          sublabel={`Expenses: ${fmtCents(ledger.periodTotals.expenseNetCentavos)} · ${ledger.periodTotals.voidAndCorrectionCount} void/fix`}
          icon={<Wallet className="h-5 w-5" />}
        />
      </div>

      {/* Centavo Reconciliation Proof Bar */}
      {!ledger.schemaMissing && (
        <div className="av-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white">
              {ledger.reconciliation.isBalanced ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <History className="h-5 w-5" />
              )}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-[#111111]">
                  Centavo Reconciliation Proof
                </h2>
                <StatusChip
                  label={
                    ledger.reconciliation.isBalanced
                      ? "Balanced · ₱0.00 Diff"
                      : `Pre-Ledger Diff ${fmtCents(ledger.reconciliation.grossDiffCentavos, true)}`
                  }
                  tone={ledger.reconciliation.isBalanced ? "soft" : "solid"}
                  dot
                />
              </div>
              <p className="mt-0.5 text-xs text-[#71717A] tabular-nums">
                Ledger Gross {fmtCents(ledger.reconciliation.ledgerGrossCentavos)}{" "}
                vs. Operational{" "}
                {fmtCents(ledger.reconciliation.operationalGrossCentavos)} ·
                Ledger Expenses{" "}
                {fmtCents(ledger.reconciliation.ledgerExpenseCentavos)} vs.
                Operational{" "}
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
                className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
              >
                <History className="h-3.5 w-3.5" />
                {backfilling ? "Importing..." : "Import Pre-Ledger Records"}
              </button>
            )}

            <button
              type="button"
              onClick={() => void fetchLedger(undefined, true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-4 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6] disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {loading ? "Verifying..." : "Verify SHA-256 Chain"}
            </button>
          </div>
        </div>
      )}

      {/* Filter & Export Controls */}
      <div className="av-card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void fetchLedger();
              }}
              placeholder="Search #seq, receipt, customer, actor, or hash..."
              className="w-full rounded-full border border-[#E4E4E7] bg-[#F8F8FA] py-2 pl-10 pr-4 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              aria-label="From date"
              onChange={(e) => {
                setFromDate(e.target.value);
                void fetchLedger({ from: e.target.value });
              }}
              className="rounded-full border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-xs font-semibold tabular-nums text-[#111111]"
            />
            <span className="text-xs font-semibold text-[#71717A]">to</span>
            <input
              type="date"
              value={toDate}
              aria-label="To date"
              onChange={(e) => {
                setToDate(e.target.value);
                void fetchLedger({ to: e.target.value });
              }}
              className="rounded-full border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2 text-xs font-semibold tabular-nums text-[#111111]"
            />

            <button
              type="button"
              onClick={() => void fetchLedger()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/85 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Filter
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECEF] pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Modules" },
                { id: "pos", label: "Walk-in POS" },
                { id: "delivery", label: "Deliveries" },
                { id: "vendo", label: "Vendo" },
                { id: "expense", label: "Expenses" },
                { id: "shift", label: "Shifts" },
                { id: "supervision", label: "Supervision" },
                { id: "security", label: "Security" },
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
                    ? "bg-[#111111] text-white"
                    : "border border-[#E4E4E7] bg-white text-[#52525B] hover:bg-[#F4F4F6]"
                }`}
              >
                {m.label}
              </button>
            ))}

            <select
              value={bucketFilter}
              aria-label="Filter by financial impact"
              onChange={(e) => {
                const next = e.target.value as AuditBucketFilter;
                setBucketFilter(next);
                void fetchLedger({ bucket: next });
              }}
              className="rounded-full border border-[#E4E4E7] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:outline-none"
            >
              <option value="all">All Impacts</option>
              <option value="cash">Cash Drawer Only</option>
              <option value="digital">GCash / Bank Only</option>
              <option value="utang">Utang / Unpaid Only</option>
              <option value="expense">Expenses Only</option>
              <option value="exceptions">Voids, Fixes &amp; Alerts</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/owner/audit/export?${exportQs}&format=csv`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-black/85"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
            <a
              href={`/api/owner/audit/export?${exportQs}&format=txt`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6]"
            >
              TXT
            </a>
            <a
              href={`/api/owner/audit/export?${exportQs}&format=json`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D4D4D8] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6]"
            >
              JSON
            </a>
          </div>
        </div>
      </div>

      {/* Forensic Ledger Table */}
      <section className="av-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Immutable Financial Audit Trail ({ledger.entries.length}
              {ledger.totalMatching > ledger.entries.length
                ? ` of ${ledger.totalMatching}`
                : ""}
              )
            </h2>
            <p className="text-xs text-[#71717A]">
              Append-only database trigger enforced · Every peso &amp; centavo
              movement is SHA-256 hash-chained
            </p>
          </div>
          <StatusChip label="Append-Only · Read Only" tone="outline" dot />
        </div>

        {ledger.entries.length === 0 ? (
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="No audit entries in this window"
            description={
              ledger.hasPreLedgerRecords
                ? 'Click "Import Pre-Ledger Records" above to bring existing station sales into the audit chain, or record a new transaction.'
                : "Every new Walk-in sale, delivery, vendo count, expense, void, and approval will appear here automatically."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="px-3 py-2">#Seq</th>
                  <th className="px-3 py-2">Time &amp; Actor</th>
                  <th className="px-3 py-2">Module / Event</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2 text-right">Cash Δ</th>
                  <th className="px-3 py-2 text-right">GCash Δ</th>
                  <th className="px-3 py-2 text-right">Utang Δ</th>
                  <th className="px-3 py-2 text-right">Exp Δ</th>
                  <th className="w-12 px-3 py-2 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {ledger.entries.map((row) => (
                  <tr
                    key={row.id}
                    className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                  >
                    <td className="rounded-l-2xl whitespace-nowrap px-3 py-3.5 font-bold tabular-nums">
                      #{row.seq_no}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <div className="font-semibold text-[#111111]">
                        {row.actor_name}
                      </div>
                      <div className="text-[11px] font-normal text-[#71717A] tabular-nums">
                        {row.business_date} ·{" "}
                        {new Date(row.created_at).toLocaleTimeString()} ·{" "}
                        <span className="uppercase">{row.actor_role}</span>
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
                      <div className="mt-1 text-[10px] font-mono text-[#71717A]">
                        {row.event_type}
                      </div>
                    </td>
                    <td className="max-w-xs px-3 py-3.5">
                      <div className="truncate font-semibold text-[#111111]">
                        {row.reference_label}
                      </div>
                      <div className="line-clamp-2 text-[11px] font-normal text-[#52525B]">
                        {row.summary}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.cash_delta_centavos !== 0 ? (
                        fmtCents(row.cash_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[#A1A1AA]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.digital_delta_centavos !== 0 ? (
                        fmtCents(row.digital_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[#A1A1AA]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.utang_delta_centavos !== 0 ? (
                        fmtCents(row.utang_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[#A1A1AA]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {row.expense_delta_centavos !== 0 ? (
                        fmtCents(row.expense_delta_centavos, true)
                      ) : (
                        <span className="font-normal text-[#A1A1AA]">—</span>
                      )}
                    </td>
                    <td className="rounded-r-2xl px-3 py-3.5 text-right">
                      <RowActionMenu
                        ariaLabel={`Inspect audit entry #${row.seq_no}`}
                        actions={[
                          {
                            label: "Inspect Diff & Hash",
                            onClick: () => setInspected(row),
                          },
                          {
                            label: "Copy SHA-256 Hash",
                            onClick: () => copyHash(row.entry_hash),
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

      {/* Forensic Diff Inspector Modal */}
      {inspected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#E5E5EA] bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,0.2)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={`#${inspected.seq_no}`} tone="solid" />
                  <StatusChip
                    label={moduleLabel(inspected.module)}
                    tone="outline"
                  />
                  <span className="font-mono text-[11px] text-[#71717A]">
                    {inspected.event_type}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-[#111111]">
                  {inspected.reference_label}
                </h3>
                <p className="text-xs text-[#71717A]">
                  {inspected.actor_name} ({inspected.actor_role}) ·{" "}
                  {new Date(inspected.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                aria-label="Close inspector"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111] hover:bg-[#E4E4E7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 rounded-2xl bg-[#F7F7F9] px-4 py-3 text-xs font-medium text-[#111111]">
              {inspected.summary}
            </p>

            {/* Exact Centavo Impact Grid */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {[
                { label: "Cash Δ", val: inspected.cash_delta_centavos },
                { label: "GCash Δ", val: inspected.digital_delta_centavos },
                { label: "Utang Δ", val: inspected.utang_delta_centavos },
                { label: "Expense Δ", val: inspected.expense_delta_centavos },
                { label: "Gross Δ", val: inspected.gross_sales_delta_centavos },
              ].map((cell) => (
                <div
                  key={cell.label}
                  className="rounded-2xl bg-[#F8F8FA] p-3 text-center"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
                    {cell.label}
                  </div>
                  <div className="mt-1 text-xs font-bold tabular-nums text-[#111111]">
                    {fmtCents(cell.val, true)}
                  </div>
                  <div className="text-[10px] tabular-nums text-[#A1A1AA]">
                    {cell.val}¢
                  </div>
                </div>
              ))}
            </div>

            {/* Before vs After Snapshots */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#ECECEF] bg-[#F8F8FA] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                  Before Snapshot
                </div>
                <pre className="mt-2 overflow-x-auto text-[11px] font-mono text-[#111111]">
                  {inspected.before_snapshot
                    ? JSON.stringify(inspected.before_snapshot, null, 2)
                    : "null (new record)"}
                </pre>
              </div>
              <div className="rounded-2xl border border-[#ECECEF] bg-[#F8F8FA] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                  After Snapshot
                </div>
                <pre className="mt-2 overflow-x-auto text-[11px] font-mono text-[#111111]">
                  {inspected.after_snapshot
                    ? JSON.stringify(inspected.after_snapshot, null, 2)
                    : "null (deleted)"}
                </pre>
              </div>
            </div>

            {/* Metadata & Cryptographic Hash Chain Proof */}
            <div className="mt-4 space-y-3">
              {inspected.metadata &&
                Object.keys(inspected.metadata as Record<string, unknown>)
                  .length > 0 && (
                  <div className="rounded-2xl border border-[#ECECEF] bg-[#F8F8FA] p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#71717A]">
                      Forensic Metadata (Discounts, Tendered, Change, Items)
                    </div>
                    <pre className="mt-2 overflow-x-auto text-[11px] font-mono text-[#111111]">
                      {JSON.stringify(inspected.metadata, null, 2)}
                    </pre>
                  </div>
                )}

              <div className="rounded-2xl bg-[#111111] p-4 text-white">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                    SHA-256 Cryptographic Chain Proof
                  </span>
                  <button
                    type="button"
                    onClick={() => copyHash(inspected.entry_hash)}
                    className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold text-white hover:bg-white/25"
                  >
                    Copy Entry Hash
                  </button>
                </div>
                <div className="mt-2 space-y-1 font-mono text-[11px] break-all">
                  <div>
                    <span className="text-white/60">ENTRY: </span>
                    {inspected.entry_hash}
                  </div>
                  <div>
                    <span className="text-white/60">PREV : </span>
                    {inspected.prev_hash}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
