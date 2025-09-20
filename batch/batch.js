import {
  processUrl,
  isValidWebUrl,
  isRestrictedPage,
  getMessage,
} from "../shared/constants.js";

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
        console.log("使用持久化缓存 (batch):", item.shortUrl);
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
          cache[current].timestamp < cache[oldest].timestamp ? current : oldest,
        );
        delete cache[oldestKey];
      }

      cache[key] = {
        shortUrl,
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({ [this.storageKey]: cache });
      console.log("短链已持久化缓存 (batch):", shortUrl);
    } catch (error) {
      console.error("缓存保存失败:", error);
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // 创建持久化短链缓存实例
  const shortUrlCache = new PersistentShortUrlCache();
  // 状态管理
  let allTabs = [];
  let filteredTabs = [];
  let selectedTabs = new Set();
  let currentSettings = {};

  // DOM 元素
  const elements = {
    version: document.getElementById("version"),
    moreSettingsBtn: document.getElementById("moreSettingsBtn"),
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
        option.addEventListener("click", () => {
          const newValue = option.getAttribute("data-value");
          elements.urlCleaningSwitch.setAttribute("data-value", newValue);
          currentSettings.urlCleaning = newValue;
          updateSliderPosition(elements.urlCleaningSwitch);
          applyFilters();
        });
      });
    } else {
      // 旧版本的三段式开关（保持兼容性）
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
      const currentText = getLocalMessage("currentWindow");
      const countText = getLocalMessage("windowTabsCount", [
        currentWindow.tabs.length.toString(),
      ]);
      currentOption.textContent = `${currentText} (${countText})`;
      select.appendChild(currentOption);
    }

    // 添加全部窗口选项
    const allOption = document.createElement("option");
    allOption.value = "all";
    const totalTabs = allWindows.reduce((sum, w) => sum + w.tabs.length, 0);
    const allText = getLocalMessage("allWindows");
    const totalCountText = getLocalMessage("windowTabsCount", [
      totalTabs.toString(),
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

    switch (format) {
      case "text":
      case "url":
        return tabs.map((tab) => processUrl(tab.url, cleaningMode)).join("\n");

      case "markdown":
        return tabs
          .map((tab) => {
            const url = processUrl(tab.url, cleaningMode);
            const title = tab.title || getLocalMessage("untitled");
            return `- [${title}](${url})`;
          })
          .join("\n");

      case "shortUrl":
        // 获取短链服务设置
        const result = await chrome.storage.sync.get(["shortUrlService"]);
        const selectedService = result.shortUrlService || "isgd";

        // 批量生成短链
        const shortUrls = await Promise.all(
          tabs.map(async (tab) => {
            const url = processUrl(tab.url, cleaningMode);

            // 首先检查缓存
            const cachedUrl = await shortUrlCache.get(
              url,
              selectedService,
              cleaningMode,
            );
            if (cachedUrl) {
              return cachedUrl;
            }

            try {
              const response = await chrome.runtime.sendMessage({
                action: "createShortUrl",
                url: url,
                service: selectedService,
              });

              if (response.shortUrl) {
                // 保存到缓存
                await shortUrlCache.set(
                  url,
                  selectedService,
                  cleaningMode,
                  response.shortUrl,
                );
                return response.shortUrl;
              }

              return url; // 如果失败则返回原URL
            } catch (error) {
              console.error("短链生成失败:", error);
              return url; // 如果出错则返回原URL
            }
          }),
        );
        return shortUrls.join("\n");

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
  async function showPreview() {
    const selectedTabsList = getSelectedTabs();
    const format = document.getElementById("silentCopyFormat").value;

    // 显示加载状态
    elements.previewText.textContent =
      getLocalMessage("loading") || "Loading...";

    const content = await formatOutput(selectedTabsList, format);

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

    const format = document.getElementById("silentCopyFormat").value;
    const content = await formatOutput(selectedTabsList, format);

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

  // 打开options页面
  function openOptionsPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("options/options.html"),
    });
  }

  // 设置折叠功能
  function initializeSettingsCollapse() {
    const settingsHeader = document.getElementById("settingsHeader");
    const settingsCard = document.querySelector(".settings-card");
    const collapseIcon = document.querySelector(".collapse-icon");
    const settingsStatusPreview = document.getElementById(
      "settingsStatusPreview",
    );

    // 获取当前折叠状态，默认为折叠
    let isCollapsed =
      localStorage.getItem("batchSettingsCollapsed") !== "false";
    updateCollapseState();

    // 切换折叠状态
    function toggleCollapse() {
      isCollapsed = !isCollapsed;
      updateCollapseState();

      // 保存状态到localStorage
      localStorage.setItem("batchSettingsCollapsed", isCollapsed);
    }

    // 更新折叠状态
    function updateCollapseState() {
      if (isCollapsed) {
        settingsCard.classList.add("collapsed");
        collapseIcon.style.transform = "";
      } else {
        settingsCard.classList.remove("collapsed");
        collapseIcon.style.transform = "rotate(180deg)";
      }
      updateSettingsPreview();
    }

    // 更新设置预览文本
    function updateSettingsPreview() {
      const webPagesOnly = document.getElementById("webPagesOnly").checked;
      const removeDuplicates =
        document.getElementById("removeDuplicates").checked;
      const urlCleaning = document
        .getElementById("urlCleaningSwitch")
        .getAttribute("data-value");
      const silentCopyFormat =
        document.getElementById("silentCopyFormat").value;

      if (isCollapsed) {
        // 折叠时显示关键设置状态
        const parts = [];
        if (webPagesOnly) parts.push("仅网页");
        if (removeDuplicates) parts.push("去重");

        const cleaningText = {
          off: "不清理",
          smart: "智能清理",
          aggressive: "全部清理",
        }[urlCleaning];
        parts.push(cleaningText);

        settingsStatusPreview.textContent = ` · ${parts.join(" · ")}`;
        settingsStatusPreview.style.display = "inline";
      } else {
        // 展开时隐藏状态预览
        settingsStatusPreview.textContent = "";
        settingsStatusPreview.style.display = "none";
      }
    }

    // 监听设置变化，更新状态预览
    function updateChangeIndicator() {
      settingsCard.classList.add("has-changes");
      updateSettingsPreview();

      // 2秒后移除变化指示器
      setTimeout(() => {
        settingsCard.classList.remove("has-changes");
      }, 2000);
    }

    // 绑定点击事件
    settingsHeader.addEventListener("click", (e) => {
      // 如果点击的是"更多设置"按钮，不触发折叠
      if (e.target.closest(".more-settings-btn")) {
        return;
      }
      toggleCollapse();
    });

    // 监听设置变化
    const settings = ["webPagesOnly", "removeDuplicates", "silentCopyFormat"];
    settings.forEach((settingId) => {
      const element = document.getElementById(settingId);
      if (element) {
        element.addEventListener("change", updateChangeIndicator);
      }
    });

    // 监听三段滑块变化
    const urlCleaningSwitch = document.getElementById("urlCleaningSwitch");
    if (urlCleaningSwitch) {
      urlCleaningSwitch.addEventListener("click", (e) => {
        setTimeout(updateChangeIndicator, 100); // 延迟以等待状态更新
      });
    }

    // 初始化状态预览
    updateSettingsPreview();
  }

  // 刷新标签页列表 - 优化版本，保留DOM结构只更新内容
  async function refreshTabs() {
    // 显示加载状态
    elements.loading.style.display = "flex";

    // 保存当前的DOM结构中的tabsList引用
    const existingTabsList = elements.tabsContainer.querySelector(".tabs-list");

    // 获取窗口信息并更新选择器
    await getAllWindows();
    updateWindowSelector();

    // 获取新的标签页数据
    allTabs = await getAllTabs();
    selectedTabs.clear();

    // 应用过滤器并重新渲染（这将复用现有的tabsList）
    applyFilters();
    updateCopyButton();

    // 隐藏加载状态
    elements.loading.style.display = "none";
  }

  // 事件监听器
  elements.moreSettingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openOptionsPage();
  });

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
    .addEventListener("change", applyFilters);

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
  initializeSettingsCollapse(); // 添加设置折叠功能
  await refreshTabs();
});
