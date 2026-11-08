import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { StudyError } from './errors.js';
export type Config = { key: string; live: boolean; stateDir: string };
export function loadConfig(): Config {
  const env: Record<string, string | undefined> = { ...process.env };
  if (env.STUDYWINDOW_ENV_FILE) {
    let text: string;
    try {
      text = readFileSync(env.STUDYWINDOW_ENV_FILE, 'utf8');
    } catch {
      throw new StudyError('AUTHENTICATION', 'Cannot read STUDYWINDOW_ENV_FILE.');
    }
    for (const line of text.split(/\r?\n/)) {
      const match = /^(TINYFISH_API_KEY|STUDYWINDOW_LIVE)=(.*)$/.exec(line);
      if (match && match[1] && env[match[1]] === undefined) env[match[1]] = match[2]?.trim();
    }
  }
  return {
    key: env.TINYFISH_API_KEY?.trim() ?? '',
    live: env.STUDYWINDOW_LIVE === '1',
    stateDir: env.STUDYWINDOW_STATE_DIR || join(homedir(), '.config', 'studywindow', 'state'),
  };
}
