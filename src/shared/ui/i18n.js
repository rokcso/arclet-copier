/**
 * Internationalization (i18n) utilities for Arclet Copier
 * Provides unified locale loading, message retrieval, and DOM initialization
 */

// Module state
let currentLocale = "zh_CN";
let localeMessages = {};

/**
 * Load locale messages from Chrome extension _locales directory
 * @param {string} locale - Locale code (e.g., 'zh_CN', 'en')
 * @returns {Promise<Object>} Loaded locale messages
 */
export async function loadLocaleMessages(locale) {
  try {
    const response = await fetch(
      chrome.runtime.getURL(`_locales/${locale}/messages.json`)
    );
    const messages = await response.json();
    return messages;
  } catch (error) {
    console.debug(`[i18n] Failed to load locale messages for ${locale}:`, error);
    return {};
  }
}

/**
 * Get localized message with optional substitutions
 * Supports both indexed ($1$, $2$) and named placeholders
 * @param {string} key - Message key
 * @param {Array} substitutions - Array of substitution values
 * @returns {string} Localized message or key if not found
 */
export function getLocalMessage(key, substitutions = []) {
  if (localeMessages[key]?.message) {
    let message = localeMessages[key].message;

    // Handle indexed placeholders like $1$, $2$
    if (substitutions.length > 0) {
      substitutions.forEach((substitution, index) => {
        const placeholder = `$${index + 1}$`;
        message = message.replace(placeholder, substitution);
      });
    }

    // Handle named placeholders from message definition
    if (localeMessages[key].placeholders) {
      Object.keys(localeMessages[key].placeholders).forEach((placeholderName) => {
        const placeholderValue = localeMessages[key].placeholders[placeholderName].content;
        const regex = new RegExp(`\\$${placeholderName}\\$`, 'gi');
        message = message.replace(regex, placeholderValue);
      });
    }

    return message;
  }

  // Fallback to Chrome i18n API
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/**
 * Initialize i18n for the current page
 * @param {Object} options - Configuration options
 * @param {string} [options.locale] - Locale to use (if not provided, uses current or loads from settings)
 * @param {boolean} [options.updateDOM=true] - Whether to update DOM elements with data-i18n attributes
 * @param {Function} [options.settingsManager] - Settings manager instance to load locale from
 * @param {Function} [options.specialHandler] - Special handler for specific keys (receives element, key, message)
 * @returns {Promise<string>} Current locale after initialization
 */
export async function initializeI18n(options = {}) {
  const {
    locale,
    updateDOM = true,
    settingsManager,
    specialHandler,
  } = options;

  // Determine locale to use
  if (locale) {
    currentLocale = locale;
  } else if (settingsManager) {
    try {
      const settings = await settingsManager.getAllSettings();
      currentLocale = settings.language || "zh_CN";
    } catch (error) {
      console.debug("[i18n] Failed to load language from settings:", error);
      currentLocale = "zh_CN";
    }
  }

  // Load locale messages
  localeMessages = await loadLocaleMessages(currentLocale);

  // Update DOM if requested
  if (updateDOM && typeof document !== 'undefined') {
    updateDOMElements(specialHandler);
  }

  return currentLocale;
}

/**
 * Update DOM elements with i18n attributes
 * @param {Function} [specialHandler] - Optional handler for special cases
 * @private
 */
function updateDOMElements(specialHandler) {
  // Handle data-i18n attributes
  const i18nElements = document.querySelectorAll("[data-i18n]");
  i18nElements.forEach((element) => {
    const key = element.getAttribute("data-i18n");
    let message = getLocalMessage(key);

    // Allow special handling for specific keys
    if (specialHandler) {
      const specialResult = specialHandler(element, key, message);
      if (specialResult !== undefined) {
        message = specialResult;
      }
    }

    if (message && message !== key) {
      if (element.tagName === "INPUT" && element.type === "text") {
        element.placeholder = message;
      } else {
        element.textContent = message;
      }
    }
  });

  // Handle data-i18n-placeholder attributes
  const i18nPlaceholderElements = document.querySelectorAll("[data-i18n-placeholder]");
  i18nPlaceholderElements.forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    const message = getLocalMessage(key);
    if (message && message !== key) {
      element.placeholder = message;
    }
  });
}

/**
 * Update locale and reload messages
 * @param {string} newLocale - New locale code
 * @returns {Promise<Object>} New locale messages
 */
export async function updateLocale(newLocale) {
  if (newLocale && newLocale !== currentLocale) {
    currentLocale = newLocale;
    localeMessages = await loadLocaleMessages(currentLocale);
    return localeMessages;
  }
  return localeMessages;
}

/**
 * Get current locale
 * @returns {string} Current locale code
 */
export function getCurrentLocale() {
  return currentLocale;
}

/**
 * Get all loaded locale messages
 * @returns {Object} Locale messages object
 */
export function getLocaleMessages() {
  return localeMessages;
}

/**
 * Set up listener for language changes in storage
 * @param {Function} callback - Callback to execute when language changes
 * @returns {Function} Cleanup function to remove listener
 */
export function setupLanguageChangeListener(callback) {
  const listener = (changes, areaName) => {
    if (areaName === "sync" && changes.language) {
      const newLocale = changes.language.newValue;
      if (newLocale && newLocale !== currentLocale) {
        updateLocale(newLocale).then(() => {
          if (callback) {
            callback(newLocale);
          }
        });
      }
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return cleanup function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
