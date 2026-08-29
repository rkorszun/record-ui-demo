# record-ui-demo

Agent Plugin that records how-to UI videos (Playwright + ffmpeg) with a visible white mouse arrow, an amber click outline, numbered labels, and optional ElevenLabs voiceover (Polish or English).

## Install

This repo is an [Agent Plugin](https://cursor.com/docs/reference/plugins) (`plugin.json` at the root).

1. In Cursor: **Settings → Plugins → Add from GitHub** and paste this repository URL.
2. Or copy the repo (not a symlink) to `~/.cursor/plugins/local/record-ui-demo`.

Then in the skill directory:

```bash
cd skills/record-ui-demo
npm install
npx playwright install chromium
node scripts/workflow.mjs doctor
```

Requirements: **Node 24+**, `ffmpeg` / `ffprobe`. Do not add Playwright to the application you are recording.

## Record

The agent entry is only `skills/record-ui-demo/scripts/workflow.mjs`.

```bash
WF=skills/record-ui-demo/scripts/workflow.mjs
node "$WF" need --cwd /path/to/app --voice
node "$WF" set-project --cwd /path/to/app --language pl --template ocean --app-url http://localhost:5173
node "$WF" record --cwd /path/to/app --scenario /tmp/sign-in.mjs
```

Say “nagraj filmik” / “record a demo video” in chat and the agent will ask for missing fields, then run the CLI.

Output defaults to `docs/videos/<slug>.mp4` in the app project. Override with `outputDir` in `.record-ui-demo.json`. Do not commit mp4 files.

## Config

| What | Where | Commit? |
|------|--------|---------|
| ElevenLabs API key, voice IDs | `~/.config/record-ui-demo/config.json` (chmod 600) or `ELEVENLABS_API_KEY` | no |
| language, template, appUrl, outputDir | `<app>/.record-ui-demo.json` | yes |
| App-specific visual templates | `<app>/.record-ui-demo/templates/<id>.json` | yes |

Example user config: [`config.example.json`](config.example.json) (placeholder key only).

```bash
node "$WF" set-config --api-key "$ELEVENLABS_API_KEY" --pick-voices
```

Without a key, `record --no-voice` (or missing key) produces a silent mp4.

## Visual templates

Built-in presets: `ocean`, `midnight`, `daylight`. Create a new one through the CLI (the agent asks, the script writes the file):

```bash
node "$WF" new-template --cwd /path/to/app --id acme --from ocean --name "Acme"
```

## Layout

```
plugin.json
skills/record-ui-demo/
  SKILL.md
  scripts/workflow.mjs    # only CLI entry
  templates/*.json
```
