export type TrafficDirection = "inbound" | "outbound";
export type MessageCategory = "prompt" | "response" | "event" | "error";
export type SessionStatus = "starting" | "running" | "stopped" | "failed";

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  clientAddress: string | null;
  childPid: number | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  error: string | null;
}

export interface CapturedMessageRecord {
  id: number;
  sessionId: string;
  direction: TrafficDirection;
  category: MessageCategory;
  method: string | null;
  requestId: string | null;
  timestamp: string;
  summary: string | null;
  payload: string;
}

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
  [key: string]: unknown;
}
