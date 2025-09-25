// 基础分析模块 - 用于 Umami 数据收集
// 专注于累计用户统计功能

// 公共事件属性定义
const COMMON_EVENT_PROPERTIES = {
  // 基础属性获取器
  getUserId: async () => {
    try {
      const result = await chrome.storage.local.get(["analytics_user_id"]);
      return result.analytics_user_id || null;
    } catch {
      return null;
    }
  },

  getVersion: () => chrome.runtime.getManifest().version,

  getLocale: () => chrome.i18n.getUILanguage(),

  getBrowser: () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("edg/")) return "edge";
    if (userAgent.includes("chrome/")) return "chrome";
    if (userAgent.includes("firefox/")) return "firefox";
    return "unknown";
  },

  getPlatform: () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) return "mac";
    if (userAgent.includes("win")) return "windows";
    if (userAgent.includes("linux")) return "linux";
    return "unknown";
  },

  getTimestamp: () => new Date().toISOString(),

  getDate: () => new Date().toISOString().split("T")[0], // YYYY-MM-DD

  // 会话相关
  getSessionId: () =>
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,

  // 扩展相关
  getHostname: () => "arclet-copier-extension",
  getUrl: () => "/extension",
  getScreen: () => "1920x1080", // 默认值
};

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
      return this.generateUserId();
    }
  }

  // 生成匿名用户ID
  generateUserId() {
    const nanoTime = performance.now().toString(36).replace(".", "");
    const random = Math.random().toString(36).substr(2, 8);

    const timePart = nanoTime.slice(-6);
    const randomPart = random.slice(0, 6);

    return `user_${randomPart}${timePart}`;
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
      const eventData = await this.buildEventData(eventName, properties);

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
  async buildEventData(eventName, properties) {
    // 构建自定义事件数据
    const customEventData = await this.buildCustomEventData(properties);

    return {
      type: "event",
      payload: {
        // Umami 标准字段
        website: this.config.websiteId,
        url: COMMON_EVENT_PROPERTIES.getUrl(),
        name: eventName, // 使用 name 而不是 event_name
        hostname: COMMON_EVENT_PROPERTIES.getHostname(),
        language: COMMON_EVENT_PROPERTIES.getLocale(),
        screen: COMMON_EVENT_PROPERTIES.getScreen(),

        // 自定义事件数据放在 data 字段中
        data: customEventData,
      },
    };
  }

  // 构建自定义事件数据（符合 Umami data 字段要求）
  async buildCustomEventData(additionalProps = {}) {
    // 确保已初始化，获取当前用户ID
    const userId = this.userId || (await this.getUserId());

    const customData = {
      // 用户和应用信息
      user_id: userId,
      version: COMMON_EVENT_PROPERTIES.getVersion(),
      locale: COMMON_EVENT_PROPERTIES.getLocale(),

      // 环境信息
      browser: COMMON_EVENT_PROPERTIES.getBrowser(),
      platform: COMMON_EVENT_PROPERTIES.getPlatform(),

      // 时间信息
      timestamp: COMMON_EVENT_PROPERTIES.getTimestamp(),
      date: COMMON_EVENT_PROPERTIES.getDate(),

      // 合并传入的自定义属性
      ...additionalProps,
    };

    // 将所有属性值转换为字符串（Umami 要求）
    const stringifiedData = {};
    for (const [key, value] of Object.entries(customData)) {
      // 保持 null/undefined 值，其他转字符串
      stringifiedData[key] =
        value === null || value === undefined ? null : String(value);
    }

    return stringifiedData;
  }

  // 构建完整的公共属性对象（保留用于兼容性）
  async buildCommonProperties(additionalProps = {}) {
    // 确保已初始化，获取当前用户ID
    const userId = this.userId || (await this.getUserId());

    const commonProps = {
      // 用户标识
      user_id: userId,

      // 应用信息
      version: COMMON_EVENT_PROPERTIES.getVersion(),
      locale: COMMON_EVENT_PROPERTIES.getLocale(),

      // 环境信息
      browser: COMMON_EVENT_PROPERTIES.getBrowser(),
      platform: COMMON_EVENT_PROPERTIES.getPlatform(),

      // 时间信息
      timestamp: COMMON_EVENT_PROPERTIES.getTimestamp(),
      date: COMMON_EVENT_PROPERTIES.getDate(),

      // 扩展特定信息
      hostname: COMMON_EVENT_PROPERTIES.getHostname(),

      // 合并自定义属性
      ...additionalProps,
    };

    // 将所有属性值转换为字符串（Umami 要求）
    const stringifiedProps = {};
    for (const [key, value] of Object.entries(commonProps)) {
      // 避免将 null 转换为 "null" 字符串，保持 null 值
      stringifiedProps[key] =
        value === null || value === undefined ? null : String(value);
    }

    return stringifiedProps;
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
      install_date: COMMON_EVENT_PROPERTIES.getDate(),
    };

    // 根据类型选择事件名称
    const eventName = installType === "update" ? "user_update" : "user_install";
    return await this.track(eventName, installData);
  }

  // 记录用户更新（总是记录）
  async trackUserUpdate() {
    const updateData = {
      install_type: "update",
      install_date: COMMON_EVENT_PROPERTIES.getDate(),
      previous_version: await this.getPreviousVersion(), // 获取之前的版本
      current_version: COMMON_EVENT_PROPERTIES.getVersion(),
    };

    return await this.track("user_update", updateData);
  }

  // 获取之前的版本信息（如果有）
  async getPreviousVersion() {
    try {
      const result = await chrome.storage.local.get(["analytics_last_version"]);
      return result.analytics_last_version || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  // 保存当前版本信息
  async saveCurrentVersion() {
    try {
      const currentVersion = COMMON_EVENT_PROPERTIES.getVersion();
      await chrome.storage.local.set({
        analytics_last_version: currentVersion,
      });
    } catch (error) {
      console.warn("Failed to save current version:", error);
    }
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

// 导出分析类和公共属性抽象
export { UmamiAnalytics, COMMON_EVENT_PROPERTIES };

// 创建全局实例（可选，便于在不同模块中使用）
let globalAnalytics = null;

export function getAnalytics(config = {}) {
  if (!globalAnalytics) {
    globalAnalytics = new UmamiAnalytics(config);
  }
  return globalAnalytics;
}

// 便捷函数：记录用户安装或更新
export async function trackUserInstallOnce(installReason = "install") {
  try {
    const analytics = getAnalytics();

    if (installReason === "update") {
      // 更新事件：总是记录，不检查是否已记录
      console.log("Extension updated, tracking user update...");
      const success = await analytics.trackUserUpdate();

      if (success) {
        // 保存当前版本信息用于下次更新
        await analytics.saveCurrentVersion();
        console.log("User update tracked successfully");
        return true;
      } else {
        console.warn("Failed to track user update");
        return false;
      }
    } else {
      // 安装事件：检查是否已记录，只记录一次
      const alreadyRecorded = await analytics.isInstallRecorded();
      if (alreadyRecorded) {
        console.log("User install already recorded, skipping");
        return false;
      }

      // 记录安装
      const success = await analytics.trackUserInstall(installReason);

      if (success) {
        // 标记为已记录，并保存当前版本
        await analytics.markInstallRecorded();
        await analytics.saveCurrentVersion();
        console.log("User install tracked successfully");
        return true;
      } else {
        console.warn("Failed to track user install");
        return false;
      }
    }
  } catch (error) {
    console.error("trackUserInstallOnce failed:", error);
    return false;
  }
}
