"use client";

import { Plus, Receipt, TrendingUp } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  type ExpenseCategory,
  type OwnerDashboardSnapshot,
} from "./types";

interface OwnerExpensesTabProps {
  snapshot: OwnerDashboardSnapshot;
  onDataChanged: () => Promise<void>;
}

export function OwnerExpensesTab({
  snapshot,
  onDataChanged,
}: OwnerExpensesTabProps) {
  const [category, setCategory] = useState<ExpenseCategory>("utilities");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(snapshot.endDate);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setFeedback({
        tone: "error",
        message: "Enter a description and valid peso amount.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/owner/expenses", {
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
      setFeedback({ tone: "error", message: "Network error while saving expense." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(expenseId: string) {
    setFeedback(null);
    setDeletingId(expenseId);
    try {
      const response = await fetch(
        `/api/owner/expenses?id=${encodeURIComponent(expenseId)}`,
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
      setFeedback({ tone: "error", message: "Network error while deleting." });
    } finally {
      setDeletingId(null);
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  const activeCategories = snapshot.expensesByCategory.filter((c) => c.total > 0);

  return (
    <div className="space-y-6">
      {snapshot.expensesSchemaMissing && (
        <NoticeBanner
          tone="info"
          message="Expenses table (public.station_expenses) is not applied yet. Run Section 12b of backend/db/schema.sql in Supabase SQL Editor to enable saving expenses."
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
          label={`Net Profit (${snapshot.rangeDays}d)`}
          value={formatPHP(snapshot.quickStats.netProfit)}
          sublabel="Total Sales minus Station Expenses"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <QuickStatCard
          label={`Total Expenses (${snapshot.rangeDays}d)`}
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

      {/* Form + Category Breakdown */}
      <div className="grid gap-6 xl:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="av-card space-y-4 p-6 xl:col-span-7"
        >
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Log Station Expense
            </h2>
            <p className="mt-0.5 text-xs text-[#71717A]">
              Record utilities, supplies, filter maintenance, wages, fuel, or rent
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="exp-category"
                className="mb-1.5 block text-xs font-semibold text-[#111111]"
              >
                Category
              </label>
              <select
                id="exp-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
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
                className="mb-1.5 block text-xs font-semibold text-[#111111]"
              >
                Expense Date
              </label>
              <input
                id="exp-date"
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold tabular-nums text-[#111111] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="exp-description"
                className="mb-1.5 block text-xs font-semibold text-[#111111]"
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
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-medium text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="exp-amount"
                className="mb-1.5 block text-xs font-semibold text-[#111111]"
              >
                Amount (₱)
              </label>
              <input
                id="exp-amount"
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-semibold tabular-nums text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="exp-notes"
              className="mb-1.5 block text-xs font-semibold text-[#111111]"
            >
              Notes (optional)
            </label>
            <input
              id="exp-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Receipt number or supplier note"
              className="w-full rounded-2xl border border-[#E4E4E7] bg-[#F8F8FA] px-3.5 py-2.5 text-xs font-normal text-[#111111] placeholder:text-[#A1A1AA] focus:border-[#111111] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting || snapshot.expensesSchemaMissing}
              className="inline-flex items-center gap-2 rounded-full bg-[#111111] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Saving..." : "Record Expense"}
            </button>
          </div>
        </form>

        {/* Categorized Breakdown */}
        <section className="av-card p-6 xl:col-span-5">
          <h2 className="text-base font-bold tracking-tight text-[#111111]">
            Expenses by Category
          </h2>
          <p className="mt-0.5 text-xs text-[#71717A]">
            {snapshot.startDate} to {snapshot.endDate}
          </p>

          <div className="mt-5 space-y-2.5">
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
                  className="rounded-2xl bg-[#F8F8FA] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#111111]">
                      {cat.label}
                    </span>
                    <span className="font-bold tabular-nums text-[#111111]">
                      {formatPHP(cat.total)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E4E4E7]">
                    <div
                      className="h-full rounded-full bg-[#111111] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Expenses Ledger Table */}
      <section className="av-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold tracking-tight text-[#111111]">
              Recorded Expenses ({snapshot.expenses.length})
            </h2>
            <p className="text-xs text-[#71717A]">
              Showing station costs logged in the last {snapshot.rangeDays} days
            </p>
          </div>
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
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                  <th className="w-10 px-3 py-2" />
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
                    className="bg-[#F8F8FA] font-medium text-[#111111] transition hover:bg-[#EFEFF2]"
                  >
                    <td className="rounded-l-2xl px-3 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${exp.description}`}
                        checked={selectedIds.includes(exp.id)}
                        onChange={() => toggleRow(exp.id)}
                        className="h-4 w-4 rounded border-[#D4D4D8] accent-[#111111]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 tabular-nums text-[#52525B]">
                      {exp.expense_date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <StatusChip
                        label={formatCategoryLabel(exp.category)}
                        tone="outline"
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold text-[#111111]">
                        {exp.description}
                      </div>
                      {exp.notes && (
                        <div className="text-[11px] font-normal text-[#71717A]">
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
