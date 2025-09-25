// Umami 分析核心 - 通用上报引擎

// ===== 配置 =====
const CONFIG = {
  // Umami 服务配置
  umami: {
    websiteId: "c0b57f97-5293-42d9-8ec2-4708e4ea68ae",
    apiUrl: "https://umami.lunarye.com",
    timeout: 8000, // 8秒超时，更激进
  },

  // 重试配置
  retry: {
    maxAttempts: 3,
    baseDelay: 800, // 更快的基础延迟
    maxDelay: 5000, // 最大延迟限制
  },

  // 队列配置
  queue: {
    maxSize: 50, // 更小的队列，更快处理
    batchSize: 8, // 更小的批次，更频繁发送
    processInterval: 2000, // 2秒处理一次
  },

  // 去重配置
  dedup: {
    intervals: {
      install: 60000, // 1分钟
      update: 60000, // 1分钟
      copy: 500, // 0.5秒
      error: 3000, // 3秒
      default: 5000, // 5秒
    },
    cleanupInterval: 6 * 60 * 60 * 1000, // 6小时清理一次
  },

  // 存储配置
  storage: {
    keys: {
      userId: "analytics_uid",
      queue: "analytics_queue",
      installRecorded: "analytics_installed",
      installDate: "analytics_install_date",
      lastVersion: "analytics_version",
      dedupPrefix: "dedup_",
    },
    maxRetries: 2, // 存储重试次数减少
  },

  // 开发配置
  debug: false,
};

// 事件队列管理
class EventQueue {
  constructor() {
    this.storageKey = CONFIG.storage.keys.queue;
    this.maxQueueSize = CONFIG.queue.maxSize;
    this.processing = false;
    this.processTimer = null;

    // 启动定时处理
    this.startAutoProcess();
  }

  async enqueue(event) {
    try {
      const queue = await this.getQueue();
      if (queue.length >= this.maxQueueSize) {
        // 移除最旧的事件
        queue.shift();
        console.warn("Event queue full, removing oldest event");
      }

      queue.push({
        ...event,
        queuedAt: Date.now(),
        retryCount: 0,
      });

      await safeStorageSet(this.storageKey, queue);
      debugLog("Event queued:", event.name);
    } catch (error) {
      console.error("Failed to queue event:", error);
    }
  }

  async getQueue() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      return result[this.storageKey] || [];
    } catch (error) {
      console.warn("Failed to get event queue:", error);
      return [];
    }
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    try {
      const queue = await this.getQueue();
      if (queue.length === 0) return;

      debugLog(`Processing ${queue.length} queued events`);
      const successful = [];
      const failed = [];

      // 批量处理事件
      const batches = chunkArray(queue, CONFIG.queue.batchSize);

      for (const batch of batches) {
        try {
          const success = await sendEventsBatch(batch);
          if (success) {
            successful.push(...batch);
          } else {
            // 增加重试次数
            batch.forEach((event) => {
              event.retryCount = (event.retryCount || 0) + 1;
              if (event.retryCount < CONFIG.retry.maxAttempts) {
                failed.push(event);
              } else {
                console.warn(
                  "Event max retries exceeded, discarding:",
                  event.name,
                );
              }
            });
          }
        } catch (error) {
          console.error("Batch processing failed:", error);
          failed.push(...batch);
        }
      }

      // 更新队列，只保留失败的事件
      await safeStorageSet(this.storageKey, failed);
      debugLog(
        `Queue processed: ${successful.length} sent, ${failed.length} remaining`,
      );
    } catch (error) {
      console.error("Queue processing error:", error);
    } finally {
      this.processing = false;
    }
  }

  async clear() {
    await safeStorageSet(this.storageKey, []);
  }

  // 启动自动处理定时器
  startAutoProcess() {
    if (this.processTimer) return;

    this.processTimer = setInterval(() => {
      if (!this.processing) {
        this.processQueue().catch((error) => {
          console.warn("Auto queue processing failed:", error);
        });
      }
    }, CONFIG.queue.processInterval);
  }

  // 停止自动处理
  stopAutoProcess() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
  }
}

// 创建全局队列实例
const eventQueue = new EventQueue();

// ===== 核心事件发送方法 =====

/**
 * 统一的事件发送方法
 * 自动添加公共属性：user_id, timestamp, date, platform, browser, version
 * @param {string} eventName - 事件名称
 * @param {Object} customProperties - 自定义事件属性
 * @param {Object} options - 发送选项
 * @returns {Promise<boolean>} - 发送是否成功
 */
export async function sendEvent(
  eventName,
  customProperties = {},
  options = {},
) {
  const {
    immediate = false, // 是否立即发送，不进入队列
    skipDedup = false, // 是否跳过去重检查
    maxRetries = CONFIG.retry.maxAttempts,
    timeout = CONFIG.umami.timeout,
  } = options;

  try {
    // 检查去重（除非明确跳过）
    if (!skipDedup && (await isDuplicateEvent(eventName, customProperties))) {
      debugLog(`Duplicate event blocked: ${eventName}`);
      return false;
    }

    // 构建事件数据
    const eventData = await buildEventData(eventName, customProperties);

    if (immediate) {
      // 立即发送
      return await sendEventWithRetry(eventData, { maxRetries, timeout });
    } else {
      // 加入队列 (自动处理器会定期处理)
      await eventQueue.enqueue(eventData);
      return true;
    }
  } catch (error) {
    console.error(`Error processing event "${eventName}":`, error);
    return false;
  }
}

/**
 * 批量发送事件
 * @param {Array} events - 事件数组
 * @returns {Promise<boolean>} - 发送是否成功
 */
export async function sendEventsBatch(events) {
  if (!events || events.length === 0) return true;

  try {
    debugLog(`Sending batch of ${events.length} events`);

    const payload = {
      type: "events",
      payload: events.map((event) => ({
        website: CONFIG.umami.websiteId,
        hostname: chrome.runtime.id,
        name: event.name,
        language: chrome.i18n.getUILanguage(),
        data: event.data,
      })),
    };

    return await sendToUmami(payload, `batch(${events.length})`);
  } catch (error) {
    console.error("Batch send failed:", error);
    return false;
  }
}

/**
 * 立即发送单个事件（带重试）
 * @param {Object} eventData - 事件数据
 * @param {Object} options - 选项
 * @returns {Promise<boolean>}
 */
async function sendEventWithRetry(eventData, options = {}) {
  const {
    maxRetries = UMAMI_CONFIG.maxRetries,
    timeout = UMAMI_CONFIG.timeout,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const payload = {
        type: "event",
        payload: {
          website: CONFIG.umami.websiteId,
          hostname: chrome.runtime.id,
          name: eventData.name,
          language: chrome.i18n.getUILanguage(),
          data: eventData.data,
        },
      };

      const success = await sendToUmami(payload, eventData.name, timeout, true);
      if (success) {
        // 记录成功发送的事件（用于去重）
        await recordSentEvent(eventData.name, eventData.data);
        return true;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(
          CONFIG.retry.baseDelay * Math.pow(2, attempt - 1),
          CONFIG.retry.maxDelay,
        );
        debugLog(
          `Retry ${attempt} failed, waiting ${delay}ms before retry ${attempt + 1}`,
        );
        await sleep(delay);
      }
    } catch (error) {
      console.error(
        `Attempt ${attempt} failed for event "${eventData.name}":`,
        error,
      );
      if (attempt === maxRetries) {
        return false;
      }
    }
  }
  return false;
}

/**
 * 构建事件数据
 */
async function buildEventData(eventName, customProperties = {}) {
  const userId = await getUserId();
  const now = new Date();
  const timestamp = now.getTime();
  const isoString = now.toISOString();

  // 确保时间一致性：都基于同一个时间点
  const timeString = isoString.split("T")[1].split(".")[0]; // UTC 时间
  const dateString = isoString.split("T")[0]; // UTC 日期

  const data = {
    $user_id: userId,
    $timestamp: timestamp, // Unix 毫秒时间戳
    $time: timeString, // HH:MM:SS (UTC)
    $date: dateString, // YYYY-MM-DD (UTC)
    $platform: getPlatform(),
    $browser: getBrowser(),
    $version: chrome.runtime.getManifest().version,
    ...sanitizeEventData(customProperties),
  };

  return {
    name: eventName,
    data,
  };
}

// ===== 内部方法 =====

// 发送数据到 Umami API
async function sendToUmami(
  payload,
  eventName,
  timeout = CONFIG.umami.timeout,
  forceFetch = false,
) {
  const endpoint = `${CONFIG.umami.apiUrl}/api/send`;
  const payloadString = JSON.stringify(payload);

  try {
    // 优先使用 navigator.sendBeacon（更可靠，特别适用于批量和队列事件）
    // 但对于需要精确超时控制的立即发送事件，可以强制使用 fetch
    if (navigator.sendBeacon && !forceFetch) {
      const blob = new Blob([payloadString], {
        type: "application/json",
      });

      const success = navigator.sendBeacon(endpoint, blob);
      if (success) {
        debugLog(`Event "${eventName}" sent successfully via sendBeacon`);
        return true;
      } else {
        debugLog(
          `sendBeacon failed for event "${eventName}", falling back to fetch`,
        );
      }
    }

    // 使用 fetch + 超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Arclet-Copier-Extension",
        },
        body: payloadString,
        keepalive: true,
        mode: "cors",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        debugLog(`Event "${eventName}" sent successfully via fetch`);
        return true;
      } else {
        console.warn(
          `Failed to send event "${eventName}":`,
          response.status,
          response.statusText,
        );
        return false;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === "AbortError") {
        console.warn(`Request timeout for event "${eventName}"`);
      } else {
        console.error(`Fetch failed for event "${eventName}":`, fetchError);
      }
      return false;
    }
  } catch (error) {
    console.error(`Network error for event "${eventName}":`, error);
    return false;
  }
}

// 用户 ID 管理
async function getUserId() {
  try {
    const result = await safeStorageGet([CONFIG.storage.keys.userId]);
    if (result[CONFIG.storage.keys.userId]) {
      return result[CONFIG.storage.keys.userId];
    }

    // 生成新的用户 ID
    const newUserId = generateUserId();
    await safeStorageSet(CONFIG.storage.keys.userId, newUserId);
    debugLog("Generated new user ID:", newUserId);
    return newUserId;
  } catch (error) {
    console.error("Failed to get/generate user ID:", error);
    return generateUserId(); // 返回临时 ID
  }
}

function generateUserId() {
  // 直接使用 crypto.getRandomValues 生成 8 位随机字符
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  const randomPart = Array.from(array, (byte) =>
    byte.toString(36).padStart(2, "0"),
  )
    .join("")
    .slice(0, 8);

  return `u_${randomPart}`;
}

// 环境检测
function getBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("edg/")) return "edge";
  if (userAgent.includes("chrome/")) return "chrome";
  if (userAgent.includes("firefox/")) return "firefox";
  return "unknown";
}

function getPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac")) return "mac";
  if (userAgent.includes("win")) return "windows";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

// ===== 辅助工具函数 =====

/**
 * 安全的存储写入操作
 * @param {string} key - 存储键
 * @param {*} value - 存储值
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<boolean>}
 */
async function safeStorageSet(
  key,
  value,
  maxRetries = CONFIG.storage.maxRetries,
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.warn(`Storage set attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        console.error(
          `Failed to set storage key "${key}" after ${maxRetries} attempts`,
        );
        return false;
      }
      await sleep(100 * (i + 1)); // 递增延迟
    }
  }
  return false;
}

/**
 * 安全的存储读取操作
 * @param {string|Array} keys - 存储键
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Object>}
 */
async function safeStorageGet(keys, maxRetries = CONFIG.storage.maxRetries) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.warn(`Storage get attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        console.error(
          `Failed to get storage keys after ${maxRetries} attempts`,
        );
        return {};
      }
      await sleep(100 * (i + 1));
    }
  }
  return {};
}

/**
 * 安全的存储删除操作
 * @param {string|Array} keys - 要删除的键
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<boolean>}
 */
async function safeStorageRemove(keys, maxRetries = CONFIG.storage.maxRetries) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      console.warn(`Storage remove attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        console.error(
          `Failed to remove storage keys after ${maxRetries} attempts`,
        );
        return false;
      }
      await sleep(100 * (i + 1));
    }
  }
  return false;
}

/**
 * 睡眠函数
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 数组分块工具
 * @param {Array} array - 原数组
 * @param {number} size - 每块大小
 * @returns {Array<Array>}
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * 调试日志
 * @param {...any} args - 日志参数
 */
function debugLog(...args) {
  if (CONFIG.debug) {
    console.log("[Analytics Debug]", ...args);
  }
}

/**
 * 数据脱敏，移除敏感字段
 * @param {Object} data - 原始数据
 * @returns {Object} - 脱敏后的数据
 */
function sanitizeEventData(data) {
  if (!data || typeof data !== "object") return data;

  const sensitive = [
    "password",
    "token",
    "key",
    "secret",
    "auth",
    "credential",
  ];
  const sanitized = { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitive.some((s) => lowerKey.includes(s))) {
      delete sanitized[key];
      debugLog(`Removed sensitive field: ${key}`);
    }
  }

  return sanitized;
}

// ===== 事件去重机制 =====

/**
 * 检查是否为重复事件
 * @param {string} eventName - 事件名称
 * @param {Object} eventData - 事件数据
 * @returns {Promise<boolean>} - 是否为重复事件
 */
async function isDuplicateEvent(eventName, eventData) {
  try {
    const eventKey = generateEventKey(eventName, eventData);
    const dedupKey = `${CONFIG.storage.keys.dedupPrefix}${eventKey}`;
    const result = await safeStorageGet([dedupKey]);

    const lastEventTime = result[dedupKey];
    if (!lastEventTime) return false;

    const now = Date.now();
    const timeDiff = now - lastEventTime;

    const dedupIntervals = CONFIG.dedup.intervals;

    const interval = dedupIntervals[eventName] || dedupIntervals.default;

    if (timeDiff < interval) {
      debugLog(
        `Duplicate event detected: ${eventName}, time diff: ${timeDiff}ms`,
      );
      return true;
    }

    return false;
  } catch (error) {
    console.warn("Failed to check duplicate event:", error);
    return false; // 出错时不阻止发送
  }
}

/**
 * 记录已发送的事件（用于去重）
 * @param {string} eventName - 事件名称
 * @param {Object} eventData - 事件数据
 */
async function recordSentEvent(eventName, eventData) {
  try {
    const eventKey = generateEventKey(eventName, eventData);
    const now = Date.now();
    const dedupKey = `${CONFIG.storage.keys.dedupPrefix}${eventKey}`;

    await safeStorageSet(dedupKey, now);

    // 定期清理过期的去重记录
    setTimeout(() => cleanupDedupRecords(), 1000);
  } catch (error) {
    console.warn("Failed to record sent event:", error);
  }
}

/**
 * 生成事件唯一键（用于去重）
 * @param {string} eventName - 事件名称
 * @param {Object} eventData - 事件数据
 * @returns {string} - 事件唯一键
 */
function generateEventKey(eventName, eventData) {
  // 提取关键字段用于生成唯一键
  const keyFields = {
    install: ["install_type"],
    update: ["install_type", "previous_version"],
    copy: ["format", "source"],
    error: ["error_type", "component"],
  };

  const fields = keyFields[eventName] || [];
  const keyParts = [eventName];

  for (const field of fields) {
    if (eventData[field] !== undefined) {
      keyParts.push(`${field}:${eventData[field]}`);
    }
  }

  return keyParts.join("|");
}

/**
 * 清理过期的去重记录
 */
async function cleanupDedupRecords() {
  try {
    const result = await chrome.storage.local.get();
    const now = Date.now();
    const expireTime = CONFIG.dedup.cleanupInterval;
    const keysToRemove = [];

    for (const [key, value] of Object.entries(result)) {
      if (
        key.startsWith(CONFIG.storage.keys.dedupPrefix) &&
        typeof value === "number"
      ) {
        if (now - value > expireTime) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await safeStorageRemove(keysToRemove);
      debugLog(`Cleaned up ${keysToRemove.length} expired dedup records`);
    }
  } catch (error) {
    console.warn("Failed to cleanup dedup records:", error);
  }
}

// ===== 队列管理和队列处理 API =====

/**
 * 手动处理事件队列
 * @returns {Promise<void>}
 */
export async function processEventQueue() {
  return await eventQueue.processQueue();
}

/**
 * 清空事件队列
 * @returns {Promise<void>}
 */
export async function clearEventQueue() {
  return await eventQueue.clear();
}

/**
 * 获取队列状态
 * @returns {Promise<Object>}
 */
export async function getQueueStatus() {
  try {
    const queue = await eventQueue.getQueue();
    return {
      length: queue.length,
      processing: eventQueue.processing,
      oldestEvent: queue.length > 0 ? queue[0].queuedAt : null,
      newestEvent: queue.length > 0 ? queue[queue.length - 1].queuedAt : null,
    };
  } catch (error) {
    console.error("Failed to get queue status:", error);
    return {
      length: 0,
      processing: false,
      oldestEvent: null,
      newestEvent: null,
    };
  }
}
