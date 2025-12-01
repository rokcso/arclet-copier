// URL parameter classification and rules management

// Default parameter categories
export const PARAM_CATEGORIES = {
  // Tracking parameters - can be safely removed
  TRACKING: [
    // UTM series
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    // Social media tracking
    "fbclid",
    "igshid",
    "gclid",
    "msclkid",
    "dclid",
    "wbraid",
    "gbraid",
    // Analytics tools
    "ref",
    "referrer",
    "source",
    "campaign",
    "medium",
    // Other common tracking
    "spm",
    "from",
    "share_from",
    "tt_from",
    "tt_medium",
    "share_token",
  ],

  // Functional parameters - should be kept
  FUNCTIONAL: [
    "page",
    "p",
    "offset",
    "limit",
    "size",
    "per_page", // pagination
    "sort",
    "order",
    "orderby",
    "direction",
    "sort_by", // sorting
    "q",
    "query",
    "search",
    "keyword",
    "filter",
    "s", // search/filter
    "tab",
    "view",
    "mode",
    "type",
    "category",
    "section", // UI state
    "id",
    "uid",
    "token",
    "key",
    "code",
    "lang",
    "locale", // functional identifiers
  ],
};

// Storage key for custom parameter rules
export const CUSTOM_PARAM_RULES_KEY = "customParamRules";

// Default parameter rules configuration
export const DEFAULT_PARAM_RULES = {
  tracking: [...PARAM_CATEGORIES.TRACKING],
  functional: [...PARAM_CATEGORIES.FUNCTIONAL],
  version: "1.0",
};

/**
 * Initialize custom parameter rules
 * @returns {Promise<void>}
 */
export async function initializeParamRules() {
  try {
    const result = await chrome.storage.sync.get(CUSTOM_PARAM_RULES_KEY);

    if (!result[CUSTOM_PARAM_RULES_KEY]) {
      const initialRules = {
        ...DEFAULT_PARAM_RULES,
        lastModified: new Date().toISOString(),
      };

      await chrome.storage.sync.set({
        [CUSTOM_PARAM_RULES_KEY]: initialRules,
      });

      console.log("[ParamRules] Initialized with default rules");
    }
  } catch (error) {
    console.debug("[ParamRules] Failed to initialize:", error);
  }
}

/**
 * Get custom parameter rules
 * @returns {Promise<{tracking: string[], functional: string[]}>}
 */
export async function getCustomParamRules() {
  try {
    const result = await chrome.storage.sync.get(CUSTOM_PARAM_RULES_KEY);

    if (result[CUSTOM_PARAM_RULES_KEY]) {
      return {
        tracking: result[CUSTOM_PARAM_RULES_KEY].tracking || [],
        functional: result[CUSTOM_PARAM_RULES_KEY].functional || [],
      };
    }

    return {
      tracking: [...PARAM_CATEGORIES.TRACKING],
      functional: [...PARAM_CATEGORIES.FUNCTIONAL],
    };
  } catch (error) {
    console.debug("[ParamRules] Failed to get custom rules:", error);
    return {
      tracking: [...PARAM_CATEGORIES.TRACKING],
      functional: [...PARAM_CATEGORIES.FUNCTIONAL],
    };
  }
}

/**
 * Save custom parameter rules
 * @param {{tracking: string[], functional: string[]}} rules - Parameter rules
 * @returns {Promise<boolean>} Whether save succeeded
 */
export async function saveCustomParamRules(rules) {
  try {
    const saveData = {
      tracking: rules.tracking || [],
      functional: rules.functional || [],
      version: "1.0",
      lastModified: new Date().toISOString(),
    };

    await chrome.storage.sync.set({
      [CUSTOM_PARAM_RULES_KEY]: saveData,
    });

    console.log("[ParamRules] Saved custom rules:", saveData);
    return true;
  } catch (error) {
    console.debug("[ParamRules] Failed to save custom rules:", error);
    return false;
  }
}
