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

Default URLs:

- Dashboard: `http://127.0.0.1:4123`
- Client WebSocket: `ws://127.0.0.1:4123/ws`

## Configuration

Environment variables:

- `CODEX_PATH`: path to the `codex` binary, defaults to `codex`
- `CODEX_ARGS`: extra args appended after `codex app-server --listen ...`
- `HOST`: bind address, default `127.0.0.1`
- `PORT`: wrapper port, default `4123`
- `DATA_DIR`: storage directory, default `./data`
