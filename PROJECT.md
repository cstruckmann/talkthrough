# Talkthrough

**Voice-narrated walkthroughs of AI agent code changes, inside VS Code.**

## Vision

AI coding agents produce large changesets faster than humans can review them. Talkthrough closes that gap: after an agent finishes, the developer presses play and the extension walks them through the changes like a coworker sitting next to them — a generated voice-over explains what changed and why, while the extension drives the IDE: opening files, scrolling to the relevant lines, and highlighting the exact snippets the narration refers to.

The core feeling: *"my agent is presenting its work to me."*

## Target users

- Developers using AI coding agents (Claude Code, Codex, Cursor agents) who need to review agent output efficiently.
- Reviewers of large PRs who want an oriented overview before reading line-by-line.

## Core UX flow

1. Agent finishes a task (or user runs the command manually on any diff).
2. User invokes **"Talkthrough: Explain recent changes"** from the command palette (later: automatic trigger via Claude Code Stop hook).
3. Extension collects the changeset (`git diff` vs. a base ref; optionally the agent's session transcript for reasoning context).
4. An LLM backend generates a **tour script**: an ordered list of narration segments, each bound to a file + line range.
5. TTS synthesizes audio per segment.
6. The **player panel** (docked webview) plays the audio while the extension choreographs the editor: open file → reveal range → highlight decoration → advance on segment end.
7. User can pause, skip, replay, and click any transcript sentence to jump there.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ VS Code Extension Host (TypeScript)                 │
│                                                     │
│  ChangesetCollector ──► TourGenerator ──► TourScript│
│   (git diff,             (pluggable LLM    (JSON)   │
│    agent transcript)      backend)            │     │
│                                               ▼     │
│  EditorChoreographer ◄── Player state    TTSEngine  │
│   (open/reveal/decorate)      ▲          (audio per │
│                               │           segment)  │
│                          postMessage                │
│                               │                     │
│  ┌────────────────────────────┴──────────────────┐  │
│  │ Webview Panel (player UI, <audio>, transcript)│  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Components

**ChangesetCollector**
- Default input: `git diff <base>...HEAD` (base ref configurable; sensible default = merge-base with default branch, or working tree vs. HEAD).
- Optional enrichment: agent session transcript (v1: Claude Code session JSONL from `~/.claude/projects/...`), used to narrate *reasoning*, not just the diff.
- Must handle: large diffs (truncate/summarize per file over a size threshold), binary files (skip), renames.

**TourGenerator (pluggable LLM backends)**
- Backend interface: `generateTour(changeset, transcript?) => TourScript`.
- Backends, auto-detected on PATH, user-selectable in settings:
  1. `claude` CLI — invoke `claude -p <prompt> --output-format json` (uses the user's own installed, logged-in Claude Code; billed to their subscription).
  2. `codex` CLI — invoke `codex exec <prompt>` (uses the user's own installed, logged-in Codex CLI).
  3. Direct API key (Anthropic or OpenAI) — user-supplied via settings/secret storage.
- **Policy constraint (hard requirement):** Talkthrough never bundles a vendor CLI, never runs or embeds any vendor login flow, and never handles vendor credentials for the CLI backends. It only invokes tools the user has already installed and authenticated themselves. No vendor names in the product name/branding.
- Output is validated against the TourScript JSON schema; on invalid output, retry once with the validation error appended, then fail with a readable message.

**TourScript schema (v1)**

```json
{
  "version": 1,
  "title": "Add rate limiting to API client",
  "summary": "One-paragraph overview narrated first, no file focus.",
  "segments": [
    {
      "id": "seg-1",
      "file": "src/api/client.ts",
      "startLine": 42,
      "endLine": 58,
      "narration": "First, the client gained a token-bucket rate limiter...",
      "kind": "overview | change | reasoning | caveat"
    }
  ]
}
```

Ordering principle for the generation prompt: overview first, then key changes grouped by concern (not by file order), then details/caveats. The narration should sound like a colleague presenting, not a diff read aloud.

**TTSEngine (pluggable)**
- Zero-config default (must work offline, no account):
  - macOS: `say` to AIFF/WAV via child process.
  - Cross-platform upgrade: Piper or Kokoro local model (bundled-download on first use, optional).
- Premium options via user's own key: OpenAI TTS, ElevenLabs.
- Synthesize per segment → temp audio files → served to webview via `asWebviewUri`.
- Cache keyed by hash(narration + voice) to make replays and edits instant.

**EditorChoreographer**
- `vscode.window.showTextDocument` + `revealRange(range, InCenter)`.
- Highlight via `TextEditorDecorationType` (theme-aware background using `ThemeColor`), cleared on segment change / stop.
- Optional: open `vscode.diff` view for a segment instead of the plain file (setting).

**Player panel**
- `WebviewViewProvider`, contributed to the bottom panel (`panel` container), `retainContextWhenHidden: true`.
- UI: play/pause, prev/next segment, progress, playback speed, segment list, live transcript with the current sentence highlighted; every sentence clickable to seek.
- Styling exclusively via VS Code theme CSS variables (`--vscode-*`) so it matches any theme.
- Webview ↔ host protocol over `postMessage`: `{type: "segmentStarted"|"seek"|"playbackEnded"|...}`. Host owns all editor actions; webview owns audio.

## Settings (v1)

- `talkthrough.backend`: `auto | claude-cli | codex-cli | anthropic-api | openai-api`
- `talkthrough.tts`: `auto | system | piper | openai | elevenlabs`
- `talkthrough.baseRef`: default diff base
- `talkthrough.useAgentTranscript`: boolean
- `talkthrough.openDiffView`: boolean
- API keys stored in VS Code SecretStorage, never in settings.json.

## v1 scope (in)

- Manual command on a git diff, Claude CLI + system TTS as the golden path, player panel, editor choreography, segment-level sync, publish to VS Code Marketplace + Open VSX.

## Non-goals (v1)

- Word-level highlight sync (upgrade path: TTS word timestamps).
- Automatic triggering via agent hooks (v1.1).
- Support for JetBrains or a web/GitHub PR viewer.
- Multi-repo / non-git workspaces.
- Any hosted backend, accounts, or telemetry beyond an opt-in error report.

## Distribution

- Publish the same `.vsix` to the VS Code Marketplace (via `vsce`) and Open VSX (covers Cursor, Windsurf, VSCodium users — a large share of the target audience).
- MIT license, public GitHub repo, CI publishes on tagged release.

## Risks

- **Tour quality** is the product. Budget most iteration time on the generation prompt + few-shot examples, not plumbing.
- **CLI output drift**: `claude -p` / `codex exec` output formats can change; isolate parsing behind the backend interface and pin known-good invocation flags.
- **Policy drift**: vendor terms for subscription-backed programmatic use evolve; keep the API-key backend first-class so the product never depends on any single auth path.
- **Audio in webviews**: autoplay policies require the first playback to be user-initiated — the play button, never auto-start.
