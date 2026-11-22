"use client";

export interface ClientTrackPayload {
  module: string;
  action: string;
  controlLabel?: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  route?: string;
  details?: Record<string, unknown>;
}

const queue: ClientTrackPayload[] = [];
let flushTimer: number | null = null;
let listenersBound = false;

function flushQueue(useBeacon = false) {
  if (typeof window === "undefined" || queue.length === 0) return;
  const batch = queue.splice(0, 25);
  const body = JSON.stringify({ events: batch });

  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/activity", blob);
      return;
    } catch {
      // Fallback to keepalive fetch
    }
  }

  void fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Non-blocking audit telemetry
  });
}

function bindLifecycleFlush() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushQueue(true);
    }
  });
  window.addEventListener("pagehide", () => flushQueue(true));
}

/**
 * Records a user UI interaction (button click, tab switch, filter change) into
 * Superadmin's "Who Did What" audit log without blocking or slowing the UI.
 */
export function trackAction(payload: ClientTrackPayload) {
  if (typeof window === "undefined") return;
  bindLifecycleFlush();

  queue.push({
    ...payload,
    route: payload.route ?? window.location.pathname,
  });

  if (queue.length >= 10) {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushQueue(false);
    return;
  }

  if (flushTimer === null) {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushQueue(false);
    }, 1800);
  }
}
