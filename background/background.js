// Background script for handling keyboard shortcuts and URL copying

import {
  processUrl,
  getMessage,
  createShortUrl,
  isValidWebUrl,
  getAllTemplates,
  templateEngine,
  processTemplateWithFallback,
  initializeParamRules,
} from "../shared/constants.js";

// 导入分析模块
import { trackInstall, trackCopy } from "../shared/analytics.js";
import settingsManager from "../shared/settings-manager.js";
import notificationHelper from "../shared/notification-helper.js";
import shortUrlCache from "../shared/short-url-cache.js";

// 防抖工具和状态管理
const debounceMap = new Map();
const copyOperationStates = {
  copyUrl: false,
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

// 创建右键菜单和处理扩展安装
chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化参数规则（首次使用时设置默认配置）
  await initializeParamRules();

  // 创建右键菜单 - 同步操作，优先执行
  chrome.contextMenus.create({
    id: "copy-current-url",
    title: chrome.i18n.getMessage("copyUrlShortcut") || "静默复制",
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

  // 处理扩展安装统计 - 异步执行，不阻塞初始化
  if (details.reason === "install" || details.reason === "update") {
    // 使用 setTimeout 确保不阻塞扩展启动
    setTimeout(async () => {
      try {
        await trackInstall(details.reason);
      } catch (error) {
        console.debug("Failed to track extension installation:", error);
        // 不阻止扩展正常运行
      }
    }, 0);
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
        console.debug("Popup copy failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // 表示会异步发送响应
  } else if (message.action === "createShortUrl") {
    handleCreateShortUrl(message.url, message.service)
      .then((shortUrl) => {
        // 验证返回的短链有效性
        if (shortUrl && typeof shortUrl === "string" && shortUrl.trim()) {
          console.log("Short URL created successfully:", shortUrl);
          sendResponse({ success: true, shortUrl: shortUrl.trim() });
        } else {
          console.debug("Invalid short URL returned:", shortUrl);
          sendResponse({
            success: false,
            error: "Invalid short URL generated",
          });
        }
      })
      .catch((error) => {
        console.debug("Short URL creation failed:", error);
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

// 获取用户设置 - 使用统一的设置管理器
async function getUserSettings() {
  const settings = await settingsManager.getAllSettings();

  return {
    urlCleaning: settings.urlCleaning,
    silentCopyFormat: settings.silentCopyFormat,
    chromeNotifications: settings.chromeNotifications,
    shortUrlService: settings.shortUrlService,
  };
}

// 获取页面标题
async function getPageTitle(tabId, url) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || new URL(url).hostname || "";
  } catch (error) {
    console.debug("获取页面标题失败:", error);
    // 如果获取tab失败，尝试从URL生成标题
    try {
      return new URL(url).hostname || "";
    } catch (urlError) {
      return "";
    }
  }
}

// 获取页面元数据（author 和 description）
async function getPageMetadata(tabId) {
  try {
    // 向 content script 发送消息获取元数据
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "GET_PAGE_METADATA",
    });

    if (response && response.success) {
      return response.metadata || { author: "", description: "" };
    } else {
      console.log("Failed to get metadata from content script");
      return { author: "", description: "" };
    }
  } catch (error) {
    // 如果 content script 未加载或页面不支持，返回空值
    console.log("Could not get page metadata:", error.message);
    return { author: "", description: "" };
  }
}

// 创建 markdown 链接格式
async function createMarkdownLink(url, title, cleaningMode) {
  const processedUrl = await processUrl(url, cleaningMode);
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

    // 修复: 先应用URL清理规则,再检查缓存
    const cleanedUrl = await processUrl(longUrl, settings.urlCleaning);

    // 验证清理后的URL
    if (!isValidWebUrl(cleanedUrl)) {
      throw new Error(
        getMessage("invalidUrlForShortening") ||
          "Cleaned URL is not suitable for shortening",
      );
    }

    // 修复: 使用清理后的URL检查缓存
    const cachedShortUrl = await shortUrlCache.get(cleanedUrl, serviceToUse);
    if (cachedShortUrl) {
      console.log("[Background] 使用缓存的短链:", cachedShortUrl);
      return cachedShortUrl;
    }

    // 生成短链
    const shortUrl = await createShortUrl(cleanedUrl, serviceToUse);

    // 修复: 使用清理后的URL保存到缓存
    await shortUrlCache.set(cleanedUrl, serviceToUse, shortUrl);
    console.log(`[Background] Short URL created and cached: ${shortUrl}`);

    return shortUrl;
  } catch (error) {
    console.debug("[Background] Failed to create short URL:", error);
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
        const metadata = await getPageMetadata(tab.id);

        const context = {
          url: tab.url,
          title: title || "",
          urlCleaning: settings.urlCleaning,
          shortUrl: "",
          author: metadata.author || "",
          description: metadata.description || "",
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
              console.debug("Error generating short URL for template:", error);
              context.shortUrl = await processUrl(
                tab.url,
                settings.urlCleaning,
              );
            }
          }
        }

        // 使用标准化处理函数
        const result = await processTemplateWithFallback(
          templateId,
          context,
          await processUrl(tab.url, settings.urlCleaning),
        );

        contentToCopy = result.content;
        successMessage = result.success
          ? getMessage("customTemplateCopied") ||
            `${result.templateName} copied`
          : getMessage("urlCopied");
      } catch (error) {
        console.debug("Error processing custom template:", error);
        // 回退到URL复制
        contentToCopy = await processUrl(tab.url, settings.urlCleaning);
        successMessage = getMessage("urlCopied");
        copyFormat = "url"; // 修正格式类型
      }
    } else if (settings.silentCopyFormat === "markdown") {
      copyFormat = "markdown";
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url);
      contentToCopy = await createMarkdownLink(
        tab.url,
        title,
        settings.urlCleaning,
      );
      successMessage = getMessage("markdownCopied");
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
      contentToCopy = await processUrl(tab.url, settings.urlCleaning);
      successMessage = getMessage("urlCopied");
    }

    await copyToClipboard(contentToCopy);

    // 记录成功的复制事件
    const duration = Date.now() - startTime;
    const trackData = {
      format: copyFormat,
      source: "shortcut",
      success: true,
      duration,
      urlCleaning:
        settings.urlCleaning !== undefined ? settings.urlCleaning : null,
      templateId: templateId !== undefined ? templateId : null,
      templateName: templateName !== undefined ? templateName : null,
      shortService:
        copyFormat === "shortUrl"
          ? settings.shortUrlService !== undefined
            ? settings.shortUrlService
            : null
          : null,
      errorType: null,
      errorMessage: null,
    };

    trackCopy(trackData).catch((error) => {
      console.debug("Failed to track copy event:", error);
    });

    // 显示通知
    await notificationHelper.success(successMessage);
  } catch (error) {
    // 如果settings未获取到，尝试重新获取或使用默认设置
    if (!settings) {
      try {
        settings = await getUserSettings();
      } catch (settingsError) {
        console.debug("获取设置失败:", settingsError);
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
      console.debug("复制 URL 失败:", error);
    }

    // 记录失败的复制事件
    const duration = Date.now() - startTime;
    const errorType = isUserValidationError ? "validation" : "system";
    const failedFormat = settings.silentCopyFormat || "url";

    const trackData = {
      format: failedFormat,
      source: "shortcut",
      success: false,
      duration,
      urlCleaning:
        settings.urlCleaning !== undefined ? settings.urlCleaning : null,
      templateId: null,
      templateName: null,
      shortService:
        failedFormat === "shortUrl"
          ? settings.shortUrlService !== undefined
            ? settings.shortUrlService
            : null
          : null,
      errorType,
      errorMessage: error.message,
    };

    trackCopy(trackData).catch((trackError) => {
      console.debug("Failed to track failed copy event:", trackError);
    });

    // 显示通知
    await notificationHelper.success(message);
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
    console.debug("复制失败:", error);
    throw new Error("复制操作失败");
  }
}

// 并发创建锁
let offscreenCreationPromise = null;

// 健康检查 offscreen document
async function checkOffscreenHealth() {
  try {
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "ping" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), 1000),
      ),
    ]);

    return response?.success === true && response?.ready === true;
  } catch (error) {
    console.debug("Offscreen health check failed:", error.message);
    return false;
  }
}

// 确保 offscreen document 存在且可用
async function ensureOffscreenDocument() {
  // 如果已有创建操作在进行，等待它完成
  if (offscreenCreationPromise) {
    console.log("Offscreen creation already in progress, waiting...");
    return offscreenCreationPromise;
  }

  try {
    // 检查是否已存在 offscreen document
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });

    if (existingContexts.length > 0) {
      // 存在，但需要验证其可用性
      const isHealthy = await checkOffscreenHealth();

      if (isHealthy) {
        console.log("Offscreen document exists and is healthy");
        return;
      }

      // 不健康，需要重建
      console.debug(
        "Offscreen document exists but is unhealthy, recreating...",
      );

      try {
        await chrome.offscreen.closeDocument();
        console.log("Closed unhealthy offscreen document");
      } catch (closeError) {
        console.debug("Failed to close offscreen document:", closeError);
        // 继续尝试创建新的
      }
    }

    // 创建新的 offscreen document（带锁保护）
    offscreenCreationPromise = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL("offscreen/offscreen.html"),
          reasons: ["CLIPBOARD"],
          justification: "复制文本到剪贴板",
        });
        console.log("Offscreen document created successfully");

        // 验证新创建的 document 是否可用
        const isHealthy = await checkOffscreenHealth();
        if (!isHealthy) {
          throw new Error("Newly created offscreen document is not responding");
        }

        return true;
      } finally {
        // 清除锁
        offscreenCreationPromise = null;
      }
    })();

    await offscreenCreationPromise;
  } catch (error) {
    console.debug("Failed to ensure offscreen document:", error);
    offscreenCreationPromise = null; // 确保失败时也清除锁
    throw error;
  }
}
