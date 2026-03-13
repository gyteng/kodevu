import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./shell.js";
import { resolveRepositoryContext } from "./vcs-client.js";

const CODEX_COMMAND = "codex";

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

function buildPrompt(config, backend, targetInfo, details) {
  const fileList = details.changedPaths.map((item) => `${item.action} ${item.relativePath}`).join("\n");
  const workspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);
  const canReadRelatedFiles = backend.kind === "git" || Boolean(targetInfo.workingCopyPath);

  return [
    config.reviewPrompt,
    canReadRelatedFiles
      ? `You are running inside a read-only workspace rooted at: ${workspaceRoot}`
      : "No local repository workspace is available for this review run.",
    canReadRelatedFiles
      ? "Besides the diff below, you may read other related files in the workspace when needed to understand call sites, shared utilities, configuration, tests, or data flow. Do not modify files or rely on shell commands."
      : "Review primarily from the diff below. Do not assume access to other local files, shell commands, or repository history.",
    "Use plain text file references like path/to/file.js:123. Do not emit clickable workspace links.",
    "Write the final review in Simplified Chinese.",
    `Repository Type: ${backend.displayName}`,
    `Change ID: ${details.displayId}`,
    `Author: ${details.author}`,
    `Date: ${details.date || "unknown"}`,
    `Changed files:\n${fileList || "(none)"}`,
    `Commit message:\n${details.message || "(empty)"}`
  ].join("\n\n");
}

function buildReport(config, backend, targetInfo, details, diffText, codexResult) {
  const lines = [
    `# ${backend.displayName} Review Report: ${details.displayId}`,
    "",
    `- Repository Type: \`${backend.displayName}\``,
    `- Target: \`${targetInfo.targetDisplay || config.target}\``,
    `- Change ID: \`${details.displayId}\``,
    `- Author: \`${details.author}\``,
    `- Commit Date: \`${details.date || "unknown"}\``,
    `- Generated At: \`${new Date().toISOString()}\``,
    `- Codex Exit Code: \`${codexResult.code}\``,
    `- Codex Timed Out: \`${codexResult.timedOut ? "yes" : "no"}\``,
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
    buildPrompt(config, backend, targetInfo, details),
    "```",
    "",
    "## Diff",
    "",
    "```diff",
    diffText.trim() || "(empty diff)",
    "```",
    "",
    "## Codex Response",
    "",
    codexResult.message?.trim() ? codexResult.message.trim() : "_No final response returned from codex exec._"
  ];

  return `${lines.join("\n")}\n`;
}

async function runCodexPrompt(config, backend, targetInfo, details, diffText) {
  const args = [];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kodevu-"));
  const outputFile = path.join(tempDir, "codex-last-message.md");
  const reviewWorkspaceRoot = getReviewWorkspaceRoot(config, backend, targetInfo);

  args.push(
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--output-last-message",
    outputFile,
    "-"
  );

  const prompt = [buildPrompt(config, backend, targetInfo, details), "Unified diff:", diffText].join("\n\n");
  try {
    const execResult = await runCommand(CODEX_COMMAND, args, {
      cwd: reviewWorkspaceRoot,
      input: prompt,
      allowFailure: true,
      timeoutMs: config.commandTimeoutMs
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

function readLastReviewedId(state, backend, targetInfo) {
  if (state.vcs && state.vcs !== backend.kind) {
    return null;
  }

  if (state.targetKey && state.targetKey !== targetInfo.stateKey) {
    return null;
  }

  return backend.fromStateValue(state);
}

function buildStateSnapshot(backend, targetInfo, changeId) {
  const state = {
    vcs: backend.kind,
    targetKey: targetInfo.stateKey,
    lastReviewedId: backend.toStateValue(changeId),
    updatedAt: new Date().toISOString()
  };

  return backend.extendState(state, changeId);
}

async function reviewChange(config, backend, targetInfo, changeId) {
  const details = await backend.getChangeDetails(config, targetInfo, changeId);

  if (details.changedPaths.length === 0) {
    const skippedReport = [
      `# ${backend.displayName} Review Report: ${details.displayId}`,
      "",
      "No file changes were captured for this change under the configured target."
    ].join("\n");

    const outputFile = path.join(config.outputDir, backend.getReportFileName(changeId));
    await writeTextFile(outputFile, `${skippedReport}\n`);
    return { success: true, outputFile };
  }

  const diffText = await backend.getChangeDiff(config, targetInfo, changeId);
  const codexResult = await runCodexPrompt(config, backend, targetInfo, details, diffText);
  const report = buildReport(config, backend, targetInfo, details, diffText, codexResult);
  const outputFile = path.join(config.outputDir, backend.getReportFileName(changeId));
  await writeTextFile(outputFile, report);

  if (codexResult.code !== 0 || codexResult.timedOut) {
    throw new Error(`codex exec failed for ${details.displayId}; report written to ${outputFile}`);
  }

  return { success: true, outputFile, details };
}

function formatChangeList(backend, changeIds) {
  return changeIds.map((changeId) => backend.formatChangeId(changeId)).join(", ");
}

export async function runReviewCycle(config) {
  await ensureDir(config.outputDir);

  const { backend, targetInfo } = await resolveRepositoryContext(config);
  const latestChangeId = await backend.getLatestChangeId(config, targetInfo);
  const stateFile = await loadState(config.stateFilePath);
  const projectState = getProjectState(stateFile, targetInfo);
  let lastReviewedId = readLastReviewedId(projectState, backend, targetInfo);

  if (lastReviewedId) {
    const checkpointIsValid = await backend.isValidCheckpoint(config, targetInfo, lastReviewedId, latestChangeId);

    if (!checkpointIsValid) {
      console.log("Saved review state no longer matches repository history. Resetting checkpoint.");
      lastReviewedId = null;
    }
  }

  let changeIdsToReview = [];

  if (!lastReviewedId && config.bootstrapToLatest) {
    changeIdsToReview = [latestChangeId];
    console.log(`Initialized state to review the latest ${backend.changeName} ${backend.formatChangeId(latestChangeId)} first.`);
  } else {
    changeIdsToReview = await backend.getPendingChangeIds(
      config,
      targetInfo,
      lastReviewedId,
      latestChangeId,
      config.maxRevisionsPerRun
    );
  }

  if (changeIdsToReview.length === 0) {
    const lastKnownId = lastReviewedId ? backend.formatChangeId(lastReviewedId) : "(none)";
    console.log(`No new ${backend.changeName}s. Last reviewed: ${lastKnownId}`);
    return;
  }

  console.log(`Reviewing ${backend.displayName} ${backend.changeName}s ${formatChangeList(backend, changeIdsToReview)}`);

  for (const changeId of changeIdsToReview) {
    const result = await reviewChange(config, backend, targetInfo, changeId);
    console.log(`Reviewed ${backend.formatChangeId(changeId)}: ${result.outputFile}`);
    const nextProjectState = buildStateSnapshot(backend, targetInfo, changeId);
    await saveState(config.stateFilePath, updateProjectState(stateFile, targetInfo, nextProjectState));
    stateFile.projects[targetInfo.stateKey] = nextProjectState;
  }

  const remainingChanges = await backend.getPendingChangeIds(
    config,
    targetInfo,
    changeIdsToReview[changeIdsToReview.length - 1],
    latestChangeId,
    1
  );

  if (remainingChanges.length > 0) {
    console.log(`Backlog remains. Latest ${backend.changeName} is ${backend.formatChangeId(latestChangeId)}.`);
  }
}
