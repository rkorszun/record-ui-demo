import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  LEGACY_USER_CONFIG_PATH,
  legacyProjectConfigPath,
  projectConfigPath,
  USER_CONFIG_DIR,
  USER_CONFIG_PATH,
} from './paths.mjs';

function maskKey(key) {
  if (!key) return null;
  if (key.length < 8) return '***';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function loadJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    throw new Error(`Unreadable JSON: ${file}`);
  }
}

export async function loadUserConfig() {
  const current = await loadJson(USER_CONFIG_PATH, null);
  if (current) return current;
  return (await loadJson(LEGACY_USER_CONFIG_PATH, {})) || {};
}

export async function loadProjectConfig(cwd) {
  const current = await loadJson(projectConfigPath(cwd), null);
  if (current) return current;
  return (await loadJson(legacyProjectConfigPath(cwd), {})) || {};
}

export async function saveUserConfig(patch) {
  await mkdir(USER_CONFIG_DIR, { recursive: true, mode: 0o700 });
  const current = await loadUserConfig();
  const next = { ...current, ...patch };
  if (patch.voiceId) {
    next.voiceId = { ...(current.voiceId || {}), ...patch.voiceId };
  }
  await writeFile(USER_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await chmod(USER_CONFIG_PATH, 0o600);
  return next;
}

export async function saveProjectConfig(cwd, patch) {
  const file = projectConfigPath(cwd);
  const current = await loadProjectConfig(cwd);
  const next = { ...current, ...patch };
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function resolveApiKey(user) {
  return process.env.ELEVENLABS_API_KEY || user.elevenlabsApiKey || null;
}

export function publicStatus({ user, project, templates, voiceWanted }) {
  const apiKey = resolveApiKey(user);
  const language = project.language || null;
  const template = project.template || null;
  const voiceId = (user.voiceId && (language ? user.voiceId[language] : null)) || null;
  const need = [];
  if (!language) need.push('language');
  if (!template) need.push('template');
  if (voiceWanted && !apiKey) need.push('apiKey');
  if (voiceWanted && apiKey && language && !(user.voiceId && user.voiceId[language])) {
    need.push('voiceId');
  }
  return {
    need,
    have: {
      language,
      template,
      apiKey: Boolean(apiKey),
      apiKeyPreview: maskKey(apiKey),
      voiceId: Boolean(voiceId),
    },
    project,
    templates,
    userConfig: existsSync(USER_CONFIG_PATH) ? USER_CONFIG_PATH : LEGACY_USER_CONFIG_PATH,
    outputDir: project.outputDir || 'docs/videos',
    appUrl: project.appUrl || null,
  };
}
