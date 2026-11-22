export function CashierSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--av-backdrop)] p-2 sm:p-4 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1680px] overflow-hidden rounded-[28px] border border-[var(--av-border)] bg-[var(--av-canvas)]">
        <aside className="hidden w-[264px] shrink-0 border-r border-[var(--av-border)] bg-[var(--av-surface)] p-6 lg:block">
          <div className="h-10 w-36 animate-pulse rounded-full bg-[var(--av-surface-subtle)]" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-11 w-full animate-pulse rounded-full bg-[var(--av-surface-subtle)]"
              />
            ))}
          </div>
        </aside>
        <div className="flex-1 p-6 lg:p-8">
          <div className="h-8 w-56 animate-pulse rounded-full bg-[var(--av-surface-subtle)]" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-36 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)]"
              />
            ))}
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="h-96 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)] lg:col-span-7" />
            <div className="h-96 animate-pulse rounded-[24px] border border-[var(--av-border)] bg-[var(--av-surface)] lg:col-span-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
