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
    status: document.getElementById("status"),
    removeParamsToggle: document.getElementById("removeParamsToggle"),
    silentCopyFormat: document.getElementById("silentCopyFormat"),
    languageSelect: document.getElementById("languageSelect"),
  };

  let currentUrl = "";
  let currentTitle = "";

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

  // 初始化切换开关
  function initializeToggleSwitch() {
    const toggleSwitch = elements.removeParamsToggle;
    const hiddenInput = toggleSwitch.querySelector('input[type="checkbox"]');

    toggleSwitch.addEventListener("click", (e) => {
      e.preventDefault();
      const isActive = toggleSwitch.classList.contains("active");

      if (isActive) {
        toggleSwitch.classList.remove("active");
        if (hiddenInput) hiddenInput.checked = false;
      } else {
        toggleSwitch.classList.add("active");
        if (hiddenInput) hiddenInput.checked = true;
      }

      saveSettings();
      updateUrlDisplay();
    });
  }

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      "removeParams",
      "silentCopyFormat",
      "language",
    ]);

    const removeParams = result.removeParams || false;
    const toggleSwitch = elements.removeParamsToggle;
    const hiddenInput = toggleSwitch.querySelector('input[type="checkbox"]');

    if (removeParams) {
      toggleSwitch.classList.add("active");
      if (hiddenInput) hiddenInput.checked = true;
    } else {
      toggleSwitch.classList.remove("active");
      if (hiddenInput) hiddenInput.checked = false;
    }

    elements.silentCopyFormat.value = result.silentCopyFormat || "url";

    // Load language setting, default to browser language or zh_CN
    const browserLang = chrome.i18n.getUILanguage();
    const defaultLang = browserLang.startsWith("zh") ? "zh_CN" : "en";
    const savedLanguage = result.language || defaultLang;
    elements.languageSelect.value = savedLanguage;
    currentLocale = savedLanguage;
  }

  // 保存设置
  async function saveSettings() {
    const toggleSwitch = elements.removeParamsToggle;
    const removeParams = toggleSwitch.classList.contains("active");

    await chrome.storage.sync.set({
      removeParams: removeParams,
      silentCopyFormat: elements.silentCopyFormat.value,
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

  // 处理URL参数
  function processUrl(url, removeParams) {
    if (!removeParams) {
      return url;
    }

    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
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
    const toggleSwitch = elements.removeParamsToggle;
    const removeParams = toggleSwitch.classList.contains("active");
    const processedUrl = processUrl(currentUrl, removeParams);
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
    }, 500);
  }

  // 复制URL到剪贴板
  async function copyUrl() {
    const toggleSwitch = elements.removeParamsToggle;
    const removeParams = toggleSwitch.classList.contains("active");
    const processedUrl = processUrl(currentUrl, removeParams);

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
    const toggleSwitch = elements.removeParamsToggle;
    const removeParams = toggleSwitch.classList.contains("active");
    const processedUrl = processUrl(url, removeParams);
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

  // 事件监听器
  elements.copyBtn.addEventListener("click", copyUrl);
  elements.markdownBtn.addEventListener("click", copyMarkdown);

  elements.silentCopyFormat.addEventListener("change", saveSettings);
  elements.languageSelect.addEventListener("change", handleLanguageChange);

  // 键盘快捷键
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c" && !e.shiftKey) {
      e.preventDefault();
      copyUrl();
    }
  });

  // 初始化
  initializeToggleSwitch();
  await loadSettings();
  await initializeI18n(); // Load UI with saved language
  await getCurrentUrl();
});
