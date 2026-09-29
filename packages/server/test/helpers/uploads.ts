import type { OriginAgent } from './context.js';
import { TINY_YAML } from './guides.js';

/** Creates a run through POST /api/runs and returns its id. */
export async function uploadRun(
  agent: OriginAgent,
  source: string = TINY_YAML,
  fileName = 'tiny.yaml',
): Promise<string> {
  const res = await agent.post('/api/runs').attach('file', Buffer.from(source), fileName);
  if (res.status !== 201) throw new Error(`uploadRun: ${res.status} ${res.text}`);
  return (res.body as { runId: string }).runId;
}
