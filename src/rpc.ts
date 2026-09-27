import { Rpc } from "@opencode/plugin/rpc"

const window = {
  type: "object",
  properties: {
    used: { type: "number" }, remaining: { type: "number" },
    resetsAt: { type: "number" }, minutes: { type: "number" },
  },
  required: ["used", "remaining"],
  additionalProperties: false,
} as const

export const CodexUsage = Rpc.define({
  id: "local.codex-usage",
  events: {},
  methods: {
    status: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ready", "unavailable"] },
          primary: window, secondary: window,
          plan: { type: "string" }, credits: { type: "string" },
          limitReached: { type: "string" }, updatedAt: { type: "number" },
        },
        required: ["status"], additionalProperties: false,
      },
    },
  },
} as const)
