# Kodevu

A Node.js tool that polls new SVN revisions or Git commits, fetches each change diff directly from the repository, sends the diff to a supported reviewer CLI, and writes the result to Markdown files.

## Workflow

1. Detect the repository type automatically (Git or SVN).
2. Read the latest change from `target`.
3. Find changes that have not been reviewed yet.
4. For each change:
   - load metadata and changed paths from SVN or Git
   - generate a unified diff for that single revision or commit
   - send the diff and change metadata to the configured reviewer CLI
   - allow the reviewer to inspect related local repository files in read-only mode when a local workspace is available
   - write the result to `~/.kodevu/`
5. Update `~/.kodevu/state.json` so the same change is not reviewed twice.

## Setup

```bash
npx kodevu init
```

This creates `config.json` in the current directory from the packaged `config.example.json`.
You only need this when you want to override defaults such as `reviewer` or output paths.

If you want a different path:

```bash
npx kodevu init --config ./config.current.json
```

Then edit `config.json` if you want custom settings.

If you do not pass `--config`, Kodevu will try to load `./config.json` from the current directory only when that file exists. Otherwise it runs with built-in defaults.

## Run

Run once:

```bash
npx kodevu /path/to/your/repo
```

Run once with debug logs:

```bash
npx kodevu /path/to/your/repo --debug
```

Use a custom config path only when needed:

```bash
npx kodevu --config ./config.current.json
```

Or combine a config file with a positional target override:

```bash
npx kodevu /path/to/your/repo --config ./config.current.json
```

`--debug` / `-d` is a CLI-only switch. It is not read from `config.json`.

## Config

- `target`: required repository target; can be provided by config or as the CLI positional argument
- `reviewer`: `codex`, `gemini`, or `auto`; default `auto`
- `prompt`: saved into the report as review context
- `outputDir`: report output directory; default `~/.kodevu`
- `stateFilePath`: review state file path; default `~/.kodevu/state.json`
- `commandTimeoutMs`: timeout for a single review command execution in milliseconds
- `maxRevisionsPerRun`: cap the number of pending changes per polling cycle

Internal defaults:

- by default, review reports and state are stored under `~/.kodevu`; first run starts from the current latest change instead of replaying full history
- if `./config.json` is absent, Kodevu still runs with built-in defaults as long as you pass a positional `target`
- Kodevu invokes `git`, `svn`, and the configured reviewer CLI from `PATH`; when `reviewer` is `auto`, it randomly selects one from the installed reviewer CLIs it can find in `PATH`; debug logging is enabled only by passing `--debug` or `-d`

## Target Rules

- For SVN, `target` can be a working copy path or repository URL.
- For Git, `target` must be a local repository path or a subdirectory inside a local repository.
- The tool tries Git first for existing local paths, then falls back to SVN.

## Notes

- `reviewer: "codex"` uses `codex exec` with the diff embedded in the prompt.
- `reviewer: "gemini"` uses `gemini -p` in non-interactive mode.
- `reviewer: "auto"` probes `codex` and `gemini` in `PATH`, then randomly chooses one of the available CLIs for this run.
- Large diffs are truncated before being sent to the reviewer or written into the report once they exceed the configured line or character limits.
- For Git targets and local SVN working copies, the reviewer command runs from the repository workspace so it can inspect related files beyond the diff when needed.
- For remote SVN URLs without a local working copy, the review still relies on the diff and change metadata only.
- SVN reports are written as `<YYYYMMDD-HHmmss>-svn-r<revision>.md`.
- Git reports are written as `<YYYYMMDD-HHmmss>-git-<short-commit-hash>.md`.
- `~/.kodevu/state.json` stores per-project checkpoints keyed by repository identity; only the v2 multi-project structure is supported.
- If the reviewer command exits non-zero or times out, the report is still written, but the state is not advanced so the change can be retried later.
