import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { config } from './config.js';
import { router } from './api/routes.js';
import { getDb, closeDb } from './storage/sqlite.js';
import { getGraph, startAutoPersist, stopAutoPersist, persistGraph } from './storage/graph.js';

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use(router);

// Serve UI static files (built React app)
const uiDistPath = join(process.cwd(), '../ui/dist');
app.use(express.static(uiDistPath));
app.get('*', (_req, res, next) => {
  // Only serve index.html for non-API routes
  if (_req.path.startsWith('/api/')) return next();
  res.sendFile(join(uiDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// Initialize storage
getDb();
getGraph();
startAutoPersist();

const server = app.listen(config.port, () => {
  console.log(`Knowledge Base Server running on port ${config.port}`);
  console.log(`Data directory: ${config.dataDir}`);
  console.log(`Swagger URLs: ${config.swaggerUrls.length} configured`);
  console.log(`Confluence spaces: ${config.confluence.spaces.length} configured`);
  console.log(`Jira projects: ${config.jira.projectKeys.length} configured`);
});

// Graceful shutdown
function shutdown() {
  console.log('Shutting down...');
  stopAutoPersist();
  persistGraph();
  closeDb();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
