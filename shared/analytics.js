// 基础分析模块 - 用于 Umami 数据收集
// 专注于累计用户统计功能

class UmamiAnalytics {
  constructor(config = {}) {
    this.config = {
      websiteId: config.websiteId || "c0b57f97-5293-42d9-8ec2-4708e4ea68ae",
      apiUrl: config.apiUrl || "https://umami.lunarye.com",
      enabled: config.enabled !== false,
      debug: config.debug === false, // 默认关闭调试模式
    };

    this.userId = null;
    this.initialized = false;
  }

  // 初始化用户ID
  async initialize() {
    if (this.initialized) return;

    try {
      this.userId = await this.getUserId();
      this.initialized = true;

      if (this.config.debug) {
        console.log("Analytics initialized with user ID:", this.userId);
      }
    } catch (error) {
      console.warn("Analytics initialization failed:", error);
    }
  }

  // 获取或生成匿名用户ID
  async getUserId() {
    try {
      const result = await chrome.storage.local.get(["analytics_user_id"]);

      if (result.analytics_user_id) {
        return result.analytics_user_id;
      }

      // 生成新的用户ID
      const newUserId = this.generateUserId();
      await chrome.storage.local.set({ analytics_user_id: newUserId });

      if (this.config.debug) {
        console.log("Generated new user ID:", newUserId);
      }

      return newUserId;
    } catch (error) {
      console.error("Failed to get/generate user ID:", error);
      // 返回临时ID，避免分析功能完全失效
      return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
  }

  // 生成匿名用户ID
  generateUserId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `user_${timestamp}_${random}`;
  }

  // 发送事件到 Umami
  async track(eventName, properties = {}) {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("Analytics disabled, skipping event:", eventName);
      }
      return false;
    }

    try {
      // 确保已初始化
      if (!this.initialized) {
        await this.initialize();
      }

      // 构建事件数据
      const eventData = this.buildEventData(eventName, properties);

      // 发送数据
      const success = await this.sendEvent(eventData);

      if (this.config.debug) {
        console.log(
          "Event tracked:",
          eventName,
          success ? "SUCCESS" : "FAILED",
          eventData,
        );
      }

      return success;
    } catch (error) {
      console.warn("Analytics tracking failed:", error);
      return false;
    }
  }

  // 构建事件数据 - 使用 Umami 正确的格式
  buildEventData(eventName, properties) {
    // 将自定义属性转换为字符串格式（Umami 要求）
    const eventData = {
      // 通用属性
      user_id: this.userId,
      version: chrome.runtime.getManifest().version,
      locale: chrome.i18n.getUILanguage(),

      // 自定义属性
      ...properties,
    };

    // 将所有属性值转换为字符串
    const stringifiedData = {};
    for (const [key, value] of Object.entries(eventData)) {
      stringifiedData[key] = String(value);
    }

    return {
      type: "event",
      payload: {
        website: this.config.websiteId,
        url: "/extension", // Umami 需要一个 URL
        event_name: eventName,
        hostname: "arclet-copier-extension",
        language: chrome.i18n.getUILanguage(),
        screen: "1920x1080", // 默认屏幕分辨率

        // 自定义事件数据
        ...stringifiedData,
      },
    };
  }

  // 发送事件数据
  async sendEvent(eventData) {
    const payload = JSON.stringify(eventData);
    const endpoint = `${this.config.apiUrl}/api/send`;

    try {
      // 优先使用 navigator.sendBeacon
      if (navigator.sendBeacon) {
        const success = navigator.sendBeacon(endpoint, payload);
        if (success) return true;

        if (this.config.debug) {
          console.warn("sendBeacon failed, falling back to fetch");
        }
      }

      // 回退到 fetch + keepalive
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Arclet-Copier-Extension",
        },
        body: payload,
        keepalive: true,
        mode: "cors",
      });

      return response.ok;
    } catch (error) {
      console.warn("Event send failed:", error);
      return false;
    }
  }

  // 记录用户安装
  async trackUserInstall(installType = "install") {
    const installData = {
      install_type: installType,
      install_date: new Date().toISOString().split("T")[0], // YYYY-MM-DD 格式
      browser: this.getBrowserInfo(),
      platform: this.getPlatform(),
    };

    return await this.track("user_install", installData);
  }

  // 获取浏览器信息
  getBrowserInfo() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("edg/")) return "edge";
    if (userAgent.includes("chrome/")) return "chrome";
    if (userAgent.includes("firefox/")) return "firefox";
    return "unknown";
  }

  // 获取平台信息
  getPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) return "mac";
    if (userAgent.includes("win")) return "windows";
    if (userAgent.includes("linux")) return "linux";
    return "unknown";
  }

  // 检查是否已记录安装
  async isInstallRecorded() {
    try {
      const result = await chrome.storage.local.get([
        "analytics_install_recorded",
      ]);
      return result.analytics_install_recorded === true;
    } catch (error) {
      console.warn("Failed to check install record:", error);
      return false; // 假设未记录，宁可重复也不要遗漏
    }
  }

  // 标记安装已记录
  async markInstallRecorded() {
    try {
      await chrome.storage.local.set({
        analytics_install_recorded: true,
        analytics_install_date: new Date().toISOString(),
      });

      if (this.config.debug) {
        console.log("Install marked as recorded");
      }
    } catch (error) {
      console.warn("Failed to mark install as recorded:", error);
    }
  }
}

// 导出分析类
export { UmamiAnalytics };

// 创建全局实例（可选，便于在不同模块中使用）
let globalAnalytics = null;

export function getAnalytics(config = {}) {
  if (!globalAnalytics) {
    globalAnalytics = new UmamiAnalytics(config);
  }
  return globalAnalytics;
}

// 便捷函数：记录用户安装（如果尚未记录）
export async function trackUserInstallOnce(installReason = "install") {
  try {
    const analytics = getAnalytics();

    // 检查是否已记录
    const alreadyRecorded = await analytics.isInstallRecorded();
    if (alreadyRecorded) {
      console.log("User install already recorded, skipping");
      return false;
    }

    // 记录安装
    const success = await analytics.trackUserInstall(installReason);

    if (success) {
      // 标记为已记录
      await analytics.markInstallRecorded();
      console.log("User install tracked successfully");
      return true;
    } else {
      console.warn("Failed to track user install");
      return false;
    }
  } catch (error) {
    console.error("trackUserInstallOnce failed:", error);
    return false;
  }
}
