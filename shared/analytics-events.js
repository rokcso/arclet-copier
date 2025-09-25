// 分析事件定义 - 具体的业务事件

import { sendEvent } from "./umami-core.js";

// ===== 扩展安装事件 =====

/**
 * 记录扩展安装事件（包含首次安装和更新）
 * @param {string} installReason - "install" 或 "update"
 * @param {Object} options - 发送选项
 * @returns {Promise<boolean>} - 是否成功
 */
export async function trackInstall(installReason = "install") {
  try {
    console.log(`Extension ${installReason}, tracking installation event...`);

    // 构建事件数据
    const customEventData = {
      install_type: installReason,
    };

    // 检查防重复逻辑（只对首次安装生效）
    if (installReason === "install") {
      const alreadyRecorded = await isInstallRecorded();
      if (alreadyRecorded) {
        console.log("User install already recorded, skipping");
        return false;
      }
    }

    // 发送事件（统一走队列）
    const success = await sendEvent("install", customEventData);

    if (success) {
      // 更新存储记录
      if (installReason === "install") {
        await markInstallRecorded();
      }
      await saveCurrentVersion();

      console.log(`Extension ${installReason} tracked successfully`);
      return true;
    } else {
      console.warn(`Failed to track extension ${installReason}`);
      return false;
    }
  } catch (error) {
    console.error("trackInstall failed:", error);
    return false;
  }
}

// ===== 安装状态管理辅助函数 =====

// ===== 安全存储操作函数 =====

/**
 * 安全的存储写入操作
 * @param {string} key - 存储键
 * @param {*} value - 存储值
 * @returns {Promise<boolean>}
 */
async function safeStorageSet(key, value, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.warn(`Storage set attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
  return false;
}

/**
 * 安全的存储读取操作
 * @param {string|Array} keys - 存储键
 * @returns {Promise<Object>}
 */
async function safeStorageGet(keys, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.warn(`Storage get attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        return {};
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
    }
  }
  return {};
}

// ===== 安装状态管理辅助函数（使用优化后的存储操作）=====

// 检查是否已记录安装
async function isInstallRecorded() {
  try {
    const result = await safeStorageGet(["analytics_installed"]);
    return result.analytics_installed === true;
  } catch (error) {
    console.warn("Failed to check install record:", error);
    return false;
  }
}

// 标记安装已记录
async function markInstallRecorded() {
  try {
    const success = await safeStorageSet("analytics_installed", true);
    if (success) {
      await safeStorageSet("analytics_install_date", new Date().toISOString());
      console.log("Install marked as recorded");
      return true;
    } else {
      console.warn("Failed to mark install as recorded");
      return false;
    }
  } catch (error) {
    console.warn("Failed to mark install as recorded:", error);
    return false;
  }
}

// 获取之前的版本
async function getPreviousVersion() {
  try {
    const result = await safeStorageGet(["analytics_version"]);
    return result.analytics_version || "unknown";
  } catch (error) {
    console.warn("Failed to get previous version:", error);
    return "unknown";
  }
}

// 保存当前版本
async function saveCurrentVersion() {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const success = await safeStorageSet("analytics_version", currentVersion);
    if (!success) {
      console.warn("Failed to save current version");
    }
  } catch (error) {
    console.warn("Failed to save current version:", error);
  }
}

// ===== 新增事件类型 =====

/**
 * 记录复制操作事件
 * @param {string} format - 复制格式 ("url", "markdown", "shortUrl", "custom")
 * @param {string} source - 触发源 ("popup", "shortcut", "context")
 * @param {Object} customData - 自定义数据
 * @returns {Promise<boolean>}
 */
export async function trackCopy(format, source, customData = {}) {
  try {
    const eventData = {
      format,
      source,
      ...customData,
    };

    return await sendEvent("copy", eventData);
  } catch (error) {
    console.error("trackCopy failed:", error);
    return false;
  }
}

/**
 * 记录错误事件
 * @param {string} errorType - 错误类型
 * @param {string} component - 组件名称
 * @param {string} message - 错误信息
 * @param {Object} metadata - 额外的元数据
 * @returns {Promise<boolean>}
 */
export async function trackError(errorType, component, message, metadata = {}) {
  try {
    const eventData = {
      error_type: errorType,
      component,
      message: message?.substring(0, 200),
      ...metadata,
    };

    return await sendEvent("error", eventData);
  } catch (error) {
    console.error("trackError failed:", error);
    return false;
  }
}
