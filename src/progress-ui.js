import readline from "node:readline";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];
const ELLIPSIS = "...";

function clampProgress(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function getCharacterWidth(character) {
  const codePoint = character.codePointAt(0);

  if (!codePoint || codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
    return 0;
  }

  if (
    codePoint >= 0x1100 &&
    (
      codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  ) {
    return 2;
  }

  return 1;
}

function getDisplayWidth(text) {
  let width = 0;

  for (const character of text) {
    width += getCharacterWidth(character);
  }

  return width;
}

function truncateLine(line, maxWidth) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    return "";
  }

  if (getDisplayWidth(line) <= maxWidth) {
    return line;
  }

  if (maxWidth <= 3) {
    return ".".repeat(maxWidth);
  }

  const targetWidth = maxWidth - getDisplayWidth(ELLIPSIS);
  let result = "";
  let width = 0;

  for (const character of line) {
    const nextWidth = width + getCharacterWidth(character);

    if (nextWidth > targetWidth) {
      break;
    }

    result += character;
    width = nextWidth;
  }

  return `${result}${ELLIPSIS}`;
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
    this.lastStatusWidth = 0;
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
    const line = this.currentItem.renderLine(this.frameIndex);
    this.stream.write(line);
    this.statusVisible = true;
    this.lastStatusWidth = getDisplayWidth(line);
  }

  clearStatusLine() {
    if (!this.enabled || !this.statusVisible) {
      return;
    }

    const rows = Math.max(1, Math.ceil(this.lastStatusWidth / Math.max(this.stream.columns || 1, 1)));

    readline.moveCursor(this.stream, 0, -Math.max(rows - 1, 0));

    for (let index = 0; index < rows; index += 1) {
      readline.clearLine(this.stream, 0);
      readline.cursorTo(this.stream, 0);

      if (index < rows - 1) {
        readline.moveCursor(this.stream, 0, 1);
      }
    }

    readline.moveCursor(this.stream, 0, -Math.max(rows - 1, 0));
    readline.cursorTo(this.stream, 0);
    this.statusVisible = false;
    this.lastStatusWidth = 0;
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
