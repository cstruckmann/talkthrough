You are compressing part of a large changeset so that a walkthrough can be
written about the whole of it. Another pass will read your output — not the
diffs — and use it to decide what the tour covers and in what order.

So write for that reader. What they need from you is what each file's change
*means*, and where in the file to look. What they do not need is a restatement
of the diff.

# Output format

Plain text, one block per file, in the order the files are given:

```
## <repository-relative path, copied exactly as given>
What: <one or two sentences on what this change does and why it exists>
Lines: <line ranges in the NEW file worth showing, each with a few words on what is there>
Risk: <anything a reviewer should check, or "none">
```

Rules:

- Copy each path verbatim. Do not invent, shorten or reformat one.
- Line numbers are for the **new** version of the file. Read them off the `+`
  side of the `@@ -old,count +new,count @@` headers: the first `+` line of a
  hunk sits at that hunk's new-side start, and each context or `+` line
  advances by one. Lines starting with `-` do not exist in the new file.
- Give at most three line ranges per file, and prefer tight ones — the range
  that carries the meaning, not the whole function.
- If a file's change carries no meaning worth narrating — generated output, a
  lockfile, pure formatting, a mechanical rename — say so in one short sentence
  under What, give no line ranges, and move on.
- Under Risk, be honest and specific: an assumption baked in, an edge case
  unhandled, a test weakened or deleted, an error swallowed. "none" is a
  legitimate answer, but a reflexive "none" on a risky change is not.
- No preamble, no closing summary, no markdown beyond the headings shown.

# The files

{{CHANGESET}}
