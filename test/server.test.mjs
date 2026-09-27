import { test } from "node:test"
import { strict as assert } from "node:assert"
import plugin from "../src/index.ts"

async function probe(credential, response) {
  const original = globalThis.fetch
  let calls = 0
  let status
  globalThis.fetch = async () => {
    calls++
    if (response instanceof Error) throw response
    return response
  }
  try {
    const ctx = {
      integration: { connection: {
        active: async () => credential ? { type: "credential", id: "test" } : undefined,
        resolve: async () => credential,
      } },
      rpc: { register: async (_definition, methods) => { status = methods.status } },
      session: { hook: async () => ({ dispose() {} }) },
    }
    const cleanup = await plugin.setup(ctx)
    await new Promise((resolve) => setTimeout(resolve, 30))
    const result = await status({})
    cleanup()
    return { result, calls }
  } finally { globalThis.fetch = original }
}

test("without OpenAI OAuth never contacts OpenAI", async () => {
  assert.deepEqual(await probe(undefined, new Error("should not call")),
    { result: { status: "unavailable" }, calls: 0 })
})

test("network and HTTP errors stay non-fatal and never expose credentials", async () => {
  const credential = { type: "oauth", access: "secret-test-token" }
  for (const response of [new Error("offline"), { ok: false, status: 401 }, { ok: false, status: 403 }, { ok: false, status: 429 }]) {
    const { result, calls } = await probe(credential, response)
    assert.equal(result.status, "unavailable")
    assert.equal(JSON.stringify(result).includes("secret"), false)
    assert.equal(calls, 1)
  }
})

test("valid response is parsed and exposed without auth data", async () => {
  const { result, calls } = await probe({ type: "oauth", access: "secret-test-token" }, {
    ok: true, json: async () => ({ rate_limit: { primary_window: { used_percent: 38, limit_window_seconds: 604800 } }, plan_type: "prolite" }),
  })
  assert.equal(calls, 1)
  assert.equal(result.primary.minutes, 10080)
  assert.equal(result.primary.remaining, 62)
  assert.equal(JSON.stringify(result).includes("secret"), false)
})
