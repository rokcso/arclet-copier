import {
  processUrl,
  isValidWebUrl,
  isRestrictedPage,
  getMessage,
} from "../shared/constants.js";

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
    closeBtn: document.getElementById("closeBtn"),
    selectNoneBtn: document.getElementById("selectNoneBtn"),
    invertSelectionBtn: document.getElementById("invertSelectionBtn"),
    selectedCount: document.getElementById("selectedCount"),
    totalCount: document.getElementById("totalCount"),
    tabsContainer: document.getElementById("tabsContainer"),
    tabsControls: document.getElementById("tabsControls"),
    tabsList: document.getElementById("tabsList"),
    masterCheckbox: document.getElementById("masterCheckbox"),
    masterCheckboxLabel: document.getElementById("masterCheckboxLabel"),
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
    notification: document.getElementById("notification"),
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
      console.error("Failed to load locale messages:", error);
      return {};
    }
  }

  // i18n 辅助函数
  function getLocalMessage(key, substitutions = []) {
    if (localeMessages[key] && localeMessages[key].message) {
      return localeMessages[key].message;
    }
    return chrome.i18n.getMessage(key, substitutions) || key;
  }

  // 初始化国际化
  async function initializeI18n() {
    const result = await chrome.storage.sync.get(["language"]);
    const browserLang = chrome.i18n.getUILanguage();
    let defaultLang = "en";
    if (browserLang.startsWith("zh")) {
      defaultLang = "zh_CN";
    }
    currentLocale = result.language || defaultLang;

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

  // 加载版本信息
  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      elements.version.textContent = `v${manifest.version}`;
    }
  }

  // 加载设置
  async function loadSettings() {
    const result = await chrome.storage.sync.get([
      "urlCleaning",
      "appearance",
      "themeColor",
    ]);

    currentSettings = {
      urlCleaning: result.urlCleaning || "smart",
      appearance: result.appearance || "system",
      themeColor: result.themeColor || "green",
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

    const switchOptions =
      elements.urlCleaningSwitch.querySelectorAll(".switch-option");
    switchOptions.forEach((option, index) => {
      option.addEventListener("click", () => {
        const newValue = options[index].value;
        elements.urlCleaningSwitch.setAttribute("data-value", newValue);
        currentSettings.urlCleaning = newValue;
        updateSliderPosition(elements.urlCleaningSwitch);
        applyFilters();
      });
    });

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
      console.error("获取窗口失败:", error);
      return [];
    }
  }

  // 更新窗口选择器选项
  function updateWindowSelector() {
    const select = document.getElementById("windowScopeSelect");
    const currentValue = select.value;

    // 清空现有选项
    select.innerHTML = "";

    // 添加当前窗口选项
    const currentWindow = allWindows.find((w) => w.id === currentWindowId);
    if (currentWindow) {
      const currentOption = document.createElement("option");
      currentOption.value = "current";
      currentOption.textContent = `当前 (${currentWindow.tabs.length}个)`;
      select.appendChild(currentOption);
    }

    // 添加全部窗口选项
    const allOption = document.createElement("option");
    allOption.value = "all";
    const totalTabs = allWindows.reduce((sum, w) => sum + w.tabs.length, 0);
    allOption.textContent = `全部 (${totalTabs}个)`;
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
      console.error("获取标签页失败:", error);
      return [];
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
  function applyFilters() {
    const urlTypes = Array.from(
      document.querySelectorAll('input[name="urlType"]:checked'),
    ).map((input) => input.value);
    const removeDuplicates = elements.removeDuplicates.checked;

    filteredTabs = allTabs.filter((tab) => {
      const urlType = categorizeUrl(tab.url);
      return urlTypes.includes(urlType);
    });

    // 去重
    if (removeDuplicates) {
      const seen = new Set();
      const cleaningMode = currentSettings.urlCleaning;

      filteredTabs = filteredTabs.filter((tab) => {
        const processedUrl = processUrl(tab.url, cleaningMode);
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
  function detectDuplicates(tabs) {
    const urlCounts = new Map();
    const duplicateUrls = new Set();

    // 统计每个处理后的 URL 出现次数
    tabs.forEach((tab) => {
      const processedUrl = processUrl(tab.url, currentSettings.urlCleaning);
      const count = urlCounts.get(processedUrl) || 0;
      urlCounts.set(processedUrl, count + 1);

      if (count >= 1) {
        duplicateUrls.add(processedUrl);
      }
    });

    return duplicateUrls;
  }

  // 渲染标签页列表
  function renderTabs() {
    const container = elements.tabsList;
    container.innerHTML = "";

    // 显示操作栏
    elements.tabsControls.style.display = "flex";

    if (filteredTabs.length === 0) {
      container.innerHTML = `
        <div class="loading">
          <span>${getLocalMessage("noTabsFound") || "没有找到符合条件的标签页"}</span>
        </div>
      `;
      // 隐藏操作栏
      elements.tabsControls.style.display = "none";
      return;
    }

    // 检测重复项（只有在未开启去重功能时才检测）
    const duplicateUrls = !elements.removeDuplicates.checked
      ? detectDuplicates(filteredTabs)
      : new Set();

    filteredTabs.forEach((tab) => {
      const processedUrl = processUrl(tab.url, currentSettings.urlCleaning);
      const isDuplicate = duplicateUrls.has(processedUrl);
      const tabElement = createTabElement(tab, isDuplicate);
      container.appendChild(tabElement);
    });

    // 更新主复选框状态
    updateMasterCheckbox();
  }

  // 创建标签页元素
  function createTabElement(tab, isDuplicate = false) {
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

    const processedUrl = processUrl(tab.url, currentSettings.urlCleaning);
    const domain = getDomain(tab.url);

    const duplicateWatermark = isDuplicate
      ? `<span class="watermark-text" title="${getLocalMessage("duplicateUrl") || "重复的URL"}">${getLocalMessage("duplicate") || "DUPLICATE"}</span>`
      : "";

    div.innerHTML = `
      <input type="checkbox" class="tab-checkbox" ${isSelected ? "checked" : ""}>
      <img class="tab-favicon" src="${tab.favIconUrl || chrome.runtime.getURL("assets/icons/icon16.png")}"
           onerror="this.src='${chrome.runtime.getURL("assets/icons/icon16.png")}'">
      <div class="tab-info">
        <div class="tab-title">
          ${escapeHtml(tab.title || getLocalMessage("untitled"))}
          ${duplicateWatermark}
        </div>
        <div class="tab-url">${escapeHtml(processedUrl)}</div>
      </div>
      <div class="tab-domain">${escapeHtml(domain)}</div>
    `;

    // 事件监听
    div.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      if (e.target.classList.contains("watermark-text")) return;
      toggleTabSelection(tab.id);
    });

    const checkbox = div.querySelector(".tab-checkbox");
    checkbox.addEventListener("change", () => {
      toggleTabSelection(tab.id);
    });

    return div;
  }

  // 获取域名
  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url.split("/")[0] || "";
    }
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

    const checkbox = element.querySelector(".tab-checkbox");
    const isSelected = selectedTabs.has(tabId);

    checkbox.checked = isSelected;
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
      elements.masterCheckboxLabel.textContent = "全选";
      return;
    }

    if (selectedCount === 0) {
      elements.masterCheckbox.checked = false;
      elements.masterCheckbox.indeterminate = false;
      elements.masterCheckboxLabel.textContent = `全选 (${totalTabs}项)`;
    } else if (selectedCount === totalTabs) {
      elements.masterCheckbox.checked = true;
      elements.masterCheckbox.indeterminate = false;
      elements.masterCheckboxLabel.textContent = `全选 (${totalTabs}项)`;
    } else {
      elements.masterCheckbox.checked = false;
      elements.masterCheckbox.indeterminate = true;
      elements.masterCheckboxLabel.textContent = `部分 (${selectedCount}/${totalTabs}项)`;
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
  function formatOutput(tabs, format) {
    const cleaningMode = currentSettings.urlCleaning;

    switch (format) {
      case "text":
        return tabs.map((tab) => processUrl(tab.url, cleaningMode)).join("\n");

      case "markdown":
        return tabs
          .map((tab) => {
            const url = processUrl(tab.url, cleaningMode);
            const title = tab.title || getLocalMessage("untitled");
            return `- [${title}](${url})`;
          })
          .join("\n");

      case "html":
        const items = tabs
          .map((tab) => {
            const url = processUrl(tab.url, cleaningMode);
            const title = escapeHtml(tab.title || getLocalMessage("untitled"));
            return `  <li><a href="${escapeHtml(url)}">${title}</a></li>`;
          })
          .join("\n");
        return `<ul>\n${items}\n</ul>`;

      case "json":
        return JSON.stringify(
          tabs.map((tab) => ({
            title: tab.title,
            url: processUrl(tab.url, cleaningMode),
            domain: getDomain(tab.url),
            favIconUrl: tab.favIconUrl,
          })),
          null,
          2,
        );

      default:
        return tabs.map((tab) => processUrl(tab.url, cleaningMode)).join("\n");
    }
  }

  // 显示预览
  function showPreview() {
    const selectedTabsList = getSelectedTabs();
    const format = document.querySelector(
      'input[name="outputFormat"]:checked',
    ).value;
    const content = formatOutput(selectedTabsList, format);

    elements.previewCount.textContent = selectedTabsList.length;
    elements.previewText.textContent = content;

    // 更新预览统计文本
    const statsElement = elements.previewCount.parentElement;
    const statsText = getLocalMessage("previewStats") || "将复制 {count} 个URL";
    statsElement.innerHTML = statsText.replace(
      "{count}",
      `<strong id="previewCount">${selectedTabsList.length}</strong>`,
    );

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
      console.error("复制失败:", error);
      return false;
    }
  }

  // 执行复制
  async function performCopy() {
    const selectedTabsList = getSelectedTabs();
    if (selectedTabsList.length === 0) return;

    const format = document.querySelector(
      'input[name="outputFormat"]:checked',
    ).value;
    const content = formatOutput(selectedTabsList, format);

    const success = await copyToClipboard(content);

    if (success) {
      showNotification(
        getLocalMessage("copySuccess") ||
          `已复制 ${selectedTabsList.length} 个URL`,
      );

      // 检查是否显示 Chrome 通知
      const settings = await chrome.storage.sync.get(["chromeNotifications"]);
      if (settings.chromeNotifications !== false) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
          title: chrome.i18n.getMessage("extName"),
          message:
            getLocalMessage("batchCopySuccess") ||
            `批量复制成功: ${selectedTabsList.length} 个URL`,
        });
      }
    } else {
      showNotification(getLocalMessage("copyFailed") || "复制失败");
    }
  }

  // 显示通知
  function showNotification(message) {
    const notification = elements.notification;
    notification.querySelector(".notification-text").textContent = message;
    notification.classList.add("show");

    setTimeout(() => {
      notification.classList.remove("show");
    }, 3000);
  }

  // 刷新标签页列表
  async function refreshTabs() {
    elements.loading.style.display = "flex";
    elements.tabsList.innerHTML = "";
    elements.tabsControls.style.display = "none";

    // 先获取窗口信息，然后更新选择器
    await getAllWindows();
    updateWindowSelector();

    allTabs = await getAllTabs();
    selectedTabs.clear();
    applyFilters();
    updateCopyButton();

    elements.loading.style.display = "none";
  }

  // 事件监听器
  elements.refreshBtn.addEventListener("click", refreshTabs);
  elements.closeBtn.addEventListener("click", () => window.close());
  elements.masterCheckbox.addEventListener("change", handleMasterCheckboxClick);
  elements.selectNoneBtn.addEventListener("click", selectNone);
  elements.invertSelectionBtn.addEventListener("click", invertSelection);
  elements.previewBtn.addEventListener("click", showPreview);
  elements.copyBtn.addEventListener("click", performCopy);

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

  document.querySelectorAll('input[name="urlType"]').forEach((input) => {
    input.addEventListener("change", applyFilters);
  });

  elements.removeDuplicates.addEventListener("change", applyFilters);

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
  await loadSettings();
  initializeUrlCleaningSwitch();
  await refreshTabs();
});
