import type { JsonRpcMessage, MessageCategory } from "./types.js";

export function safeJsonParse(raw: string): JsonRpcMessage | null {
  try {
    return JSON.parse(raw) as JsonRpcMessage;
  } catch {
    return null;
  }
}

export function detectCategory(direction: "inbound" | "outbound", message: JsonRpcMessage | null): MessageCategory {
  if (!message) {
    return "error";
  }

  if (message.error) {
    return "error";
  }

  if (direction === "inbound") {
    return "prompt";
  }

  if (typeof message.method === "string" && message.id === undefined) {
    return "event";
  }

  return "response";
}

export function extractRequestId(message: JsonRpcMessage | null): string | null {
  if (!message || message.id === undefined || message.id === null) {
    return null;
  }

  return String(message.id);
}

export function summarizeMessage(message: JsonRpcMessage | null): string | null {
  if (!message) {
    return "Invalid JSON-RPC payload";
  }

  if (typeof message.method === "string") {
    return message.method;
  }

  if (message.error && typeof message.error === "object" && message.error !== null) {
    const code = "code" in message.error ? String(message.error.code) : "unknown";
    return `error:${code}`;
  }

  if ("result" in message) {
    return "result";
  }

  return "message";
}
