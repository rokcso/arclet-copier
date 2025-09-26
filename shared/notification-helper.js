// Notification Helper - 统一的通知管理工具
// 根据用户设置显示对应类型的通知

import settingsManager from "./settings-manager.js";
import pageNotifications from "./page-notifications.js";

class NotificationHelper {
  constructor() {
    this.extensionName = chrome.i18n.getMessage("extName") || "Arclet Copier";
  }

  // 显示通知
  async show(options = {}) {
    const {
      title = this.extensionName,
      message = "",
      type = "success", // 'success', 'error', 'warning', 'info'
      icon = null,
    } = options;

    try {
      const notificationType =
        await settingsManager.getSetting("notificationType");

      switch (notificationType) {
        case "chrome":
          return await this.showChromeNotification({ title, message, icon });
        case "page":
          return await this.showPageNotification({
            title,
            message,
            type,
            icon,
          });
        case "off":
        default:
          // 不显示通知
          return false;
      }
    } catch (error) {
      console.error("Failed to show notification:", error);
      return false;
    }
  }

  // 显示 Chrome 原生通知
  async showChromeNotification({ title, message, icon }) {
    try {
      const notificationOptions = {
        type: "basic",
        iconUrl: icon || chrome.runtime.getURL("assets/icons/icon128.png"),
        title: title,
        message: message,
      };

      return new Promise((resolve) => {
        chrome.notifications.create(
          "",
          notificationOptions,
          (notificationId) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Chrome notification error:",
                chrome.runtime.lastError,
              );
              resolve(false);
            } else {
              resolve(true);
            }
          },
        );
      });
    } catch (error) {
      console.error("Failed to show Chrome notification:", error);
      return false;
    }
  }

  // 显示页面内通知
  async showPageNotification({ title, message, type, icon }) {
    try {
      // 检查是否在扩展页面内
      if (this.isExtensionPage()) {
        // 在扩展页面内直接显示
        pageNotifications.show({
          title,
          message,
          type,
          icon,
        });
        return true;
      } else {
        // 在service worker或其他非页面环境，通过content script显示页面通知
        return await this.showPageNotificationViaContentScript({
          title,
          message,
          type,
          icon,
        });
      }
    } catch (error) {
      console.error("Failed to show page notification:", error);
      // 失败时回退到Chrome通知
      return await this.showChromeNotification({ title, message, icon });
    }
  }

  // 通过 content script 显示页面通知 - 激进版本，立即发送
  async showPageNotificationViaContentScript(options) {
    try {
      // 获取当前活跃标签页
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs || tabs.length === 0) {
        console.log("No active tab found, falling back to Chrome notification");
        return await this.showChromeNotification(options);
      }

      const tab = tabs[0];

      // 只检查URL限制，跳过其他所有检查
      if (this.isRestrictedUrl(tab.url)) {
        console.log(
          `Cannot send message to restricted URL: ${tab.url}, falling back to Chrome notification`,
        );
        return await this.showChromeNotification(options);
      }

      // 立即发送消息，不等待任何状态检查
      return await this.sendMessageImmediately(
        tab.id,
        {
          type: "SHOW_PAGE_NOTIFICATION",
          message: options.message,
        },
        options,
      );
    } catch (error) {
      console.error("Failed to send page notification message:", error);
      // 发送消息失败时回退到Chrome通知
      return await this.showChromeNotification(options);
    }
  }

  // 立即发送消息 - 激进版本，不等待，不重试
  async sendMessageImmediately(tabId, message, fallbackOptions) {
    try {
      // 立即发送消息，短超时时间
      const response = await Promise.race([
        new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        }),
        new Promise(
          (_, reject) =>
            setTimeout(() => reject(new Error("Message timeout")), 500), // 极短超时
        ),
      ]);

      if (response && response.success) {
        console.log("Aggressive page notification sent immediately");
        return true;
      } else {
        console.log(
          "Content script responded but failed, falling back to Chrome notification",
        );
        return await this.showChromeNotification(fallbackOptions);
      }
    } catch (error) {
      console.log(
        `Immediate message send failed: ${error.message}, falling back to Chrome notification`,
      );
      return await this.showChromeNotification(fallbackOptions);
    }
  }

  // 检查是否为受限URL
  isRestrictedUrl(url) {
    if (!url) return true;

    const restrictedProtocols = [
      "chrome://",
      "chrome-extension://",
      "moz-extension://",
      "edge://",
      "about:",
      "file://",
    ];

    return restrictedProtocols.some((protocol) => url.startsWith(protocol));
  }

  // 检查是否在扩展页面内
  isExtensionPage() {
    // 检查是否有window对象（排除service worker环境）
    if (typeof window === "undefined") {
      return false; // 在 service worker 中，不是扩展页面
    }

    return (
      window.location.protocol === "chrome-extension:" ||
      window.location.protocol === "moz-extension:"
    );
  }

  // 便捷方法
  async success(message, title) {
    return this.show({ message, title, type: "success" });
  }

  async error(message, title) {
    return this.show({ message, title, type: "error" });
  }

  async warning(message, title) {
    return this.show({ message, title, type: "warning" });
  }

  async info(message, title) {
    return this.show({ message, title, type: "info" });
  }

  // 复制成功通知
  async copySuccess(format, count = 1) {
    const message =
      count > 1
        ? `已复制 ${count} 个链接 (${format})`
        : `已复制链接 (${format})`;
    return this.success(message);
  }

  // 复制失败通知
  async copyError(error) {
    return this.error(`复制失败: ${error}`);
  }
}

// 创建全局实例
const notificationHelper = new NotificationHelper();

export default notificationHelper;

// 便捷方法导出
export const showNotification = (options) => notificationHelper.show(options);
export const showSuccessNotification = (message, title) =>
  notificationHelper.success(message, title);
export const showErrorNotification = (message, title) =>
  notificationHelper.error(message, title);
export const showWarningNotification = (message, title) =>
  notificationHelper.warning(message, title);
export const showInfoNotification = (message, title) =>
  notificationHelper.info(message, title);
export const showCopySuccess = (format, count) =>
  notificationHelper.copySuccess(format, count);
export const showCopyError = (error) => notificationHelper.copyError(error);
