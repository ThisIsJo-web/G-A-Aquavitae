"use client";

import { Droplets, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

export interface AppNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  href?: string;
}

interface AppShellProps {
  roleLabel: string;
  pageTitle: string;
  pageSubtitle?: string;
  navItems: AppNavItem[];
  activeNavId: string;
  onSelectNav?: (id: string) => void;
  secondaryLink?: {
    href: string;
    label: string;
    icon: ReactNode;
  };
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

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-white">
              <Droplets className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <div className="text-[15px] font-bold leading-tight tracking-tight text-[#111111]">
                G &amp; A Aqua Vitae
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#71717A]">
                {roleLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111] lg:hidden"
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
                ? "bg-[#111111] text-white shadow-[0_6px_16px_rgba(17,17,17,0.16)]"
                : "text-[#3F3F46] hover:bg-[#EFEFF2] hover:text-[#111111]"
            }`;

            const inner = (
              <>
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                      isActive
                        ? "bg-white/15 text-white"
                        : "bg-[#F2F2F4] text-[#111111] group-hover:bg-white"
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
                        ? "bg-white/20 text-white"
                        : "bg-[#F2F2F4] text-[#52525B]"
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
                  onClick={() => setMobileOpen(false)}
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

        {(secondaryLink || secondaryAction) && (
          <div className="space-y-2 border-t border-[#ECECEF] pt-4">
            {secondaryLink && (
              <Link
                href={secondaryLink.href}
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center gap-3 rounded-full border border-[#E4E4E7] bg-white px-3 py-2 text-xs font-semibold text-[#111111] transition hover:bg-[#F4F4F6]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111]">
                  {secondaryLink.icon}
                </span>
                <span className="truncate">{secondaryLink.label}</span>
              </Link>
            )}

            {secondaryAction && (
              <button
                type="button"
                disabled={secondaryAction.disabled}
                onClick={() => {
                  setMobileOpen(false);
                  secondaryAction.onClick();
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#111111] bg-white px-3 py-2.5 text-left text-xs font-semibold text-[#111111] transition hover:bg-[#111111] hover:text-white disabled:opacity-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F2F2F4] text-[#111111]">
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
      <div className="mt-6 border-t border-[#ECECEF] pt-4">
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#F6F6F8] p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#111111] text-xs font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-[#111111]">
                {user.name}
              </div>
              <div className="truncate text-[11px] font-normal text-[#71717A]">
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#111111] ring-1 ring-[#E4E4E7] transition hover:bg-[#111111] hover:text-white disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#EFEFF2] p-2 sm:p-4 lg:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-1rem)] max-w-[1440px] overflow-hidden rounded-[24px] border border-[#E5E5EA] bg-[#F7F7F9] shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-3rem)] lg:rounded-[28px]">
        {/* Desktop Sidebar */}
        <aside className="hidden w-[264px] shrink-0 border-r border-[#EAEAEF] bg-white lg:block">
          {sidebarContent}
        </aside>

        {/* Mobile / Tablet Slide-over Sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-[1px]"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <aside className="relative z-10 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-2xl">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar */}
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECECEF] bg-white/80 px-4 py-4 backdrop-blur-xs sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E4E4E7] bg-white text-[#111111] transition hover:bg-[#F4F4F6] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[#111111] sm:text-2xl">
                  {pageTitle}
                </h1>
                {pageSubtitle && (
                  <p className="text-xs font-normal text-[#71717A]">
                    {pageSubtitle}
                  </p>
                )}
              </div>
            </div>

            {headerActions && (
              <div className="flex flex-wrap items-center gap-2">
                {headerActions}
              </div>
            )}
          </header>

          {/* Content Area */}
          <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
            {topBanner}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
