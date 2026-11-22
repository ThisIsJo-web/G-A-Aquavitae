import type { KeyboardEvent } from "react";

const ALLOWED_CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Enter",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/**
 * Strictly sanitizes integer input — blocks letters, decimals, e/E, +, and extra signs.
 */
export function sanitizeIntegerInput(
  raw: string,
  options?: { allowNegative?: boolean; maxDigits?: number }
): string {
  const allowNegative = options?.allowNegative ?? false;
  const maxDigits = options?.maxDigits ?? 9;

  let cleaned = raw.replace(allowNegative ? /[^\d-]/g : /\D/g, "");
  if (allowNegative) {
    const isNeg = cleaned.startsWith("-");
    const digits = cleaned.replace(/-/g, "").slice(0, maxDigits);
    cleaned = isNeg ? `-${digits}` : digits;
  } else {
    cleaned = cleaned.slice(0, maxDigits);
  }
  return cleaned;
}

/**
 * Strictly sanitizes decimal/peso input — allows digits and at most one decimal point.
 */
export function sanitizeDecimalInput(
  raw: string,
  maxDecimals = 2,
  maxWholeDigits = 9
): string {
  const stripped = raw.replace(/[^\d.]/g, "");
  const dotIdx = stripped.indexOf(".");
  if (dotIdx === -1) {
    return stripped.slice(0, maxWholeDigits);
  }
  const whole = stripped.slice(0, dotIdx).slice(0, maxWholeDigits);
  const frac = stripped
    .slice(dotIdx + 1)
    .replace(/\./g, "")
    .slice(0, maxDecimals);
  return `${whole || "0"}.${frac}`;
}

/**
 * Strictly sanitizes phone numbers — digits, +, -, spaces, parentheses only.
 */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(/[^\d+\-() ]/g, "").slice(0, 24);
}

/**
 * Prevents non-integer keystrokes immediately (letters, e, E, +, ., symbols).
 */
export function handleIntegerKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  allowNegative = false
) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ALLOWED_CONTROL_KEYS.has(event.key)
  ) {
    return;
  }
  if (/^\d$/.test(event.key)) return;
  if (
    allowNegative &&
    event.key === "-" &&
    event.currentTarget.selectionStart === 0 &&
    !event.currentTarget.value.includes("-")
  ) {
    return;
  }
  event.preventDefault();
}

/**
 * Prevents non-decimal keystrokes immediately (letters, e, E, +, -, second dot).
 */
export function handleDecimalKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ALLOWED_CONTROL_KEYS.has(event.key)
  ) {
    return;
  }
  if (/^\d$/.test(event.key)) return;
  if (event.key === "." && !event.currentTarget.value.includes(".")) return;
  event.preventDefault();
}

/**
 * Prevents letters in phone inputs.
 */
export function handlePhoneKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ALLOWED_CONTROL_KEYS.has(event.key)
  ) {
    return;
  }
  if (/^[\d+\-() ]$/.test(event.key)) return;
  event.preventDefault();
}

export function getTodayManilaIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addIsoDaysClient(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function clampIsoDate(
  value: string,
  minIso: string,
  maxIso: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return maxIso;
  if (value < minIso) return minIso;
  if (value > maxIso) return maxIso;
  return value;
}
