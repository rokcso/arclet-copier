// Layer 1: Generic Umami event sending methods

const WEBSITE_ID = "c0b57f97-5293-42d9-8ec2-4708e4ea68ae";
const API_URL = "https://umami.lunarye.com";
const TIMEOUT = 5000;

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
          $version: chrome.runtime.getManifest().version,
          $platform: getPlatform(),
          $browser: getBrowser(),
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
    console.warn(`Failed to send event "${eventName}":`, error);
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
    console.warn("Network request failed:", error);
    return false;
  }
}

/**
 * Detect user platform
 * @returns {string} - Platform name
 */
function getPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

/**
 * Detect browser
 * @returns {string} - Browser name
 */
function getBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("edg/")) return "edge";
  if (userAgent.includes("chrome/")) return "chrome";
  if (userAgent.includes("firefox/")) return "firefox";
  return "unknown";
}
