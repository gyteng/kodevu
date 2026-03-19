export function estimateTokenCount(text) {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function parseGeminiTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

export function parseCodexTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

export function parseCopilotTokenUsage(stderr) {
  if (!stderr) {
    return null;
  }

  const patterns = [
    /input[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /output[_ ]tokens?\s*[:=]\s*(\d+)/i,
    /total[_ ]tokens?\s*[:=]\s*(\d+)/i
  ];

  const inputMatch = stderr.match(patterns[0]);
  const outputMatch = stderr.match(patterns[1]);
  const totalMatch = stderr.match(patterns[2]);

  if (!inputMatch && !outputMatch && !totalMatch) {
    return null;
  }

  const inputTokens = inputMatch ? Number(inputMatch[1]) : 0;
  const outputTokens = outputMatch ? Number(outputMatch[1]) : 0;
  const totalTokens = totalMatch ? Number(totalMatch[1]) : inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
}

export const TOKEN_PARSERS = {
  gemini: parseGeminiTokenUsage,
  codex: parseCodexTokenUsage,
  copilot: parseCopilotTokenUsage
};

export function resolveTokenUsage(reviewerName, stderr, promptText, diffText, responseText) {
  const parseFn = TOKEN_PARSERS[reviewerName] || parseCopilotTokenUsage;
  const parsed = parseFn(stderr);

  if (parsed && parsed.totalTokens > 0) {
    return { ...parsed, source: "reviewer" };
  }

  const inputTokens = estimateTokenCount((promptText || "") + (diffText || ""));
  const outputTokens = estimateTokenCount(responseText || "");

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source: "estimate"
  };
}
