import {
  getAllTemplates,
  getCustomTemplates,
  saveCustomTemplates,
  createTemplate,
  templateEngine,
  TemplateChangeNotifier,
  getCustomParamRules,
  saveCustomParamRules,
  DEFAULT_PARAM_RULES,
} from "../../shared/constants.js";

import settingsManager from "../../shared/settings-manager.js";
import toast from "../../shared/toast.js";
import { initializeThreeWaySwitch } from "../../shared/three-way-switch.js";

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
      console.debug("Failed to load locale messages:", error);
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

  // DOM elements - will be initialized after DOM is loaded
  let elements = {};

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
    if (!elements.colorPicker) {
      return;
    }

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
        toast.success(
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
        toast.success(
          getLocalMessage("appearanceChanged") ||
            "Appearance changed successfully!",
        );
      },
    );
  }

  // 初始化通知方式滑块
  function initializeNotificationSwitch() {
    const notificationOptions = [
      { value: "off", key: null },
      { value: "chrome", key: null },
      { value: "page", key: null },
    ];

    return initializeThreeWaySwitch(
      elements.notificationSwitch,
      notificationOptions,
      async () => {
        await saveSettings();
        toast.success(
          getLocalMessage("notificationTypeChanged") ||
            "Notification type changed successfully!",
        );
      },
    );
  }

  // 初始化主题
  async function initializeTheme() {
    const savedTheme = await settingsManager.getSetting("appearance");

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
    const settings = await settingsManager.getSettings([
      "shortUrlService",
      "appearance",
      "language",
      "themeColor",
      "notificationType",
    ]);

    // Load short URL service setting
    elements.shortUrlServiceSelect.value = settings.shortUrlService;

    // Load appearance setting
    const savedAppearance = settings.appearance;
    if (elements.appearanceSwitch) {
      elements.appearanceSwitch.setAttribute("data-value", savedAppearance);
    }

    // Load language setting
    elements.languageSelect.value = settings.language;
    currentLocale = settings.language;

    // Load theme color setting
    applyThemeColor(settings.themeColor);

    // Update color picker UI
    if (elements.colorPicker) {
      const colorOptions =
        elements.colorPicker.querySelectorAll(".color-option");
      colorOptions.forEach((option) => {
        option.classList.toggle(
          "active",
          option.getAttribute("data-color") === settings.themeColor,
        );
      });
    }

    // Load notification type setting
    if (elements.notificationSwitch) {
      elements.notificationSwitch.setAttribute(
        "data-value",
        settings.notificationType,
      );
    }
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

    await settingsManager.updateSettings({
      shortUrlService: elements.shortUrlServiceSelect.value,
      appearance: appearanceSwitch.getAttribute("data-value"),
      language: elements.languageSelect.value,
      themeColor: currentThemeColor,
      notificationType: elements.notificationSwitch.getAttribute("data-value"),
    });
  }

  // 事件监听器
  function initializeEventListeners() {
    // Short URL service select
    elements.shortUrlServiceSelect.addEventListener("change", async () => {
      await saveSettings();
      toast.success(
        getLocalMessage("shortUrlServiceChanged") ||
          "Short URL service changed successfully!",
      );
    });

    // Language select
    elements.languageSelect.addEventListener("change", async () => {
      const newLanguage = elements.languageSelect.value;
      currentLocale = newLanguage;

      await saveSettings();
      await initializeI18n(newLanguage);

      toast.success(
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
      console.debug("Failed to load templates:", error);
      toast.error("Failed to load templates");
    }
  }

  function renderTemplateList() {
    if (!elements.templateList) {
      return;
    }

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
    // Check if required elements exist
    if (
      !elements.templateModal ||
      !elements.templateModalTitle ||
      !elements.templateName
    ) {
      return;
    }

    currentEditingTemplate = template;

    if (template) {
      elements.templateModalTitle.textContent =
        getLocalMessage("editTemplate") || "编辑模板";

      elements.templateName.value = template.name;
      if (elements.templateIcon) {
        elements.templateIcon.value = template.icon;
      }
      if (elements.templateContent) {
        elements.templateContent.value = template.template;
      }

      // Update icon selector UI
      updateIconSelector(template.icon);
    } else {
      elements.templateModalTitle.textContent =
        getLocalMessage("createTemplate") || "创建模板";
      elements.templateName.value = "";
      if (elements.templateIcon) {
        elements.templateIcon.value = "📝";
      }
      if (elements.templateContent) {
        elements.templateContent.value = "";
      }

      // Update icon selector UI to default
      updateIconSelector("📝");
    }

    updateTemplatePreview();
    validateTemplate();
    elements.templateModal.classList.add("show");
    document.body.classList.add("modal-open"); // 阻止背景滚动

    // Focus on name input if it exists
    if (elements.templateName) {
      elements.templateName.focus();
    }
  }

  function updateIconSelector(iconValue) {
    const selector = document.querySelector(".template-icon-selector");
    if (selector) {
      // Remove active from all options
      selector
        .querySelectorAll(".icon-option")
        .forEach((opt) => opt.classList.remove("active"));

      // Find and activate the matching option
      const matchingOption = selector.querySelector(
        `[data-icon="${iconValue}"]`,
      );
      if (matchingOption) {
        matchingOption.classList.add("active");
      } else {
        // If no matching option found, create a temporary option or update the first one
        const firstOption = selector.querySelector(".icon-option");
        if (firstOption) {
          // Update the first option to show the selected emoji
          firstOption.textContent = iconValue;
          firstOption.dataset.icon = iconValue;
          firstOption.classList.add("active");
        }
      }
    }
  }

  function hideTemplateModal() {
    elements.templateModal.classList.remove("show");
    document.body.classList.remove("modal-open"); // 恢复背景滚动
    currentEditingTemplate = null;
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

      toast.success(getLocalMessage("templateDeleted") || "模板已删除");

      await loadTemplates();
    } catch (error) {
      console.debug("Failed to delete template:", error);
      toast.error(getLocalMessage("templateDeleteFailed") || "删除模板失败");
    }
  }

  async function saveTemplate() {
    const name = elements.templateName.value.trim();
    const icon = elements.templateIcon.value.trim();
    const content = elements.templateContent.value.trim();

    if (!name) {
      toast.error(getLocalMessage("templateNameRequired") || "请输入模板名称");
      return;
    }

    if (!content) {
      toast.error(
        getLocalMessage("templateContentRequired") || "请输入模板内容",
      );
      return;
    }

    const validation = templateEngine.validateTemplate(content);
    if (!validation.valid) {
      toast.error(validation.errors.join(", "));
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

      toast.success(
        currentEditingTemplate
          ? getLocalMessage("templateUpdated") || "模板已更新"
          : getLocalMessage("templateCreated") || "模板已创建",
      );

      hideTemplateModal();
      await loadTemplates();
    } catch (error) {
      console.debug("Failed to save template:", error);
      toast.error(getLocalMessage("templateSaveFailed") || "保存模板失败");
    }
  }

  function updateTemplatePreview() {
    if (!elements.templateContent || !elements.templatePreview) {
      return;
    }

    const content = elements.templateContent.value.trim();
    const previewContent = elements.templatePreview; // templatePreview IS the preview-content element

    if (!content) {
      previewContent.innerHTML = `<span class="preview-placeholder">${getLocalMessage("previewPlaceholder") || "输入模板内容以查看预览"}</span>`;
      return;
    }

    // Create comprehensive mock context for preview based on arcletcopier.com
    const mockContext = {
      url: "https://www.arcletcopier.com/?utm_source=chrome&utm_medium=extension&utm_campaign=template_test&ref=github#features",
      title:
        "Arclet Copier - Clean & Efficient Chrome Extension for Quick URL Copying",
      urlCleaning: "smart",
      shortUrl: "https://is.gd/ArcletCopy",
      author: "Rokcso",
      description:
        "A powerful Chrome extension for intelligent URL copying with custom templates, batch operations, short URLs, and multi-language support.",
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
    const nameValid = elements.templateName.value.trim().length > 0;

    if (!content) {
      // Update save button state
      elements.templateSaveBtn.disabled = !nameValid;
      return { valid: true, errors: [], fields: [] };
    }

    const validation = templateEngine.validateTemplate(content);

    // Update save button state
    elements.templateSaveBtn.disabled = !(validation.valid && nameValid);

    // Never log errors during input - only show errors when user tries to save
    return validation;
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

  function initializeTemplateManagement() {
    if (!elements.templateList) {
      console.debug("templateList element not found");
      return;
    }

    // Add template button
    if (elements.addTemplateBtn) {
      elements.addTemplateBtn.addEventListener("click", () => {
        showTemplateModal();
      });
    }

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

    // Variable button clicks
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("variable-btn") &&
        e.target.dataset.field
      ) {
        insertField(e.target.dataset.field);
      }
    });

    // Icon selector functionality
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("icon-option")) {
        // Update active state
        const selector = e.target.closest(".template-icon-selector");
        if (selector) {
          selector
            .querySelectorAll(".icon-option")
            .forEach((opt) => opt.classList.remove("active"));
          e.target.classList.add("active");

          // Update hidden input value
          const iconInput = document.getElementById("templateIcon");
          if (iconInput) {
            iconInput.value = e.target.dataset.icon;
          }
        }
      }
    });

    // Initialize emoji picker
    initializeEmojiPicker();

    // Load templates on initialization
    loadTemplates();

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

  // Initialize emoji picker functionality
  function initializeEmojiPicker() {
    const emojiPickerTrigger = document.getElementById("emojiPickerTrigger");
    const emojiPicker = document.getElementById("emojiPicker");

    if (!emojiPickerTrigger || !emojiPicker) {
      return;
    }

    // Curated emoji sets for different categories
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
        "💡",
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
        "😇",
        "🙂",
        "🙃",
        "😌",
      ],
      people: [
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
        "⭐",
        "🌟",
        "💖",
        "💕",
        "💗",
        "💓",
        "💘",
        "💝",
      ],
      animals: [
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
        "☀️",
        "🌤️",
        "⛅",
        "🌈",
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
        "🎬",
        "📸",
        "🎹",
        "🎸",
        "🥁",
        "🎺",
        "🎻",
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
        "🍰",
        "🎂",
        "🍪",
        "🍫",
      ],
    };

    // Generate emoji picker HTML
    function generateEmojiPickerHTML() {
      const categoriesHTML = Object.keys(emojiData)
        .map((category, index) => {
          const firstEmoji = emojiData[category][0];
          const isActive = index === 0 ? "active" : "";
          return `<button type="button" class="emoji-category-btn ${isActive}" data-category="${category}">${firstEmoji}</button>`;
        })
        .join("");

      const getCategoryDisplayName = (category) => {
        const keyMap = {
          common: "emojiCategoryCommon",
          smileys: "emojiCategorySmileys",
          people: "emojiCategoryPeople",
          animals: "emojiCategoryAnimals",
          activities: "emojiCategoryActivities",
          food: "emojiCategoryFood",
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

      return `
        <div class="emoji-picker-header">
          <div class="emoji-categories">
            ${categoriesHTML}
          </div>
        </div>
        <div class="emoji-picker-content">
          ${gridsHTML}
        </div>
      `;
    }

    // Initialize picker content
    emojiPicker.innerHTML = generateEmojiPickerHTML();

    // Toggle emoji picker
    emojiPickerTrigger.addEventListener("click", (e) => {
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

    // Handle emoji picker interactions
    emojiPicker.addEventListener("click", (e) => {
      // Handle category button clicks
      if (e.target.classList.contains("emoji-category-btn")) {
        const category = e.target.dataset.category;

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
          const sectionTop = targetSection.offsetTop - pickerContent.offsetTop;
          pickerContent.scrollTo({
            top: sectionTop,
            behavior: "smooth",
          });
        }
      }

      // Handle emoji selection
      if (e.target.classList.contains("emoji-option")) {
        const emoji = e.target.dataset.emoji;

        // Update hidden input
        if (elements.templateIcon) {
          elements.templateIcon.value = emoji;
        }

        // Update icon selector UI
        updateIconSelector(emoji);

        // Close picker
        emojiPicker.classList.remove("show");
      }
    });

    // Auto-update active category on scroll
    const pickerContent = emojiPicker.querySelector(".emoji-picker-content");
    if (pickerContent) {
      let scrollTimeout;
      pickerContent.addEventListener("scroll", () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const categoryBtns = emojiPicker.querySelectorAll(
            ".emoji-category-btn",
          );
          const sections = emojiPicker.querySelectorAll(
            ".emoji-category-section",
          );

          if (!sections.length) {
            return;
          }

          const scrollTop = pickerContent.scrollTop;
          let activeCategory = null;
          let minDistance = Infinity;

          sections.forEach((section) => {
            const sectionTop = section.offsetTop - pickerContent.offsetTop;
            const distance = Math.abs(scrollTop - sectionTop);

            if (distance < minDistance) {
              minDistance = distance;
              activeCategory = section.dataset.category;
            }
          });

          if (activeCategory) {
            categoryBtns.forEach((btn) => {
              btn.classList.toggle(
                "active",
                btn.dataset.category === activeCategory,
              );
            });
          }
        }, 100);
      });
    }
  }

  // ============================================
  // URL Parameter Configuration Functions
  // ============================================

  let currentParamCategory = null; // 'tracking' or 'functional'
  let currentEditingParam = null; // The parameter being edited (null for add mode)
  let isEditMode = false; // Whether modal is in edit mode

  // Load parameter rules
  async function loadParamRules() {
    // Only skip if containers are already populated (prevents flickering during operations)
    const trackingContainer = document.getElementById("trackingParamsList");
    const functionalContainer = document.getElementById("functionalParamsList");

    if (
      trackingContainer &&
      trackingContainer.children.length > 0 &&
      functionalContainer &&
      functionalContainer.children.length > 0
    ) {
      console.log("[ParamConfig] Skipping load - containers already populated");
      return;
    }

    try {
      const rules = await getCustomParamRules();
      updateParamTags("trackingParamsList", rules.tracking, "tracking");
      updateParamTags("functionalParamsList", rules.functional, "functional");
      console.log("[ParamConfig] Loaded parameter rules:", rules);
    } catch (error) {
      console.debug("[ParamConfig] Failed to load parameter rules:", error);
      toast.show(
        getLocalMessage("loadParamRulesFailed") || "加载参数配置失败",
        "error",
      );
    }
  }

  // Create single parameter tag element
  function createParamTag(param, category) {
    const tag = document.createElement("div");
    tag.className = "param-tag";
    tag.setAttribute("data-param", param);
    tag.setAttribute("data-category", category);
    tag.innerHTML = `
      <span class="param-name">${param}</span>
      <button class="param-remove" data-param="${param}" data-category="${category}" title="${getLocalMessage("removeParam") || "删除"}">×</button>
    `;

    // Add click event for editing
    const paramNameSpan = tag.querySelector(".param-name");
    paramNameSpan.addEventListener("click", () => {
      showEditParamModal(category, param);
    });
    paramNameSpan.style.cursor = "pointer";
    paramNameSpan.title = getLocalMessage("editParamHint") || "单击编辑";

    // Add remove event listener
    const removeBtn = tag.querySelector(".param-remove");
    removeBtn.addEventListener("click", () => {
      removeParam(category, param);
    });

    return tag;
  }

  // Smart incremental update for parameter lists
  function smartUpdateParamList(containerId, oldParams, newParams, category) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    new Set(oldParams);
    const newSet = new Set(newParams);
    const sortedNewParams = [...newParams].sort();

    // Remove parameters that no longer exist
    container.querySelectorAll(".param-tag").forEach((tag) => {
      const param = tag.getAttribute("data-param");
      if (!newSet.has(param)) {
        tag.remove();
      }
    });

    // Find existing elements for ordering
    const existingElements = new Map();
    container.querySelectorAll(".param-tag").forEach((tag) => {
      const param = tag.getAttribute("data-param");
      if (newSet.has(param)) {
        existingElements.set(param, tag);
      }
    });

    // Add new parameters in correct order
    sortedNewParams.forEach((param, index) => {
      const existingElement = existingElements.get(param);
      if (existingElement) {
        // Reorder existing element if needed
        const nextElement = container.children[index];
        if (nextElement !== existingElement) {
          container.insertBefore(existingElement, nextElement || null);
        }
      } else {
        // Create new parameter tag
        const tag = createParamTag(param, category);

        // Insert at correct position
        const targetElement = container.children[index];
        if (targetElement) {
          container.insertBefore(tag, targetElement);
        } else {
          container.appendChild(tag);
        }
      }
    });
  }

  // Legacy render function (for initial load)
  function renderParamTags(containerId, params, category) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.innerHTML = "";

    // Sort parameters alphabetically
    const sortedParams = [...params].sort();

    sortedParams.forEach((param) => {
      const tag = createParamTag(param, category);
      container.appendChild(tag);
    });
  }

  // Updated parameter list with incremental update
  function updateParamTags(containerId, params, category) {
    // Store current state for comparison
    if (!window.paramListState) {
      window.paramListState = {};
    }

    const key = `${containerId}`;
    const oldParams = window.paramListState[key] || [];
    const newParams = [...params].sort();

    // First time load, use full render
    if (oldParams.length === 0) {
      renderParamTags(containerId, params, category);
    } else {
      // Use incremental update
      smartUpdateParamList(containerId, oldParams, newParams, category);
    }

    // Update stored state
    window.paramListState[key] = newParams;
  }

  // Show add parameter modal
  function showAddParamModal(category) {
    currentParamCategory = category;
    currentEditingParam = null;
    isEditMode = false;

    // Update modal title based on category
    const modalTitle = document.getElementById("paramModalTitle");
    if (modalTitle) {
      if (category === "tracking") {
        modalTitle.textContent =
          getLocalMessage("addTrackingParamTitle") || "添加跟踪参数";
      } else if (category === "functional") {
        modalTitle.textContent =
          getLocalMessage("addFunctionalParamTitle") || "添加功能参数";
      } else {
        modalTitle.textContent = getLocalMessage("addParamTitle") || "添加参数";
      }
    }

    elements.paramNameInput.value = "";
    elements.paramNameInput.classList.remove("error");
    elements.paramInputModal.classList.add("show");
    document.body.classList.add("modal-open");

    // Delay focus to ensure modal animation completes
    setTimeout(() => {
      elements.paramNameInput.focus();
    }, 100);
  }

  // Show edit parameter modal
  function showEditParamModal(category, param) {
    currentParamCategory = category;
    currentEditingParam = param;
    isEditMode = true;

    // Update modal title
    const modalTitle = document.getElementById("paramModalTitle");
    if (modalTitle) {
      modalTitle.textContent = getLocalMessage("editParamTitle") || "编辑参数";
    }

    elements.paramNameInput.value = param;
    elements.paramNameInput.classList.remove("error");
    elements.paramInputModal.classList.add("show");
    document.body.classList.add("modal-open");

    // Delay focus and select to ensure modal animation completes
    setTimeout(() => {
      elements.paramNameInput.focus();
      // Select all text for easy replacement
      elements.paramNameInput.select();
    }, 100);
  }

  // Hide add parameter modal
  function hideAddParamModal() {
    elements.paramInputModal.classList.remove("show");
    document.body.classList.remove("modal-open");
    currentParamCategory = null;
    currentEditingParam = null;
    isEditMode = false;
  }

  // Validate parameter name
  function validateParamName(paramName) {
    if (!paramName || paramName.trim() === "") {
      return {
        valid: false,
        error: getLocalMessage("paramNameEmpty") || "参数名不能为空",
      };
    }

    // Only allow letters, numbers, and underscores
    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(paramName)) {
      return {
        valid: false,
        error:
          getLocalMessage("paramNameInvalid") ||
          "参数名只能包含字母、数字、下划线",
      };
    }

    return { valid: true };
  }

  // Add or edit parameter (unified function)
  async function addParam(category, paramName) {
    try {
      const validation = validateParamName(paramName);
      if (!validation.valid) {
        toast.show(validation.error, "error");
        elements.paramNameInput.classList.add("error");
        return false;
      }

      const lowerParamName = paramName.toLowerCase().trim();
      const rules = await getCustomParamRules();

      // Edit mode: update existing parameter
      if (isEditMode && currentEditingParam) {
        const lowerCurrentParam = currentEditingParam.toLowerCase();

        // If name hasn't changed, just close modal
        if (lowerParamName === lowerCurrentParam) {
          hideAddParamModal();
          return true;
        }

        // Check if parameter already exists
        const existsInCurrentCategory =
          rules[category].includes(lowerParamName);
        const existsInOtherCategory =
          category === "tracking"
            ? rules.functional.includes(lowerParamName)
            : rules.tracking.includes(lowerParamName);

        if (existsInCurrentCategory) {
          // Same category duplicate
          toast.show(
            getLocalMessage("paramExistsInSameCategory") ||
              `Parameter "${lowerParamName}" already exists in current category`,
            "error",
          );
          elements.paramNameInput.classList.add("error");
          return false;
        } else if (existsInOtherCategory) {
          // Cross category duplicate
          const otherCategoryKey =
            category === "tracking"
              ? "paramExistsInFunctional"
              : "paramExistsInTracking";
          const otherCategory = getLocalMessage(otherCategoryKey);
          toast.show(
            getLocalMessage("paramExistsInOtherCategory") ||
              `Parameter "${lowerParamName}" already exists in ${otherCategory}`,
            "error",
          );
          elements.paramNameInput.classList.add("error");
          return false;
        }

        // Remove old parameter and add new one
        const index = rules[category].indexOf(lowerCurrentParam);
        if (index > -1) {
          rules[category].splice(index, 1);
        }
        rules[category].push(lowerParamName);

        const success = await saveCustomParamRules(rules);

        if (success) {
          // Update only the specific category with incremental update
          updateParamTags(
            category === "tracking"
              ? "trackingParamsList"
              : "functionalParamsList",
            rules[category],
            category,
          );
          hideAddParamModal();
          toast.show(
            getLocalMessage("paramUpdated") || "参数已更新",
            "success",
          );
          return true;
        } else {
          toast.show(
            getLocalMessage("paramUpdateFailed") || "更新参数失败",
            "error",
          );
          return false;
        }
      }

      // Add mode: add new parameter
      else {
        // Check if parameter already exists
        const existsInCurrentCategory =
          rules[category].includes(lowerParamName);
        const existsInOtherCategory =
          category === "tracking"
            ? rules.functional.includes(lowerParamName)
            : rules.tracking.includes(lowerParamName);

        if (existsInCurrentCategory) {
          // Same category duplicate
          toast.show(
            getLocalMessage("paramExistsInSameCategory") ||
              `Parameter "${lowerParamName}" already exists in current category`,
            "error",
          );
          elements.paramNameInput.classList.add("error");
          return false;
        } else if (existsInOtherCategory) {
          // Cross category duplicate
          const otherCategoryKey =
            category === "tracking"
              ? "paramExistsInFunctional"
              : "paramExistsInTracking";
          const otherCategory = getLocalMessage(otherCategoryKey);
          toast.show(
            getLocalMessage("paramExistsInOtherCategory") ||
              `Parameter "${lowerParamName}" already exists in ${otherCategory}`,
            "error",
          );
          elements.paramNameInput.classList.add("error");
          return false;
        }

        // Add parameter
        rules[category].push(lowerParamName);

        const success = await saveCustomParamRules(rules);

        if (success) {
          // Update only the specific category with incremental update
          updateParamTags(
            category === "tracking"
              ? "trackingParamsList"
              : "functionalParamsList",
            rules[category],
            category,
          );
          hideAddParamModal();
          toast.show(getLocalMessage("paramAdded") || "参数已添加", "success");
          return true;
        } else {
          toast.show(
            getLocalMessage("paramAddFailed") || "添加参数失败",
            "error",
          );
          return false;
        }
      }
    } catch (error) {
      console.debug("[ParamConfig] Failed to add/edit parameter:", error);
      toast.show(getLocalMessage("paramAddFailed") || "添加参数失败", "error");
      return false;
    }
  }

  // Remove parameter
  async function removeParam(category, paramName) {
    try {
      const rules = await getCustomParamRules();
      const newParams = rules[category].filter((p) => p !== paramName);
      rules[category] = newParams;

      const success = await saveCustomParamRules(rules);
      if (success) {
        // Update only the specific category with incremental update
        updateParamTags(
          category === "tracking"
            ? "trackingParamsList"
            : "functionalParamsList",
          newParams,
          category,
        );
        toast.show(getLocalMessage("paramRemoved") || "参数已删除", "success");
      } else {
        toast.show(
          getLocalMessage("paramRemoveFailed") || "删除参数失败",
          "error",
        );
      }
    } catch (error) {
      console.debug("[ParamConfig] Failed to remove parameter:", error);
      toast.show(
        getLocalMessage("paramRemoveFailed") || "删除参数失败",
        "error",
      );
    }
  }

  // Reset tracking parameters to defaults
  async function resetTrackingParams() {
    const confirmed = confirm(
      getLocalMessage("resetTrackingParamsConfirm") ||
        "确定要恢复跟踪参数的默认配置吗？",
    );

    if (!confirmed) {
      return;
    }

    try {
      const currentRules = await getCustomParamRules();
      const success = await saveCustomParamRules({
        tracking: [...DEFAULT_PARAM_RULES.tracking],
        functional: currentRules.functional, // Keep functional params unchanged
      });

      if (success) {
        // Use full render for reset operations and re-establish state
        renderParamTags(
          "trackingParamsList",
          DEFAULT_PARAM_RULES.tracking,
          "tracking",
        );
        // Re-establish state for the tracking category to enable future incremental updates
        if (window.paramListState) {
          window.paramListState["trackingParamsList"] = [
            ...DEFAULT_PARAM_RULES.tracking,
          ].sort();
        }
        updateParamTags(
          "functionalParamsList",
          currentRules.functional,
          "functional",
        );
        toast.show(
          getLocalMessage("trackingParamsReset") || "跟踪参数已恢复默认",
          "success",
        );
      } else {
        toast.show(
          getLocalMessage("paramRulesResetFailed") || "恢复默认配置失败",
          "error",
        );
      }
    } catch (error) {
      console.debug(
        "[ParamConfig] Failed to reset tracking parameters:",
        error,
      );
      toast.show(
        getLocalMessage("paramRulesResetFailed") || "恢复默认配置失败",
        "error",
      );
    }
  }

  // Reset functional parameters to defaults
  async function resetFunctionalParams() {
    const confirmed = confirm(
      getLocalMessage("resetFunctionalParamsConfirm") ||
        "确定要恢复功能参数的默认配置吗？",
    );

    if (!confirmed) {
      return;
    }

    try {
      const currentRules = await getCustomParamRules();
      const success = await saveCustomParamRules({
        tracking: currentRules.tracking, // Keep tracking params unchanged
        functional: [...DEFAULT_PARAM_RULES.functional],
      });

      if (success) {
        updateParamTags(
          "trackingParamsList",
          currentRules.tracking,
          "tracking",
        );
        // Use full render for reset operations and re-establish state
        renderParamTags(
          "functionalParamsList",
          DEFAULT_PARAM_RULES.functional,
          "functional",
        );
        // Re-establish state for the functional category to enable future incremental updates
        if (window.paramListState) {
          window.paramListState["functionalParamsList"] = [
            ...DEFAULT_PARAM_RULES.functional,
          ].sort();
        }
        toast.show(
          getLocalMessage("functionalParamsReset") || "功能参数已恢复默认",
          "success",
        );
      } else {
        toast.show(
          getLocalMessage("paramRulesResetFailed") || "恢复默认配置失败",
          "error",
        );
      }
    } catch (error) {
      console.debug(
        "[ParamConfig] Failed to reset functional parameters:",
        error,
      );
      toast.show(
        getLocalMessage("paramRulesResetFailed") || "恢复默认配置失败",
        "error",
      );
    }
  }

  // Initialize parameter configuration
  function initializeParamConfig() {
    // Note: Removed settings change listener to prevent duplicate updates
    // In options page, we handle updates manually with our incremental system

    // Add tracking parameter button
    elements.addTrackingParamBtn.addEventListener("click", () => {
      showAddParamModal("tracking");
    });

    // Add functional parameter button
    elements.addFunctionalParamBtn.addEventListener("click", () => {
      showAddParamModal("functional");
    });

    // Reset tracking parameters button
    elements.resetTrackingParamsBtn.addEventListener(
      "click",
      resetTrackingParams,
    );

    // Reset functional parameters button
    elements.resetFunctionalParamsBtn.addEventListener(
      "click",
      resetFunctionalParams,
    );

    // Modal close button
    elements.paramInputClose.addEventListener("click", hideAddParamModal);

    // Modal cancel button
    elements.paramCancelBtn.addEventListener("click", hideAddParamModal);

    // Modal confirm button
    elements.paramConfirmBtn.addEventListener("click", () => {
      const paramName = elements.paramNameInput.value.trim();
      if (currentParamCategory && paramName) {
        addParam(currentParamCategory, paramName);
      }
    });

    // Input enter key
    elements.paramNameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const paramName = elements.paramNameInput.value.trim();
        if (currentParamCategory && paramName) {
          addParam(currentParamCategory, paramName);
        }
      }
    });

    // Input ESC key to close modal
    elements.paramNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideAddParamModal();
      }
    });

    // Click outside modal to close
    elements.paramInputModal.addEventListener("click", (e) => {
      if (e.target === elements.paramInputModal) {
        hideAddParamModal();
      }
    });

    // Remove error state on input
    elements.paramNameInput.addEventListener("input", () => {
      elements.paramNameInput.classList.remove("error");
    });
  }

  // ============================================
  // Rating Prompt Functions
  // ============================================

  // 检查是否应该显示评价提示
  async function shouldShowRatingPrompt() {
    try {
      const result = await chrome.storage.local.get([
        "copyCount",
        "lastRatingPromptDate",
        "ratingPromptDismissed",
      ]);

      const copyCount = result.copyCount || 0;
      const lastPromptDate = result.lastRatingPromptDate || 0;
      const dismissed = result.ratingPromptDismissed || false;

      // 如果用户已经选择不再提示，直接返回false
      if (dismissed) {
        return false;
      }

      // 复制次数必须达到100次
      if (copyCount < 100) {
        return false;
      }

      // 检查距离上次提示是否已经过了7天（7天 = 7 * 24 * 60 * 60 * 1000 毫秒）
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      const now = Date.now();

      if (now - lastPromptDate < sevenDaysInMs) {
        return false;
      }

      return true;
    } catch (error) {
      console.debug(
        "[RatingPrompt] Failed to check rating prompt status:",
        error,
      );
      return false;
    }
  }

  // 显示评价提示弹窗
  function showRatingPrompt() {
    const modal = document.getElementById("ratingPromptModal");
    if (modal) {
      modal.classList.add("show");
      document.body.classList.add("modal-open");
    }
  }

  // 隐藏评价提示弹窗
  function hideRatingPrompt() {
    const modal = document.getElementById("ratingPromptModal");
    if (modal) {
      modal.classList.remove("show");
      document.body.classList.remove("modal-open");
    }
  }

  // 处理"去评价"按钮点击
  async function handleRateNow() {
    // 打开应用商店页面
    chrome.tabs.create({
      url: "https://chromewebstore.google.com/detail/mkflehheaokdfopijachhfdbofkppdil",
    });

    // 标记为已永久关闭（用户已经去评价了）
    await chrome.storage.local.set({
      ratingPromptDismissed: true,
    });

    hideRatingPrompt();
  }

  // 处理"稍后再说"按钮点击
  async function handleRateLater() {
    // 更新上次提示时间为当前时间
    await chrome.storage.local.set({
      lastRatingPromptDate: Date.now(),
    });

    hideRatingPrompt();
  }

  // 处理"稍后再说"按钮点击
  async function handleRateLater() {
    // 更新上次提示时间，7天后再显示
    await chrome.storage.local.set({
      lastRatingPromptDate: Date.now(),
    });

    hideRatingPrompt();
  }

  // 初始化评价提示
  async function initializeRatingPrompt() {
    // 检查是否应该显示
    const shouldShow = await shouldShowRatingPrompt();

    if (shouldShow) {
      // 延迟1秒显示，让用户先看到设置页面
      setTimeout(() => {
        showRatingPrompt();
      }, 1000);
    }

    // 绑定事件监听器
    const rateNowBtn = document.getElementById("rateNowBtn");
    const rateLaterBtn = document.getElementById("rateLaterBtn");
    const ratingPromptClose = document.getElementById("ratingPromptClose");

    if (rateNowBtn) {
      rateNowBtn.addEventListener("click", handleRateNow);
    }

    if (rateLaterBtn) {
      rateLaterBtn.addEventListener("click", handleRateLater);
    }

    if (ratingPromptClose) {
      ratingPromptClose.addEventListener("click", handleRateLater);
    }

    // 点击模态框外部关闭（等同于稍后再说）
    const modal = document.getElementById("ratingPromptModal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          handleRateLater();
        }
      });
    }
  }

  // ============================================
  // Initialize Function
  // ============================================

  // 初始化所有组件
  async function initialize() {
    // Initialize DOM elements
    elements = {
      version: document.getElementById("version"),
      aboutVersion: document.getElementById("aboutVersion"),
      shortUrlServiceSelect: document.getElementById("shortUrlServiceSelect"),
      notificationSwitch: document.getElementById("notificationSwitch"),
      languageSelect: document.getElementById("languageSelect"),
      appearanceSwitch: document.getElementById("appearanceSwitch"),
      colorPicker: document.getElementById("colorPicker"),
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
      templateSaveBtn: document.getElementById("templateSaveBtn"),
      templateCancelBtn: document.getElementById("templateCancelBtn"),
      previewRefreshBtn: document.getElementById("previewRefreshBtn"),

      // URL parameter configuration elements
      trackingParamsList: document.getElementById("trackingParamsList"),
      functionalParamsList: document.getElementById("functionalParamsList"),
      addTrackingParamBtn: document.getElementById("addTrackingParamBtn"),
      addFunctionalParamBtn: document.getElementById("addFunctionalParamBtn"),
      resetTrackingParamsBtn: document.getElementById("resetTrackingParamsBtn"),
      resetFunctionalParamsBtn: document.getElementById(
        "resetFunctionalParamsBtn",
      ),
      paramInputModal: document.getElementById("paramInputModal"),
      paramNameInput: document.getElementById("paramNameInput"),
      paramInputClose: document.getElementById("paramInputClose"),
      paramCancelBtn: document.getElementById("paramCancelBtn"),
      paramConfirmBtn: document.getElementById("paramConfirmBtn"),
    };

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
    initializeNotificationSwitch();
    initializeColorPicker();
    initializeEventListeners();

    // Initialize template management
    initializeTemplateManagement();
    await loadTemplates();

    // Initialize URL parameter configuration
    initializeParamConfig();
    await loadParamRules();

    // Initialize rating prompt (check and show if needed)
    await initializeRatingPrompt();
  }

  // Start initialization
  await initialize();
});
