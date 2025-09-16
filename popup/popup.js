import {
  processUrl,
  isRestrictedPage,
  getMessage,
} from "../shared/constants.js";

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

  // i18n helper function (using local one for popup specific behavior)
  function getLocalMessage(key, substitutions = []) {
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
    appearanceSwitch: document.getElementById("appearanceSwitch"),
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

      // 计算滑块位置和宽度
      const optionWidth = switchOptions[currentIndex].offsetWidth;
      const optionLeft = switchOptions[currentIndex].offsetLeft;

      // 更新CSS变量来控制滑块
      switchElement.style.setProperty("--slider-width", `${optionWidth}px`);
      switchElement.style.setProperty("--slider-x", `${optionLeft}px`);
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
        updateUrlDisplay();
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

  // 初始化外观滑块
  function initializeAppearanceSwitch() {
    const appearanceOptions = [
      { value: "system", key: null },
      { value: "light", key: null },
      { value: "dark", key: null },
    ];

    return initializeThreeWaySwitch(
      elements.appearanceSwitch,
      appearanceOptions,
      async (value) => {
        applyTheme(value);
        await saveSettings();
        showArcNotification(
          getLocalMessage("appearanceChanged") ||
            "Appearance changed successfully!",
        );
      },
    );
  }

  async function initializeTheme() {
    const result = await chrome.storage.sync.get(["appearance"]);
    const savedTheme = result.appearance || "system";

    // 设置滑块初始值
    if (elements.appearanceSwitch) {
      elements.appearanceSwitch.setAttribute("data-value", savedTheme);
    }

    applyTheme(savedTheme);

    // 监听系统主题变化
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", () => {
        const currentTheme =
          elements.appearanceSwitch.getAttribute("data-value");
        if (currentTheme === "system") {
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
    if (elements.appearanceSwitch) {
      elements.appearanceSwitch.setAttribute("data-value", savedAppearance);
    }

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
    const appearanceSwitch = elements.appearanceSwitch;

    await chrome.storage.sync.set({
      urlCleaning: cleaningSelect.getAttribute("data-value"),
      silentCopyFormat: elements.silentCopyFormat.value,
      appearance: appearanceSwitch.getAttribute("data-value"),
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
        getLocalMessage("languageChangeNotification") ||
          "Language changed successfully!",
      );
    }
  }

  // Handle silent copy format change
  async function handleSilentCopyFormatChange() {
    await saveSettings();
    showArcNotification(getLocalMessage("silentCopyFormatChanged"));
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
        handleError(getLocalMessage("noUrl"));
      }
    } catch (error) {
      console.error("获取 URL 失败:", error);
      handleError(getLocalMessage("getUrlFailed"));
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

      showArcNotification(getLocalMessage("markdownCopied"));
    } catch (error) {
      console.error("Markdown复制失败:", error);
      // 对于特殊页面，不要报错，只是静默失败并显示成功状态
      if (isRestrictedPage(currentUrl)) {
        console.log("特殊页面，使用fallback复制 Markdown");
        try {
          fallbackCopy(markdownLink);
          showArcNotification(getLocalMessage("markdownCopied"));
        } catch (fallbackError) {
          console.error("特殊页面 Markdown 降级复制失败:", fallbackError);
        }
      } else {
        try {
          fallbackCopy(markdownLink);
          showArcNotification(getLocalMessage("markdownCopied"));
        } catch (fallbackError) {
          console.error("Markdown降级复制也失败:", fallbackError);
        }
      }
    }
  }

  // 显示复制成功状态
  function showStatus() {
    // 显示Arc风格通知
    showArcNotification(getLocalMessage("urlCopied"));

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
  const urlCleaningSwitch = initializeUrlCleaningSelect();
  const appearanceSwitch = initializeAppearanceSwitch();
  initializeQRModal(); // Initialize QR modal
  await loadSettings();
  await initializeTheme(); // Initialize theme after loading settings
  await initializeI18n(); // Load UI with saved language
  await getCurrentUrl();

  // 在DOM和本地化完成后重新计算滑块位置
  setTimeout(() => {
    if (urlCleaningSwitch && urlCleaningSwitch.updateSliderPosition) {
      urlCleaningSwitch.updateSliderPosition();
    }
    if (appearanceSwitch && appearanceSwitch.updateSliderPosition) {
      appearanceSwitch.updateSliderPosition();
    }
  }, 100);
});
