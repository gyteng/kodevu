import { logger } from "./logger.js";

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

class ProgressItem {
  constructor(display, label) {
    this.display = display;
    this.label = label;
    this.progress = 0;
    this.stage = "";
    this.active = false;
    this.lastStatusLine = "";
  }

  start(stage = "starting") {
    this.active = true;
    this.stage = stage;
    logger.debug(`${this.label} batch start: ${stage}`);
    this.writeStatus();
  }

  update(progress, stage) {
    this.progress = clampProgress(progress);

    if (stage) {
      this.stage = stage;
      logger.debug(`${this.label} stage: ${stage} (${Math.round(this.progress * 100)}%)`);
    }

    this.writeStatus();
  }

  log(message) {
    // We don't log to file here because usually progress.log() is called alongside logger.info()
    // or we want the caller to decide whether it goes to the log file.
    this.display.writeLine(message);
  }

  succeed(message) {
    const finalMsg = message || `${this.label} complete`;
    this.finish("[done]", 1, finalMsg);
    logger.debug(`${this.label} batch succeed: ${finalMsg}`);
  }

  fail(message) {
    const finalMsg = message || `${this.label} failed`;
    this.finish("[fail]", this.progress, finalMsg);
    logger.error(`${this.label} batch fail: ${finalMsg}`);
  }

  finish(prefix, progress, message) {
    this.progress = clampProgress(progress);
    this.active = false;
    this.display.writeLine(`${prefix} ${message}`);
  }

  writeStatus() {
    const line = this.buildStatusLine();

    if (line === this.lastStatusLine) {
      return;
    }

    this.lastStatusLine = line;
    this.display.writeLine(line);
  }

  buildStatusLine() {
    const pct = `${Math.round(this.progress * 100)}`.padStart(3, " ");
    return `[progress] ${pct}% ${this.label}${this.stage ? ` | ${this.stage}` : ""}`;
  }
}

export class ProgressDisplay {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
  }

  createItem(label) {
    return new ProgressItem(this, label);
  }

  writeLine(message) {
    this.stream.write(`${message}\n`);
  }

  log(message) {
    this.writeLine(message);
  }
}
