# Kodevu

A Node.js tool that fetches Git commits or SVN revisions, sends the diff to a supported AI reviewer CLI, and writes review results to report files.

## Pure & Zero Config

Kodevu is designed to be stateless and requires no configuration files. It relies entirely on command-line arguments and environment variables.

1. **Automatic Detection**: Detects repository type (Git/SVN), language, and available reviewers.
2. **Stateless**: Does not track history; reviews exactly what you ask for.
3. **Flexible**: Every setting can be overridden via CLI flags or ENV vars.

## Quick Start

Get a review of your latest commit in seconds:

```bash
npx kodevu .
```

Review reports are saved to `~/.kodevu/` by default.

## Usage

```bash
npx kodevu [target] [options]
```

### Options

- `target`: Repository path (Git) or SVN URL/Working copy (default: `.`).
- `--reviewer, -r`: `codex`, `gemini`, `copilot`, `openai`, or `auto` (default: `auto`).
- `--rev, -v`: A specific revision or commit hash to review.
- `--last, -n`: Number of latest revisions to review (default: 1). Use negative values (e.g., `-3`) to review only the 3rd commit from the top.
- `--lang, -l`: Output language (e.g., `zh`, `en`, `auto`).
- `--prompt, -p`: Additional instructions for the reviewer. Use `@file.txt` to read from a file.
- `--output, -o`: Report output directory (default: `~/.kodevu`).
- `--format, -f`: Output formats (e.g., `markdown`, `json`, or `markdown,json`).
- `--openai-api-key`: API key used when `--reviewer openai`.
- `--openai-base-url`: Base URL used when `--reviewer openai` (default: `https://api.openai.com/v1`).
- `--openai-model`: Model used when `--reviewer openai` (default: `gpt-5-mini`).
- `--openai-org`: Optional OpenAI organization ID.
- `--openai-project`: Optional OpenAI project ID.
- `--debug, -d`: Print debug information.
- `--version, -V`: Print the current version and exit.

> [!IMPORTANT]
> `--rev` and `--last` are mutually exclusive. Specifying both will result in an error.

### Environment Variables

You can set these in your shell to change default behavior without typing flags every time:

- `KODEVU_REVIEWER`: Default reviewer.
- `KODEVU_LANG`: Default language.
- `KODEVU_OUTPUT_DIR`: Default output directory.
- `KODEVU_PROMPT`: Default prompt instructions.
- `KODEVU_TIMEOUT`: Reviewer execution timeout in milliseconds.
- `KODEVU_OPENAI_API_KEY`: API key for `openai`.
- `KODEVU_OPENAI_BASE_URL`: Base URL for `openai`.
- `KODEVU_OPENAI_MODEL`: Model for `openai`.
- `KODEVU_OPENAI_ORG`: Optional organization ID for `openai`.
- `KODEVU_OPENAI_PROJECT`: Optional project ID for `openai`.

## Examples

### Selecting Revisions

Review the **latest 3** commits:
```bash
npx kodevu . --last 3
```

Review **only the 3rd** latest commit:
```bash
npx kodevu . --last -3
```

Review a **specific commit** hash:
```bash
npx kodevu . --rev abc1234
```

### Options & Formatting

Review using **custom instructions** from a file:
```bash
npx kodevu . --prompt @my-rules.txt
```

Generate **JSON reports** in a local folder:
```bash
npx kodevu . --format json --output ./reports
```

### Environment Variables

Set a **persistent reviewer** for your shell session:
```bash
export KODEVU_REVIEWER=gemini
npx kodevu .
```

Use the OpenAI API directly with a small set of extra settings:
```bash
export KODEVU_REVIEWER=openai
export KODEVU_OPENAI_API_KEY=sk-...
export KODEVU_OPENAI_MODEL=gpt-5-mini
npx kodevu .
```

Use a custom OpenAI-compatible endpoint:
```bash
npx kodevu . \
  --reviewer openai \
  --openai-api-key sk-... \
  --openai-base-url https://your-gateway.example.com/v1 \
  --openai-model gpt-5-mini
```

## How it Works

- **Git Targets**: `target` must be a local repository or subdirectory.
- **SVN Targets**: `target` can be a working copy path or repository URL.
- **Reviewer "auto"**: Probes `codex`, `gemini`, and `copilot` in your `PATH` and selects one.
- **Reviewer "openai"**: Calls the OpenAI Chat Completions API directly. `auto` does not select `openai`, so API-based use stays explicit.
- **Contextual Review**: For local repositories, the reviewer can inspect related files beyond the diff to provide deeper insights.

## License

MIT
