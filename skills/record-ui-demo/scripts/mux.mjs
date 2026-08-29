import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run(args, { check = true } = {}) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (check && r.status !== 0) {
    throw new Error(`ffmpeg failed (${r.status}): ${r.stderr.slice(-800)}`);
  }
  return r;
}

export function ffmpegToMp4Args(webm, mp4) {
  return [
    '-y',
    '-i',
    webm,
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    mp4,
  ];
}

export function webmToMp4(webm, mp4) {
  run(ffmpegToMp4Args(webm, mp4));
}

/**
 * Składa klipy TTS na osi czasu nagrania (startMs od początku wideo).
 * Zwraca ścieżkę do m4a albo null gdy brak klipów.
 */
export async function mixTimeline(clips, outFile) {
  const usable = (clips || []).filter((c) => c && c.file);
  if (!usable.length) return null;
  await mkdir(path.dirname(outFile), { recursive: true });
  if (usable.length === 1 && (usable[0].startMs || 0) === 0) {
    run(['-y', '-i', usable[0].file, '-c:a', 'aac', '-b:a', '192k', outFile]);
    return outFile;
  }
  const work = await mkdtemp(path.join(tmpdir(), 'record-ui-demo-mix-'));
  try {
    const delayed = [];
    for (const [i, clip] of usable.entries()) {
      const delay = Math.max(0, Math.round(clip.startMs || 0));
      const dest = path.join(work, `d-${i}.m4a`);
      run([
        '-y',
        '-i',
        clip.file,
        '-af',
        `adelay=${delay}|${delay}`,
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        dest,
      ]);
      delayed.push(dest);
    }
    if (delayed.length === 1) {
      run(['-y', '-i', delayed[0], '-c', 'copy', outFile]);
      return outFile;
    }
    const args = ['-y'];
    for (const f of delayed) args.push('-i', f);
    const mix = delayed.map((_, i) => `[${i}:a]`).join('');
    args.push(
      '-filter_complex',
      `${mix}amix=inputs=${delayed.length}:duration=longest:dropout_transition=0:normalize=0[a]`,
      '-map',
      '[a]',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outFile,
    );
    run(args);
    return outFile;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export function probeDurationMs(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`ffprobe: ${file}: ${r.stderr}`);
  const sec = Number.parseFloat(r.stdout.trim());
  if (!Number.isFinite(sec)) throw new Error(`ffprobe: zły duration ${file}`);
  return Math.round(sec * 1000);
}

const AUDIO_TAIL_MS = 500;

/**
 * Składa wideo + lektor. `-shortest` ucinało ostatnie zdanie, gdy wideo
 * było krótsze niż adelay+TTS — wtedy dublujemy ostatnią klatkę.
 */
export function muxVideoAudio(videoMp4, audioFile, outFile) {
  const videoMs = probeDurationMs(videoMp4);
  const audioMs = probeDurationMs(audioFile);
  const needMs = audioMs + AUDIO_TAIL_MS;
  const extraSec = Math.max(0, (needMs - videoMs) / 1000);

  if (extraSec > 0.04) {
    run([
      '-y',
      '-i',
      videoMp4,
      '-i',
      audioFile,
      '-filter_complex',
      `[0:v]tpad=stop_mode=clone:stop_duration=${extraSec.toFixed(3)}[v]`,
      '-map',
      '[v]',
      '-map',
      '1:a:0',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outFile,
    ]);
    return;
  }

  run([
    '-y',
    '-i',
    videoMp4,
    '-i',
    audioFile,
    '-filter_complex',
    '[1:a]apad[a]',
    '-map',
    '0:v:0',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    outFile,
  ]);
}

export function extractFps1(mp4, framesDir) {
  run(['-y', '-i', mp4, '-vf', 'fps=1', path.join(framesDir, 'f-%02d.jpg')]);
}

export async function writeTimelineJson(file, timeline) {
  await writeFile(file, `${JSON.stringify(timeline, null, 2)}\n`);
}
