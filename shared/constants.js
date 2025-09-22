// Shared constants for Arclet Copier

// 短链请求限流器
class ShortUrlThrottle {
  constructor() {
    this.concurrentLimit = 3; // 同时最多3个请求
    this.requestQueue = [];
    this.activeRequests = 0;
    this.requestDelay = 200; // 请求间隔200ms
    this.lastRequestTime = 0;
  }

  async throttledRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (
      this.activeRequests >= this.concurrentLimit ||
      this.requestQueue.length === 0
    ) {
      return;
    }

    const { requestFn, resolve, reject } = this.requestQueue.shift();
    this.activeRequests++;

    try {
      // 确保请求间隔
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.requestDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.requestDelay - timeSinceLastRequest),
        );
      }

      this.lastRequestTime = Date.now();
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // 继续处理队列
      setTimeout(() => this.processQueue(), 10);
    }
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

// 判断参数是否应该保留的共享函数
export function shouldKeepParameter(paramName, cleaningMode) {
  const lowerParam = paramName.toLowerCase();

  // 功能性参数总是保留
  if (PARAM_CATEGORIES.FUNCTIONAL.includes(lowerParam)) {
    return true;
  }

  // 跟踪参数的处理
  if (PARAM_CATEGORIES.TRACKING.includes(lowerParam)) {
    return false; // 跟踪参数总是移除
  }

  // 根据清理模式处理其他参数
  switch (cleaningMode) {
    case "off":
      return true; // 不清理，保留所有参数
    case "smart":
      return true; // 智能清理，保留未知参数（安全第一）
    case "aggressive":
      return false; // 激进清理，移除所有非功能性参数
    default:
      return true;
  }
}

// 智能处理URL参数的共享函数
export function processUrl(url, cleaningMode = "smart") {
  if (!url || cleaningMode === "off") {
    return url;
  }

  try {
    const urlObj = new URL(url);

    // 激进模式：移除所有查询参数（保持向后兼容）
    if (cleaningMode === "aggressive") {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }

    // 智能模式：只移除跟踪参数
    if (cleaningMode === "smart") {
      const params = new URLSearchParams(urlObj.search);
      const newParams = new URLSearchParams();

      for (const [key, value] of params.entries()) {
        if (shouldKeepParameter(key, cleaningMode)) {
          newParams.append(key, value);
        }
      }

      urlObj.search = newParams.toString();
      return urlObj.toString();
    }

    return url;
  } catch (error) {
    return url;
  }
}

// 检查是否为特殊页面的共享函数
export function isRestrictedPage(url) {
  if (!url) return true;

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
  if (!url) return false;

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
    console.error(`Short URL creation failed for ${service}:`, error);
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
    name: "域名",
    description: "网站域名",
    example: "example.com",
    category: "basic",
  },
  domain: {
    name: "完整域名",
    description: "包含协议的完整域名",
    example: "https://example.com",
    category: "basic",
  },
  shortUrl: {
    name: "短链接",
    description: "自动生成的短链接",
    example: "https://is.gd/abc123",
    category: "basic",
  },

  // 时间字段
  date: {
    name: "日期",
    description: "当前日期",
    example: "2024-01-15",
    category: "time",
  },
  time: {
    name: "时间",
    description: "当前时间",
    example: "14:30:25",
    category: "time",
  },
  datetime: {
    name: "日期时间",
    description: "完整的日期时间",
    example: "2024-01-15 14:30:25",
    category: "time",
  },
  timestamp: {
    name: "时间戳",
    description: "Unix时间戳",
    example: "1705315825",
    category: "time",
  },
  iso: {
    name: "ISO时间",
    description: "ISO格式的时间",
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
    // 基础字段处理器
    this.fieldProcessors.set("url", (context) =>
      processUrl(context.url, context.urlCleaning),
    );
    this.fieldProcessors.set("originalUrl", (context) => context.url);
    this.fieldProcessors.set("title", (context) => context.title || "");
    this.fieldProcessors.set("hostname", (context) => {
      try {
        if (!context.url) return "";
        return new URL(context.url).hostname;
      } catch (error) {
        console.warn(
          "TemplateEngine: Invalid URL for hostname field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("domain", (context) => {
      try {
        if (!context.url) return "";
        const url = new URL(context.url);
        return `${url.protocol}//${url.host}`;
      } catch (error) {
        console.warn(
          "TemplateEngine: Invalid URL for domain field:",
          context.url,
        );
        return "";
      }
    });
    this.fieldProcessors.set("shortUrl", (context) => context.shortUrl || "");

    // 时间字段处理器 - 修复：每次调用时获取当前时间
    this.fieldProcessors.set("date", () => {
      const now = new Date();
      return now.toISOString().split("T")[0];
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
    if (!template) return "";

    // 验证输入参数
    if (!context || typeof context !== "object") {
      console.warn(
        "TemplateEngine: Invalid context provided, using empty context",
      );
      context = {};
    }

    try {
      // 匹配 {{fieldName}} 模式
      const fieldPattern = /\{\{([^}]+)\}\}/g;

      return template.replace(fieldPattern, (match, fieldName) => {
        try {
          const trimmedFieldName = fieldName.trim();
          const processor = this.fieldProcessors.get(trimmedFieldName);

          if (processor) {
            const result = processor(context);
            // 确保返回字符串类型
            return result != null ? String(result) : "";
          } else {
            console.warn(
              `TemplateEngine: Unknown field '${trimmedFieldName}' in template`,
            );
            return match; // 未知字段保持原样
          }
        } catch (error) {
          console.error(
            `TemplateEngine: Error processing field '${fieldName}':`,
            error,
          );
          return match; // 出错时返回原始匹配
        }
      });
    } catch (error) {
      console.error("TemplateEngine: Template processing failed:", error);
      return template; // 降级处理，返回原始模板
    }
  }

  // 验证模板语法
  validateTemplate(template) {
    if (!template)
      return { valid: false, errors: ["Template is empty"], fields: [] };

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

        // 检查字段是否存在
        if (!this.fieldProcessors.has(fieldName)) {
          errors.push(`Unknown field: ${fieldName}`);
          continue;
        }

        fields.push(fieldName);
      }

      // 检查是否有未闭合的大括号
      const openBraces = (template.match(/\{\{/g) || []).length;
      const closeBraces = (template.match(/\}\}/g) || []).length;
      if (openBraces !== closeBraces) {
        errors.push("Unmatched braces in template");
      }

      return {
        valid: errors.length === 0,
        errors: errors,
        fields: [...new Set(fields)], // 去重
      };
    } catch (error) {
      console.error("TemplateEngine: Template validation failed:", error);
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
    console.error("Failed to load custom templates:", error);
    return [];
  }
}

export async function saveCustomTemplates(templates) {
  try {
    await chrome.storage.sync.set({ customTemplates: templates });
    return true;
  } catch (error) {
    console.error("Failed to save custom templates:", error);
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
        console.error("Failed to notify template change:", error);
      }
    }
  }
}

// 通用模板加载函数 - 解决代码重复问题
export async function loadTemplatesIntoSelect(selectElement, options = {}) {
  if (!selectElement) {
    console.warn("loadTemplatesIntoSelect: selectElement is null");
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
    console.error("Failed to load custom templates:", error);
    if (onError) {
      onError(error);
    }
  }
}

// 标准化的模板查找和错误处理
export async function findTemplateById(templateId) {
  try {
    if (!templateId) {
      throw new Error("Template ID is required");
    }

    const customTemplates = await getAllTemplates();
    const template = customTemplates.find((t) => t.id === templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return template;
  } catch (error) {
    console.error("Failed to find template:", error);
    throw error; // 重新抛出，让调用者处理
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

    // 如果模板包含shortUrl字段，确保上下文中有shortUrl
    if (template.template.includes("{{shortUrl}}") && !context.shortUrl) {
      console.warn(
        "Template requires shortUrl but context does not provide it",
      );
      // 可以选择生成shortUrl或者使用原URL作为fallback
      context.shortUrl = context.url
        ? processUrl(context.url, context.urlCleaning)
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
    console.error("Template processing failed:", error);

    // 使用fallback内容
    const fallback =
      fallbackContent ||
      (context.url ? processUrl(context.url, context.urlCleaning) : "");

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
