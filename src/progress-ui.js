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
    this.writeStatus();
  }

  update(progress, stage) {
    this.progress = clampProgress(progress);

    if (stage) {
      this.stage = stage;
    }

    this.writeStatus();
  }

  log(message) {
    this.display.writeLine(message);
  }

  succeed(message) {
    this.finish("[done]", 1, message || `${this.label} complete`);
  }

  fail(message) {
    this.finish("[fail]", this.progress, message || `${this.label} failed`);
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
