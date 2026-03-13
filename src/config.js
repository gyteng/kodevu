import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCommandOnPath } from "./shell.js";

const defaultStorageDir = path.join(os.homedir(), ".kodevu");
const SUPPORTED_REVIEWERS = ["codex", "gemini"];

const defaultConfig = {
  reviewer: "auto",
  target: "",
  outputDir: defaultStorageDir,
  stateFilePath: path.join(defaultStorageDir, "state.json"),
  commandTimeoutMs: 600000,
  prompt:
    "请严格审查当前变更，优先指出 bug、回归风险、兼容性问题、安全问题、边界条件缺陷和缺失测试。请使用简体中文输出 Markdown；如果没有明确缺陷，请写“未发现明确缺陷”，并补充剩余风险。",
  maxRevisionsPerRun: 20
};

function resolveConfigPath(baseDir, value) {
  if (!value) {
    return value;
  }

  if (typeof value !== "string") {
    return path.resolve(baseDir, String(value));
  }

  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

async function resolveAutoReviewers(debug, loadedConfigPath) {
  const availableReviewers = [];

  for (const reviewerName of SUPPORTED_REVIEWERS) {
    const commandPath = await findCommandOnPath(reviewerName, { debug });
    if (commandPath) {
      availableReviewers.push({ reviewerName, commandPath });
    }
  }

  if (availableReviewers.length === 0) {
    throw new Error(
      `No reviewer CLI was found in PATH for "reviewer": "auto". Install one of: ${SUPPORTED_REVIEWERS.join(", ")}${
        loadedConfigPath ? ` (${loadedConfigPath})` : ""
      }`
    );
  }

  for (let i = availableReviewers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableReviewers[i], availableReviewers[j]] = [availableReviewers[j], availableReviewers[i]];
  }

  return availableReviewers;
}

export function parseCliArgs(argv) {
  const args = {
    command: "run",
    configPath: "config.json",
    configExplicitlySet: false,
    target: "",
    debug: false,
    help: false,
    reviewer: "",
    prompt: "",
    commandExplicitlySet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "init" && !args.commandExplicitlySet && index === 0) {
      args.command = "init";
      args.commandExplicitlySet = true;
      continue;
    }

    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }

    if (value === "--debug" || value === "-d") {
      args.debug = true;
      continue;
    }

    if (value === "--config" || value === "-c") {
      const configPath = argv[index + 1];
      if (!configPath || configPath.startsWith("-")) {
        throw new Error(`Missing value for ${value}`);
      }
      args.configPath = configPath;
      args.configExplicitlySet = true;
      index += 1;
      continue;
    }

    if (value === "--reviewer" || value === "-r") {
      const reviewer = argv[index + 1];
      if (!reviewer || reviewer.startsWith("-")) {
        throw new Error(`Missing value for ${value}`);
      }
      args.reviewer = reviewer;
      index += 1;
      continue;
    }

    if (value === "--prompt" || value === "-p") {
      const prompt = argv[index + 1];
      if (!prompt || prompt.startsWith("-")) {
        throw new Error(`Missing value for ${value}`);
      }
      args.prompt = prompt;
      index += 1;
      continue;
    }

    if (!value.startsWith("-") && args.command === "run" && !args.target) {
      args.target = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  delete args.commandExplicitlySet;
  return args;
}

export async function loadConfig(configPath, cliArgs = {}) {
  const absoluteConfigPath = path.resolve(configPath);
  let loadedConfig = {};
  let loadedConfigPath = null;
  let baseDir = process.cwd();

  try {
    const raw = await fs.readFile(absoluteConfigPath, "utf8");
    loadedConfig = JSON.parse(raw);
    loadedConfigPath = absoluteConfigPath;
    baseDir = path.dirname(absoluteConfigPath);
  } catch (error) {
    if (!(error?.code === "ENOENT" && !cliArgs.configExplicitlySet)) {
      throw error;
    }
  }

  const config = {
    ...defaultConfig,
    ...loadedConfig
  };

  if (cliArgs.target) {
    config.target = cliArgs.target;
  }

  if (cliArgs.reviewer) {
    config.reviewer = cliArgs.reviewer;
  }

  if (cliArgs.prompt) {
    config.prompt = cliArgs.prompt;
  }

  if (!config.target) {
    throw new Error('Missing target. Pass `npx kodevu <repo-path>` or set "target" in config.json.');
  }

  config.debug = Boolean(cliArgs.debug);
  config.reviewer = String(config.reviewer || "auto").toLowerCase();

  if (config.reviewer === "auto") {
    const availableReviewers = await resolveAutoReviewers(config.debug, loadedConfigPath);
    const selectedReviewer = availableReviewers[0];
    config.reviewer = selectedReviewer.reviewerName;
    config.reviewerCommandPath = selectedReviewer.commandPath;
    config.fallbackReviewers = availableReviewers.map(r => r.reviewerName).slice(1);
    config.reviewerWasAutoSelected = true;
  } else if (!SUPPORTED_REVIEWERS.includes(config.reviewer)) {
    throw new Error(
      `"reviewer" must be one of "codex", "gemini", or "auto"${loadedConfigPath ? ` in ${loadedConfigPath}` : ""}`
    );
  }

  config.configPath = loadedConfigPath;
  config.baseDir = baseDir;
  config.outputDir = resolveConfigPath(config.baseDir, config.outputDir);
  config.stateFilePath = resolveConfigPath(config.baseDir, config.stateFilePath);
  config.maxRevisionsPerRun = Number(config.maxRevisionsPerRun);
  config.commandTimeoutMs = Number(config.commandTimeoutMs);

  if (!Number.isInteger(config.maxRevisionsPerRun) || config.maxRevisionsPerRun <= 0) {
    throw new Error(`"maxRevisionsPerRun" must be a positive integer${loadedConfigPath ? ` in ${loadedConfigPath}` : ""}`);
  }

  if (!Number.isInteger(config.commandTimeoutMs) || config.commandTimeoutMs <= 0) {
    throw new Error(`"commandTimeoutMs" must be a positive integer${loadedConfigPath ? ` in ${loadedConfigPath}` : ""}`);
  }

  return config;
}

export function printHelp() {
  console.log(`Kodevu

Usage:
  kodevu init
  npx kodevu init
  kodevu <target> [--debug]
  npx kodevu <target> [--debug]
  kodevu [--config config.json]
  npx kodevu [--config config.json]

Options:
  --config, -c   Optional config json path. If omitted, ./config.json is loaded only when present
  --reviewer, -r Override reviewer (codex | gemini | auto)
  --prompt, -p   Override prompt
  --debug, -d    Print extra debug information to the console
  --help, -h     Show help

Config highlights:
  reviewer       codex | gemini | auto
  target         Repository target path (Git) or SVN working copy / URL; CLI positional target overrides config
`);
}

export async function initConfig(targetPath = "config.json") {
  const absoluteTargetPath = path.resolve(targetPath);
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const templatePath = path.join(packageRoot, "config.example.json");

  await fs.mkdir(path.dirname(absoluteTargetPath), { recursive: true });
  try {
    await fs.copyFile(templatePath, absoluteTargetPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`Config file already exists: ${absoluteTargetPath}`);
    }
    throw error;
  }

  return absoluteTargetPath;
}
