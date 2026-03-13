import spawn from "cross-spawn";
import iconv from "iconv-lite";

function debugLog(enabled, message) {
  if (enabled) {
    console.error(`[debug] ${message}`);
  }
}

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

  debugLog(
    debug,
    `run: ${command} ${args.join(" ")}${cwd ? ` | cwd=${cwd}` : ""}${timeoutMs > 0 ? ` | timeoutMs=${timeoutMs}` : ""}`
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

    child.on("error", reject);

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

      debugLog(
        debug,
        `exit: ${command} code=${result.code} timedOut=${result.timedOut} stdout=${summarizeOutput(result.stdout)} stderr=${summarizeOutput(result.stderr)}`
      );

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
