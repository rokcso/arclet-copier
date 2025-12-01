// URL validation utilities

/**
 * Check if URL is a restricted page
 * @param {string} url - URL to check
 * @returns {boolean} Whether URL is restricted
 */
export function isRestrictedPage(url) {
  if (!url) {
    return true;
  }

  // Restricted protocols
  const restrictedProtocols = [
    "chrome:",
    "chrome-extension:",
    "edge:",
    "about:",
    "moz-extension:",
  ];

  // Restricted domains
  const restrictedDomains = [
    "chromewebstore.google.com",
    "chrome.google.com",
    "addons.mozilla.org",
    "microsoftedge.microsoft.com",
  ];

  // Check protocol
  if (restrictedProtocols.some((protocol) => url.startsWith(protocol))) {
    return true;
  }

  // Check domain
  try {
    const urlObj = new URL(url);
    return restrictedDomains.some((domain) => urlObj.hostname === domain);
  } catch {
    return true; // Invalid URL is also considered restricted
  }
}

/**
 * Check if URL is valid for short URL generation
 * @param {string} url - URL to check
 * @returns {boolean} Whether URL is valid
 */
export function isValidWebUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);

    // Only allow HTTP and HTTPS protocols
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }

    // Exclude all local addresses
    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    // Exclude file protocol and other special protocols
    const invalidProtocols = [
      "file:",
      "ftp:",
      "chrome:",
      "chrome-extension:",
      "edge:",
      "about:",
      "moz-extension:",
      "data:",
      "javascript:",
      "mailto:",
      "tel:",
      "sms:",
    ];

    if (invalidProtocols.some((protocol) => url.startsWith(protocol))) {
      return false;
    }

    // Basic domain format check
    if (!hostname.includes(".") || hostname.length < 3) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
