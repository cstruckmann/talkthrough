# CLAUDE.md — Talkthrough

Instructions for coding agents working in this repository.

## What this project is

A VS Code extension ("Talkthrough") that generates voice-narrated, IDE-driving walkthroughs of AI agent code changes. Read `PROJECT.md` for the full spec before doing anything. The build plan is `TODO.md`.

## How to work

- Follow `TODO.md` top to bottom. One phase at a time.
- **Never cross a `⛔ REVIEW CHECKPOINT` without explicit human approval in the conversation.** When you reach one: stop, summarize what you built, list manual test steps, list any deviations from PROJECT.md, and wait.
- Check off completed items in `TODO.md` as you go (edit the file).
- Commit per completed checklist item, conventional commits (`feat:`, `fix:`, `chore:`, `test:`).
- **Commit and push automatically.** After each completed checklist item, commit and `git push` to `origin main` without asking for confirmation — this is standing authorization. Never push work that fails `npm run lint`, `npm run typecheck`, or `npm test`.
- If an item turns out to be wrong or underspecified, do not improvise silently — note it and raise it at the next checkpoint (or immediately if it blocks you).

## Hard constraints (do not violate)

- Never bundle, download, or auto-install a vendor CLI (`claude`, `codex`). Only detect and invoke what the user installed themselves.
- Never implement, embed, or automate any vendor login flow. CLI backends use the user's existing auth; API backends use keys from VS Code SecretStorage only.
- No API keys in settings.json, code, logs, or committed files. SecretStorage only.
- No telemetry, no network calls except the user-chosen LLM/TTS backend.
- Product branding contains no vendor names.

## Tech conventions

- TypeScript strict; esbuild bundle; target current VS Code stable API (no proposed APIs).
- Webview: single HTML entry, vanilla TS or Preact (keep it light), all styling via `--vscode-*` theme variables, CSP set, resources via `asWebviewUri`.
- Host↔webview messages are typed in a shared `src/protocol.ts`.
- Unit tests (vitest) for pure logic: schema validation, diff processing, prompt assembly, cache keys, state reducers. VS Code API glue is exercised manually via checkpoints.
- Child processes: always with timeout + cancellation; kill on deactivate.
- The tour generation prompt lives in `prompts/tour.md` and is loaded at runtime — never inline it in code.

## Commands

- `npm run watch` — dev build; F5 launches Extension Development Host.
- `npm test` — unit tests.
- `npm run lint` / `npm run typecheck`.
- `npx vsce package` — build `.vsix` (Phase 6+).

## Definition of done for any item

Compiles, lints, unit tests pass, works in the Extension Development Host, checklist ticked, committed **and pushed**.
