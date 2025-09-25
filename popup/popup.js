import {
  processUrl,
  getMessage,
  SHORT_URL_SERVICES,
  isValidWebUrl,
  getAllTemplates,
  templateEngine,
  loadTemplatesIntoSelect,
} from "../shared/constants.js";

import { trackCopy } from "../shared/analytics.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Constants
  const EXTENSION_NAME = chrome.i18n.getMessage("extName");

  // 防抖工具
  const debounceMap = new Map();

  function debounce(key, fn, delay = 300) {
    if (debounceMap.has(key)) {
      clearTimeout(debounceMap.get(key));
    }

    const timeoutId = setTimeout(() => {
      debounceMap.delete(key);
      fn();
    }, delay);

    debounceMap.set(key, timeoutId);
  }

  // 复制操作状态管理
  const copyOperationStates = {
    copyUrl: false,
    copyMarkdown: false,
    generateShortUrl: false,
    copyQRCode: false,
  };

  // 持久化短链缓存管理
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
          console.log("使用持久化缓存 (popup):", item.shortUrl);
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
            cache[current].timestamp < cache[oldest].timestamp
              ? current
              : oldest,
          );
          delete cache[oldestKey];
        }

        cache[key] = {
          shortUrl,
          timestamp: Date.now(),
        };

        await chrome.storage.local.set({ [this.storageKey]: cache });
        console.log("短链已持久化缓存 (popup):", shortUrl);
      } catch (error) {
        console.error("缓存保存失败:", error);
      }
    }
  }

  // 创建持久化短链缓存实例
  const shortUrlCache = new PersistentShortUrlCache();

  // Locale data
  let currentLocale = "zh_CN";
  let localeMessages = {};

  // Load locale messages
  async function loadLocaleMessages(locale) {
    try {
      const response = await fetch(
        chrome.runtime.getURL(`_locales/${locale}/messages.json`),
      );
      const messages = await response.json();
      return messages;
    } catch (error) {
      console.error("Failed to load locale messages:", error);
      return {};
    }
  }

  // i18n helper function (using local one for popup specific behavior)
  function getLocalMessage(key, substitutions = []) {
    if (localeMessages[key] && localeMessages[key].message) {
      return localeMessages[key].message;
    }
    // Fallback to Chrome i18n API
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // 加载自定义模板到静默复制格式选择器
  async function loadCustomTemplates(preserveValue = null) {
    await loadTemplatesIntoSelect(elements.silentCopyFormat, {
      includeIcons: true,
      clearExisting: true,
      onError: (error) => {
        console.error("Failed to load custom templates in popup:", error);
      },
    });

    // 如果指定了要保持的值，则恢复它并验证
    if (preserveValue) {
      // 使用 setTimeout 确保 DOM 更新完成后再设置值
      setTimeout(() => {
        // 检查该值是否在选项中存在
        const optionExists = Array.from(elements.silentCopyFormat.options).some(
          (option) => option.value === preserveValue,
        );

        if (optionExists) {
          elements.silentCopyFormat.value = preserveValue;
        } else {
          // 静默处理模板不存在的情况，避免在扩展管理页面显示错误
          elements.silentCopyFormat.value = "url";
          // 保存回退值
          saveSettings();
        }
      }, 0);
    }
  }

  // 监听模板变更消息
  function setupTemplateChangeListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TEMPLATE_CHANGED") {
        console.log(
          `Popup received template change notification: ${message.changeType}`,
        );

        // 保存当前选中的值
        const currentValue = elements.silentCopyFormat.value;

        // 重新加载模板到选择器
        loadCustomTemplates()
          .then(() => {
            // 使用多重延迟和检查确保修复生效
            setTimeout(() => {
              const selectElement = elements.silentCopyFormat;

              // 检查当前值是否在选项中
              const optionExists = Array.from(selectElement.options).some(
                (option) => option.value === currentValue,
              );

              if (optionExists) {
                // 如果选项存在，设置值
                selectElement.value = currentValue;
              } else {
                // 如果选项不存在，静默回退到默认格式

                // 方法1：直接设置 selectedIndex
                const urlOption = Array.from(selectElement.options).findIndex(
                  (option) => option.value === "url",
                );
                if (urlOption !== -1) {
                  selectElement.selectedIndex = urlOption;
                }

                // 方法2：设置 value (双保险)
                selectElement.value = "url";

                // 方法3：手动触发变更事件
                selectElement.dispatchEvent(
                  new Event("change", { bubbles: true }),
                );

                // 保存设置
                saveSettings();

                // 最后检查：如果仍然没有选中任何选项，强制选中第一个
                setTimeout(() => {
                  if (selectElement.selectedIndex === -1) {
                    selectElement.selectedIndex = 0;
                    selectElement.dispatchEvent(
                      new Event("change", { bubbles: true }),
                    );
                    saveSettings();
                  }
                }, 5);
              }
            }, 50); // 增加延迟确保DOM完全更新
          })
          .catch((error) => {
            console.error("Failed to reload templates after change:", error);
          });

        sendResponse({ received: true });
      }
    });
  }

  // DOM elements
  const elements = {
    pageTitle: document.getElementById("pageTitle"),
    pageUrl: document.getElementById("pageUrl"),
    copyBtn: document.getElementById("copyBtn"),
    markdownBtn: document.getElementById("markdownBtn"),
    shortUrlBtn: document.getElementById("shortUrlBtn"),
    qrBtn: document.getElementById("qrBtn"),
    batchBtn: document.getElementById("batchBtn"),
    status: document.getElementById("status"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
    silentCopyFormat: document.getElementById("silentCopyFormat"),
    version: document.getElementById("version"),
    qrModal: document.getElementById("qrModal"),
    qrModalOverlay: document.getElementById("qrModalOverlay"),
    qrModalClose: document.getElementById("qrModalClose"),
    qrCodeContainer: document.getElementById("qrCodeContainer"),
    qrUrlDisplay: document.getElementById("qrUrlDisplay"),
    qrCopyBtn: document.getElementById("qrCopyBtn"),
    moreSettingsBtn: document.getElementById("moreSettingsBtn"),
  };

  let currentUrl = "";
  let currentTitle = "";

  // Load version from manifest
  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      elements.version.textContent = `v${manifest.version}`;
    }
  }

  // Initialize localization
  async function initializeI18n(locale) {
    if (locale) {
      currentLocale = locale;
    }

    // Load messages for current locale
    localeMessages = await loadLocaleMessages(currentLocale);

    // Apply localization to all elements with data-i18n attribute
    const i18nElements = document.querySelectorAll("[data-i18n]");
    i18nElements.forEach((element) => {
      const key = element.getAttribute("data-i18n");
      const message = getLocalMessage(key);
      if (message && message !== key) {
        if (element.tagName === "INPUT" && element.type === "text") {
          element.placeholder = message;
        } else {
          element.textContent = message;
        }
      }
    });
  }

  // 通用三段滑块初始化函数
  function initializeThreeWaySwitch(switchElement, options, onChange) {
    if (!switchElement) return;

    const switchOptions = switchElement.querySelectorAll(".switch-option");

    // 计算滑块的自适应位置和宽度
    function updateSliderPosition() {
      const currentValue = switchElement.getAttribute("data-value");
      const currentIndex = options.findIndex(
        (opt) => opt.value === currentValue,
      );

      if (currentIndex === -1) return;

      // 清除所有active状态
      switchOptions.forEach((option) => option.classList.remove("active"));

      // 设置当前选项为active
      if (switchOptions[currentIndex]) {
        switchOptions[currentIndex].classList.add("active");
      }

      // 修复滑块位置计算 - 解决超出容器问题
      const optionElement = switchOptions[currentIndex];
      const optionWidth = optionElement.offsetWidth;
      const optionLeft = optionElement.offsetLeft;

      // 获取容器的padding值
      const containerStyle = getComputedStyle(switchElement);
      const containerPadding = parseFloat(containerStyle.paddingLeft);

      // 关键修复：translateX需要减去容器padding，因为滑块已经有left: 2px的基础定位
      const sliderTranslateX = optionLeft - containerPadding;

      // 更新CSS变量来控制滑块
      switchElement.style.setProperty("--slider-width", `${optionWidth}px`);
      switchElement.style.setProperty("--slider-x", `${sliderTranslateX}px`);
    }

    // 为每个选项添加点击事件
    switchOptions.forEach((option, index) => {
      option.addEventListener("click", () => {
        const newValue = options[index].value;
        switchElement.setAttribute("data-value", newValue);
        updateSliderPosition();

        if (onChange) {
          onChange(newValue, options[index]);
        }
      });
    });

    // 初始化位置
    updateSliderPosition();

    // 窗口大小变化时重新计算
    window.addEventListener("resize", updateSliderPosition);

    return { updateSliderPosition };
  }

  // 初始化URL清理选择器
  function initializeUrlCleaningSelect() {
    const cleaningOptions = [
      { value: "off", key: "cleaningDisabled" },
      { value: "smart", key: "smartCleaningEnabled" },
      { value: "aggressive", key: "aggressiveCleaningEnabled" },
    ];

    return initializeThreeWaySwitch(
      elements.removeParamsToggle,
      cleaningOptions,
      (value, option) => {
        // 显示通知
        if (option.key) {
          showArcNotification(getLocalMessage(option.key));
        }
        saveSettings();
        updatePageDisplay();
      },
    );
  }

  // 主题相关函数
  function detectSystemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    const htmlElement = document.documentElement;

    if (theme === "system") {
      htmlElement.removeAttribute("data-theme");
    } else {
      htmlElement.setAttribute("data-theme", theme);
    }
  }

  // 应用主题色
  function applyThemeColor(color) {
    const htmlElement = document.documentElement;
    htmlElement.setAttribute("data-color", color);
  }

  async function initializeTheme() {
    const result = await chrome.storage.sync.get(["appearance"]);
    const savedTheme = result.appearance || "system";

    applyTheme(savedTheme);

    // 监听系统主题变化
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        if (savedTheme === "system") {
          applyTheme("system");
        }
      });
    }
  }

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      "removeParams",
      "urlCleaning",
      "silentCopyFormat",
      "appearance",
      "language",
      "themeColor",
    ]);

    // 处理向后兼容：将旧的boolean设置转换为新的字符串设置
    let cleaningMode = result.urlCleaning;
    if (!cleaningMode && typeof result.removeParams === "boolean") {
      cleaningMode = result.removeParams ? "aggressive" : "off";
    }
    cleaningMode = cleaningMode || "smart";

    const cleaningSelect = elements.removeParamsToggle;
    cleaningSelect.setAttribute("data-value", cleaningMode);

    // 不在这里设置 silentCopyFormat.value，而是返回它
    const silentCopyFormat = result.silentCopyFormat || "url";

    // Load appearance setting for theme application
    const savedAppearance = result.appearance || "system";
    applyTheme(savedAppearance);

    // Load language setting, default to browser language or zh_CN
    const browserLang = chrome.i18n.getUILanguage();
    let defaultLang = "en"; // default fallback
    if (browserLang.startsWith("zh")) {
      // 更精确的繁简中文检测
      if (
        browserLang === "zh-TW" ||
        browserLang === "zh-HK" ||
        browserLang === "zh-MO"
      ) {
        defaultLang = "zh_TW";
      } else {
        defaultLang = "zh_CN";
      }
    } else if (browserLang.startsWith("es")) {
      defaultLang = "es";
    } else if (browserLang.startsWith("ja")) {
      defaultLang = "ja";
    } else if (browserLang.startsWith("de")) {
      defaultLang = "de";
    } else if (browserLang.startsWith("fr")) {
      defaultLang = "fr";
    } else if (browserLang.startsWith("pt")) {
      defaultLang = "pt";
    } else if (browserLang.startsWith("ru")) {
      defaultLang = "ru";
    } else if (browserLang.startsWith("ko")) {
      defaultLang = "ko";
    }
    const savedLanguage = result.language || defaultLang;
    currentLocale = savedLanguage;

    // Load theme color setting, default to green
    const savedThemeColor = result.themeColor || "green";
    applyThemeColor(savedThemeColor);

    return { silentCopyFormat };
  }

  // 保存设置
  async function saveSettings() {
    const cleaningSelect = elements.removeParamsToggle;

    await chrome.storage.sync.set({
      urlCleaning: cleaningSelect.getAttribute("data-value"),
      silentCopyFormat: elements.silentCopyFormat.value,
    });
  }

  // Handle silent copy format change
  async function handleSilentCopyFormatChange() {
    await saveSettings();
    showArcNotification(getLocalMessage("silentCopyFormatChanged"));
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

  // 获取当前页面URL
  async function getCurrentUrl() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && tab.url) {
        currentUrl = tab.url;

        // 获取页面标题
        if (tab.id) {
          currentTitle = await getPageTitle(tab.id, tab.url);
        }

        updatePageDisplay();
      } else {
        handleError(getLocalMessage("noUrl"));
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      handleError(getLocalMessage("getUrlFailed"));
    }
  }

  // 处理错误状态
  function handleError(message) {
    elements.pageTitle.textContent = getLocalMessage("errorTitle") || "Error";
    elements.pageUrl.textContent = message;
    elements.copyBtn.disabled = true;
    elements.markdownBtn.disabled = true;
  }

  // 更新页面信息显示
  function updatePageDisplay() {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = processUrl(currentUrl, cleaningMode);

    // 更新标题显示
    if (currentTitle && currentTitle.trim()) {
      elements.pageTitle.textContent = currentTitle;
    } else {
      // 如果没有标题，使用域名作为后备
      try {
        const hostname = new URL(currentUrl).hostname;
        elements.pageTitle.textContent = hostname;
        elements.pageTitle.setAttribute(
          "data-fallback",
          getLocalMessage("noPageTitle") || "Untitled Page",
        );
      } catch (error) {
        elements.pageTitle.textContent =
          getLocalMessage("noPageTitle") || "Untitled Page";
      }
    }

    // 更新URL显示
    elements.pageUrl.textContent = processedUrl;
  }

  // 创建临时复制元素
  function createTempCopyElement(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "-9999px";
    textArea.setAttribute("readonly", "");
    return textArea;
  }

  // 使用execCommand复制的备用方法
  function fallbackCopy(text) {
    const textArea = createTempCopyElement(text);
    document.body.appendChild(textArea);

    textArea.select();
    textArea.setSelectionRange(0, 99999);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (!successful) {
      throw new Error("execCommand copy failed");
    }

    console.log("Popup execCommand copy successful");
  }

  // 显示Arc风格的状态通知
  function showArcNotification(message) {
    const textElement = elements.status.querySelector(".notification-text");
    if (textElement) {
      textElement.textContent = message;
    }
    elements.status.classList.add("show");

    setTimeout(() => {
      elements.status.classList.remove("show");
    }, 2000);
  }

  // 复制URL到剪贴板
  async function copyUrl() {
    if (copyOperationStates.copyUrl) {
      return; // 防止重复执行
    }

    copyOperationStates.copyUrl = true;
    const startTime = Date.now();

    try {
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");
      const processedUrl = processUrl(currentUrl, cleaningMode);

      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(processedUrl);
        console.log("Popup clipboard API copy successful");
      } else {
        fallbackCopy(processedUrl);
      }

      // 记录成功的复制事件
      const duration = Date.now() - startTime;
      trackCopy({
        format: "url",
        source: "popup",
        success: true,
        urlCleaning: cleaningMode,
        duration,
      }).catch((error) => {
        console.warn("Failed to track copy event:", error);
      });

      showStatus();
    } catch (error) {
      console.error("复制失败:", error);
      let fallbackSuccess = false;

      // 使用fallback复制方法
      try {
        const cleaningSelect = elements.removeParamsToggle;
        const cleaningMode = cleaningSelect.getAttribute("data-value");
        const processedUrl = processUrl(currentUrl, cleaningMode);
        fallbackCopy(processedUrl);
        fallbackSuccess = true;
        showStatus();
      } catch (fallbackError) {
        console.error("降级复制也失败:", fallbackError);
      }

      // 记录复制事件（成功或失败）
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      trackCopy({
        format: "url",
        source: "popup",
        success: fallbackSuccess,
        urlCleaning: cleaningMode,
        duration,
        errorType: fallbackSuccess ? null : "clipboard",
        errorMessage: fallbackSuccess ? null : error.message,
      }).catch((trackError) => {
        console.warn("Failed to track copy event:", trackError);
      });
    } finally {
      // 300ms后重置状态
      setTimeout(() => {
        copyOperationStates.copyUrl = false;
      }, 300);
    }
  }

  // 创建 markdown 链接格式
  function createMarkdownLink(url, title) {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = processUrl(url, cleaningMode);
    const linkTitle = title || new URL(url).hostname;
    return `[${linkTitle}](${processedUrl})`;
  }

  // 复制 markdown 链接
  async function copyMarkdown() {
    if (copyOperationStates.copyMarkdown) {
      return; // 防止重复执行
    }

    copyOperationStates.copyMarkdown = true;
    const startTime = Date.now();

    try {
      const markdownLink = createMarkdownLink(currentUrl, currentTitle);

      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownLink);
        console.log("Popup markdown clipboard API copy successful");
      } else {
        fallbackCopy(markdownLink);
      }

      // 记录成功的复制事件
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      trackCopy({
        format: "markdown",
        source: "popup",
        success: true,
        urlCleaning: cleaningMode,
        duration,
      }).catch((error) => {
        console.warn("Failed to track markdown copy event:", error);
      });

      showArcNotification(getLocalMessage("markdownCopied"));
    } catch (error) {
      console.error("Markdown复制失败:", error);
      let fallbackSuccess = false;

      // 使用fallback复制方法
      try {
        const markdownLink = createMarkdownLink(currentUrl, currentTitle);
        fallbackCopy(markdownLink);
        fallbackSuccess = true;
        showArcNotification(getLocalMessage("markdownCopied"));
      } catch (fallbackError) {
        console.error("Markdown降级复制也失败:", fallbackError);
      }

      // 记录复制事件（成功或失败）
      const duration = Date.now() - startTime;
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      trackCopy({
        format: "markdown",
        source: "popup",
        success: fallbackSuccess,
        urlCleaning: cleaningMode,
        duration,
        errorType: fallbackSuccess ? null : "clipboard",
        errorMessage: fallbackSuccess ? null : error.message,
      }).catch((trackError) => {
        console.warn("Failed to track markdown copy event:", trackError);
      });
    } finally {
      // 300ms后重置状态
      setTimeout(() => {
        copyOperationStates.copyMarkdown = false;
      }, 300);
    }
  }

  // 生成短链
  async function generateShortUrl() {
    // 强化防抖：如果正在生成短链，直接返回
    if (copyOperationStates.generateShortUrl) {
      return;
    }

    if (!currentUrl) {
      showArcNotification(getLocalMessage("noUrl") || "No URL available");
      return;
    }

    // 验证URL是否适合生成短链
    if (!isValidWebUrl(currentUrl)) {
      showArcNotification(
        getLocalMessage("invalidUrlForShortening") ||
          "This URL cannot be shortened",
      );
      return;
    }

    // 设置防抖状态
    copyOperationStates.generateShortUrl = true;

    // 显示加载状态
    const originalText = elements.shortUrlBtn.querySelector("span").textContent;
    const loadingText = getLocalMessage("generating") || "Generating...";
    elements.shortUrlBtn.querySelector("span").textContent = loadingText;
    elements.shortUrlBtn.disabled = true;

    try {
      // Get short URL service from storage
      const result = await chrome.storage.sync.get(["shortUrlService"]);
      const selectedService = result.shortUrlService || "isgd";

      // 获取当前的URL清理模式
      const cleaningSelect = elements.removeParamsToggle;
      const cleaningMode = cleaningSelect.getAttribute("data-value");

      // 首先检查缓存
      const cachedShortUrl = await shortUrlCache.get(
        currentUrl,
        selectedService,
        cleaningMode,
      );
      if (cachedShortUrl) {
        // 使用缓存的短链
        console.log("使用缓存的短链:", cachedShortUrl);

        // 复制短链到剪贴板
        let copySuccess = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(cachedShortUrl);
            copySuccess = true;
          } else {
            fallbackCopy(cachedShortUrl);
            copySuccess = true;
          }
        } catch (error) {
          console.error("短链复制失败:", error);
        }

        // 记录短链复制事件（缓存）
        trackCopy({
          format: "shortUrl",
          source: "popup",
          success: copySuccess,
          shortService: selectedService,
          duration: Date.now() - startTime,
          errorType: copySuccess ? null : "clipboard",
          errorMessage: copySuccess ? null : "Cache copy failed",
        }).catch((error) => {
          console.warn("Failed to track cached shortUrl copy:", error);
        });

        // 显示成功通知
        const serviceName =
          SHORT_URL_SERVICES[selectedService]?.name || selectedService;
        showArcNotification(
          getLocalMessage("shortUrlGenerated") ||
            `Short URL generated and copied! (${serviceName})`,
        );

        return; // 直接返回，不需要发送API请求
      }

      // 通过 background script 生成短链
      const response = await chrome.runtime.sendMessage({
        action: "createShortUrl",
        url: currentUrl,
        service: selectedService,
      });

      if (response.success) {
        // 将新生成的短链保存到缓存
        await shortUrlCache.set(
          currentUrl,
          selectedService,
          cleaningMode,
          response.shortUrl,
        );
        console.log("短链已缓存:", response.shortUrl);

        // 复制短链到剪贴板
        let copySuccess = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(response.shortUrl);
            copySuccess = true;
          } else {
            fallbackCopy(response.shortUrl);
            copySuccess = true;
          }
        } catch (error) {
          console.error("短链复制失败:", error);
        }

        // 记录短链复制事件（新生成）
        trackCopy({
          format: "shortUrl",
          source: "popup",
          success: copySuccess,
          shortService: selectedService,
          duration: Date.now() - startTime,
          errorType: copySuccess ? null : "clipboard",
          errorMessage: copySuccess ? null : "Generated copy failed",
        }).catch((error) => {
          console.warn("Failed to track generated shortUrl copy:", error);
        });

        // 显示成功通知
        const serviceName =
          SHORT_URL_SERVICES[selectedService]?.name || selectedService;
        showArcNotification(
          getLocalMessage("shortUrlGenerated") ||
            `Short URL generated and copied! (${serviceName})`,
        );

        // 检查Chrome通知设置
        const settings = await chrome.storage.sync.get(["chromeNotifications"]);
        const chromeNotificationsEnabled =
          settings.chromeNotifications !== false;

        if (chromeNotificationsEnabled) {
          try {
            const notificationOptions = {
              type: "basic",
              iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
              title: EXTENSION_NAME,
              message:
                getLocalMessage("shortUrlGenerated") ||
                `Short URL generated: ${response.shortUrl}`,
            };

            chrome.notifications.create(
              notificationOptions,
              (notificationId) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "通知创建失败:",
                    chrome.runtime.lastError.message ||
                      chrome.runtime.lastError,
                  );
                } else {
                  console.log("通知创建成功:", notificationId);
                }
              },
            );
          } catch (error) {
            console.error("通知 API 调用失败:", error);
          }
        }
      } else {
        throw new Error(response.error || "Failed to generate short URL");
      }
    } catch (error) {
      console.error("生成短链失败:", error);
      showArcNotification(
        getLocalMessage("shortUrlFailed") || "Failed to generate short URL",
      );
    } finally {
      // 恢复按钮状态
      elements.shortUrlBtn.querySelector("span").textContent = originalText;
      elements.shortUrlBtn.disabled = false;

      // 重置防抖状态（使用更长的延迟避免重复请求）
      setTimeout(() => {
        copyOperationStates.generateShortUrl = false;
      }, 1000);
    }
  }

  // 显示复制成功状态
  async function showStatus() {
    // 显示Arc风格通知
    showArcNotification(getLocalMessage("urlCopied"));

    // 检查Chrome通知设置
    const settings = await chrome.storage.sync.get(["chromeNotifications"]);
    const chromeNotificationsEnabled = settings.chromeNotifications !== false;

    if (chromeNotificationsEnabled) {
      try {
        const notificationOptions = {
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
          title: EXTENSION_NAME,
          message: getLocalMessage("urlCopied"),
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
      } catch (error) {
        console.error("通知 API 调用失败:", error);
      }
    }
  }

  // 复制二维码图片到剪贴板
  async function copyQRCodeImage() {
    if (copyOperationStates.copyQRCode) {
      return; // 防止重复执行
    }

    copyOperationStates.copyQRCode = true;
    const startTime = Date.now();

    try {
      const canvas = elements.qrCodeContainer.querySelector("canvas");
      if (!canvas) {
        throw new Error("未找到二维码canvas元素");
      }

      // 将canvas转换为blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("无法生成二维码图片");
        }

        try {
          // 使用现代clipboard API复制图片
          if (navigator.clipboard && navigator.clipboard.write) {
            const clipboardItem = new ClipboardItem({ "image/png": blob });
            await navigator.clipboard.write([clipboardItem]);

            // 记录成功的QR码复制事件
            const duration = Date.now() - startTime;
            trackCopy({
              format: "qrcode",
              source: "popup",
              success: true,
              duration,
            }).catch((error) => {
              console.warn("Failed to track QR code copy:", error);
            });

            // 复制成功后立即关闭二维码模态框
            hideQRModal();

            // 关闭弹窗后显示成功通知
            setTimeout(() => {
              showArcNotification(
                getLocalMessage("qrCodeCopied") || "二维码图片已复制",
              );
            }, 200);
          } else {
            throw new Error("浏览器不支持图片复制功能");
          }
        } catch (error) {
          console.error("复制二维码图片失败:", error);

          // 记录失败的QR码复制事件
          const duration = Date.now() - startTime;
          trackCopy({
            format: "qrcode",
            source: "popup",
            success: false,
            duration,
            errorType: "clipboard",
            errorMessage: error.message,
          }).catch((trackError) => {
            console.warn("Failed to track QR code copy error:", trackError);
          });

          showArcNotification(
            getLocalMessage("qrCodeCopyFailed") || "二维码图片复制失败",
          );
        } finally {
          // 重置状态
          setTimeout(() => {
            copyOperationStates.copyQRCode = false;
          }, 300);
        }
      }, "image/png");
    } catch (error) {
      console.error("处理二维码图片失败:", error);
      showArcNotification(
        getLocalMessage("qrCodeCopyFailed") || "二维码图片复制失败",
      );
      // 重置状态
      setTimeout(() => {
        copyOperationStates.copyQRCode = false;
      }, 300);
    }
  }

  // 生成二维码
  function generateQRCode(url) {
    // 清空容器
    elements.qrCodeContainer.innerHTML = "";

    // 根据当前主题选择二维码颜色
    const isDarkTheme =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (document.documentElement.getAttribute("data-theme") !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    // 创建二维码
    new QRCode(elements.qrCodeContainer, {
      text: url,
      width: 200,
      height: 200,
      colorDark: isDarkTheme ? "#f1f5f9" : "#000000",
      colorLight: isDarkTheme ? "#1e293b" : "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    // 显示URL
    elements.qrUrlDisplay.textContent = url;
  }

  // 显示二维码模态框
  function showQRModal() {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = processUrl(currentUrl, cleaningMode);

    generateQRCode(processedUrl);
    elements.qrModal.classList.add("show");
  }

  // 隐藏二维码模态框
  function hideQRModal() {
    elements.qrModal.classList.remove("show");
  }

  // 初始化二维码模态框事件
  function initializeQRModal() {
    // 点击关闭按钮
    elements.qrModalClose.addEventListener("click", hideQRModal);

    // 点击遮罩层关闭
    elements.qrModalOverlay.addEventListener("click", hideQRModal);

    // 按ESC键关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && elements.qrModal.classList.contains("show")) {
        hideQRModal();
      }
    });
  }

  // 打开批量复制页面
  function openBatchCopyPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("batch/batch.html"),
    });
  }

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);
  elements.markdownBtn.addEventListener("click", copyMarkdown);
  elements.shortUrlBtn.addEventListener("click", generateShortUrl);
  elements.qrBtn.addEventListener("click", showQRModal);
  elements.batchBtn.addEventListener("click", openBatchCopyPage);
  elements.qrCopyBtn.addEventListener("click", copyQRCodeImage);

  elements.silentCopyFormat.addEventListener(
    "change",
    handleSilentCopyFormatChange,
  );

  // 更多设置按钮事件
  elements.moreSettingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
      e.preventDefault();
      copyUrl();
    }
  });

  // 初始化
  loadVersion(); // Load version from manifest
  const urlCleaningSwitch = initializeUrlCleaningSelect();
  initializeQRModal(); // Initialize QR modal
  setupTemplateChangeListener(); // 设置模板变更监听器

  // 先加载设置获取保存的值，然后加载模板并恢复选择
  const settings = await loadSettings();
  await loadCustomTemplates(settings.silentCopyFormat); // 加载自定义模板并恢复保存的值
  await initializeTheme(); // Initialize theme after loading settings
  await initializeI18n(); // Load UI with saved language
  await getCurrentUrl();

  // 在DOM和本地化完成后重新计算滑块位置
  setTimeout(() => {
    if (urlCleaningSwitch && urlCleaningSwitch.updateSliderPosition) {
      urlCleaningSwitch.updateSliderPosition();
    }
  }, 100);
});
