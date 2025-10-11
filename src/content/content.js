// Smart Page Notifications - 智能通知系统
// 根据页面环境智能选择通知策略

class SmartPageNotifications {
  constructor() {
    this.container = null;
    this.shadowRoot = null;
    this.notificationId = 0;
    this.notifications = new Map();
    this.defaultDuration = 3000;
    this.themeColor = "green";
    this.appearance = "system";
    this.isSupported = false;

    // 智能初始化：先检测环境，再决定是否初始化
    this.checkEnvironmentAndInitialize();
  }

  // 智能环境检测和初始化
  checkEnvironmentAndInitialize() {
    console.log("Smart notification system - checking page environment");

    if (this.isPageNotificationSupported()) {
      console.log("Page notifications supported, initializing DOM injection");
      this.isSupported = true;
      this.initializePageNotifications();
      this.loadThemeSettings();
    } else {
      console.log(
        "Page notifications not supported, will fallback to Chrome notifications",
      );
      this.isSupported = false;
      // 不初始化DOM相关功能，但保持消息监听
    }
  }

  // 页面通知支持检测
  isPageNotificationSupported() {
    try {
      // 检测1：基本DOM API是否可用
      if (!document || !document.createElement) {
        console.log("Basic DOM APIs not available");
        return false;
      }

      // 检测2：是否为XML页面
      if (this.isXMLPage()) {
        console.log("XML page detected, not suitable for DOM injection");
        return false;
      }

      // 检测3：是否为受限页面
      if (this.isRestrictedPage()) {
        console.log("Restricted page detected");
        return false;
      }

      // 检测4：基本DOM结构是否可用
      if (!this.hasBasicDOMStructure()) {
        console.log("Basic DOM structure not available");
        return false;
      }

      console.log("All checks passed, page notifications supported");
      return true;
    } catch (error) {
      console.debug("Environment check failed:", error);
      return false;
    }
  }

  // 检测是否为XML页面
  isXMLPage() {
    try {
      // 方法1：检查document.body是否为null（XML页面特征）
      if (document.body === null && document.documentElement) {
        // 进一步检查：是否有XML特征
        const rootElement = document.documentElement;
        const tagName = rootElement.tagName.toLowerCase();

        // 常见XML根元素
        if (
          ["xml", "rss", "feed", "urlset", "sitemapindex"].includes(tagName)
        ) {
          return true;
        }

        // 检查MIME类型
        if (document.contentType && document.contentType.includes("xml")) {
          return true;
        }
      }

      // 方法2：检查URL是否以.xml结尾
      if (
        location.pathname &&
        location.pathname.toLowerCase().endsWith(".xml")
      ) {
        return true;
      }

      return false;
    } catch (error) {
      console.debug("XML detection failed:", error);
      return false;
    }
  }

  // 检测是否为受限页面
  isRestrictedPage() {
    try {
      const url = location.href;
      const restrictedProtocols = [
        "chrome://",
        "chrome-extension://",
        "moz-extension://",
        "edge://",
        "about:",
        "file://",
        "ftp://",
      ];

      return restrictedProtocols.some((protocol) => url.startsWith(protocol));
    } catch (error) {
      console.debug("Restricted page detection failed:", error);
      return true; // 安全起见，检测失败视为受限
    }
  }

  // 检测基本DOM结构
  hasBasicDOMStructure() {
    try {
      // 尝试创建元素并检查基本属性
      const testElement = document.createElement("div");
      if (!testElement || !testElement.style) {
        return false;
      }

      // 检查是否至少有一个可用的插入点
      return !!(document.body || document.documentElement || document.head);
    } catch (error) {
      console.debug("DOM structure check failed:", error);
      return false;
    }
  }

  // 简化的页面通知初始化
  initializePageNotifications() {
    try {
      // 1. 创建容器（简化策略）
      this.container = this.createContainer();

      // 2. 建立Shadow DOM隔离
      this.shadowRoot = this.container.attachShadow({ mode: "closed" });

      // 3. 设置Shadow DOM内容
      this.setupShadowContent();

      console.log("Smart page notifications initialized successfully");
    } catch (error) {
      console.debug("Failed to initialize page notifications:", error);
      // 初始化失败时标记为不支持
      this.isSupported = false;
    }
  }

  // 简化的容器创建 - 只使用最常见和可靠的方法
  createContainer() {
    const container = document.createElement("div");
    container.id = "arclet-smart-notifications";
    container.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif !important;
    `;

    // 简化策略：优先使用body，回退到documentElement
    if (document.body) {
      document.body.appendChild(container);
      console.log("Container inserted into document.body");
    } else if (document.documentElement) {
      document.documentElement.appendChild(container);
      console.log("Container inserted into document.documentElement");
    } else {
      throw new Error("No suitable parent element found for container");
    }

    return container;
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
    if (!this.container) {return;}

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
      console.debug("Shadow DOM not ready, cannot show notification");
      return null;
    }

    const { message = "" } = options;
    const id = ++this.notificationId;

    // 在Shadow DOM内创建通知元素
    const notificationElement = this.createNotificationElement(message);
    const container = this.shadowRoot.getElementById("notifications-container");

    if (!container) {
      console.debug("Notifications container not found in shadow DOM");
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
    if (!notification) {return;}

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

// 创建智能通知管理器
const smartNotifications = new SmartPageNotifications();

// 提取页面元数据（author 和 description）
// 支持同步和异步调用，会等待 DOM 加载完成
async function extractPageMetadata() {
  const metadata = {
    author: "",
    description: "",
  };

  try {
    // 如果 DOM 还没加载完成，等待加载
    if (document.readyState === "loading") {
      console.log("[Metadata] DOM is loading, waiting for DOMContentLoaded...");
      await new Promise((resolve) => {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", resolve, {
            once: true,
          });
        } else {
          resolve();
        }
      });
      console.log("[Metadata] DOM loaded, proceeding with extraction");
    }

    // 提取作者信息（优先级从高到低）
    // 1. <meta name="author"> - 大小写不敏感
    let authorMeta = document.querySelector('meta[name="author" i]');
    if (authorMeta && authorMeta.content) {
      metadata.author = authorMeta.content.trim();
    }

    // 2. 如果没有找到，尝试其他可能的作者标签
    if (!metadata.author) {
      authorMeta = document.querySelector('meta[property="article:author"]');
      if (authorMeta && authorMeta.content) {
        metadata.author = authorMeta.content.trim();
      }
    }

    // 3. Twitter Card author
    if (!metadata.author) {
      authorMeta = document.querySelector('meta[name="twitter:creator"]');
      if (authorMeta && authorMeta.content) {
        metadata.author = authorMeta.content.trim();
      }
    }

    // 4. DC.creator (Dublin Core)
    if (!metadata.author) {
      authorMeta = document.querySelector('meta[name="DC.creator"]');
      if (authorMeta && authorMeta.content) {
        metadata.author = authorMeta.content.trim();
      }
    }

    // 提取描述信息（优先级从高到低）
    // 1. <meta name="description"> - 大小写不敏感
    let descriptionMeta = document.querySelector('meta[name="description" i]');
    if (descriptionMeta && descriptionMeta.content) {
      metadata.description = descriptionMeta.content.trim();
    }

    // 2. Open Graph description
    if (!metadata.description) {
      descriptionMeta = document.querySelector(
        'meta[property="og:description"]',
      );
      if (descriptionMeta && descriptionMeta.content) {
        metadata.description = descriptionMeta.content.trim();
      }
    }

    // 3. Twitter Card description
    if (!metadata.description) {
      descriptionMeta = document.querySelector(
        'meta[name="twitter:description"]',
      );
      if (descriptionMeta && descriptionMeta.content) {
        metadata.description = descriptionMeta.content.trim();
      }
    }

    console.log("[Metadata] Extracted page metadata:", metadata);
    console.log("[Metadata] Document readyState:", document.readyState);
    console.log("[Metadata] Current URL:", location.href);
  } catch (error) {
    console.debug("[Metadata] Failed to extract page metadata:", error);
  }

  return metadata;
}

// 消息监听器 - 智能响应
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Smart content script received message:", request);

  // 响应PING，确认ready状态
  if (request.type === "PING") {
    sendResponse({ success: true, ready: true });
    return true;
  }

  // 提取页面元数据
  if (request.type === "GET_PAGE_METADATA") {
    // 异步处理
    (async () => {
      try {
        const metadata = await extractPageMetadata();
        sendResponse({ success: true, metadata });
      } catch (error) {
        console.debug("[Metadata] Failed to get page metadata:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // 保持消息通道开放
  }

  // 智能显示通知：支持页面通知时显示，否则返回失败让上层回退
  if (request.type === "SHOW_PAGE_NOTIFICATION") {
    try {
      const { message } = request;

      const notificationId = smartNotifications.show({
        message: message || "",
      });

      if (notificationId) {
        console.log("Smart page notification shown successfully");
        sendResponse({ success: true, notificationId });
      } else {
        console.log(
          "Page notification not supported, signaling fallback needed",
        );
        sendResponse({
          success: false,
          error: "Page notifications not supported",
        });
      }
    } catch (error) {
      console.debug("Failed to show smart page notification:", error);
      sendResponse({ success: false, error: error.message });
    }
  } else {
    sendResponse({ success: false, error: "Unknown message type" });
  }

  return true;
});

// 防止重复初始化
if (!window.arcletSmartNotificationsInitialized) {
  window.arcletSmartNotificationsInitialized = true;
  window.arcletSmartNotifications = smartNotifications;
  console.log(
    "Arclet smart notification system initialized on:",
    window.location.href,
  );
}
