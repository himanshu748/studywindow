import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StudyError } from './errors.js';
export type FetchPricingTier = 'hobby' | 'builder';
export type Config = {
  key: string;
  live: boolean;
  stateDir: string;
  fetchTier?: FetchPricingTier;
};
export function parseFetchTier(value: unknown): FetchPricingTier | undefined {
  if (value === undefined) return undefined;
  if (value === 'hobby' || value === 'builder') return value;
  throw new StudyError(
    'INVALID_INPUT',
    'STUDYWINDOW_FETCH_TIER must be hobby or builder when supplied.',
  );
}
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const env: Record<string, string | undefined> = { ...environment };
  if (env.STUDYWINDOW_ENV_FILE) {
    let text: string;
    try {
      text = readFileSync(env.STUDYWINDOW_ENV_FILE, 'utf8');
    } catch {
      throw new StudyError('AUTHENTICATION', 'Cannot read STUDYWINDOW_ENV_FILE.');
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^(TINYFISH_API_KEY|STUDYWINDOW_LIVE|STUDYWINDOW_FETCH_TIER)=(.*)$/.exec(line);
      if (match && match[1] && env[match[1]] === undefined) env[match[1]] = match[2]?.trim();
    }
  }
  const fetchTier = parseFetchTier(env.STUDYWINDOW_FETCH_TIER);
  return {
    key: env.TINYFISH_API_KEY?.trim() ?? '',
    live: env.STUDYWINDOW_LIVE === '1',
    stateDir: env.STUDYWINDOW_STATE_DIR || join(homedir(), '.config', 'studywindow', 'state'),
    ...(fetchTier === undefined ? {} : { fetchTier }),
  };
}
