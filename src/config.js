import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultConfig = {
  reviewer: "codex",
  target: "",
  pollCron: "*/10 * * * *",
  outputDir: "./reports",
  commandTimeoutMs: 600000,
  reviewPrompt:
    "请严格审查当前变更，优先指出 bug、回归风险、兼容性问题、安全问题、边界条件缺陷和缺失测试。请使用简体中文输出 Markdown；如果没有明确缺陷，请写“未发现明确缺陷”，并补充剩余风险。",
  maxRevisionsPerRun: 20
};

export function parseCliArgs(argv) {
  const args = {
    command: "run",
    configPath: "config.json",
    once: false,
    debug: false,
    help: false,
    commandExplicitlySet: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "init" && !args.commandExplicitlySet && index === 0) {
      args.command = "init";
      args.commandExplicitlySet = true;
      continue;
    }

    if (value === "--once") {
      args.once = true;
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
      index += 1;
      continue;
    }
  }

  delete args.commandExplicitlySet;
  return args;
}

export async function loadConfig(configPath, cliArgs = {}) {
  const absoluteConfigPath = path.resolve(configPath);
  const raw = await fs.readFile(absoluteConfigPath, "utf8");
  const config = {
    ...defaultConfig,
    ...JSON.parse(raw)
  };

  if (!config.target && config.svnTarget) {
    config.target = config.svnTarget;
  }

  if (!config.target) {
    throw new Error(`Missing required config field "target" (or legacy "svnTarget") in ${absoluteConfigPath}`);
  }

  config.reviewer = String(config.reviewer || "codex").toLowerCase();
  config.debug = Boolean(cliArgs.debug);

  if (!["codex", "gemini"].includes(config.reviewer)) {
    throw new Error(`"reviewer" must be one of "codex" or "gemini" in ${absoluteConfigPath}`);
  }

  config.configPath = absoluteConfigPath;
  config.baseDir = path.dirname(absoluteConfigPath);
  config.outputDir = path.resolve(config.baseDir, config.outputDir);
  config.stateFilePath = path.resolve(config.baseDir, "./data/state.json");
  config.maxRevisionsPerRun = Number(config.maxRevisionsPerRun);
  config.commandTimeoutMs = Number(config.commandTimeoutMs);

  if (!Number.isInteger(config.maxRevisionsPerRun) || config.maxRevisionsPerRun <= 0) {
    throw new Error(`"maxRevisionsPerRun" must be a positive integer in ${absoluteConfigPath}`);
  }

  if (!Number.isInteger(config.commandTimeoutMs) || config.commandTimeoutMs <= 0) {
    throw new Error(`"commandTimeoutMs" must be a positive integer in ${absoluteConfigPath}`);
  }

  return config;
}

export function printHelp() {
  console.log(`Kodevu

Usage:
  kodevu init
  npx kodevu init
  kodevu [--config config.json] [--once]
  npx kodevu [--config config.json] [--once]

Options:
  --config, -c   Path to config json. Default: ./config.json in the current directory
  --debug, -d    Print extra debug information to the console
  --once         Run one polling cycle and exit
  --help, -h     Show help

Config highlights:
  reviewer       codex | gemini
  target         Repository target path (Git) or SVN working copy / URL
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
