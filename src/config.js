import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findCommandOnPath } from "./shell.js";

const defaultStorageDir = path.join(os.homedir(), ".kodevu");
const SUPPORTED_REVIEWERS = ["codex", "gemini", "copilot"];

const defaultConfig = {
  reviewer: "auto",
  target: "",
  lang: "auto",
  outputDir: defaultStorageDir,
  logsDir: path.join(defaultStorageDir, "logs"),
  commandTimeoutMs: 600000,
  prompt: "",
  maxRevisionsPerRun: 5,
  outputFormats: ["markdown"],
  rev: "",
  last: 0
};

const ENV_MAP = {
  KODEVU_REVIEWER: "reviewer",
  KODEVU_LANG: "lang",
  KODEVU_OUTPUT_DIR: "outputDir",
  KODEVU_PROMPT: "prompt",
  KODEVU_TIMEOUT: "commandTimeoutMs",
  KODEVU_MAX_REVISIONS: "maxRevisionsPerRun",
  KODEVU_FORMATS: "outputFormats"
};

function resolvePath(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function normalizeOutputFormats(outputFormats) {
  const source = outputFormats == null ? ["markdown"] : outputFormats;
  const values = Array.isArray(source) ? source : String(source).split(",");
  const normalized = [...new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  const supported = ["markdown", "json"];
  const invalid = normalized.filter((item) => !supported.includes(item));

  if (invalid.length > 0) {
    throw new Error(`Unsupported output format(s): ${invalid.join(", ")}. Use: ${supported.join(", ")}`);
  }
  return normalized.length === 0 ? ["markdown"] : normalized;
}

function detectLanguage() {
  const envLang = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "").toLowerCase();
  const intlLocale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (os.platform() === "win32" && intlLocale.startsWith("zh")) return "zh";
  if (envLang.startsWith("zh")) return "zh";
  if (envLang.startsWith("en")) return "en";
  if (envLang) return envLang.split(/[._-]/)[0];
  if (intlLocale.startsWith("zh")) return "zh";
  if (intlLocale.startsWith("en")) return "en";
  if (intlLocale) return intlLocale.split("-")[0];
  return "en";
}

async function resolveAutoReviewers(debug) {
  const availableReviewers = [];
  for (const reviewerName of SUPPORTED_REVIEWERS) {
    const commandPath = await findCommandOnPath(reviewerName, { debug });
    if (commandPath) availableReviewers.push({ reviewerName, commandPath });
  }

  if (availableReviewers.length === 0) {
    throw new Error(`No reviewer CLI found in PATH. Install one of: ${SUPPORTED_REVIEWERS.join(", ")}`);
  }

  // Shuffle for variety
  for (let i = availableReviewers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableReviewers[i], availableReviewers[j]] = [availableReviewers[j], availableReviewers[i]];
  }

  return availableReviewers;
}

export function parseCliArgs(argv) {
  const args = {
    target: "",
    debug: false,
    help: false,
    reviewer: "",
    lang: "",
    prompt: "",
    rev: "",
    last: "",
    outputDir: "",
    outputFormats: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      args.help = true;
      continue;
    }

    if (value === "--debug" || value === "-d") {
      args.debug = true;
      continue;
    }

    const nextValue = argv[index + 1];
    const hasNextValue = nextValue && !nextValue.startsWith("-");

    if (value === "--reviewer" || value === "-r") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.reviewer = nextValue;
      index += 1;
      continue;
    }

    if (value === "--prompt" || value === "-p") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.prompt = nextValue;
      index += 1;
      continue;
    }

    if (value === "--lang" || value === "-l") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.lang = nextValue;
      index += 1;
      continue;
    }

    if (value === "--rev" || value === "-v") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.rev = nextValue;
      index += 1;
      continue;
    }

    if (value === "--last" || value === "-n") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.last = nextValue;
      index += 1;
      continue;
    }

    if (value === "--output" || value === "-o") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.outputDir = nextValue;
      index += 1;
      continue;
    }

    if (value === "--format" || value === "-f") {
      if (!hasNextValue) throw new Error(`Missing value for ${value}`);
      args.outputFormats = nextValue;
      index += 1;
      continue;
    }

    if (!value.startsWith("-") && !args.target) {
      args.target = value;
      continue;
    }

    throw new Error(`Unexpected argument: ${value}`);
  }

  return args;
}

export async function resolveConfig(cliArgs = {}) {
  const config = { ...defaultConfig };

  // 1. Merge Environment Variables
  for (const [envVar, configKey] of Object.entries(ENV_MAP)) {
    if (process.env[envVar] !== undefined) {
      config[configKey] = process.env[envVar];
    }
  }

  // 2. Merge CLI Arguments
  const cliMapping = {
    target: "target",
    reviewer: "reviewer",
    prompt: "prompt",
    lang: "lang",
    rev: "rev",
    last: "last",
    outputDir: "outputDir",
    outputFormats: "outputFormats"
  };

  for (const [cliKey, configKey] of Object.entries(cliMapping)) {
    if (cliArgs[cliKey]) {
      config[configKey] = cliArgs[cliKey];
    }
  }

  if (!config.target) {
    config.target = process.cwd();
  }

  config.baseDir = process.cwd();
  config.debug = Boolean(cliArgs.debug);
  config.reviewer = String(config.reviewer || "auto").toLowerCase();
  config.lang = String(config.lang || "auto").toLowerCase();
  config.resolvedLang = config.lang === "auto" ? detectLanguage() : config.lang;

  // Handle @file prompt
  if (config.prompt.startsWith("@")) {
    const promptPath = resolvePath(config.prompt.slice(1));
    try {
      config.prompt = await fs.readFile(promptPath, "utf8");
    } catch (err) {
      throw new Error(`Failed to read prompt file: ${promptPath} (${err.message})`);
    }
  }

  if (config.reviewer === "auto") {
    const availableReviewers = await resolveAutoReviewers(config.debug);
    const selectedReviewer = availableReviewers[0];
    config.reviewer = selectedReviewer.reviewerName;
    config.reviewerCommandPath = selectedReviewer.commandPath;
    config.fallbackReviewers = availableReviewers.map(r => r.reviewerName).slice(1);
    config.reviewerWasAutoSelected = true;
  } else if (!SUPPORTED_REVIEWERS.includes(config.reviewer)) {
    throw new Error(`"reviewer" must be one of: ${SUPPORTED_REVIEWERS.join(", ")}, or "auto"`);
  }

  config.outputDir = resolvePath(config.outputDir);
  config.logsDir = path.join(config.outputDir, "logs");
  config.maxRevisionsPerRun = Number(config.maxRevisionsPerRun);
  config.commandTimeoutMs = Number(config.commandTimeoutMs);
  config.last = Number(config.last);
  config.outputFormats = normalizeOutputFormats(config.outputFormats);

  if (!config.rev && (isNaN(config.last) || config.last <= 0)) {
    config.last = 1;
  }

  return config;
}

export function printHelp() {
  console.log(`Kodevu

Usage:
  npx kodevu [target] [options]

Options:
  --target, <path>  Target repository path (default: current directory)
  --reviewer, -r    Reviewer (codex | gemini | copilot | auto, default: auto)
  --prompt, -p      Additional instructions or @file.txt to read from file
  --lang, -l        Output language (e.g. zh, en, auto)
  --rev, -v         Review a specific revision or commit hash
  --last, -n        Review the latest N revisions (default: 1)
  --output, -o      Output directory (default: ~/.kodevu)
  --format, -f      Output formats (markdown, json, comma-separated)
  --debug, -d       Print extra debug information
  --help, -h        Show help

Environment Variables:
  KODEVU_REVIEWER   Default reviewer
  KODEVU_LANG       Default language
  KODEVU_OUTPUT_DIR Default output directory
  KODEVU_PROMPT     Default prompt text
  KODEVU_TIMEOUT    Reviewer timeout in ms
`);
}
