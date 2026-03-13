# Kodevu

A Node.js tool that polls new SVN revisions or Git commits, fetches each change diff directly from the repository, sends the diff to a supported reviewer CLI, and writes the result to Markdown files.

## Workflow

1. Detect the configured repository type, or use the explicit `vcs` setting.
2. Read the latest change from `target`.
3. Find changes that have not been reviewed yet.
4. For each change:
   - load metadata and changed paths from SVN or Git
   - generate a unified diff for that single revision or commit
   - send the diff and change metadata to the configured reviewer CLI
   - allow the reviewer to inspect related local repository files in read-only mode when a local workspace is available
   - write the result to `reports/`
5. Update `data/state.json` so the same change is not reviewed twice.

## Setup

```bash
npm install
copy config.example.json config.json
```

Then edit `config.json` and set `target`.

## Run

Run one cycle:

```bash
npm run once
```

Start the scheduler:

```bash
npm start
```

Use a custom config path:

```bash
node src/index.js --config ./config.json --once
```

## Config

- `target`: required repository target
- `vcs`: `auto`, `svn`, or `git`; default `auto`
- `reviewer`: `codex` or `gemini`; default `codex`
- `pollCron`: cron schedule, default every 10 minutes
- `reviewPrompt`: saved into the report as review context
- `outputDir`: report output directory; default `./reports`
- `commandTimeoutMs`: timeout for a single review command execution in milliseconds
- `bootstrapToLatest`: if no state exists, start by reviewing only the current latest change instead of replaying the full history
- `maxRevisionsPerRun`: cap the number of pending changes per polling cycle

Internal defaults:

- review state is always stored in `./data/state.json`
- the tool always invokes `git`, `svn`, and the configured reviewer CLI from `PATH`
- command output is decoded as `utf8`

## Target Rules

- For SVN, `target` can be a working copy path or repository URL.
- For Git, `target` must be a local repository path or a subdirectory inside a local repository.
- When `vcs` is `auto`, the tool tries Git first for existing local paths, then falls back to SVN.
- Legacy `svnTarget` is still accepted for backward compatibility.

## Notes

- `reviewer: "codex"` uses `codex exec` with the diff embedded in the prompt.
- `reviewer: "gemini"` uses `gemini -p` in non-interactive mode.
- For Git targets and local SVN working copies, the reviewer command runs from the repository workspace so it can inspect related files beyond the diff when needed.
- For remote SVN URLs without a local working copy, the review still relies on the diff and change metadata only.
- SVN reports keep the `r123.md` naming style.
- Git reports are written as `git-<full-commit-hash>.md`.
- `data/state.json` stores per-project checkpoints keyed by repository identity; only the v2 multi-project structure is supported.
- If the reviewer command exits non-zero or times out, the report is still written, but the state is not advanced so the change can be retried later.
