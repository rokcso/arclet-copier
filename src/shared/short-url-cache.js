// Shared persistent short URL cache implementation

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
   * 生成缓存键 - 增强版本，确保一致性
   *
   * @param {string} cleanedUrl - 已经清理过的URL (调用方负责清理)
   * @param {string} service - 短链服务
   * @returns {string} 缓存键
   */
  getKey(cleanedUrl, service) {
    // 参数验证
    if (!cleanedUrl || typeof cleanedUrl !== "string") {
      throw new Error("Invalid cleanedUrl for cache key generation");
    }
    if (!service || typeof service !== "string") {
      throw new Error("Invalid service for cache key generation");
    }

    // 标准化URL：移除尾部斜杠，转为小写（协议和域名保持原样）
    const normalizedUrl = cleanedUrl.replace(/\/$/, "");

    // 生成稳定的缓存键
    return `${service}:${normalizedUrl}`;
  }

  /**
   * 验证缓存键格式
   * @param {string} key - 缓存键
   * @returns {boolean} 是否有效
   */
  isValidKey(key) {
    return typeof key === "string" && key.includes(":") && key.length > 3;
  }

  /**
   * 从缓存获取短链 - 增强版本
   * @param {string} cleanedUrl - 已经清理过的URL
   * @param {string} service - 短链服务
   * @returns {Promise<string|null>} 短链URL或null
   */
  async get(cleanedUrl, service) {
    try {
      // 参数验证
      if (!cleanedUrl || !service) {
        console.debug("[ShortUrlCache] Invalid parameters for get:", {
          cleanedUrl,
          service,
        });
        return null;
      }

      const key = this.getKey(cleanedUrl, service);

      // 验证生成的键
      if (!this.isValidKey(key)) {
        console.debug("[ShortUrlCache] Generated invalid cache key:", key);
        return null;
      }

      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const item = cache[key];

      if (item && Date.now() - item.timestamp < this.ttl) {
        // 验证缓存的短链有效性
        if (
          item.shortUrl &&
          typeof item.shortUrl === "string" &&
          item.shortUrl.startsWith("http")
        ) {
          console.log("[ShortUrlCache] 使用持久化缓存:", item.shortUrl);
          return item.shortUrl;
        } else {
          console.debug(
            "[ShortUrlCache] Invalid cached short URL, removing:",
            item.shortUrl,
          );
          delete cache[key];
          await chrome.storage.local.set({ [this.storageKey]: cache });
        }
      }

      // 清理过期项
      if (item) {
        delete cache[key];
        await chrome.storage.local.set({ [this.storageKey]: cache });
      }

      return null;
    } catch (error) {
      console.debug("[ShortUrlCache] 缓存读取失败:", error);
      return null;
    }
  }

  /**
   * 设置缓存项 - 增强版本
   * @param {string} cleanedUrl - 已经清理过的URL
   * @param {string} service - 短链服务
   * @param {string} shortUrl - 短链URL
   * @returns {Promise<boolean>} 保存是否成功
   */
  async set(cleanedUrl, service, shortUrl) {
    try {
      // 参数验证
      if (!cleanedUrl || !service || !shortUrl) {
        console.debug("[ShortUrlCache] Invalid parameters for set:", {
          cleanedUrl,
          service,
          shortUrl,
        });
        return false;
      }

      // 验证短链格式
      if (typeof shortUrl !== "string" || !shortUrl.startsWith("http")) {
        console.debug("[ShortUrlCache] Invalid short URL format:", shortUrl);
        return false;
      }

      const key = this.getKey(cleanedUrl, service);

      // 验证生成的键
      if (!this.isValidKey(key)) {
        console.debug(
          "[ShortUrlCache] Generated invalid cache key for set:",
          key,
        );
        return false;
      }

      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};

      // LRU清理：如果缓存已满，删除最旧的项
      const keys = Object.keys(cache);
      if (keys.length >= this.maxSize) {
        const oldestKey = keys.reduce((oldest, current) =>
          cache[current].timestamp < cache[oldest].timestamp ? current : oldest,
        );
        delete cache[oldestKey];
        console.debug("[ShortUrlCache] Removed oldest cache entry:", oldestKey);
      }

      cache[key] = {
        shortUrl,
        timestamp: Date.now(),
        originalUrl: cleanedUrl, // 保存原始URL用于调试
        service: service, // 保存服务信息用于调试
      };

      await chrome.storage.local.set({ [this.storageKey]: cache });
      console.log("[ShortUrlCache] 短链已持久化缓存:", shortUrl);
      return true;
    } catch (error) {
      console.debug("[ShortUrlCache] 缓存保存失败:", error);
      return false;
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
      console.debug("缓存清理失败:", error);
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
      console.debug("缓存清空失败:", error);
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
      console.debug("[ShortUrlCache] Failed to invalidate cache:", error);
    }
  }

  /**
   * 获取缓存统计信息（用于调试）
   * @returns {Promise<Object>} 缓存统计
   */
  async getStats() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const now = Date.now();
      let validCount = 0;
      let expiredCount = 0;

      Object.values(cache).forEach((item) => {
        if (now - item.timestamp < this.ttl) {
          validCount++;
        } else {
          expiredCount++;
        }
      });

      return {
        total: Object.keys(cache).length,
        valid: validCount,
        expired: expiredCount,
        maxSize: this.maxSize,
        ttl: this.ttl,
      };
    } catch (error) {
      console.debug("[ShortUrlCache] Failed to get cache stats:", error);
      return {
        total: 0,
        valid: 0,
        expired: 0,
        maxSize: this.maxSize,
        ttl: this.ttl,
      };
    }
  }

  /**
   * 清理所有过期缓存项
   * @returns {Promise<number>} 清理的项目数量
   */
  async cleanupExpired() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const now = Date.now();
      let cleanedCount = 0;

      const cleanedCache = {};
      Object.entries(cache).forEach(([key, item]) => {
        if (now - item.timestamp < this.ttl) {
          cleanedCache[key] = item;
        } else {
          cleanedCount++;
        }
      });

      if (cleanedCount > 0) {
        await chrome.storage.local.set({ [this.storageKey]: cleanedCache });
        console.log(
          `[ShortUrlCache] Cleaned up ${cleanedCount} expired entries`,
        );
      }

      return cleanedCount;
    } catch (error) {
      console.debug(
        "[ShortUrlCache] Failed to cleanup expired entries:",
        error,
      );
      return 0;
    }
  }
}

// 导出单例实例
export default new PersistentShortUrlCache();
