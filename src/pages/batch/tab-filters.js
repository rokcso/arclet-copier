// Tab filtering logic for batch page

import { processUrl } from "../../shared/constants.js";

/**
 * Categorize URL type
 */
export function categorizeUrl(url) {
  if (!url) {
    return "unknown";
  }

  if (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:")
  ) {
    return "system";
  }

  if (
    url.startsWith("chrome-extension://") ||
    url.startsWith("moz-extension://")
  ) {
    return "extension";
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "web";
  }

  return "unknown";
}

/**
 * Detect duplicate URLs based on processed URLs
 */
export async function detectDuplicates(tabs, cleaningMode) {
  const urlCounts = new Map();
  const duplicateUrls = new Set();

  // Count occurrences of each processed URL
  const processedUrls = await Promise.all(
    tabs.map((tab) => processUrl(tab.url, cleaningMode)),
  );

  processedUrls.forEach((processedUrl) => {
    const count = urlCounts.get(processedUrl) || 0;
    urlCounts.set(processedUrl, count + 1);

    if (count >= 1) {
      duplicateUrls.add(processedUrl);
    }
  });

  return duplicateUrls;
}

/**
 * Apply filters to tabs based on settings
 */
export async function applyTabFilters(
  tabs,
  { webPagesOnly = true, removeDuplicates = true, cleaningMode = "smart" },
) {
  // Filter by URL type
  let filtered = tabs.filter((tab) => {
    const urlType = categorizeUrl(tab.url);
    return webPagesOnly ? urlType === "web" : true;
  });

  // Remove duplicates if enabled
  if (removeDuplicates) {
    const seen = new Set();

    const processedUrls = await Promise.all(
      filtered.map((tab) => processUrl(tab.url, cleaningMode)),
    );

    filtered = filtered.filter((tab, index) => {
      const processedUrl = processedUrls[index];
      if (seen.has(processedUrl)) {
        return false;
      }
      seen.add(processedUrl);
      return true;
    });
  }

  return filtered;
}
