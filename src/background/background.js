// Background script for handling keyboard shortcuts and URL copying

import {
  initializeParamRules,
  getOrGenerateShortUrl,
} from "../shared/constants.js";

// 导入分析模块
import { trackInstall, trackCopy } from "../shared/analytics.js";
import settingsManager from "../shared/settings-manager.js";
import notificationHelper from "../shared/notification-helper.js";
import {
  initializeI18n,
  getLocalMessage,
  setupLanguageChangeListener,
} from "../shared/ui/i18n.js";

// Import content generators (Strategy Pattern)
import { ContentGeneratorFactory } from "./content-generators/index.js";

// ============================================
// Service Worker 启动初始化
// ============================================

// IMPORTANT: Initialize i18n on every service worker startup
// This ensures the correct language is loaded even after browser restart
(async () => {
  try {
    const locale = await initializeI18n({
      settingsManager,
      updateDOM: false, // background script doesn't have DOM
    });
    console.log(`[Background] I18n initialized on startup with locale: ${locale}`);
  } catch (error) {
    console.debug("[Background] Failed to initialize i18n on startup:", error);
  }
})();

// ============================================
// 多语言支持 - 使用统一的 i18n 工具
// ============================================

// Set up language change listener with logging
setupLanguageChangeListener((newLocale) => {
  console.log(`[Background] Language changed to: ${newLocale}`);
  // Recreate context menus with new language
  createContextMenus();
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

// 创建右键菜单
function createContextMenus() {
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
    console.log(`[Background] Context menus created with language: ${getLocalMessage("copyUrlShortcut")}`);
  });
}

// 处理扩展安装和更新
chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化国际化（确保菜单使用正确语言）
  const locale = await initializeI18n({
    settingsManager,
    updateDOM: false, // background script doesn't have DOM
  });
  console.log(`[Background] I18n re-initialized on install/update with locale: ${locale}`);

  // 初始化参数规则（首次使用时设置默认配置）
  await initializeParamRules();

  // 创建右键菜单
  createContextMenus();

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
  } catch {
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

// 处理短链生成 - unified wrapper using getOrGenerateShortUrl
async function handleCreateShortUrl(longUrl, service) {
  try {
    const settings = await getUserSettings();
    const serviceToUse = service || settings.shortUrlService;

    // Use unified helper function that handles all caching logic
    return await getOrGenerateShortUrl(
      longUrl,
      settings.urlCleaning,
      serviceToUse,
    );
  } catch (error) {
    console.debug("[Background] Failed to create short URL:", error);
    throw error;
  }
}

/**
 * Determine content format from settings
 * @param {object} settings - User settings
 * @returns {object} Format info { type, templateId, templateName }
 */
function determineContentFormat(settings) {
  if (settings.silentCopyFormat.startsWith("custom:")) {
    return {
      type: "custom",
      templateId: settings.silentCopyFormat.substring(7),
      templateName: null,
    };
  } else if (settings.silentCopyFormat === "markdown") {
    return { type: "markdown", templateId: null, templateName: null };
  } else if (settings.silentCopyFormat === "shortUrl") {
    return { type: "shortUrl", templateId: null, templateName: null };
  } else {
    return { type: "url", templateId: null, templateName: null };
  }
}

/**
 * Generate content based on format using Strategy Pattern
 * @param {object} formatInfo - Format information
 * @param {object} tab - Tab object
 * @param {object} settings - User settings
 * @returns {Promise<object>} { content, message, format, templateName }
 */
async function generateContent(formatInfo, tab, settings) {
  // Helper functions object for generators
  const helpers = {
    getPageTitle,
    getPageMetadata,
    handleCreateShortUrl,
  };

  // Use factory to generate content
  return await ContentGeneratorFactory.generate(
    formatInfo,
    tab,
    settings,
    helpers,
  );
}

/**
 * Track copy operation with analytics
 * @param {object} data - Tracking data
 */
async function trackCopyOperation(data) {
  try {
    await trackCopy(data);
  } catch (error) {
    console.debug("Failed to track copy event:", error);
  }
}

/**
 * Handle successful copy operation
 * @param {string} message - Success message
 * @param {number|null} tabId - Tab ID for notification
 */
async function handleCopySuccess(message, tabId) {
  await incrementCopyCount();
  await notificationHelper.success(message, null, tabId);
}

/**
 * Handle copy operation error
 * @param {Error} error - Error object
 * @param {object} settings - User settings
 * @param {number} startTime - Operation start time
 */
async function handleCopyError(error, settings, startTime) {
  let message;
  let isUserValidationError = false;

  if (error.message === getLocalMessage("noUrl")) {
    message = getLocalMessage("noUrl");
  } else if (settings.silentCopyFormat === "shortUrl") {
    if (
      error.message.includes(getLocalMessage("invalidUrlForShortening")) ||
      error.message.includes("URL is not suitable for shortening")
    ) {
      message = getLocalMessage("invalidUrlForShortening");
      isUserValidationError = true;
    } else {
      message = getLocalMessage("shortUrlFailed");
    }
  } else {
    message = getLocalMessage("copyFailed");
  }

  if (!isUserValidationError) {
    console.debug("复制 URL 失败:", error);
  }

  // Track failed copy event
  const duration = Date.now() - startTime;
  const errorType = isUserValidationError ? "validation" : "system";
  const failedFormat = settings.silentCopyFormat || "url";

  await trackCopyOperation({
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
  });

  await notificationHelper.success(message);
}

// 处理URL复制功能
// @param {number} tabId - 明确的标签页ID，防止竞态条件
// @param {object} tabSnapshot - 标签页快照（可选），包含初始URL和标题
/**
 * Get tab information with snapshot fallback
 * @param {number|null} tabId - Tab ID to retrieve
 * @param {Object|null} tabSnapshot - Fallback snapshot if tab is closed
 * @returns {Promise<Object>} Tab object
 * @throws {Error} If tab cannot be retrieved and no valid snapshot exists
 */
async function getTabInfo(tabId, tabSnapshot) {
  if (tabId) {
    try {
      return await getTabById(tabId);
    } catch {
      if (tabSnapshot && tabSnapshot.url) {
        console.log("[Background] Tab closed, using snapshot data");
        return tabSnapshot;
      }
      throw new Error(getLocalMessage("noUrl") || "Tab was closed");
    }
  }
  return await getCurrentTab();
}

/**
 * Track successful copy operation analytics
 * @param {Object} result - Copy result (format, message, templateName)
 * @param {Object} settings - User settings
 * @param {Object} formatInfo - Format information (templateId, etc.)
 * @param {number} duration - Operation duration in milliseconds
 * @returns {Promise<void>}
 */
async function trackCopySuccess(result, settings, formatInfo, duration) {
  await trackCopyOperation({
    format: result.format,
    source: "shortcut",
    success: true,
    duration,
    urlCleaning:
      settings.urlCleaning !== undefined ? settings.urlCleaning : null,
    templateId: formatInfo.templateId || null,
    templateName: result.templateName || null,
    shortService:
      result.format === "shortUrl"
        ? settings.shortUrlService !== undefined
          ? settings.shortUrlService
          : null
        : null,
    errorType: null,
    errorMessage: null,
  });
}

/**
 * Determine notification target tab ID
 * Checks if the original tab still exists for content script notification
 * @param {Object} tab - Tab object
 * @returns {Promise<number|null>} Tab ID if tab exists, null otherwise
 */
async function determineNotificationTarget(tab) {
  try {
    await chrome.tabs.get(tab.id);
    return tab.id;
  } catch {
    console.log(
      "[Background] Original tab closed, will use Chrome notification",
    );
    return null;
  }
}

/**
 * Handle copy URL request from keyboard shortcut
 * @param {number|null} tabId - Optional specific tab ID
 * @param {Object|null} tabSnapshot - Optional tab snapshot for closed tabs
 * @returns {Promise<void>}
 */
async function handleCopyUrl(tabId = null, tabSnapshot = null) {
  // Prevent duplicate execution
  if (copyOperationStates.copyUrl) {
    return;
  }

  copyOperationStates.copyUrl = true;
  let settings;
  const startTime = Date.now();

  try {
    // Get tab information with fallback
    const tab = await getTabInfo(tabId, tabSnapshot);

    // Get user settings
    settings = await getUserSettings();

    // Determine format and generate content
    const formatInfo = determineContentFormat(settings);
    const result = await generateContent(formatInfo, tab, settings);

    // Copy to clipboard
    await copyToClipboard(result.content);

    // Track successful copy event
    const duration = Date.now() - startTime;
    await trackCopySuccess(result, settings, formatInfo, duration);

    // Determine notification target
    const notificationTabId = await determineNotificationTarget(tab);

    // Handle success notification
    await handleCopySuccess(result.message, notificationTabId);
  } catch (error) {
    // Ensure settings are available for error handling
    if (!settings) {
      try {
        settings = await getUserSettings();
      } catch {
        console.debug("获取设置失败");
        settings = { chromeNotifications: true, silentCopyFormat: "url" };
      }
    }

    // Handle error
    await handleCopyError(error, settings, startTime);
  } finally {
    // Reset state
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
