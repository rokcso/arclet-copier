// Format generation logic for batch page

import {
  processUrl,
  isRestrictedPage,
  findTemplateById,
  processTemplateWithFallback,
  getOrGenerateShortUrl,
} from "../../shared/constants.js";
import settingsManager from "../../shared/settings-manager.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { createMarkdownListItem } from "../../shared/formatters.js";

/**
 * Get page metadata (author and description) from content script
 */
export async function getPageMetadata(tabId) {
  try {
    console.log(`[Batch] Requesting metadata for tab ${tabId}`);

    // First check if tab exists
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (error) {
      console.debug(`[Batch] Tab ${tabId} not found:`, error.message);
      return { author: "", description: "" };
    }

    // Check if it's a restricted page
    if (isRestrictedPage(tab.url)) {
      console.log(
        `[Batch] Tab ${tabId} is restricted page, skipping metadata`,
      );
      return { author: "", description: "" };
    }

    // Send message to content script to get metadata
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "GET_PAGE_METADATA",
      });

      console.log(`[Batch] Metadata response for tab ${tabId}:`, response);

      if (response && response.success) {
        return response.metadata || { author: "", description: "" };
      } else {
        console.debug(
          `[Batch] Failed to get metadata for tab ${tabId}:`,
          response,
        );
        return { author: "", description: "" };
      }
    } catch (sendError) {
      // Content script not loaded or page doesn't support it
      console.debug(
        `[Batch] Content script not available for tab ${tabId}:`,
        sendError.message,
      );
      console.log(`[Batch] This may happen if:`);
      console.log(
        `  1. The tab was opened before the extension was installed/updated - Try refreshing the tab`,
      );
      console.log(
        `  2. The page is a restricted page (chrome://, edge://, etc.)`,
      );
      console.log(
        `  3. The page hasn't finished loading yet - Wait a moment and try again`,
      );
      return { author: "", description: "" };
    }
  } catch (error) {
    console.debug(
      `[Batch] Unexpected error getting metadata for tab ${tabId}:`,
      error.message,
    );
    return { author: "", description: "" };
  }
}

/**
 * Format output based on selected format
 */
export async function formatOutput(tabs, format, cleaningMode) {
  // Handle custom templates
  if (format.startsWith("custom:")) {
    const templateId = format.substring(7); // Remove 'custom:' prefix

    try {
      const template = await findTemplateById(templateId);

      // If template doesn't exist (deleted), use fallback
      if (!template) {
        console.debug(`Template ${templateId} not found, using fallback`);
        const urls = await Promise.all(
          tabs.map((tab) => processUrl(tab.url, cleaningMode)),
        );
        return urls.join("\n");
      }

      // Process multiple tabs, one per line
      const results = await Promise.all(
        tabs.map(async (tab) => {
          const metadata = await getPageMetadata(tab.id);

          const context = {
            url: tab.url,
            title: tab.title || "",
            urlCleaning: cleaningMode,
            shortUrl: "",
            author: metadata.author || "",
            description: metadata.description || "",
          };

          // Generate short URL if template includes {{shortUrl}}
          if (template.template.includes("{{shortUrl}}")) {
            try {
              const selectedService =
                await settingsManager.getSetting("shortUrlService");
              context.shortUrl = await getOrGenerateShortUrl(
                tab.url,
                cleaningMode,
                selectedService,
              );
            } catch (error) {
              console.debug(
                "Error generating short URL for template:",
                error,
              );
              context.shortUrl = await processUrl(tab.url, cleaningMode);
            }
          }

          const result = await processTemplateWithFallback(
            templateId,
            context,
            await processUrl(tab.url, cleaningMode),
          );

          return result.content;
        }),
      );

      return results.join("\n");
    } catch (error) {
      console.debug("Error processing custom template:", error);
      // Use fallback
      const urls = await Promise.all(
        tabs.map((tab) => processUrl(tab.url, cleaningMode)),
      );
      return urls.join("\n");
    }
  }

  // Handle built-in formats
  switch (format) {
    case "text":
    case "url":
      const urls = await Promise.all(
        tabs.map((tab) => processUrl(tab.url, cleaningMode)),
      );
      return urls.join("\n");

    case "markdown":
      const markdownLinks = await Promise.all(
        tabs.map(async (tab) => {
          const title = tab.title || getLocalMessage("untitled");
          return await createMarkdownListItem(tab.url, title, cleaningMode);
        }),
      );
      return markdownLinks.join("\n");

    case "shortUrl":
      const selectedService =
        await settingsManager.getSetting("shortUrlService");

      const shortUrls = await Promise.all(
        tabs.map(async (tab) => {
          try {
            return await getOrGenerateShortUrl(
              tab.url,
              cleaningMode,
              selectedService,
            );
          } catch (error) {
            console.debug("短链生成失败:", error);
            // Fallback to cleaned URL on error
            return await processUrl(tab.url, cleaningMode);
          }
        }),
      );
      return shortUrls.join("\n");

    default:
      const defaultUrls = await Promise.all(
        tabs.map((tab) => processUrl(tab.url, cleaningMode)),
      );
      return defaultUrls.join("\n");
  }
}
