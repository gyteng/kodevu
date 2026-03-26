import fs from "node:fs";
import path from "node:path";
import { formatDate } from "./utils.js";

function formatValue(value) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatMeta(meta = {}) {
  const parts = [];

  for (const [key, rawValue] of Object.entries(meta)) {
    if (rawValue == null || rawValue === "") {
      continue;
    }

    const value = formatValue(rawValue);
    if (!value) {
      continue;
    }

    if (typeof rawValue === "string") {
      parts.push(`${key}=${JSON.stringify(value)}`);
      continue;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      parts.push(`${key}=${String(rawValue)}`);
      continue;
    }

    parts.push(`${key}=${value}`);
  }

  return parts.join(" ");
}

function formatErrorDetails(error) {
  if (!error) {
    return "";
  }

  if (error instanceof Error) {
    return error.stack || error.message || String(error);
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

class Logger {
  constructor() {
    this.config = null;
    this.logFile = null;
    this.sessionId = null;
    this.initialized = false;
  }

  init(config) {
    if (this.initialized) return;
    this.config = config;
    this.sessionId = this._createSessionId();
    
    if (config.logsDir) {
      try {
        if (!fs.existsSync(config.logsDir)) {
          fs.mkdirSync(config.logsDir, { recursive: true });
        }
        const date = formatDate(new Date()).split(" ")[0];
        this.logFile = path.join(config.logsDir, `run-${date}-${this.sessionId}.log`);
        
        // Simple rotation: Clean up logs older than 7 days
        this._cleanupOldLogs(config.logsDir);
        this.initialized = true;
      } catch (err) {
        console.error(`[logger] Failed to initialize log file: ${err.message}`);
      }
    }
  }

  info(message, meta) {
    this._log("INFO", message, meta);
  }

  warn(message, meta) {
    this._log("WARN", message, { ...meta, console: meta?.console ?? true });
  }

  error(message, error, meta) {
    this._log("ERROR", message, {
      ...meta,
      console: meta?.console ?? true,
      error: formatErrorDetails(error)
    });
  }

  debug(message, meta) {
    this._log("DEBUG", message, meta);
  }

  _log(level, message, meta = {}) {
    const timestamp = formatDate(new Date());
    const { console: consoleMode, ...details } = meta;
    const fields = {
      session: this.sessionId || "uninitialized",
      ...details
    };
    const metaSuffix = formatMeta(fields);
    const logLine = `[${timestamp}] [${level}] ${message}${metaSuffix ? ` | ${metaSuffix}` : ""}`;

    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logLine + "\n");
      } catch (err) {
        // Ignore file errors during logging to prevent crashes
      }
    }

    if (!this._shouldWriteToConsole(level, consoleMode)) {
      return;
    }

    if (level === "ERROR" || level === "WARN") {
      console.error(logLine);
    } else {
      console.log(logLine);
    }
  }

  _shouldWriteToConsole(level, consoleMode) {
    if (consoleMode === false) {
      return false;
    }

    if (level === "ERROR" || level === "WARN") {
      return true;
    }

    if (level === "DEBUG") {
      if (consoleMode === true) {
        return Boolean(this.config?.debug);
      }
      return false;
    }

    if (consoleMode === true) {
      return true;
    }

    if (consoleMode === "debug") {
      return Boolean(this.config?.debug);
    }

    return false;
  }

  _createSessionId() {
    return [
      Date.now().toString(36),
      process.pid.toString(36),
      Math.random().toString(36).slice(2, 8)
    ].join("-");
  }

  _cleanupOldLogs(logsDir) {
    try {
      const files = fs.readdirSync(logsDir);
      const now = Date.now();
      const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const file of files) {
        if (file.startsWith("run-") && file.endsWith(".log")) {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > MAX_AGE_MS) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

export const logger = new Logger();
