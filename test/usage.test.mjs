import { test } from "node:test"
import { strict as assert } from "node:assert"
import { parseUsage, windowUsage, remainingTime, bar, windowLabel } from "../src/usage.ts"

test("Codex windows: used is not remaining; resets_at is Unix seconds", () => {
  const usage = parseUsage({ rate_limit: {
    primary_window: { used_percent: 72.3, reset_at: 1780000000, limit_window_minutes: 300 },
    secondary_window: { used_percent: 43, reset_after_seconds: 240 },
  }, plan_type: "plus", credits: { balance: 4.5 } }, 1000)
  assert.equal(usage.primary.used, 72)
  assert.equal(usage.primary.remaining, 28)
  assert.equal(usage.primary.resetsAt, 1780000000000)
  assert.equal(usage.secondary.remaining, 57)
  assert.equal(usage.secondary.resetsAt, 241000)
  assert.equal(usage.credits, "4.5")
  assert.equal(usage.updatedAt, 1000)
})

test("invalid fields are omitted, not displayed as bogus quota", () => {
  assert.equal(windowUsage({ used_percent: 120 }), undefined)
  assert.throws(() => parseUsage({ foo: "bar" }))
  assert.equal(parseUsage({ rate_limit: { secondary_window: { used_percent: 0 } } }).primary, undefined)
})

test("reset countdown rounds up and clamps to zero", () => {
  assert.equal(remainingTime(1000 + (2 * 60 + 14) * 60000, 1000), "2h 14m")
  assert.equal(remainingTime(1000 + (3 * 24 + 8) * 3600000, 1000), "3d 8h")
  assert.equal(remainingTime(999, 1000), "jetzt")
  assert.deepEqual(bar(50, 4), { filled: "━━", empty: "──" })
  assert.equal(windowLabel({ used: 38, remaining: 62, minutes: 10080 }, "Primary"), "Weekly")
})
