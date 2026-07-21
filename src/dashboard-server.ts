#!/usr/bin/env node

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3002;
const STATE_FILE = path.join(__dirname, '..', 'thoughtflow-state.json');

// MIME types
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

// Find available port
function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(startPort, () => {
      const port = (server.address() as any).port;
      server.close(() => resolve(port));
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // API endpoint to get state
  if (url.pathname === '/api/state') {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ strategies: [], tasks: [], trees: [], workflows: [], cognitiveLinks: [] }));
        return;
      }

      const content = fs.readFileSync(STATE_FILE, 'utf-8');
      if (!content || content.trim() === '') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ strategies: [], tasks: [], trees: [], workflows: [], cognitiveLinks: [] }));
        return;
      }

      const state = JSON.parse(content);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
    } catch (error) {
      console.error('Error reading state:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read state' }));
    }
    return;
  }

  // API endpoint to get state with timestamp
  if (url.pathname === '/api/state/info') {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists: false, lastModified: null }));
        return;
      }

      const stats = fs.statSync(STATE_FILE);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        exists: true,
        lastModified: stats.mtime.toISOString(),
        size: stats.size
      }));
    } catch (error) {
      console.error('Error reading state info:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read state info' }));
    }
    return;
  }

  // API endpoint to clear state
  if (url.pathname === '/api/state/clear' && req.method === 'POST') {
    try {
      const emptyState = {
        strategies: {},
        tasks: {},
        trees: {},
        workflows: {},
        workflowRuns: {},
        cognitiveLinks: {}
      };
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(emptyState, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'State cleared successfully' }));
    } catch (error) {
      console.error('Error clearing state:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to clear state' }));
    }
    return;
  }

  // Serve static files from public directory
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    const filePath = path.join(__dirname, '..', 'public', 'dashboard.html');
    serveFile(filePath, res);
    return;
  }

  // Try to serve from public directory
  const filePath = path.join(__dirname, '..', 'public', url.pathname);
  serveFile(filePath, res);
});

function serveFile(filePath: string, res: http.ServerResponse): void {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server Error');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Start server with automatic port selection
findAvailablePort(DEFAULT_PORT).then(port => {
  server.listen(port, () => {
    console.log(`Thoughtflow Dashboard server running at http://localhost:${port}`);
    console.log(`Dashboard: http://localhost:${port}/dashboard`);
    console.log(`API: http://localhost:${port}/api/state`);
    console.log(`State Info: http://localhost:${port}/api/state/info`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export { server };
