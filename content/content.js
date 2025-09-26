// Content Script - 页面通知系统
// 在所有页面中注入，用于显示页面内通知

class ArcletPageNotifications {
  constructor() {
    this.container = null;
    this.notificationId = 0;
    this.notifications = new Map();
    this.defaultDuration = 3000;
    this.themeColor = "green";
    this.appearance = "system";
    this.init();
    this.loadThemeSettings();
  }

  init() {
    if (this.container) return;

    this.container = document.createElement("div");
    this.container.id = "arclet-notification-container";
    this.container.className = "arclet-notifications";

    // 初始设置主题
    this.applyTheme();

    this.addStyles();
    document.body.appendChild(this.container);
  }

  async loadThemeSettings() {
    try {
      const result = await chrome.storage.sync.get([
        "themeColor",
        "appearance",
      ]);
      this.themeColor = result.themeColor || "green";
      this.appearance = result.appearance || "system";
      this.applyTheme();
    } catch (error) {
      console.log("Failed to load theme settings:", error);
    }
  }

  applyTheme() {
    if (!this.container) return;

    // 设置主题色
    this.container.setAttribute("data-color", this.themeColor);

    // 设置外观主题
    if (this.appearance === "dark") {
      this.container.setAttribute("data-theme", "dark");
    } else if (this.appearance === "light") {
      this.container.removeAttribute("data-theme");
    } else {
      // system mode - 由CSS媒体查询自动处理
      this.container.removeAttribute("data-theme");
    }
  }

  addStyles() {
    if (document.getElementById("arclet-notification-styles")) return;

    const style = document.createElement("style");
    style.id = "arclet-notification-styles";
    style.textContent = `
      /* Arclet页面通知样式 - 与popup通知保持一致 */
      .arclet-notifications {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
        font-weight: 400;
        line-height: 1.5;
      }

      .arclet-notification {
        position: relative;
        background: var(--toast-bg, #86efac);
        color: var(--toast-text, #166534);
        padding: 12px 16px;
        border-radius: 16px;
        font-size: 14px;
        font-weight: 600;
        opacity: 0;
        transform: scale(0.3);
        transform-origin: center top;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 0 4px 12px var(--toast-shadow, rgba(134, 239, 172, 0.4));
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 200px;
        max-width: 323px;
        width: fit-content;
        text-align: center;
        line-height: 1.4;
        word-wrap: break-word;
        hyphens: auto;
        border: 1.5px solid var(--toast-border, #22c55e);
        box-sizing: border-box;
        margin-bottom: 8px;
      }

      .arclet-notification.show {
        opacity: 1;
        transform: scale(1);
      }

      .arclet-notification.hide {
        opacity: 0;
        transform: scale(0.3);
      }

      .notification-text {
        display: block;
        width: 100%;
        text-align: center;
        line-height: 1.4;
        word-wrap: break-word;
        white-space: normal;
      }

      /* 主题色定义 - 与popup.css保持一致 */
      .arclet-notifications[data-color="blue"] {
        --toast-bg: #bfdbfe;
        --toast-text: #1e3a8a;
        --toast-border: #3b82f6;
        --toast-shadow: rgba(59, 130, 246, 0.4);
      }

      .arclet-notifications[data-color="green"] {
        --toast-bg: #86efac;
        --toast-text: #166534;
        --toast-border: #22c55e;
        --toast-shadow: rgba(134, 239, 172, 0.4);
      }

      .arclet-notifications[data-color="orange"] {
        --toast-bg: #fed7aa;
        --toast-text: #9a3412;
        --toast-border: #f97316;
        --toast-shadow: rgba(249, 115, 22, 0.4);
      }

      .arclet-notifications[data-color="yellow"] {
        --toast-bg: #fef3c7;
        --toast-text: #92400e;
        --toast-border: #eab308;
        --toast-shadow: rgba(234, 179, 8, 0.4);
      }

      .arclet-notifications[data-color="purple"] {
        --toast-bg: #ddd6fe;
        --toast-text: #5b21b6;
        --toast-border: #8b5cf6;
        --toast-shadow: rgba(139, 92, 246, 0.4);
      }

      /* 深色模式主题色 */
      @media (prefers-color-scheme: dark) {
        .arclet-notifications[data-color="blue"] {
          --toast-bg: #1e3a8a;
          --toast-text: #bfdbfe;
          --toast-border: #60a5fa;
          --toast-shadow: rgba(96, 165, 250, 0.3);
        }

        .arclet-notifications[data-color="green"] {
          --toast-bg: #065f46;
          --toast-text: #d1fae5;
          --toast-border: #10b981;
          --toast-shadow: rgba(16, 185, 129, 0.3);
        }

        .arclet-notifications[data-color="orange"] {
          --toast-bg: #9a3412;
          --toast-text: #fed7aa;
          --toast-border: #fb923c;
          --toast-shadow: rgba(251, 146, 60, 0.3);
        }

        .arclet-notifications[data-color="yellow"] {
          --toast-bg: #92400e;
          --toast-text: #fef3c7;
          --toast-border: #fbbf24;
          --toast-shadow: rgba(251, 191, 36, 0.3);
        }

        .arclet-notifications[data-color="purple"] {
          --toast-bg: #5b21b6;
          --toast-text: #ddd6fe;
          --toast-border: #a78bfa;
          --toast-shadow: rgba(167, 139, 250, 0.3);
        }
      }

      /* 用户手动设置的深色模式 */
      .arclet-notifications[data-theme="dark"][data-color="blue"] {
        --toast-bg: #1e3a8a;
        --toast-text: #bfdbfe;
        --toast-border: #60a5fa;
        --toast-shadow: rgba(96, 165, 250, 0.3);
      }

      .arclet-notifications[data-theme="dark"][data-color="green"] {
        --toast-bg: #065f46;
        --toast-text: #d1fae5;
        --toast-border: #10b981;
        --toast-shadow: rgba(16, 185, 129, 0.3);
      }

      .arclet-notifications[data-theme="dark"][data-color="orange"] {
        --toast-bg: #9a3412;
        --toast-text: #fed7aa;
        --toast-border: #fb923c;
        --toast-shadow: rgba(251, 146, 60, 0.3);
      }

      .arclet-notifications[data-theme="dark"][data-color="yellow"] {
        --toast-bg: #92400e;
        --toast-text: #fef3c7;
        --toast-border: #fbbf24;
        --toast-shadow: rgba(251, 191, 36, 0.3);
      }

      .arclet-notifications[data-theme="dark"][data-color="purple"] {
        --toast-bg: #5b21b6;
        --toast-text: #ddd6fe;
        --toast-border: #a78bfa;
        --toast-shadow: rgba(167, 139, 250, 0.3);
      }
    `;

    document.head.appendChild(style);
  }

  show(options = {}) {
    const {
      title = "",
      message = "",
      duration = this.defaultDuration,
    } = options;

    const id = ++this.notificationId;
    const notification = this.createNotificationElement(id, { message });

    this.notifications.set(id, notification);
    this.container.appendChild(notification.element);

    // 显示动画
    requestAnimationFrame(() => {
      notification.element.classList.add("show");
    });

    // 自动关闭
    if (duration > 0) {
      notification.timeout = setTimeout(() => {
        this.hide(id);
      }, duration);
    }

    return id;
  }

  createNotificationElement(id, { message }) {
    const element = document.createElement("div");
    element.className = "arclet-notification";
    element.dataset.id = id;

    // 使用与popup完全相同的结构
    const textElement = document.createElement("span");
    textElement.className = "notification-text";
    textElement.textContent = message || "";

    element.appendChild(textElement);

    return {
      element,
      timeout: null,
    };
  }

  hide(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;

    // 清除定时器
    if (notification.timeout) {
      clearTimeout(notification.timeout);
    }

    // 隐藏动画
    notification.element.classList.remove("show");
    notification.element.classList.add("hide");

    // 移除元素
    setTimeout(() => {
      if (notification.element.parentNode) {
        notification.element.parentNode.removeChild(notification.element);
      }
      this.notifications.delete(id);
    }, 300);
  }

  clear() {
    this.notifications.forEach((_, id) => {
      this.hide(id);
    });
  }
}

// 创建全局通知管理器
const pageNotifications = new ArcletPageNotifications();

// 监听来自background script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);

  if (request.type === "SHOW_PAGE_NOTIFICATION") {
    try {
      const { message } = request;

      pageNotifications.show({
        message: message || "",
      });

      console.log("Page notification shown successfully");
      sendResponse({ success: true });
    } catch (error) {
      console.error("Failed to show page notification:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else {
    // 对于其他类型的消息，也要返回响应以免报错
    sendResponse({ success: false, error: "Unknown message type" });
  }

  // 返回 true 表示异步响应
  return true;
});

// 防止重复初始化
if (!window.arcletPageNotificationsInitialized) {
  window.arcletPageNotificationsInitialized = true;
  window.arcletPageNotifications = pageNotifications;
  console.log("Arclet page notifications initialized");
}

// 发送初始化完成消息给background script（可选）
console.log("Arclet content script loaded on:", window.location.href);
