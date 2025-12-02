// Event handlers for batch page

import { globalShortUrlThrottle } from "../../shared/constants.js";
import { trackCopy } from "../../shared/analytics.js";
import toast from "../../shared/toast.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { copyToClipboard } from "../../shared/clipboard-helper.js";
import { formatOutput } from "./format-generators.js";

/**
 * Show preview modal with formatted content
 */
export async function showPreview(
  selectedTabs,
  format,
  cleaningMode,
  elements,
) {
  // Show loading state
  elements.previewText.textContent =
    getLocalMessage("loading") || "Loading...";

  // Show progress for short URL generation with multiple URLs
  if (format === "shortUrl" && selectedTabs.length > 1) {
    elements.previewText.textContent =
      getLocalMessage("loading") || "加载中...";

    // Add progress display
    const progressText = document.createElement("div");
    progressText.style.marginTop = "10px";
    progressText.style.fontSize = "14px";
    progressText.style.color = "#666";
    progressText.textContent = `0 / ${selectedTabs.length}`;
    elements.previewText.appendChild(progressText);

    // Use progress callback
    let completedCount = 0;

    globalShortUrlThrottle.setProgressCallback(() => {
      completedCount++;
      progressText.textContent = `${completedCount} / ${selectedTabs.length}`;
    });

    try {
      const content = await formatOutput(selectedTabs, format, cleaningMode);
      elements.previewText.textContent = content;
    } finally {
      // Clear progress callback
      globalShortUrlThrottle.clearProgressCallback();
    }
  } else {
    const content = await formatOutput(selectedTabs, format, cleaningMode);
    elements.previewText.textContent = content;
  }

  // Update preview stats text
  const statsElement = elements.previewCount.parentElement;
  const statsText = getLocalMessage("previewStats") || "将复制 {count} 个URL";
  statsElement.innerHTML = statsText.replace(
    "{count}",
    `<strong id="previewCount">${selectedTabs.length}</strong>`,
  );

  // Re-get previewCount element reference (innerHTML recreates elements)
  elements.previewCount = document.getElementById("previewCount");

  elements.previewModal.classList.add("show");
}

/**
 * Hide preview modal
 */
export function hidePreview(elements) {
  elements.previewModal.classList.remove("show");
}

/**
 * Perform copy operation
 */
export async function performCopy(selectedTabs, format, cleaningMode) {
  if (selectedTabs.length === 0) {
    return { success: false };
  }

  let success = false;
  const startTime = Date.now();

  // Show progress for short URL generation with multiple URLs
  if (format === "shortUrl" && selectedTabs.length > 1) {
    toast.info(getLocalMessage("loading") || "加载中...");

    // Use progress callback
    let completedCount = 0;

    globalShortUrlThrottle.setProgressCallback(() => {
      completedCount++;

      // Update progress notification
      const progressMsg =
        getLocalMessage("shortUrlProgress") ||
        `正在生成短链... (${completedCount}/${selectedTabs.length})`;
      toast.info(
        progressMsg
          .replace("{current}", completedCount)
          .replace("{total}", selectedTabs.length),
      );
    });

    try {
      const content = await formatOutput(selectedTabs, format, cleaningMode);
      const result = await copyToClipboard(content, {
        source: "batch",
        showNotification: false,
        trackAnalytics: false, // Will track manually below
      });
      success = result.success;
    } finally {
      // Clear progress callback
      globalShortUrlThrottle.clearProgressCallback();
    }
  } else {
    const content = await formatOutput(selectedTabs, format, cleaningMode);
    const result = await copyToClipboard(content, {
      source: "batch",
      showNotification: false,
      trackAnalytics: false, // Will track manually below
    });
    success = result.success;
  }

  // Track batch copy event
  const duration = Date.now() - startTime;
  const urlCleaning =
    document
      .getElementById("removeParamsToggle")
      ?.getAttribute("data-value") || "off";
  const shortService =
    document.getElementById("shortUrlService")?.value || "isgd";

  const trackData = {
    format: format === "silentCopyFormat" ? "url" : format,
    source: "batch",
    success: success,
    duration: duration,
    urlCleaning: urlCleaning !== undefined ? urlCleaning : null,
    templateId: null,
    templateName: null,
    shortService:
      format === "shortUrl"
        ? shortService !== undefined
          ? shortService
          : null
        : null,
    errorType: success ? null : "clipboard",
    errorMessage: success ? null : "Batch copy failed",
  };

  trackCopy(trackData).catch((error) => {
    console.debug("Failed to track batch copy:", error);
  });

  if (success) {
    toast.success(
      getLocalMessage("batchCopySuccess") ||
        `批量复制成功: ${selectedTabs.length} 个URL`,
    );
  } else {
    toast.error(getLocalMessage("copyFailed") || "复制失败");
  }

  return { success };
}

/**
 * Refresh tabs list
 */
export async function refreshTabs(
  elements,
  getAllWindowsFn,
  updateWindowSelectorFn,
  getAllTabsFn,
  applyFiltersFn,
  updateCopyButtonFn,
  stateClearSelectionsFn,
  stateSetAllTabsFn,
) {
  // Show loading state
  elements.loading.style.display = "flex";

  // Get windows and update selector
  await getAllWindowsFn();
  await updateWindowSelectorFn();

  // Get new tabs data
  const newTabs = await getAllTabsFn();
  stateSetAllTabsFn(newTabs);
  stateClearSelectionsFn();

  // Apply filters and re-render
  await applyFiltersFn();
  updateCopyButtonFn();

  // Hide loading state
  elements.loading.style.display = "none";
}
