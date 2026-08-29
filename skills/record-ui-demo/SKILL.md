---
name: record-ui-demo
description: >-
  Nagrywa filmiki instruktażowe UI (Playwright + ffmpeg) z widoczną białą
  strzałką myszy (płynny lot w klatkach, nie teleport), żółtą ramką celu,
  numerowaną etykietą kliknięcia i opcjonalnym podkładem ElevenLabs (PL/EN).
  Używaj gdy użytkownik prosi: nagraj filmik, nagranie, tutorial, demo,
  screencast, jak kliknąć, record a demo video, how-to video, kursor myszki,
  voiceover, elevenlabs, szablon filmu, new video template. Nie używaj
  przeglądarki Cursor do nagrania — nie ma kursora OS w klatkach.
---

# Record UI demo

How-to clicks. The viewer must see **where the pointer is** and **what to click**.
Optional voiceover: ElevenLabs `eleven_multilingual_v2` (pl or en).

## Hard rules (from production)

1. **Playwright `recordVideo`**, not the Cursor browser and not an OS screen capture. Headless Chromium **does not record the OS cursor** — use this skill's overlay.
2. **White arrow** (black outline, shadow). Motion **in frames** (`pointerTo`), never a snap after `mouse.move`.
3. **Before every click** (required, together): amber outline, black numbered label in the film language, arrow **arrives** via `pointerTo`, then **≥800 ms pause**, only then `mouse.click`.
4. `locator.hover()` / `locator.click()` **are not enough**. **Forbidden:** `mouse.move` + one `__demoMovePointer` snap. Always `pointerTo`.
5. After recording **verify frames** (`framesDir` from `record`). If a click frame is missing the arrow **and** outline **and** label — re-record. `fps=1` will not show the flight — check smoothness in the mp4.
6. Outline **must not** match the UI brand color if the app is the same hue (a blue outline on a blue UI disappears). Title cards may use brand colors.
7. Missing ElevenLabs key or `--no-voice` → silent mp4, no fake narrator.
8. Voiceover: `speak()` places the clip **after** TTS. Default wait is only the start of the sentence (~0.5 s); the rest plays **over the action** (`humanClick`). `speak(text, { wait: 'full' })` — whole sentence (splash, thank-you). Mux does not cut the tail (clones the last frame).

## Entry: only `workflow.mjs`

Do not stitch TTS + Playwright + ffmpeg by hand. Skill dir: this folder (the directory that contains this `SKILL.md`).

```bash
WF="<skill-dir>/scripts/workflow.mjs"
node "$WF" need --cwd <project>          # exit 2 = missing fields
node "$WF" need --cwd <project> --voice   # also requires API key
node "$WF" list-templates --cwd <project>
node "$WF" doctor
node "$WF" record --cwd <project> --scenario /tmp/scenario.mjs
```

Agent: run `need` → `AskQuestion` for the JSON list → `set-project` / `set-config` → `record`. **Do not echo** the API key in chat.

## Memory

| What | Where | Commit? |
|----|--------|---------|
| `elevenlabsApiKey`, `voiceId.pl`, `voiceId.en` | `~/.config/record-ui-demo/config.json` (chmod 600) or `ELEVENLABS_API_KEY` | no |
| `language`, `template`, `appUrl`, `outputDir` | `<project>/.record-ui-demo.json` | yes |
| Project templates | `<project>/.record-ui-demo/templates/<id>.json` | yes |
| Built-in presets | `templates/ocean.json`, `midnight.json`, `daylight.json` | yes |

Default output: `docs/videos/<slug>.mp4` (do not commit mp4). Skill + project templates merge by `id` (project wins). Legacy `nagraj-filmik` config paths are read if the new files are missing.

## Recording workflow

1. `doctor` — ffmpeg, ffprobe, Playwright (`npm install` in the skill directory, **not** in the app `package.json`). Node 24+.
2. `need --cwd <project> --voice` if the user wants a narrator. Missing `language`/`template` → ask (`pl`/`en`, list from `list-templates`). Missing `apiKey` → ask for the key (paste in chat or env), then `set-config --api-key … --pick-voices`. Do not log the key.
3. Start the app (UI at `appUrl` from config).
4. Write the scenario to `/tmp/<slug>.mjs` (skeleton below). Do not add Playwright to the app repo for one video.
5. `record --scenario …`. Conversion and mux live in the CLI.
6. Read click frames from `framesDir`, open the mp4. Revert demo data. Mail only to a local SMTP.

## Scenario skeleton

```js
export const meta = {
  slug: 'sign-in',
  title: { pl: 'Logowanie', en: 'Sign in' },
  subtitle: {
    pl: 'Żółta ramka pokazuje, gdzie kliknąć. Biała strzałka to kursor myszy.',
    en: 'Yellow outline shows the target. White arrow is the mouse.',
  },
};

export async function run({ page, appUrl, speak, humanClick, humanType, pointerTo }) {
  await speak('Zaczynamy od ekranu logowania.');
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await pointerTo(200, 200);
  await humanClick(page.getByLabel('Login'), '1. Pole: Login');
  await humanType(page.getByLabel('Login'), 'admin');
}
```

Helpers are injected — `run(ctx)` receives them from the CLI. Voice: `await speak('…')` in the film language; the narrator **starts before the click**, the rest of the sentence plays over the action. Full sentence on cards: `speak('Dziękujemy.', { wait: 'full' })`.
The workflow adds a splash at the start and a thank-you card at the end (`data:` URL — `setContent` is dropped from Playwright's recording).

## New template

Trigger: „nowy szablon”, „new video template”. Ask: `id`, base (`ocean`/`midnight`/`daylight` or empty), kicker pl/en, gradient 2–3 hex, title text color, outline+fill, label colors.

```bash
node "$WF" new-template --cwd <project> --id acme --from ocean --name "Acme"
```

Bad hex / taken id → exit ≠ 0. Do not bypass the script with a hand-written JSON unless the CLI wrote the file.

## Do not

- Blue cursor, hover-only, clicks without pause, teleporting arrow.
- Label without a number, or in the wrong language.
- Playwright in the app `package.json` just for one video.
- Shipping a film without checking frames. Leaving mutated test data.
- Commit mp4 / ElevenLabs key.
