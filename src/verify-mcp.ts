import assert from 'node:assert/strict';
import { connectClient, callTool } from './client.js';
process.env.STUDYWINDOW_LIVE = '0';
const connection = await connectClient();
try {
  const listed = await connection.client.listTools();
  const names = listed.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['compare_courses', 'health_check', 'inspect_course', 'search_courses']);
  assert.ok(listed.tools.every((t) => t.inputSchema && t.outputSchema));
  for (const [name, input] of [
    ['search_courses', { topic: 'psychology' }],
    ['inspect_course', { course: 'learning-and-memory-brain' }],
    [
      'compare_courses',
      {
        courses: ['learning-and-memory-brain', 'neuropsychology-decision-making'],
        budget: { amount: 500, currency: 'GBP' },
      },
    ],
    ['health_check', {}],
  ] as const) {
    const result = await callTool(connection.client, name, input);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'LIVE_DISABLED');
  }
  let invalidRejected = false;
  try {
    const result = await connection.client.callTool({
      name: 'search_courses',
      arguments: { topic: 'psychology', limit: 1000 },
    });
    invalidRejected = (result as { isError?: boolean }).isError === true;
  } catch {
    invalidRejected = true;
  }
  assert.ok(invalidRejected);
  console.log(
    JSON.stringify(
      {
        kind: 'offline_protocol_validation',
        passed: true,
        tools: names,
        checks: [
          'official stdio initialize and list',
          'typed inputs and outputs advertised',
          'all four real entry points reject disabled live retrieval',
          'invalid limit rejected',
        ],
        conversation_evidence: false,
      },
      null,
      2,
    ),
  );
} finally {
  await connection.close();
}
