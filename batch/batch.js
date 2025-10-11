import {
  processUrl,
  isValidWebUrl,
  isRestrictedPage,
  getMessage,
  createShortUrlDirect,
  globalShortUrlThrottle,
  getAllTemplates,
  templateEngine,
  loadTemplatesIntoSelect,
  processTemplateWithFallback,
  findTemplateById,
  validateAndFixSelector,
} from "../shared/constants.js";

import { trackCopy } from "../shared/analytics.js";
import settingsManager from "../shared/settings-manager.js";
import toast from "../shared/toast.js";
import shortUrlCache from "../shared/short-url-cache.js";
import { initializeBinaryToggle } from "../shared/binary-toggle.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 状态管理
  let allTabs = [];
  let filteredTabs = [];
  let selectedTabs = new Set();
  let currentSettings = {};

  // DOM 元素
  const elements = {
    version: document.getElementById("version"),
    refreshBtn: document.getElementById("refreshBtn"),
    selectNoneBtn: document.getElementById("selectNoneBtn"),
    invertSelectionBtn: document.getElementById("invertSelectionBtn"),
    selectedCount: document.getElementById("selectedCount"),
    totalCount: document.getElementById("totalCount"),
    tabsContainer: document.getElementById("tabsContainer"),
    tabsControls: document.getElementById("tabsControls"),
    tabsList: document.getElementById("tabsList"),
    masterCheckbox: document.getElementById("masterCheckbox"),
    loading: document.getElementById("loading"),
    previewBtn: document.getElementById("previewBtn"),
    copyBtn: document.getElementById("copyBtn"),
    previewModal: document.getElementById("previewModal"),
    previewModalOverlay: document.getElementById("previewModalOverlay"),
    previewModalClose: document.getElementById("previewModalClose"),
    previewCount: document.getElementById("previewCount"),
    previewText: document.getElementById("previewText"),
    previewCancelBtn: document.getElementById("previewCancelBtn"),
    previewCopyBtn: document.getElementById("previewCopyBtn"),
    urlCleaningSwitch: document.getElementById("urlCleaningSwitch"),
    removeDuplicates: document.getElementById("removeDuplicates"),
  };

  // 国际化相关
  let currentLocale = "zh_CN";
  let localeMessages = {};

  // 加载语言包
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

  // i18n 辅助函数
  function getLocalMessage(key, substitutions = []) {
    if (localeMessages[key] && localeMessages[key].message) {
      let message = localeMessages[key].message;
      // 处理占位符替换
      substitutions.forEach((substitution, index) => {
        const placeholder = `$${index + 1}$`;
        message = message.replace(placeholder, substitution);
      });
      // 同时支持命名占位符，如 $count$
      if (localeMessages[key].placeholders) {
        Object.keys(localeMessages[key].placeholders).forEach(
          (placeholderName) => {
            const placeholder = `$${placeholderName}$`;
            const placeholderConfig =
              localeMessages[key].placeholders[placeholderName];
            if (placeholderConfig && placeholderConfig.content) {
              const contentIndex =
                parseInt(placeholderConfig.content.replace("$", "")) - 1;
              if (substitutions[contentIndex] !== undefined) {
                message = message.replace(
                  placeholder,
                  substitutions[contentIndex],
                );
              }
            }
          },
        );
      }
      return message;
    }
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // 初始化国际化
  async function initializeI18n() {
    currentLocale = await settingsManager.getSetting("language");

    localeMessages = await loadLocaleMessages(currentLocale);

    // 应用本地化
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

  // 加载自定义模板到复制格式选择器
  async function loadCustomTemplates(preserveValue = null) {
    const silentCopyFormat = document.getElementById("silentCopyFormat");
    await loadTemplatesIntoSelect(silentCopyFormat, {
      includeIcons: true,
      clearExisting: true,
      onError: (error) => {
        console.debug("Failed to load custom templates in batch:", error);
      },
    });

    // 如果指定了要保持的值，则验证并修正
    if (preserveValue) {
      await validateAndFixSelector(
        silentCopyFormat,
        preserveValue,
        "batchSilentCopyFormat",
        settingsManager.updateSettings.bind(settingsManager),
      );
    }
  }

  // 监听模板变更消息
  function setupTemplateChangeListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TEMPLATE_CHANGED") {
        console.log(
          `Batch received template change notification: ${message.changeType}`,
        );

        // 从设置中获取当前的批量复制格式值，而不是选择器的值
        settingsManager.getAllSettings().then((currentSettings) => {
          const currentValue = currentSettings.batchSilentCopyFormat || "url";

          // 重新加载模板到选择器，传递正确的设置值
          loadCustomTemplates(currentValue).catch((error) => {
            console.debug("Failed to reload templates after change:", error);
          });
        });

        sendResponse({ received: true });
      }
    });
  }

  // 加载版本信息
  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      elements.version.textContent = `v${manifest.version}`;
    }
  }

  // 加载设置
  async function loadSettings() {
    const settings = await settingsManager.getSettings([
      "appearance",
      "themeColor",
      "batchUrlCleaning",
      "batchSilentCopyFormat",
      "batchWebPagesOnly",
      "batchRemoveDuplicates",
    ]);

    currentSettings = {
      urlCleaning: settings.batchUrlCleaning || "smart",
      appearance: settings.appearance,
      themeColor: settings.themeColor,
    };

    // 应用主题
    applyTheme(currentSettings.appearance);
    applyThemeColor(currentSettings.themeColor);

    // 设置 URL 清理开关
    elements.urlCleaningSwitch.setAttribute(
      "data-value",
      currentSettings.urlCleaning,
    );
    updateSliderPosition(elements.urlCleaningSwitch);

    // 恢复批量页面专用设置
    const silentCopyFormat = document.getElementById("silentCopyFormat");
    const webPagesOnly = document.getElementById("webPagesOnly");

    if (silentCopyFormat) {
      silentCopyFormat.value = settings.batchSilentCopyFormat || "url";
    }
    if (webPagesOnly) {
      webPagesOnly.checked = settings.batchWebPagesOnly !== false;
    }
    if (elements.removeDuplicates) {
      elements.removeDuplicates.checked =
        settings.batchRemoveDuplicates !== false;
    }

    return settings;
  }

  // 保存批量页面设置
  async function saveBatchSettings() {
    const silentCopyFormat = document.getElementById("silentCopyFormat");
    const webPagesOnly = document.getElementById("webPagesOnly");

    await settingsManager.updateSettings({
      batchUrlCleaning: currentSettings.urlCleaning,
      batchSilentCopyFormat: silentCopyFormat ? silentCopyFormat.value : "url",
      batchWebPagesOnly: webPagesOnly ? webPagesOnly.checked : true,
      batchRemoveDuplicates: elements.removeDuplicates
        ? elements.removeDuplicates.checked
        : true,
    });
  }

  // 应用主题
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

  // 更新滑块位置
  function updateSliderPosition(switchElement) {
    const options = ["off", "smart", "aggressive"];
    const currentValue = switchElement.getAttribute("data-value");
    const currentIndex = options.findIndex((opt) => opt === currentValue);

    if (currentIndex === -1) return;

    // 新的三段式开关
    if (switchElement.classList.contains("three-segment-switch")) {
      const segmentOptions = switchElement.querySelectorAll(".segment-option");
      segmentOptions.forEach((option) => option.classList.remove("active"));
      if (segmentOptions[currentIndex]) {
        segmentOptions[currentIndex].classList.add("active");
      }
      // CSS会根据data-value自动更新indicator位置
      return;
    }

    // 旧版本的三段式开关（保持兼容性）
    const switchOptions = switchElement.querySelectorAll(".switch-option");
    switchOptions.forEach((option) => option.classList.remove("active"));

    if (switchOptions[currentIndex]) {
      switchOptions[currentIndex].classList.add("active");

      const optionWidth = switchOptions[currentIndex].offsetWidth;
      const optionLeft = switchOptions[currentIndex].offsetLeft;
      const containerStyle = getComputedStyle(switchElement);
      const containerPadding = parseFloat(containerStyle.paddingLeft);
      const sliderTranslateX = optionLeft - containerPadding;

      switchElement.style.setProperty("--slider-width", `${optionWidth}px`);
      switchElement.style.setProperty("--slider-x", `${sliderTranslateX}px`);
    }
  }

  // 初始化三段滑块
  function initializeUrlCleaningSwitch() {
    const options = [
      { value: "off", text: "关闭" },
      { value: "smart", text: "智能" },
      { value: "aggressive", text: "激进" },
    ];

    // 新的三段式开关
    if (elements.urlCleaningSwitch.classList.contains("three-segment-switch")) {
      const segmentOptions =
        elements.urlCleaningSwitch.querySelectorAll(".segment-option");
      segmentOptions.forEach((option, index) => {
        option.addEventListener("click", async () => {
          const newValue = option.getAttribute("data-value");
          elements.urlCleaningSwitch.setAttribute("data-value", newValue);
          currentSettings.urlCleaning = newValue;
          updateSliderPosition(elements.urlCleaningSwitch);
          await updateWindowSelector();
          await applyFilters();
          saveBatchSettings();
        });
      });
    } else {
      // 旧版本的三段式开关（保持兼容性）
      const switchOptions =
        elements.urlCleaningSwitch.querySelectorAll(".switch-option");
      switchOptions.forEach((option, index) => {
        option.addEventListener("click", async () => {
          const newValue = options[index].value;
          elements.urlCleaningSwitch.setAttribute("data-value", newValue);
          currentSettings.urlCleaning = newValue;
          updateSliderPosition(elements.urlCleaningSwitch);
          await updateWindowSelector();
          await applyFilters();
          saveBatchSettings();
        });
      });
    }

    updateSliderPosition(elements.urlCleaningSwitch);
  }

  // 存储窗口信息
  let allWindows = [];
  let currentWindowId = null;

  // 获取所有窗口信息
  async function getAllWindows() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const currentWindow = await chrome.windows.getCurrent();
      allWindows = windows;
      currentWindowId = currentWindow.id;
      return windows;
    } catch (error) {
      console.debug("获取窗口失败:", error);
      return [];
    }
  }

  // 应用过滤逻辑（与 applyFilters 相同的逻辑，但不更新UI）
  async function calculateFilteredTabs(tabs) {
    const webPagesOnly = document.getElementById("webPagesOnly").checked;
    const removeDuplicates = elements.removeDuplicates.checked;

    let filtered = tabs.filter((tab) => {
      const urlType = categorizeUrl(tab.url);
      return webPagesOnly ? urlType === "web" : true;
    });

    // 去重
    if (removeDuplicates) {
      const seen = new Set();
      const cleaningMode = currentSettings.urlCleaning;

      const processedUrls = await Promise.all(
        filtered.map((tab) => processUrl(tab.url, cleaningMode)),
      );

      filtered = filtered.filter((tab, index) => {
        const processedUrl = processedUrls[index];
        if (seen.has(processedUrl)) {
          return false;
        }
        seen.add(processedUrl);
        return true;
      });
    }

    return filtered;
  }

  // 更新窗口选择器选项
  async function updateWindowSelector() {
    const select = document.getElementById("windowScopeSelect");
    const currentValue = select.value;

    // 清空现有选项
    select.innerHTML = "";

    // 添加当前窗口选项
    const currentWindow = allWindows.find((w) => w.id === currentWindowId);
    if (currentWindow) {
      const currentOption = document.createElement("option");
      currentOption.value = "current";
      const currentText = getLocalMessage("currentWindow");
      // 计算过滤后的数量（使用与 filteredTabs 相同的逻辑）
      const filtered = await calculateFilteredTabs(currentWindow.tabs);
      const countText = getLocalMessage("windowTabsCount", [
        filtered.length.toString(),
      ]);
      currentOption.textContent = `${currentText} (${countText})`;
      select.appendChild(currentOption);
    }

    // 添加全部窗口选项
    const allOption = document.createElement("option");
    allOption.value = "all";
    // 收集所有窗口的标签页
    const allTabsFromWindows = allWindows.reduce(
      (acc, w) => [...acc, ...w.tabs],
      [],
    );
    // 计算过滤后的总数量（使用与 filteredTabs 相同的逻辑）
    const filtered = await calculateFilteredTabs(allTabsFromWindows);
    const allText = getLocalMessage("allWindows");
    const totalCountText = getLocalMessage("windowTabsCount", [
      filtered.length.toString(),
    ]);
    allOption.textContent = `${allText} (${totalCountText})`;
    select.appendChild(allOption);

    // 恢复之前的选择
    select.value = currentValue || "current";
  }

  // 获取所有标签页
  async function getAllTabs() {
    try {
      const windowScope = document.getElementById("windowScopeSelect").value;

      if (windowScope === "current") {
        const currentWindow = await chrome.windows.getCurrent();
        const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
        return tabs;
      } else {
        const tabs = await chrome.tabs.query({});
        return tabs;
      }
    } catch (error) {
      console.debug("获取标签页失败:", error);
      return [];
    }
  }

  // 获取页面元数据（author 和 description）
  async function getPageMetadata(tabId) {
    try {
      console.log(`[Batch] Requesting metadata for tab ${tabId}`);

      // 首先检查 tab 是否存在
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch (error) {
        console.debug(`[Batch] Tab ${tabId} not found:`, error.message);
        return { author: "", description: "" };
      }

      // 检查是否为受限页面（不能注入 content script 的页面）
      if (isRestrictedPage(tab.url)) {
        console.log(
          `[Batch] Tab ${tabId} is restricted page, skipping metadata`,
        );
        return { author: "", description: "" };
      }

      // 向 content script 发送消息获取元数据
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "GET_PAGE_METADATA",
        });

        console.log(`[Batch] Metadata response for tab ${tabId}:`, response);

        if (response && response.success) {
          return response.metadata || { author: "", description: "" };
        } else {
          console.debug(
            `[Batch] Failed to get metadata for tab ${tabId}:`,
            response,
          );
          return { author: "", description: "" };
        }
      } catch (sendError) {
        // Content script 未加载或页面不支持
        // 注意：批量复制页面无法动态注入 content script（权限限制）
        // 只有在页面加载时通过 manifest 自动注入的 content script 才能使用
        console.debug(
          `[Batch] Content script not available for tab ${tabId}:`,
          sendError.message,
        );
        console.log(`[Batch] This may happen if:`);
        console.log(
          `  1. The tab was opened before the extension was installed/updated - Try refreshing the tab`,
        );
        console.log(
          `  2. The page is a restricted page (chrome://, edge://, etc.)`,
        );
        console.log(
          `  3. The page hasn't finished loading yet - Wait a moment and try again`,
        );
        return { author: "", description: "" };
      }
    } catch (error) {
      console.debug(
        `[Batch] Unexpected error getting metadata for tab ${tabId}:`,
        error.message,
      );
      return { author: "", description: "" };
    }
  }

  // 分类 URL 类型
  function categorizeUrl(url) {
    if (!url) return "unknown";

    if (
      url.startsWith("chrome://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:")
    ) {
      return "system";
    }

    if (
      url.startsWith("chrome-extension://") ||
      url.startsWith("moz-extension://")
    ) {
      return "extension";
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      return "web";
    }

    return "unknown";
  }

  // 应用过滤器
  async function applyFilters() {
    const webPagesOnly = document.getElementById("webPagesOnly").checked;
    const removeDuplicates = elements.removeDuplicates.checked;

    filteredTabs = allTabs.filter((tab) => {
      const urlType = categorizeUrl(tab.url);
      // 如果开启仅复制网页，只包含web类型；关闭则包含所有类型
      return webPagesOnly ? urlType === "web" : true;
    });

    // 去重
    if (removeDuplicates) {
      const seen = new Set();
      const cleaningMode = currentSettings.urlCleaning;

      // 使用异步处理
      const processedUrls = await Promise.all(
        filteredTabs.map((tab) => processUrl(tab.url, cleaningMode)),
      );

      filteredTabs = filteredTabs.filter((tab, index) => {
        const processedUrl = processedUrls[index];
        if (seen.has(processedUrl)) {
          return false;
        }
        seen.add(processedUrl);
        return true;
      });
    }

    renderTabs();
    updateCounts();
  }

  // 检测重复项
  async function detectDuplicates(tabs) {
    const urlCounts = new Map();
    const duplicateUrls = new Set();

    // 统计每个处理后的 URL 出现次数
    const processedUrls = await Promise.all(
      tabs.map((tab) => processUrl(tab.url, currentSettings.urlCleaning)),
    );

    processedUrls.forEach((processedUrl, index) => {
      const count = urlCounts.get(processedUrl) || 0;
      urlCounts.set(processedUrl, count + 1);

      if (count >= 1) {
        duplicateUrls.add(processedUrl);
      }
    });

    return duplicateUrls;
  }

  // 渲染标签页列表
  async function renderTabs() {
    // 找到现有的tabsList，如果不存在则创建
    let container = elements.tabsContainer.querySelector(".tabs-list");
    if (!container) {
      container = document.createElement("div");
      container.className = "tabs-list";
      elements.tabsContainer.appendChild(container);
    }

    // 清空现有内容
    container.innerHTML = "";

    // 显示操作栏
    elements.tabsControls.style.display = "flex";

    if (filteredTabs.length === 0) {
      container.innerHTML = `
        <div class="loading">
          <span>${getLocalMessage("noTabsFound") || "没有找到符合条件的标签页"}</span>
        </div>
      `;
      return;
    }

    // 检测重复项（只有在未开启去重功能时才检测）
    const duplicateUrls = !elements.removeDuplicates.checked
      ? await detectDuplicates(filteredTabs)
      : new Set();

    // 预处理所有 URL
    const processedUrls = await Promise.all(
      filteredTabs.map((tab) =>
        processUrl(tab.url, currentSettings.urlCleaning),
      ),
    );

    filteredTabs.forEach((tab, index) => {
      const processedUrl = processedUrls[index];
      const isDuplicate = duplicateUrls.has(processedUrl);
      const tabElement = createTabElement(tab, isDuplicate, processedUrl);
      container.appendChild(tabElement);
    });

    // 更新主复选框状态
    updateMasterCheckbox();
  }

  // 创建标签页元素
  function createTabElement(tab, isDuplicate = false, processedUrl = null) {
    const div = document.createElement("div");
    div.className = "tab-item";
    div.dataset.tabId = tab.id;

    const isSelected = selectedTabs.has(tab.id);
    if (isSelected) {
      div.classList.add("selected");
    }

    if (isDuplicate) {
      div.classList.add("duplicate");
    }

    // 使用传入的 processedUrl，避免重复处理
    const url = processedUrl || tab.url;

    const duplicateWatermark = isDuplicate
      ? `<span class="watermark-text" title="${getLocalMessage("duplicateUrl") || "重复的URL"}">${getLocalMessage("duplicate") || "DUPLICATE"}</span>`
      : "";

    div.innerHTML = `
      <img class="tab-favicon" src="${tab.favIconUrl || chrome.runtime.getURL("assets/icons/icon16.png")}">
      <div class="tab-info">
        <div class="tab-title">
          ${escapeHtml(tab.title || getLocalMessage("untitled"))}
          ${duplicateWatermark}
        </div>
        <div class="tab-url">${escapeHtml(url)}</div>
      </div>
    `;

    // 添加favicon错误处理
    const favicon = div.querySelector(".tab-favicon");
    favicon.addEventListener("error", function () {
      this.src = chrome.runtime.getURL("assets/icons/icon16.png");
    });

    // 事件监听
    div.addEventListener("click", (e) => {
      if (e.target.classList.contains("watermark-text")) return;
      toggleTabSelection(tab.id);
    });

    return div;
  }

  // HTML 转义
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 切换标签页选择状态
  function toggleTabSelection(tabId) {
    if (selectedTabs.has(tabId)) {
      selectedTabs.delete(tabId);
    } else {
      selectedTabs.add(tabId);
    }

    updateTabElement(tabId);
    updateCounts();
    updateCopyButton();
    updateMasterCheckbox();
  }

  // 更新标签页元素
  function updateTabElement(tabId) {
    const element = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (!element) return;

    const isSelected = selectedTabs.has(tabId);
    element.classList.toggle("selected", isSelected);
  }

  // 更新计数
  function updateCounts() {
    elements.selectedCount.textContent = selectedTabs.size;
    elements.totalCount.textContent = filteredTabs.length;
  }

  // 更新主复选框状态
  function updateMasterCheckbox() {
    const totalTabs = filteredTabs.length;
    const selectedCount = selectedTabs.size;

    if (totalTabs === 0) {
      elements.masterCheckbox.checked = false;
      elements.masterCheckbox.indeterminate = false;
      return;
    }

    if (selectedCount === 0) {
      elements.masterCheckbox.checked = false;
      elements.masterCheckbox.indeterminate = false;
    } else if (selectedCount === totalTabs) {
      elements.masterCheckbox.checked = true;
      elements.masterCheckbox.indeterminate = false;
    } else {
      elements.masterCheckbox.checked = false;
      elements.masterCheckbox.indeterminate = true;
    }
  }

  // 更新复制按钮状态
  function updateCopyButton() {
    elements.copyBtn.disabled = selectedTabs.size === 0;
    elements.previewBtn.disabled = selectedTabs.size === 0;
  }

  // 全选
  function selectAll() {
    filteredTabs.forEach((tab) => selectedTabs.add(tab.id));
    renderTabs();
    updateCounts();
    updateCopyButton();
  }

  // 全不选
  function selectNone() {
    selectedTabs.clear();
    renderTabs();
    updateCounts();
    updateCopyButton();
  }

  // 反选
  function invertSelection() {
    const newSelection = new Set();
    filteredTabs.forEach((tab) => {
      if (!selectedTabs.has(tab.id)) {
        newSelection.add(tab.id);
      }
    });
    selectedTabs = newSelection;
    renderTabs();
    updateCounts();
    updateCopyButton();
  }

  // 主复选框点击处理
  function handleMasterCheckboxClick() {
    if (selectedTabs.size === filteredTabs.length) {
      // 如果全选，则清空
      selectNone();
    } else {
      // 否则全选
      selectAll();
    }
  }

  // 获取选中的标签页
  function getSelectedTabs() {
    return filteredTabs.filter((tab) => selectedTabs.has(tab.id));
  }

  // 格式化输出
  async function formatOutput(tabs, format) {
    const cleaningMode = currentSettings.urlCleaning;

    // 检查是否是自定义模板
    if (format.startsWith("custom:")) {
      const templateId = format.substring(7); // 移除 'custom:' 前缀

      try {
        const template = await findTemplateById(templateId);

        // 如果模板不存在（被删除），使用fallback处理
        if (!template) {
          console.debug(`Template ${templateId} not found, using fallback`);
          const urls = await Promise.all(
            tabs.map((tab) => processUrl(tab.url, cleaningMode)),
          );
          return urls.join("\n");
        }

        // 处理多个tab，每个tab一行
        const results = await Promise.all(
          tabs.map(async (tab) => {
            const metadata = await getPageMetadata(tab.id);

            const context = {
              url: tab.url,
              title: tab.title || "",
              urlCleaning: cleaningMode,
              shortUrl: "",
              author: metadata.author || "",
              description: metadata.description || "",
            };

            // 如果模板包含shortUrl字段，生成短链
            if (template.template.includes("{{shortUrl}}")) {
              try {
                const selectedService =
                  await settingsManager.getSetting("shortUrlService");
                // 修复: 先清理URL
                const cleanedUrl = await processUrl(tab.url, cleaningMode);

                // 修复: 使用清理后的URL检查缓存
                const cachedUrl = await shortUrlCache.get(
                  cleanedUrl,
                  selectedService,
                );
                if (cachedUrl) {
                  context.shortUrl = cachedUrl;
                } else {
                  // 生成新的短链
                  context.shortUrl =
                    await globalShortUrlThrottle.throttledRequest(async () => {
                      try {
                        const shortUrl = await createShortUrlDirect(
                          cleanedUrl,
                          selectedService,
                        );
                        // 修复: 使用清理后的URL保存到缓存
                        await shortUrlCache.set(
                          cleanedUrl,
                          selectedService,
                          shortUrl,
                        );
                        return shortUrl;
                      } catch (error) {
                        console.debug("短链生成失败:", error);
                        return cleanedUrl;
                      }
                    });
                }
              } catch (error) {
                console.debug(
                  "Error generating short URL for template:",
                  error,
                );
                context.shortUrl = await processUrl(tab.url, cleaningMode);
              }
            }

            const result = await processTemplateWithFallback(
              templateId,
              context,
              await processUrl(tab.url, cleaningMode),
            );

            return result.content;
          }),
        );

        return results.join("\n");
      } catch (error) {
        console.debug("Error processing custom template:", error);
        // 使用fallback处理
        const urls = await Promise.all(
          tabs.map((tab) => processUrl(tab.url, cleaningMode)),
        );
        return urls.join("\n");
      }
    }

    switch (format) {
      case "text":
      case "url":
        const urls = await Promise.all(
          tabs.map((tab) => processUrl(tab.url, cleaningMode)),
        );
        return urls.join("\n");

      case "markdown":
        const markdownLinks = await Promise.all(
          tabs.map(async (tab) => {
            const url = await processUrl(tab.url, cleaningMode);
            const title = tab.title || getLocalMessage("untitled");
            return `- [${title}](${url})`;
          }),
        );
        return markdownLinks.join("\n");

      case "shortUrl":
        // 获取短链服务设置
        const selectedService =
          await settingsManager.getSetting("shortUrlService");

        // 批量生成短链，使用限流器
        const shortUrls = await Promise.all(
          tabs.map(async (tab) => {
            // 修复: 先清理URL
            const cleanedUrl = await processUrl(tab.url, cleaningMode);

            // 修复: 使用清理后的URL检查缓存
            const cachedUrl = await shortUrlCache.get(
              cleanedUrl,
              selectedService,
            );
            if (cachedUrl) {
              return cachedUrl;
            }

            // 使用全局限流器处理请求
            return await globalShortUrlThrottle.throttledRequest(async () => {
              try {
                const shortUrl = await createShortUrlDirect(
                  cleanedUrl,
                  selectedService,
                );

                // 修复: 使用清理后的URL保存到缓存
                await shortUrlCache.set(cleanedUrl, selectedService, shortUrl);
                return shortUrl;
              } catch (error) {
                console.debug("短链生成失败:", error);
                return cleanedUrl; // 如果出错则返回清理后的URL
              }
            });
          }),
        );
        return shortUrls.join("\n");

      default:
        const defaultUrls = await Promise.all(
          tabs.map((tab) => processUrl(tab.url, cleaningMode)),
        );
        return defaultUrls.join("\n");
    }
  }

  // 显示预览
  async function showPreview() {
    const selectedTabsList = getSelectedTabs();
    const format = document.getElementById("silentCopyFormat").value;

    // 显示加载状态
    elements.previewText.textContent =
      getLocalMessage("loading") || "Loading...";

    // 如果是短链格式且有多个URL，显示进度
    if (format === "shortUrl" && selectedTabsList.length > 1) {
      elements.previewText.textContent =
        getLocalMessage("loading") || "加载中...";

      // 添加进度显示
      const progressText = document.createElement("div");
      progressText.style.marginTop = "10px";
      progressText.style.fontSize = "14px";
      progressText.style.color = "#666";
      progressText.textContent = `0 / ${selectedTabsList.length}`;
      elements.previewText.appendChild(progressText);

      // 使用新的进度回调功能
      let completedCount = 0;

      globalShortUrlThrottle.setProgressCallback(() => {
        completedCount++;
        progressText.textContent = `${completedCount} / ${selectedTabsList.length}`;
      });

      try {
        const content = await formatOutput(selectedTabsList, format);
        elements.previewText.textContent = content;
      } finally {
        // 清除进度回调
        globalShortUrlThrottle.clearProgressCallback();
      }
    } else {
      const content = await formatOutput(selectedTabsList, format);
      elements.previewText.textContent = content;
    }

    // 更新预览统计文本
    const statsElement = elements.previewCount.parentElement;
    const statsText = getLocalMessage("previewStats") || "将复制 {count} 个URL";
    statsElement.innerHTML = statsText.replace(
      "{count}",
      `<strong id="previewCount">${selectedTabsList.length}</strong>`,
    );

    // 重新获取previewCount元素引用，因为innerHTML会重新创建元素
    elements.previewCount = document.getElementById("previewCount");

    elements.previewModal.classList.add("show");
  }

  // 隐藏预览
  function hidePreview() {
    elements.previewModal.classList.remove("show");
  }

  // 复制到剪贴板
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 备用方法
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      return true;
    } catch (error) {
      console.debug("复制失败:", error);
      return false;
    }
  }

  // 执行复制
  async function performCopy() {
    const selectedTabsList = getSelectedTabs();
    if (selectedTabsList.length === 0) return;

    const format = document.getElementById("silentCopyFormat").value;
    let success = false;
    const startTime = Date.now();

    // 如果是短链格式且有多个URL，显示进度通知
    if (format === "shortUrl" && selectedTabsList.length > 1) {
      toast.info(getLocalMessage("loading") || "加载中...");

      // 使用新的进度回调功能
      let completedCount = 0;

      globalShortUrlThrottle.setProgressCallback(() => {
        completedCount++;

        // 更新进度通知
        const progressMsg =
          getLocalMessage("shortUrlProgress") ||
          `正在生成短链... (${completedCount}/${selectedTabsList.length})`;
        toast.info(
          progressMsg
            .replace("{current}", completedCount)
            .replace("{total}", selectedTabsList.length),
        );
      });

      try {
        const content = await formatOutput(selectedTabsList, format);
        success = await copyToClipboard(content);
      } finally {
        // 清除进度回调
        globalShortUrlThrottle.clearProgressCallback();
      }
    } else {
      const content = await formatOutput(selectedTabsList, format);
      success = await copyToClipboard(content);
    }

    // 记录批量复制事件
    const duration = Date.now() - startTime;
    const urlCleaning =
      document
        .getElementById("removeParamsToggle")
        ?.getAttribute("data-value") || "off";
    const shortService =
      document.getElementById("shortUrlService")?.value || "isgd";

    const trackData = {
      format: format === "silentCopyFormat" ? "url" : format,
      source: "batch",
      success: success,
      duration: duration,
      urlCleaning: urlCleaning !== undefined ? urlCleaning : null,
      templateId: null,
      templateName: null,
      shortService:
        format === "shortUrl"
          ? shortService !== undefined
            ? shortService
            : null
          : null,
      errorType: success ? null : "clipboard",
      errorMessage: success ? null : "Batch copy failed",
    };

    trackCopy(trackData).catch((error) => {
      console.debug("Failed to track batch copy:", error);
    });

    if (success) {
      toast.success(
        getLocalMessage("batchCopySuccess") ||
          `批量复制成功: ${selectedTabsList.length} 个URL`,
      );
    } else {
      toast.error(getLocalMessage("copyFailed") || "复制失败");
    }
  }

  // 设置折叠功能
  function initializeSettingsCollapse() {
    const settingsHeader = document.getElementById("settingsHeader");
    const settingsCard = document.querySelector(".settings-card");
    const collapseIcon = document.querySelector(".collapse-icon");

    // 获取当前折叠状态，默认为折叠
    let isCollapsed = true;
    updateCollapseState();

    // 切换折叠状态
    function toggleCollapse() {
      isCollapsed = !isCollapsed;
      updateCollapseState();

      // 不保存状态，每次刷新都恢复折叠
    }

    // 更新折叠状态
    function updateCollapseState() {
      const iconCollapsed = collapseIcon.querySelector(".icon-collapsed");
      const iconExpanded = collapseIcon.querySelector(".icon-expanded");

      if (isCollapsed) {
        settingsCard.classList.add("collapsed");
        // 显示向外箭头（展开提示）
        iconCollapsed.style.display = "block";
        iconExpanded.style.display = "none";
      } else {
        settingsCard.classList.remove("collapsed");
        // 显示向内手势（收起提示）
        iconCollapsed.style.display = "none";
        iconExpanded.style.display = "block";
      }
    }

    // 绑定点击事件
    settingsHeader.addEventListener("click", (e) => {
      // 如果点击的是"更多设置"按钮，不触发折叠
      if (e.target.closest(".more-settings-btn")) {
        return;
      }
      toggleCollapse();
    });
  }

  // 刷新标签页列表 - 优化版本，保留DOM结构只更新内容
  async function refreshTabs() {
    // 显示加载状态
    elements.loading.style.display = "flex";

    // 保存当前的DOM结构中的tabsList引用
    const existingTabsList = elements.tabsContainer.querySelector(".tabs-list");

    // 获取窗口信息并更新选择器
    await getAllWindows();
    await updateWindowSelector();

    // 获取新的标签页数据
    allTabs = await getAllTabs();
    selectedTabs.clear();

    // 应用过滤器并重新渲染（这将复用现有的tabsList）
    await applyFilters();
    updateCopyButton();

    // 隐藏加载状态
    elements.loading.style.display = "none";
  }

  // 事件监听器

  elements.refreshBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 添加旋转动画类
    const svg = elements.refreshBtn.querySelector("svg");
    if (svg) {
      svg.classList.add("animate");

      // 监听动画结束事件，移除动画类
      svg.addEventListener(
        "animationend",
        () => {
          svg.classList.remove("animate");
        },
        { once: true },
      );
    }

    refreshTabs();
  });

  elements.masterCheckbox.addEventListener("change", handleMasterCheckboxClick);

  elements.selectNoneBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectNone();
  });
  elements.invertSelectionBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    invertSelection();
  });
  elements.previewBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showPreview();
  });
  elements.copyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    performCopy();
  });

  // 预览模态框事件
  elements.previewModalClose.addEventListener("click", hidePreview);
  elements.previewModalOverlay.addEventListener("click", hidePreview);
  elements.previewCancelBtn.addEventListener("click", hidePreview);
  elements.previewCopyBtn.addEventListener("click", async () => {
    await performCopy();
    hidePreview();
  });

  // 过滤器变化事件
  document
    .getElementById("windowScopeSelect")
    .addEventListener("change", refreshTabs);

  document
    .getElementById("webPagesOnly")
    .addEventListener("change", async () => {
      await updateWindowSelector();
      await applyFilters();
      saveBatchSettings();
    });

  elements.removeDuplicates.addEventListener("change", async () => {
    await updateWindowSelector();
    await applyFilters();
    saveBatchSettings();
  });

  // 保存复制格式设置
  const silentCopyFormat = document.getElementById("silentCopyFormat");
  if (silentCopyFormat) {
    silentCopyFormat.addEventListener("change", saveBatchSettings);
  }

  // ESC 键关闭预览
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      elements.previewModal.classList.contains("show")
    ) {
      hidePreview();
    }
  });

  // 初始化
  await initializeI18n();
  loadVersion();
  setupTemplateChangeListener(); // 设置模板变更监听器

  // 先加载设置，获取设置对象
  const settings = await loadSettings();

  // 加载自定义模板，并使用当前的批量复制格式设置
  await loadCustomTemplates(settings.batchSilentCopyFormat);

  initializeUrlCleaningSwitch();
  initializeSettingsCollapse(); // 添加设置折叠功能
  await refreshTabs();
});
