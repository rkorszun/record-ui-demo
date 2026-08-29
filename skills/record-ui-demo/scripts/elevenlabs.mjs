import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const API = 'https://api.elevenlabs.io/v1';
export const MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_VOICE = {
  pl: 'JBFqnCBsd6RMkjVDRZzb', // George — multilingual, czytelny PL/EN
  en: 'JBFqnCBsd6RMkjVDRZzb',
};

export function defaultVoiceId(lang) {
  return DEFAULT_VOICE[lang] || DEFAULT_VOICE.en;
}

export async function elevenFetch(apiKey, pathname, { method = 'GET', body, json = true } = {}) {
  const headers = { 'xi-api-key': apiKey };
  if (body && json) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body && json ? JSON.stringify(body) : body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs ${res.status} ${pathname}: ${text.slice(0, 400)}`);
  }
  return res;
}

export async function listVoices(apiKey) {
  const res = await elevenFetch(apiKey, '/voices');
  const data = await res.json();
  return (data.voices || []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    labels: v.labels || {},
  }));
}

export function pickVoice(voices, lang) {
  const needle = lang === 'pl' ? ['polish', 'polski', 'pl'] : ['english', 'en', 'american', 'british'];
  const scored = voices.map((v) => {
    const blob = `${v.name} ${Object.values(v.labels).join(' ')}`.toLowerCase();
    const hit = needle.some((n) => blob.includes(n));
    return { v, hit };
  });
  const match = scored.find((s) => s.hit);
  return (match && match.v.id) || defaultVoiceId(lang);
}

export async function getVoice(apiKey, voiceId) {
  const res = await elevenFetch(apiKey, `/voices/${voiceId}`);
  const v = await res.json();
  return { id: v.voice_id, name: v.name, labels: v.labels || {} };
}

/**
 * Restricted keys often lack `user_read`. TTS still works.
 * Check: /user → /voices → otherwise treat as restricted but usable.
 */
export async function verifyKey(apiKey) {
  try {
    const res = await elevenFetch(apiKey, '/user');
    const user = await res.json();
    return {
      ok: true,
      subscription: (user.subscription && user.subscription.tier) || null,
      characterCount: user.subscription && user.subscription.character_count,
    };
  } catch (err) {
    const msg = String(err.message || err);
    if (!msg.includes('missing_permissions') && !msg.includes('user_read')) throw err;
  }
  try {
    const voices = await listVoices(apiKey);
    return { ok: true, subscription: null, voiceCount: voices.length };
  } catch (err) {
    const msg = String(err.message || err);
    if (!msg.includes('missing_permissions')) throw err;
  }
  return { ok: true, subscription: null, restricted: true };
}

export async function synthesize({ apiKey, voiceId, text, outFile, language }) {
  if (!text || !String(text).trim()) throw new Error('Pusty tekst TTS');
  const res = await elevenFetch(apiKey, `/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    body: {
      text: String(text).trim(),
      model_id: MODEL_ID,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.15,
      },
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, buf);
  return { file: outFile, durationMs: probeDurationMs(outFile), language };
}

export function probeDurationMs(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(`ffprobe nie odczytał długości ${file}: ${r.stderr}`);
  }
  const sec = Number.parseFloat(r.stdout.trim());
  if (!Number.isFinite(sec)) throw new Error(`ffprobe: zły duration dla ${file}`);
  return Math.round(sec * 1000);
}

export function estimatePauseMs(text) {
  return Math.min(2800, 700 + String(text).length * 35);
}
