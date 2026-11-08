import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { toolDefinitions, type ToolName } from './service.js';
export async function connectClient() {
  const client = new Client({ name: 'studywindow-local-client', version: '0.1.0' });
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (e): e is [string, string] =>
        e[1] !== undefined &&
        (['PATH', 'HOME', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'TMPDIR', 'TINYFISH_API_KEY'].includes(
          e[0],
        ) ||
          e[0].startsWith('STUDYWINDOW_')),
    ),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./stdio.js', import.meta.url))],
    env,
    stderr: 'pipe',
  });
  await client.connect(transport);
  return { client, close: () => client.close() };
}
export async function callTool(
  client: Client,
  tool: ToolName,
  input: unknown,
  signal?: AbortSignal,
) {
  const args = toolDefinitions[tool].input.parse(input);
  const result = await client.callTool(
    { name: tool, arguments: args },
    { timeout: 900000, ...(signal ? { signal } : {}) },
  );
  const legacy = result as {
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };
  const raw =
    legacy.structuredContent ??
    JSON.parse(legacy.content?.find((x) => x.type === 'text')?.text ?? '{}');
  return toolDefinitions[tool].output.parse(raw);
}
