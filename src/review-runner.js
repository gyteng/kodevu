import path from "node:path";
import { ProgressDisplay } from "./progress-ui.js";
import { resolveRepositoryContext } from "./vcs-client.js";
import { logger } from "./logger.js";
import {
  ensureDir,
  writeTextFile,
  writeJsonFile,
  formatDate
} from "./utils.js";
import {
  shouldWriteFormat,
  buildReport,
  buildJsonReport,
  formatChangeList
} from "./report-generator.js";
import { runReviewerPrompt } from "./reviewers.js";

async function reviewChange(config, backend, targetInfo, changeId, progress) {
  const displayId = backend.formatChangeId(changeId);
  logger.info(`Starting review for ${backend.changeName} ${displayId}`);
  progress?.update(0.05, "loading change details");
  const details = await backend.getChangeDetails(config, targetInfo, changeId);
  const resolvedChangeId = details.id;

  if (details.changedPaths.length === 0) {
    progress?.update(0.7, "writing skipped report");
    const skippedReport = [
      `# ${backend.displayName} Review Report: ${details.displayId}`,
      "",
      "No file changes were captured for this change under the configured target."
    ].join("\n");

    const markdownReportFile = path.join(config.outputDir, backend.getReportFileName(resolvedChangeId));
    const jsonReportFile = markdownReportFile.replace(/\.md$/i, ".json");

    if (shouldWriteFormat(config, "markdown")) {
      await writeTextFile(markdownReportFile, `${skippedReport}\n`);
    }

    if (shouldWriteFormat(config, "json")) {
      await writeJsonFile(jsonReportFile, {
        repositoryType: backend.displayName,
        target: targetInfo.targetDisplay || config.target,
        changeId: details.displayId,
        generatedAt: formatDate(new Date()),
        skipped: true,
        message: "No file changes were captured for this change under the configured target."
      });
    }

    return {
      success: true,
      outputFile: shouldWriteFormat(config, "markdown") ? markdownReportFile : null,
      jsonOutputFile: shouldWriteFormat(config, "json") ? jsonReportFile : null
    };
  }

  progress?.update(0.2, "loading diff");
  const diffText = await backend.getChangeDiff(config, targetInfo, resolvedChangeId);
  const reviewersToTry = [config.reviewer, ...(config.fallbackReviewers || [])];

  let reviewer;
  let diffPayloads;
  let reviewerResult;
  let tokenUsage;
  let currentReviewerConfig;

  for (const reviewerName of reviewersToTry) {
    currentReviewerConfig = { ...config, reviewer: reviewerName };
    logger.debug(`Trying reviewer: ${reviewerName}`);
    progress?.update(0.45, `running reviewer ${reviewerName}`);

    try {
      const res = await runReviewerPrompt(
        currentReviewerConfig,
        backend,
        targetInfo,
        details,
        diffText
      );
      reviewer = res.reviewer;
      diffPayloads = res.diffPayloads;
      reviewerResult = res.result;
      tokenUsage = res.tokenUsage;

      if (reviewerResult.code === 0 && !reviewerResult.timedOut) {
        break;
      }
    } catch (err) {
      logger.error(`Reviewer prompt failed for ${reviewerName}: ${err.message}`);
      // If it's the last one, it will throw below or break loop anyway
    }

    if (reviewerName !== reviewersToTry[reviewersToTry.length - 1]) {
      const msg = `${reviewer?.displayName || reviewerName} failed for ${details.displayId}; trying next reviewer...`;
      logger.warn(msg);
    }
  }

  progress?.update(0.82, "writing report");
  logger.debug(`Token usage: input=${tokenUsage.inputTokens} output=${tokenUsage.outputTokens} total=${tokenUsage.totalTokens} source=${tokenUsage.source}`);
  const report = buildReport(currentReviewerConfig, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage);
  const outputFile = path.join(config.outputDir, backend.getReportFileName(resolvedChangeId));
  const jsonOutputFile = outputFile.replace(/\.md$/i, ".json");

  if (shouldWriteFormat(config, "markdown")) {
    await writeTextFile(outputFile, report);
  }

  if (shouldWriteFormat(config, "json")) {
    await writeJsonFile(
      jsonOutputFile,
      buildJsonReport(currentReviewerConfig, backend, targetInfo, details, diffPayloads, reviewer, reviewerResult, tokenUsage)
    );
  }

  if (reviewerResult.code !== 0 || reviewerResult.timedOut) {
    throw new Error(
      `${reviewer.displayName} failed for ${details.displayId}; report written to ${outputFile}${
        shouldWriteFormat(config, "json") ? ` and ${jsonOutputFile}` : ""
      }`
    );
  }

  const outputLabels = [
    shouldWriteFormat(config, "markdown") ? `md: ${outputFile}` : null,
    shouldWriteFormat(config, "json") ? `json: ${jsonOutputFile}` : null
  ].filter(Boolean);
  
  logger.info(`Completed review for ${displayId}: ${outputLabels.join(" | ") || "(no report file generated)"}`);

  return {
    success: true,
    outputFile: shouldWriteFormat(config, "markdown") ? outputFile : null,
    jsonOutputFile: shouldWriteFormat(config, "json") ? jsonOutputFile : null,
    details
  };
}

function updateOverallProgress(progress, completedCount, totalCount, currentFraction, stage) {
  if (!progress || totalCount <= 0) {
    return;
  }

  const overallFraction = (completedCount + currentFraction) / totalCount;
  progress.update(overallFraction, `${completedCount}/${totalCount} completed${stage ? ` | ${stage}` : ""}`);
}

export async function runReviewCycle(config) {
  await ensureDir(config.outputDir);

  const { backend, targetInfo } = await resolveRepositoryContext(config);
  logger.debug(
    `Resolved repository context: backend=${backend.kind} target=${targetInfo.targetDisplay || config.target}`
  );

  let changeIdsToReview = [];

  if (config.rev) {
    changeIdsToReview = await backend.resolveChangeIds(config, targetInfo, config.rev);
  } else {
    changeIdsToReview = await backend.getLatestChangeIds(config, targetInfo, config.last || 1);
  }

  if (changeIdsToReview.length === 0) {
    logger.info("No changes found to review.");
    return;
  }

  logger.info(`Reviewing ${backend.displayName} ${backend.changeName}s ${formatChangeList(backend, changeIdsToReview)}`);
  const progressDisplay = new ProgressDisplay();
  logger.setProgressDisplay(progressDisplay);
  const progress = progressDisplay.createItem(`${backend.displayName} ${backend.changeName} batch`);
  progress.start("0/" + changeIdsToReview.length + " completed");

  for (const [index, changeId] of changeIdsToReview.entries()) {
    logger.debug(`Starting review for ${backend.formatChangeId(changeId)}.`);
    const displayId = backend.formatChangeId(changeId);
    updateOverallProgress(progress, index, changeIdsToReview.length, 0, `starting ${displayId}`);

    const syncOverallProgress = (fraction, stage) => {
      updateOverallProgress(progress, index, changeIdsToReview.length, fraction, `${displayId} | ${stage}`);
    };

    try {
      await reviewChange(config, backend, targetInfo, changeId, { update: syncOverallProgress, log: (message) => progress.log(message) });
      updateOverallProgress(progress, index + 1, changeIdsToReview.length, 0, `finished ${displayId}`);
    } catch (error) {
      progress.fail(`failed at ${displayId} (${index}/${changeIdsToReview.length} completed)`);
      throw error;
    }
  }
}
