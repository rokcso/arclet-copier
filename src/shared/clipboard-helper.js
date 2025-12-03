/**
 * Clipboard Helper Module
 * Unified clipboard operations with automatic fallback strategies
 */

import toast from './toast.js';
import notificationHelper from './notification-helper.js';
import { getLocalMessage } from './ui/i18n.js';

// Error types
export const ERROR_TYPES = {
  VALIDATION: 'validation',
  CLIPBOARD: 'clipboard',
  TIMEOUT: 'timeout',
  SYSTEM: 'system',
  PERMISSION: 'permission',
};

// Custom error class
class ClipboardError extends Error {
  constructor(message, type, originalError = null) {
    super(message);
    this.name = 'ClipboardError';
    this.type = type;
    this.originalError = originalError;
  }
}

/**
 * Create temporary textarea element for execCommand
 * @param {string} text - Text to copy
 * @returns {HTMLTextAreaElement} Temporary textarea element
 */
function createTempTextArea(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    opacity: 0;
  `;
  textArea.setAttribute('readonly', '');
  textArea.setAttribute('aria-hidden', 'true');
  return textArea;
}

/**
 * Copy using modern Clipboard API
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
async function copyWithClipboardAPI(text) {
  if (!navigator.clipboard?.writeText) {
    throw new ClipboardError('Clipboard API not available', ERROR_TYPES.SYSTEM);
  }
  await navigator.clipboard.writeText(text);
}

/**
 * Copy using execCommand (fallback method)
 * @param {string} text - Text to copy
 * @returns {void}
 */
function copyWithExecCommand(text) {
  if (typeof document === 'undefined') {
    throw new ClipboardError('Document not available', ERROR_TYPES.SYSTEM);
  }

  const textArea = createTempTextArea(text);
  document.body.appendChild(textArea);

  try {
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const success = document.execCommand('copy');
    if (!success) {
      throw new ClipboardError('execCommand copy failed', ERROR_TYPES.CLIPBOARD);
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Note: Offscreen Document copy is not implemented in clipboard-helper.
 * Background scripts should use their own copyToClipboard implementation
 * which properly manages the offscreen document lifecycle.
 */

/**
 * Detect current environment
 * @returns {string} Environment type ('page' | 'unknown')
 */
function detectEnvironment() {
  if (typeof document !== 'undefined') {
    return 'page';
  } else {
    return 'unknown';
  }
}

/**
 * Copy with automatic fallback
 * Note: This helper is designed for page environments (popup, options, batch).
 * Background scripts should use their own copyToClipboard with offscreen document.
 * @param {string} text - Text to copy
 * @param {string} source - Source identifier
 * @returns {Promise<{success: boolean, method: string}>}
 */
async function copyWithFallback(text, source) {
  const env = detectEnvironment();
  const startTime = Date.now();

  // Page environment: try Clipboard API first, then execCommand
  if (env === 'page') {
    // Try modern Clipboard API first
    try {
      await copyWithClipboardAPI(text);
      console.debug(`[ClipboardHelper] Clipboard API copy successful (source: ${source})`);
      return { success: true, method: 'clipboard-api', duration: Date.now() - startTime };
    } catch (error) {
      console.debug('[ClipboardHelper] Clipboard API failed, trying execCommand:', error);
    }

    // Fallback to execCommand
    try {
      copyWithExecCommand(text);
      console.debug(`[ClipboardHelper] execCommand copy successful (source: ${source})`);
      return { success: true, method: 'execCommand', duration: Date.now() - startTime };
    } catch (error) {
      console.debug('[ClipboardHelper] execCommand failed:', error);
      throw new ClipboardError('All copy methods failed', ERROR_TYPES.CLIPBOARD, error);
    }
  }

  throw new ClipboardError(
    'clipboard-helper is designed for page environments only. Background scripts should use their own copyToClipboard implementation.',
    ERROR_TYPES.SYSTEM,
  );
}

/**
 * Copy Operation Manager (prevents duplicate operations)
 */
class CopyOperationManager {
  constructor() {
    this.operations = new Map();
  }

  /**
   * Execute operation with debounce
   * @param {string} operationId - Unique operation identifier
   * @param {Function} fn - Async function to execute
   * @param {number} debounceMs - Debounce time in milliseconds
   * @returns {Promise<any>} Function result
   */
  async execute(operationId, fn, debounceMs = 300) {
    if (this.operations.has(operationId)) {
      console.debug(`[CopyOperationManager] Operation ${operationId} already in progress`);
      return { success: false, error: 'Operation in progress', inProgress: true };
    }

    this.operations.set(operationId, true);

    try {
      const result = await fn();
      return result;
    } finally {
      setTimeout(() => {
        this.operations.delete(operationId);
      }, debounceMs);
    }
  }

  /**
   * Check if operation is in progress
   * @param {string} operationId - Operation identifier
   * @returns {boolean}
   */
  isInProgress(operationId) {
    return this.operations.has(operationId);
  }

  /**
   * Clear all operations (for testing)
   */
  clear() {
    this.operations.clear();
  }
}

// Export singleton instance
export const copyManager = new CopyOperationManager();

/**
 * Main clipboard copy function with unified interface
 * @param {string} text - Text to copy
 * @param {Object} options - Copy options
 * @param {string} options.source - Source identifier ('popup'|'batch'|'background')
 * @param {boolean} options.showNotification - Whether to show notification
 * @param {string} options.successMessage - Custom success message
 * @param {string} options.errorMessage - Custom error message
 * @param {Function} options.onSuccess - Success callback
 * @param {Function} options.onError - Error callback
 * @param {boolean} options.trackAnalytics - Whether to track analytics
 * @param {Object} options.analyticsData - Additional analytics data
 * @returns {Promise<{success: boolean, method: string, content: string, duration: number}>}
 */
export async function copyToClipboard(text, options = {}) {
  // Default options
  const {
    source = 'unknown',
    showNotification = true,
    successMessage = null,
    errorMessage = null,
    onSuccess = null,
    onError = null,
    trackAnalytics = true,
    analyticsData = {},
  } = options;

  const startTime = Date.now();

  // Validate input
  if (!text || typeof text !== 'string') {
    const error = new ClipboardError('Invalid text input', ERROR_TYPES.VALIDATION);
    if (onError) {onError(error);}
    return { success: false, error, errorType: ERROR_TYPES.VALIDATION };
  }

  try {
    // Perform copy with fallback
    const result = await copyWithFallback(text, source);

    // Show notification
    if (showNotification) {
      const message = successMessage || getLocalMessage('copySuccess') || 'Copied successfully!';

      // Use appropriate notification method based on environment
      if (source === 'background') {
        notificationHelper.success(message);
      } else {
        toast.success(message);
      }
    }

    // Success callback
    if (onSuccess) {
      onSuccess(result);
    }

    return {
      success: true,
      method: result.method,
      content: text,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    console.debug('[ClipboardHelper] Copy failed:', error);

    // Show error notification
    if (showNotification) {
      const message = errorMessage || getLocalMessage('copyFailed') || 'Copy failed';

      if (source === 'background') {
        notificationHelper.error(message);
      } else {
        toast.error(message);
      }
    }

    // Error callback
    if (onError) {
      onError(error);
    }

    return {
      success: false,
      error: error,
      errorType: error.type || ERROR_TYPES.SYSTEM,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Copy image to clipboard
 * @param {Blob} blob - Image blob
 * @param {Object} options - Copy options (same as copyToClipboard)
 * @returns {Promise<{success: boolean}>}
 */
export async function copyImageToClipboard(blob, options = {}) {
  const { source = 'unknown', showNotification = true, onSuccess = null, onError = null } = options;

  try {
    if (!navigator.clipboard?.write) {
      throw new ClipboardError('Clipboard write API not available', ERROR_TYPES.SYSTEM);
    }

    const item = new ClipboardItem({ [blob.type]: blob });
    await navigator.clipboard.write([item]);

    console.debug(`[ClipboardHelper] Image copy successful (source: ${source})`);

    if (showNotification) {
      const message = getLocalMessage('qrCodeCopied') || 'Image copied successfully!';
      toast.success(message);
    }

    if (onSuccess) {onSuccess();}

    return { success: true };
  } catch (error) {
    console.debug('[ClipboardHelper] Image copy failed:', error);

    if (showNotification) {
      const message = getLocalMessage('copyFailed') || 'Copy failed';
      toast.error(message);
    }

    if (onError) {onError(error);}

    return { success: false, error };
  }
}

// Export utility functions for advanced usage
export { ClipboardError, ERROR_TYPES as ClipboardErrorTypes };
