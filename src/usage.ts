// Only non-sensitive values from the Codex usage response may leave the server.
export interface WindowUsage {
  used: number
  remaining: number
  resetsAt?: number // Unix time in milliseconds
  minutes?: number
}

export interface Usage {
  status: "ready" | "unavailable"
  primary?: WindowUsage
  secondary?: WindowUsage
  plan?: string
  credits?: string
  limitReached?: string
  updatedAt?: number
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const safeText = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-zA-Z0-9_. -]{1,40}$/.test(value) ? value : undefined

export function windowUsage(value: unknown, now = Date.now()): WindowUsage | undefined {
  const window = record(value)
  if (!window) return
  const raw = number(window.used_percent)
  if (raw === undefined || raw < 0 || raw > 100) return
  const used = Math.round(raw)
  const reset = number(window.reset_at)
  const after = number(window.reset_after_seconds)
  const seconds = number(window.limit_window_seconds)
  const minutes = number(window.limit_window_minutes) ?? number(window.window_minutes)
    ?? (seconds !== undefined ? seconds / 60 : undefined)
  const resetsAt = reset !== undefined && reset >= 0
    ? reset * 1000
    : after !== undefined && after >= 0 ? now + after * 1000 : undefined
  return {
    used,
    remaining: 100 - used,
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    ...(minutes !== undefined && minutes > 0 ? { minutes } : {}),
  }
}

export function parseUsage(value: unknown, now = Date.now()): Usage {
  const root = record(value)
  const limits = record(root?.rate_limit) ?? record(root?.rate_limits)
  if (!root || !limits) throw new Error("Invalid Codex usage format")
  const primary = windowUsage(limits.primary_window ?? limits.primary, now)
  const secondary = windowUsage(limits.secondary_window ?? limits.secondary, now)
  const credit = record(root.credits ?? limits.credits)
  const balance = credit?.balance
  const credits = typeof balance === "number" && Number.isFinite(balance) && balance >= 0
    ? String(balance)
    : safeText(balance)
  if (!primary && !secondary && !safeText(root.plan_type) && !credits) throw new Error("No usable Codex limits")
  return {
    status: "ready",
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    ...(safeText(root.plan_type) ? { plan: safeText(root.plan_type) } : {}),
    ...(credits ? { credits } : {}),
    ...(safeText(root.rate_limit_reached_type) ? { limitReached: safeText(root.rate_limit_reached_type) } : {}),
    updatedAt: now,
  }
}

export function remainingTime(at: number | undefined, now = Date.now()): string | undefined {
  if (at === undefined || !Number.isFinite(at)) return
  const minutes = Math.max(0, Math.ceil((at - now) / 60_000))
  if (!minutes) return "jetzt"
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  return [days && `${days}d`, hours && `${hours}h`, (mins || (!days && !hours)) && `${mins}m`].filter(Boolean).join(" ")
}

export function bar(used: number, width = 18): { filled: string; empty: string } {
  const count = Math.round(Math.max(0, Math.min(100, used)) * width / 100)
  return { filled: "━".repeat(count), empty: "─".repeat(width - count) }
}

export function windowLabel(window: WindowUsage, fallback: string): string {
  if (window.minutes === 300) return "5h"
  if (window.minutes === 10080) return "Weekly"
  return window.minutes ? `${Math.round(window.minutes / 60)}h` : fallback
}
