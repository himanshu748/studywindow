import { connectClient, callTool } from './client.js';
import { toolDefinitions, type ToolName } from './service.js';
import { failure } from './errors.js';
const name = process.argv[2] ?? 'health_check';
if (!Object.hasOwn(toolDefinitions, name)) {
  console.error(
    'Usage: npm run call -- search_courses|inspect_course|compare_courses|health_check JSON',
  );
  process.exit(1);
}
const connection = await connectClient();
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
try {
  const result = await callTool(
    connection.client,
    name as ToolName,
    JSON.parse(process.argv[3] ?? '{}'),
    abort.signal,
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (e) {
  console.log(JSON.stringify(failure(e), null, 2));
  process.exitCode = 1;
} finally {
  await connection.close();
}
