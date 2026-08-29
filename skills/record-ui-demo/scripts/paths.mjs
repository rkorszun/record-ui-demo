import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL_TEMPLATES_DIR = path.join(SKILL_DIR, 'templates');
export const USER_CONFIG_DIR = path.join(homedir(), '.config', 'record-ui-demo');
export const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, 'config.json');
export const LEGACY_USER_CONFIG_PATH = path.join(homedir(), '.config', 'nagraj-filmik', 'config.json');

export function projectConfigPath(cwd) {
  return path.join(cwd, '.record-ui-demo.json');
}

export function legacyProjectConfigPath(cwd) {
  return path.join(cwd, '.nagraj-filmik.json');
}

export function projectTemplatesDir(cwd) {
  return path.join(cwd, '.record-ui-demo', 'templates');
}

export function legacyProjectTemplatesDir(cwd) {
  return path.join(cwd, '.nagraj-filmik', 'templates');
}
