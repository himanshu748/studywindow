import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { connectClient, callTool } from './client.js';
import { loadConfig } from './config.js';
import {
  Budget,
  RESERVED_PER_RUN,
  BROWSER_RESERVATION,
  MAX_BROWSER_SESSIONS,
  MAX_FETCH_URLS,
} from './budget.js';
import { toolDefinitions, type ToolName } from './service.js';
import { failure, StudyError } from './errors.js';
const config = loadConfig(),
  budget = new Budget(config.stateDir);
const port = 4387,
  origin = `http://127.0.0.1:${port}`,
  root = fileURLToPath(new URL('../demo/', import.meta.url)),
  evidence = fileURLToPath(new URL('../evidence/', import.meta.url));
const connection = await connectClient();
let active = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  const json = (data: unknown, status = 200) => {
    if (!res.destroyed) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }
  };
  try {
    if (req.headers.host !== `127.0.0.1:${port}`)
      throw new StudyError('INVALID_INPUT', 'Unexpected local host.');
    const path = new URL(req.url ?? '/', origin).pathname;
    const staticFiles: Record<string, string> = {
      '/': 'landing.html',
      '/landing.html': 'landing.html',
      '/app': 'index.html',
      '/app/': 'index.html',
      '/index.html': 'index.html',
      '/base.css': 'base.css',
      '/styles.css': 'styles.css',
      '/app.js': 'app.js',
      '/landing.css': 'landing.css',
      '/landing.js': 'landing.js',
      '/assets/dmsans.woff2': 'assets/dmsans.woff2',
      '/assets/manrope.woff2': 'assets/manrope.woff2',
    };
    if (req.method === 'GET' && Object.hasOwn(staticFiles, path)) {
      const asset = staticFiles[path]!;
      res.setHeader(
        'Content-Type',
        asset.endsWith('.woff2')
          ? 'font/woff2'
          : asset.endsWith('.css')
            ? 'text/css'
            : asset.endsWith('.js')
              ? 'text/javascript'
              : 'text/html',
      );
      res.end(await readFile(join(root, asset)));
      return;
    }
    if (req.method === 'GET' && path === '/api/status') {
      const u = await budget.status();
      json({
        live_enabled: config.live && Boolean(config.key),
        usage: {
          agent_runs: u.agent_runs,
          agent_reserved_usd: u.agent_reserved_usd,
          fetch_urls: u.fetch_urls,
          browser_sessions: u.browser_sessions,
          browser_reserved_usd: u.browser_reserved_usd,
          total_reserved_usd:
            Math.round((u.agent_reserved_usd + u.browser_reserved_usd) * 1000) / 1000,
          max_usd: u.max_usd,
          max_agent_runs: u.max_agent_runs,
          max_browser_sessions: MAX_BROWSER_SESSIONS,
          max_fetch_urls: MAX_FETCH_URLS,
          agent_reservation_usd: RESERVED_PER_RUN,
          browser_reservation_usd: BROWSER_RESERVATION,
          halted: u.halted,
        },
        receipts: (await readdir(evidence)).filter((n) => /^live-.*\.json$/.test(n)),
      });
      return;
    }
    if (req.method === 'GET' && path === '/api/saved') {
      try {
        json(JSON.parse(await readFile(join(evidence, 'saved-live.json'), 'utf8')));
      } catch {
        json({ kind: 'saved_live_receipts', items: [] });
      }
      return;
    }
    if (req.method === 'POST' && path === '/api/call') {
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json')
        throw new StudyError('INVALID_INPUT', 'Local tool calls require same-origin JSON.');
      if (active) throw new StudyError('BUSY', 'A demo request is already running.', true);
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12000) throw new StudyError('INVALID_INPUT', 'The local request is too large.');
        chunks.push(Buffer.from(chunk));
      }
      let body: { tool?: unknown; input?: unknown };
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof body;
      } catch {
        throw new StudyError('INVALID_INPUT', 'Invalid JSON request.');
      }
      if (typeof body.tool !== 'string' || !Object.hasOwn(toolDefinitions, body.tool))
        throw new StudyError('INVALID_INPUT', 'Unsupported local tool.');
      const controller = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      active = true;
      try {
        json(
          await callTool(connection.client, body.tool as ToolName, body.input, controller.signal),
        );
      } finally {
        active = false;
      }
      return;
    }
    json(failure(new StudyError('NOT_FOUND', 'This local route does not exist.')), 404);
  } catch (error) {
    json(failure(error), error instanceof StudyError && error.code === 'BUSY' ? 409 : 400);
  }
});
server.listen(port, '127.0.0.1', () => console.error(`StudyWindow local demo: ${origin}`));
const close = () => {
  server.close();
  void connection.close();
};
process.once('SIGINT', close);
process.once('SIGTERM', close);
