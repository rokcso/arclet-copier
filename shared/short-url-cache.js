// Shared persistent short URL cache implementation
import { processUrl } from "./constants.js";

/**
 * 持久化短链缓存管理器
 * 统一管理短链缓存，避免重复实现
 */
class PersistentShortUrlCache {
  constructor() {
    this.storageKey = "arclet_shorturl_cache";
    this.maxSize = 100; // 最大缓存数量
    this.ttl = 24 * 60 * 60 * 1000; // 24小时过期
  }

  /**
   * 生成缓存键
   * 修复: 直接使用已清理的URL作为缓存键,而不是原始URL+cleaningMode
   * 这样可以确保不同清理模式产生不同的缓存键
   *
   * @param {string} cleanedUrl - 已经清理过的URL (调用方负责清理)
   * @param {string} service - 短链服务
   * @returns {string} 缓存键
   */
  getKey(cleanedUrl, service) {
    // 直接使用已清理的URL,不再重复处理
    return `${service}:${cleanedUrl}`;
  }

  /**
   * 从缓存获取短链
   * @param {string} cleanedUrl - 已经清理过的URL
   * @param {string} service - 短链服务
   * @returns {Promise<string|null>} 短链URL或null
   */
  async get(cleanedUrl, service) {
    try {
      const key = this.getKey(cleanedUrl, service);
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const item = cache[key];

      if (item && Date.now() - item.timestamp < this.ttl) {
        console.log("[ShortUrlCache] 使用持久化缓存:", item.shortUrl);
        return item.shortUrl;
      }

      // 清理过期项
      if (item) {
        delete cache[key];
        await chrome.storage.local.set({ [this.storageKey]: cache });
      }

      return null;
    } catch (error) {
      console.error("[ShortUrlCache] 缓存读取失败:", error);
      return null;
    }
  }

  /**
   * 设置缓存项
   * @param {string} cleanedUrl - 已经清理过的URL
   * @param {string} service - 短链服务
   * @param {string} shortUrl - 短链URL
   * @returns {Promise<void>}
   */
  async set(cleanedUrl, service, shortUrl) {
    try {
      const key = this.getKey(cleanedUrl, service);
      const result = await chrome.storage.local.get([this.storageKey]);
      let cache = result[this.storageKey] || {};

      // LRU清理：如果缓存已满，删除最旧的项
      const keys = Object.keys(cache);
      if (keys.length >= this.maxSize) {
        const oldestKey = keys.reduce((oldest, current) =>
          cache[current].timestamp < cache[oldest].timestamp ? current : oldest,
        );
        delete cache[oldestKey];
      }

      cache[key] = {
        shortUrl,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({ [this.storageKey]: cache });
      console.log("[ShortUrlCache] 短链已持久化缓存:", shortUrl);
    } catch (error) {
      console.error("[ShortUrlCache] 缓存保存失败:", error);
    }
  }

  /**
   * 清理过期缓存项
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const now = Date.now();
      const cleanedCache = {};

      for (const [key, item] of Object.entries(cache)) {
        if (now - item.timestamp < this.ttl) {
          cleanedCache[key] = item;
        }
      }

      await chrome.storage.local.set({ [this.storageKey]: cleanedCache });
      console.log("缓存清理完成");
    } catch (error) {
      console.error("缓存清理失败:", error);
    }
  }

  /**
   * 清空所有缓存
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await chrome.storage.local.remove([this.storageKey]);
      console.log("缓存已清空");
    } catch (error) {
      console.error("缓存清空失败:", error);
    }
  }

  /**
   * 当URL清理模式改变时，清理所有相关缓存
   * 注意: 由于现在缓存键直接基于清理后的URL,不同清理模式会自然产生不同的缓存键
   * 因此理论上不需要清空缓存,但为了避免混淆和节省存储空间,仍然建议清空
   * @returns {Promise<void>}
   */
  async invalidateOnCleaningModeChange() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const cacheSize = Object.keys(cache).length;

      if (cacheSize > 0) {
        await this.clear();
        console.log(
          `[ShortUrlCache] Cleared ${cacheSize} entries due to cleaning mode change`,
        );
      }
    } catch (error) {
      console.error("[ShortUrlCache] Failed to invalidate cache:", error);
    }
  }
}

// 导出单例实例
export default new PersistentShortUrlCache();
