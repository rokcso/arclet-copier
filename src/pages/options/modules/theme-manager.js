// Theme management module for options page

import settingsManager from "../../../shared/settings-manager.js";
import toast from "../../../shared/toast.js";
import { initializeThreeWaySwitch } from "../../../shared/three-way-switch.js";
import { getLocalMessage } from "../../../shared/ui/i18n.js";

/**
 * Apply theme to document
 * @param {string} theme - Theme value ('system', 'light', 'dark')
 */
export function applyTheme(theme) {
  const htmlElement = document.documentElement;

  if (theme === "system") {
    htmlElement.removeAttribute("data-theme");
  } else {
    htmlElement.setAttribute("data-theme", theme);
  }
}

/**
 * Apply theme color
 * @param {string} color - Color value
 */
export function applyThemeColor(color) {
  const htmlElement = document.documentElement;
  htmlElement.setAttribute("data-color", color);
}

/**
 * Initialize color picker
 * @param {HTMLElement} colorPicker - Color picker container element
 * @param {Function} onSave - Callback to save settings
 */
export function initializeColorPicker(colorPicker, onSave) {
  if (!colorPicker) {
    return;
  }

  const colorOptions = colorPicker.querySelectorAll(".color-option");

  colorOptions.forEach((option) => {
    option.addEventListener("click", async () => {
      const selectedColor = option.getAttribute("data-color");

      // Update UI state
      colorOptions.forEach((opt) => opt.classList.remove("active"));
      option.classList.add("active");

      // Apply new theme color
      applyThemeColor(selectedColor);

      // Save settings
      await onSave();

      // Show notification
      toast.success(
        getLocalMessage("themeColorChanged") ||
          "Theme color changed successfully!",
      );
    });
  });
}

/**
 * Initialize appearance switch
 * @param {HTMLElement} appearanceSwitch - Appearance switch element
 * @param {Function} onSave - Callback to save settings
 * @returns {Object} Switch controller
 */
export function initializeAppearanceSwitch(appearanceSwitch, onSave) {
  const appearanceOptions = [
    { value: "system", key: null },
    { value: "light", key: null },
    { value: "dark", key: null },
  ];

  return initializeThreeWaySwitch(
    appearanceSwitch,
    appearanceOptions,
    async (value) => {
      applyTheme(value);
      await onSave();
      toast.success(
        getLocalMessage("appearanceChanged") ||
          "Appearance changed successfully!",
      );
    },
  );
}

/**
 * Initialize notification switch
 * @param {HTMLElement} notificationSwitch - Notification switch element
 * @param {Function} onSave - Callback to save settings
 * @returns {Object} Switch controller
 */
export function initializeNotificationSwitch(notificationSwitch, onSave) {
  const notificationOptions = [
    { value: "off", key: null },
    { value: "chrome", key: null },
    { value: "page", key: null },
  ];

  return initializeThreeWaySwitch(
    notificationSwitch,
    notificationOptions,
    async () => {
      await onSave();
      toast.success(
        getLocalMessage("notificationTypeChanged") ||
          "Notification type changed successfully!",
      );
    },
  );
}

/**
 * Initialize theme system
 * @param {HTMLElement} appearanceSwitch - Appearance switch element
 */
export async function initializeTheme(appearanceSwitch) {
  const savedTheme = await settingsManager.getSetting("appearance");

  // Set switch initial value
  if (appearanceSwitch) {
    appearanceSwitch.setAttribute("data-value", savedTheme);
  }

  applyTheme(savedTheme);

  // Listen for system theme changes
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", () => {
      const currentTheme = appearanceSwitch.getAttribute("data-value");
      if (currentTheme === "system") {
        applyTheme("system");
      }
    });
  }
}

/**
 * Load theme settings
 * @param {Object} elements - DOM elements object
 */
export async function loadThemeSettings(elements) {
  const settings = await settingsManager.getSettings([
    "appearance",
    "themeColor",
    "notificationType",
  ]);

  // Load appearance setting
  const savedAppearance = settings.appearance;
  if (elements.appearanceSwitch) {
    elements.appearanceSwitch.setAttribute("data-value", savedAppearance);
  }

  // Load theme color setting
  applyThemeColor(settings.themeColor);

  // Update color picker UI
  if (elements.colorPicker) {
    const colorOptions = elements.colorPicker.querySelectorAll(".color-option");
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

/**
 * Get current theme settings
 * @param {Object} elements - DOM elements object
 * @returns {Object} Current theme settings
 */
export function getCurrentThemeSettings(elements) {
  const appearanceSwitch = elements.appearanceSwitch;

  // Get currently selected theme color
  const selectedColorOption = elements.colorPicker?.querySelector(
    ".color-option.active",
  );
  const currentThemeColor =
    selectedColorOption?.getAttribute("data-color") || "green";

  return {
    appearance: appearanceSwitch.getAttribute("data-value"),
    themeColor: currentThemeColor,
    notificationType: elements.notificationSwitch.getAttribute("data-value"),
  };
}
