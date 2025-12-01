// Shared constants and utilities for Arclet Copier
// This file serves as an index to re-export all modularized utilities

// URL module exports
export {
  // Parameter rules
  PARAM_CATEGORIES,
  CUSTOM_PARAM_RULES_KEY,
  DEFAULT_PARAM_RULES,
  initializeParamRules,
  getCustomParamRules,
  saveCustomParamRules,
} from "./url/param-rules.js";

export {
  // URL processing
  processUrl,
} from "./url/url-processor.js";

export {
  // URL validation
  isRestrictedPage,
  isValidWebUrl,
} from "./url/validation.js";

// Short URL module exports
export {
  // Throttling
  ShortUrlThrottle,
  globalShortUrlThrottle,
} from "./short-url/throttle.js";

export {
  // Services
  SHORT_URL_SERVICES,
  createShortUrlDirect,
} from "./short-url/services.js";

export {
  // Main API
  createShortUrl,
} from "./short-url/index.js";

export {
  // Cache helpers
  getCachedShortUrl,
  setCachedShortUrl,
  getOrGenerateShortUrl,
} from "./short-url/cache-helper.js";

// Template module exports
export {
  // Template fields
  TEMPLATE_FIELDS,
} from "./template/fields.js";

export {
  // Template engine
  TemplateEngine,
  templateEngine,
} from "./template/engine.js";

export {
  // Template management
  getCustomTemplates,
  saveCustomTemplates,
  getAllTemplates,
  generateTemplateId,
  createTemplate,
  TemplateChangeNotifier,
  loadTemplatesIntoSelect,
  validateAndFixSelector,
  findTemplateById,
  processTemplateWithFallback,
} from "./template/manager.js";

// i18n helper function
export function getMessage(key, substitutions = []) {
  return chrome.i18n.getMessage(key, substitutions);
}
