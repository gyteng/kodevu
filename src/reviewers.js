import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./shell.js";
import { prepareDiffPayloads } from "./diff-processor.js";
import { buildPrompt, getReviewWorkspaceRoot } from "./report-generator.js";
import { resolveTokenUsage } from "./token-usage.js";

export const REVIEWERS = {
  codex: {
    displayName: "Codex",
    responseSectionTitle: "Codex Response",
    emptyResponseText: "_No final response returned from codex exec._",
    async run(config, workingDir, promptText, diffText) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kodevu-"));
      const outputFile = path.join(tempDir, "codex-last-message.md");
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--color",
        "never",
        "--output-last-message",
        outputFile,
        "-"
      ];

      try {
        const execResult = await runCommand("codex", args, {
          cwd: workingDir,
          input: [promptText, "Unified diff:", diffText].join("\n\n"),
          allowFailure: true,
          timeoutMs: config.commandTimeoutMs,
          debug: config.debug
        });

        let message = "";

        try {
          message = await fs.readFile(outputFile, "utf8");
        } catch {
          message = execResult.stdout;
        }

        return {
          ...execResult,
          message
        };
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  },
  gemini: {
    displayName: "Gemini",
    responseSectionTitle: "Gemini Response",
    emptyResponseText: "_No final response returned from gemini._",
    async run(config, workingDir, promptText, diffText) {
      const execResult = await runCommand("gemini", ["-p", promptText], {
        cwd: workingDir,
        input: ["Unified diff:", diffText].join("\n\n"),
        allowFailure: true,
        timeoutMs: config.commandTimeoutMs,
        debug: config.debug
      });

      return {
        ...execResult,
        message: execResult.stdout
      };
    }
  },
  copilot: {
    displayName: "Copilot",
    responseSectionTitle: "Copilot Response",
    emptyResponseText: "_No final response returned from copilot._",
    async run(config, workingDir, promptText, diffText) {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kodevu-copilot-"));
      const inputFile = path.join(tempDir, "copilot-stdin.txt");

      try {
        await fs.writeFile(inputFile, ["Unified diff:", diffText].join("\n\n"), "utf8");

        const execResult = await runCommand(
          "copilot",
          [
            "-p",
            promptText,
            "-s",
            "--no-color",
            "--no-ask-user",
            "--allow-all-tools",
            "--add-dir",
            workingDir
          ],
          {
            cwd: workingDir,
            stdinFile: inputFile,
            allowFailure: true,
            timeoutMs: config.commandTimeoutMs,
            debug: config.debug,
            pty: true
          }
        );

        return {
          ...execResult,
          message: execResult.stdout
        };
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }
};

export async function runReviewerPrompt(config, backend, targetInfo, details, diffText) {
  const reviewer = REVIEWERS[config.reviewer];
  const reviewWorkspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);
  const diffPayloads = prepareDiffPayloads(config, diffText);
  const promptText = buildPrompt(config, backend, targetInfo, details, diffPayloads.review);
  const result = await reviewer.run(config, reviewWorkspaceRoot, promptText, diffPayloads.review.text);
  const tokenUsage = resolveTokenUsage(
    config.reviewer,
    result.stderr,
    promptText,
    diffPayloads.review.text,
    result.message
  );

  return {
    reviewer,
    diffPayloads,
    result,
    tokenUsage
  };
}
