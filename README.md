# Codex App-Server Wrapper

Local wrapper around `codex app-server` that:

- exposes its own WebSocket JSON-RPC endpoint at `/ws`
- launches one isolated `codex app-server` child per client session
- captures prompts, responses, notifications, and errors into SQLite
- serves a dashboard for inspecting sessions and raw payloads

## Run

```bash
npm install
npm run build
npm start
```

For local development:

```bash
npm run dev
```

Default URLs:

- Dashboard: `http://127.0.0.1:4123`
- Client WebSocket: `ws://127.0.0.1:4123/ws`

## Interact With Codex

The wrapper forwards JSON-RPC messages to a dedicated `codex app-server` child for each WebSocket client connection and stores all traffic in SQLite.

Connect with any WebSocket client. Example using `npx wscat`:

```bash
npx wscat -c ws://127.0.0.1:4123/ws
```

After connecting, the wrapper sends a session notification like:

```json
{"jsonrpc":"2.0","method":"wrapper/sessionStarted","params":{"sessionId":"<session-id>"}}
```

From there, send the same JSON-RPC messages you would normally send to `codex app-server`. Example:

```json
{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}
```

If you prefer a non-interactive example:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{}}' \
  | npx wscat -c ws://127.0.0.1:4123/ws
```

You can inspect captured sessions over HTTP:

```bash
curl http://127.0.0.1:4123/api/sessions
curl http://127.0.0.1:4123/api/sessions/<session-id>
```

Or open the dashboard in a browser:

```bash
open http://127.0.0.1:4123
```

## Configuration

Environment variables:

- `CODEX_PATH`: path to the `codex` binary, defaults to `codex`
- `CODEX_ARGS`: extra args appended after `codex app-server --listen ...`
- `HOST`: bind address, default `127.0.0.1`
- `PORT`: wrapper port, default `4123`
- `DATA_DIR`: storage directory, default `./data`
