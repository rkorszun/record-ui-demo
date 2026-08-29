#!/usr/bin/env node
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  loadProjectConfig,
  loadUserConfig,
  publicStatus,
  resolveApiKey,
  saveProjectConfig,
  saveUserConfig,
} from './config.mjs';
import {
  defaultVoiceId,
  estimatePauseMs,
  listVoices,
  pickVoice,
  synthesize,
  verifyKey,
} from './elevenlabs.mjs';
import { extractFps1, mixTimeline, muxVideoAudio, webmToMp4, writeTimelineJson } from './mux.mjs';
import {
  clearHighlight,
  cursorInit,
  endCard,
  highlight,
  humanClick,
  humanType,
  pause,
  pointerTo,
  titleCard,
} from './overlay.mjs';
import { projectConfigPath, SKILL_DIR } from './paths.mjs';
import { copyFrom, listTemplateIds, loadTemplate, writeTemplate } from './template.mjs';

function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else flags._.push(a);
  }
  return flags;
}

function cwdFrom(flags) {
  return path.resolve(flags.cwd || process.cwd());
}

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function cmdNeed(flags) {
  const cwd = cwdFrom(flags);
  const user = await loadUserConfig();
  const project = await loadProjectConfig(cwd);
  const templates = await listTemplateIds(cwd);
  const status = publicStatus({ user, project, templates, voiceWanted: Boolean(flags.voice) });
  out(status);
  process.exit(status.need.length ? 2 : 0);
}

async function cmdListTemplates(flags) {
  const cwd = cwdFrom(flags);
  out({ templates: await listTemplateIds(cwd) });
}

async function cmdNewTemplate(flags) {
  const cwd = cwdFrom(flags);
  const id = flags.id;
  if (!id) fail('new-template wymaga --id', 2);
  let tpl;
  if (flags.from) {
    tpl = await copyFrom(flags.from, id, flags.name || id, cwd);
  } else {
    const gradient = String(flags.gradient || '#0d2f5c,#1a5cad,#3b82c4')
      .split(',')
      .map((s) => s.trim());
    tpl = {
      id,
      name: flags.name || id,
      kicker: {
        pl: flags['kicker-pl'] || 'Instrukcja',
        en: flags['kicker-en'] || 'Tutorial',
      },
      titleCard: {
        gradient,
        color: flags['title-color'] || '#ffffff',
        font: flags.font || 'ui-sans-serif, system-ui, sans-serif',
      },
      highlight: {
        outline: flags.outline || '#f59e0b',
        fill: flags.fill || 'rgba(245, 158, 11, .18)',
      },
      label: {
        background: flags['label-bg'] || '#111827',
        color: flags['label-color'] || '#ffffff',
      },
    };
  }
  if (flags.name) tpl.name = flags.name;
  const file = await writeTemplate(tpl, {
    cwd,
    force: Boolean(flags.force),
    intoSkill: Boolean(flags.skill),
  });
  out({ ok: true, file, id: tpl.id });
}

async function cmdSetConfig(flags) {
  const patch = {};
  const key = flags['api-key'] === true ? null : flags['api-key'] || process.env.ELEVENLABS_API_KEY;
  if (key) {
    const info = await verifyKey(key);
    patch.elevenlabsApiKey = key;
    patch.verifiedAt = new Date().toISOString();
    patch.subscription = info.subscription || null;
    if (info.restricted) patch.restrictedKey = true;
  }
  const voiceId = {};
  if (flags['voice-pl']) voiceId.pl = flags['voice-pl'];
  if (flags['voice-en']) voiceId.en = flags['voice-en'];
  if (key && flags['pick-voices']) {
    const voices = await listVoices(key);
    if (!voiceId.pl) voiceId.pl = pickVoice(voices, 'pl');
    if (!voiceId.en) voiceId.en = pickVoice(voices, 'en');
  }
  if (Object.keys(voiceId).length) patch.voiceId = voiceId;
  if (!Object.keys(patch).length) fail('set-config: podaj --api-key albo ELEVENLABS_API_KEY albo --voice-pl/--voice-en');
  const saved = await saveUserConfig(patch);
  out({
    ok: true,
    apiKey: Boolean(saved.elevenlabsApiKey),
    voiceId: saved.voiceId || null,
    subscription: saved.subscription || null,
  });
}

async function cmdSetProject(flags) {
  const cwd = cwdFrom(flags);
  const patch = {};
  if (flags.language) {
    if (!['pl', 'en'].includes(flags.language)) fail('language: pl albo en', 2);
    patch.language = flags.language;
  }
  if (flags.template) {
    await loadTemplate(flags.template, cwd);
    patch.template = flags.template;
  }
  if (flags['app-url']) patch.appUrl = flags['app-url'];
  if (flags['output-dir']) patch.outputDir = flags['output-dir'];
  const saved = await saveProjectConfig(cwd, patch);
  out({ ok: true, file: projectConfigPath(cwd), project: saved });
}

async function cmdListVoices(flags) {
  const user = await loadUserConfig();
  const apiKey = resolveApiKey(user);
  if (!apiKey) fail('Brak klucza. set-config --api-key albo ELEVENLABS_API_KEY', 2);
  const voices = await listVoices(apiKey);
  out({ voices: voices.map((v) => ({ id: v.id, name: v.name, labels: v.labels })) });
}

async function cmdDoctor() {
  const checks = {};
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  checks.ffmpeg = ffmpeg.status === 0 ? ffmpeg.stdout.split('\n')[0] : null;
  const ffprobe = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' });
  checks.ffprobe = ffprobe.status === 0 ? ffprobe.stdout.split('\n')[0] : null;
  checks.node = process.version;
  const major = Number.parseInt(String(process.versions.node).split('.')[0], 10);
  checks.nodeOk = major >= 24;
  try {
    await import('playwright');
    checks.playwright = true;
  } catch {
    checks.playwright = false;
  }
  const user = await loadUserConfig();
  checks.userConfig = Boolean(user.elevenlabsApiKey);
  const ok = Boolean(checks.ffmpeg && checks.ffprobe && checks.playwright && checks.nodeOk);
  out({ ok, checks });
  process.exit(ok ? 0 : 2);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    fail(
      `Playwright nie jest zainstalowany. W ${SKILL_DIR}: npm install`,
    );
  }
}

function pickText(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value.pl || value.en || '';
}

async function cmdRecord(flags) {
  const cwd = cwdFrom(flags);
  const scenarioPath = flags.scenario;
  if (!scenarioPath || flags.scenario === true) fail('record wymaga --scenario <plik.mjs>');
  const absScenario = path.resolve(cwd, scenarioPath);
  if (!existsSync(absScenario)) fail(`Nie ma scenariusza: ${absScenario}`);

  const user = await loadUserConfig();
  const project = await loadProjectConfig(cwd);
  const language = flags.language || project.language;
  if (!language) fail('Brak języka. set-project --language pl|en albo --language', 2);
  const templateId = flags.template || project.template;
  if (!templateId) fail('Brak szablonu. set-project --template <id>', 2);
  const template = await loadTemplate(templateId, cwd);
  const noVoice = Boolean(flags['no-voice']);
  const apiKey = resolveApiKey(user);
  const voiceOn = !noVoice && Boolean(apiKey);
  const voiceId = (user.voiceId && user.voiceId[language]) || defaultVoiceId(language);

  const scenario = await import(pathToFileURL(absScenario).href);
  const meta = scenario.meta || {};
  const slug = flags.slug || meta.slug;
  if (!slug) fail('meta.slug albo --slug jest wymagane');
  if (typeof scenario.run !== 'function') fail('scenariusz musi eksportować async function run(ctx)');

  const appUrl = flags['app-url'] || meta.appUrl || project.appUrl;
  const outputDir = path.resolve(cwd, flags['output-dir'] || project.outputDir || 'docs/videos');
  await mkdir(outputDir, { recursive: true });
  const workDir = path.join(outputDir, `.work-${slug}`);
  await mkdir(workDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: language === 'en' ? 'en-US' : 'pl-PL',
    recordVideo: { dir: workDir, size: { width: 1440, height: 900 } },
  });
  await context.addInitScript(cursorInit, template);
  const page = await context.newPage();
  const t0 = Date.now();
  const timeline = [];
  let clipIndex = 0;
  let audioUntil = 0;
  const LEAD_MIN = 480;
  const LEAD_MAX = 820;
  const LEAD_RATIO = 0.3;

  async function waitAudioTail() {
    const leftover = audioUntil - (Date.now() - t0);
    if (leftover > 40) await pause(page, leftover);
  }

  async function speak(text, opts = {}) {
    const spoken = String(text || '').trim();
    if (!spoken) return;
    const wait = opts.wait === 'full' ? 'full' : 'lead';
    if (!voiceOn) {
      await pause(page, wait === 'full' ? estimatePauseMs(spoken) : Math.min(700, estimatePauseMs(spoken) * 0.3));
      return;
    }
    await waitAudioTail();
    const file = path.join(workDir, `tts-${String(clipIndex).padStart(3, '0')}.mp3`);
    clipIndex += 1;
    const { durationMs } = await synthesize({
      apiKey,
      voiceId,
      text: spoken,
      outFile: file,
      language,
    });
    const startMs = Date.now() - t0;
    timeline.push({ startMs, file, durationMs, text: spoken });
    audioUntil = startMs + durationMs;
    if (wait === 'full') {
      await pause(page, durationMs + 400);
      return;
    }
    const lead = Math.round(Math.min(LEAD_MAX, Math.max(LEAD_MIN, durationMs * LEAD_RATIO)));
    await pause(page, Math.min(lead, durationMs));
  }

  const ctx = {
    page,
    lang: language,
    template,
    appUrl,
    speak,
    humanClick: (locator, label) => humanClick(page, locator, label),
    humanType: (locator, value, delay) => humanType(page, locator, value, delay),
    pointerTo: (x, y, steps) => pointerTo(page, x, y, steps),
    pause: (ms) => pause(page, ms),
    highlight: (locator, text) => highlight(page, locator, text),
    clearHighlight: () => clearHighlight(page),
    titleCard: (title, subtitle, holdMs, kicker) =>
      titleCard(
        page,
        title,
        subtitle,
        holdMs,
        kicker || template.kicker[language],
        template,
      ),
    endCard: (title, subtitle, holdMs, kicker) =>
      endCard(
        page,
        title,
        subtitle,
        holdMs,
        kicker || pickText(template.end && template.end.kicker, language) || (language === 'en' ? 'The end' : 'Koniec'),
        template,
      ),
  };

  try {
    if (!meta.skipTitleCard) {
      await titleCard(
        page,
        pickText(meta.title, language) || slug,
        pickText(meta.subtitle, language) ||
          (language === 'en'
            ? 'Yellow outline shows the target. White arrow is the mouse.'
            : 'Żółta ramka pokazuje, gdzie kliknąć. Biała strzałka to kursor myszy.'),
        meta.titleHoldMs || 3600,
        pickText(meta.kicker, language) || template.kicker[language],
        template,
      );
    }
    await scenario.run(ctx);
    await waitAudioTail();
    if (!meta.skipEndCard) {
      const end = (template.end && template.end) || {};
      await endCard(
        page,
        pickText(meta.endTitle, language) || pickText(end.title, language) || (language === 'en' ? 'Thank you' : 'Dziękujemy'),
        pickText(meta.endSubtitle, language) ||
          pickText(end.subtitle, language) ||
          (language === 'en' ? 'See you in the next tutorial.' : 'Do zobaczenia w kolejnej instrukcji.'),
        meta.endHoldMs || 2800,
        pickText(meta.endKicker, language) || pickText(end.kicker, language) || (language === 'en' ? 'The end' : 'Koniec'),
        template,
      );
      await speak(
        pickText(meta.endVoice, language) ||
          pickText(end.voice, language) ||
          (language === 'en' ? 'Thanks for watching.' : 'Dziękujemy za uwagę.'),
        { wait: 'full' },
      );
    }
    await waitAudioTail();
    await pause(page, 700);
  } finally {
    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();
    const webm = video ? await video.path() : null;
    if (!webm || !existsSync(webm)) fail('Playwright nie zapisał webm');

    const silentMp4 = path.join(workDir, `${slug}-silent.mp4`);
    webmToMp4(webm, silentMp4);
    const finalMp4 = path.join(outputDir, `${slug}.mp4`);
    if (voiceOn && timeline.length) {
      const audioFile = path.join(workDir, 'voice.m4a');
      await mixTimeline(timeline, audioFile);
      const mixed = path.join(workDir, `${slug}-mux.mp4`);
      muxVideoAudio(silentMp4, audioFile, mixed);
      await copyFile(mixed, finalMp4);
    } else {
      await copyFile(silentMp4, finalMp4);
    }
    const framesDir = path.join(workDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    extractFps1(finalMp4, framesDir);
    await writeTimelineJson(path.join(workDir, 'timeline.json'), timeline);
    await rm(webm, { force: true });
    out({
      ok: true,
      mp4: finalMp4,
      framesDir,
      voice: voiceOn,
      clips: timeline.length,
      slug,
      language,
      template: templateId,
    });
  }
}

function help() {
  process.stdout.write(`record-ui-demo workflow
  need [--cwd DIR] [--voice]
  list-templates [--cwd DIR]
  new-template --id ID [--from ocean] [--name NAME] [--cwd DIR] [--skill] [--force]
  set-config --api-key KEY | ELEVENLABS_API_KEY [--voice-pl ID] [--voice-en ID] [--pick-voices]
  set-project --cwd DIR [--language pl|en] [--template ID] [--app-url URL] [--output-dir DIR]
  list-voices
  record --scenario FILE [--cwd DIR] [--no-voice] [--slug SLUG]
  doctor
`);
}

const flags = parseArgs(process.argv.slice(2));
const cmd = flags._[0];

try {
  if (cmd === 'need') await cmdNeed(flags);
  else if (cmd === 'list-templates') await cmdListTemplates(flags);
  else if (cmd === 'new-template') await cmdNewTemplate(flags);
  else if (cmd === 'set-config') await cmdSetConfig(flags);
  else if (cmd === 'set-project') await cmdSetProject(flags);
  else if (cmd === 'list-voices') await cmdListVoices(flags);
  else if (cmd === 'doctor') await cmdDoctor();
  else if (cmd === 'record') await cmdRecord(flags);
  else {
    help();
    process.exit(cmd ? 2 : 0);
  }
} catch (err) {
  fail(err.message || String(err), err.exitCode || 1);
}
