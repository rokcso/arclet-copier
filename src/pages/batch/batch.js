// Main entry point for batch page (refactored)

import {
  loadTemplatesIntoSelect,
  validateAndFixSelector,
} from "../../shared/constants.js";
import settingsManager from "../../shared/settings-manager.js";
import {
  initializeI18n,
  getLocalMessage,
} from "../../shared/ui/i18n.js";
import batchState from "./state-manager.js";
import { applyTabFilters } from "./tab-filters.js";
import {
  renderTabsList,
  updateTabElement,
  updateCounts,
  updateMasterCheckbox,
  updateCopyButton,
} from "./tab-renderer.js";
import {
  showPreview,
  hidePreview,
  performCopy,
  refreshTabs as refreshTabsHandler,
} from "./event-handlers.js";

document.addEventListener("DOMContentLoaded", async () => {
  // DOM elements
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

  // ==================== Template Management ====================

  async function loadCustomTemplates(preserveValue = null) {
    const silentCopyFormat = document.getElementById("silentCopyFormat");
    await loadTemplatesIntoSelect(silentCopyFormat, {
      includeIcons: true,
      clearExisting: true,
      onError: (error) => {
        console.debug("Failed to load custom templates in batch:", error);
      },
    });

    if (preserveValue) {
      await validateAndFixSelector(
        silentCopyFormat,
        preserveValue,
        "batchSilentCopyFormat",
        settingsManager.updateSettings.bind(settingsManager),
      );
    }
  }

  function setupTemplateChangeListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TEMPLATE_CHANGED") {
        console.log(
          `Batch received template change notification: ${message.changeType}`,
        );

        settingsManager.getAllSettings().then((currentSettings) => {
          const currentValue = currentSettings.batchSilentCopyFormat || "url";
          loadCustomTemplates(currentValue).catch((error) => {
            console.debug("Failed to reload templates after change:", error);
          });
        });

        sendResponse({ received: true });
      }
    });
  }

  // ==================== Settings Management ====================

  function loadVersion() {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      elements.version.textContent = `v${manifest.version}`;
    }
  }

  async function loadSettings() {
    const settings = await settingsManager.getSettings([
      "appearance",
      "themeColor",
      "batchUrlCleaning",
      "batchSilentCopyFormat",
      "batchWebPagesOnly",
      "batchRemoveDuplicates",
    ]);

    const currentSettings = {
      urlCleaning: settings.batchUrlCleaning || "smart",
      appearance: settings.appearance,
      themeColor: settings.themeColor,
    };

    batchState.setSettings(currentSettings);

    // Apply theme
    applyTheme(currentSettings.appearance);
    applyThemeColor(currentSettings.themeColor);

    // Set URL cleaning switch
    elements.urlCleaningSwitch.setAttribute(
      "data-value",
      currentSettings.urlCleaning,
    );
    updateSliderPosition(elements.urlCleaningSwitch);

    // Restore batch-specific settings
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

  async function saveBatchSettings() {
    const silentCopyFormat = document.getElementById("silentCopyFormat");
    const webPagesOnly = document.getElementById("webPagesOnly");
    const currentSettings = batchState.getSettings();

    await settingsManager.updateSettings({
      batchUrlCleaning: currentSettings.urlCleaning,
      batchSilentCopyFormat: silentCopyFormat ? silentCopyFormat.value : "url",
      batchWebPagesOnly: webPagesOnly ? webPagesOnly.checked : true,
      batchRemoveDuplicates: elements.removeDuplicates
        ? elements.removeDuplicates.checked
        : true,
    });
  }

  // ==================== Theme Management ====================

  function applyTheme(theme) {
    const htmlElement = document.documentElement;
    if (theme === "system") {
      htmlElement.removeAttribute("data-theme");
    } else {
      htmlElement.setAttribute("data-theme", theme);
    }
  }

  function applyThemeColor(color) {
    const htmlElement = document.documentElement;
    htmlElement.setAttribute("data-color", color);
  }

  // ==================== Switch Management ====================

  function updateSliderPosition(switchElement) {
    const options = ["off", "smart", "aggressive"];
    const currentValue = switchElement.getAttribute("data-value");
    const currentIndex = options.findIndex((opt) => opt === currentValue);

    if (currentIndex === -1) {
      return;
    }

    // New three-segment switch
    if (switchElement.classList.contains("three-segment-switch")) {
      const segmentOptions = switchElement.querySelectorAll(".segment-option");
      segmentOptions.forEach((option) => option.classList.remove("active"));
      if (segmentOptions[currentIndex]) {
        segmentOptions[currentIndex].classList.add("active");
      }
      return;
    }

    // Old version (backward compatibility)
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

  function initializeUrlCleaningSwitch() {
    const options = [
      { value: "off", text: "关闭" },
      { value: "smart", text: "智能" },
      { value: "aggressive", text: "激进" },
    ];

    if (elements.urlCleaningSwitch.classList.contains("three-segment-switch")) {
      const segmentOptions =
        elements.urlCleaningSwitch.querySelectorAll(".segment-option");
      segmentOptions.forEach((option) => {
        option.addEventListener("click", async () => {
          const newValue = option.getAttribute("data-value");
          elements.urlCleaningSwitch.setAttribute("data-value", newValue);
          batchState.updateSetting("urlCleaning", newValue);
          updateSliderPosition(elements.urlCleaningSwitch);
          await updateWindowSelector();
          await applyFilters();
          saveBatchSettings();
        });
      });
    } else {
      const switchOptions =
        elements.urlCleaningSwitch.querySelectorAll(".switch-option");
      switchOptions.forEach((option, index) => {
        option.addEventListener("click", async () => {
          const newValue = options[index].value;
          elements.urlCleaningSwitch.setAttribute("data-value", newValue);
          batchState.updateSetting("urlCleaning", newValue);
          updateSliderPosition(elements.urlCleaningSwitch);
          await updateWindowSelector();
          await applyFilters();
          saveBatchSettings();
        });
      });
    }

    updateSliderPosition(elements.urlCleaningSwitch);
  }

  // ==================== Windows Management ====================

  async function getAllWindows() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const currentWindow = await chrome.windows.getCurrent();
      batchState.setWindows(windows, currentWindow.id);
      return windows;
    } catch (error) {
      console.debug("获取窗口失败:", error);
      return [];
    }
  }

  async function calculateFilteredTabs(tabs) {
    const webPagesOnly = document.getElementById("webPagesOnly").checked;
    const removeDuplicates = elements.removeDuplicates.checked;
    const currentSettings = batchState.getSettings();

    return await applyTabFilters(tabs, {
      webPagesOnly,
      removeDuplicates,
      cleaningMode: currentSettings.urlCleaning,
    });
  }

  async function updateWindowSelector() {
    const select = document.getElementById("windowScopeSelect");
    const currentValue = select.value;

    select.innerHTML = "";

    const allWindows = batchState.getWindows();
    const currentWindowId = batchState.getCurrentWindowId();

    // Add current window option
    const currentWindow = allWindows.find((w) => w.id === currentWindowId);
    if (currentWindow) {
      const currentOption = document.createElement("option");
      currentOption.value = "current";
      const currentText = getLocalMessage("currentWindow");
      const filtered = await calculateFilteredTabs(currentWindow.tabs);
      const countText = getLocalMessage("windowTabsCount", [
        filtered.length.toString(),
      ]);
      currentOption.textContent = `${currentText} (${countText})`;
      select.appendChild(currentOption);
    }

    // Add all windows option
    const allOption = document.createElement("option");
    allOption.value = "all";
    const allTabsFromWindows = allWindows.reduce(
      (acc, w) => [...acc, ...w.tabs],
      [],
    );
    const filtered = await calculateFilteredTabs(allTabsFromWindows);
    const allText = getLocalMessage("allWindows");
    const totalCountText = getLocalMessage("windowTabsCount", [
      filtered.length.toString(),
    ]);
    allOption.textContent = `${allText} (${totalCountText})`;
    select.appendChild(allOption);

    select.value = currentValue || "current";
  }

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

  // ==================== Filter & Render ====================

  async function applyFilters() {
    const webPagesOnly = document.getElementById("webPagesOnly").checked;
    const removeDuplicates = elements.removeDuplicates.checked;
    const currentSettings = batchState.getSettings();

    const filtered = await applyTabFilters(batchState.getAllTabs(), {
      webPagesOnly,
      removeDuplicates,
      cleaningMode: currentSettings.urlCleaning,
    });

    batchState.setFilteredTabs(filtered);

    await renderTabs();
    updateCountsUI();
  }

  async function renderTabs() {
    elements.tabsControls.style.display = "flex";

    const filteredTabs = batchState.getFilteredTabs();
    const selectedTabs = batchState.selectedTabs;
    const currentSettings = batchState.getSettings();
    const removeDuplicatesEnabled = elements.removeDuplicates.checked;

    await renderTabsList(
      elements.tabsContainer,
      filteredTabs,
      selectedTabs,
      currentSettings.urlCleaning,
      removeDuplicatesEnabled,
      toggleTabSelection,
    );

    updateMasterCheckboxUI();
  }

  // ==================== Selection Management ====================

  function toggleTabSelection(tabId) {
    batchState.toggleSelection(tabId);
    updateTabElement(tabId, batchState.hasSelection(tabId));
    updateCountsUI();
    updateCopyButtonUI();
    updateMasterCheckboxUI();
  }

  function selectAll() {
    batchState.selectAll();
    renderTabs();
    updateCountsUI();
    updateCopyButtonUI();
  }

  function selectNone() {
    batchState.clearSelections();
    renderTabs();
    updateCountsUI();
    updateCopyButtonUI();
  }

  function invertSelection() {
    const newSelection = new Set();
    batchState.getFilteredTabs().forEach((tab) => {
      if (!batchState.hasSelection(tab.id)) {
        newSelection.add(tab.id);
      }
    });
    batchState.selectedTabs = newSelection;
    renderTabs();
    updateCountsUI();
    updateCopyButtonUI();
  }

  function handleMasterCheckboxClick() {
    const filteredCount = batchState.getFilteredTabs().length;
    const selectedCount = batchState.getSelectionCount();

    if (selectedCount === filteredCount) {
      selectNone();
    } else {
      selectAll();
    }
  }

  // ==================== UI Updates ====================

  function updateCountsUI() {
    updateCounts(
      elements.selectedCount,
      elements.totalCount,
      batchState.getSelectionCount(),
      batchState.getFilteredTabs().length,
    );
  }

  function updateMasterCheckboxUI() {
    updateMasterCheckbox(
      elements.masterCheckbox,
      batchState.getSelectionCount(),
      batchState.getFilteredTabs().length,
    );
  }

  function updateCopyButtonUI() {
    updateCopyButton(
      elements.copyBtn,
      elements.previewBtn,
      batchState.getSelectionCount() > 0,
    );
  }

  // ==================== Preview & Copy ====================

  async function handleShowPreview() {
    const selectedTabs = batchState.getSelectedTabs();
    const format = document.getElementById("silentCopyFormat").value;
    const currentSettings = batchState.getSettings();

    await showPreview(
      selectedTabs,
      format,
      currentSettings.urlCleaning,
      elements,
    );
  }

  function handleHidePreview() {
    hidePreview(elements);
  }

  async function handlePerformCopy() {
    const selectedTabs = batchState.getSelectedTabs();
    const format = document.getElementById("silentCopyFormat").value;
    const currentSettings = batchState.getSettings();

    await performCopy(selectedTabs, format, currentSettings.urlCleaning);
  }

  async function handleRefreshTabs() {
    await refreshTabsHandler(
      elements,
      getAllWindows,
      updateWindowSelector,
      getAllTabs,
      applyFilters,
      updateCopyButtonUI,
      () => batchState.clearSelections(),
      (tabs) => batchState.setAllTabs(tabs),
    );
  }

  // ==================== Settings Collapse ====================

  function initializeSettingsCollapse() {
    const settingsHeader = document.getElementById("settingsHeader");
    const settingsCard = document.querySelector(".settings-card");
    const collapseIcon = document.querySelector(".collapse-icon");

    let isCollapsed = true;
    updateCollapseState();

    function toggleCollapse() {
      isCollapsed = !isCollapsed;
      updateCollapseState();
    }

    function updateCollapseState() {
      const iconCollapsed = collapseIcon.querySelector(".icon-collapsed");
      const iconExpanded = collapseIcon.querySelector(".icon-expanded");

      if (isCollapsed) {
        settingsCard.classList.add("collapsed");
        iconCollapsed.style.display = "block";
        iconExpanded.style.display = "none";
      } else {
        settingsCard.classList.remove("collapsed");
        iconCollapsed.style.display = "none";
        iconExpanded.style.display = "block";
      }
    }

    settingsHeader.addEventListener("click", (e) => {
      if (e.target.closest(".more-settings-btn")) {
        return;
      }
      toggleCollapse();
    });
  }

  // ==================== Event Listeners ====================

  elements.refreshBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const svg = elements.refreshBtn.querySelector("svg");
    if (svg) {
      svg.classList.add("animate");
      svg.addEventListener(
        "animationend",
        () => {
          svg.classList.remove("animate");
        },
        { once: true },
      );
    }

    handleRefreshTabs();
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
    handleShowPreview();
  });
  elements.copyBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlePerformCopy();
  });

  // Preview modal events
  elements.previewModalClose.addEventListener("click", handleHidePreview);
  elements.previewModalOverlay.addEventListener("click", handleHidePreview);
  elements.previewCancelBtn.addEventListener("click", handleHidePreview);
  elements.previewCopyBtn.addEventListener("click", async () => {
    await handlePerformCopy();
    handleHidePreview();
  });

  // Filter change events
  document
    .getElementById("windowScopeSelect")
    .addEventListener("change", handleRefreshTabs);

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

  const silentCopyFormat = document.getElementById("silentCopyFormat");
  if (silentCopyFormat) {
    silentCopyFormat.addEventListener("change", saveBatchSettings);
  }

  // ESC key to close preview
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      elements.previewModal.classList.contains("show")
    ) {
      handleHidePreview();
    }
  });

  // ==================== Initialization ====================

  await initializeI18n({
    settingsManager,
    updateDOM: true,
  });

  loadVersion();
  setupTemplateChangeListener();

  const settings = await loadSettings();
  await loadCustomTemplates(settings.batchSilentCopyFormat);

  initializeUrlCleaningSwitch();
  initializeSettingsCollapse();
  await handleRefreshTabs();
});
