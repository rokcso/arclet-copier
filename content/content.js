// Content Script - 页面通知系统
// 在所有页面中注入，用于显示页面内通知

class ArcletPageNotifications {
  constructor() {
    this.container = null;
    this.notificationId = 0;
    this.notifications = new Map();
    this.defaultDuration = 3000;
    this.init();
  }

  init() {
    if (this.container) return;

    this.container = document.createElement("div");
    this.container.id = "arclet-notification-container";
    this.container.className = "arclet-notifications";

    this.addStyles();
    document.body.appendChild(this.container);
  }

  addStyles() {
    if (document.getElementById("arclet-notification-styles")) return;

    const style = document.createElement("style");
    style.id = "arclet-notification-styles";
    style.textContent = `
      .arclet-notifications {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }

      .arclet-notification {
        background: var(--notification-bg, #fff);
        color: var(--notification-color, #333);
        border: 1px solid var(--notification-border, #e0e0e0);
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
      }

      .arclet-notification.show {
        transform: translateX(0);
        opacity: 1;
      }

      .arclet-notification.hide {
        transform: translateX(100%);
        opacity: 0;
      }

      .arclet-notification-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .arclet-notification-title {
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .arclet-notification-close {
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: var(--notification-close, #666);
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .arclet-notification-close:hover {
        opacity: 1;
        background: var(--notification-close-hover, #f5f5f5);
      }

      .arclet-notification-message {
        font-size: 13px;
        line-height: 1.4;
        color: var(--notification-message, #666);
      }

      .arclet-notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--notification-progress, #4CAF50);
        transition: width linear;
      }

      /* 成功通知样式 */
      .arclet-notification.success {
        --notification-bg: #f8fff8;
        --notification-border: #4CAF50;
        --notification-progress: #4CAF50;
      }

      .arclet-notification.success .arclet-notification-title {
        color: #2E7D32;
      }

      /* 错误通知样式 */
      .arclet-notification.error {
        --notification-bg: #fff8f8;
        --notification-border: #f44336;
        --notification-progress: #f44336;
      }

      .arclet-notification.error .arclet-notification-title {
        color: #C62828;
      }

      /* 警告通知样式 */
      .arclet-notification.warning {
        --notification-bg: #fffbf0;
        --notification-border: #FF9800;
        --notification-progress: #FF9800;
      }

      .arclet-notification.warning .arclet-notification-title {
        color: #E65100;
      }

      /* 信息通知样式 */
      .arclet-notification.info {
        --notification-bg: #f0f8ff;
        --notification-border: #2196F3;
        --notification-progress: #2196F3;
      }

      .arclet-notification.info .arclet-notification-title {
        color: #1565C0;
      }

      /* 深色模式支持 */
      @media (prefers-color-scheme: dark) {
        .arclet-notification {
          --notification-bg: #2d2d2d;
          --notification-color: #fff;
          --notification-border: #444;
          --notification-message: #ccc;
          --notification-close: #aaa;
          --notification-close-hover: #444;
        }

        .arclet-notification.success {
          --notification-bg: #1a2e1a;
          --notification-border: #4CAF50;
        }

        .arclet-notification.error {
          --notification-bg: #2e1a1a;
          --notification-border: #f44336;
        }

        .arclet-notification.warning {
          --notification-bg: #2e2a1a;
          --notification-border: #FF9800;
        }

        .arclet-notification.info {
          --notification-bg: #1a222e;
          --notification-border: #2196F3;
        }
      }
    `;

    document.head.appendChild(style);
  }

  show(options = {}) {
    const {
      title = "Arclet Copier",
      message = "",
      type = "success",
      duration = this.defaultDuration,
      closable = true,
      icon = this.getTypeIcon(type),
    } = options;

    const id = ++this.notificationId;
    const notification = this.createNotificationElement(id, {
      title,
      message,
      type,
      closable,
      icon,
    });

    this.notifications.set(id, notification);
    this.container.appendChild(notification.element);

    // 显示动画
    requestAnimationFrame(() => {
      notification.element.classList.add("show");
    });

    // 自动关闭
    if (duration > 0) {
      this.startProgressBar(notification.element, duration);
      notification.timeout = setTimeout(() => {
        this.hide(id);
      }, duration);
    }

    return id;
  }

  createNotificationElement(id, { title, message, type, closable, icon }) {
    const element = document.createElement("div");
    element.className = `arclet-notification ${type}`;
    element.dataset.id = id;

    const headerHtml = `
      <div class="arclet-notification-header">
        <div class="arclet-notification-title">
          ${icon ? `<span>${icon}</span>` : ""}
          ${title}
        </div>
        ${closable ? '<button class="arclet-notification-close" aria-label="Close">×</button>' : ""}
      </div>
    `;

    const messageHtml = message
      ? `<div class="arclet-notification-message">${message}</div>`
      : "";
    const progressHtml = '<div class="arclet-notification-progress"></div>';

    element.innerHTML = headerHtml + messageHtml + progressHtml;

    // 添加关闭事件
    if (closable) {
      const closeBtn = element.querySelector(".arclet-notification-close");
      closeBtn?.addEventListener("click", () => this.hide(id));
    }

    return {
      element,
      timeout: null,
    };
  }

  getTypeIcon(type) {
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type] || "";
  }

  startProgressBar(element, duration) {
    const progressBar = element.querySelector(".arclet-notification-progress");
    if (!progressBar) return;

    progressBar.style.width = "100%";
    progressBar.style.transitionDuration = `${duration}ms`;

    requestAnimationFrame(() => {
      progressBar.style.width = "0%";
    });
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
      const { title, message, notificationType } = request;

      pageNotifications.show({
        title: title || "Arclet Copier",
        message: message || "",
        type: notificationType || "success",
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
