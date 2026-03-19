import fs from "node:fs/promises";
import path from "node:path";
import * as gitClient from "./git-client.js";
import * as svnClient from "./svn-client.js";

function isLikelyUrl(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createSvnBackend() {
  return {
    kind: "svn",
    displayName: "SVN",
    changeName: "revision",
    formatChangeId(revision) {
      return `r${revision}`;
    },
    getReportFileName(revision) {
      const now = new Date();
      const datePrefix = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        '-' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      return `${datePrefix}-svn-r${revision}.md`;
    },

    async resolveChangeIds(config, targetInfo, revString) {
      if (!revString) return [];
      return String(revString).split(',').map(s => s.trim()).filter(Boolean);
    },
    async getTargetInfo(config) {
      return await svnClient.getTargetInfo(config);
    },
    async getLatestChangeId(config, targetInfo) {
      return await svnClient.getLatestRevision(config, targetInfo);
    },
    async getLatestChangeIds(config, targetInfo, limit) {
      return await svnClient.getLatestRevisionIds(config, targetInfo, limit);
    },
    async getChangeDiff(config, targetInfo, revision) {
      return await svnClient.getRevisionDiff(config, revision);
    },
    async getChangeDetails(config, targetInfo, revision) {
      const details = await svnClient.getRevisionDetails(config, targetInfo, revision);

      return {
        id: revision,
        displayId: `r${details.revision}`,
        author: details.author,
        date: details.date,
        message: details.message,
        changedPaths: details.changedPaths
      };
    }
  };
}

function createGitBackend() {
  return {
    kind: "git",
    displayName: "Git",
    changeName: "commit",
    formatChangeId(commitHash) {
      return commitHash.slice(0, 12);
    },
    getReportFileName(commitHash) {
      const now = new Date();
      const datePrefix = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        '-' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
      return `${datePrefix}-git-${commitHash.slice(0, 12)}.md`;
    },

    async resolveChangeIds(config, targetInfo, revString) {
      if (!revString) return [];
      const specs = String(revString).split(',').map(s => s.trim()).filter(Boolean);
      const allHashes = [];
      for (const spec of specs) {
        const hashes = await gitClient.resolveCommits(config, targetInfo, spec);
        allHashes.push(...hashes);
      }
      return [...new Set(allHashes)];
    },
    async getTargetInfo(config) {
      return await gitClient.getTargetInfo(config);
    },
    async getLatestChangeId(config, targetInfo) {
      return await gitClient.getLatestCommit(config, targetInfo);
    },
    async getLatestChangeIds(config, targetInfo, limit) {
      return await gitClient.getLatestCommitIds(config, targetInfo, limit);
    },
    async getChangeDiff(config, targetInfo, commitHash) {
      return await gitClient.getCommitDiff(config, targetInfo, commitHash);
    },
    async getChangeDetails(config, targetInfo, commitHash) {
      const details = await gitClient.getCommitDetails(config, targetInfo, commitHash);

      return {
        id: details.commitHash,
        displayId: details.commitHash.slice(0, 12),
        author: details.author,
        date: details.date,
        message: details.message,
        changedPaths: details.changedPaths
      };
    }
  };
}

const backends = {
  svn: createSvnBackend(),
  git: createGitBackend()
};

export async function resolveRepositoryContext(config) {
  const candidateTargetPath = path.resolve(config.baseDir, config.target);

  if (!isLikelyUrl(config.target) && (await pathExists(candidateTargetPath))) {
    try {
      return {
        backend: backends.git,
        targetInfo: await backends.git.getTargetInfo(config)
      };
    } catch {
      // Fall through to SVN auto-detection.
    }
  }

  return {
    backend: backends.svn,
    targetInfo: await backends.svn.getTargetInfo(config)
  };
}
