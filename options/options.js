import { getMessage } from "../shared/constants.js";

document.addEventListener("DOMContentLoaded", async () => {
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
  function getLocalMessage(key, substitutions = []) {
    if (localeMessages[key] && localeMessages[key].message) {
      return localeMessages[key].message;
    }
    // Fallback to Chrome i18n API
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // DOM elements
  const elements = {
    version: document.getElementById("version"),
    aboutVersion: document.getElementById("aboutVersion"),
    shortUrlServiceSelect: document.getElementById("shortUrlServiceSelect"),
    notificationCheckbox: document.getElementById("notificationCheckbox"),
    languageSelect: document.getElementById("languageSelect"),
    appearanceSwitch: document.getElementById("appearanceSwitch"),
    colorPicker: document.getElementById("colorPicker"),
    notification: document.getElementById("notification"),
  };

  // Load version from manifest
  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      const version = `v${manifest.version}`;
      elements.version.textContent = version;
      elements.aboutVersion.textContent = version;
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

    // Update page title
    document.title =
      getLocalMessage("optionsTitle") || "Arclet Copier - Settings";
  }

  // Show notification
  function showNotification(message, type = "success") {
    if (!elements.notification) return;

    const notificationText =
      elements.notification.querySelector(".notification-text");
    if (notificationText) {
      notificationText.textContent = message;
    }

    // Apply notification type styles
    elements.notification.className = "notification show";

    // Auto hide after 3 seconds
    setTimeout(() => {
      elements.notification.classList.remove("show");
    }, 3000);
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

  // 初始化颜色选择器
  function initializeColorPicker() {
    if (!elements.colorPicker) return;

    const colorOptions = elements.colorPicker.querySelectorAll(".color-option");

    colorOptions.forEach((option) => {
      option.addEventListener("click", async () => {
        const selectedColor = option.getAttribute("data-color");

        // 更新UI状态
        colorOptions.forEach((opt) => opt.classList.remove("active"));
        option.classList.add("active");

        // 应用新的主题色
        applyThemeColor(selectedColor);

        // 保存设置
        await saveSettings();

        // 显示通知
        showNotification(
          getLocalMessage("themeColorChanged") ||
            "Theme color changed successfully!",
        );
      });
    });
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
        showNotification(
          getLocalMessage("appearanceChanged") ||
            "Appearance changed successfully!",
        );
      },
    );
  }

  // 初始化主题
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
      "shortUrlService",
      "appearance",
      "language",
      "themeColor",
      "chromeNotifications",
    ]);

    // Load short URL service setting
    elements.shortUrlServiceSelect.value = result.shortUrlService || "isgd";

    // Load appearance setting
    const savedAppearance = result.appearance || "system";
    if (elements.appearanceSwitch) {
      elements.appearanceSwitch.setAttribute("data-value", savedAppearance);
    }

    // Load language setting, default to browser language or zh_CN
    const browserLang = chrome.i18n.getUILanguage();
    let defaultLang = "en"; // default fallback
    if (browserLang.startsWith("zh")) {
      defaultLang = "zh_CN";
    } else if (browserLang.startsWith("es")) {
      defaultLang = "es";
    } else if (browserLang.startsWith("ja")) {
      defaultLang = "ja";
    } else if (browserLang.startsWith("de")) {
      defaultLang = "de";
    }
    const savedLanguage = result.language || defaultLang;
    elements.languageSelect.value = savedLanguage;
    currentLocale = savedLanguage;

    // Load theme color setting, default to green
    const savedThemeColor = result.themeColor || "green";
    applyThemeColor(savedThemeColor);

    // Update color picker UI
    if (elements.colorPicker) {
      const colorOptions =
        elements.colorPicker.querySelectorAll(".color-option");
      colorOptions.forEach((option) => {
        option.classList.toggle(
          "active",
          option.getAttribute("data-color") === savedThemeColor,
        );
      });
    }

    // Load Chrome notifications setting, default to true
    const chromeNotificationsEnabled = result.chromeNotifications !== false;
    elements.notificationCheckbox.checked = chromeNotificationsEnabled;
  }

  // 保存设置
  async function saveSettings() {
    const appearanceSwitch = elements.appearanceSwitch;

    // 获取当前选中的主题色
    const selectedColorOption = elements.colorPicker?.querySelector(
      ".color-option.active",
    );
    const currentThemeColor =
      selectedColorOption?.getAttribute("data-color") || "green";

    await chrome.storage.sync.set({
      shortUrlService: elements.shortUrlServiceSelect.value,
      appearance: appearanceSwitch.getAttribute("data-value"),
      language: elements.languageSelect.value,
      themeColor: currentThemeColor,
      chromeNotifications: elements.notificationCheckbox.checked,
    });
  }

  // 事件监听器
  function initializeEventListeners() {
    // Short URL service select
    elements.shortUrlServiceSelect.addEventListener("change", async () => {
      await saveSettings();
      showNotification(
        getLocalMessage("shortUrlServiceChanged") ||
          "Short URL service changed successfully!",
      );
    });

    // Notification checkbox
    elements.notificationCheckbox.addEventListener("change", async () => {
      await saveSettings();
      const message = elements.notificationCheckbox.checked
        ? getLocalMessage("notificationsEnabled") || "Notifications enabled"
        : getLocalMessage("notificationsDisabled") || "Notifications disabled";
      showNotification(message);
    });

    // Language select
    elements.languageSelect.addEventListener("change", async () => {
      const newLanguage = elements.languageSelect.value;
      currentLocale = newLanguage;

      await saveSettings();
      await initializeI18n(newLanguage);

      showNotification(
        getLocalMessage("languageChangeNotification") ||
          "Language changed successfully!",
      );
    });
  }

  // 初始化所有组件
  async function initialize() {
    // Load version
    loadVersion();

    // Load settings first
    await loadSettings();

    // Initialize theme before i18n
    await initializeTheme();

    // Initialize i18n
    await initializeI18n(currentLocale);

    // Initialize UI components
    initializeAppearanceSwitch();
    initializeColorPicker();
    initializeEventListeners();
  }

  // Start initialization
  await initialize();
});
