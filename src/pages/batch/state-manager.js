// State management module for batch page

class BatchStateManager {
  constructor() {
    this.allTabs = [];
    this.filteredTabs = [];
    this.selectedTabs = new Set();
    this.currentSettings = {};
    this.allWindows = [];
    this.currentWindowId = null;
  }

  // Tabs management
  setAllTabs(tabs) {
    this.allTabs = tabs;
  }

  getAllTabs() {
    return this.allTabs;
  }

  setFilteredTabs(tabs) {
    this.filteredTabs = tabs;
  }

  getFilteredTabs() {
    return this.filteredTabs;
  }

  // Selection management
  addSelection(tabId) {
    this.selectedTabs.add(tabId);
  }

  removeSelection(tabId) {
    this.selectedTabs.delete(tabId);
  }

  toggleSelection(tabId) {
    if (this.selectedTabs.has(tabId)) {
      this.selectedTabs.delete(tabId);
    } else {
      this.selectedTabs.add(tabId);
    }
  }

  hasSelection(tabId) {
    return this.selectedTabs.has(tabId);
  }

  clearSelections() {
    this.selectedTabs.clear();
  }

  getSelectedTabs() {
    return this.filteredTabs.filter((tab) => this.selectedTabs.has(tab.id));
  }

  getSelectionCount() {
    return this.selectedTabs.size;
  }

  selectAll() {
    this.filteredTabs.forEach((tab) => this.selectedTabs.add(tab.id));
  }

  // Settings management
  setSettings(settings) {
    this.currentSettings = settings;
  }

  getSettings() {
    return this.currentSettings;
  }

  updateSetting(key, value) {
    this.currentSettings[key] = value;
  }

  // Windows management
  setWindows(windows, currentId) {
    this.allWindows = windows;
    this.currentWindowId = currentId;
  }

  getWindows() {
    return this.allWindows;
  }

  getCurrentWindowId() {
    return this.currentWindowId;
  }

  getCurrentWindow() {
    return this.allWindows.find((w) => w.id === this.currentWindowId);
  }
}

// Create and export singleton instance
const batchState = new BatchStateManager();
export default batchState;
