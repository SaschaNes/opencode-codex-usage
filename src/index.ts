import { Plugin } from "@opencode/plugin"
import { CodexUsage } from "./rpc.js"
import { parseUsage, type Usage } from "./usage.js"

const URL = "https://chatgpt.com/backend-api/wham/usage"
const INTERVAL = 60_000
const TIMEOUT = 8_000

// The account ID is embedded in the OAuth JWT by OpenAI; it is never sent via RPC/logging.
function accountID(access: string): string | undefined {
  try {
    const part = access.split(".")[1]
    if (!part) return
    const claims = JSON.parse(Buffer.from(part, "base64url").toString())
    const id = claims?.["https://api.openai.com/auth"]?.chatgpt_account_id
    return typeof id === "string" && /^[\w-]{1,128}$/.test(id) ? id : undefined
  } catch { return }
}

export default Plugin.define({
  id: "local.codex-usage",
  async setup(ctx) {
    let snapshot: Usage = { status: "unavailable" }
    let next = 0
    let failures = 0
    let inflight: Promise<void> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    async function refresh() {
      if (stopped || Date.now() < next || inflight) return
      const run = async () => {
        try {
          const connection = await ctx.integration.connection.active("openai")
          const credential = connection && await ctx.integration.connection.resolve(connection)
          if (credential?.type !== "oauth" || !credential.access) {
            snapshot = { status: "unavailable" }
            next = Date.now() + INTERVAL
            return
          }
          const headers: Record<string, string> = { Authorization: `Bearer ${credential.access}`, Accept: "application/json" }
          const id = accountID(credential.access)
          if (id) headers["ChatGPT-Account-Id"] = id
          const response = await fetch(URL, {
            headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT),
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          snapshot = parseUsage(await response.json())
          failures = 0
          next = Date.now() + INTERVAL
        } catch {
          // Do not log exception objects: a provider might put request headers in them.
          snapshot = { status: "unavailable" }
          failures++
          next = Date.now() + Math.min(15 * INTERVAL, INTERVAL * 2 ** Math.min(failures, 4))
        }
      }
      inflight = run().finally(() => { inflight = undefined })
      await inflight
    }

    // Register without waiting for the network; RPC always returns immediately.
    await ctx.rpc.register(CodexUsage, { status: async () => snapshot })
    void refresh()
    const interval = setInterval(() => void refresh(), INTERVAL)

    // A subsequent Codex model call schedules a coalesced refresh. Never touch
    // the model request or response; in particular this keeps WebSockets enabled.
    await ctx.session.hook("model.request", (event) => {
      if (event.model.providerID !== "openai" || stopped || timer) return
      timer = setTimeout(() => {
        timer = undefined
        void refresh()
      }, 12_000)
    }, { providerID: "openai" })

    return () => {
      stopped = true
      clearInterval(interval)
      if (timer) clearTimeout(timer)
    }
  },
})
