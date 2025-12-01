// Unified short URL cache helper functions

import { processUrl } from "../url/url-processor.js";
import { isValidWebUrl } from "../url/validation.js";
import shortUrlCache from "../short-url-cache.js";
import { globalShortUrlThrottle } from "./throttle.js";
import { createShortUrlDirect } from "./services.js";

/**
 * Create short URL (with throttling)
 * @param {string} longUrl - Long URL to shorten
 * @param {string} service - Service name
 * @returns {Promise<string>} Short URL
 */
function createShortUrl(longUrl, service = "isgd") {
  return globalShortUrlThrottle.throttledRequest(() =>
    createShortUrlDirect(longUrl, service),
  );
}

/**
 * Unified short URL cache retrieval - ensures consistent caching logic everywhere
 * @param {string} originalUrl - Original URL
 * @param {string} cleaningMode - URL cleaning mode
 * @param {string} service - Short URL service
 * @returns {Promise<string|null>} Cached short URL or null
 */
export async function getCachedShortUrl(originalUrl, cleaningMode, service) {
  try {
    // Parameter validation
    if (!originalUrl || !cleaningMode || !service) {
      console.debug("[CacheHelper] Invalid parameters for getCachedShortUrl");
      return null;
    }

    // Clean URL first to ensure cache key consistency
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // Get from cache
    return await shortUrlCache.get(cleanedUrl, service);
  } catch (error) {
    console.debug("[CacheHelper] Failed to get cached short URL:", error);
    return null;
  }
}

/**
 * Unified short URL cache setter - ensures consistent caching logic everywhere
 * @param {string} originalUrl - Original URL
 * @param {string} cleaningMode - URL cleaning mode
 * @param {string} service - Short URL service
 * @param {string} shortUrl - Generated short URL
 * @returns {Promise<boolean>} Whether save succeeded
 */
export async function setCachedShortUrl(
  originalUrl,
  cleaningMode,
  service,
  shortUrl,
) {
  try {
    // Parameter validation
    if (!originalUrl || !cleaningMode || !service || !shortUrl) {
      console.debug("[CacheHelper] Invalid parameters for setCachedShortUrl");
      return false;
    }

    // Clean URL first to ensure cache key consistency
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // Save to cache
    return await shortUrlCache.set(cleanedUrl, service, shortUrl);
  } catch (error) {
    console.debug("[CacheHelper] Failed to set cached short URL:", error);
    return false;
  }
}

/**
 * Smart short URL retrieval - prioritize cache, generate new on cache miss
 * @param {string} originalUrl - Original URL
 * @param {string} cleaningMode - URL cleaning mode
 * @param {string} service - Short URL service
 * @returns {Promise<string>} Short URL
 */
export async function getOrGenerateShortUrl(
  originalUrl,
  cleaningMode,
  service,
) {
  try {
    // Parameter validation
    if (!originalUrl || !cleaningMode || !service) {
      throw new Error("Invalid parameters for getOrGenerateShortUrl");
    }

    // Validate URL is suitable for shortening
    if (!isValidWebUrl(originalUrl)) {
      throw new Error("URL is not suitable for shortening");
    }

    // Try to get from cache first
    const cachedUrl = await getCachedShortUrl(
      originalUrl,
      cleaningMode,
      service,
    );
    if (cachedUrl) {
      console.log("[CacheHelper] Using cached short URL:", cachedUrl);
      return cachedUrl;
    }

    // Cache miss, generate new short URL
    console.log("[CacheHelper] Cache miss, generating new short URL");
    const shortUrl = await createShortUrl(originalUrl, service);

    // Save to cache
    await setCachedShortUrl(originalUrl, cleaningMode, service, shortUrl);

    return shortUrl;
  } catch (error) {
    console.debug("[CacheHelper] Failed to get or generate short URL:", error);

    // Fallback: return cleaned original URL
    try {
      const cleanedUrl = await processUrl(originalUrl, cleaningMode);
      console.log("[CacheHelper] Falling back to cleaned URL:", cleanedUrl);
      return cleanedUrl;
    } catch (fallbackError) {
      console.debug("[CacheHelper] Fallback also failed:", fallbackError);
      return originalUrl;
    }
  }
}
