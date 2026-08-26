# Talkthrough — Build Plan

Instructions for the coding agent: work through phases in order. Check off items as completed. **STOP at every `⛔ REVIEW CHECKPOINT` and wait for explicit human approval before starting the next phase.** At each checkpoint, present what was built, how to test it manually, and any deviations from PROJECT.md. Do not silently change scope; propose changes at checkpoints.

Conventions: TypeScript strict mode, esbuild bundling, unit tests for pure logic (schema validation, diff parsing, prompt assembly), no test coverage requirement for VS Code API glue. Commit per completed item with a conventional-commit message.

---

## Phase 0 — Scaffold

- [x] Initialize extension with `yo code` (TypeScript, esbuild), name `talkthrough`, publisher placeholder.
- [x] Repo hygiene: MIT LICENSE, .gitignore, README stub, `npm run watch` + F5 debug launch working.
- [x] Register command `talkthrough.explainChanges` ("Talkthrough: Explain recent changes") showing a hello-world notification.
- [x] Contribute an empty webview view `talkthrough.player` in the bottom panel container; renders static "Talkthrough" HTML with theme variables.
- [x] CI: GitHub Actions running lint + typecheck + tests on push.

⛔ **REVIEW CHECKPOINT 0** — Human verifies: extension launches in Extension Development Host, command appears in palette, empty panel opens and matches editor theme. Approve to continue.

---

## Phase 1 — Changeset collection & tour generation

- [x] `ChangesetCollector`: get `git diff <base>...HEAD` (use `simple-git` or child_process), configurable `talkthrough.baseRef`, fallback to working-tree-vs-HEAD when no commits ahead. Handle: not-a-repo (readable error), empty diff (info message), binary files (skip), per-file truncation over threshold with a note in the payload.
- [x] Define TourScript JSON schema (per PROJECT.md) + validator (zod). Unit tests: valid/invalid fixtures.
- [x] Backend interface `TourBackend.generateTour(changeset, transcript?)`.
- [x] Backend: `claude-cli` — detect `claude` on PATH, invoke `claude -p --output-format json` with the generation prompt; parse, validate, one retry-with-error on schema failure. Timeout + stderr surfaced on failure.
- [x] Backend: `anthropic-api` — direct fetch to Messages API, key from SecretStorage (command `talkthrough.setApiKey`).
- [x] Backend auto-detection + `talkthrough.backend` setting.
- [x] Generation prompt v1 in `prompts/tour.md`: overview-first ordering, grouped by concern, colleague-presenting tone, strict JSON-only output, 2 few-shot examples. Keep prompt in a standalone file for fast iteration.
- [x] Wire command: run collector → backend → validated TourScript → for now, dump the script into an output channel and show segment count.

⛔ **REVIEW CHECKPOINT 1** — Human runs it on a real repo with a real agent changeset and reads the generated TourScript JSON. Quality bar: ordering makes sense, narration sounds like a presenter, line ranges point at the right code. Expect 2–3 prompt iterations here — do them inside this checkpoint with the human judging output. Approve to continue.

---

## Phase 2 — Editor choreography (silent tour)

- [x] `EditorChoreographer`: for a segment — open file, `revealRange` centered, apply highlight `TextEditorDecorationType` (ThemeColor-based), clear previous decorations. Handle stale line ranges (file changed since generation): clamp + warn.
- [x] Tour state machine in the host: idle → playing(segmentIndex) → paused → done; commands next/prev/stop.
- [x] Temporary controls (before audio exists): status-bar buttons or quick-pick to step through segments manually.
- [x] Optional `talkthrough.openDiffView`: show `vscode.diff` for the segment's file instead of the plain document.
- [x] *(added during Phase 2, not in the original plan)* Activity-bar container with a `talkthrough.segments` tree view: the tour as a navigable list with kind icons, selection following the current segment, and prev/next/stop in the view title. Stepping controls also contributed to the editor title bar.

⛔ **REVIEW CHECKPOINT 2** — Human steps through a tour silently: correct files open, correct lines highlighted, stepping feels smooth, no decoration leftovers. Approve to continue.

---

## Phase 3 — TTS & audio playback

- [x] `TTSEngine` interface `synthesize(text, voice) => audioFile`; cache keyed by hash(text+voice+engine) in `globalStorageUri`.
- [x] Engine: `system` — macOS `say` → WAV (document Windows/Linux gap for now; fail with actionable message pointing to API TTS).
- [x] Engine: `openai` TTS via user key in SecretStorage.
- [x] Synthesis pipeline: on tour start, synthesize segment 1 immediately, remaining segments in background; progress notification.
- [x] Webview player v1: `<audio>` element fed via `asWebviewUri`, play/pause/next/prev, playback speed. Host↔webview `postMessage` protocol: host pushes `loadSegment`, webview reports `ended`/`seeked`/user actions.
- [x] Sync: webview `ended` → host advances segment → choreographer moves editor → host pushes next audio. First playback must be user-initiated (autoplay policy).

⛔ **REVIEW CHECKPOINT 3** — Human plays a full narrated tour end-to-end. Bar: audio and highlights never desync, pause/resume works, no double-audio, cache makes replay instant. Approve to continue.

---

## Phase 4 — Player UX polish

- [ ] ~~Panel UI: segment list with kind badges~~ — **moved to the sidebar tree view in Phase 2.** The panel keeps the transport and transcript only; revisit only if the two surfaces feel redundant in use.
- [x] Live transcript view; current sentence emphasized; sentences clickable to seek within a segment (approximate by character-proportional offset — word timestamps are out of scope).
- [x] Progress bar across the whole tour; elapsed/total time.
- [x] Keyboard shortcuts (space play/pause, arrows prev/next) while panel focused.
- [x] Empty/error states in-panel: no git repo, no diff, backend missing (with "how to fix" links), generation failed.
- [x] Theming pass: audit all colors/fonts against `--vscode-*` variables in 3 themes (dark default, light default, one high-contrast).
- [x] Settings UI descriptions finalized for all `talkthrough.*` settings.

⛔ **REVIEW CHECKPOINT 4** — Human evaluates look & feel against "polished coworker" bar in all 3 themes; walks each error state deliberately. Approve to continue.

---

## Phase 5 — Hardening & second backend

- [ ] Backend: `codex-cli` — detect `codex` on PATH, invoke `codex exec` with JSON-only prompt (final message on stdout), same validate/retry path.
- [ ] Large-changeset strategy: over N changed files → two-pass generation (per-file summaries → tour over summaries). Verify on a 50-file diff.
- [ ] Optional Claude Code transcript enrichment (`talkthrough.useAgentTranscript`): locate latest session JSONL for the workspace, extract assistant reasoning, feed to generator. Degrade gracefully if absent.
- [ ] Concurrency & cancellation: cancel a running generation/synthesis when a new tour starts or VS Code closes; no orphaned child processes.
- [ ] Cross-platform check on Linux (extension host paths, child_process, no `say` — verify error path) — use the Ubuntu server for this.
- [ ] Unit test sweep for: schema, diff truncation, prompt assembly, cache keys, message protocol reducers.

⛔ **REVIEW CHECKPOINT 5** — Human tests: codex backend parity, a huge diff, transcript-enriched tour vs. plain-diff tour (side by side — is the reasoning narration noticeably better?), and a Linux run. Approve to continue.

---

## Phase 6 — Publishing

- [ ] Product README: hero GIF/screencast of a tour, feature list, backend setup instructions per vendor (explicit: "uses YOUR installed CLI and YOUR subscription; we never handle your login"), settings reference, privacy note (all local, code leaves the machine only to the backend the user chose).
- [ ] Icon + marketplace gallery banner; display name "Talkthrough"; keywords: ai, code review, agent, diff, voice, walkthrough.
- [ ] `package.json` metadata: publisher, repository, categories, license; bundle size sanity check (< 5 MB, no node_modules leakage).
- [ ] Create publisher account (Azure DevOps / vsce) and Open VSX account; store tokens as repo secrets.
- [ ] Release CI: on tag → build, package `.vsix`, publish to both registries, attach to GitHub release.
- [ ] Manual smoke test of the marketplace-installed build (not the dev host) on a clean VS Code profile, and once in Cursor via Open VSX.
- [ ] CHANGELOG.md; version 0.1.0.

⛔ **REVIEW CHECKPOINT 6 (FINAL)** — Human installs from the marketplace listing, runs a full tour on a fresh machine/profile, reviews README + listing copy, approves public announcement. Ship.

---

## Post-v1 backlog (do not start without discussion)

- Claude Code Stop-hook auto-trigger ("your agent finished — press play").
- Word-level highlight sync via TTS timestamps (OpenAI/ElevenLabs).
- Piper/Kokoro local TTS for Windows/Linux zero-config.
- Q&A mode: pause the tour and ask the backend a question about the current segment.
- Export tour as shareable video/audio for PR descriptions.
