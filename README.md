# Talkthrough

**Voice-narrated walkthroughs of AI agent code changes, inside VS Code.**

AI coding agents produce changesets faster than anyone can read them. Talkthrough
closes that gap: press play and the extension walks you through the changes like a
coworker sitting next to you — a generated voice-over explains what changed and why,
while the extension drives the editor: opening files, scrolling to the relevant lines,
and highlighting the exact snippets the narration refers to.

> Status: early development. See `PROJECT.md` for the spec and `TODO.md` for the build plan.

## How it works

1. Talkthrough collects your changeset (`git diff` against a base ref).
2. An LLM backend generates a *tour script* — ordered narration segments, each bound
   to a file and line range.
3. A text-to-speech engine synthesizes the narration.
4. The player panel plays it back while the editor follows along.

## Controlling a tour

Step through a tour from the buttons in the editor title bar, the Talkthrough
sidebar, or the player panel. Inside the panel, space plays and pauses and the
arrow keys step between segments.

Talkthrough deliberately binds no global keyboard shortcuts: keys like
<kbd>Alt</kbd>+<kbd>Left</kbd> belong to whatever you are typing into. To bind
your own, open Keyboard Shortcuts and search for `talkthrough`.

## Privacy and credentials

- Talkthrough never bundles, downloads, or installs a vendor CLI. It only detects and
  invokes tools **you** installed and logged into yourself.
- It never implements or automates any vendor login flow.
- API keys, if you use an API backend, live in VS Code SecretStorage — never in
  `settings.json`.
- No telemetry. Your code leaves your machine only via the backend you chose.

## Development

```bash
npm install
npm run watch    # then press F5 to launch the Extension Development Host
npm test         # unit tests
npm run lint
npm run typecheck
```

## License

MIT
