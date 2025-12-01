// Short URL module exports

export { ShortUrlThrottle, globalShortUrlThrottle } from "./throttle.js";
export { SHORT_URL_SERVICES, createShortUrlDirect } from "./services.js";
export {
  getCachedShortUrl,
  setCachedShortUrl,
  getOrGenerateShortUrl,
} from "./cache-helper.js";

import { globalShortUrlThrottle } from "./throttle.js";
import { createShortUrlDirect } from "./services.js";

/**
 * Create short URL (with throttling)
 * @param {string} longUrl - Long URL to shorten
 * @param {string} service - Service name
 * @returns {Promise<string>} Short URL
 */
export async function createShortUrl(longUrl, service = "isgd") {
  return globalShortUrlThrottle.throttledRequest(() =>
    createShortUrlDirect(longUrl, service),
  );
}
