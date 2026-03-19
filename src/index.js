#!/usr/bin/env node

import { resolveConfig, parseCliArgs, printHelp } from "./config.js";
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

try {
  const config = await resolveConfig(cliArgs);
  logger.init(config);

  if (config.reviewerWasAutoSelected) {
    logger.info(
      `Reviewer "auto" selected ${config.reviewer}${config.reviewerCommandPath ? ` (${config.reviewerCommandPath})` : ""}.`
    );
  }

  if (config.debug) {
    logger.debug(
      `Resolved config: ${JSON.stringify({
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
  logger.error("Session failed with error", error);
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
