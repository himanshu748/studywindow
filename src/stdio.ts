import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './mcp.js';
const handle = serveStdio(() => createServer());
process.once('SIGINT', () => {
  void handle.close();
});
process.once('SIGTERM', () => {
  void handle.close();
});
