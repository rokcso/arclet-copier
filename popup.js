document.addEventListener("DOMContentLoaded", async () => {
  // Constants
  const EXTENSION_NAME = chrome.i18n.getMessage("extName");

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

  // i18n helper function
  function getMessage(key, substitutions = []) {
    if (localeMessages[key] && localeMessages[key].message) {
      return localeMessages[key].message;
    }
    // Fallback to Chrome i18n API
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // DOM elements
  const elements = {
    urlDisplay: document.getElementById("urlDisplay"),
    copyBtn: document.getElementById("copyBtn"),
    markdownBtn: document.getElementById("markdownBtn"),
    qrBtn: document.getElementById("qrBtn"),
    status: document.getElementById("status"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
    silentCopyFormat: document.getElementById("silentCopyFormat"),
    appearanceSelect: document.getElementById("appearanceSelect"),
    languageSelect: document.getElementById("languageSelect"),
    version: document.getElementById("version"),
    qrModal: document.getElementById("qrModal"),
    qrModalOverlay: document.getElementById("qrModalOverlay"),
    qrModalClose: document.getElementById("qrModalClose"),
    qrCodeContainer: document.getElementById("qrCodeContainer"),
    qrUrlDisplay: document.getElementById("qrUrlDisplay"),
  };

  let currentUrl = "";
  let currentTitle = "";

  // URL参数分类定义
  const PARAM_CATEGORIES = {
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
      const message = getMessage(key);
      if (message && message !== key) {
        if (element.tagName === "INPUT" && element.type === "text") {
          element.placeholder = message;
        } else {
          element.textContent = message;
        }
      }
    });
  }

  // 初始化URL清理选择器
  function initializeUrlCleaningSelect() {
    const cleaningSwitch = elements.removeParamsToggle;
    const switchOptions = cleaningSwitch.querySelectorAll(".switch-option");

    // 为每个选项添加点击事件
    switchOptions.forEach((option, index) => {
      option.addEventListener("click", () => {
        let mode = "";
        switch (index) {
          case 0:
            mode = "off";
            break;
          case 1:
            mode = "smart";
            break;
          case 2:
            mode = "aggressive";
            break;
        }

        // 更新开关状态
        cleaningSwitch.setAttribute("data-value", mode);

        // 显示通知
        let notificationKey = "";
        switch (mode) {
          case "off":
            notificationKey = "cleaningDisabled";
            break;
          case "smart":
            notificationKey = "smartCleaningEnabled";
            break;
          case "aggressive":
            notificationKey = "aggressiveCleaningEnabled";
            break;
        }

        if (notificationKey) {
          showArcNotification(getMessage(notificationKey));
        }

        saveSettings();
        updateUrlDisplay();
      });
    });
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

  async function initializeTheme() {
    const result = await chrome.storage.sync.get(["appearance"]);
    const savedTheme = result.appearance || "system";
    elements.appearanceSelect.value = savedTheme;
    applyTheme(savedTheme);

    // 监听系统主题变化
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        if (elements.appearanceSelect.value === "system") {
          applyTheme("system");
        }
      });
    }
  }

  async function handleAppearanceChange() {
    const selectedTheme = elements.appearanceSelect.value;
    applyTheme(selectedTheme);
    await saveSettings();
    showArcNotification(
      getMessage("appearanceChanged") || "Appearance changed successfully!",
    );
  }

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      "removeParams",
      "urlCleaning",
      "silentCopyFormat",
      "appearance",
      "language",
    ]);

    // 处理向后兼容：将旧的boolean设置转换为新的字符串设置
    let cleaningMode = result.urlCleaning;
    if (!cleaningMode && typeof result.removeParams === "boolean") {
      cleaningMode = result.removeParams ? "aggressive" : "off";
    }
    cleaningMode = cleaningMode || "smart";

    const cleaningSelect = elements.removeParamsToggle;
    cleaningSelect.setAttribute("data-value", cleaningMode);

    elements.silentCopyFormat.value = result.silentCopyFormat || "url";

    // Load appearance setting
    const savedAppearance = result.appearance || "system";
    elements.appearanceSelect.value = savedAppearance;

    // Load language setting, default to browser language or zh_CN
    const browserLang = chrome.i18n.getUILanguage();
    const defaultLang = browserLang.startsWith("zh") ? "zh_CN" : "en";
    const savedLanguage = result.language || defaultLang;
    elements.languageSelect.value = savedLanguage;
    currentLocale = savedLanguage;
  }

  // 保存设置
  async function saveSettings() {
    const cleaningSelect = elements.removeParamsToggle;

    await chrome.storage.sync.set({
      urlCleaning: cleaningSelect.getAttribute("data-value"),
      silentCopyFormat: elements.silentCopyFormat.value,
      appearance: elements.appearanceSelect.value,
      language: elements.languageSelect.value,
    });
  }

  // Handle language change
  async function handleLanguageChange() {
    const newLocale = elements.languageSelect.value;
    if (newLocale !== currentLocale) {
      // Update locale and re-initialize UI
      await initializeI18n(newLocale);
      await saveSettings();

      // Update URL display with new language
      updateUrlDisplay();

      // Show notification in new language
      showArcNotification(
        getMessage("languageChangeNotification") ||
          "Language changed successfully!",
      );
    }
  }

  // Handle silent copy format change
  async function handleSilentCopyFormatChange() {
    await saveSettings();
    showArcNotification(getMessage("silentCopyFormatChanged"));
  }

  // 判断参数是否应该保留
  function shouldKeepParameter(paramName, cleaningMode) {
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

  // 智能处理URL参数
  function processUrl(url, cleaningMode = "smart") {
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

  // 获取页面标题
  async function getPageTitle(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => document.title,
      });
      return results[0]?.result || "";
    } catch (error) {
      console.error("获取页面标题失败:", error);
      return "";
    }
  }

  // 检查是否为特殊页面 (chrome://, edge://, about: 等内部页面)
  function isRestrictedPage(url) {
    if (!url) return true;
    const restrictedProtocols = [
      "chrome:",
      "chrome-extension:",
      "edge:",
      "about:",
      "moz-extension:",
    ];
    return restrictedProtocols.some((protocol) => url.startsWith(protocol));
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

        // 获取页面标题，但在特殊页面跳过脚本注入
        if (tab.id && !isRestrictedPage(tab.url)) {
          currentTitle = await getPageTitle(tab.id);
        } else if (isRestrictedPage(tab.url)) {
          // 对于特殊页面，使用tab.title或从URL生成标题
          currentTitle = tab.title || new URL(tab.url).hostname || "特殊页面";
        }

        updateUrlDisplay();
      } else {
        handleError(getMessage("noUrl"));
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      handleError(getMessage("getUrlFailed"));
    }
  }

  // 处理错误状态
  function handleError(message) {
    elements.urlDisplay.textContent = message;
    elements.copyBtn.disabled = true;
    elements.markdownBtn.disabled = true;
  }

  // 更新URL显示
  function updateUrlDisplay() {
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = processUrl(currentUrl, cleaningMode);
    elements.urlDisplay.textContent = processedUrl;
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
    const cleaningSelect = elements.removeParamsToggle;
    const cleaningMode = cleaningSelect.getAttribute("data-value");
    const processedUrl = processUrl(currentUrl, cleaningMode);

    try {
      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(processedUrl);
        console.log("Popup clipboard API copy successful");
      } else {
        fallbackCopy(processedUrl);
      }

      showStatus();
    } catch (error) {
      console.error("复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (isRestrictedPage(currentUrl)) {
        console.log("特殊页面，使用fallback复制");
        try {
          fallbackCopy(processedUrl);
          showStatus();
        } catch (fallbackError) {
          console.error("特殊页面降级复制失败:", fallbackError);
          // 移除自动显示成功状态，避免在popup打开时误触发
        }
      } else {
        try {
          fallbackCopy(processedUrl);
          showStatus();
        } catch (fallbackError) {
          console.error("降级复制也失败:", fallbackError);
        }
      }
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
    const markdownLink = createMarkdownLink(currentUrl, currentTitle);

    try {
      // 首先尝试现代clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdownLink);
        console.log("Popup markdown clipboard API copy successful");
      } else {
        fallbackCopy(markdownLink);
      }

      showArcNotification(getMessage("markdownCopied"));
    } catch (error) {
      console.error("Markdown复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (isRestrictedPage(currentUrl)) {
        console.log("特殊页面，使用fallback复制 Markdown");
        try {
          fallbackCopy(markdownLink);
          showArcNotification(getMessage("markdownCopied"));
        } catch (fallbackError) {
          console.error("特殊页面 Markdown 降级复制失败:", fallbackError);
          // 移除自动显示成功状态，避免在popup打开时误触发
        }
      } else {
        try {
          fallbackCopy(markdownLink);
          showArcNotification(getMessage("markdownCopied"));
        } catch (fallbackError) {
          console.error("Markdown降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 显示按钮复制成功状态

  // 显示复制成功状态
  function showStatus() {
    // 显示按钮交互效果

    // 显示Arc风格通知
    showArcNotification(getMessage("urlCopied"));

    try {
      const notificationOptions = {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: EXTENSION_NAME,
        message: getMessage("urlCopied"),
      };

      chrome.notifications.create(notificationOptions, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error("通知创建失败:", chrome.runtime.lastError);
        } else {
          console.log("通知创建成功:", notificationId);
        }
      });
    } catch (error) {
      console.error("通知 API 调用失败:", error);
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

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);
  elements.markdownBtn.addEventListener("click", copyMarkdown);
  elements.qrBtn.addEventListener("click", showQRModal);

  elements.silentCopyFormat.addEventListener(
    "change",
    handleSilentCopyFormatChange,
  );
  elements.appearanceSelect.addEventListener("change", handleAppearanceChange);
  elements.languageSelect.addEventListener("change", handleLanguageChange);

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
      e.preventDefault();
      copyUrl();
    }
  });

  // 初始化
  loadVersion(); // Load version from manifest
  initializeUrlCleaningSelect();
  initializeQRModal(); // Initialize QR modal
  await loadSettings();
  await initializeTheme(); // Initialize theme after loading settings
  await initializeI18n(); // Load UI with saved language
  await getCurrentUrl();
});
