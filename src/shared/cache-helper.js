// 统一的短链缓存辅助函数 - 确保缓存一致性
import { processUrl, isValidWebUrl, createShortUrl } from "./constants.js";

/**
 * 统一的短链缓存获取函数 - 确保在所有地方使用一致的缓存逻辑
 * @param {Object} cache - 缓存实例
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @returns {Promise<string|null>} 缓存的短链或null
 */
export async function getCachedShortUrl(cache, originalUrl, cleaningMode, service) {
  try {
    // 参数验证
    if (!cache || !originalUrl || !cleaningMode || !service) {
      console.debug("[CacheHelper] Invalid parameters for getCachedShortUrl");
      return null;
    }

    // 先清理URL，确保缓存键的一致性
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // 从缓存获取
    return await cache.get(cleanedUrl, service);
  } catch (error) {
    console.debug("[CacheHelper] Failed to get cached short URL:", error);
    return null;
  }
}

/**
 * 统一的短链缓存设置函数 - 确保在所有地方使用一致的缓存逻辑
 * @param {Object} cache - 缓存实例
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @param {string} shortUrl - 生成的短链
 * @returns {Promise<boolean>} 保存是否成功
 */
export async function setCachedShortUrl(cache, originalUrl, cleaningMode, service, shortUrl) {
  try {
    // 参数验证
    if (!cache || !originalUrl || !cleaningMode || !service || !shortUrl) {
      console.debug("[CacheHelper] Invalid parameters for setCachedShortUrl");
      return false;
    }

    // 先清理URL，确保缓存键的一致性
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // 保存到缓存
    return await cache.set(cleanedUrl, service, shortUrl);
  } catch (error) {
    console.debug("[CacheHelper] Failed to set cached short URL:", error);
    return false;
  }
}

/**
 * 智能短链获取函数 - 优先从缓存获取，缓存未命中时生成新的短链
 * @param {Object} cache - 缓存实例
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @returns {Promise<string>} 短链URL
 */
export async function getOrGenerateShortUrl(cache, originalUrl, cleaningMode, service) {
  try {
    // 参数验证
    if (!cache || !originalUrl || !cleaningMode || !service) {
      throw new Error("Invalid parameters for getOrGenerateShortUrl");
    }

    // 验证URL是否适合生成短链
    if (!isValidWebUrl(originalUrl)) {
      throw new Error("URL is not suitable for shortening");
    }

    // 先尝试从缓存获取
    const cachedUrl = await getCachedShortUrl(cache, originalUrl, cleaningMode, service);
    if (cachedUrl) {
      console.log("[CacheHelper] Using cached short URL:", cachedUrl);
      return cachedUrl;
    }

    // 缓存未命中，生成新的短链
    console.log("[CacheHelper] Cache miss, generating new short URL");
    const shortUrl = await createShortUrl(originalUrl, service);

    // 保存到缓存
    await setCachedShortUrl(cache, originalUrl, cleaningMode, service, shortUrl);

    return shortUrl;
  } catch (error) {
    console.debug("[CacheHelper] Failed to get or generate short URL:", error);

    // 降级处理：返回清理后的原始URL
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
