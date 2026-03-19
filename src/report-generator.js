export const CORE_REVIEW_INSTRUCTION =
  "Please strictly review the current changes, prioritizing bugs, regression risks, compatibility issues, security concerns, boundary condition flaws, and missing tests. Please use Markdown for your response. If no clear flaws are found, write \"No clear flaws found\" and supplement with residual risks.";

export function getReviewWorkspaceRoot(config, backend, targetInfo) {
  if (backend.kind === "git" && targetInfo.repoRootPath) {
    return targetInfo.repoRootPath;
  }

  if (backend.kind === "svn" && targetInfo.workingCopyPath) {
    return targetInfo.workingCopyPath;
  }

  return config.baseDir;
}

export function buildPrompt(config, backend, targetInfo, details, reviewDiffPayload) {
  const fileList = details.changedPaths.map((item) => `${item.action} ${item.relativePath}`).join("\n");
  const workspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);
  const canReadRelatedFiles = backend.kind === "git" || Boolean(targetInfo.workingCopyPath);

  const langInstruction = config.resolvedLang === "zh"
    ? "Please use Simplified Chinese for your response."
    : `Please use ${config.resolvedLang || "English"} for your response.`;

  return [
    CORE_REVIEW_INSTRUCTION,
    langInstruction,
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
  ].filter(Boolean).join("\n\n");
}

export function formatTokenUsage(tokenUsage) {
  const sourceLabel = tokenUsage.source === "reviewer" ? "reviewer reported" : "estimated (~4 chars/token)";
  return [
    `- Input Tokens: \`${tokenUsage.inputTokens}\``,
    `- Output Tokens: \`${tokenUsage.outputTokens}\``,
    `- Total Tokens: \`${tokenUsage.totalTokens}\``,
    `- Token Source: \`${sourceLabel}\``
  ].join("\n");
}

export function formatDiffHandling(diffPayload, label) {
  return [
    `- ${label} Original Lines: \`${diffPayload.originalLineCount}\``,
    `- ${label} Original Chars: \`${diffPayload.originalCharCount}\``,
    `- ${label} Included Lines: \`${diffPayload.outputLineCount}\``,
    `- ${label} Included Chars: \`${diffPayload.outputCharCount}\``,
    `- ${label} Truncated: \`${diffPayload.wasTruncated ? "yes" : "no"}\``
  ].join("\n");
}

export function formatChangedPaths(changedPaths) {
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

export function formatChangeList(backend, changeIds) {
  return changeIds.map((changeId) => backend.formatChangeId(changeId)).join(", ");
}

export function shouldWriteFormat(config, format) {
  return Array.isArray(config.outputFormats) && config.outputFormats.includes(format);
}

export function buildReport(config, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage) {
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

export function buildJsonReport(config, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage) {
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
