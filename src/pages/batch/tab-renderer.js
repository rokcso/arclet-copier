// Tab rendering and UI update functions for batch page

import { processUrl } from "../../shared/constants.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { detectDuplicates } from "./tab-filters.js";

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a tab element for display
 */
export function createTabElement(
  tab,
  isDuplicate = false,
  processedUrl = null,
  isSelected = false,
  onTabClick,
) {
  const div = document.createElement("div");
  div.className = "tab-item";
  div.dataset.tabId = tab.id;

  if (isSelected) {
    div.classList.add("selected");
  }

  if (isDuplicate) {
    div.classList.add("duplicate");
  }

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

  // Add favicon error handling
  const favicon = div.querySelector(".tab-favicon");
  favicon.addEventListener("error", function () {
    this.src = chrome.runtime.getURL("assets/icons/icon16.png");
  });

  // Event listeners
  div.addEventListener("click", (e) => {
    if (e.target.classList.contains("watermark-text")) {
      return;
    }
    if (onTabClick) {
      onTabClick(tab.id);
    }
  });

  return div;
}

/**
 * Render tabs list to container
 */
export async function renderTabsList(
  container,
  filteredTabs,
  selectedTabs,
  cleaningMode,
  removeDuplicatesEnabled,
  onTabClick,
) {
  // Find or create tabs list container
  let listContainer = container.querySelector(".tabs-list");
  if (!listContainer) {
    listContainer = document.createElement("div");
    listContainer.className = "tabs-list";
    container.appendChild(listContainer);
  }

  // Clear existing content
  listContainer.innerHTML = "";

  if (filteredTabs.length === 0) {
    listContainer.innerHTML = `
      <div class="loading">
        <span>${getLocalMessage("noTabsFound") || "没有找到符合条件的标签页"}</span>
      </div>
    `;
    return;
  }

  // Detect duplicates (only if not removing duplicates)
  const duplicateUrls = !removeDuplicatesEnabled
    ? await detectDuplicates(filteredTabs, cleaningMode)
    : new Set();

  // Pre-process all URLs
  const processedUrls = await Promise.all(
    filteredTabs.map((tab) => processUrl(tab.url, cleaningMode)),
  );

  // Render each tab
  filteredTabs.forEach((tab, index) => {
    const processedUrl = processedUrls[index];
    const isDuplicate = duplicateUrls.has(processedUrl);
    const isSelected = selectedTabs.has(tab.id);

    const tabElement = createTabElement(
      tab,
      isDuplicate,
      processedUrl,
      isSelected,
      onTabClick,
    );
    listContainer.appendChild(tabElement);
  });
}

/**
 * Update single tab element selection state
 */
export function updateTabElement(tabId, isSelected) {
  const element = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (!element) {
    return;
  }
  element.classList.toggle("selected", isSelected);
}

/**
 * Update count displays
 */
export function updateCounts(selectedCountEl, totalCountEl, selectedCount, totalCount) {
  if (selectedCountEl) {
    selectedCountEl.textContent = selectedCount;
  }
  if (totalCountEl) {
    totalCountEl.textContent = totalCount;
  }
}

/**
 * Update master checkbox state
 */
export function updateMasterCheckbox(checkboxEl, selectedCount, totalCount) {
  if (!checkboxEl) {
    return;
  }

  if (totalCount === 0) {
    checkboxEl.checked = false;
    checkboxEl.indeterminate = false;
    return;
  }

  if (selectedCount === 0) {
    checkboxEl.checked = false;
    checkboxEl.indeterminate = false;
  } else if (selectedCount === totalCount) {
    checkboxEl.checked = true;
    checkboxEl.indeterminate = false;
  } else {
    checkboxEl.checked = false;
    checkboxEl.indeterminate = true;
  }
}

/**
 * Update copy button state
 */
export function updateCopyButton(copyBtn, previewBtn, hasSelection) {
  if (copyBtn) {
    copyBtn.disabled = !hasSelection;
  }
  if (previewBtn) {
    previewBtn.disabled = !hasSelection;
  }
}
