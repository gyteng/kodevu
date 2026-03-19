import fs from "node:fs/promises";
import path from "node:path";
import { pathExists, ensureDir } from "./utils.js";

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

export async function loadState(stateFile) {
  if (!(await pathExists(stateFile))) {
    return { version: 2, projects: {} };
  }

  const raw = await fs.readFile(stateFile, "utf8");
  return normalizeStateFile(JSON.parse(raw));
}

export async function saveState(stateFile, state) {
  await ensureDir(path.dirname(stateFile));
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function getProjectState(stateFile, targetInfo) {
  return stateFile.projects?.[targetInfo.stateKey] ?? {};
}

export function updateProjectState(stateFile, targetInfo, projectState) {
  return {
    version: 2,
    projects: {
      ...(stateFile.projects || {}),
      [targetInfo.stateKey]: projectState
    }
  };
}

export function readLastReviewedId(state, backend, targetInfo) {
  return backend.fromStateValue(state);
}

export function buildStateSnapshot(backend, targetInfo, changeId) {
  return {
    lastReviewedId: backend.toStateValue(changeId),
    updatedAt: new Date().toISOString()
  };
}
