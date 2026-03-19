export function getCoreReviewInstruction(lang) {
  const lowLang = (lang || "").toLowerCase();
  if (lowLang.startsWith("zh")) {
    if (lowLang === "zh-tw" || lowLang === "zh-hk") {
      return "請嚴格審查目前的更改，優先考慮錯誤、回歸風險、相容性問題、安全問題、邊界條件缺陷和缺失的測試。請使用 Markdown 進行回覆。如果未發現明顯缺陷，請寫「未發現明顯缺陷」並補充風險。";
    }
    return "请严格审查当前的更改，优先处理 Bug、回归风险、兼容性问题、安全问题、边界条件缺陷和缺失的测试。请使用 Markdown 进行回复。如果未发现明显缺陷，请写“未发现明显缺陷”并补充残留风险。";
  }
  return "Please strictly review the current changes, prioritizing bugs, regression risks, compatibility issues, security concerns, boundary condition flaws, and missing tests. Please use Markdown for your response. If no clear flaws are found, write \"No clear flaws found\" and supplement with residual risks.";
}

export function getReviewWorkspaceRoot(config, backend, targetInfo) {
  if (backend.kind === "git" && targetInfo.repoRootPath) {
    return targetInfo.repoRootPath;
  }

  if (backend.kind === "svn" && targetInfo.workingCopyPath) {
    return targetInfo.workingCopyPath;
  }

  return config.baseDir;
}

function getLanguageDisplayName(lang) {
  if (!lang) return "English";
  const low = lang.toLowerCase();
  if (low.startsWith("zh")) {
    if (low === "zh-tw" || low === "zh-hk") return "Traditional Chinese (繁體中文)";
    return "Simplified Chinese (简体中文)";
  }
  if (low === "jp" || low.startsWith("ja")) return "Japanese (日本語)";
  if (low === "kr" || low.startsWith("ko")) return "Korean (한국어)";
  if (low === "fr") return "French (Français)";
  if (low === "de") return "German (Deutsch)";
  if (low === "es") return "Spanish (Español)";
  if (low === "it") return "Italian (Italiano)";
  if (low === "ru") return "Russian (Русский)";
  return lang;
}

const LOCALIZED_PHRASES = {
  en: {
    workspaceRoot: "You are running inside a read-only workspace rooted at:",
    noWorkspace: "No local repository workspace is available for this review run.",
    besidesDiff: "Besides the diff below, you may read other related files in the workspace when needed to understand call sites, shared utilities, configuration, tests, or data flow. Do not modify files or rely on shell commands.",
    reviewFromDiff: "Review primarily from the diff below. Do not assume access to other local files, shell commands, or repository history.",
    fileRefs: "Use plain text file references like path/to/file.js:123. Do not emit clickable workspace links.",
    repoType: "Repository Type",
    changeId: "Change ID",
    author: "Author",
    date: "Date",
    changedFiles: "Changed files",
    commitMessage: "Commit message",
    diffNoteTruncated: "Diff delivery note: the diff was truncated before being sent to the reviewer to stay within configured size limits. Original diff size was {originalLineCount} lines / {originalCharCount} chars, and the included excerpt is {outputLineCount} lines / {outputCharCount} chars. Use the changed file list and inspect related workspace files when needed.",
    diffNoteFull: "Diff delivery note: the full diff is included. Size is {originalLineCount} lines / {originalCharCount} chars.",
    langRule: "--- IMPORTANT LANGUAGE RULE ---\nYou MUST respond strictly in {langName}. No other language should be used for the explanation and comments."
  },
  zh: {
    workspaceRoot: "你正运行在一个只读工作区内，根目录为：",
    noWorkspace: "此审查运行没有可用的本地仓库工作区。",
    besidesDiff: "除了下面的 Diff，你可以在需要时阅读工作区中的其他相关文件，以了解调用点、共享工具、配置、测试或数据流。请勿修改文件或依赖 Shell 命令。",
    reviewFromDiff: "主要根据下面的 Diff 进行审查。不要假设可以访问其他本地文件、Shell 命令或仓库历史。",
    fileRefs: "使用纯文本文件引用，如 path/to/file.js:123。不要生成可点击的工作区链接。",
    repoType: "仓库类型",
    changeId: "变更 ID",
    author: "作者",
    date: "日期",
    changedFiles: "已变更文件",
    commitMessage: "提交信息",
    diffNoteTruncated: "Diff 交付说明：Diff 在发送给审查者之前已被截斷，以保持在配置的大小限制内。原始 Diff 大小为 {originalLineCount} 行 / {originalCharCount} 个字符，包含的摘录为 {outputLineCount} 行 / {outputCharCount} 个字符。在需要时使用已更正文件列表并检查相关工作区文件。",
    diffNoteFull: "Diff 交付说明：包含完整的 Diff。大小为 {originalLineCount} 行 / {originalCharCount} 个字符。",
    langRule: "--- 重要语言规则 ---\n你必须严格使用 {langName} 进行回复。解释、评论和总结均不得使用其他语言。"
  },
  "zh-tw": {
    workspaceRoot: "你正運行在一個唯讀工作區內，根目錄為：",
    noWorkspace: "此審查運行沒有可用的本地倉庫工作區。",
    besidesDiff: "除了下面的 Diff，你可以在需要時閱讀工作區中的其他相關文件，以了解調用點、共享工具、配置、測試或資料流。請勿修改文件或依賴 Shell 命令。",
    reviewFromDiff: "主要根據下面的 Diff 進行審查。不要假設可以訪問其他本地文件、Shell 命令或倉庫歷史。",
    fileRefs: "使用純文本文件引用，如 path/to/file.js:123。不要生成可點擊的工作區連結。",
    repoType: "倉庫類型",
    changeId: "變更 ID",
    author: "作者",
    date: "日期",
    changedFiles: "已變更文件",
    commitMessage: "提交信息",
    diffNoteTruncated: "Diff 交付說明：Diff 在傳送給審查者之前已被截斷，以保持在配置的大小限制內。原始 Diff 大小為 {originalLineCount} 行 / {originalCharCount} 個字符，包含的摘錄為 {outputLineCount} 行 / {outputCharCount} 個字符。在需要時使用已更正文件列表並檢查相關工作區文件。",
    diffNoteFull: "Diff 交付說明：包含完整的 Diff。大小為 {originalLineCount} 行 / {originalCharCount} 個字符。",
    langRule: "--- 重要語言規則 ---\n你必須嚴格使用 {langName} 進行回覆。解釋、評論和總結均不得使用其他語言。"
  }
};

function getPhrase(key, lang, placeholders = {}) {
  const lowLang = (lang || "en").toLowerCase();
  const langKey = lowLang.startsWith("zh") ? (lowLang === "zh-tw" || lowLang === "zh-hk" ? "zh-tw" : "zh") : "en";
  let phrase = LOCALIZED_PHRASES[langKey][key] || LOCALIZED_PHRASES.en[key];

  for (const [k, v] of Object.entries(placeholders)) {
    phrase = phrase.replace(`{${k}}`, v);
  }
  return phrase;
}

export function buildPrompt(config, backend, targetInfo, details, reviewDiffPayload) {
  const fileList = details.changedPaths.map((item) => `${item.action} ${item.relativePath}`).join("\n");
  const workspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);
  const canReadRelatedFiles = backend.kind === "git" || Boolean(targetInfo.workingCopyPath);

  const lang = config.resolvedLang || "en";
  const langName = getLanguageDisplayName(lang);
  const lowLang = lang.toLowerCase();

  let langInstruction = `IMPORTANT: Your entire response MUST be in ${langName}. All explanations, comments, and structure should strictly follow the ${langName} language rules.`;

  if (lowLang.startsWith("zh")) {
    if (lowLang === "zh-tw" || lowLang === "zh-hk") {
      langInstruction += "\n請務必使用繁體中文進行回覆，所有的審查評論和分析都必須以繁體中文呈現。";
    } else {
      langInstruction += "\n请务必使用简体中文进行回复，所有的审查评论和分析都必须以简体中文呈现。";
    }
  }

  return [
    langInstruction,
    getCoreReviewInstruction(lang),
    config.prompt,
    canReadRelatedFiles
      ? `${getPhrase("workspaceRoot", lang)} ${workspaceRoot}`
      : getPhrase("noWorkspace", lang),
    canReadRelatedFiles
      ? getPhrase("besidesDiff", lang)
      : getPhrase("reviewFromDiff", lang),
    getPhrase("fileRefs", lang),
    `${getPhrase("repoType", lang)}: ${backend.displayName}`,
    `${getPhrase("changeId", lang)}: ${details.displayId}`,
    `${getPhrase("author", lang)}: ${details.author}`,
    `${getPhrase("date", lang)}: ${details.date || "unknown"}`,
    `${getPhrase("changedFiles", lang)}:\n${fileList || "(none)"}`,
    `${getPhrase("commitMessage", lang)}:\n${details.message || "(empty)"}`,
    reviewDiffPayload.wasTruncated
      ? getPhrase("diffNoteTruncated", lang, {
          originalLineCount: reviewDiffPayload.originalLineCount,
          originalCharCount: reviewDiffPayload.originalCharCount,
          outputLineCount: reviewDiffPayload.outputLineCount,
          outputCharCount: reviewDiffPayload.outputCharCount
        })
      : getPhrase("diffNoteFull", lang, {
          originalLineCount: reviewDiffPayload.originalLineCount,
          originalCharCount: reviewDiffPayload.originalCharCount
        }),
    getPhrase("langRule", lang, { langName }) +
      (lowLang.startsWith("zh")
        ? lowLang === "zh-tw" || lowLang === "zh-hk"
          ? "\n請務必完全使用繁體中文進行回覆，所有的審查分析、注釋和總結都必須使用繁體中文。"
          : "\n请务必完全使用简体中文进行回复，所有的审查分析、注释和总结都必须使用简体中文。"
        : "")
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
