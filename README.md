# Kodevu

A Node.js tool that fetches Git commits or SVN revisions, sends the diff to a supported AI reviewer CLI, and writes review results to report files.

## Workflow

1. Detect the repository type automatically (Git or SVN).
2. Fetch the specified revision(s) as requested by the user:
   - A single specific revision/commit via `--rev`.
   - The latest $N$ revisions/commits via `--last` (default: 1).
3. For each change:
   - Load metadata and changed paths from SVN or Git.
   - Generate a unified diff for that single revision or commit.
   - Send the diff and change metadata to the configured reviewer CLI.
   - Allow the reviewer to inspect related local repository files in read-only mode when a local workspace is available.
   - Write the result to `~/.kodevu/` (Markdown by default; optional JSON via config).

**Note**: Kodevu is stateless. It does not track which changes have been reviewed previously.

## Quick start

Review the latest commit in your repository:

```bash
npx kodevu /path/to/your/repo
```

Review the latest 3 commits:

```bash
npx kodevu /path/to/your/repo --last 3
```

Review a specific commit:

```bash
npx kodevu /path/to/your/repo --rev abc1234
```

Review reports are written to `~/.kodevu/` as Markdown (`.md`) by default.

## Setup

If you want to customize settings beyond the defaults:

```bash
npx kodevu init
```

This creates `config.json` in the current directory. You only need this when you want to override defaults such as `reviewer` or output paths.

## Run

Specify the output language (e.g., Chinese):

```bash
npx kodevu /path/to/your/repo --lang zh
```

Run with debug logs:

```bash
npx kodevu /path/to/your/repo --debug
```

Use a custom config path:

```bash
npx kodevu --config ./my-config.json
```

## Config / CLI Options

- `target`: Repository target path or SVN URL. (CLI positional argument overrides config)
- `reviewer`: `codex`, `gemini`, `copilot`, or `auto` (default: `auto`).
- `rev`: A specific revision or commit hash to review.
- `last`: Number of latest revisions to review (default: 1 if `rev` is not set).
- `lang`: Output language for the review (e.g., `zh`, `en`, `auto`).
- `prompt`: Additional instructions for the reviewer.
- `outputDir`: Report output directory (default: `~/.kodevu`).
- `outputFormats`: Report formats to generate (supports `markdown` and `json`; default: `["markdown"]`).
- `commandTimeoutMs`: Timeout for a single review command execution in milliseconds.
- `maxRevisionsPerRun`: Cap the number of revisions handled in one run.

## Target Rules

- For SVN, `target` can be a working copy path or repository URL.
- For Git, `target` must be a local repository path or a subdirectory inside a local repository.
- The tool tries Git first, then falls back to SVN.

## Notes

- `reviewer: "auto"` probes `codex`, `gemini`, and `copilot` in `PATH`, then selects an available one.
- Large diffs are truncated based on internal limits to fit AI context windows.
- For Git targets and local SVN working copies, the reviewer command runs from the repository workspace so it can inspect related files beyond the diff.
- If the reviewer command exits non-zero or times out, the report is still written containing the error details.

## License

MIT
