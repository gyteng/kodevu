import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./shell.js";
import { prepareDiffPayloads } from "./diff-processor.js";
import { buildPrompt, getReviewWorkspaceRoot } from "./report-generator.js";
import { resolveTokenUsage } from "./token-usage.js";

function buildOpenAiRequestHeaders(config) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${config.openaiApiKey}`
  };

  if (config.openaiOrganization) {
    headers["OpenAI-Organization"] = config.openaiOrganization;
  }

  if (config.openaiProject) {
    headers["OpenAI-Project"] = config.openaiProject;
  }

  return headers;
}

function extractOpenAiMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item?.type === "text" && typeof item.text === "string") {
        return item.text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

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
      const reviewInputFile = path.join(tempDir, "review-input.md");
      const copilotPrompt = [
        `Use the file-reading tools to open this exact file path: ${reviewInputFile}`,
        "That file contains the full review instructions and the unified diff to review.",
        "Follow the instructions from that file exactly and output the final review directly.",
        "Do not call any MCP tools or external tools except for reading the initial instruction file.",
        "Do not ask clarifying questions. Do not mention tool usage. Do not say you are ready.",
        "Start immediately with the review content."
      ].join("\n");
      const args = [
        "-p",
        copilotPrompt,
        "-s",
        "--no-color",
        "--no-ask-user",
        "--no-custom-instructions",
        "--allow-all-tools",
        "--add-dir",
        workingDir,
        "--add-dir",
        tempDir
      ];

      try {
        await fs.writeFile(
          reviewInputFile,
          [promptText, "### Unified Diff", "```diff", diffText, "```"].join("\n\n"),
          "utf8"
        );

        const execResult = await runCommand("copilot", args, {
          cwd: workingDir,
          allowFailure: true,
          timeoutMs: config.commandTimeoutMs,
          debug: config.debug
        });

        return {
          ...execResult,
          message: execResult.stdout
        };
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  },
  openai: {
    displayName: "OpenAI API",
    responseSectionTitle: "OpenAI Response",
    emptyResponseText: "_No final response returned from the OpenAI API._",
    async run(config, workingDir, promptText, diffText) {
      const requestBody = {
        model: config.openaiModel,
        messages: [
          {
            role: "user",
            content: [promptText, "Unified diff:", diffText].join("\n\n")
          }
        ]
      };

      try {
        const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
          method: "POST",
          headers: buildOpenAiRequestHeaders(config),
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(config.commandTimeoutMs)
        });

        const responseText = await response.text();
        let payload;

        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const errorMessage = payload?.error?.message || responseText || `HTTP ${response.status}`;
          return {
            code: response.status,
            timedOut: false,
            stdout: "",
            stderr: errorMessage,
            message: ""
          };
        }

        const message = extractOpenAiMessageContent(payload?.choices?.[0]?.message?.content);
        const usage = payload?.usage
          ? {
              inputTokens: Number(payload.usage.prompt_tokens || 0),
              outputTokens: Number(payload.usage.completion_tokens || 0),
              totalTokens: Number(payload.usage.total_tokens || 0)
            }
          : null;

        return {
          code: 0,
          timedOut: false,
          stdout: responseText,
          stderr: "",
          message,
          usage
        };
      } catch (error) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        return {
          code: 1,
          timedOut,
          stdout: "",
          stderr: error?.message || String(error),
          message: ""
        };
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
    result.usage,
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
