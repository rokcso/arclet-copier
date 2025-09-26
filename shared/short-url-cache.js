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
   * @param {string} url - 原始URL
   * @param {string} service - 短链服务
   * @param {string} cleaningMode - URL清理模式
   * @returns {string} 缓存键
   */
  getKey(url, service, cleaningMode) {
    const processedUrl = processUrl(url, cleaningMode);
    return `${service}:${processedUrl}`;
  }

  /**
   * 从缓存获取短链
   * @param {string} url - 原始URL
   * @param {string} service - 短链服务
   * @param {string} cleaningMode - URL清理模式
   * @returns {Promise<string|null>} 短链URL或null
   */
  async get(url, service, cleaningMode) {
    try {
      const key = this.getKey(url, service, cleaningMode);
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const item = cache[key];

      if (item && Date.now() - item.timestamp < this.ttl) {
        console.log("使用持久化缓存:", item.shortUrl);
        return item.shortUrl;
      }

      // 清理过期项
      if (item) {
        delete cache[key];
        await chrome.storage.local.set({ [this.storageKey]: cache });
      }

      return null;
    } catch (error) {
      console.error("缓存读取失败:", error);
      return null;
    }
  }

  /**
   * 设置缓存项
   * @param {string} url - 原始URL
   * @param {string} service - 短链服务
   * @param {string} cleaningMode - URL清理模式
   * @param {string} shortUrl - 短链URL
   * @returns {Promise<void>}
   */
  async set(url, service, cleaningMode, shortUrl) {
    try {
      const key = this.getKey(url, service, cleaningMode);
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
      console.log("短链已持久化缓存:", shortUrl);
    } catch (error) {
      console.error("缓存保存失败:", error);
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
}

// 导出单例实例
export default new PersistentShortUrlCache();
