// Layer 2: Specific event method definitions

import { sendEvent } from "./umami-core.js";

/**
 * Track extension installation or update
 * @param {string} installReason - "install" or "update"
 * @returns {Promise<boolean>} - Success status
 */
export async function trackInstall(installReason = "install") {
  try {
    // Skip if already recorded (install only)
    if (installReason === "install") {
      const result = await chrome.storage.local.get(["analytics_installed"]);
      if (result.analytics_installed) {
        console.log("Install already tracked, skipping");
        return false;
      }
    }

    // Send install event with custom data
    const success = await sendEvent("install", {
      install_type: installReason,
    });

    if (success) {
      // Mark as recorded for install events
      if (installReason === "install") {
        await chrome.storage.local.set({
          analytics_installed: true,
          analytics_install_date: new Date().toISOString(),
        });
      }

      // Save current version
      await chrome.storage.local.set({
        analytics_version: chrome.runtime.getManifest().version,
      });

      console.log(`Extension ${installReason} tracked successfully`);
      return true;
    }

    return false;
  } catch (error) {
    console.warn(`Failed to track ${installReason}:`, error);
    return false;
  }
}

/**
 * Track copy operation with comprehensive data model
 * @param {Object} copyData - Copy event data
 * @param {string} copyData.format - Copy format ("url", "markdown", "shortUrl", "custom")
 * @param {string} copyData.source - Trigger source ("popup", "shortcut", "context")
 * @param {boolean} copyData.success - Whether copy succeeded
 * @param {string} [copyData.templateId] - Custom template ID
 * @param {string} [copyData.templateName] - Template display name
 * @param {string} [copyData.urlCleaning] - URL cleaning mode
 * @param {string} [copyData.shortService] - Short URL service
 * @param {number} [copyData.duration] - Operation duration in ms
 * @param {string} [copyData.errorType] - Error type if failed
 * @param {string} [copyData.errorMessage] - Error message if failed
 * @returns {Promise<boolean>} - Success status
 */
export async function trackCopy(copyData) {
  try {
    const {
      format,
      source,
      success,
      templateId,
      templateName,
      urlCleaning,
      shortService,
      duration,
      errorType,
      errorMessage,
    } = copyData;

    // Build event data
    const eventData = {
      format,
      source,
      success,
    };

    // Add optional template info
    if (templateId) eventData.template_id = templateId;
    if (templateName) eventData.template_name = templateName;

    // Add settings info
    if (urlCleaning) eventData.url_cleaning = urlCleaning;
    if (shortService && format === "shortUrl")
      eventData.short_service = shortService;

    // Add performance metrics
    if (typeof duration === "number") eventData.duration = duration;

    // Add error info if failed
    if (!success) {
      if (errorType) eventData.error_type = errorType;
      if (errorMessage)
        eventData.error_message = errorMessage.substring(0, 100);
    }

    return await sendEvent("copy", eventData);
  } catch (error) {
    console.warn("Failed to track copy:", error);
    return false;
  }
}

/**
 * Track error events
 * @param {string} errorType - Error type
 * @param {string} component - Component name
 * @param {string} message - Error message
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<boolean>} - Success status
 */
export async function trackError(errorType, component, message, metadata = {}) {
  try {
    return await sendEvent("error", {
      error_type: errorType,
      component,
      message: message?.substring(0, 200), // Limit message length
      ...metadata,
    });
  } catch (error) {
    console.warn("Failed to track error:", error);
    return false;
  }
}
