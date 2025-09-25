// 分析事件定义 - 具体的业务事件

import { sendEvent } from "./umami-core.js";

// ===== 扩展安装事件 =====

/**
 * 记录扩展安装事件（包含首次安装和更新）
 * @param {string} installReason - "install" 或 "update"
 * @returns {Promise<boolean>} - 是否成功
 */
export async function trackInstall(installReason = "install") {
  try {
    console.log(`Extension ${installReason}, tracking installation event...`);

    // 构建自定义事件数据（公共属性由 sendEvent 自动添加）
    const customEventData = {
      install_type: installReason, // "install" 或 "update"
      install_date: new Date().toISOString().split("T")[0],
    };

    // 如果是更新，添加之前的版本信息
    if (installReason === "update") {
      customEventData.previous_version = await getPreviousVersion();
    }

    // 检查防重复逻辑（只对首次安装生效）
    if (installReason === "install") {
      const alreadyRecorded = await isInstallRecorded();
      if (alreadyRecorded) {
        console.log("User install already recorded, skipping");
        return false;
      }
    }

    // 发送统一的安装事件（sendEvent 会自动添加公共属性）
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

// 检查是否已记录安装
async function isInstallRecorded() {
  try {
    const result = await chrome.storage.local.get([
      "analytics_install_recorded",
    ]);
    return result.analytics_install_recorded === true;
  } catch (error) {
    console.warn("Failed to check install record:", error);
    return false;
  }
}

// 标记安装已记录
async function markInstallRecorded() {
  try {
    await chrome.storage.local.set({
      analytics_install_recorded: true,
      analytics_install_date: new Date().toISOString(),
    });
    console.log("Install marked as recorded");
  } catch (error) {
    console.warn("Failed to mark install as recorded:", error);
  }
}

// 获取之前的版本
async function getPreviousVersion() {
  try {
    const result = await chrome.storage.local.get(["analytics_last_version"]);
    return result.analytics_last_version || "unknown";
  } catch (error) {
    return "unknown";
  }
}

// 保存当前版本
async function saveCurrentVersion() {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({ analytics_last_version: currentVersion });
  } catch (error) {
    console.warn("Failed to save current version:", error);
  }
}
