import fs from "node:fs";
import path from "node:path";

class Logger {
  constructor() {
    this.config = null;
    this.logFile = null;
    this.progressDisplay = null;
    this.initialized = false;
  }

  init(config) {
    if (this.initialized) return;
    this.config = config;
    
    if (config.logsDir) {
      try {
        if (!fs.existsSync(config.logsDir)) {
          fs.mkdirSync(config.logsDir, { recursive: true });
        }
        const date = new Date().toISOString().split("T")[0];
        this.logFile = path.join(config.logsDir, `run-${date}.log`);
        
        // Simple rotation: Clean up logs older than 7 days
        this._cleanupOldLogs(config.logsDir);
        this.initialized = true;
      } catch (err) {
        console.error(`[logger] Failed to initialize log file: ${err.message}`);
      }
    }
  }

  setProgressDisplay(pd) {
    this.progressDisplay = pd;
  }

  info(message) {
    this._log("INFO", message);
  }

  error(message, error) {
    let msg = message;
    if (error) {
      msg += `\n${error.stack || error}`;
    }
    this._log("ERROR", msg);
  }

  debug(message) {
    if (this.config?.debug) {
      this._log("DEBUG", message);
    }
  }

  _log(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;

    // Write to file
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, logLine + "\n");
      } catch (err) {
        // Ignore file errors during logging to prevent crashes
      }
    }

    // Console output
    const isDebug = level === "DEBUG";
    const isError = level === "ERROR";

    // If it's debug and debug mode is off, skip console
    if (isDebug && !this.config?.debug) return;

    if (this.progressDisplay) {
      this.progressDisplay.log(logLine);
    } else {
      if (isError) {
        console.error(logLine);
      } else {
        console.error(logLine);
      }
    }
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
