// Common formatters for URL and content formatting

import { processUrl } from "./constants.js";

/**
 * Create Markdown link format
 * @param {string} url - URL to format
 * @param {string} title - Link title (optional, defaults to hostname)
 * @param {string} cleaningMode - URL cleaning mode (off, smart, aggressive)
 * @returns {Promise<string>} Markdown formatted link
 */
export async function createMarkdownLink(url, title, cleaningMode) {
  const processedUrl = await processUrl(url, cleaningMode);
  const linkTitle = title || new URL(url).hostname;
  return `[${linkTitle}](${processedUrl})`;
}

/**
 * Create Markdown list item link format
 * @param {string} url - URL to format
 * @param {string} title - Link title (optional, defaults to hostname)
 * @param {string} cleaningMode - URL cleaning mode (off, smart, aggressive)
 * @returns {Promise<string>} Markdown list item with link
 */
export async function createMarkdownListItem(url, title, cleaningMode) {
  const processedUrl = await processUrl(url, cleaningMode);
  const linkTitle = title || new URL(url).hostname;
  return `- [${linkTitle}](${processedUrl})`;
}
