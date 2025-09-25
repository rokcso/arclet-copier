// Umami 分析核心 - 通用上报引擎

// ===== 简化后的配置 =====
const WEBSITE_ID = "c0b57f97-5293-42d9-8ec2-4708e4ea68ae";
const API_URL = "https://umami.lunarye.com";
const TIMEOUT = 8000;

// 队列和重试参数
const MAX_ATTEMPTS = 3;
const BASE_DELAY = 800;
const MAX_DELAY = 5000;
const QUEUE_SIZE = 50;
const BATCH_SIZE = 8;
const PROCESS_INTERVAL = 2000;

// 去重间隔（毫秒）
const DEDUP_INTERVALS = {
  install: 60000,
  update: 60000,
  copy: 500,
  error: 3000,
  default: 5000,
};

// 存储键名
const STORAGE_KEYS = {
  userId: "analytics_uid",
  queue: "analytics_queue",
  installRecorded: "analytics_installed",
  installDate: "analytics_install_date",
  lastVersion: "analytics_version",
  dedupPrefix: "dedup_",
};

const DEBUG = false;

// 事件队列管理
class EventQueue {
  constructor() {
    this.storageKey = STORAGE_KEYS.queue;
    this.maxQueueSize = QUEUE_SIZE;
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
      const batches = chunkArray(queue, BATCH_SIZE);

      for (const batch of batches) {
        try {
          const success = await sendEventsBatch(batch);
          if (success) {
            successful.push(...batch);
          } else {
            // 增加重试次数
            batch.forEach((event) => {
              event.retryCount = (event.retryCount || 0) + 1;
              if (event.retryCount < MAX_ATTEMPTS) {
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
    }, PROCESS_INTERVAL);
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
 * 统一的事件发送方法 - 所有事件都走队列处理
 * 自动添加公共属性：user_id, timestamp, date, platform, browser, version
 * @param {string} eventName - 事件名称
 * @param {Object} customProperties - 自定义事件属性
 * @returns {Promise<boolean>} - 发送是否成功
 */
export async function sendEvent(eventName, customProperties = {}) {
  try {
    // 检查去重
    if (await isDuplicateEvent(eventName, customProperties)) {
      debugLog(`Duplicate event blocked: ${eventName}`);
      return false;
    }

    // 构建事件数据并加入队列
    const eventData = await buildEventData(eventName, customProperties);
    await eventQueue.enqueue(eventData);
    return true;
  } catch (error) {
    console.error(`Error processing event "${eventName}":`, error);
    return false;
  }
}

/**
 * 批量发送事件（逐个发送单个事件）
 * @param {Array} events - 事件数组
 * @returns {Promise<boolean>} - 发送是否成功
 */
export async function sendEventsBatch(events) {
  if (!events || events.length === 0) return true;

  try {
    debugLog(`Sending batch of ${events.length} events`);

    let successCount = 0;

    // 逐个发送事件
    for (const event of events) {
      const payload = {
        type: "event",
        payload: {
          website: WEBSITE_ID,
          hostname: chrome.runtime.id,
          name: event.name,
          language: chrome.i18n.getUILanguage(),
          data: event.data,
        },
      };

      const success = await sendToUmami(payload, event.name);
      if (success) {
        successCount++;
      }
    }

    const allSuccess = successCount === events.length;
    debugLog(`Batch complete: ${successCount}/${events.length} events sent`);
    return allSuccess;
  } catch (error) {
    console.error("Batch send failed:", error);
    return false;
  }
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
async function sendToUmami(payload, eventName) {
  const endpoint = `${API_URL}/api/send`;
  const payloadString = JSON.stringify(payload);

  try {
    // 优先使用 navigator.sendBeacon
    if (navigator.sendBeacon) {
      const blob = new Blob([payloadString], {
        type: "application/json",
      });

      const success = navigator.sendBeacon(endpoint, blob);
      if (success) {
        debugLog(`Event "${eventName}" sent successfully via sendBeacon`);
        return true;
      }
    }

    // sendBeacon 失败时使用 fetch 备用
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

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
        console.warn(`Failed to send event "${eventName}":`, response.status);
        return false;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.warn(`Request failed for event "${eventName}":`, fetchError);
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
    const result = await safeStorageGet([STORAGE_KEYS.userId]);
    if (result[STORAGE_KEYS.userId]) {
      return result[STORAGE_KEYS.userId];
    }

    // 生成新的用户 ID
    const newUserId = generateUserId();
    await safeStorageSet(STORAGE_KEYS.userId, newUserId);
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
 */
async function safeStorageSet(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (error) {
    console.warn(`Storage set failed for key "${key}":`, error);
    return false;
  }
}

/**
 * 安全的存储读取操作
 */
async function safeStorageGet(keys) {
  try {
    return await chrome.storage.local.get(keys);
  } catch (error) {
    console.warn(`Storage get failed:`, error);
    return {};
  }
}

/**
 * 安全的存储删除操作
 */
async function safeStorageRemove(keys) {
  try {
    await chrome.storage.local.remove(keys);
    return true;
  } catch (error) {
    console.warn(`Storage remove failed:`, error);
    return false;
  }
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
 */
function debugLog(...args) {
  if (DEBUG) {
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

// ===== 优化的去重机制 =====

// 内存去重缓存 - 减少存储读写
const dedupCache = new Map();
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5分钟清理一次

/**
 * 检查是否为重复事件（优化版本 - 使用内存缓存）
 */
async function isDuplicateEvent(eventName, eventData) {
  try {
    const eventKey = generateEventKey(eventName, eventData);
    const now = Date.now();
    const interval = DEDUP_INTERVALS[eventName] || DEDUP_INTERVALS.default;

    // 先检查内存缓存
    const lastTime = dedupCache.get(eventKey);
    if (lastTime && now - lastTime < interval) {
      debugLog(`Duplicate event blocked (cache): ${eventName}`);
      return true;
    }

    // 缓存中没有，记录当前时间
    dedupCache.set(eventKey, now);

    // 定期清理缓存
    if (dedupCache.size > 100) {
      cleanupDedupCache();
    }

    return false;
  } catch (error) {
    console.warn("Failed to check duplicate event:", error);
    return false;
  }
}

/**
 * 生成事件唯一键
 */
function generateEventKey(eventName, eventData) {
  const keyFields = {
    install: ["install_type"],
    update: ["install_type"],
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
 * 清理过期的内存缓存
 */
function cleanupDedupCache() {
  const now = Date.now();
  const expiredKeys = [];

  for (const [key, time] of dedupCache.entries()) {
    if (now - time > Math.max(...Object.values(DEDUP_INTERVALS))) {
      expiredKeys.push(key);
    }
  }

  expiredKeys.forEach((key) => dedupCache.delete(key));
  debugLog(`Cleaned up ${expiredKeys.length} expired cache entries`);
}

// 定期清理内存缓存
setInterval(cleanupDedupCache, CACHE_CLEANUP_INTERVAL);

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
