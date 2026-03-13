#!/usr/bin/env node

import cron from "node-cron";
import { initConfig, loadConfig, parseCliArgs, printHelp } from "./config.js";
import { runReviewCycle } from "./review-runner.js";

let cliArgs;

try {
  cliArgs = parseCliArgs(process.argv.slice(2));
} catch (error) {
  console.error(error?.message || String(error));
  printHelp();
  process.exit(1);
}

if (cliArgs.help) {
  printHelp();
  process.exit(0);
}

if (cliArgs.command === "init") {
  try {
    const createdPath = await initConfig(cliArgs.configPath);
    console.log(`Created config: ${createdPath}`);
    process.exit(0);
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}

const config = await loadConfig(cliArgs.configPath);

let running = false;

async function runOnce() {
  if (running) {
    console.log("A review cycle is already running, skipping this trigger.");
    return;
  }

  running = true;

  try {
    await runReviewCycle(config);
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  } finally {
    running = false;
  }
}

if (cliArgs.once) {
  await runOnce();
  process.exit(process.exitCode || 0);
}

await runOnce();

console.log(`Scheduler started. Cron: ${config.pollCron}`);

cron.schedule(config.pollCron, () => {
  void runOnce();
});
