import path from "node:path";

export interface AppConfig {
  codexPath: string;
  codexArgs: string[];
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), "data");

  return {
    codexPath: process.env.CODEX_PATH || "codex",
    codexArgs: process.env.CODEX_ARGS?.split(" ").filter(Boolean) || [],
    host: process.env.HOST || "127.0.0.1",
    port: parsePort(process.env.PORT, 4123),
    dataDir,
    databasePath: path.resolve(dataDir, "captures.db")
  };
}
