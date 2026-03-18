import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProgressDisplay } from "./progress-ui.js";
import { runCommand } from "./shell.js";
import { resolveRepositoryContext } from "./vcs-client.js";
import { logger } from "./logger.js";

const DIFF_LIMITS = {
  review: {
    maxLines: 4000,
    maxChars: 120000
  },
  report: {
    maxLines: 1500,
    maxChars: 40000
  },
  tailLines: 200
};


function estimateTokenCount(text) {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

function parseGeminiTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

function parseCodexTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

function parseCopilotTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

const TOKEN_PARSERS = {
  gemini: parseGeminiTokenUsage,
  codex: parseCodexTokenUsage,
  copilot: parseCopilotTokenUsage
};

function resolveTokenUsage(reviewerName, stderr, promptText, diffText, responseText) {
  const parseFn = TOKEN_PARSERS[reviewerName] || parseCopilotTokenUsage;
  const parsed = parseFn(stderr);

  if (parsed && parsed.totalTokens > 0) {
    return { ...parsed, source: "reviewer" };
  }

  const inputTokens = estimateTokenCount((promptText || "") + (diffText || ""));
  const outputTokens = estimateTokenCount(responseText || "");

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source: "estimate"
  };
}

const REVIEWERS = {
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
      const execResult = await runCommand("copilot", ["-p", promptText], {
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
  }
};

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function loadState(stateFile) {
  if (!(await pathExists(stateFile))) {
    return { version: 2, projects: {} };
  }

  const raw = await fs.readFile(stateFile, "utf8");
  return normalizeStateFile(JSON.parse(raw));
}

async function saveState(stateFile, state) {
  await ensureDir(path.dirname(stateFile));
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function normalizeStateFile(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error('State file must be a JSON object with shape {"version":2,"projects":{...}}.');
  }

  if (state.version !== 2) {
    throw new Error('State file version must be 2.');
  }

  if (!state.projects || typeof state.projects !== "object" || Array.isArray(state.projects)) {
    throw new Error('State file must contain a "projects" object.');
  }

  return {
    version: 2,
    projects: state.projects
  };
}

function getProjectState(stateFile, targetInfo) {
  return stateFile.projects?.[targetInfo.stateKey] ?? {};
}

function updateProjectState(stateFile, targetInfo, projectState) {
  return {
    version: 2,
    projects: {
      ...(stateFile.projects || {}),
      [targetInfo.stateKey]: projectState
    }
  };
}

async function writeTextFile(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}

async function writeJsonFile(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function shouldWriteFormat(config, format) {
  return Array.isArray(config.outputFormats) && config.outputFormats.includes(format);
}

function formatChangedPaths(changedPaths) {
  if (changedPaths.length === 0) {
    return "_No changed files captured._";
  }

  return changedPaths
    .map((item) => {
      const renameSuffix = item.previousPath ? ` (from ${item.previousPath})` : "";
      return `- \`${item.action}\` ${item.relativePath}${renameSuffix}`;
    })
    .join("\n");
}

function getReviewWorkspaceRoot(config, backend, targetInfo) {
  if (backend.kind === "git" && targetInfo.repoRootPath) {
    return targetInfo.repoRootPath;
  }

  if (backend.kind === "svn" && targetInfo.workingCopyPath) {
    return targetInfo.workingCopyPath;
  }

  return config.baseDir;
}

function countLines(text) {
  if (!text) {
    return 0;
  }

  return text.split(/\r?\n/).length;
}

function trimBlockToChars(text, maxChars, keepTail = false) {
  if (text.length <= maxChars) {
    return text;
  }

  if (maxChars <= 3) {
    return ".".repeat(Math.max(maxChars, 0));
  }

  return keepTail ? `...${text.slice(-(maxChars - 3))}` : `${text.slice(0, maxChars - 3)}...`;
}

function truncateDiffText(diffText, maxLines, maxChars, tailLines, purposeLabel) {
  const normalizedDiff = diffText.replace(/\r\n/g, "\n");
  const originalLineCount = countLines(normalizedDiff);
  const originalCharCount = normalizedDiff.length;

  if (originalLineCount <= maxLines && originalCharCount <= maxChars) {
    return {
      text: diffText,
      wasTruncated: false,
      originalLineCount,
      originalCharCount,
      outputLineCount: originalLineCount,
      outputCharCount: originalCharCount
    };
  }

  const lines = normalizedDiff.split("\n");
  const safeTailLines = Math.min(Math.max(tailLines, 0), Math.max(maxLines - 2, 0));
  const headLineCount = Math.max(maxLines - safeTailLines - 1, 1);
  let headBlock = lines.slice(0, headLineCount).join("\n");
  let tailBlock = safeTailLines > 0 ? lines.slice(-safeTailLines).join("\n") : "";
  const omittedLineCount = Math.max(originalLineCount - headLineCount - safeTailLines, 0);
  const markerBlock = [
    `... diff truncated for ${purposeLabel} ...`,
    `original lines: ${originalLineCount}, original chars: ${originalCharCount}`,
    `omitted lines: ${omittedLineCount}`
  ].join("\n");

  let truncatedText = [headBlock, markerBlock, tailBlock].filter(Boolean).join("\n");

  if (truncatedText.length > maxChars) {
    const reservedChars = markerBlock.length + (tailBlock ? 2 : 1);
    const remainingChars = Math.max(maxChars - reservedChars, 0);
    const headBudget = tailBlock ? Math.floor(remainingChars * 0.7) : remainingChars;
    const tailBudget = tailBlock ? Math.max(remainingChars - headBudget, 0) : 0;
    headBlock = trimBlockToChars(headBlock, headBudget, false);
    tailBlock = trimBlockToChars(tailBlock, tailBudget, true);
    truncatedText = [headBlock, markerBlock, tailBlock].filter(Boolean).join("\n");
  }

  return {
    text: truncatedText,
    wasTruncated: true,
    originalLineCount,
    originalCharCount,
    outputLineCount: countLines(truncatedText),
    outputCharCount: truncatedText.length
  };
}

function prepareDiffPayloads(config, diffText) {
  return {
    review: truncateDiffText(
      diffText,
      DIFF_LIMITS.review.maxLines,
      DIFF_LIMITS.review.maxChars,
      DIFF_LIMITS.tailLines,
      "reviewer input"
    ),
    report: truncateDiffText(
      diffText,
      DIFF_LIMITS.report.maxLines,
      DIFF_LIMITS.report.maxChars,
      Math.min(DIFF_LIMITS.tailLines, DIFF_LIMITS.report.maxLines),
      "report output"
    )
  };
}

function formatDiffHandling(diffPayload, label) {
  return [
    `- ${label} Original Lines: \`${diffPayload.originalLineCount}\``,
    `- ${label} Original Chars: \`${diffPayload.originalCharCount}\``,
    `- ${label} Included Lines: \`${diffPayload.outputLineCount}\``,
    `- ${label} Included Chars: \`${diffPayload.outputCharCount}\``,
    `- ${label} Truncated: \`${diffPayload.wasTruncated ? "yes" : "no"}\``
  ].join("\n");
}

function buildPrompt(config, backend, targetInfo, details, reviewDiffPayload) {
  const fileList = details.changedPaths.map((item) => `${item.action} ${item.relativePath}`).join("\n");
  const workspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);
  const canReadRelatedFiles = backend.kind === "git" || Boolean(targetInfo.workingCopyPath);

  return [
    config.prompt,
    canReadRelatedFiles
      ? `You are running inside a read-only workspace rooted at: ${workspaceRoot}`
      : "No local repository workspace is available for this review run.",
    canReadRelatedFiles
      ? "Besides the diff below, you may read other related files in the workspace when needed to understand call sites, shared utilities, configuration, tests, or data flow. Do not modify files or rely on shell commands."
      : "Review primarily from the diff below. Do not assume access to other local files, shell commands, or repository history.",
    "Use plain text file references like path/to/file.js:123. Do not emit clickable workspace links.",
    `Repository Type: ${backend.displayName}`,
    `Change ID: ${details.displayId}`,
    `Author: ${details.author}`,
    `Date: ${details.date || "unknown"}`,
    `Changed files:\n${fileList || "(none)"}`,
    `Commit message:\n${details.message || "(empty)"}`,
    reviewDiffPayload.wasTruncated
      ? `Diff delivery note: the diff was truncated before being sent to the reviewer to stay within configured size limits. Original diff size was ${reviewDiffPayload.originalLineCount} lines / ${reviewDiffPayload.originalCharCount} chars, and the included excerpt is ${reviewDiffPayload.outputLineCount} lines / ${reviewDiffPayload.outputCharCount} chars. Use the changed file list and inspect related workspace files when needed.`
      : `Diff delivery note: the full diff is included. Size is ${reviewDiffPayload.originalLineCount} lines / ${reviewDiffPayload.originalCharCount} chars.`
  ].join("\n\n");
}

function formatTokenUsage(tokenUsage) {
  const sourceLabel = tokenUsage.source === "reviewer" ? "reviewer reported" : "estimated (~4 chars/token)";
  return [
    `- Input Tokens: \`${tokenUsage.inputTokens}\``,
    `- Output Tokens: \`${tokenUsage.outputTokens}\``,
    `- Total Tokens: \`${tokenUsage.totalTokens}\``,
    `- Token Source: \`${sourceLabel}\``
  ].join("\n");
}

function buildReport(config, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage) {
  const lines = [
    `# ${backend.displayName} Review Report: ${details.displayId}`,
    "",
    `- Repository Type: \`${backend.displayName}\``,
    `- Target: \`${targetInfo.targetDisplay || config.target}\``,
    `- Change ID: \`${details.displayId}\``,
    `- Author: \`${details.author}\``,
    `- Commit Date: \`${details.date || "unknown"}\``,
    `- Generated At: \`${new Date().toISOString()}\``,
    `- Reviewer: \`${reviewer.displayName}\``,
    `- Reviewer Exit Code: \`${reviewerResult.code}\``,
    `- Reviewer Timed Out: \`${reviewerResult.timedOut ? "yes" : "no"}\``,
    "",
    "## Token Usage",
    "",
    formatTokenUsage(tokenUsage),
    "",
    "## Changed Files",
    "",
    formatChangedPaths(details.changedPaths),
    "",
    "## Commit Message",
    "",
    details.message ? "```text\n" + details.message + "\n```" : "_Empty_",
    "",
    "## Review Context",
    "",
    "```text",
    buildPrompt(config, backend, targetInfo, details, diffPayloads.review),
    "```",
    "",
    "## Diff Handling",
    "",
    formatDiffHandling(diffPayloads.review, "Reviewer Input"),
    formatDiffHandling(diffPayloads.report, "Report Diff"),
    "",
    "## Diff",
    "",
    "```diff",
    diffPayloads.report.text.trim() || "(empty diff)",
    "```",
    "",
    `## ${reviewer.responseSectionTitle}`,
    "",
    reviewerResult.message?.trim() ? reviewerResult.message.trim() : reviewer.emptyResponseText
  ];

  return `${lines.join("\n")}\n`;
}

function buildJsonReport(config, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage) {
  return {
    repositoryType: backend.displayName,
    target: targetInfo.targetDisplay || config.target,
    changeId: details.displayId,
    author: details.author,
    commitDate: details.date || "unknown",
    generatedAt: new Date().toISOString(),
    reviewer: {
      name: reviewer.displayName,
      exitCode: reviewerResult.code,
      timedOut: Boolean(reviewerResult.timedOut)
    },
    tokenUsage: {
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
      source: tokenUsage.source
    },
    changedFiles: details.changedPaths.map((item) => ({
      action: item.action,
      path: item.relativePath,
      previousPath: item.previousPath || null
    })),
    commitMessage: details.message || "",
    reviewContext: buildPrompt(config, backend, targetInfo, details, diffPayloads.review),
    diffHandling: {
      reviewerInput: {
        originalLines: diffPayloads.review.originalLineCount,
        originalChars: diffPayloads.review.originalCharCount,
        includedLines: diffPayloads.review.outputLineCount,
        includedChars: diffPayloads.review.outputCharCount,
        truncated: diffPayloads.review.wasTruncated
      },
      reportDiff: {
        originalLines: diffPayloads.report.originalLineCount,
        originalChars: diffPayloads.report.originalCharCount,
        includedLines: diffPayloads.report.outputLineCount,
        includedChars: diffPayloads.report.outputCharCount,
        truncated: diffPayloads.report.wasTruncated
      }
    },
    diff: diffPayloads.report.text.trim(),
    reviewerResponse: reviewerResult.message?.trim() ? reviewerResult.message.trim() : reviewer.emptyResponseText
  };
}

async function runReviewerPrompt(config, backend, targetInfo, details, diffText) {
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

function readLastReviewedId(state, backend, targetInfo) {
  return backend.fromStateValue(state);
}

function buildStateSnapshot(backend, targetInfo, changeId) {
  return {
    lastReviewedId: backend.toStateValue(changeId),
    updatedAt: new Date().toISOString()
  };
}

async function reviewChange(config, backend, targetInfo, changeId, progress) {
  progress?.update(0.05, "loading change details");
  const details = await backend.getChangeDetails(config, targetInfo, changeId);

  if (details.changedPaths.length === 0) {
    progress?.update(0.7, "writing skipped report");
    const skippedReport = [
      `# ${backend.displayName} Review Report: ${details.displayId}`,
      "",
      "No file changes were captured for this change under the configured target."
    ].join("\n");

    const markdownReportFile = path.join(config.outputDir, backend.getReportFileName(changeId));
    const jsonReportFile = markdownReportFile.replace(/\.md$/i, ".json");

    if (shouldWriteFormat(config, "markdown")) {
      await writeTextFile(markdownReportFile, `${skippedReport}\n`);
    }

    if (shouldWriteFormat(config, "json")) {
      await writeJsonFile(jsonReportFile, {
        repositoryType: backend.displayName,
        target: targetInfo.targetDisplay || config.target,
        changeId: details.displayId,
        generatedAt: new Date().toISOString(),
        skipped: true,
        message: "No file changes were captured for this change under the configured target."
      });
    }

    return {
      success: true,
      outputFile: shouldWriteFormat(config, "markdown") ? markdownReportFile : null,
      jsonOutputFile: shouldWriteFormat(config, "json") ? jsonReportFile : null
    };
  }

  progress?.update(0.2, "loading diff");
  const diffText = await backend.getChangeDiff(config, targetInfo, changeId);
  const reviewersToTry = [config.reviewer, ...(config.fallbackReviewers || [])];

  let reviewer;
  let diffPayloads;
  let reviewerResult;
  let tokenUsage;
  let currentReviewerConfig;

  for (const reviewerName of reviewersToTry) {
    currentReviewerConfig = { ...config, reviewer: reviewerName };
    logger.debug(`Trying reviewer: ${reviewerName}`);
    progress?.update(0.45, `running reviewer ${reviewerName}`);

    const res = await runReviewerPrompt(
      currentReviewerConfig,
      backend,
      targetInfo,
      details,
      diffText
    );
    reviewer = res.reviewer;
    diffPayloads = res.diffPayloads;
    reviewerResult = res.result;
    tokenUsage = res.tokenUsage;

    if (reviewerResult.code === 0 && !reviewerResult.timedOut) {
      break;
    }

    if (reviewerName !== reviewersToTry[reviewersToTry.length - 1]) {
      progress?.log(`${reviewer.displayName} failed for ${details.displayId}; trying next reviewer...`);
    }
  }

  progress?.update(0.82, "writing report");
  logger.debug(`Token usage: input=${tokenUsage.inputTokens} output=${tokenUsage.outputTokens} total=${tokenUsage.totalTokens} source=${tokenUsage.source}`);
  const report = buildReport(currentReviewerConfig, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage);
  const outputFile = path.join(config.outputDir, backend.getReportFileName(changeId));
  const jsonOutputFile = outputFile.replace(/\.md$/i, ".json");

  if (shouldWriteFormat(config, "markdown")) {
    await writeTextFile(outputFile, report);
  }

  if (shouldWriteFormat(config, "json")) {
    await writeJsonFile(
      jsonOutputFile,
      buildJsonReport(currentReviewerConfig, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage)
    );
  }

  if (reviewerResult.code !== 0 || reviewerResult.timedOut) {
    throw new Error(
      `${reviewer.displayName} failed for ${details.displayId}; report written to ${outputFile}${
        shouldWriteFormat(config, "json") ? ` and ${jsonOutputFile}` : ""
      }`
    );
  }

  return {
    success: true,
    outputFile: shouldWriteFormat(config, "markdown") ? outputFile : null,
    jsonOutputFile: shouldWriteFormat(config, "json") ? jsonOutputFile : null,
    details
  };
}

function formatChangeList(backend, changeIds) {
  return changeIds.map((changeId) => backend.formatChangeId(changeId)).join(", ");
}

function updateOverallProgress(progress, completedCount, totalCount, currentFraction, stage) {
  if (!progress || totalCount <= 0) {
    return;
  }

  const overallFraction = (completedCount + currentFraction) / totalCount;
  progress.update(overallFraction, `${completedCount}/${totalCount} completed${stage ? ` | ${stage}` : ""}`);
}

export async function runReviewCycle(config) {
  await ensureDir(config.outputDir);

  const { backend, targetInfo } = await resolveRepositoryContext(config);
  logger.debug(
    `Resolved repository context: backend=${backend.kind} target=${targetInfo.targetDisplay || config.target} stateKey=${targetInfo.stateKey}`
  );
  const latestChangeId = await backend.getLatestChangeId(config, targetInfo);
  const stateFile = await loadState(config.stateFilePath);
  const projectState = getProjectState(stateFile, targetInfo);
  let lastReviewedId = readLastReviewedId(projectState, backend, targetInfo);
  logger.debug(
    `Checkpoint status: latest=${backend.formatChangeId(latestChangeId)} lastReviewed=${lastReviewedId ? backend.formatChangeId(lastReviewedId) : "(none)"}`
  );

  if (lastReviewedId) {
    const checkpointIsValid = await backend.isValidCheckpoint(config, targetInfo, lastReviewedId, latestChangeId);

    if (!checkpointIsValid) {
      logger.info("Saved review state no longer matches repository history. Resetting checkpoint.");
      lastReviewedId = null;
    }
  }

  let changeIdsToReview = [];

  if (!lastReviewedId) {
    changeIdsToReview = [latestChangeId];
    logger.info(`Initialized state to review the latest ${backend.changeName} ${backend.formatChangeId(latestChangeId)} first.`);
  } else {
    changeIdsToReview = await backend.getPendingChangeIds(
      config,
      targetInfo,
      lastReviewedId,
      latestChangeId,
      config.maxRevisionsPerRun
    );
  }

  logger.debug(`Planned ${changeIdsToReview.length} ${backend.changeName}(s) for this cycle.`);

  if (changeIdsToReview.length === 0) {
    const lastKnownId = lastReviewedId ? backend.formatChangeId(lastReviewedId) : "(none)";
    logger.info(`No new ${backend.changeName}s. Last reviewed: ${lastKnownId}`);
    return;
  }

  logger.info(`Reviewing ${backend.displayName} ${backend.changeName}s ${formatChangeList(backend, changeIdsToReview)}`);
  const progressDisplay = new ProgressDisplay();
  logger.setProgressDisplay(progressDisplay);
  const progress = progressDisplay.createItem(`${backend.displayName} ${backend.changeName} batch`);
  progress.start("0/" + changeIdsToReview.length + " completed");

  for (const [index, changeId] of changeIdsToReview.entries()) {
    logger.debug(`Starting review for ${backend.formatChangeId(changeId)}.`);
    const displayId = backend.formatChangeId(changeId);
    updateOverallProgress(progress, index, changeIdsToReview.length, 0, `starting ${displayId}`);

    const syncOverallProgress = (fraction, stage) => {
      updateOverallProgress(progress, index, changeIdsToReview.length, fraction, `${displayId} | ${stage}`);
    };

    let result;

    try {
      result = await reviewChange(config, backend, targetInfo, changeId, { update: syncOverallProgress, log: (message) => progress.log(message) });
      syncOverallProgress(0.94, "saving checkpoint");
    } catch (error) {
      progress.fail(`failed at ${displayId} (${index}/${changeIdsToReview.length} completed)`);
      throw error;
    }

    const outputLabels = [
      result.outputFile ? `md: ${result.outputFile}` : null,
      result.jsonOutputFile ? `json: ${result.jsonOutputFile}` : null
    ].filter(Boolean);
    const nextProjectState = buildStateSnapshot(backend, targetInfo, changeId);
    await saveState(config.stateFilePath, updateProjectState(stateFile, targetInfo, nextProjectState));
    stateFile.projects[targetInfo.stateKey] = nextProjectState;
    logger.debug(`Saved checkpoint for ${backend.formatChangeId(changeId)} to ${config.stateFilePath}.`);
    progress.log(`[done] reviewed ${displayId}: ${outputLabels.join(" | ") || "(no report file generated)"}`);
    updateOverallProgress(progress, index + 1, changeIdsToReview.length, 0, `finished ${displayId}`);
  }

  progress.succeed(`completed ${changeIdsToReview.length}/${changeIdsToReview.length}`);

  const remainingChanges = await backend.getPendingChangeIds(
    config,
    targetInfo,
    changeIdsToReview[changeIdsToReview.length - 1],
    latestChangeId,
    1
  );

  if (remainingChanges.length > 0) {
    logger.info(`Backlog remains. Latest ${backend.changeName} is ${backend.formatChangeId(latestChangeId)}.`);
  }
}
