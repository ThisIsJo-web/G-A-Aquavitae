"use client";

import { Droplets, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { trackAction } from "@/app/_components/activity-tracker";
import { ThemeToggleButton } from "@/app/_components/theme-provider";

export interface AppNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  href?: string;
}

export interface AppSidebarLink {
  href: string;
  label: string;
  icon: ReactNode;
}

interface AppShellProps {
  roleLabel: string;
  pageTitle: string;
  pageSubtitle?: string;
  navItems: AppNavItem[];
  activeNavId: string;
  onSelectNav?: (id: string) => void;
  secondaryLink?: AppSidebarLink;
  secondaryLinks?: AppSidebarLink[];
  secondaryAction?: {
    label: string;
    sublabel?: string;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
  headerActions?: ReactNode;
  topBanner?: ReactNode;
  user: {
    name: string;
    email: string;
  };
  onSignOut: () => void;
  signingOut?: boolean;
  children: ReactNode;
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AppShell({
  roleLabel,
  pageTitle,
  pageSubtitle,
  navItems,
  activeNavId,
  onSelectNav,
  secondaryLink,
  secondaryLinks,
  secondaryAction,
  headerActions,
  topBanner,
  user,
  onSignOut,
  signingOut,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = getInitials(user.name, user.email);

  const allSecondaryLinks: AppSidebarLink[] = [
    ...(secondaryLink ? [secondaryLink] : []),
    ...(secondaryLinks ?? []),
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)] ring-1 ring-[var(--av-blue-border)]">
              <Droplets className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <div className="text-[15px] font-bold leading-tight tracking-tight text-[var(--av-ink)]">
                G &amp; A Aqua Vitae
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--av-blue-ink)]">
                {roleLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)] lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Vertical Navigation */}
        <nav aria-label="Primary navigation" className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = item.id === activeNavId;
            const sharedClass = `group flex w-full items-center justify-between gap-3 rounded-full px-3 py-2 text-left text-sm font-semibold transition ${
              isActive
                ? "bg-[var(--av-accent)] text-[var(--av-accent-ink)] ring-1 ring-[var(--av-blue-border)] shadow-[0_6px_16px_rgba(20,18,14,0.16)]"
                : "text-[var(--av-ink-secondary)] hover:bg-[var(--av-surface-subtle)] hover:text-[var(--av-ink)]"
            }`;

            const inner = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                      isActive
                        ? "bg-[var(--av-blue)] text-white"
                        : "bg-[var(--av-surface-subtle)] text-[var(--av-ink)] group-hover:bg-[var(--av-blue-soft)] group-hover:text-[var(--av-blue-ink)]"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge !== "" && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                      isActive
                        ? "bg-[var(--av-accent-ink)]/18 text-[var(--av-accent-ink)]"
                        : "bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            );

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    trackAction({
                      module: "navigation",
                      action: `Opened ${item.label}`,
                      controlLabel: item.label,
                    });
                    setMobileOpen(false);
                  }}
                  className={sharedClass}
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  trackAction({
                    module: "navigation",
                    action: `Opened ${item.label} tab`,
                    controlLabel: item.label,
                  });
                  onSelectNav?.(item.id);
                  setMobileOpen(false);
                }}
                className={sharedClass}
              >
                {inner}
              </button>
            );
          })}
        </nav>

        {(allSecondaryLinks.length > 0 || secondaryAction) && (
          <div className="space-y-2 border-t border-[var(--av-border)] pt-4">
            {allSecondaryLinks.map((link) => (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                onClick={() => {
                  trackAction({
                    module: "navigation",
                    action: `Navigated to ${link.label}`,
                    controlLabel: link.label,
                    targetLabel: link.href,
                  });
                  setMobileOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-2 text-xs font-semibold text-[var(--av-ink)] transition hover:border-[var(--av-blue-border)] hover:bg-[var(--av-blue-soft)]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--av-blue-soft)] text-[var(--av-blue-ink)]">
                  {link.icon}
                </span>
                <span className="truncate">{link.label}</span>
              </Link>
            ))}

            {secondaryAction && (
              <button
                type="button"
                disabled={secondaryAction.disabled}
                onClick={() => {
                  trackAction({
                    module: "navigation",
                    action: `Clicked ${secondaryAction.label}`,
                    controlLabel: secondaryAction.label,
                  });
                  setMobileOpen(false);
                  secondaryAction.onClick();
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-[var(--av-ink)] bg-[var(--av-surface)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)] disabled:opacity-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--av-surface-subtle)] text-[var(--av-ink)]">
                  {secondaryAction.icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{secondaryAction.label}</span>
                  {secondaryAction.sublabel && (
                    <span className="block truncate text-[10px] font-normal opacity-70">
                      {secondaryAction.sublabel}
                    </span>
                  )}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pinned User Footer */}
      <div className="mt-6 border-t border-[var(--av-border)] pt-4">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--av-surface-subtle)] p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--av-accent)] text-xs font-bold text-[var(--av-accent-ink)]">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-[var(--av-ink)]">
                {user.name}
              </div>
              <div className="truncate text-[11px] font-normal text-[var(--av-muted)]">
                {user.email}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--av-surface)] text-[var(--av-ink)] ring-1 ring-[var(--av-border-strong)] transition hover:bg-[var(--av-accent)] hover:text-[var(--av-accent-ink)] disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--av-backdrop)] p-0 sm:p-3 md:p-4 lg:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] overflow-x-clip bg-[var(--av-canvas)] sm:min-h-[calc(100vh-1.5rem)] sm:overflow-hidden sm:rounded-[24px] sm:border sm:border-[var(--av-border)] sm:shadow-[0_12px_40px_rgba(20,18,14,0.06)] md:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-3rem)] lg:rounded-[28px]">
        {/* Desktop Sidebar */}
        <aside className="hidden w-[248px] shrink-0 border-r border-[var(--av-border)] bg-[var(--av-surface)] lg:block xl:w-[264px]">
          {sidebarContent}
        </aside>

        {/* Mobile / Tablet Slide-over Sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside className="relative z-10 flex w-[280px] max-w-[85vw] flex-col bg-[var(--av-surface)] shadow-2xl">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Subtle Top Aqua Accent Hairline */}
          <div aria-hidden="true" className="av-top-accent" />
          {/* Top Bar */}
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--av-border)] bg-[var(--av-surface)]/95 px-4 py-3.5 backdrop-blur-xs sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] text-[var(--av-ink)] transition hover:bg-[var(--av-surface-subtle)] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold tracking-tight text-[var(--av-ink)] sm:text-xl lg:text-2xl">
                  {pageTitle}
                </h1>
                {pageSubtitle && (
                  <p className="line-clamp-2 text-xs font-normal text-[var(--av-muted)] sm:line-clamp-1">
                    {pageSubtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {headerActions}
              <ThemeToggleButton />
            </div>
          </header>

          {/* Content Area */}
          <main className="min-w-0 flex-1 space-y-5 p-4 sm:space-y-6 sm:p-6 lg:p-8">
            {topBanner}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
