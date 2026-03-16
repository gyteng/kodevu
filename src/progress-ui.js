import readline from "node:readline";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const DEFAULT_BAR_WIDTH = 24;

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function buildBar(progress, width) {
  const safeProgress = clampProgress(progress);
  const filled = Math.max(Math.round(safeProgress * width), safeProgress > 0 ? 1 : 0);

  if (filled >= width) {
    return `[${"=".repeat(width)}]`;
  }

  if (filled === 0) {
    return `[${" ".repeat(width)}]`;
  }

  return `[${"=".repeat(Math.max(filled - 1, 0))}>${" ".repeat(width - filled)}]`;
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
  constructor(display, label, options = {}) {
    this.display = display;
    this.label = label;
    this.barWidth = options.barWidth || DEFAULT_BAR_WIDTH;
    this.progress = 0;
    this.stage = "";
    this.active = false;
    this.lastFallbackLine = "";
  }

  start(stage = "starting") {
    this.stage = stage;
    this.active = true;

    if (!this.display.enabled) {
      this.writeFallback(`... ${this.label}: ${stage}`);
      return;
    }

    this.display.start();
    this.display.render();
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

    this.display.render();
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
    this.display.stopIfIdle();
    this.display.writeStaticLine(this.buildLine(prefix, message));
  }

  renderLine(frameIndex) {
    const spinner = SPINNER_FRAMES[frameIndex];
    return this.buildLine(spinner, this.stage);
  }

  buildLine(prefix, suffix) {
    const availableWidth = this.display.getAvailableWidth();
    const pct = `${Math.round(this.progress * 100)}`.padStart(3, " ");
    const parts = [prefix, this.label];
    const suffixText = suffix ? ` ${suffix}` : "";

    if (availableWidth < 10) {
      return truncateLine(`${prefix} ${pct}%`, availableWidth);
    }

    const fullReservedWidth = prefix.length + this.label.length + pct.length + suffixText.length + 4;
    const fullBarWidth = availableWidth - fullReservedWidth;

    if (fullBarWidth >= 4) {
      return truncateLine(
        `${parts.join(" ")} ${buildBar(this.progress, Math.min(this.barWidth, fullBarWidth))} ${pct}%${suffixText}`,
        availableWidth
      );
    }

    const compactReservedWidth = prefix.length + pct.length + suffixText.length + 4;
    const compactBarWidth = availableWidth - compactReservedWidth;

    if (compactBarWidth >= 4) {
      return truncateLine(
        `${prefix} ${buildBar(this.progress, compactBarWidth)} ${pct}%${suffixText}`,
        availableWidth
      );
    }

    return truncateLine(`${prefix} ${pct}%${suffixText}`, availableWidth);
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
    this.renderedLineCount = 0;
    this.handleResize = this.handleResize.bind(this);
  }

  createItem(label, options = {}) {
    const item = new ProgressItem(this, label, options);
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

  log(message) {
    if (!this.enabled) {
      this.stream.write(`${message}\n`);
      return;
    }

    this.clearRender();
    this.stream.write(`${message}\n`);
    this.render();
  }

  writeStaticLine(message) {
    if (!this.enabled) {
      this.stream.write(`${message}\n`);
      return;
    }

    this.clearRender();
    this.stream.write(`${truncateLine(message, this.getAvailableWidth())}\n`);
    this.render();
  }

  render() {
    if (!this.enabled) {
      return;
    }

    const activeItems = this.items.filter((item) => item.active);
    this.clearRender();

    if (activeItems.length === 0) {
      this.renderedLineCount = 0;
      return;
    }

    const lines = activeItems.map((item) => item.renderLine(this.frameIndex));
    this.stream.write(lines.join("\n"));
    this.renderedLineCount = lines.length;
  }

  clearRender() {
    if (!this.enabled || this.renderedLineCount === 0) {
      return;
    }

    readline.moveCursor(this.stream, 0, -Math.max(this.renderedLineCount - 1, 0));

    for (let index = 0; index < this.renderedLineCount; index += 1) {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);

      if (index < this.renderedLineCount - 1) {
        readline.moveCursor(this.stream, 0, 1);
      }
    }

    readline.moveCursor(this.stream, 0, -Math.max(this.renderedLineCount - 1, 0));
    readline.cursorTo(this.stream, 0);
    this.renderedLineCount = 0;
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
