/**
 * Settings Panel Module
 * Handles general settings like theme, language, short URL service, and notifications
 */

import settingsManager from '../../../shared/settings-manager.js';
import toast from '../../../shared/toast.js';
import { initializeThreeWaySwitch } from '../../../shared/three-way-switch.js';
import { getLocalMessage, initializeI18n } from '../../../shared/ui/i18n.js';

// Module state
let elements = {};

/**
 * Detect browser type
 * @returns {string} Browser identifier ('edge' or 'chrome')
 */
function detectBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();

  // Edge browser detection (UA includes "edg/" or "edge/")
  if (userAgent.includes('edg/') || userAgent.includes('edge/')) {
    return 'edge';
  }

  // Chrome browser detection (UA includes "chrome" but not "edg")
  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    return 'chrome';
  }

  // Default fallback to chrome
  return 'chrome';
}

/**
 * Get browser-specific store URL
 * @returns {string} Store URL for the current browser
 */
function getStoreUrl() {
  const browser = detectBrowser();

  const storeUrls = {
    edge: 'https://microsoftedge.microsoft.com/addons/detail/flcemgbijffbmbgcmabmmjhankbegdgm',
    chrome: 'https://chromewebstore.google.com/detail/mkflehheaokdfopijachhfdbofkppdil',
  };

  // Return chrome store URL as default fallback
  return storeUrls[browser] || storeUrls.chrome;
}

/**
 * Load version from manifest
 */
function loadVersion() {
  const manifest = chrome.runtime.getManifest();
  if (manifest && manifest.version) {
    const version = `v${manifest.version}`;
    if (elements.version) {
      elements.version.textContent = version;
    }
    if (elements.aboutVersion) {
      elements.aboutVersion.textContent = version;
    }
  }
}

/**
 * Create special handler for browser-specific i18n messages
 * @returns {Function} Special handler function
 */
function createI18nSpecialHandler() {
  return (element, key, message) => {
    // Special handling for ratingDescription - use browser-specific message
    if (key === 'ratingDescription') {
      const browser = detectBrowser();
      const browserSpecificKey = browser === 'edge' ? 'ratingDescriptionEdge' : 'ratingDescriptionChrome';
      return getLocalMessage(browserSpecificKey);
    }
    return message;
  };
}

/**
 * Wrapper for initializeI18n with options page specific logic
 * @param {string} locale - Optional locale to use
 * @returns {Promise<void>}
 */
export async function initializeOptionsI18n(locale) {
  await initializeI18n({
    locale,
    updateDOM: true,
    settingsManager,
    specialHandler: createI18nSpecialHandler(),
  });

  // Update page title after i18n is initialized
  document.title = getLocalMessage('optionsTitle') || 'Arclet Copier - Settings';
}

/**
 * Apply theme to the page
 * @param {string} theme - Theme value ('system', 'light', 'dark')
 */
function applyTheme(theme) {
  const htmlElement = document.documentElement;

  if (theme === 'system') {
    htmlElement.removeAttribute('data-theme');
  } else {
    htmlElement.setAttribute('data-theme', theme);
  }
}

/**
 * Apply theme color to the page
 * @param {string} color - Color value
 */
function applyThemeColor(color) {
  const htmlElement = document.documentElement;
  htmlElement.setAttribute('data-color', color);
}

/**
 * Initialize color picker
 */
function initializeColorPicker() {
  if (!elements.colorPicker) {
    return;
  }

  const colorOptions = elements.colorPicker.querySelectorAll('.color-option');

  colorOptions.forEach((option) => {
    option.addEventListener('click', async () => {
      const selectedColor = option.getAttribute('data-color');

      // Update UI state
      colorOptions.forEach((opt) => opt.classList.remove('active'));
      option.classList.add('active');

      // Apply new theme color
      applyThemeColor(selectedColor);

      // Save settings
      await saveSettings();

      // Show notification
      toast.success(getLocalMessage('themeColorChanged') || 'Theme color changed successfully!');
    });
  });
}

/**
 * Initialize appearance switch
 * @returns {Object} Switch controller
 */
function initializeAppearanceSwitch() {
  const appearanceOptions = [
    { value: 'system', key: null },
    { value: 'light', key: null },
    { value: 'dark', key: null },
  ];

  return initializeThreeWaySwitch(elements.appearanceSwitch, appearanceOptions, async (value) => {
    applyTheme(value);
    await saveSettings();
    toast.success(getLocalMessage('appearanceChanged') || 'Appearance changed successfully!');
  });
}

/**
 * Initialize notification switch
 * @returns {Object} Switch controller
 */
function initializeNotificationSwitch() {
  const notificationOptions = [
    { value: 'off', key: null },
    { value: 'chrome', key: null },
    { value: 'page', key: null },
  ];

  return initializeThreeWaySwitch(elements.notificationSwitch, notificationOptions, async () => {
    await saveSettings();
    toast.success(getLocalMessage('notificationTypeChanged') || 'Notification type changed successfully!');
  });
}

/**
 * Initialize theme
 * @returns {Promise<void>}
 */
async function initializeTheme() {
  const savedTheme = await settingsManager.getSetting('appearance');

  // Set switch initial value
  if (elements.appearanceSwitch) {
    elements.appearanceSwitch.setAttribute('data-value', savedTheme);
  }

  applyTheme(savedTheme);

  // Listen for system theme changes
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const currentTheme = elements.appearanceSwitch.getAttribute('data-value');
      if (currentTheme === 'system') {
        applyTheme('system');
      }
    });
  }
}

/**
 * Load settings from storage
 * @returns {Promise<void>}
 */
async function loadSettings() {
  const settings = await settingsManager.getSettings([
    'shortUrlService',
    'appearance',
    'language',
    'themeColor',
    'notificationType',
  ]);

  // Load short URL service setting
  if (elements.shortUrlServiceSelect) {
    elements.shortUrlServiceSelect.value = settings.shortUrlService;
  }

  // Load appearance setting
  const savedAppearance = settings.appearance;
  if (elements.appearanceSwitch) {
    elements.appearanceSwitch.setAttribute('data-value', savedAppearance);
  }

  // Load language setting
  if (elements.languageSelect) {
    elements.languageSelect.value = settings.language;
  }

  // Load theme color setting
  applyThemeColor(settings.themeColor);

  // Update color picker UI
  if (elements.colorPicker) {
    const colorOptions = elements.colorPicker.querySelectorAll('.color-option');
    colorOptions.forEach((option) => {
      option.classList.toggle('active', option.getAttribute('data-color') === settings.themeColor);
    });
  }

  // Load notification type setting
  if (elements.notificationSwitch) {
    elements.notificationSwitch.setAttribute('data-value', settings.notificationType);
  }
}

/**
 * Save settings to storage
 * @returns {Promise<void>}
 */
export async function saveSettings() {
  const appearanceSwitch = elements.appearanceSwitch;

  // Get currently selected theme color
  const selectedColorOption = elements.colorPicker?.querySelector('.color-option.active');
  const currentThemeColor = selectedColorOption?.getAttribute('data-color') || 'green';

  await settingsManager.updateSettings({
    shortUrlService: elements.shortUrlServiceSelect.value,
    appearance: appearanceSwitch.getAttribute('data-value'),
    language: elements.languageSelect.value,
    themeColor: currentThemeColor,
    notificationType: elements.notificationSwitch.getAttribute('data-value'),
  });
}

/**
 * Bind event listeners for settings panel
 */
function bindEventListeners() {
  // Short URL service select
  if (elements.shortUrlServiceSelect) {
    elements.shortUrlServiceSelect.addEventListener('change', async () => {
      await saveSettings();
      toast.success(getLocalMessage('shortUrlServiceChanged') || 'Short URL service changed successfully!');
    });
  }

  // Language select
  if (elements.languageSelect) {
    elements.languageSelect.addEventListener('change', async () => {
      const newLanguage = elements.languageSelect.value;

      await saveSettings();
      await initializeOptionsI18n(newLanguage);

      toast.success(getLocalMessage('languageChangeNotification') || 'Language changed successfully!');
    });
  }

  // Rating button - use browser detection to jump to corresponding store
  if (elements.ratingBtn) {
    elements.ratingBtn.addEventListener('click', () => {
      const storeUrl = getStoreUrl();
      const browser = detectBrowser();

      console.log(`[Support] Detected browser: ${browser}`);
      console.log(`[Support] Redirecting to: ${storeUrl}`);

      chrome.tabs.create({ url: storeUrl });
    });
  }

  // Ko-fi button
  if (elements.kofiBtn) {
    elements.kofiBtn.addEventListener('click', () => {
      console.log('[Support] Opening Ko-fi page');
      chrome.tabs.create({ url: 'https://ko-fi.com/rokcso' });
    });
  }

  // Feedback button
  if (elements.feedbackBtn) {
    elements.feedbackBtn.addEventListener('click', () => {
      // Use localized email template from i18n
      const subject = encodeURIComponent(getLocalMessage('feedbackEmailSubject'));
      const body = encodeURIComponent(getLocalMessage('feedbackEmailBody'));
      const mailtoUrl = `mailto:hi@rokcso.com?subject=${subject}&body=${body}`;
      chrome.tabs.create({ url: mailtoUrl });
    });
  }
}

/**
 * Initialize settings panel module
 * @param {Object} elementsMap - Map of DOM elements
 * @returns {Promise<void>}
 */
export async function initializeSettingsPanel(elementsMap) {
  elements = elementsMap;

  // Load version
  loadVersion();

  // Load settings first
  await loadSettings();

  // Initialize theme before i18n
  await initializeTheme();

  // Initialize i18n
  await initializeOptionsI18n();

  // Initialize UI components
  initializeAppearanceSwitch();
  initializeNotificationSwitch();
  initializeColorPicker();

  // Bind event listeners
  bindEventListeners();
}
