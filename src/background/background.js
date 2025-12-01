// Background script for handling keyboard shortcuts and URL copying

import {
  processUrl,
  createShortUrl,
  isValidWebUrl,
  getAllTemplates,
  processTemplateWithFallback,
  initializeParamRules,
} from "../shared/constants.js";

// 导入分析模块
import { trackInstall, trackCopy } from "../shared/analytics.js";
import settingsManager from "../shared/settings-manager.js";
import notificationHelper from "../shared/notification-helper.js";
import shortUrlCache from "../shared/short-url-cache.js";
import {
  initializeI18n,
  getLocalMessage,
  setupLanguageChangeListener,
} from "../shared/ui/i18n.js";

// ============================================
// 多语言支持 - 使用统一的 i18n 工具
// ============================================

// Set up language change listener with logging
setupLanguageChangeListener((newLocale) => {
  console.log(`[Background] Language changed to: ${newLocale}`);
});

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

// 增加复制计数
async function incrementCopyCount() {
  try {
    const result = await chrome.storage.local.get(["copyCount"]);
    const currentCount = result.copyCount || 0;
    await chrome.storage.local.set({ copyCount: currentCount + 1 });
    console.log(`[Background] Copy count incremented to: ${currentCount + 1}`);
  } catch (error) {
    console.debug("[Background] Failed to increment copy count:", error);
  }
}

// 创建右键菜单和处理扩展安装
chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化国际化（优先加载，以便后续使用）
  const locale = await initializeI18n({
    settingsManager,
    updateDOM: false, // background script doesn't have DOM
  });
  console.log(`[Background] I18n initialized with locale: ${locale}`);

  // 初始化参数规则（首次使用时设置默认配置）
  await initializeParamRules();

  // 先清除所有已存在的菜单项，避免重复创建导致警告
  chrome.contextMenus.removeAll(() => {
    // 创建右键菜单 - 使用动态加载的语言
    chrome.contextMenus.create({
      id: "copy-current-url",
      title: getLocalMessage("copyUrlShortcut") || "静默复制",
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
    // 右键菜单会自动提供 tab 参数，直接使用
    if (tab && tab.id) {
      debounce("contextMenuCopy", () => handleCopyUrl(tab.id, tab), 300);
    } else {
      console.debug("No tab info from context menu");
    }
  }
});

// 监听键盘快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "copy-url") {
    // 立即捕获当前活动标签页，避免用户快速关闭标签页导致的竞态条件
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.id) {
        // 传递明确的 tabId 和 tab 信息，防止后续异步操作时 tab 已被关闭
        debounce("shortcutCopy", () => handleCopyUrl(tab.id, tab), 300);
      } else {
        console.debug("No active tab found for copy command");
      }
    } catch (error) {
      console.debug("Failed to get tab for copy command:", error);
    }
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
    console.log("[Background] Received createShortUrl request:", {
      url: message.url,
      service: message.service,
    });

    // 使用立即执行的异步函数来确保正确处理响应
    (async () => {
      try {
        const shortUrl = await handleCreateShortUrl(
          message.url,
          message.service,
        );

        // 验证返回的短链有效性
        if (shortUrl && typeof shortUrl === "string" && shortUrl.trim()) {
          console.log("[Background] Short URL created successfully:", shortUrl);
          const responseData = { success: true, shortUrl: shortUrl.trim() };
          console.log("[Background] Sending response:", responseData);
          sendResponse(responseData);
        } else {
          console.debug("[Background] Invalid short URL returned:", shortUrl);
          const errorResponse = {
            success: false,
            error: "Invalid short URL generated",
          };
          console.log("[Background] Sending error response:", errorResponse);
          sendResponse(errorResponse);
        }
      } catch (error) {
        console.debug("[Background] Short URL creation failed:", error);
        const errorResponse = { success: false, error: error.message };
        console.log("[Background] Sending error response:", errorResponse);
        sendResponse(errorResponse);
      }
    })();

    return true; // 表示会异步发送响应
  }
});

// 获取指定标签页（带验证）
async function getTabById(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (!tab || !tab.url) {
      throw new Error(getLocalMessage("noUrl"));
    }

    return tab;
  } catch (error) {
    // Tab 可能已被关闭
    throw new Error(getLocalMessage("noUrl") || "Tab not found or closed");
  }
}

// 获取当前活动标签页（保留用于 popup 等其他场景）
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab || !tab.url) {
    throw new Error(getLocalMessage("noUrl"));
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
// 优先使用 tab 对象中已有的标题，如果 tab 被关闭则从 URL 提取
async function getPageTitle(tabId, url, tabSnapshot = null) {
  // 如果提供了 tab 快照且有标题，直接使用
  if (tabSnapshot && tabSnapshot.title) {
    return tabSnapshot.title;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.title || new URL(url).hostname || "";
  } catch (error) {
    console.debug("获取页面标题失败 (tab可能已关闭):", error.message);
    // 如果获取tab失败，尝试从URL生成标题
    try {
      return new URL(url).hostname || "";
    } catch {
      return "";
    }
  }
}

// 获取页面元数据（author 和 description）
// 如果 tab 已关闭或不可访问，返回空元数据
async function getPageMetadata(tabId) {
  try {
    // 先验证 tab 是否存在
    await chrome.tabs.get(tabId);

    // 向 content script 发送消息获取元数据（带超时保护）
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tabId,
          {
            type: "GET_PAGE_METADATA",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          },
        );
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Metadata timeout")), 1000),
      ),
    ]);

    if (response && response.success) {
      return response.metadata || { author: "", description: "" };
    } else {
      console.log("Failed to get metadata from content script");
      return { author: "", description: "" };
    }
  } catch (error) {
    // Tab 已关闭、content script 未加载或页面不支持
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
        getLocalMessage("invalidUrlForShortening") ||
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
        getLocalMessage("invalidUrlForShortening") ||
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
// @param {number} tabId - 明确的标签页ID，防止竞态条件
// @param {object} tabSnapshot - 标签页快照（可选），包含初始URL和标题
async function handleCopyUrl(tabId = null, tabSnapshot = null) {
  // 防止重复执行
  if (copyOperationStates.copyUrl) {
    return;
  }

  copyOperationStates.copyUrl = true;
  let settings;
  const startTime = Date.now();

  try {
    // 优先使用传入的 tabId 获取最新的 tab 信息，回退到动态查询（用于 popup 等场景）
    let tab;
    if (tabId) {
      try {
        // 验证 tab 是否仍然存在
        tab = await getTabById(tabId);
      } catch (error) {
        // Tab 已被关闭，使用快照信息（如果有）
        if (tabSnapshot && tabSnapshot.url) {
          console.log("[Background] Tab closed, using snapshot data");
          tab = tabSnapshot;
        } else {
          throw new Error(getLocalMessage("noUrl") || "Tab was closed");
        }
      }
    } else {
      // 回退到动态查询（popup 等场景）
      tab = await getCurrentTab();
    }

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
        const title = await getPageTitle(tab.id, tab.url, tab);
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
          ? getLocalMessage("customTemplateCopied") ||
            `${result.templateName} copied`
          : getLocalMessage("urlCopied");
      } catch (error) {
        console.debug("Error processing custom template:", error);
        // 回退到URL复制
        contentToCopy = await processUrl(tab.url, settings.urlCleaning);
        successMessage = getLocalMessage("urlCopied");
        copyFormat = "url"; // 修正格式类型
      }
    } else if (settings.silentCopyFormat === "markdown") {
      copyFormat = "markdown";
      // 获取页面标题并创建 markdown 链接
      const title = await getPageTitle(tab.id, tab.url, tab);
      contentToCopy = await createMarkdownLink(
        tab.url,
        title,
        settings.urlCleaning,
      );
      successMessage = getLocalMessage("markdownCopied");
    } else if (settings.silentCopyFormat === "shortUrl") {
      copyFormat = "shortUrl";
      // 验证URL是否适合生成短链
      if (!isValidWebUrl(tab.url)) {
        throw new Error(
          getLocalMessage("invalidUrlForShortening") ||
            "URL is not suitable for shortening",
        );
      }
      // 生成短链
      const shortUrl = await handleCreateShortUrl(
        tab.url,
        settings.shortUrlService,
      );
      contentToCopy = shortUrl;
      successMessage = getLocalMessage("shortUrlCopied");
    } else {
      copyFormat = "url";
      // 默认复制 URL
      contentToCopy = await processUrl(tab.url, settings.urlCleaning);
      successMessage = getLocalMessage("urlCopied");
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

    // 增加复制计数
    await incrementCopyCount();

    // 显示通知
    // 策略：只有当原始 tab 仍然存在时才使用页面通知，否则直接使用 Chrome 通知
    // 这样可以避免在用户已切换到其他 tab 时打扰他们
    let notificationTabId = null;
    try {
      // 验证原始 tab 是否仍然存在
      await chrome.tabs.get(tab.id);
      // Tab 仍然存在，可以使用页面通知
      notificationTabId = tab.id;
    } catch (error) {
      // 原始 tab 已关闭，传递 null 让通知系统自动回退到 Chrome 通知
      console.log(
        "[Background] Original tab closed, will use Chrome notification",
      );
    }

    await notificationHelper.success(successMessage, null, notificationTabId);
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

    if (error.message === getLocalMessage("noUrl")) {
      message = getLocalMessage("noUrl");
    } else if (settings.silentCopyFormat === "shortUrl") {
      // 根据错误类型选择更具体的消息
      if (
        error.message.includes(getLocalMessage("invalidUrlForShortening")) ||
        error.message.includes("URL is not suitable for shortening")
      ) {
        message = getLocalMessage("invalidUrlForShortening");
        isUserValidationError = true; // 这是用户输入验证错误，不是系统错误
      } else {
        message = getLocalMessage("shortUrlFailed");
      }
    } else {
      message = getLocalMessage("copyFailed");
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

    // 显示通知（错误情况下不传递 tabId，因为 tab 可能已不可用）
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

// 并发创建锁 - 修复并发竞争问题
let offscreenCreationPromise = null;
let offscreenCreationQueue = [];

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

// 确保 offscreen document 存在且可用 - 修复并发版本
async function ensureOffscreenDocument() {
  // 如果已有创建操作在进行，加入队列等待
  if (offscreenCreationPromise) {
    console.log("Offscreen creation already in progress, queuing request...");
    return new Promise((resolve, reject) => {
      offscreenCreationQueue.push({ resolve, reject });
    });
  }

  // 开始创建流程，设置锁
  offscreenCreationPromise = (async () => {
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
          // 通知所有等待的请求
          offscreenCreationQueue.forEach(({ resolve }) => resolve());
          offscreenCreationQueue = [];
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

      // 创建新的 offscreen document
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

      // 成功：通知所有等待的请求
      offscreenCreationQueue.forEach(({ resolve }) => resolve());
      offscreenCreationQueue = [];

      return true;
    } catch (error) {
      console.debug("Failed to ensure offscreen document:", error);
      // 失败：通知所有等待的请求
      offscreenCreationQueue.forEach(({ reject }) => reject(error));
      offscreenCreationQueue = [];
      throw error;
    } finally {
      // 确保锁被清除，无论成功还是失败
      offscreenCreationPromise = null;
    }
  })();

  return offscreenCreationPromise;
}
