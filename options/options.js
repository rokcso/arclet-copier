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

import settingsManager from "../shared/settings-manager.js";
import toast from "../shared/toast.js";
import {
  initializeThreeWaySwitch,
  getUrlCleaningOptions,
} from "../shared/three-way-switch.js";
import { initializeBinaryToggle } from "../shared/binary-toggle.js";

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
      async (value) => {
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
      console.error("Failed to load templates:", error);
      toast.error("Failed to load templates");
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
        // If no matching option found, activate the first one and update the hidden input
        const firstOption = selector.querySelector(".icon-option");
        if (firstOption) {
          firstOption.classList.add("active");
          elements.templateIcon.value = firstOption.dataset.icon;
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
      console.error("Failed to delete template:", error);
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
      console.error("Failed to save template:", error);
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
    const nameValid = elements.templateName.value.trim().length > 0;

    if (!content) {
      // Update save button state
      elements.templateSaveBtn.disabled = !nameValid;
      return;
    }

    const validation = templateEngine.validateTemplate(content);

    // Update save button state
    elements.templateSaveBtn.disabled = !(validation.valid && nameValid);

    // You could show validation messages via toast instead of a dedicated element
    if (!validation.valid && content) {
      console.warn("Template validation errors:", validation.errors);
    }
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
    const dropdown = btn.closest(".dropdown");

    if (dropdown.classList.contains("open")) {
      dropdown.classList.remove("open");
    } else {
      dropdown.classList.add("open");
    }
  }

  function initializeTemplateManagement() {
    if (!elements.templateList) {
      console.warn("templateList element not found");
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

    // More fields toggle
    elements.moreFieldsBtn?.addEventListener("click", toggleMoreFields);

    // Variable button clicks
    document.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("variable-btn") &&
        e.target.dataset.field
      ) {
        insertField(e.target.dataset.field);
      }
      if (
        e.target.classList.contains("dropdown-item") &&
        e.target.dataset.field
      ) {
        insertField(e.target.dataset.field);
        // Close dropdown after selection
        const dropdown = e.target.closest(".dropdown");
        if (dropdown) dropdown.classList.remove("open");
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

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".dropdown")) {
        document.querySelectorAll(".dropdown.open").forEach((dropdown) => {
          dropdown.classList.remove("open");
        });
      }
    });

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
      moreFieldsBtn: document.getElementById("moreFieldsBtn"),
      moreFieldsPanel: document.getElementById("moreFieldsPanel"),
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
  }

  // Start initialization
  await initialize();
});
