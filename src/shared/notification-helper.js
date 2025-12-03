// Notification Helper - 统一的通知管理工具
// 根据用户设置显示对应类型的通知

import settingsManager from "./settings-manager.js";

class NotificationHelper {
  constructor() {
    this.extensionName = chrome.i18n.getMessage("extName") || "Arclet Copier";
  }

  // 显示通知
  // @param {object} options - 通知选项
  // @param {number} options.tabId - 明确的标签页ID（可选），用于页面通知
  async show(options = {}) {
    const {
      title,
      message = "",
      type = "success", // 'success', 'error', 'warning', 'info'
      icon = null,
      tabId = null, // 新增：明确的 tabId
    } = options;

    // 修复: 确保 title 不为 null (Chrome 通知要求 title 必须是非空字符串)
    const safeTitle = title || this.extensionName;

    try {
      const notificationType =
        await settingsManager.getSetting("notificationType");

      switch (notificationType) {
        case "chrome":
          return await this.showChromeNotification({
            title: safeTitle,
            message,
            icon,
          });
        case "page":
          return await this.showPageNotification({
            title: safeTitle,
            message,
            type,
            icon,
            tabId, // 传递 tabId
          });
        case "off":
        default:
          // 不显示通知
          return false;
      }
    } catch (error) {
      console.debug("Failed to show notification:", error);
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
        chrome.notifications.create("", notificationOptions, () => {
          if (chrome.runtime.lastError) {
            console.debug(
              "Chrome notification error:",
              chrome.runtime.lastError,
            );
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch (error) {
      console.debug("Failed to show Chrome notification:", error);
      return false;
    }
  }

  // 显示页面内通知
  // @param {number} tabId - 明确的标签页ID（可选），避免竞态条件
  async showPageNotification({ title, message, type, icon, tabId = null }) {
    try {
      // 检查是否在扩展页面内
      if (this.isExtensionPage()) {
        // 在扩展页面内直接显示通知
        return await this.showExtensionPageNotification({
          title,
          message,
          type,
          icon,
        });
      } else {
        // 在service worker或其他非页面环境，通过content script显示页面通知
        return await this.showPageNotificationViaContentScript({
          title,
          message,
          type,
          icon,
          tabId, // 传递明确的 tabId
        });
      }
    } catch (error) {
      console.debug("Failed to show page notification:", error);
      // 失败时回退到Chrome通知
      return await this.showChromeNotification({ title, message, icon });
    }
  }

  // 通过 content script 显示页面通知 - 增强版本，带就绪检测和重试
  // @param {number} tabId - 明确的标签页ID（可选），如果提供则优先使用
  async showPageNotificationViaContentScript(options) {
    try {
      let tab;

      // 优先使用传入的 tabId，避免竞态条件
      if (options.tabId) {
        try {
          tab = await chrome.tabs.get(options.tabId);
        } catch {
          console.log(
            `Tab ${options.tabId} not found (may be closed), falling back to Chrome notification`,
          );
          return await this.showChromeNotification(options);
        }
      } else {
        // 回退到查询当前活跃标签页（用于其他场景）
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tabs || tabs.length === 0) {
          console.log(
            "No active tab found, falling back to Chrome notification",
          );
          return await this.showChromeNotification(options);
        }
        tab = tabs[0];
      }

      // 检查URL限制
      if (this.isRestrictedUrl(tab.url)) {
        console.log(
          `Cannot send message to restricted URL: ${tab.url}, falling back to Chrome notification`,
        );
        return await this.showChromeNotification(options);
      }

      // 检查 content script 是否就绪（带重试）
      const isReady = await this.ensureContentScriptReady(tab.id);
      if (!isReady) {
        console.log(
          `Content script not ready on tab ${tab.id}, falling back to Chrome notification`,
        );
        return await this.showChromeNotification(options);
      }

      // 发送通知消息
      return await this.sendNotificationMessage(
        tab.id,
        {
          type: "SHOW_PAGE_NOTIFICATION",
          message: options.message,
        },
        options,
      );
    } catch (error) {
      console.debug("Failed to send page notification message:", error);
      // 发送消息失败时回退到Chrome通知
      return await this.showChromeNotification(options);
    }
  }

  // 确保 content script 就绪 - 带重试机制（性能优化版）
  async ensureContentScriptReady(tabId, maxRetries = 2, retryDelay = 20) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await Promise.race([
          new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { type: "PING" }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("PING timeout")), 80), // 优化: 200ms → 80ms
          ),
        ]);

        if (response && response.ready === true) {
          console.log(
            `[Performance] Content script ready on tab ${tabId} (attempt ${attempt + 1})`,
          );
          return true;
        }
      } catch (error) {
        console.log(
          `[Performance] Content script PING failed on tab ${tabId} (attempt ${attempt + 1}): ${error.message}`,
        );

        // 如果不是最后一次尝试，等待后重试
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * (attempt + 1)),
          ); // 优化: 退避延迟更短
        }
      }
    }

    console.log(
      `[Performance] Content script not ready on tab ${tabId} after ${maxRetries} attempts`,
    );
    return false;
  }

  // 发送通知消息 - 带超时保护（性能优化版）
  async sendNotificationMessage(tabId, message, fallbackOptions) {
    try {
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
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Message timeout")), 150), // 优化: 300ms → 150ms
        ),
      ]);

      if (response && response.success) {
        console.log("Page notification sent successfully");
        return true;
      } else {
        // Content script明确表示不支持页面通知，回退
        console.log(
          "Page notifications not supported on this page, using Chrome notification",
        );
        return await this.showChromeNotification(fallbackOptions);
      }
    } catch (error) {
      // 通信失败，回退
      console.log(
        `Notification message send failed: ${error.message}, using Chrome notification`,
      );
      return await this.showChromeNotification(fallbackOptions);
    }
  }

  // 检查是否为受限URL
  isRestrictedUrl(url) {
    if (!url) {
      return true;
    }

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

  // 在扩展页面内显示通知
  async showExtensionPageNotification({ title, message, type, icon }) {
    try {
      // 创建或获取通知容器
      let notificationContainer = document.getElementById(
        "arclet-extension-notification-container",
      );
      if (!notificationContainer) {
        notificationContainer = document.createElement("div");
        notificationContainer.id = "arclet-extension-notification-container";
        notificationContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        `;
        document.body.appendChild(notificationContainer);
      }

      // 创建通知元素
      const notification = document.createElement("div");
      const notificationId = "notification-" + Date.now();
      notification.id = notificationId;
      notification.className = `arclet-extension-notification ${type || "info"}`;

      // 设置通知样式
      notification.style.cssText = `
        background: ${this.getNotificationBackgroundColor(type)};
        color: ${this.getNotificationTextColor(type)};
        border: 1px solid ${this.getNotificationBorderColor(type)};
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 8px;
        min-width: 280px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        pointer-events: auto;
        position: relative;
        overflow: hidden;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-size: 14px;
        line-height: 1.4;
      `;

      // 创建通知内容
      const headerHtml = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
          font-weight: 600;
          font-size: 14px;
        ">
          <div style="display: flex; align-items: center; gap: 6px;">
            ${icon ? `<span>${icon}</span>` : this.getTypeIcon(type)}
            ${title || this.extensionName}
          </div>
          <button class="arclet-extension-notification-close" style="
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            color: #666;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            opacity: 0.7;
            transition: opacity 0.2s;
          " aria-label="Close">×</button>
        </div>
      `;

      const messageHtml = message
        ? `<div style="
        font-size: 13px;
        line-height: 1.4;
        color: #666;
      ">${message}</div>`
        : "";

      notification.innerHTML = headerHtml + messageHtml;

      // 添加到容器
      notificationContainer.appendChild(notification);

      // 显示动画
      requestAnimationFrame(() => {
        notification.style.transform = "translateX(0)";
        notification.style.opacity = "1";
      });

      // 添加关闭事件
      const closeBtn = notification.querySelector(
        ".arclet-extension-notification-close",
      );
      closeBtn?.addEventListener("click", () => {
        this.hideExtensionPageNotification(notificationId);
      });

      // 自动关闭 (3秒)
      setTimeout(() => {
        this.hideExtensionPageNotification(notificationId);
      }, 3000);

      return true;
    } catch (error) {
      console.debug("Failed to show extension page notification:", error);
      return false;
    }
  }

  // 隐藏扩展页面通知
  hideExtensionPageNotification(notificationId) {
    const notification = document.getElementById(notificationId);
    if (notification) {
      // 隐藏动画
      notification.style.transform = "translateX(100%)";
      notification.style.opacity = "0";

      // 移除元素
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }

  // 获取通知背景色
  getNotificationBackgroundColor(type) {
    const colors = {
      success: "#f8fff8",
      error: "#fff8f8",
      warning: "#fffbf0",
      info: "#f0f8ff",
    };
    return colors[type] || colors.info;
  }

  // 获取通知文字颜色
  getNotificationTextColor(type) {
    const colors = {
      success: "#2E7D32",
      error: "#C62828",
      warning: "#E65100",
      info: "#1565C0",
    };
    return colors[type] || colors.info;
  }

  // 获取通知边框颜色
  getNotificationBorderColor(type) {
    const colors = {
      success: "#4CAF50",
      error: "#f44336",
      warning: "#FF9800",
      info: "#2196F3",
    };
    return colors[type] || colors.info;
  }

  // 获取类型图标
  getTypeIcon(type) {
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type] || "";
  }

  // 便捷方法
  async success(message, title, tabId = null) {
    return this.show({ message, title, type: "success", tabId });
  }

  async error(message, title, tabId = null) {
    return this.show({ message, title, type: "error", tabId });
  }

  async warning(message, title, tabId = null) {
    return this.show({ message, title, type: "warning", tabId });
  }

  async info(message, title, tabId = null) {
    return this.show({ message, title, type: "info", tabId });
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
