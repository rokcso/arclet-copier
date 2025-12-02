/**
 * Options Page - Main Entry Point
 * Coordinates initialization of all options page modules
 */

import { initializeTemplateManager } from './modules/template-manager.js';
import { initializeParamConfig } from './modules/param-config.js';
import { initializeSettingsPanel } from './modules/settings-panel.js';
import { initializeEmojiPicker } from './modules/emoji-picker.js';
import { initializeRatingPrompt } from './modules/rating-prompt.js';

/**
 * Build elements map for all modules
 * @returns {Object} Map of DOM elements
 */
function buildElementsMap() {
  return {
    // Version elements
    version: document.getElementById('version'),
    aboutVersion: document.getElementById('aboutVersion'),

    // Settings panel elements
    shortUrlServiceSelect: document.getElementById('shortUrlServiceSelect'),
    notificationSwitch: document.getElementById('notificationSwitch'),
    languageSelect: document.getElementById('languageSelect'),
    appearanceSwitch: document.getElementById('appearanceSwitch'),
    colorPicker: document.getElementById('colorPicker'),
    ratingBtn: document.getElementById('ratingBtn'),
    kofiBtn: document.getElementById('kofiBtn'),
    feedbackBtn: document.getElementById('feedbackBtn'),

    // Template management elements
    templateList: document.getElementById('templateList'),
    addTemplateBtn: document.getElementById('addTemplateBtn'),
    templateModal: document.getElementById('templateModal'),
    templateModalTitle: document.getElementById('templateModalTitle'),
    templateModalClose: document.getElementById('templateModalClose'),
    templateName: document.getElementById('templateName'),
    templateIcon: document.getElementById('templateIcon'),
    templateContent: document.getElementById('templateContent'),
    templatePreview: document.getElementById('templatePreview'),
    templateSaveBtn: document.getElementById('templateSaveBtn'),
    templateCancelBtn: document.getElementById('templateCancelBtn'),
    previewRefreshBtn: document.getElementById('previewRefreshBtn'),

    // URL parameter configuration elements
    trackingParamsList: document.getElementById('trackingParamsList'),
    functionalParamsList: document.getElementById('functionalParamsList'),
    addTrackingParamBtn: document.getElementById('addTrackingParamBtn'),
    addFunctionalParamBtn: document.getElementById('addFunctionalParamBtn'),
    resetTrackingParamsBtn: document.getElementById('resetTrackingParamsBtn'),
    resetFunctionalParamsBtn: document.getElementById('resetFunctionalParamsBtn'),
    paramInputModal: document.getElementById('paramInputModal'),
    paramNameInput: document.getElementById('paramNameInput'),
    paramInputClose: document.getElementById('paramInputClose'),
    paramCancelBtn: document.getElementById('paramCancelBtn'),
    paramConfirmBtn: document.getElementById('paramConfirmBtn'),
  };
}

/**
 * Initialize all options page modules
 * @returns {Promise<void>}
 */
async function initialize() {
  // Build DOM elements map
  const elements = buildElementsMap();

  // Initialize settings panel (must be first - provides theme and i18n)
  await initializeSettingsPanel(elements);

  // Initialize all feature modules in parallel
  await Promise.all([
    initializeTemplateManager(elements),
    initializeParamConfig(elements),
    initializeEmojiPicker(),
    initializeRatingPrompt(),
  ]);

  console.log('[Options] All modules initialized successfully');
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
