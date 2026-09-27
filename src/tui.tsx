import { Plugin } from "@opencode/plugin/tui"
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { CodexUsage } from "./rpc.js"
import { bar, remainingTime, windowLabel, type Usage, type WindowUsage } from "./usage.js"

export default Plugin.define({
  id: "local.codex-usage.tui",
  setup(ctx) {
    const client = ctx.client.rpc(CodexUsage)
    const theme = ctx.theme
    const accent = theme.text.action?.primary?.base ?? theme.text.base

    function Lane(props: { label: string; usage: WindowUsage }) {
      const progress = () => bar(props.usage.used)
      return (
        <box flexDirection="column" paddingTop={1}>
          <box flexDirection="row">
            <text fg={theme.text.base}><b>{props.label}  ·  </b></text>
            <text fg={accent}><b>{props.usage.remaining}% left</b></text>
          </box>
          <box flexDirection="row">
            <text fg={accent}>{progress().filled}</text>
            <text fg={theme.text.muted}>{progress().empty}</text>
          </box>
          <box flexDirection="row">
            <text fg={theme.text.muted}>{props.usage.used}% used</text>
            <Show when={props.usage.resetsAt}>
              <text fg={theme.text.muted}>  ·  ↻ {remainingTime(props.usage.resetsAt)}</text>
            </Show>
          </box>
        </box>
      )
    }

    function Panel() {
      const [usage, setUsage] = createSignal<Usage>({ status: "unavailable" })
      let timer: ReturnType<typeof setInterval> | undefined
      async function update() {
        try {
          const result = await client.status({}) as Usage
          setUsage(result?.status === "ready" ? result : { status: "unavailable" })
        } catch { setUsage({ status: "unavailable" }) }
      }
      onMount(() => {
        void update()
        // Local RPC only; the server independently limits external requests to once per minute.
        timer = setInterval(() => void update(), 15_000)
      })
      onCleanup(() => { if (timer) clearInterval(timer) })
      return (
        <box flexDirection="column" paddingTop={1} paddingBottom={1}>
          <text fg={theme.text.base}><b>Codex Usage</b></text>
          <Show when={usage().status === "ready"} fallback={<text fg={theme.text.muted}>Unavailable</text>}>
            <Show when={usage().primary}>{(value) => <Lane label={windowLabel(value(), "Primary")} usage={value()} />}</Show>
            <Show when={usage().secondary}>{(value) => <Lane label={windowLabel(value(), "Secondary")} usage={value()} />}</Show>
            <box flexDirection="column" paddingTop={1}>
              <Show when={usage().plan || usage().credits !== undefined}>
                <text fg={theme.text.muted}>
                  {[usage().plan, usage().credits !== undefined ? `${usage().credits} credits` : undefined].filter(Boolean).join(" · ")}
                </text>
              </Show>
              <Show when={usage().limitReached}><text fg={theme.text.muted}>Limit: {usage().limitReached}</text></Show>
              <Show when={usage().updatedAt}>
                <text fg={theme.text.muted}>Updated {new Date(usage().updatedAt!).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</text>
              </Show>
            </box>
          </Show>
        </box>
      )
    }

    return ctx.ui.slot({ append: "sidebar.content", render: () => <Panel /> })
  },
})
