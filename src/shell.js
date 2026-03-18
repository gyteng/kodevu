import spawn from "cross-spawn";
import iconv from "iconv-lite";
import { logger } from "./logger.js";


function summarizeOutput(text) {
  if (!text) {
    return "(empty)";
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 400 ? `${normalized.slice(0, 400)}...` : normalized;
}

export async function runCommand(command, args = [], options = {}) {
  const {
    cwd,
    env,
    input,
    encoding = "utf8",
    allowFailure = false,
    timeoutMs = 0,
    trim = false,
    debug = false
  } = options;

  logger.debug(
    `run: ${command} ${args.join(" ")}${cwd ? ` | cwd=${cwd}` : ""}${timeoutMs > 0 ? ` | timeoutMs=${timeoutMs}` : ""}${
      input ? ` | input=${summarizeOutput(input)}` : ""
    }`
  );

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;
    let timer = null;

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    child.on("error", (err) => {
      logger.error(`spawn error: ${command}`, err);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }

      const stdout = iconv.decode(Buffer.concat(stdoutChunks), encoding);
      const stderr = iconv.decode(Buffer.concat(stderrChunks), encoding);
      const result = {
        code: code ?? 1,
        timedOut,
        stdout: trim ? stdout.trim() : stdout,
        stderr: trim ? stderr.trim() : stderr
      };

      const level = (result.code !== 0 || result.timedOut) && !allowFailure ? "ERROR" : "DEBUG";
      const exitMsg = `exit: ${command} code=${result.code} timedOut=${result.timedOut} stdout=${summarizeOutput(result.stdout)} stderr=${summarizeOutput(result.stderr)}`;
      
      if (level === "ERROR") {
        logger.error(exitMsg);
      } else {
        logger.debug(exitMsg);
      }

      if ((result.code !== 0 || result.timedOut) && !allowFailure) {
        const error = new Error(
          `Command failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`.trim()
        );
        error.result = result;
        reject(error);
        return;
      }

      resolve(result);
    });

    if (input) {
      child.stdin.write(input);
    }

    child.stdin.end();

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
    }
  });
}

export async function findCommandOnPath(command, options = {}) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(locator, [command], {
    allowFailure: true,
    trim: true,
    debug: options.debug
  });

  if (result.code !== 0 || result.timedOut || !result.stdout) {
    return null;
  }

  return (
    result.stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find(Boolean) || null
  );
}
