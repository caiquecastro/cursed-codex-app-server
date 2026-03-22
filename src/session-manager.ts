import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import WebSocket, { WebSocketServer } from "ws";

import { detectCategory, extractRequestId, safeJsonParse, summarizeMessage } from "./capture.js";
import type { AppConfig } from "./config.js";
import { CaptureStore } from "./store.js";
import type { SessionRecord } from "./types.js";

interface LiveSession {
  id: string;
  client: WebSocket;
  upstream: WebSocket;
  childPid: number | null;
}

export class SessionManager extends EventEmitter {
  private readonly liveSessions = new Map<string, LiveSession>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: CaptureStore
  ) {
    super();
  }

  async attachClient(client: WebSocket, clientAddress: string | null): Promise<string> {
    const sessionId = randomUUID();
    const upstreamPort = await this.findFreePort();
    const listenUrl = `ws://127.0.0.1:${upstreamPort}`;
    const child = spawn(
      this.config.codexPath,
      ["app-server", "--listen", listenUrl, ...this.config.codexArgs],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    this.store.createSession({
      id: sessionId,
      clientAddress,
      status: "starting",
      childPid: child.pid ?? null
    });

    const childErrors: string[] = [];
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      childErrors.push(chunk);
      this.store.addMessage({
        sessionId,
        direction: "outbound",
        category: "error",
        method: "child.stderr",
        requestId: null,
        summary: "child.stderr",
        payload: chunk
      });
    });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.store.addMessage({
        sessionId,
        direction: "outbound",
        category: "event",
        method: "child.stdout",
        requestId: null,
        summary: "child.stdout",
        payload: chunk
      });
    });

    const upstream = await this.connectUpstream(listenUrl, child);
    this.store.updateSession({
      id: sessionId,
      status: "running",
      childPid: child.pid ?? null
    });

    const liveSession: LiveSession = {
      id: sessionId,
      client,
      upstream,
      childPid: child.pid ?? null
    };

    this.liveSessions.set(sessionId, liveSession);
    this.emit("session-started", sessionId);

    client.on("message", (data, isBinary) => {
      const raw = isBinary ? data.toString() : data.toString();
      this.captureAndForward(sessionId, raw, "inbound", upstream);
    });

    upstream.on("message", (data, isBinary) => {
      const raw = isBinary ? data.toString() : data.toString();
      this.captureAndForward(sessionId, raw, "outbound", client);
      this.emit("message", sessionId);
    });

    const closeSession = (status: SessionRecord["status"], error?: string) => {
      if (!this.liveSessions.has(sessionId)) {
        return;
      }

      this.liveSessions.delete(sessionId);
      this.store.updateSession({
        id: sessionId,
        status,
        endedAt: new Date().toISOString(),
        error: error ?? null
      });
      this.emit("session-ended", sessionId);
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.close();
      }
      if (!child.killed) {
        child.kill();
      }
    };

    client.on("close", () => closeSession("stopped"));
    upstream.on("close", () => closeSession("stopped"));
    client.on("error", (error) => closeSession("failed", error.message));
    upstream.on("error", (error) => closeSession("failed", error.message));
    child.on("exit", (code, signal) => {
      const error = code === 0 ? null : `codex exited with code=${code} signal=${signal}`;
      closeSession(error ? "failed" : "stopped", error ?? undefined);
    });

    if (childErrors.length > 0) {
      this.emit("message", sessionId);
    }

    return sessionId;
  }

  listSessions() {
    return this.store.listSessions();
  }

  getSession(sessionId: string) {
    return this.store.getSession(sessionId);
  }

  listMessages(sessionId: string) {
    return this.store.listMessages(sessionId);
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.liveSessions.values()].map(async ({ client, upstream }) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close();
        }
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.close();
        }
      })
    );
    this.store.close();
  }

  private captureAndForward(
    sessionId: string,
    raw: string,
    direction: "inbound" | "outbound",
    target: WebSocket
  ): void {
    const message = safeJsonParse(raw);
    this.store.addMessage({
      sessionId,
      direction,
      category: detectCategory(direction, message),
      method: message?.method ?? null,
      requestId: extractRequestId(message),
      summary: summarizeMessage(message),
      payload: raw
    });

    if (target.readyState === WebSocket.OPEN) {
      target.send(raw);
    }
  }

  private async connectUpstream(listenUrl: string, child: ReturnType<typeof spawn>): Promise<WebSocket> {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      try {
        const upstream = await new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(listenUrl);
          const onError = (error: Error) => {
            ws.removeAllListeners();
            reject(error);
          };

          ws.once("open", () => {
            ws.off("error", onError);
            resolve(ws);
          });
          ws.once("error", onError);
        });

        return upstream;
      } catch (error) {
        if (child.exitCode !== null) {
          throw new Error(`codex app-server exited before accepting connections: ${String(error)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }

    child.kill();
    throw new Error(`Timed out connecting to upstream codex app-server at ${listenUrl}`);
  }

  private async findFreePort(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = new WebSocketServer({ port: 0 }, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Unable to determine free port"));
          return;
        }
        const port = address.port;
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve(port);
        });
      });
      server.once("error", reject);
    });
  }
}
