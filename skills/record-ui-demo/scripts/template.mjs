import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadJson } from './config.mjs';
import { legacyProjectTemplatesDir, projectTemplatesDir, SKILL_TEMPLATES_DIR } from './paths.mjs';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR = /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\([^)]+\))$/i;
const ID = /^[a-z][a-z0-9-]{0,62}$/;

export function validateTemplate(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return ['szablon musi być obiektem JSON'];
  if (!ID.test(raw.id || '')) errors.push('id: slug [a-z0-9-], zaczyna się od litery');
  if (!raw.name || typeof raw.name !== 'string') errors.push('name: wymagany string');
  const kicker = raw.kicker || {};
  if (!kicker.pl || !kicker.en) errors.push('kicker.pl i kicker.en są wymagane');
  const card = raw.titleCard || {};
  if (!Array.isArray(card.gradient) || card.gradient.length < 2) {
    errors.push('titleCard.gradient: min. 2 kolory hex');
  } else {
    for (const c of card.gradient) {
      if (!HEX.test(c)) errors.push(`titleCard.gradient: zły kolor ${c}`);
    }
  }
  if (!HEX.test(card.color || '')) errors.push('titleCard.color: hex');
  const hl = raw.highlight || {};
  if (!COLOR.test(hl.outline || '')) errors.push('highlight.outline: hex albo rgba()');
  if (!COLOR.test(hl.fill || '')) errors.push('highlight.fill: hex albo rgba()');
  const label = raw.label || {};
  if (!COLOR.test(label.background || '')) errors.push('label.background: hex albo rgba()');
  if (!COLOR.test(label.color || '')) errors.push('label.color: hex albo rgba()');
  return errors;
}

export async function listTemplateIds(cwd) {
  const dirs = [SKILL_TEMPLATES_DIR];
  if (cwd) {
    dirs.push(projectTemplatesDir(cwd));
    dirs.push(legacyProjectTemplatesDir(cwd));
  }
  const ids = new Set();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (name.endsWith('.json')) ids.add(name.slice(0, -5));
    }
  }
  return [...ids].sort();
}

export async function loadTemplate(id, cwd) {
  const files = [];
  if (cwd) {
    files.push(path.join(projectTemplatesDir(cwd), `${id}.json`));
    files.push(path.join(legacyProjectTemplatesDir(cwd), `${id}.json`));
  }
  files.push(path.join(SKILL_TEMPLATES_DIR, `${id}.json`));
  for (const file of files) {
    const data = await loadJson(file, null);
    if (data) {
      const errors = validateTemplate(data);
      if (errors.length) throw new Error(`Szablon ${id}: ${errors.join('; ')}`);
      return data;
    }
  }
  throw new Error(`Nie ma szablonu „${id}”. Dostępne: ${(await listTemplateIds(cwd)).join(', ')}`);
}

export async function writeTemplate(tpl, { cwd, force = false, intoSkill = false } = {}) {
  const errors = validateTemplate(tpl);
  if (errors.length) {
    const err = new Error(errors.join('\n'));
    err.exitCode = 2;
    throw err;
  }
  const dir = intoSkill || !cwd ? SKILL_TEMPLATES_DIR : projectTemplatesDir(cwd);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${tpl.id}.json`);
  if (existsSync(file) && !force) {
    const err = new Error(`Szablon ${tpl.id} już istnieje (${file}). Użyj --force.`);
    err.exitCode = 2;
    throw err;
  }
  await writeFile(file, `${JSON.stringify(tpl, null, 2)}\n`);
  return file;
}

export async function copyFrom(baseId, id, name, cwd) {
  const base = await loadTemplate(baseId, cwd);
  return { ...base, id, name };
}
