import {
  getMessage,
  getAllTemplates,
  getCustomTemplates,
  saveCustomTemplates,
  createTemplate,
  templateEngine,
  TEMPLATE_FIELDS,
  TemplateChangeNotifier,
} from "../shared/constants.js";

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
    ratingBtn: document.getElementById("ratingBtn"),
    feedbackBtn: document.getElementById("feedbackBtn"),

    // Template management elements
    templateList: document.getElementById("templateList"),
    addTemplateBtn: document.getElementById("addTemplateBtn"),
    templateModal: document.getElementById("templateModal"),
    templateModalTitle: document.getElementById("templateModalTitle"),
    templateModalClose: document.getElementById("templateModalClose"),
    templateName: document.getElementById("templateName"),
    templateIcon: document.getElementById("templateIcon"),
    templateContent: document.getElementById("templateContent"),
    templatePreview: document.getElementById("templatePreview"),
    templateValidation: document.getElementById("templateValidation"),
    templateSaveBtn: document.getElementById("templateSaveBtn"),
    templateCancelBtn: document.getElementById("templateCancelBtn"),
    previewRefreshBtn: document.getElementById("previewRefreshBtn"),
    moreFieldsBtn: document.getElementById("moreFieldsBtn"),
    moreFieldsPanel: document.getElementById("moreFieldsPanel"),
  };

  // Template management state
  let currentEditingTemplate = null;
  let allTemplates = [];

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

    // Apply localization to all elements with data-i18n-placeholder attribute
    const i18nPlaceholderElements = document.querySelectorAll(
      "[data-i18n-placeholder]",
    );
    i18nPlaceholderElements.forEach((element) => {
      const key = element.getAttribute("data-i18n-placeholder");
      const message = getLocalMessage(key);
      if (message && message !== key) {
        element.placeholder = message;
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

      // 修复滑块位置计算 - 解决超出容器问题
      const optionElement = switchOptions[currentIndex];
      const optionWidth = optionElement.offsetWidth;
      const optionLeft = optionElement.offsetLeft;

      // 获取容器的padding值
      const containerStyle = getComputedStyle(switchElement);
      const containerPadding = parseFloat(containerStyle.paddingLeft);

      // 关键修复：translateX需要减去容器padding，因为滑块已经有left: 3px的基础定位
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

    // Rating button
    elements.ratingBtn.addEventListener("click", () => {
      chrome.tabs.create({
        url: "https://chromewebstore.google.com/detail/mkflehheaokdfopijachhfdbofkppdil",
      });
    });

    // Feedback button
    elements.feedbackBtn.addEventListener("click", () => {
      // Use localized email template from i18n
      const subject = encodeURIComponent(
        getLocalMessage("feedbackEmailSubject"),
      );
      const body = encodeURIComponent(getLocalMessage("feedbackEmailBody"));
      const mailtoUrl = `mailto:hi@rokcso.com?subject=${subject}&body=${body}`;
      chrome.tabs.create({ url: mailtoUrl });
    });
  }

  // Template management functions
  async function loadTemplates() {
    try {
      allTemplates = await getAllTemplates();
      renderTemplateList();
    } catch (error) {
      console.error("Failed to load templates:", error);
      showNotification("Failed to load templates", "error");
    }
  }

  function renderTemplateList() {
    if (!elements.templateList) return;

    elements.templateList.innerHTML = "";

    allTemplates.forEach((template) => {
      const templateItem = createTemplateItem(template);
      elements.templateList.appendChild(templateItem);
    });
  }

  function createTemplateItem(template) {
    const item = document.createElement("div");
    item.className = "template-item";
    item.dataset.templateId = template.id;

    item.innerHTML = `
      <div class="template-header">
        <div class="template-icon">${template.icon}</div>
        <div class="template-name">${escapeHtml(template.name)}</div>
        <div class="template-actions">
          <button class="template-action-btn edit" data-action="edit" title="编辑">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="template-action-btn delete" data-action="delete" title="${getLocalMessage("deleteTemplate") || "删除"}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3,6 5,6 21,6"></polyline>
              <path d="m19,6 v14 a2,2 0 0,1 -2,2 H7 a2,2 0 0,1 -2,-2 V6 m3,0 V4 a2,2 0 0,1 2,-2 h4 a2,2 0 0,1 2,2 v2"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="template-content">${escapeHtml(template.template)}</div>
    `;

    // Add event listeners for actions
    const editBtn = item.querySelector('[data-action="edit"]');
    const deleteBtn = item.querySelector('[data-action="delete"]');

    if (editBtn) {
      editBtn.addEventListener("click", () => editTemplate(template));
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => deleteTemplate(template));
    }

    return item;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function showTemplateModal(template = null) {
    currentEditingTemplate = template;

    if (template) {
      elements.templateModalTitle.textContent =
        getLocalMessage("editTemplate") || "编辑模板";

      elements.templateName.value = template.name;
      elements.templateIcon.value = template.icon;
      elements.templateContent.value = template.template;
    } else {
      elements.templateModalTitle.textContent =
        getLocalMessage("createTemplate") || "创建模板";
      elements.templateName.value = "";
      elements.templateIcon.value = "📝";
      elements.templateContent.value = "";
    }

    updateTemplatePreview();
    validateTemplate();
    elements.templateModal.classList.add("show");
    document.body.classList.add("modal-open"); // 阻止背景滚动
    elements.templateName.focus();
  }

  function hideTemplateModal() {
    elements.templateModal.classList.remove("show");
    document.body.classList.remove("modal-open"); // 恢复背景滚动
    currentEditingTemplate = null;
    clearValidation();
  }

  function editTemplate(template) {
    showTemplateModal(template);
  }

  async function deleteTemplate(template) {
    const confirmMessage =
      getLocalMessage("confirmDeleteTemplate")?.replace(
        "{name}",
        template.name,
      ) || `确定要删除模板"${template.name}"吗？`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const customTemplates = await getCustomTemplates();
      const updatedTemplates = customTemplates.filter(
        (t) => t.id !== template.id,
      );
      await saveCustomTemplates(updatedTemplates);

      // 通知其他页面模板已删除
      await TemplateChangeNotifier.notify("deleted", template.id);

      showNotification(getLocalMessage("templateDeleted") || "模板已删除");

      await loadTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
      showNotification(
        getLocalMessage("templateDeleteFailed") || "删除模板失败",
        "error",
      );
    }
  }

  async function saveTemplate() {
    const name = elements.templateName.value.trim();
    const icon = elements.templateIcon.value.trim();
    const content = elements.templateContent.value.trim();

    if (!name) {
      showValidationError(
        getLocalMessage("templateNameRequired") || "请输入模板名称",
      );
      return;
    }

    if (!content) {
      showValidationError(
        getLocalMessage("templateContentRequired") || "请输入模板内容",
      );
      return;
    }

    const validation = templateEngine.validateTemplate(content);
    if (!validation.valid) {
      showValidationError(validation.errors.join(", "));
      return;
    }

    try {
      const customTemplates = await getCustomTemplates();

      if (currentEditingTemplate) {
        // Update existing template
        const index = customTemplates.findIndex(
          (t) => t.id === currentEditingTemplate.id,
        );
        if (index !== -1) {
          customTemplates[index] = {
            ...currentEditingTemplate,
            name,
            icon,
            template: content,
            lastUsed: new Date().toISOString(),
          };
        }
      } else {
        // Create new template
        const newTemplate = createTemplate(name, content, icon);
        customTemplates.push(newTemplate);
      }

      await saveCustomTemplates(customTemplates);

      // 通知其他页面模板已变更
      if (currentEditingTemplate) {
        await TemplateChangeNotifier.notify(
          "updated",
          currentEditingTemplate.id,
        );
      } else {
        const newTemplateId = customTemplates[customTemplates.length - 1].id;
        await TemplateChangeNotifier.notify("created", newTemplateId);
      }

      showNotification(
        currentEditingTemplate
          ? getLocalMessage("templateUpdated") || "模板已更新"
          : getLocalMessage("templateCreated") || "模板已创建",
      );

      hideTemplateModal();
      await loadTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
      showValidationError(
        getLocalMessage("templateSaveFailed") || "保存模板失败",
      );
    }
  }

  function updateTemplatePreview() {
    const content = elements.templateContent.value.trim();
    const previewContent =
      elements.templatePreview.querySelector(".preview-content");

    if (!content) {
      previewContent.innerHTML = `<span class="preview-placeholder">${getLocalMessage("previewPlaceholder") || "输入模板内容以查看预览"}</span>`;
      return;
    }

    // Create comprehensive mock context for preview based on arcletcopier.com
    const mockContext = {
      url: "https://arcletcopier.com/?utm_source=chrome&utm_medium=extension&utm_campaign=template_test&ref=github#features",
      title:
        "Arclet Copier - Clean & Efficient Chrome Extension for Quick URL Copying",
      urlCleaning: "smart",
      shortUrl: "https://is.gd/ArcletCopy",
    };

    templateEngine
      .processTemplate(content, mockContext)
      .then((result) => {
        previewContent.textContent = result;
      })
      .catch((error) => {
        previewContent.innerHTML = `<span style="color: #ef4444;">预览错误: ${escapeHtml(error.message)}</span>`;
      });
  }

  function validateTemplate() {
    const content = elements.templateContent.value.trim();

    if (!content) {
      clearValidation();
      return;
    }

    const validation = templateEngine.validateTemplate(content);

    if (validation.valid) {
      showValidationSuccess(getLocalMessage("templateValid") || "模板格式正确");
    } else {
      showValidationError(validation.errors.join(", "));
    }

    // Update save button state
    const nameValid = elements.templateName.value.trim().length > 0;
    elements.templateSaveBtn.disabled = !(validation.valid && nameValid);
  }

  function showValidationError(message) {
    elements.templateValidation.className = "template-validation error";
    elements.templateValidation.textContent = message;
  }

  function showValidationSuccess(message) {
    elements.templateValidation.className = "template-validation success";
    elements.templateValidation.textContent = message;
  }

  function clearValidation() {
    elements.templateValidation.className = "template-validation";
    elements.templateValidation.textContent = "";
  }

  function insertField(fieldName) {
    const textarea = elements.templateContent;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const fieldText = `{{${fieldName}}}`;

    textarea.value = text.substring(0, start) + fieldText + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(
      start + fieldText.length,
      start + fieldText.length,
    );

    updateTemplatePreview();
    validateTemplate();
  }

  function toggleMoreFields() {
    const panel = elements.moreFieldsPanel;
    const btn = elements.moreFieldsBtn;

    if (panel.classList.contains("show")) {
      panel.classList.remove("show");
      btn.textContent = getLocalMessage("moreFieldsBtn") + " ▼";
    } else {
      panel.classList.add("show");
      btn.textContent = getLocalMessage("moreFieldsBtn") + " ▲";
    }
  }

  function initializeTemplateManagement() {
    if (!elements.templateList) return;

    // Add template button
    elements.addTemplateBtn?.addEventListener("click", () => {
      showTemplateModal();
    });

    // Modal close events
    elements.templateModalClose?.addEventListener("click", hideTemplateModal);
    elements.templateCancelBtn?.addEventListener("click", hideTemplateModal);

    // Click outside modal to close
    elements.templateModal?.addEventListener("click", (e) => {
      if (e.target === elements.templateModal) {
        hideTemplateModal();
      }
    });

    // Save template
    elements.templateSaveBtn?.addEventListener("click", saveTemplate);

    // Template content changes
    elements.templateContent?.addEventListener("input", () => {
      updateTemplatePreview();
      validateTemplate();
    });

    elements.templateName?.addEventListener("input", validateTemplate);

    // Preview refresh
    elements.previewRefreshBtn?.addEventListener(
      "click",
      updateTemplatePreview,
    );

    // More fields toggle
    elements.moreFieldsBtn?.addEventListener("click", toggleMoreFields);

    // Smart emoji picker functionality
    const emojiPickerTrigger = document.getElementById("emojiPickerTrigger");
    const emojiPicker = document.getElementById("emojiPicker");

    // Curated emoji sets for different categories (local data, no external dependencies)
    const emojiData = {
      common: [
        "📝",
        "📄",
        "💻",
        "📚",
        "📋",
        "🔗",
        "🏷️",
        "⭐",
        "📌",
        "🔖",
        "📂",
        "📁",
        "🗂️",
        "📊",
        "📈",
        "📉",
        "🔧",
        "⚙️",
        "🔨",
      ],
      smileys: [
        "😀",
        "😃",
        "😄",
        "😁",
        "😊",
        "😉",
        "🤗",
        "🤔",
        "😎",
        "🥳",
        "😍",
        "🤩",
        "😘",
        "😋",
        "😜",
        "🤪",
      ],
      hearts: [
        "❤️",
        "💙",
        "💚",
        "💛",
        "🧡",
        "💜",
        "🖤",
        "🤍",
        "💯",
        "💥",
        "💫",
        "✨",
      ],
      nature: [
        "🌱",
        "🌿",
        "🍀",
        "🌳",
        "🌲",
        "🌺",
        "🌸",
        "🌼",
        "🌻",
        "🌹",
        "🌷",
        "💐",
        "🌍",
        "🌎",
        "🌏",
        "🌙",
        "⭐",
        "🌟",
      ],
      activities: [
        "⚽",
        "🏀",
        "🎾",
        "🎯",
        "🎮",
        "🎨",
        "🎭",
        "🎵",
        "🎶",
        "🎤",
        "🎧",
        "🏆",
        "🎪",
      ],
      food: [
        "🍎",
        "🍊",
        "🍋",
        "🍌",
        "🍉",
        "🍇",
        "🍓",
        "🍅",
        "🥕",
        "🌽",
        "🍞",
        "🧀",
        "🍕",
        "🍔",
        "☕",
        "🍵",
      ],
      travel: [
        "✈️",
        "🚗",
        "🚕",
        "🚌",
        "🚎",
        "🏎️",
        "🚓",
        "🚑",
        "🚒",
        "🚐",
        "🛻",
        "🚛",
        "🚚",
        "🚨",
        "🚔",
      ],
    };

    // Initialize emoji picker with dynamic content generation
    function initializeEmojiPicker() {
      if (!emojiPicker) return;

      // Generate emoji picker HTML dynamically
      const categoriesHTML = Object.keys(emojiData)
        .map((category) => {
          const firstEmoji = emojiData[category][0];
          const isActive = category === "common" ? "active" : "";
          return `<button type="button" class="emoji-category-btn ${isActive}" data-category="${category}">${firstEmoji}</button>`;
        })
        .join("");

      // Helper function to get display names for categories
      const getCategoryDisplayName = (category) => {
        const keyMap = {
          common: "emojiCategoryCommon",
          smileys: "emojiCategorySmileys",
          hearts: "emojiCategorySmileys", // Map hearts to smileys category
          nature: "emojiCategoryAnimals", // Map nature to animals category
          activities: "emojiCategoryActivities",
          food: "emojiCategoryFood",
          travel: "emojiCategoryTravel",
        };
        const i18nKey = keyMap[category];
        return i18nKey ? getLocalMessage(i18nKey) || category : category;
      };

      const gridsHTML = Object.entries(emojiData)
        .map(([category, emojis]) => {
          const emojiElements = emojis
            .map(
              (emoji) =>
                `<span class="emoji-option" data-emoji="${emoji}">${emoji}</span>`,
            )
            .join("");
          return `
            <div class="emoji-category-section" data-category="${category}" id="emoji-category-${category}">
              <div class="emoji-category-title">${getCategoryDisplayName(category)}</div>
              <div class="emoji-grid">${emojiElements}</div>
            </div>
          `;
        })
        .join("");

      emojiPicker.innerHTML = `
        <div class="emoji-picker-header">
          <div class="emoji-categories">
            ${categoriesHTML}
          </div>
        </div>
        <div class="emoji-picker-content">
          ${gridsHTML}
        </div>
      `;

      // Add event listeners after content is generated
      setupEmojiPickerEvents();

      // Set up scroll listener to update active category
      setupScrollListener();
    }

    function setupEmojiPickerEvents() {
      // Toggle emoji picker
      emojiPickerTrigger?.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle("show");
      });

      // Close emoji picker when clicking outside
      document.addEventListener("click", (e) => {
        if (
          !emojiPicker.contains(e.target) &&
          !emojiPickerTrigger.contains(e.target)
        ) {
          emojiPicker.classList.remove("show");
        }
      });

      // Use event delegation for dynamically generated content
      emojiPicker.addEventListener("click", (e) => {
        // Handle category button clicks
        if (e.target.classList.contains("emoji-category-btn")) {
          const category = e.target.dataset.category;
          console.log("Category clicked:", category); // Debug log

          // Update active category button
          emojiPicker
            .querySelectorAll(".emoji-category-btn")
            .forEach((b) => b.classList.remove("active"));
          e.target.classList.add("active");

          // Scroll to the corresponding category section
          const targetSection = emojiPicker.querySelector(
            `#emoji-category-${category}`,
          );
          const pickerContent = emojiPicker.querySelector(
            ".emoji-picker-content",
          );

          if (targetSection && pickerContent) {
            const sectionTop =
              targetSection.offsetTop - pickerContent.offsetTop;

            console.log(
              `Scrolling to category ${category}, position: ${sectionTop}`,
            ); // Debug log

            // Smooth scroll to the target section
            pickerContent.scrollTo({
              top: sectionTop,
              behavior: "smooth",
            });
          }
        }

        // Handle emoji selection
        if (e.target.classList.contains("emoji-option")) {
          const emoji = e.target.dataset.emoji;
          console.log("Emoji selected:", emoji); // Debug log
          if (elements.templateIcon) {
            elements.templateIcon.value = emoji;
          }
          emojiPicker.classList.remove("show");
        }
      });
    }

    // Set up scroll listener to auto-update active category
    function setupScrollListener() {
      const pickerContent = emojiPicker?.querySelector(".emoji-picker-content");
      if (!pickerContent) return;

      let scrollTimeout;
      pickerContent.addEventListener("scroll", () => {
        // Debounce scroll events
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          updateActiveCategoryOnScroll();
        }, 100);
      });
    }

    function updateActiveCategoryOnScroll() {
      const pickerContent = emojiPicker.querySelector(".emoji-picker-content");
      const categoryBtns = emojiPicker.querySelectorAll(".emoji-category-btn");
      const sections = emojiPicker.querySelectorAll(".emoji-category-section");

      if (!pickerContent || !sections.length) return;

      const scrollTop = pickerContent.scrollTop;
      const containerTop = pickerContent.offsetTop;

      // Find the section that's currently most visible
      let activeCategory = null;
      let minDistance = Infinity;

      sections.forEach((section) => {
        const sectionTop = section.offsetTop - containerTop;
        const distance = Math.abs(scrollTop - sectionTop);

        if (distance < minDistance) {
          minDistance = distance;
          activeCategory = section.dataset.category;
        }
      });

      // Update active category button
      if (activeCategory) {
        categoryBtns.forEach((btn) => {
          btn.classList.toggle(
            "active",
            btn.dataset.category === activeCategory,
          );
        });
      }
    }

    // Initialize the emoji picker
    initializeEmojiPicker();

    // Field insertion buttons
    const fieldButtons = document.querySelectorAll(".field-btn[data-field]");
    fieldButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;
        insertField(field);
      });
    });

    // Keyboard shortcuts
    elements.templateContent?.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "s") {
          e.preventDefault();
          saveTemplate();
        } else if (e.key === "Enter") {
          e.preventDefault();
          updateTemplatePreview();
        }
      }
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

    // Initialize template management
    initializeTemplateManagement();
    await loadTemplates();
  }

  // Start initialization
  await initialize();
});
