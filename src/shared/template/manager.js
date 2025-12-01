// Template management utilities

import { templateEngine } from "./engine.js";
import { processUrl } from "../url/url-processor.js";

/**
 * Get custom templates
 * @returns {Promise<Array>} Custom templates
 */
export async function getCustomTemplates() {
  try {
    const result = await chrome.storage.sync.get(["customTemplates"]);
    return result.customTemplates || [];
  } catch (error) {
    console.debug("Failed to load custom templates:", error);
    return [];
  }
}

/**
 * Save custom templates
 * @param {Array} templates - Templates array
 * @returns {Promise<boolean>} Whether save succeeded
 */
export async function saveCustomTemplates(templates) {
  try {
    await chrome.storage.sync.set({ customTemplates: templates });
    return true;
  } catch (error) {
    console.debug("Failed to save custom templates:", error);
    return false;
  }
}

/**
 * Get all templates
 * @returns {Promise<Array>} All templates
 */
export async function getAllTemplates() {
  const customTemplates = await getCustomTemplates();
  // Only return user-defined templates
  return customTemplates;
}

/**
 * Generate template ID
 * @returns {string} Template ID
 */
export function generateTemplateId() {
  return "custom_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Create template object
 * @param {string} name - Template name
 * @param {string} template - Template string
 * @param {string} icon - Template icon
 * @returns {object} Template object
 */
export function createTemplate(name, template, icon = "📝") {
  return {
    id: generateTemplateId(),
    name: name.trim(),
    template: template.trim(),
    icon: icon,
    isPreset: false,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    usageCount: 0,
    description: "",
  };
}

/**
 * Template change notifier
 */
export class TemplateChangeNotifier {
  static async notify(changeType, templateId = null) {
    try {
      // Send message to all extension pages
      await chrome.runtime.sendMessage({
        type: "TEMPLATE_CHANGED",
        changeType, // 'created', 'updated', 'deleted'
        templateId,
        timestamp: Date.now(),
      });
      console.log(`Template change notified: ${changeType}`, templateId);
    } catch (error) {
      // Ignore no receiver errors (normal case, not all pages are listening)
      if (!error.message?.includes("Could not establish connection")) {
        console.debug("Failed to notify template change:", error);
      }
    }
  }
}

/**
 * Generic template loading function - solves code duplication
 * @param {HTMLSelectElement} selectElement - Select element
 * @param {object} options - Options
 * @returns {Promise<void>}
 */
export async function loadTemplatesIntoSelect(selectElement, options = {}) {
  if (!selectElement) {
    console.debug("loadTemplatesIntoSelect: selectElement is null");
    return;
  }

  const { includeIcons = true, clearExisting = true, onError = null } = options;

  try {
    const customTemplates = await getAllTemplates();

    if (clearExisting) {
      // Clear previously added custom template options
      const existingCustomOptions = selectElement.querySelectorAll(
        "[data-custom-template]",
      );
      existingCustomOptions.forEach((option) => option.remove());
    }

    // Add option for each custom template
    customTemplates.forEach((template) => {
      const option = document.createElement("option");
      option.value = `custom:${template.id}`;
      option.textContent = includeIcons
        ? `${template.icon} ${template.name}`
        : template.name;
      option.setAttribute("data-custom-template", "true");
      option.setAttribute("data-template-id", template.id);
      selectElement.appendChild(option);
    });

    console.log(
      `Loaded ${customTemplates.length} custom templates into select`,
    );
  } catch (error) {
    console.debug("Failed to load custom templates:", error);
    if (onError) {
      onError(error);
    }
  }
}

/**
 * Validate and fix selector state - unified template validation and fallback
 * @param {HTMLSelectElement} selectElement - Select element
 * @param {string} currentValue - Current value
 * @param {string} settingKey - Setting key
 * @param {Function} saveFunction - Save function
 * @returns {Promise<boolean>} Whether validation succeeded
 */
export async function validateAndFixSelector(
  selectElement,
  currentValue,
  settingKey,
  saveFunction,
) {
  if (!selectElement) {
    console.debug("validateAndFixSelector: selectElement is null");
    return false;
  }

  // Wait for DOM update to complete
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    // Check if current value exists in options
    const optionExists = Array.from(selectElement.options).some(
      (option) => option.value === currentValue,
    );

    if (optionExists) {
      // If option exists, set value
      selectElement.value = currentValue;
      console.log(`Template selector validated: ${currentValue}`);
      return true;
    }

    // Option doesn't exist, need to fallback to default (silent handling, already have fallback)
    console.log(
      `[Template] Value "${currentValue}" not available, using default format`,
    );

    // Find "url" option
    const urlOption = Array.from(selectElement.options).find(
      (option) => option.value === "url",
    );

    if (urlOption) {
      // Set to url
      selectElement.value = "url";

      // Trigger change event to notify UI
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));

      // Save fallback value to settings
      if (saveFunction && settingKey) {
        try {
          await saveFunction({ [settingKey]: "url" });
          console.log(`[Template] Fallback saved: ${settingKey} = url`);
        } catch (saveError) {
          console.log("[Template] Failed to save fallback setting:", saveError);
        }
      }

      return false; // Return false to indicate fallback
    }

    // If even url option doesn't exist, set to first option
    if (selectElement.options.length > 0) {
      selectElement.selectedIndex = 0;
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));

      if (saveFunction && settingKey) {
        try {
          await saveFunction({ [settingKey]: selectElement.value });
          console.log(
            `[Template] Fallback to first option: ${selectElement.value}`,
          );
        } catch (saveError) {
          console.log("[Template] Failed to save fallback setting:", saveError);
        }
      }

      return false;
    }

    // Extreme case: no options available
    console.log("[Template] No options available in selector");
    return false;
  } catch (error) {
    console.debug("Error in validateAndFixSelector:", error);
    return false;
  }
}

/**
 * Standardized template finding with error handling
 * @param {string} templateId - Template ID
 * @returns {Promise<object|null>} Template object or null
 */
export async function findTemplateById(templateId) {
  try {
    if (!templateId) {
      console.debug("Template ID is required");
      return null;
    }

    const customTemplates = await getAllTemplates();
    const template = customTemplates.find((t) => t.id === templateId);

    if (!template) {
      console.debug(`Template not found: ${templateId}`);
      return null;
    }

    return template;
  } catch (error) {
    console.debug("Failed to find template:", error);
    return null;
  }
}

/**
 * Standardized template processing with error handling
 * @param {string} templateId - Template ID
 * @param {object} context - Context object
 * @param {string} fallbackContent - Fallback content
 * @returns {Promise<object>} Processing result
 */
export async function processTemplateWithFallback(
  templateId,
  context,
  fallbackContent = null,
) {
  try {
    const template = await findTemplateById(templateId);

    // If template doesn't exist (deleted), use fallback
    if (!template) {
      console.debug(`Template ${templateId} not found, using fallback`);
      const fallback =
        fallbackContent ||
        (context.url ? await processUrl(context.url, context.urlCleaning) : "");

      return {
        success: false,
        content: fallback,
        error: `Template not found: ${templateId}`,
        templateName: null,
      };
    }

    // If template contains shortUrl field, ensure context has shortUrl
    if (template.template.includes("{{shortUrl}}") && !context.shortUrl) {
      console.debug(
        "Template requires shortUrl but context does not provide it",
      );
      // Can choose to generate shortUrl or use original URL as fallback
      context.shortUrl = context.url
        ? await processUrl(context.url, context.urlCleaning)
        : "";
    }

    const result = await templateEngine.processTemplate(
      template.template,
      context,
    );

    return {
      success: true,
      content: result,
      templateName: template.name,
    };
  } catch (error) {
    console.debug("Template processing failed:", error);

    // Use fallback content
    const fallback =
      fallbackContent ||
      (context.url ? await processUrl(context.url, context.urlCleaning) : "");

    return {
      success: false,
      content: fallback,
      error: error.message,
      templateName: null,
    };
  }
}
