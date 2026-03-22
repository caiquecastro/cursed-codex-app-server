import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import type {
  CapturedMessageRecord,
  MessageCategory,
  SessionRecord,
  SessionStatus,
  TrafficDirection
} from "./types.js";

export class CaptureStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        client_address TEXT,
        child_pid INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        ended_at TEXT,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS captured_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        category TEXT NOT NULL,
        method TEXT,
        request_id TEXT,
        timestamp TEXT NOT NULL,
        summary TEXT,
        payload TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
        ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id_id
        ON captured_messages(session_id, id);
    `);
  }

  createSession(input: {
    id: string;
    clientAddress: string | null;
    status: SessionStatus;
    childPid: number | null;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sessions (
          id, status, client_address, child_pid, created_at, updated_at, ended_at, error
        ) VALUES (
          @id, @status, @client_address, @child_pid, @created_at, @updated_at, NULL, NULL
        )`
      )
      .run({
        id: input.id,
        status: input.status,
        client_address: input.clientAddress,
        child_pid: input.childPid,
        created_at: now,
        updated_at: now
      });
  }

  updateSession(input: {
    id: string;
    status: SessionStatus;
    childPid?: number | null;
    endedAt?: string | null;
    error?: string | null;
  }): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE sessions
         SET status = @status,
             child_pid = COALESCE(@child_pid, child_pid),
             updated_at = @updated_at,
             ended_at = COALESCE(@ended_at, ended_at),
             error = @error
         WHERE id = @id`
      )
      .run({
        id: input.id,
        status: input.status,
        child_pid: input.childPid ?? null,
        updated_at: now,
        ended_at: input.endedAt ?? null,
        error: input.error ?? null
      });
  }

  addMessage(input: {
    sessionId: string;
    direction: TrafficDirection;
    category: MessageCategory;
    method: string | null;
    requestId: string | null;
    summary: string | null;
    payload: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO captured_messages (
          session_id, direction, category, method, request_id, timestamp, summary, payload
        ) VALUES (
          @session_id, @direction, @category, @method, @request_id, @timestamp, @summary, @payload
        )`
      )
      .run({
        session_id: input.sessionId,
        direction: input.direction,
        category: input.category,
        method: input.method,
        request_id: input.requestId,
        timestamp: new Date().toISOString(),
        summary: input.summary,
        payload: input.payload
      });

    this.db
      .prepare(`UPDATE sessions SET updated_at = @updated_at WHERE id = @id`)
      .run({
        id: input.sessionId,
        updated_at: new Date().toISOString()
      });
  }

  listSessions(limit = 100): SessionRecord[] {
    return this.db
      .prepare(
        `SELECT
          id,
          status,
          client_address AS clientAddress,
          child_pid AS childPid,
          created_at AS createdAt,
          updated_at AS updatedAt,
          ended_at AS endedAt,
          error
         FROM sessions
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as SessionRecord[];
  }

  getSession(sessionId: string): SessionRecord | undefined {
    return this.db
      .prepare(
        `SELECT
          id,
          status,
          client_address AS clientAddress,
          child_pid AS childPid,
          created_at AS createdAt,
          updated_at AS updatedAt,
          ended_at AS endedAt,
          error
         FROM sessions
         WHERE id = ?`
      )
      .get(sessionId) as SessionRecord | undefined;
  }

  listMessages(sessionId: string, limit = 500): CapturedMessageRecord[] {
    return this.db
      .prepare(
        `SELECT
          id,
          session_id AS sessionId,
          direction,
          category,
          method,
          request_id AS requestId,
          timestamp,
          summary,
          payload
         FROM captured_messages
         WHERE session_id = ?
         ORDER BY id ASC
         LIMIT ?`
      )
      .all(sessionId, limit) as CapturedMessageRecord[];
  }

  close(): void {
    this.db.close();
  }
}
