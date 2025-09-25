// Background script for handling keyboard shortcuts and URL copying

import {
  processUrl,
  getMessage,
  createShortUrl,
  isValidWebUrl,
  getAllTemplates,
  templateEngine,
  processTemplateWithFallback,
} from "../shared/constants.js";

// 导入分析模块
import { trackInstall, trackCopy } from "../shared/analytics.js";

// Constants
const EXTENSION_NAME = chrome.i18n.getMessage("extName");

// 防抖工具和状态管理
const debounceMap = new Map();
const copyOperationStates = {
  copyUrl: false,
  contextMenuCopy: false,
};

function debounce(key, fn, delay = 500) {
  if (debounceMap.has(key)) {
    clearTimeout(debounceMap.get(key));
  }

  const timeoutId = setTimeout(() => {
    debounceMap.delete(key);
    fn();
  }, delay);

  debounceMap.set(key, timeoutId);
}

// 持久化短链缓存管理（与popup.js中的实现保持一致）
class PersistentShortUrlCache {
  constructor() {
    this.storageKey = "arclet_shorturl_cache";
    this.maxSize = 100; // 最大缓存数量
    this.ttl = 24 * 60 * 60 * 1000; // 24小时过期
  }

  getKey(url, service, cleaningMode) {
    const processedUrl = processUrl(url, cleaningMode);
    return `${service}:${processedUrl}`;
  }

  async get(url, service, cleaningMode) {
    try {
      const key = this.getKey(url, service, cleaningMode);
      const result = await chrome.storage.local.get([this.storageKey]);
      const cache = result[this.storageKey] || {};
      const item = cache[key];

      if (item && Date.now() - item.timestamp < this.ttl) {
        console.log("使用持久化缓存 (background):", item.shortUrl);
        return item.shortUrl;
      }

      // 清理过期项
      if (item) {
        delete cache[key];
        await chrome.storage.local.set({ [this.storageKey]: cache });
      }

      return null;
    } catch (error) {
      console.error("缓存读取失败:", error);
      return null;
    }
  }

  async set(url, service, cleaningMode, shortUrl) {
    try {
      const key = this.getKey(url, service, cleaningMode);
      const result = await chrome.storage.local.get([this.storageKey]);
      let cache = result[this.storageKey] || {};

      // LRU清理
      const keys = Object.keys(cache);
      if (keys.length >= this.maxSize) {
        // 删除最旧的项
        const oldestKey = keys.reduce((oldest, current) =>
          cache[current].timestamp < cache[oldest].timestamp ? current : oldest,
        );
        delete cache[oldestKey];
      }

      cache[key] = {
        shortUrl,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({ [this.storageKey]: cache });
      console.log("短链已持久化缓存 (background):", shortUrl);
    } catch (error) {
      console.error("缓存保存失败:", error);
    }
  }
}

// 创建持久化短链缓存实例
const shortUrlCache = new PersistentShortUrlCache();

// 创建右键菜单和处理扩展安装
chrome.runtime.onInstalled.addListener(async (details) => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "copy-current-url",
    title: chrome.i18n.getMessage("copyCurrentUrl") || "复制当前 URL",
    contexts: [
      "page",
      "frame",
      "selection",
      "link",
      "editable",
      "image",
      "video",
      "audio",
    ],
  });

  // 处理扩展安装统计（包含安装和更新）
  try {
    if (details.reason === "install") {
      await trackInstall("install");
    } else if (details.reason === "update") {
      await trackInstall("update");
    }
  } catch (error) {
    console.warn("Failed to track extension installation:", error);
    // 不阻止扩展正常运行
  }
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "copy-current-url") {
    debounce("contextMenuCopy", () => handleCopyUrl(), 300);
  }
});

// 监听键盘快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    debounce("shortcutCopy", () => handleCopyUrl(), 500);
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "copyFromPopup") {
    copyToClipboard(message.text)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Popup copy failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // 表示会异步发送响应
  } else if (message.action === "createShortUrl") {
    handleCreateShortUrl(message.url, message.service)
      .then((shortUrl) => sendResponse({ success: true, shortUrl }))
      .catch((error) => {
        console.error("Short URL creation failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // 表示会异步发送响应
  }
});

// 获取当前活动标签页
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.url) {
    throw new Error(getMessage("noUrl"));
  }

  return tab;
}

// 获取用户设置
async function getUserSettings() {
  const settings = await chrome.storage.sync.get([
    "removeParams",
    "urlCleaning",
    "silentCopyFormat",
    "chromeNotifications",
    "shortUrlService",
  ]);

  const cleaningMode = settings.urlCleaning || "off";

  return {
    urlCleaning: cleaningMode,
    silentCopyFormat: settings.silentCopyFormat || "url",
    chromeNotifications: settings.chromeNotifications !== false,
    shortUrlService: settings.shortUrlService || "isgd",
  };
}

// 获取页面标题
async function getPageTitle(tabId, url) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || new URL(url).hostname || "";
  } catch (error) {
    console.error("获取页面标题失败:", error);
    // 如果获取tab失败，尝试从URL生成标题
    try {
      return new URL(url).hostname || "";
    } catch (urlError) {
      return "";
    }
  }
}

// 创建 markdown 链接格式
function createMarkdownLink(url, title, cleaningMode) {
  const processedUrl = processUrl(url, cleaningMode);
  const linkTitle = title || new URL(url).hostname;
  return `[${linkTitle}](${processedUrl})`;
}

// 处理短链生成
async function handleCreateShortUrl(longUrl, service) {
  try {
    // 验证URL是否适合生成短链
    if (!isValidWebUrl(longUrl)) {
      throw new Error(
        getMessage("invalidUrlForShortening") ||
          "URL is not suitable for shortening",
      );
    }

    const settings = await getUserSettings();
    const serviceToUse = service || settings.shortUrlService;

    // 首先检查缓存
    const cachedShortUrl = await shortUrlCache.get(
      longUrl,
      serviceToUse,
      settings.urlCleaning,
    );
    if (cachedShortUrl) {
      console.log("使用缓存的短链 (background):", cachedShortUrl);
      return cachedShortUrl;
    }

    // 应用URL清理规则
    const cleanedUrl = processUrl(longUrl, settings.urlCleaning);

    // 再次验证清理后的URL
    if (!isValidWebUrl(cleanedUrl)) {
      throw new Error(
        getMessage("invalidUrlForShortening") ||
          "Cleaned URL is not suitable for shortening",
      );
    }

    // 生成短链
    const shortUrl = await createShortUrl(cleanedUrl, serviceToUse);

    // 将新生成的短链保存到缓存
    await shortUrlCache.set(
      longUrl,
      serviceToUse,
      settings.urlCleaning,
      shortUrl,
    );
    console.log(`Short URL created and cached (background): ${shortUrl}`);

    return shortUrl;
  } catch (error) {
    console.error("Failed to create short URL:", error);
    throw error;
  }
}

// 处理URL复制功能
async function handleCopyUrl() {
  // 防止重复执行
  if (copyOperationStates.copyUrl) {
    return;
  }

  copyOperationStates.copyUrl = true;
  let settings;
  const startTime = Date.now();

  try {
    const tab = await getCurrentTab();
    settings = await getUserSettings();

    let contentToCopy;
    let successMessage;
    let copyFormat;
    let templateId = null;
    let templateName = null;

    // 检查是否是自定义模板
    if (settings.silentCopyFormat.startsWith("custom:")) {
      templateId = settings.silentCopyFormat.substring(7); // 移除 'custom:' 前缀
      copyFormat = "custom";

      try {
        const title = await getPageTitle(tab.id, tab.url);
        const context = {
          url: tab.url,
          title: title || "",
          urlCleaning: settings.urlCleaning,
          shortUrl: "",
        };

        // 检查模板是否需要短链并生成
        const template = await getAllTemplates().then((templates) =>
          templates.find((t) => t.id === templateId),
        );

        if (template) {
          templateName = template.name;
          if (template.template.includes("{{shortUrl}}")) {
            try {
              const shortUrl = await handleCreateShortUrl(
                tab.url,
                settings.shortUrlService,
              );
              context.shortUrl = shortUrl;
            } catch (error) {
              console.error("Error generating short URL for template:", error);
              context.shortUrl = processUrl(tab.url, settings.urlCleaning);
            }
          }
        }

        // 使用标准化处理函数
        const result = await processTemplateWithFallback(
          templateId,
          context,
          processUrl(tab.url, settings.urlCleaning),
        );

        contentToCopy = result.content;
        successMessage = result.success
          ? getMessage("customTemplateCopied") ||
            `${result.templateName} copied`
          : getMessage("urlCopied");
      } catch (error) {
        console.error("Error processing custom template:", error);
        // 回退到URL复制
        contentToCopy = processUrl(tab.url, settings.urlCleaning);
        successMessage = getMessage("urlCopied");
        copyFormat = "url"; // 修正格式类型
      }
    } else if (settings.silentCopyFormat === "markdown") {
      copyFormat = "markdown";
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = createMarkdownLink(tab.url, title, settings.urlCleaning);
      successMessage = getMessage("markdownLinkCopied");
    } else if (settings.silentCopyFormat === "shortUrl") {
      copyFormat = "shortUrl";
      // 验证URL是否适合生成短链
      if (!isValidWebUrl(tab.url)) {
        throw new Error(
          getMessage("invalidUrlForShortening") ||
            "URL is not suitable for shortening",
        );
      }
      // 生成短链
      const shortUrl = await handleCreateShortUrl(
        tab.url,
        settings.shortUrlService,
      );
      contentToCopy = shortUrl;
      successMessage = getMessage("shortUrlCopied");
    } else {
      copyFormat = "url";
      // 默认复制 URL
      contentToCopy = processUrl(tab.url, settings.urlCleaning);
      successMessage = getMessage("urlCopied");
    }

    await copyToClipboard(contentToCopy);

    // 记录成功的复制事件
    const duration = Date.now() - startTime;
    const trackData = {
      format: copyFormat,
      source: "shortcut",
      success: true,
      templateId,
      templateName,
      urlCleaning: settings.urlCleaning,
      duration,
    };

    // 只在使用短链时添加 shortService
    if (copyFormat === "shortUrl") {
      trackData.shortService = settings.shortUrlService;
    }

    trackCopy(trackData).catch((error) => {
      console.warn("Failed to track copy event:", error);
    });

    if (settings.chromeNotifications) {
      showNotification(EXTENSION_NAME, successMessage);
    }
  } catch (error) {
    // 如果settings未获取到，尝试重新获取或使用默认设置
    if (!settings) {
      try {
        settings = await getUserSettings();
      } catch (settingsError) {
        console.error("获取设置失败:", settingsError);
        // 使用默认设置
        settings = { chromeNotifications: true, silentCopyFormat: "url" };
      }
    }

    let message;
    let isUserValidationError = false;

    if (error.message === getMessage("noUrl")) {
      message = getMessage("noUrl");
    } else if (settings.silentCopyFormat === "shortUrl") {
      // 根据错误类型选择更具体的消息
      if (
        error.message.includes(getMessage("invalidUrlForShortening")) ||
        error.message.includes("URL is not suitable for shortening")
      ) {
        message = getMessage("invalidUrlForShortening");
        isUserValidationError = true; // 这是用户输入验证错误，不是系统错误
      } else {
        message = getMessage("shortUrlFailed");
      }
    } else {
      message = getMessage("copyFailed");
    }

    // 只有非用户验证错误才打印错误日志
    if (!isUserValidationError) {
      console.error("复制 URL 失败:", error);
    }

    // 记录失败的复制事件
    const duration = Date.now() - startTime;
    const errorType = isUserValidationError ? "validation" : "system";
    const failedFormat = settings.silentCopyFormat || "url";

    const trackData = {
      format: failedFormat,
      source: "shortcut",
      success: false,
      urlCleaning: settings.urlCleaning,
      duration,
      errorType,
      errorMessage: error.message,
    };

    // 只在尝试使用短链时添加 shortService
    if (failedFormat === "shortUrl") {
      trackData.shortService = settings.shortUrlService;
    }

    trackCopy(trackData).catch((trackError) => {
      console.warn("Failed to track failed copy event:", trackError);
    });

    if (settings.chromeNotifications) {
      showNotification(EXTENSION_NAME, message);
    }
  } finally {
    // 重置状态
    setTimeout(() => {
      copyOperationStates.copyUrl = false;
    }, 500);
  }
}

// 复制到剪贴板 - 使用 offscreen document
async function copyToClipboard(text) {
  try {
    // 确保 offscreen document 存在
    await ensureOffscreenDocument();

    // 向 offscreen document 发送复制消息
    const response = await chrome.runtime.sendMessage({
      action: "copy",
      text: text,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Offscreen copy failed");
    }

    console.log("Offscreen copy successful");
  } catch (error) {
    console.error("复制失败:", error);
    throw new Error("复制操作失败");
  }
}

// 确保 offscreen document 存在
async function ensureOffscreenDocument() {
  try {
    // 检查是否已存在 offscreen document
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (existingContexts.length === 0) {
      // 创建 offscreen document
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen/offscreen.html"),
        reasons: ["CLIPBOARD"],
        justification: "复制文本到剪贴板",
      });
      console.log("Offscreen document created");
    }
  } catch (error) {
    console.error("Failed to create offscreen document:", error);
    throw error;
  }
}

// 显示通知
function showNotification(title, message) {
  const notificationOptions = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
    title,
    message,
  };

  chrome.notifications.create(notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error(
        "通知创建失败:",
        chrome.runtime.lastError.message || chrome.runtime.lastError,
      );
    } else {
      console.log("通知创建成功:", notificationId);
    }
  });
}
