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

// i18n helper function
export function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions);
}
