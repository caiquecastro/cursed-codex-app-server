import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket, { WebSocketServer } from "ws";

import { loadConfig } from "./config.js";
import { SessionManager } from "./session-manager.js";
import { CaptureStore } from "./store.js";

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });

const store = new CaptureStore(config.databasePath);
const sessionManager = new SessionManager(config, store);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../static");

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

  if (requestUrl.pathname === "/api/sessions") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ sessions: sessionManager.listSessions() }));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/sessions/")) {
    const sessionId = requestUrl.pathname.replace("/api/sessions/", "");
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      session,
      messages: sessionManager.listMessages(sessionId)
    }));
    return;
  }

  if (requestUrl.pathname === "/") {
    const indexPath = path.join(publicDir, "index.html");
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(indexPath, "utf8"));
    return;
  }

  if (requestUrl.pathname === "/app.js") {
    const scriptPath = path.join(publicDir, "app.js");
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(fs.readFileSync(scriptPath, "utf8"));
    return;
  }

  if (requestUrl.pathname === "/styles.css") {
    const stylesPath = path.join(publicDir, "styles.css");
    res.setHeader("content-type", "text/css; charset=utf-8");
    res.end(fs.readFileSync(stylesPath, "utf8"));
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
});

const clientWss = new WebSocketServer({ noServer: true });
const dashboardWss = new WebSocketServer({ noServer: true });
let shuttingDown = false;

server.on("upgrade", (req, socket, head) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host}`);

  if (requestUrl.pathname === "/ws") {
    clientWss.handleUpgrade(req, socket, head, (ws) => {
      clientWss.emit("connection", ws, req);
    });
    return;
  }

  if (requestUrl.pathname === "/dashboard-ws") {
    dashboardWss.handleUpgrade(req, socket, head, (ws) => {
      dashboardWss.emit("connection", ws, req);
    });
    return;
  }

  socket.destroy();
});

clientWss.on("connection", async (ws: WebSocket, req) => {
  const clientAddress = req.socket.remoteAddress ?? null;

  try {
    const sessionId = await sessionManager.attachClient(ws, clientAddress);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "wrapper/sessionStarted",
          params: { sessionId }
        })
      );
    }
  } catch (error) {
    const payload = {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error)
      }
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      ws.close();
    }
  }
});

function broadcastDashboardEvent(event: Record<string, unknown>): void {
  const encoded = JSON.stringify(event);
  for (const client of dashboardWss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  }
}

sessionManager.on("session-started", (sessionId: string) => {
  broadcastDashboardEvent({ type: "session-started", sessionId });
});
sessionManager.on("session-ended", (sessionId: string) => {
  broadcastDashboardEvent({ type: "session-ended", sessionId });
});
sessionManager.on("message", (sessionId: string) => {
  broadcastDashboardEvent({ type: "message", sessionId });
});

server.listen(config.port, config.host, () => {
  console.log(`Wrapper listening on http://${config.host}:${config.port}`);
  console.log(`Client WebSocket endpoint: ws://${config.host}:${config.port}/ws`);
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down`);
  await new Promise<void>((resolve, reject) => {
    dashboardWss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    clientWss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await sessionManager.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
