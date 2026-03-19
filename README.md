# Kodevu

A Node.js tool that fetches Git commits or SVN revisions, sends the diff to a supported AI reviewer CLI, and writes review results to report files.

## Pure & Zero Config

Kodevu is designed to be stateless and requires no configuration files. It relies entirely on command-line arguments and environment variables.

1. **Automatic Detection**: Detects repository type (Git/SVN), language, and available reviewers.
2. **Stateless**: Does not track history; reviews exactly what you ask for.
3. **Flexible**: Every setting can be overridden via CLI flags or ENV vars.

## Quick Start

Review the latest commit in your repository:

```bash
npx kodevu .
```

Review the latest 3 commits:

```bash
npx kodevu . --last 3
```

Review a specific commit:

```bash
npx kodevu . --rev abc1234
```

Reports are written to `~/.kodevu/` by default.

## Usage

```bash
npx kodevu [target] [options]
```

### Options

- `target`: Repository path (Git) or SVN URL/Working copy (default: `.`).
- `--reviewer, -r`: `codex`, `gemini`, `copilot`, or `auto` (default: `auto`).
- `--rev, -v`: A specific revision or commit hash to review.
- `--last, -n`: Number of latest revisions to review (default: 1).
- `--lang, -l`: Output language (e.g., `zh`, `en`, `auto`).
- `--prompt, -p`: Additional instructions for the reviewer. Use `@file.txt` to read from a file.
- `--output, -o`: Report output directory (default: `~/.kodevu`).
- `--format, -f`: Output formats (e.g., `markdown`, `json`, or `markdown,json`).
- `--debug, -d`: Print debug information.

### Environment Variables

You can set these in your shell to change default behavior without typing flags every time:

- `KODEVU_REVIEWER`: Default reviewer.
- `KODEVU_LANG`: Default language.
- `KODEVU_OUTPUT_DIR`: Default output directory.
- `KODEVU_PROMPT`: Default prompt instructions.
- `KODEVU_TIMEOUT`: Reviewer execution timeout in milliseconds.

## Examples

**Review with a custom prompt from a file:**
```bash
npx kodevu . --prompt @my-rules.txt
```

**Generate JSON reports in a local folder:**
```bash
npx kodevu . --format json --output ./review-reports
```

**Set a persistent reviewer via ENV:**
```bash
export KODEVU_REVIEWER=gemini
npx kodevu .
```

## How it Works

- **Git Targets**: `target` must be a local repository or subdirectory.
- **SVN Targets**: `target` can be a working copy path or repository URL.
- **Reviewer "auto"**: Probes `codex`, `gemini`, and `copilot` in your `PATH` and selects one.
- **Contextual Review**: For local repositories, the reviewer can inspect related files beyond the diff to provide deeper insights.

## License

MIT
