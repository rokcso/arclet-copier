// Shared constants for Arclet Copier

// 短链请求限流器 - 修复并发问题
class ShortUrlThrottle {
  constructor() {
    this.concurrentLimit = 3; // 同时最多3个请求
    this.requestQueue = [];
    this.activeRequests = 0;
    this.requestDelay = 200; // 请求间隔200ms
    this.lastRequestTime = 0;
    this.isProcessing = false; // 防止重复处理队列
    this.requestTimeLock = Promise.resolve(); // 请求时间锁，确保串行更新
  }

  async throttledRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    // 防止并发处理队列
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // 持续处理队列直到达到并发限制或队列为空
      while (
        this.activeRequests < this.concurrentLimit &&
        this.requestQueue.length > 0
      ) {
        const { requestFn, resolve, reject } = this.requestQueue.shift();
        this.activeRequests++;

        // 异步执行请求，不等待完成
        this.executeRequest(requestFn, resolve, reject);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async executeRequest(requestFn, resolve, reject) {
    try {
      // 使用锁确保 lastRequestTime 的串行更新
      await this.requestTimeLock;

      // 创建新的锁用于下一个请求
      let releaseLock;
      this.requestTimeLock = new Promise((r) => (releaseLock = r));

      try {
        // 确保请求间隔
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.requestDelay - timeSinceLastRequest),
          );
        }

        // 更新最后请求时间
        this.lastRequestTime = Date.now();
      } finally {
        // 释放锁
        releaseLock();
      }

      // 执行实际请求
      const result = await requestFn();

      // 调用进度回调（如果存在）
      if (this.progressCallback) {
        try {
          this.progressCallback();
        } catch (callbackError) {
          console.debug("Progress callback error:", callbackError);
        }
      }

      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // 使用微任务继续处理队列，避免 setTimeout 的不确定性
      queueMicrotask(() => this.processQueue());
    }
  }

  // 设置进度回调（用于批量操作进度显示）
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  // 清除进度回调
  clearProgressCallback() {
    this.progressCallback = null;
  }

  // 获取队列状态（用于调试）
  getStatus() {
    return {
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}

// 创建全局短链限流器实例
const globalShortUrlThrottle = new ShortUrlThrottle();

// URL参数分类定义
export const PARAM_CATEGORIES = {
  // 跟踪参数 - 可以安全移除
  TRACKING: [
    // UTM 系列
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    // 社交媒体跟踪
    "fbclid",
    "igshid",
    "gclid",
    "msclkid",
    "dclid",
    "wbraid",
    "gbraid",
    // 分析工具
    "ref",
    "referrer",
    "source",
    "campaign",
    "medium",
    // 其他常见跟踪
    "spm",
    "from",
    "share_from",
    "tt_from",
    "tt_medium",
    "share_token",
  ],

  // 功能性参数 - 应该保留
  FUNCTIONAL: [
    "page",
    "p",
    "offset",
    "limit",
    "size",
    "per_page", // 分页
    "sort",
    "order",
    "orderby",
    "direction",
    "sort_by", // 排序
    "q",
    "query",
    "search",
    "keyword",
    "filter",
    "s", // 搜索筛选
    "tab",
    "view",
    "mode",
    "type",
    "category",
    "section", // 界面状态
    "id",
    "uid",
    "token",
    "key",
    "code",
    "lang",
    "locale", // 功能标识
  ],
};

// 自定义参数规则的存储 key
export const CUSTOM_PARAM_RULES_KEY = "customParamRules";

// 默认参数规则配置
export const DEFAULT_PARAM_RULES = {
  tracking: [...PARAM_CATEGORIES.TRACKING],
  functional: [...PARAM_CATEGORIES.FUNCTIONAL],
  version: "1.0",
};

/**
 * 初始化自定义参数规则
 * 如果用户没有自定义配置，则使用预置的参数列表初始化
 * @returns {Promise<void>}
 */
export async function initializeParamRules() {
  try {
    const result = await chrome.storage.sync.get(CUSTOM_PARAM_RULES_KEY);

    if (!result[CUSTOM_PARAM_RULES_KEY]) {
      const initialRules = {
        ...DEFAULT_PARAM_RULES,
        lastModified: new Date().toISOString(),
      };

      await chrome.storage.sync.set({
        [CUSTOM_PARAM_RULES_KEY]: initialRules,
      });

      console.log("[ParamRules] Initialized with default rules");
    }
  } catch (error) {
    console.debug("[ParamRules] Failed to initialize:", error);
  }
}

/**
 * 获取自定义参数规则
 * @returns {Promise<{tracking: string[], functional: string[]}>}
 */
export async function getCustomParamRules() {
  try {
    const result = await chrome.storage.sync.get(CUSTOM_PARAM_RULES_KEY);

    if (result[CUSTOM_PARAM_RULES_KEY]) {
      return {
        tracking: result[CUSTOM_PARAM_RULES_KEY].tracking || [],
        functional: result[CUSTOM_PARAM_RULES_KEY].functional || [],
      };
    }

    // 如果没有自定义配置，返回默认配置
    return {
      tracking: [...PARAM_CATEGORIES.TRACKING],
      functional: [...PARAM_CATEGORIES.FUNCTIONAL],
    };
  } catch (error) {
    console.debug("[ParamRules] Failed to get custom rules:", error);
    // 出错时返回默认配置
    return {
      tracking: [...PARAM_CATEGORIES.TRACKING],
      functional: [...PARAM_CATEGORIES.FUNCTIONAL],
    };
  }
}

/**
 * 保存自定义参数规则
 * @param {{tracking: string[], functional: string[]}} rules - 参数规则
 * @returns {Promise<boolean>} 保存是否成功
 */
export async function saveCustomParamRules(rules) {
  try {
    const saveData = {
      tracking: rules.tracking || [],
      functional: rules.functional || [],
      version: "1.0",
      lastModified: new Date().toISOString(),
    };

    await chrome.storage.sync.set({
      [CUSTOM_PARAM_RULES_KEY]: saveData,
    });

    console.log("[ParamRules] Saved custom rules:", saveData);
    return true;
  } catch (error) {
    console.debug("[ParamRules] Failed to save custom rules:", error);
    return false;
  }
}

/**
 * 判断参数是否应该保留（异步版本，支持自定义规则）
 * @param {string} paramName - 参数名称
 * @param {string} cleaningMode - 清理模式 ('off' | 'smart' | 'aggressive')
 * @returns {Promise<boolean>} 是否保留该参数
 */
async function shouldKeepParameter(paramName, cleaningMode) {
  const lowerParam = paramName.toLowerCase();

  // Off 模式：保留所有参数
  if (cleaningMode === "off") {
    return true;
  }

  // Aggressive 模式：移除所有参数
  if (cleaningMode === "aggressive") {
    return false;
  }

  // Smart 模式：根据用户配置的参数列表判断
  if (cleaningMode === "smart") {
    try {
      const customRules = await getCustomParamRules();

      // 功能性参数保留
      if (customRules.functional.includes(lowerParam)) {
        return true;
      }

      // 跟踪参数移除
      if (customRules.tracking.includes(lowerParam)) {
        return false;
      }

      // 未知参数保留（安全策略）
      return true;
    } catch (error) {
      console.debug("[ParamRules] Error in shouldKeepParameter:", error);
      // 出错时采用安全策略：保留参数
      return true;
    }
  }

  // 默认保留
  return true;
}

/**
 * 智能处理URL参数（异步版本，支持自定义规则）
 * @param {string} url - 要处理的 URL
 * @param {string} cleaningMode - 清理模式 ('off' | 'smart' | 'aggressive')
 * @returns {Promise<string>} 处理后的 URL
 */
export async function processUrl(url, cleaningMode = "smart") {
  if (!url || cleaningMode === "off") {
    return url;
  }

  try {
    const urlObj = new URL(url);

    // 激进模式：移除所有查询参数
    if (cleaningMode === "aggressive") {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }

    // 智能模式：根据自定义规则移除跟踪参数
    if (cleaningMode === "smart") {
      const params = new URLSearchParams(urlObj.search);
      const newParams = new URLSearchParams();

      for (const [key, value] of params.entries()) {
        const shouldKeep = await shouldKeepParameter(key, cleaningMode);
        if (shouldKeep) {
          newParams.append(key, value);
        }
      }

      urlObj.search = newParams.toString();
      return urlObj.toString();
    }

    return url;
  } catch (error) {
    console.debug("[ParamRules] Error in processUrl:", error);
    return url;
  }
}

// 检查是否为特殊页面的共享函数
export function isRestrictedPage(url) {
  if (!url) {return true;}

  // 受限协议
  const restrictedProtocols = [
    "chrome:",
    "chrome-extension:",
    "edge:",
    "about:",
    "moz-extension:",
  ];

  // 受限域名
  const restrictedDomains = [
    "chromewebstore.google.com",
    "chrome.google.com",
    "addons.mozilla.org",
    "microsoftedge.microsoft.com",
  ];

  // 检查协议
  if (restrictedProtocols.some((protocol) => url.startsWith(protocol))) {
    return true;
  }

  // 检查域名
  try {
    const urlObj = new URL(url);
    return restrictedDomains.some((domain) => urlObj.hostname === domain);
  } catch (error) {
    return true; // URL无效时也认为是受限页面
  }
}

// 检查是否为有效的网页URL（可用于短链生成）
export function isValidWebUrl(url) {
  if (!url) {return false;}

  try {
    const urlObj = new URL(url);

    // 只允许 HTTP 和 HTTPS 协议
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return false;
    }

    // 排除所有本地地址
    const hostname = urlObj.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
      hostname.endsWith(".local")
    ) {
      return false;
    }

    // 移除特定域名限制 - 让用户自主决定是否生成短链

    // 排除文件协议和其他特殊协议
    const invalidProtocols = [
      "file:",
      "ftp:",
      "chrome:",
      "chrome-extension:",
      "edge:",
      "about:",
      "moz-extension:",
      "data:",
      "javascript:",
      "mailto:",
      "tel:",
      "sms:",
    ];

    if (invalidProtocols.some((protocol) => url.startsWith(protocol))) {
      return false;
    }

    // 基本的域名格式检查
    if (!hostname.includes(".") || hostname.length < 3) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

// 短链服务配置
export const SHORT_URL_SERVICES = {
  isgd: {
    name: "is.gd",
    endpoint: "https://is.gd/create.php",
    method: "GET",
    params: (url) => ({ format: "simple", url: url }),
  },
  tinyurl: {
    name: "TinyURL",
    endpoint: "https://tinyurl.com/api-create.php",
    method: "GET",
    params: (url) => ({ url: url }),
  },
};

// 创建短链的共享函数（不带限流，用于需要自定义限流的场景）
export async function createShortUrlDirect(longUrl, service = "isgd") {
  const serviceConfig = SHORT_URL_SERVICES[service];
  if (!serviceConfig) {
    throw new Error(`Unknown short URL service: ${service}`);
  }

  try {
    const url = new URL(serviceConfig.endpoint);
    const params = serviceConfig.params(longUrl);

    // 添加参数到URL
    Object.keys(params).forEach((key) => {
      url.searchParams.append(key, params[key]);
    });

    const response = await fetch(url.toString(), {
      method: serviceConfig.method,
      headers: {
        "User-Agent": "Arclet Copier Chrome Extension",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const shortUrl = await response.text();

    // 验证返回的是否为有效URL
    if (
      !shortUrl.trim() ||
      shortUrl.includes("Error") ||
      !shortUrl.startsWith("http")
    ) {
      throw new Error(`Invalid short URL returned: ${shortUrl}`);
    }

    return shortUrl.trim();
  } catch (error) {
    console.debug(`Short URL creation failed for ${service}:`, error);
    throw error;
  }
}

// 创建短链的共享函数（带限流）
export async function createShortUrl(longUrl, service = "isgd") {
  return globalShortUrlThrottle.throttledRequest(() =>
    createShortUrlDirect(longUrl, service),
  );
}

// 导出限流器类和实例，供需要自定义限流的场景使用
export { ShortUrlThrottle, globalShortUrlThrottle };

// 模板字段定义
export const TEMPLATE_FIELDS = {
  // 基础字段
  url: {
    name: "URL",
    description: "当前页面URL（应用清理规则）",
    example: "https://example.com/page",
    category: "basic",
  },
  originalUrl: {
    name: "原始URL",
    description: "原始URL（不应用清理规则）",
    example: "https://example.com/page?utm_source=test",
    category: "basic",
  },
  title: {
    name: "页面标题",
    description: "当前页面的标题",
    example: "示例页面 - 网站名称",
    category: "basic",
  },
  hostname: {
    name: "主机名",
    description: "完整主机名（含子域名）",
    example: "www.example.com",
    category: "basic",
  },
  domain: {
    name: "域名",
    description: "纯域名（不含子域名）",
    example: "example.com",
    category: "basic",
  },
  shortUrl: {
    name: "短链接",
    description: "自动生成的短链接",
    example: "https://is.gd/abc123",
    category: "basic",
  },

  // 页面元数据字段
  author: {
    name: "作者",
    description: "页面作者（meta标签）",
    example: "John Doe",
    category: "metadata",
  },
  description: {
    name: "描述",
    description: "页面描述（meta标签）",
    example: "这是一个示例页面的描述信息",
    category: "metadata",
  },

  // 时间字段
  date: {
    name: "日期",
    description: "当前日期（本地时区）",
    example: "2024-01-15",
    category: "time",
  },
  time: {
    name: "时间",
    description: "当前时间（本地时区）",
    example: "14:30:25",
    category: "time",
  },
  datetime: {
    name: "日期时间",
    description: "完整的日期时间（本地时区）",
    example: "2024-01-15 14:30:25",
    category: "time",
  },
  timestamp: {
    name: "时间戳",
    description: "Unix时间戳（全球统一）",
    example: "1705315825",
    category: "time",
  },
  iso: {
    name: "ISO时间",
    description: "ISO格式时间（UTC时区）",
    example: "2024-01-15T14:30:25.000Z",
    category: "time",
  },
};

// 模板引擎 - 处理模板变量替换
export class TemplateEngine {
  constructor() {
    this.fieldProcessors = new Map();
    this.initializeFieldProcessors();
  }

  initializeFieldProcessors() {
    // 基础字段处理器（异步）
    this.fieldProcessors.set(
      "url",
      async (context) => await processUrl(context.url, context.urlCleaning),
    );
    this.fieldProcessors.set("originalUrl", (context) => context.url);
    this.fieldProcessors.set("title", (context) => context.title || "");
    this.fieldProcessors.set("hostname", (context) => {
      try {
        if (!context.url) {return "";}
        const url = new URL(context.url);
        return url.hostname; // 完整主机名，包含子域名，如 www.example.com
      } catch (error) {
        console.debug(
          "TemplateEngine: Invalid URL for hostname field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("domain", (context) => {
      try {
        if (!context.url) {return "";}
        const url = new URL(context.url);
        // 提取纯域名（去除子域名）
        const hostname = url.hostname;
        const parts = hostname.split(".");

        // 处理特殊情况：localhost, IP地址等
        if (parts.length <= 2 || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
          return hostname;
        }

        // 提取主域名（最后两个部分）
        // 例如：www.example.com -> example.com
        //      blog.sub.example.com -> example.com
        return parts.slice(-2).join(".");
      } catch (error) {
        console.debug(
          "TemplateEngine: Invalid URL for domain field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("shortUrl", (context) => context.shortUrl || "");

    // 页面元数据字段处理器
    this.fieldProcessors.set("author", (context) => context.author || "");
    this.fieldProcessors.set(
      "description",
      (context) => context.description || "",
    );

    // 时间字段处理器 - 修复：每次调用时获取当前时间
    this.fieldProcessors.set("date", () => {
      const now = new Date();
      return (
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0")
      );
    });

    this.fieldProcessors.set("time", () => {
      const now = new Date();
      return now.toTimeString().split(" ")[0];
    });

    this.fieldProcessors.set("datetime", () => {
      const now = new Date();
      return (
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0") +
        " " +
        String(now.getHours()).padStart(2, "0") +
        ":" +
        String(now.getMinutes()).padStart(2, "0") +
        ":" +
        String(now.getSeconds()).padStart(2, "0")
      );
    });

    this.fieldProcessors.set("timestamp", () => {
      const now = new Date();
      return Math.floor(now.getTime() / 1000).toString();
    });

    this.fieldProcessors.set("iso", () => {
      const now = new Date();
      return now.toISOString();
    });
  }

  // 处理模板，替换所有变量
  async processTemplate(template, context) {
    if (!template) {return "";}

    // 验证输入参数
    if (!context || typeof context !== "object") {
      console.debug(
        "TemplateEngine: Invalid context provided, using empty context",
      );
      context = {};
    }

    try {
      // 匹配 {{fieldName}} 模式
      const fieldPattern = /\{\{([^}]+)\}\}/g;

      // 首先找到所有需要替换的字段
      const matches = [...template.matchAll(fieldPattern)];
      let result = template;

      // 处理每个字段（支持异步）
      for (const match of matches) {
        try {
          const fieldName = match[1].trim();
          const processor = this.fieldProcessors.get(fieldName);

          if (processor) {
            const value = await processor(context);
            // 确保返回字符串类型
            const replacement = value != null ? String(value) : "";
            result = result.replace(match[0], replacement);
          }
        } catch (error) {
          console.debug(
            `TemplateEngine: Error processing field '${match[1]}':`,
            error,
          );
          // 出错时保持原样
        }
      }

      return result;
    } catch (error) {
      console.debug("TemplateEngine: Template processing failed:", error);
      return template; // 降级处理，返回原始模板
    }
  }

  // 验证模板语法
  validateTemplate(template) {
    if (!template)
      {return { valid: false, errors: ["Template is empty"], fields: [] };}

    if (typeof template !== "string") {
      return {
        valid: false,
        errors: ["Template must be a string"],
        fields: [],
      };
    }

    try {
      const fieldPattern = /\{\{([^}]+)\}\}/g;
      const matches = [...template.matchAll(fieldPattern)];
      const errors = [];
      const fields = [];

      for (const match of matches) {
        const fieldName = match[1].trim();

        // 检查字段名是否为空
        if (!fieldName) {
          errors.push("Empty field name found: {{}}");
          continue;
        }

        // 检查字段名是否包含无效字符
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
          errors.push(
            `Invalid field name: ${fieldName} (only letters, numbers, and underscores allowed)`,
          );
          continue;
        }

        // 只记录已知的字段，未知字段将作为普通文本处理
        if (this.fieldProcessors.has(fieldName)) {
          fields.push(fieldName);
        }
      }

      // 不再检查大括号匹配 - 用户可以在模板中使用 {{ 作为普通文本
      // 只有完整的 {{variable}} 格式才会被识别为变量

      return {
        valid: errors.length === 0,
        errors: errors,
        fields: [...new Set(fields)], // 去重
      };
    } catch (error) {
      console.debug("TemplateEngine: Template validation failed:", error);
      return {
        valid: false,
        errors: ["Template validation failed due to internal error"],
        fields: [],
      };
    }
  }

  // 获取模板中使用的字段
  getTemplateFields(template) {
    const fieldPattern = /\{\{([^}]+)\}\}/g;
    const fields = new Set();
    let match;

    while ((match = fieldPattern.exec(template)) !== null) {
      fields.add(match[1].trim());
    }

    return Array.from(fields);
  }
}

// 全局模板引擎实例
export const templateEngine = new TemplateEngine();

// 模板管理工具函数
export async function getCustomTemplates() {
  try {
    const result = await chrome.storage.sync.get(["customTemplates"]);
    return result.customTemplates || [];
  } catch (error) {
    console.debug("Failed to load custom templates:", error);
    return [];
  }
}

export async function saveCustomTemplates(templates) {
  try {
    await chrome.storage.sync.set({ customTemplates: templates });
    return true;
  } catch (error) {
    console.debug("Failed to save custom templates:", error);
    return false;
  }
}

export async function getAllTemplates() {
  const customTemplates = await getCustomTemplates();

  // 只返回用户自定义的模板
  return customTemplates;
}

export function generateTemplateId() {
  return "custom_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

export function createTemplate(name, template, icon = "📝") {
  return {
    id: generateTemplateId(),
    name: name.trim(),
    template: template.trim(),
    icon: icon,
    isPreset: false,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0,
    description: "",
  };
}

// 模板变更通知机制
export class TemplateChangeNotifier {
  static async notify(changeType, templateId = null) {
    try {
      // 发送消息到所有扩展页面
      await chrome.runtime.sendMessage({
        type: "TEMPLATE_CHANGED",
        changeType, // 'created', 'updated', 'deleted'
        templateId,
        timestamp: Date.now(),
      });
      console.log(`Template change notified: ${changeType}`, templateId);
    } catch (error) {
      // 忽略无接收者的错误（正常情况，因为不是所有页面都在监听）
      if (!error.message?.includes("Could not establish connection")) {
        console.debug("Failed to notify template change:", error);
      }
    }
  }
}

// 通用模板加载函数 - 解决代码重复问题
export async function loadTemplatesIntoSelect(selectElement, options = {}) {
  if (!selectElement) {
    console.debug("loadTemplatesIntoSelect: selectElement is null");
    return;
  }

  const { includeIcons = true, clearExisting = true, onError = null } = options;

  try {
    const customTemplates = await getAllTemplates();

    if (clearExisting) {
      // 清除之前添加的自定义模板选项
      const existingCustomOptions = selectElement.querySelectorAll(
        "[data-custom-template]",
      );
      existingCustomOptions.forEach((option) => option.remove());
    }

    // 为每个自定义模板添加选项
    customTemplates.forEach((template) => {
      const option = document.createElement("option");
      option.value = `custom:${template.id}`;
      option.textContent = includeIcons
        ? `${template.icon} ${template.name}`
        : template.name;
      option.setAttribute("data-custom-template", "true");
      option.setAttribute("data-template-id", template.id);
      selectElement.appendChild(option);
    });

    console.log(
      `Loaded ${customTemplates.length} custom templates into select`,
    );
  } catch (error) {
    console.debug("Failed to load custom templates:", error);
    if (onError) {
      onError(error);
    }
  }
}

// 验证并修正选择器状态 - 统一的模板验证和回退函数
export async function validateAndFixSelector(
  selectElement,
  currentValue,
  settingKey,
  saveFunction,
) {
  if (!selectElement) {
    console.debug("validateAndFixSelector: selectElement is null");
    return false;
  }

  // 等待 DOM 更新完成
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    // 检查当前值是否在选项中存在
    const optionExists = Array.from(selectElement.options).some(
      (option) => option.value === currentValue,
    );

    if (optionExists) {
      // 如果选项存在，设置值
      selectElement.value = currentValue;
      console.log(`Template selector validated: ${currentValue}`);
      return true;
    }

    // 选项不存在，需要回退到默认值（静默处理，因为已有兜底）
    console.log(
      `[Template] Value "${currentValue}" not available, using default format`,
    );

    // 查找 "url" 选项
    const urlOption = Array.from(selectElement.options).find(
      (option) => option.value === "url",
    );

    if (urlOption) {
      // 设置为 url
      selectElement.value = "url";

      // 触发 change 事件通知 UI
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));

      // 保存回退值到设置
      if (saveFunction && settingKey) {
        try {
          await saveFunction({ [settingKey]: "url" });
          console.log(`[Template] Fallback saved: ${settingKey} = url`);
        } catch (saveError) {
          console.log("[Template] Failed to save fallback setting:", saveError);
        }
      }

      return false; // 返回 false 表示已回退
    }

    // 如果连 url 选项都没有，设置为第一个选项
    if (selectElement.options.length > 0) {
      selectElement.selectedIndex = 0;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));

      if (saveFunction && settingKey) {
        try {
          await saveFunction({ [settingKey]: selectElement.value });
          console.log(
            `[Template] Fallback to first option: ${selectElement.value}`,
          );
        } catch (saveError) {
          console.log("[Template] Failed to save fallback setting:", saveError);
        }
      }

      return false;
    }

    // 极端情况：没有任何选项
    console.log("[Template] No options available in selector");
    return false;
  } catch (error) {
    console.debug("Error in validateAndFixSelector:", error);
    return false;
  }
}

// 标准化的模板查找和错误处理
export async function findTemplateById(templateId) {
  try {
    if (!templateId) {
      console.debug("Template ID is required");
      return null;
    }

    const customTemplates = await getAllTemplates();
    const template = customTemplates.find((t) => t.id === templateId);

    if (!template) {
      console.debug(`Template not found: ${templateId}`);
      return null;
    }

    return template;
  } catch (error) {
    console.debug("Failed to find template:", error);
    return null;
  }
}

// 标准化的模板处理错误处理
export async function processTemplateWithFallback(
  templateId,
  context,
  fallbackContent = null,
) {
  try {
    const template = await findTemplateById(templateId);

    // 如果模板不存在（被删除），使用fallback
    if (!template) {
      console.debug(`Template ${templateId} not found, using fallback`);
      const fallback =
        fallbackContent ||
        (context.url ? await processUrl(context.url, context.urlCleaning) : "");

      return {
        success: false,
        content: fallback,
        error: `Template not found: ${templateId}`,
        templateName: null,
      };
    }

    // 如果模板包含shortUrl字段，确保上下文中有shortUrl
    if (template.template.includes("{{shortUrl}}") && !context.shortUrl) {
      console.debug(
        "Template requires shortUrl but context does not provide it",
      );
      // 可以选择生成shortUrl或者使用原URL作为fallback
      context.shortUrl = context.url
        ? await processUrl(context.url, context.urlCleaning)
        : "";
    }

    const result = await templateEngine.processTemplate(
      template.template,
      context,
    );

    return {
      success: true,
      content: result,
      templateName: template.name,
    };
  } catch (error) {
    console.debug("Template processing failed:", error);

    // 使用fallback内容
    const fallback =
      fallbackContent ||
      (context.url ? await processUrl(context.url, context.urlCleaning) : "");

    return {
      success: false,
      content: fallback,
      error: error.message,
      templateName: null,
    };
  }
}

// i18n helper function
export function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions);
}

// 统一的短链缓存辅助函数 - 确保缓存一致性
// 注意：这些函数需要在调用方传入 cache 实例以避免循环导入

/**
 * 统一的短链缓存获取函数 - 确保在所有地方使用一致的缓存逻辑
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @returns {Promise<string|null>} 缓存的短链或null
 */
export async function getCachedShortUrl(originalUrl, cleaningMode, service) {
  try {
    // 参数验证
    if (!originalUrl || !cleaningMode || !service) {
      console.debug("[CacheHelper] Invalid parameters for getCachedShortUrl");
      return null;
    }

    // 先清理URL，确保缓存键的一致性
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // 从缓存获取
    return await shortUrlCache.get(cleanedUrl, service);
  } catch (error) {
    console.debug("[CacheHelper] Failed to get cached short URL:", error);
    return null;
  }
}

/**
 * 统一的短链缓存设置函数 - 确保在所有地方使用一致的缓存逻辑
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @param {string} shortUrl - 生成的短链
 * @returns {Promise<boolean>} 保存是否成功
 */
export async function setCachedShortUrl(
  originalUrl,
  cleaningMode,
  service,
  shortUrl,
) {
  try {
    // 参数验证
    if (!originalUrl || !cleaningMode || !service || !shortUrl) {
      console.debug("[CacheHelper] Invalid parameters for setCachedShortUrl");
      return false;
    }

    // 先清理URL，确保缓存键的一致性
    const cleanedUrl = await processUrl(originalUrl, cleaningMode);

    // 保存到缓存
    return await shortUrlCache.set(cleanedUrl, service, shortUrl);
  } catch (error) {
    console.debug("[CacheHelper] Failed to set cached short URL:", error);
    return false;
  }
}

/**
 * 智能短链获取函数 - 优先从缓存获取，缓存未命中时生成新的短链
 * @param {string} originalUrl - 原始URL
 * @param {string} cleaningMode - URL清理模式
 * @param {string} service - 短链服务
 * @returns {Promise<string>} 短链URL
 */
export async function getOrGenerateShortUrl(
  originalUrl,
  cleaningMode,
  service,
) {
  try {
    // 参数验证
    if (!originalUrl || !cleaningMode || !service) {
      throw new Error("Invalid parameters for getOrGenerateShortUrl");
    }

    // 验证URL是否适合生成短链
    if (!isValidWebUrl(originalUrl)) {
      throw new Error("URL is not suitable for shortening");
    }

    // 先尝试从缓存获取
    const cachedUrl = await getCachedShortUrl(
      originalUrl,
      cleaningMode,
      service,
    );
    if (cachedUrl) {
      console.log("[CacheHelper] Using cached short URL:", cachedUrl);
      return cachedUrl;
    }

    // 缓存未命中，生成新的短链
    console.log("[CacheHelper] Cache miss, generating new short URL");
    const shortUrl = await createShortUrl(originalUrl, service);

    // 保存到缓存
    await setCachedShortUrl(originalUrl, cleaningMode, service, shortUrl);

    return shortUrl;
  } catch (error) {
    console.debug("[CacheHelper] Failed to get or generate short URL:", error);

    // 降级处理：返回清理后的原始URL
    try {
      const cleanedUrl = await processUrl(originalUrl, cleaningMode);
      console.log("[CacheHelper] Falling back to cleaned URL:", cleanedUrl);
      return cleanedUrl;
    } catch (fallbackError) {
      console.debug("[CacheHelper] Fallback also failed:", fallbackError);
      return originalUrl;
    }
  }
}
