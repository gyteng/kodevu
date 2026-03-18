#!/usr/bin/env node

import { initConfig, loadConfig, parseCliArgs, printHelp } from "./config.js";
import { runReviewCycle } from "./review-runner.js";
import { logger } from "./logger.js";

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

try {
  const config = await loadConfig(cliArgs.configPath, cliArgs);
  logger.init(config);

  if (config.reviewerWasAutoSelected) {
    logger.info(
      `Reviewer "auto" selected ${config.reviewer}${config.reviewerCommandPath ? ` (${config.reviewerCommandPath})` : ""}.`
    );
  }

  if (config.debug) {
    logger.debug(
      `Loaded config: ${JSON.stringify({
        configPath: config.configPath,
        reviewer: config.reviewer,
        reviewerCommandPath: config.reviewerCommandPath,
        reviewerWasAutoSelected: config.reviewerWasAutoSelected,
        target: config.target,
        outputDir: config.outputDir,
        lang: config.lang,
        debug: config.debug
      })}`
    );
  }

  logger.info(`Session started. Target: ${config.target}`);
  await runReviewCycle(config);
  logger.info("Session completed successfully.");
} catch (error) {
  // If config was loaded, logger might be initialized, otherwise it will fall back to stderr
  logger.error("Session failed with error", error);
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
