---
name: kodevu
description: A tool to fetch Git commits or SVN revisions, send the diff to a supported AI reviewer CLI, and write configurable review reports.
---

# Kodevu Skill

Kodevu is a Node.js tool that fetches Git commits or SVN revisions, sends the diff to a supported AI reviewer CLI, and writes review results to report files.

## Usage

Use `npx kodevu` to review a codebase. It is designed to be stateless and requires no configuration files.

### Reviewing the latest commit

```bash
npx kodevu .
```

### Reviewing a specific commit

```bash
npx kodevu . --rev <commit-hash>
```

### Reviewing the last N commits

```bash
npx kodevu . --last 3
```

### Supported Reviewers

`kodevu` supports several AI reviewer CLIs: `auto`, `openai`, `gemini`, `codex`, `copilot`. The default is `auto`. Use the `--reviewer` option to override.

Example using OpenAI:
```bash
npx kodevu . --reviewer openai --openai-api-key <YOUR_API_KEY> --openai-model gpt-4o
```

### Generating JSON Reports

By default, review reports are generated as Markdown files in `~/.kodevu/`. You can specify `--format json` or change the output directory using `--output <dir>`.
```bash
npx kodevu . --format json --output ./reports
```

### Formatting the Prompt

You can provide clear instructions to the reviewer using `--prompt`:
```bash
npx kodevu . --prompt "Focus on security issues and suggest optimizations."
```
Or from a file: `--prompt @my-rules.txt`

## Working with Target Repositories

- `target`: Repository path (Git) or SVN URL/Working copy (default: `.`).

For example, to run on a specific path, you can use:
```bash
npx kodevu /path/to/project --last 1
```
