// Layer 1: Generic Umami event sending methods

const WEBSITE_ID = "c0b57f97-5293-42d9-8ec2-4708e4ea68ae";
const API_URL = "https://umami.coryso.com";
const TIMEOUT = 5000;
const USER_ID_STORAGE_KEY = "analytics_user_id";

/**
 * Send event to Umami with common properties
 * @param {string} eventName - Event name
 * @param {Object} eventData - Custom event data
 * @returns {Promise<boolean>} - Success status
 */
export async function sendEvent(eventName, eventData = {}) {
  try {
    // Get consistent timestamp for all time-related fields
    const now = new Date();
    const timestamp = now.getTime();
    const dateString = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const timeString = now.toISOString().split("T")[1].split(".")[0]; // HH:MM:SS

    const payload = {
      type: "event",
      payload: {
        website: WEBSITE_ID,
        hostname: chrome.runtime.id,
        name: eventName,
        language: chrome.i18n.getUILanguage(),
        data: {
          // Common properties with $ prefix
          $user_id: await getUserId(),
          $version: chrome.runtime.getManifest().version,
          $platform: getPlatform(),
          $browser_name: getBrowser(),
          $browser_version: getBrowserVersion(),
          $timestamp: timestamp,
          $date: dateString,
          $time: timeString,
          // Custom event data
          ...eventData,
        },
      },
    };

    return await sendToUmami(payload);
  } catch (error) {
    console.debug(`Failed to send event "${eventName}":`, error);
    return false;
  }
}

/**
 * Send payload to Umami API
 * @param {Object} payload - Event payload
 * @returns {Promise<boolean>} - Success status
 */
async function sendToUmami(payload) {
  const endpoint = `${API_URL}/api/send`;

  try {
    // Try sendBeacon first (more reliable for extension lifecycle)
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });

      if (navigator.sendBeacon(endpoint, blob)) {
        return true;
      }
    }

    // Fallback to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Arclet-Copier-Extension",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        keepalive: true,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.debug("Network request failed:", error);
    return false;
  }
}

/**
 * Detect user platform
 * @returns {string} - Platform name
 */
function getPlatform() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
      return "mac";
    }
    if (userAgent.includes("win")) {
      return "windows";
    }
    if (userAgent.includes("linux")) {
      return "linux";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect browser
 * @returns {string} - Browser name
 */
function getBrowser() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("edg/")) {
      return "edge";
    }
    if (userAgent.includes("chrome/")) {
      return "chrome";
    }
    if (userAgent.includes("firefox/")) {
      return "firefox";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get browser version
 * @returns {string} - Browser version (e.g., "120.0")
 */
function getBrowserVersion() {
  try {
    const userAgent = navigator.userAgent;
    const chromeMatch = userAgent.match(/Chrome\/(\d+\.\d+)/);
    if (chromeMatch && chromeMatch[1]) {
      return chromeMatch[1];
    }

    // Fallback for Edge
    const edgeMatch = userAgent.match(/Edg\/(\d+\.\d+)/);
    if (edgeMatch && edgeMatch[1]) {
      return edgeMatch[1];
    }

    // Firefox
    const firefoxMatch = userAgent.match(/Firefox\/(\d+\.\d+)/);
    if (firefoxMatch && firefoxMatch[1]) {
      return firefoxMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get or generate user ID
 * @returns {Promise<string>} - User ID (e.g., "u_a1b2c3d4e")
 */
async function getUserId() {
  try {
    // Try to get existing user ID
    const result = await chrome.storage.local.get([USER_ID_STORAGE_KEY]);
    if (result[USER_ID_STORAGE_KEY]) {
      return result[USER_ID_STORAGE_KEY];
    }

    // Generate new user ID using UUID first 9 chars
    const userId = "u_" + crypto.randomUUID().replace(/-/g, "").substring(0, 9);

    // Save to storage
    await chrome.storage.local.set({ [USER_ID_STORAGE_KEY]: userId });

    console.log("Generated new user ID:", userId);
    return userId;
  } catch (error) {
    console.debug("Failed to get/generate user ID:", error);
    // Return a temporary user ID as fallback
    return "u_" + crypto.randomUUID().replace(/-/g, "").substring(0, 9);
  }
}
