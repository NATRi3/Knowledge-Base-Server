import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(config.dataDir, { recursive: true });
    db = new Database(join(config.dataDir, 'knowledge.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Services discovered from Swagger, code, docs
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      swagger_url TEXT,
      source TEXT NOT NULL, -- 'swagger' | 'confluence' | 'jira' | 'manual'
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- API endpoints from Swagger specs
    CREATE TABLE IF NOT EXISTS api_endpoints (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      method TEXT NOT NULL, -- GET, POST, PUT, DELETE, etc.
      summary TEXT,
      description TEXT,
      operation_id TEXT,
      tags TEXT, -- JSON array
      parameters TEXT, -- JSON
      request_body TEXT, -- JSON
      responses TEXT, -- JSON
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(service_id, path, method)
    );

    -- Documents from Confluence, READMEs, etc.
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL, -- 'confluence' | 'git' | 'manual'
      source_id TEXT, -- external ID (confluence page id, etc.)
      source_url TEXT,
      content TEXT,
      content_type TEXT, -- 'architecture' | 'runbook' | 'adr' | 'meeting_notes' | 'general'
      space TEXT, -- confluence space key
      structuredness TEXT, -- 'structured' | 'semi-structured' | 'unstructured'
      relationship_density TEXT, -- 'high' | 'medium' | 'low'
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Chunks of documents for embedding
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
      service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
      endpoint_id TEXT REFERENCES api_endpoints(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_type TEXT NOT NULL, -- 'page' | 'semantic' | 'endpoint' | 'schema' | 'ticket'
      source_type TEXT NOT NULL, -- 'confluence' | 'swagger' | 'jira' | 'git'
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Embeddings stored as BLOBs
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL UNIQUE REFERENCES chunks(id) ON DELETE CASCADE,
      vector BLOB NOT NULL, -- Float32Array serialized
      model TEXT NOT NULL DEFAULT 'Embeddings',
      dimensions INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Jira tickets
    CREATE TABLE IF NOT EXISTS jira_tickets (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL UNIQUE, -- e.g. PROJ-123
      summary TEXT NOT NULL,
      description TEXT,
      issue_type TEXT, -- 'epic' | 'story' | 'bug' | 'task' | 'subtask'
      status TEXT,
      priority TEXT,
      assignee TEXT,
      reporter TEXT,
      sprint TEXT,
      epic_key TEXT,
      labels TEXT, -- JSON array
      components TEXT, -- JSON array
      links TEXT, -- JSON array of { type, target_key }
      service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Integrations between services (from Swagger cross-refs, docs, etc.)
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      source_service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      target_service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      integration_type TEXT, -- 'rest' | 'kafka' | 'grpc' | 'database' | 'unknown'
      description TEXT,
      endpoint_path TEXT, -- specific endpoint if known
      metadata TEXT, -- JSON
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_service_id, target_service_id, integration_type, endpoint_path)
    );

    -- Graph persistence (serialized graphology state)
    CREATE TABLE IF NOT EXISTS graph_snapshots (
      id INTEGER PRIMARY KEY,
      graph_data TEXT NOT NULL, -- JSON serialized graphology
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Ingestion log
    CREATE TABLE IF NOT EXISTS ingestion_log (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_url TEXT,
      status TEXT NOT NULL, -- 'running' | 'completed' | 'failed'
      items_processed INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_service ON chunks(service_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_type);
    CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_endpoints_service ON api_endpoints(service_id);
    CREATE INDEX IF NOT EXISTS idx_jira_service ON jira_tickets(service_id);
    CREATE INDEX IF NOT EXISTS idx_jira_epic ON jira_tickets(epic_key);
    CREATE INDEX IF NOT EXISTS idx_integrations_source ON integrations(source_service_id);
    CREATE INDEX IF NOT EXISTS idx_integrations_target ON integrations(target_service_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
