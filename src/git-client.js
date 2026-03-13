import fs from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./shell.js";

const GIT_COMMAND = "git";
const COMMAND_ENCODING = "utf8";

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildPathArgs(targetInfo) {
  return targetInfo.targetPathspec ? ["--", targetInfo.targetPathspec] : [];
}

async function statPath(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function runGit(config, args, options = {}) {
  return await runCommand(GIT_COMMAND, args, {
    encoding: COMMAND_ENCODING,
    debug: config.debug,
    ...options
  });
}

export async function getTargetInfo(config) {
  const requestedTargetPath = path.resolve(config.baseDir, config.target);
  const targetStat = await statPath(requestedTargetPath);

  if (!targetStat) {
    throw new Error(`Git target path does not exist: ${requestedTargetPath}`);
  }

  const lookupCwd = targetStat.isDirectory() ? requestedTargetPath : path.dirname(requestedTargetPath);
  const topLevelResult = await runGit(config, ["rev-parse", "--show-toplevel"], {
    cwd: lookupCwd,
    trim: true
  });
  const repoRootPath = path.resolve(topLevelResult.stdout);
  const relativeTargetPath = toPosixPath(path.relative(repoRootPath, requestedTargetPath));
  const branchResult = await runGit(config, ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoRootPath,
    trim: true
  });

  return {
    repoRootPath,
    requestedTargetPath,
    targetDisplay: requestedTargetPath,
    targetPathspec: relativeTargetPath ? relativeTargetPath : "",
    branchName: branchResult.stdout || "HEAD",
    stateKey: `git:${repoRootPath}:${relativeTargetPath || "."}`
  };
}

export async function getLatestCommit(config, targetInfo) {
  const result = await runGit(
    config,
    ["log", "--format=%H", "-n", "1", "HEAD", ...buildPathArgs(targetInfo)],
    { cwd: targetInfo.repoRootPath, trim: true }
  );
  const latestCommit = splitLines(result.stdout)[0];

  if (!latestCommit) {
    throw new Error(`Unable to determine the latest Git commit for ${targetInfo.targetDisplay}`);
  }

  return latestCommit;
}

export async function isValidCheckpoint(config, targetInfo, checkpointCommit, latestCommit) {
  if (!checkpointCommit) {
    return true;
  }

  const commitExists = await runGit(config, ["cat-file", "-e", `${checkpointCommit}^{commit}`], {
    cwd: targetInfo.repoRootPath,
    allowFailure: true,
    trim: true
  });

  if (commitExists.code !== 0) {
    return false;
  }

  const ancestorResult = await runGit(config, ["merge-base", "--is-ancestor", checkpointCommit, latestCommit], {
    cwd: targetInfo.repoRootPath,
    allowFailure: true,
    trim: true
  });

  return ancestorResult.code === 0;
}

export async function getPendingCommits(config, targetInfo, startExclusive, endInclusive, limit) {
  const args = ["rev-list", "--reverse"];

  if (startExclusive) {
    args.push(endInclusive, `^${startExclusive}`);
  } else {
    args.push(endInclusive);
  }

  args.push(...buildPathArgs(targetInfo));

  const result = await runGit(config, args, {
    cwd: targetInfo.repoRootPath,
    trim: true
  });

  return splitLines(result.stdout).slice(0, limit);
}

export async function getCommitDiff(config, targetInfo, commitHash) {
  const result = await runGit(
    config,
    [
      "show",
      "--format=",
      "--find-renames",
      "--find-copies",
      "--no-ext-diff",
      commitHash,
      ...buildPathArgs(targetInfo)
    ],
    { cwd: targetInfo.repoRootPath, trim: false }
  );

  return result.stdout;
}

function parseNameStatus(stdout) {
  const entries = stdout.split("\0").filter(Boolean);
  const changedPaths = [];

  for (let index = 0; index < entries.length; index += 1) {
    const status = entries[index];

    if (!status) {
      continue;
    }

    const action = status[0];

    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = entries[index + 1];
      const newPath = entries[index + 2];

      if (newPath) {
        changedPaths.push({
          action,
          relativePath: newPath,
          previousPath: oldPath || null
        });
      }

      index += 2;
      continue;
    }

    const filePath = entries[index + 1];

    if (filePath) {
      changedPaths.push({
        action,
        relativePath: filePath,
        previousPath: null
      });
    }

    index += 1;
  }

  return changedPaths;
}

export async function getCommitDetails(config, targetInfo, commitHash) {
  const metaResult = await runGit(
    config,
    ["show", "--no-patch", "--format=%H%x00%an%x00%aI%x00%B", commitHash],
    { cwd: targetInfo.repoRootPath, trim: false }
  );
  const [hash = "", author = "", date = "", ...messageParts] = metaResult.stdout.split("\0");
  const message = messageParts.join("\0").trim();
  const changedFilesResult = await runGit(
    config,
    [
      "diff-tree",
      "--no-commit-id",
      "--name-status",
      "-r",
      "--root",
      "-z",
      "-M",
      "-C",
      commitHash,
      ...buildPathArgs(targetInfo)
    ],
    { cwd: targetInfo.repoRootPath, trim: false }
  );

  return {
    commitHash: hash.trim() || commitHash,
    author: author.trim() || "unknown",
    date: date.trim(),
    message,
    changedPaths: parseNameStatus(changedFilesResult.stdout)
  };
}
