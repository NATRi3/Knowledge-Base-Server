# Enterprise Knowledge Base — Setup

## Prerequisites

1. **Node.js 22+** — https://nodejs.org/
2. **Docker** (для деплоя на VM)

## Quick Start (локальная разработка)

```bash
cd enterprise-knowledge-base

# Установка зависимостей
npm install

# Копируем env и заполняем
cp .env.example .env
# Редактируем .env — вписываем URL и токены

# Запуск сервера (dev mode)
npm run dev:server

# Запуск UI (dev mode, в другом терминале)
npm run dev:ui

# Открыть http://localhost:5173
```

## Docker (деплой на VM)

```bash
# Копируем env и заполняем
cp .env.example .env

# Собираем и запускаем
docker compose up -d --build

# Открыть http://<VM_IP>:3000
```

## MCP Server (подключение к Claude/IDE)

```json
{
  "mcpServers": {
    "enterprise-kb": {
      "command": "npx",
      "args": ["tsx", "packages/mcp/src/index.ts"],
      "env": {
        "KB_URL": "http://localhost:3000"
      }
    }
  }
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/stats | Статистика базы знаний |
| GET | /api/search?q=... | Гибридный поиск |
| GET | /api/services | Список сервисов |
| GET | /api/services/:id | Детали сервиса + endpoints + граф |
| GET | /api/graph | Полный граф архитектуры |
| GET | /api/graph/service/:id | Граф конкретного сервиса |
| GET | /api/graph/neighbors/:nodeId | Соседи ноды |
| GET | /api/graph/dependents/:id | Кто зависит от сервиса |
| GET | /api/graph/dependencies/:id | От кого зависит сервис |
| POST | /api/ingest/trigger | Запуск ingestion (async) |
| POST | /api/ingest/run | Запуск ingestion (sync) |
| GET | /api/ingest/history | История ingestion |

## Environment Variables

Смотри `.env.example` для полного списка.
