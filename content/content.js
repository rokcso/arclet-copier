// Aggressive Page Notifications - 强制DOM注入系统
// 不依赖DOM就绪状态，立即创建和显示通知

class AggressivePageNotifications {
  constructor() {
    this.container = null;
    this.shadowRoot = null;
    this.notificationId = 0;
    this.notifications = new Map();
    this.defaultDuration = 3000;
    this.themeColor = "green";
    this.appearance = "system";

    // 立即执行初始化，不等待任何事件
    this.initializeImmediately();
    this.loadThemeSettings();
  }

  initializeImmediately() {
    try {
      // 1. 强制创建容器（多重回退策略）
      this.container = this.forceCreateContainer();

      // 2. 建立Shadow DOM隔离
      this.shadowRoot = this.container.attachShadow({ mode: "closed" });

      // 3. 立即设置Shadow DOM内容
      this.setupShadowContent();

      console.log("Aggressive page notifications initialized immediately");
    } catch (error) {
      console.error("Failed to initialize aggressive notifications:", error);
    }
  }

  forceCreateContainer() {
    const container = document.createElement("div");
    container.id = "arclet-aggressive-notifications";
    container.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;

    // 多重插入策略 - 逐个尝试直到成功
    const insertStrategies = [
      () => {
        if (document.body) {
          document.body.appendChild(container);
          return true;
        }
        return false;
      },
      () => {
        if (document.documentElement) {
          document.documentElement.appendChild(container);
          return true;
        }
        return false;
      },
      () => {
        if (document.head) {
          document.head.appendChild(container);
          return true;
        }
        return false;
      },
      () => {
        // 最后的回退：创建临时DOM宿主
        return this.createTemporaryHost(container);
      },
    ];

    for (let i = 0; i < insertStrategies.length; i++) {
      try {
        if (insertStrategies[i]()) {
          console.log(`Container inserted using strategy ${i + 1}`);
          return container;
        }
      } catch (error) {
        console.log(`Strategy ${i + 1} failed:`, error.message);
      }
    }

    throw new Error("All insertion strategies failed");
  }

  createTemporaryHost(container) {
    try {
      // 创建最小化的临时DOM结构
      if (!document.documentElement) {
        document.appendChild(document.createElement("html"));
      }

      if (!document.head) {
        document.documentElement.appendChild(document.createElement("head"));
      }

      document.head.appendChild(container);

      // 设置监听器，当body可用时迁移
      this.setupMigrationListener(container);

      return true;
    } catch (error) {
      console.error("Failed to create temporary host:", error);
      return false;
    }
  }

  setupMigrationListener(container) {
    // 轻量级检查，当body可用时迁移到更合适的位置
    const checkForBetterParent = () => {
      if (document.body && !document.body.contains(container)) {
        try {
          document.body.appendChild(container);
          console.log("Container migrated to document.body");
        } catch (error) {
          console.log("Migration failed, staying in current position");
        }
      }
    };

    // 使用轻量级检查而不是MutationObserver
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", checkForBetterParent, {
        once: true,
      });
    } else {
      // DOM已经加载完成，立即检查
      setTimeout(checkForBetterParent, 0);
    }
  }

  setupShadowContent() {
    // 在Shadow DOM中注入样式和结构
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial !important;
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          z-index: 2147483647 !important;
          pointer-events: none !important;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
          font-weight: 400 !important;
          line-height: 1.5 !important;
        }

        .notification {
          position: relative !important;
          background: var(--toast-bg, #86efac) !important;
          color: var(--toast-text, #166534) !important;
          padding: 12px 16px !important;
          border-radius: 16px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          opacity: 0 !important;
          transform: scale(0.3) !important;
          transform-origin: center top !important;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          box-shadow: 0 4px 12px var(--toast-shadow, rgba(134, 239, 172, 0.4)) !important;
          pointer-events: auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 200px !important;
          max-width: 323px !important;
          width: fit-content !important;
          text-align: center !important;
          line-height: 1.4 !important;
          word-wrap: break-word !important;
          border: 1.5px solid var(--toast-border, #22c55e) !important;
          box-sizing: border-box !important;
          margin-bottom: 8px !important;
          font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
        }

        .notification.show {
          opacity: 1 !important;
          transform: scale(1) !important;
        }

        .notification.hide {
          opacity: 0 !important;
          transform: scale(0.3) !important;
        }

        .notification-text {
          display: block !important;
          width: 100% !important;
          text-align: center !important;
          line-height: 1.4 !important;
          word-wrap: break-word !important;
          white-space: normal !important;
          font-family: inherit !important;
        }

        /* 主题色定义 - 与popup.css保持一致 */
        :host([data-color="blue"]) {
          --toast-bg: #bfdbfe;
          --toast-text: #1e3a8a;
          --toast-border: #3b82f6;
          --toast-shadow: rgba(59, 130, 246, 0.4);
        }

        :host([data-color="green"]) {
          --toast-bg: #86efac;
          --toast-text: #166534;
          --toast-border: #22c55e;
          --toast-shadow: rgba(134, 239, 172, 0.4);
        }

        :host([data-color="orange"]) {
          --toast-bg: #fed7aa;
          --toast-text: #9a3412;
          --toast-border: #f97316;
          --toast-shadow: rgba(249, 115, 22, 0.4);
        }

        :host([data-color="yellow"]) {
          --toast-bg: #fef3c7;
          --toast-text: #92400e;
          --toast-border: #eab308;
          --toast-shadow: rgba(234, 179, 8, 0.4);
        }

        :host([data-color="purple"]) {
          --toast-bg: #ddd6fe;
          --toast-text: #5b21b6;
          --toast-border: #8b5cf6;
          --toast-shadow: rgba(139, 92, 246, 0.4);
        }

        /* 深色模式主题色 */
        @media (prefers-color-scheme: dark) {
          :host([data-color="blue"]) {
            --toast-bg: #1e3a8a;
            --toast-text: #bfdbfe;
            --toast-border: #60a5fa;
            --toast-shadow: rgba(96, 165, 250, 0.3);
          }

          :host([data-color="green"]) {
            --toast-bg: #065f46;
            --toast-text: #d1fae5;
            --toast-border: #10b981;
            --toast-shadow: rgba(16, 185, 129, 0.3);
          }

          :host([data-color="orange"]) {
            --toast-bg: #9a3412;
            --toast-text: #fed7aa;
            --toast-border: #fb923c;
            --toast-shadow: rgba(251, 146, 60, 0.3);
          }

          :host([data-color="yellow"]) {
            --toast-bg: #92400e;
            --toast-text: #fef3c7;
            --toast-border: #fbbf24;
            --toast-shadow: rgba(251, 191, 36, 0.3);
          }

          :host([data-color="purple"]) {
            --toast-bg: #5b21b6;
            --toast-text: #ddd6fe;
            --toast-border: #a78bfa;
            --toast-shadow: rgba(167, 139, 250, 0.3);
          }
        }

        /* 用户手动设置的深色模式 */
        :host([data-theme="dark"][data-color="blue"]) {
          --toast-bg: #1e3a8a;
          --toast-text: #bfdbfe;
          --toast-border: #60a5fa;
          --toast-shadow: rgba(96, 165, 250, 0.3);
        }

        :host([data-theme="dark"][data-color="green"]) {
          --toast-bg: #065f46;
          --toast-text: #d1fae5;
          --toast-border: #10b981;
          --toast-shadow: rgba(16, 185, 129, 0.3);
        }

        :host([data-theme="dark"][data-color="orange"]) {
          --toast-bg: #9a3412;
          --toast-text: #fed7aa;
          --toast-border: #fb923c;
          --toast-shadow: rgba(251, 146, 60, 0.3);
        }

        :host([data-theme="dark"][data-color="yellow"]) {
          --toast-bg: #92400e;
          --toast-text: #fef3c7;
          --toast-border: #fbbf24;
          --toast-shadow: rgba(251, 191, 36, 0.3);
        }

        :host([data-theme="dark"][data-color="purple"]) {
          --toast-bg: #5b21b6;
          --toast-text: #ddd6fe;
          --toast-border: #a78bfa;
          --toast-shadow: rgba(167, 139, 250, 0.3);
        }
      </style>
      <div id="notifications-container"></div>
    `;

    // 应用初始主题
    this.applyTheme();
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

    // 设置主题色和外观
    this.container.setAttribute("data-color", this.themeColor);

    if (this.appearance === "dark") {
      this.container.setAttribute("data-theme", "dark");
    } else if (this.appearance === "light") {
      this.container.removeAttribute("data-theme");
    } else {
      // system mode - 由CSS媒体查询自动处理
      this.container.removeAttribute("data-theme");
    }
  }

  show(options = {}) {
    if (!this.shadowRoot) {
      console.error("Shadow DOM not ready, cannot show notification");
      return null;
    }

    const { message = "" } = options;
    const id = ++this.notificationId;

    // 在Shadow DOM内创建通知元素
    const notificationElement = this.createNotificationElement(message);
    const container = this.shadowRoot.getElementById("notifications-container");

    if (!container) {
      console.error("Notifications container not found in shadow DOM");
      return null;
    }

    const notification = {
      element: notificationElement,
      timeout: null,
    };

    this.notifications.set(id, notification);
    container.appendChild(notificationElement);

    // 显示动画
    requestAnimationFrame(() => {
      notificationElement.classList.add("show");
    });

    // 自动关闭
    if (this.defaultDuration > 0) {
      notification.timeout = setTimeout(() => {
        this.hide(id);
      }, this.defaultDuration);
    }

    console.log("Aggressive page notification shown:", message);
    return id;
  }

  createNotificationElement(message) {
    const element = document.createElement("div");
    element.className = "notification";

    const textElement = document.createElement("span");
    textElement.className = "notification-text";
    textElement.textContent = message || "";

    element.appendChild(textElement);
    return element;
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
    }, 400); // 等待动画完成
  }

  clear() {
    this.notifications.forEach((_, id) => {
      this.hide(id);
    });
  }
}

// 立即创建全局通知管理器，不等待任何事件
const aggressiveNotifications = new AggressivePageNotifications();

// 消息监听器 - 简化版，立即响应
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Aggressive content script received message:", request);

  // 立即响应PING，确认ready状态
  if (request.type === "PING") {
    sendResponse({ success: true, ready: true });
    return true;
  }

  // 立即显示通知，不做任何检查
  if (request.type === "SHOW_PAGE_NOTIFICATION") {
    try {
      const { message } = request;

      const notificationId = aggressiveNotifications.show({
        message: message || "",
      });

      console.log("Aggressive page notification shown immediately");
      sendResponse({ success: true, notificationId });
    } catch (error) {
      console.error("Failed to show aggressive page notification:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else {
    sendResponse({ success: false, error: "Unknown message type" });
  }

  return true;
});

// 防止重复初始化
if (!window.arcletAggressiveNotificationsInitialized) {
  window.arcletAggressiveNotificationsInitialized = true;
  window.arcletAggressiveNotifications = aggressiveNotifications;
  console.log(
    "Arclet aggressive page notifications initialized on:",
    window.location.href,
  );
}
