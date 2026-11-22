"use client";

import { Plus, Receipt, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import {
  addIsoDaysClient,
  clampIsoDate,
  handleDecimalKeyDown,
  sanitizeDecimalInput,
} from "@/app/_components/ui/input-validation";
import {
  EmptyState,
  NoticeBanner,
  RowActionMenu,
  StatusChip,
} from "@/app/_components/ui/monochrome-controls";
import { QuickStatCard } from "@/app/_components/ui/quick-stat-card";
import {
  EXPENSE_CATEGORY_OPTIONS,
  formatCategoryLabel,
  formatPHP,
  formatRangeDescription,
  formatRangeLabel,
  type ExpenseCategory,
  type OwnerDashboardSnapshot,
} from "./types";

interface OwnerExpensesTabProps {
  snapshot: OwnerDashboardSnapshot;
  stationQuery: string;
  onDataChanged: () => Promise<void>;
}

export function OwnerExpensesTab({
  snapshot,
  stationQuery,
  onDataChanged,
}: OwnerExpensesTabProps) {
  const maxDate = snapshot.endDate;
  const minDate = addIsoDaysClient(snapshot.endDate, -30);

  const [category, setCategory] = useState<ExpenseCategory>("utilities");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(snapshot.endDate);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const activeSelectedIds = useMemo(
    () =>
      snapshot.expenses
        .filter((exp) => selectedIds.includes(exp.id))
        .map((exp) => exp.id),
    [snapshot.expenses, selectedIds]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const parsedAmount = Number(amount);
    if (
      !description.trim() ||
      !amount.trim() ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount < 0
    ) {
      setFeedback({
        tone: "error",
        message: "Enter a description and valid peso amount.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/owner/expenses${stationQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim(),
          amount: parsedAmount,
          expenseDate,
          notes: notes.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Failed to record expense.",
        });
        return;
      }

      setDescription("");
      setAmount("");
      setNotes("");
      setFeedback({
        tone: "success",
        message: "Expense recorded and net profit updated.",
      });
      await onDataChanged();
    } catch {
      setFeedback({
        tone: "error",
        message: "Connection error while saving expense.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(expenseId: string) {
    setFeedback(null);
    setDeletingId(expenseId);
    try {
      const stAmp = stationQuery ? `&${stationQuery.slice(1)}` : "";
      const response = await fetch(
        `/api/owner/expenses?id=${encodeURIComponent(expenseId)}${stAmp}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setFeedback({
          tone: "error",
          message: payload.error ?? "Could not delete expense.",
        });
        return;
      }
      setSelectedIds((prev) => prev.filter((id) => id !== expenseId));
      setFeedback({ tone: "success", message: "Expense removed." });
      await onDataChanged();
    } catch {
      setFeedback({ tone: "error", message: "Connection error while deleting." });
    } finally {
      setDeletingId(null);
    }
  }

  function toggleRow(id: string) {
    setConfirmingBulkDelete(false);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAllExpenses() {
    setConfirmingBulkDelete(false);
    const allIds = snapshot.expenses.map((exp) => exp.id);
    const allChecked =
      allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allChecked ? [] : allIds);
  }

  async function handleConfirmBulkDelete() {
    if (activeSelectedIds.length === 0) return;
    setBulkDeleting(true);
    setFeedback(null);
    trackAction({
      module: "expenses",
      action: `Confirmed deletion of ${activeSelectedIds.length} expense(s)`,
      controlLabel: "Confirm Delete",
    });
    try {
      const response = await fetch(`/api/owner/expenses${stationQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: activeSelectedIds }),
      });
      const payload = (await response.json()) as {
        deletedCount?: number;
        error?: string;
      };
      if (!response.ok) {
        setFeedback({
          tone: "error",
          message: payload.error ?? "Could not delete selected expenses.",
        });
        return;
      }
      const count = payload.deletedCount ?? activeSelectedIds.length;
      setSelectedIds([]);
      setConfirmingBulkDelete(false);
      setFeedback({
        tone: "success",
        message: `Removed ${count} selected ${count === 1 ? "expense" : "expenses"}.`,
      });
      await onDataChanged();
    } catch {
      setFeedback({
        tone: "error",
        message: "Connection error while deleting expenses.",
      });
    } finally {
      setBulkDeleting(false);
    }
  }

  const activeCategories = snapshot.expensesByCategory.filter((c) => c.total > 0);

  return (
    <div className="space-y-6">
      {snapshot.expensesSchemaMissing && (
        <NoticeBanner
          tone="info"
          message="Expenses tracking is still being set up. Please contact your system administrator."
        />
      )}

      {feedback && (
        <NoticeBanner
          tone={feedback.tone}
          message={feedback.message}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {/* Top Profit & Expense Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickStatCard
          highlighted
          label={`Net Profit (${formatRangeLabel(snapshot.rangeDays)})`}
          value={formatPHP(snapshot.quickStats.netProfit)}
          sublabel="Total Sales minus Station Expenses"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <QuickStatCard
          label={`Total Expenses (${formatRangeLabel(snapshot.rangeDays)})`}
          value={formatPHP(snapshot.quickStats.totalExpenses)}
          sublabel={`${snapshot.expenses.length} recorded ${snapshot.expenses.length === 1 ? "entry" : "entries"}`}
          icon={<Receipt className="h-5 w-5" />}
        />
        <QuickStatCard
          label="Top Expense Category"
          value={
            activeCategories[0]
              ? formatPHP(activeCategories[0].total)
              : formatPHP(0)
          }
          sublabel={
            activeCategories[0]
              ? activeCategories[0].label
              : "No expenses logged in this period"
          }
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      {/* Form + Simple Direct Category Breakdown (No Progress Bars) */}
      <div className="grid gap-6 xl:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="av-card space-y-4 p-6 xl:col-span-7"
        >
          <div>
            <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
              Log Station Expense
            </h2>
            <p className="mt-0.5 text-xs text-[var(--av-muted)]">
              Record utilities, supplies, filter maintenance, wages, fuel, or
              rent
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="exp-category"
                className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
              >
                Category
              </label>
              <select
                id="exp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold"
              >
                {EXPENSE_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="exp-date"
                className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
              >
                Expense Date
              </label>
              <input
                id="exp-date"
                type="date"
                required
                min={minDate}
                max={maxDate}
                value={expenseDate}
                onChange={(e) =>
                  setExpenseDate(clampIsoDate(e.target.value, minDate, maxDate))
                }
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="exp-description"
                className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
              >
                Description
              </label>
              <input
                id="exp-description"
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Electric bill, Seal caps, Filter replacement"
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="exp-amount"
                className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
              >
                Amount (₱)
              </label>
              <input
                id="exp-amount"
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onKeyDown={handleDecimalKeyDown}
                onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value))}
                placeholder="e.g. 1500.00"
                className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-semibold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="exp-notes"
              className="mb-1.5 block text-xs font-semibold text-[var(--av-ink)]"
            >
              Notes (optional)
            </label>
            <input
              id="exp-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt number or supplier note"
              className="av-input w-full rounded-2xl px-3.5 py-2.5 text-xs font-normal"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting || snapshot.expensesSchemaMissing}
              className="av-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Saving..." : "Record Expense"}
            </button>
          </div>
        </form>

        {/* Direct, Simple Category Totals (Progress Bar Removed) */}
        <section className="av-card p-6 xl:col-span-5">
          <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
            Expenses by Category
          </h2>
          <p className="mt-0.5 text-xs text-[var(--av-muted)]">
            {snapshot.startDate} to {snapshot.endDate}
          </p>

          <div className="mt-5 divide-y divide-[var(--av-border)]">
            {snapshot.expensesByCategory.map((cat) => {
              const pct =
                snapshot.quickStats.totalExpenses > 0
                  ? Math.round(
                      (cat.total / snapshot.quickStats.totalExpenses) * 100
                    )
                  : 0;

              return (
                <div
                  key={cat.category}
                  className="flex items-center justify-between gap-3 py-3 text-xs first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--av-ink)]">
                      {cat.label}
                    </div>
                    <div className="text-[11px] text-[var(--av-muted)]">
                      {cat.count === 0
                        ? "No entries"
                        : `${cat.count} ${cat.count === 1 ? "entry" : "entries"}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <StatusChip
                      label={`${pct}%`}
                      tone={cat.total > 0 ? "soft" : "outline"}
                    />
                    <span className="min-w-[80px] text-right font-bold tabular-nums text-[var(--av-ink)]">
                      {formatPHP(cat.total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Expenses Ledger Table */}
      <section className="av-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[var(--av-ink)]">
              Recorded Expenses ({snapshot.expenses.length})
            </h2>
            <p className="text-xs text-[var(--av-muted)]">
              Showing station costs logged for{" "}
              {formatRangeDescription(snapshot.rangeDays)}
              {activeSelectedIds.length > 0 && (
                <> · {activeSelectedIds.length} selected</>
              )}
            </p>
          </div>

          {activeSelectedIds.length > 0 &&
            (!confirmingBulkDelete ? (
              <button
                type="button"
                onClick={() => setConfirmingBulkDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/12 px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/20 dark:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Selected ({activeSelectedIds.length})
              </button>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 py-1 pr-1 pl-3">
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                  Delete {activeSelectedIds.length}{" "}
                  {activeSelectedIds.length === 1 ? "expense" : "expenses"}?
                </span>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => setConfirmingBulkDelete(false)}
                  className="rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-1 text-xs font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-surface-subtle)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => void handleConfirmBulkDelete()}
                  className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3.5 py-1 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  {bulkDeleting
                    ? "Deleting..."
                    : `Confirm Delete (${activeSelectedIds.length})`}
                </button>
              </div>
            ))}
        </div>

        {snapshot.expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No expenses recorded yet"
            description="Log your utilities, supplies, wages, or maintenance costs above to track net profit."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-muted)]">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all expenses"
                      checked={
                        snapshot.expenses.length > 0 &&
                        snapshot.expenses.every((exp) =>
                          selectedIds.includes(exp.id)
                        )
                      }
                      onChange={toggleAllExpenses}
                      className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                    />
                  </th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="w-12 px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="bg-[var(--av-surface-subtle)] font-medium text-[var(--av-ink)] transition hover:bg-[var(--av-surface-hover)]"
                  >
                    <td className="rounded-l-2xl px-3 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${exp.description}`}
                        checked={selectedIds.includes(exp.id)}
                        onChange={() => toggleRow(exp.id)}
                        className="h-4 w-4 rounded border-[var(--av-border-strong)] accent-[var(--av-accent)]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-[var(--av-ink-secondary)]">
                      {exp.expense_date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <StatusChip
                        label={formatCategoryLabel(exp.category)}
                        tone="outline"
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold text-[var(--av-ink)]">
                        {exp.description}
                      </div>
                      {exp.notes && (
                        <div className="text-[11px] font-normal text-[var(--av-muted)]">
                          {exp.notes}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-bold tabular-nums">
                      {formatPHP(Number(exp.amount))}
                    </td>
                    <td className="rounded-r-2xl px-3 py-3.5 text-right">
                      <RowActionMenu
                        actions={[
                          {
                            label:
                              deletingId === exp.id
                                ? "Deleting..."
                                : "Delete Expense",
                            disabled: deletingId === exp.id,
                            onClick: () => void handleDelete(exp.id),
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
    </div>
  );
}
