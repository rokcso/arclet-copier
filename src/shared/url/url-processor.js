// URL processing logic

import { getCustomParamRules } from "./param-rules.js";

/**
 * Determine if a parameter should be kept
 * @param {string} paramName - Parameter name
 * @param {string} cleaningMode - Cleaning mode ('off' | 'smart' | 'aggressive')
 * @returns {Promise<boolean>} Whether to keep this parameter
 */
async function shouldKeepParameter(paramName, cleaningMode) {
  const lowerParam = paramName.toLowerCase();

  // Off mode: keep all parameters
  if (cleaningMode === "off") {
    return true;
  }

  // Aggressive mode: remove all parameters
  if (cleaningMode === "aggressive") {
    return false;
  }

  // Smart mode: determine based on user-configured parameter lists
  if (cleaningMode === "smart") {
    try {
      const customRules = await getCustomParamRules();

      // Keep functional parameters
      if (customRules.functional.includes(lowerParam)) {
        return true;
      }

      // Remove tracking parameters
      if (customRules.tracking.includes(lowerParam)) {
        return false;
      }

      // Keep unknown parameters (safe strategy)
      return true;
    } catch (error) {
      console.debug("[ParamRules] Error in shouldKeepParameter:", error);
      // Safe strategy on error: keep parameter
      return true;
    }
  }

  // Default: keep
  return true;
}

/**
 * Smart URL parameter processing
 * @param {string} url - URL to process
 * @param {string} cleaningMode - Cleaning mode ('off' | 'smart' | 'aggressive')
 * @returns {Promise<string>} Processed URL
 */
export async function processUrl(url, cleaningMode = "smart") {
  if (!url || cleaningMode === "off") {
    return url;
  }

  try {
    const urlObj = new URL(url);

    // Aggressive mode: remove all query parameters
    if (cleaningMode === "aggressive") {
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    }

    // Smart mode: remove tracking parameters based on custom rules
    if (cleaningMode === "smart") {
      const params = new URLSearchParams(urlObj.search);
      const newParams = new URLSearchParams();

      for (const [key, value] of params.entries()) {
        const shouldKeep = await shouldKeepParameter(key, cleaningMode);
        if (shouldKeep) {
          newParams.append(key, value);
        }
      }

      urlObj.search = newParams.toString();
      return urlObj.toString();
    }

    return url;
  } catch (error) {
    console.debug("[ParamRules] Error in processUrl:", error);
    return url;
  }
}
