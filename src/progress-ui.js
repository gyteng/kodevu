import readline from "node:readline";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function truncateLine(line, maxWidth) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return "";
  }

  if (line.length <= maxWidth) {
    return line;
  }

  if (maxWidth <= 3) {
    return ".".repeat(maxWidth);
  }

  return `${line.slice(0, maxWidth - 3)}...`;
}

class ProgressItem {
  constructor(display, label) {
    this.display = display;
    this.label = label;
    this.progress = 0;
    this.stage = "";
    this.active = false;
    this.lastFallbackLine = "";
  }

  start(stage = "starting") {
    this.active = true;
    this.stage = stage;

    if (!this.display.enabled) {
      this.writeFallback(`... ${this.label}: ${stage}`);
      return;
    }

    this.display.start();
    this.display.activate(this);
  }

  update(progress, stage) {
    this.progress = clampProgress(progress);

    if (stage) {
      this.stage = stage;
    }

    if (!this.display.enabled) {
      this.writeFallback(`... ${this.label}: ${this.stage}`);
      return;
    }

    this.display.activate(this);
  }

  log(message) {
    this.display.log(message);
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
    this.display.deactivate(this);
    this.display.writeStaticLine(this.buildFinalLine(prefix, message));
  }

  renderLine(frameIndex) {
    return this.buildStatusLine(SPINNER_FRAMES[frameIndex], this.stage);
  }

  buildFinalLine(prefix, message) {
    return this.buildStatusLine(prefix, message);
  }

  buildStatusLine(prefix, suffix) {
    const availableWidth = this.display.getAvailableWidth();
    const pct = `${Math.round(this.progress * 100)}`.padStart(3, " ");
    const suffixText = suffix ? ` | ${suffix}` : "";
    return truncateLine(`${prefix} ${pct}% ${this.label}${suffixText}`, availableWidth);
  }

  writeFallback(line) {
    if (line === this.lastFallbackLine) {
      return;
    }

    this.lastFallbackLine = line;
    this.display.stream.write(`${line}\n`);
  }
}

export class ProgressDisplay {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.enabled = Boolean(this.stream.isTTY);
    this.frameIndex = 0;
    this.timer = null;
    this.items = [];
    this.currentItem = null;
    this.statusVisible = false;
    this.resizeAttached = false;
    this.handleResize = this.handleResize.bind(this);
  }

  createItem(label) {
    const item = new ProgressItem(this, label);
    this.items.push(item);
    return item;
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }

    this.attachResizeHandler();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.render();
    }, 120);
  }

  activate(item) {
    this.currentItem = item;
    this.render();
  }

  deactivate(item) {
    if (this.currentItem === item) {
      this.currentItem = this.items.findLast((candidate) => candidate.active) || null;
    }

    this.stopIfIdle();
    this.clearStatusLine();

    if (this.currentItem) {
      this.render();
    }
  }

  log(message) {
    if (!this.enabled) {
      this.stream.write(`${message}\n`);
      return;
    }

    this.clearStatusLine();
    this.stream.write(`${truncateLine(message, this.getAvailableWidth())}\n`);
    this.render();
  }

  writeStaticLine(message) {
    if (!this.enabled) {
      this.stream.write(`${message}\n`);
      return;
    }

    this.clearStatusLine();
    this.stream.write(`${truncateLine(message, this.getAvailableWidth())}\n`);
    this.render();
  }

  render() {
    if (!this.enabled || !this.currentItem?.active) {
      return;
    }

    this.clearStatusLine();
    this.stream.write(this.currentItem.renderLine(this.frameIndex));
    this.statusVisible = true;
  }

  clearStatusLine() {
    if (!this.enabled || !this.statusVisible) {
      return;
    }

    readline.clearLine(this.stream, 0);
    readline.cursorTo(this.stream, 0);
    this.statusVisible = false;
  }

  stopIfIdle() {
    if (this.items.some((item) => item.active)) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.detachResizeHandler();
  }

  getAvailableWidth() {
    const columns = this.stream.columns || 80;
    return Math.max(columns - 1, 1);
  }

  handleResize() {
    if (!this.enabled) {
      return;
    }

    this.render();
  }

  attachResizeHandler() {
    if (typeof this.stream.on !== "function" || this.resizeAttached) {
      return;
    }

    this.stream.on("resize", this.handleResize);
    this.resizeAttached = true;
  }

  detachResizeHandler() {
    if (typeof this.stream.off !== "function" || !this.resizeAttached) {
      return;
    }

    this.stream.off("resize", this.handleResize);
    this.resizeAttached = false;
  }
}
