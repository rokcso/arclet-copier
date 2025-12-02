/**
 * Parameter Configuration Module
 * Handles URL parameter rules management (tracking and functional parameters)
 */

import {
  getCustomParamRules,
  saveCustomParamRules,
  DEFAULT_PARAM_RULES,
} from '../../../shared/constants.js';
import toast from '../../../shared/toast.js';
import { getLocalMessage } from '../../../shared/ui/i18n.js';

// Module state
let elements = {};
let currentParamCategory = null; // 'tracking' or 'functional'
let currentEditingParam = null; // The parameter being edited (null for add mode)
let isEditMode = false; // Whether modal is in edit mode

/**
 * Create single parameter tag element
 * @param {string} param - Parameter name
 * @param {string} category - Category ('tracking' or 'functional')
 * @returns {HTMLElement} Parameter tag element
 */
function createParamTag(param, category) {
  const tag = document.createElement('div');
  tag.className = 'param-tag';
  tag.setAttribute('data-param', param);
  tag.setAttribute('data-category', category);
  tag.innerHTML = `
    <span class="param-name">${param}</span>
    <button class="param-remove" data-param="${param}" data-category="${category}" title="${getLocalMessage('removeParam') || '删除'}">×</button>
  `;

  // Add click event for editing
  const paramNameSpan = tag.querySelector('.param-name');
  paramNameSpan.addEventListener('click', () => {
    showEditParamModal(category, param);
  });
  paramNameSpan.style.cursor = 'pointer';
  paramNameSpan.title = getLocalMessage('editParamHint') || '单击编辑';

  // Add remove event listener
  const removeBtn = tag.querySelector('.param-remove');
  removeBtn.addEventListener('click', () => {
    removeParam(category, param);
  });

  return tag;
}

/**
 * Smart incremental update for parameter lists
 * @param {string} containerId - Container element ID
 * @param {Array<string>} oldParams - Previous parameter list
 * @param {Array<string>} newParams - New parameter list
 * @param {string} category - Category name
 */
function smartUpdateParamList(containerId, oldParams, newParams, category) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  const newSet = new Set(newParams);
  const sortedNewParams = [...newParams].sort();

  // Remove parameters that no longer exist
  container.querySelectorAll('.param-tag').forEach((tag) => {
    const param = tag.getAttribute('data-param');
    if (!newSet.has(param)) {
      tag.remove();
    }
  });

  // Find existing elements for ordering
  const existingElements = new Map();
  container.querySelectorAll('.param-tag').forEach((tag) => {
    const param = tag.getAttribute('data-param');
    if (newSet.has(param)) {
      existingElements.set(param, tag);
    }
  });

  // Add new parameters in correct order
  sortedNewParams.forEach((param, index) => {
    const existingElement = existingElements.get(param);
    if (existingElement) {
      // Reorder existing element if needed
      const nextElement = container.children[index];
      if (nextElement !== existingElement) {
        container.insertBefore(existingElement, nextElement || null);
      }
    } else {
      // Create new parameter tag
      const tag = createParamTag(param, category);

      // Insert at correct position
      const targetElement = container.children[index];
      if (targetElement) {
        container.insertBefore(tag, targetElement);
      } else {
        container.appendChild(tag);
      }
    }
  });
}

/**
 * Legacy render function (for initial load)
 * @param {string} containerId - Container element ID
 * @param {Array<string>} params - Parameter list
 * @param {string} category - Category name
 */
function renderParamTags(containerId, params, category) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  container.innerHTML = '';

  // Sort parameters alphabetically
  const sortedParams = [...params].sort();

  sortedParams.forEach((param) => {
    const tag = createParamTag(param, category);
    container.appendChild(tag);
  });
}

/**
 * Updated parameter list with incremental update
 * @param {string} containerId - Container element ID
 * @param {Array<string>} params - Parameter list
 * @param {string} category - Category name
 */
function updateParamTags(containerId, params, category) {
  // Store current state for comparison
  if (!window.paramListState) {
    window.paramListState = {};
  }

  const key = `${containerId}`;
  const oldParams = window.paramListState[key] || [];
  const newParams = [...params].sort();

  // First time load, use full render
  if (oldParams.length === 0) {
    renderParamTags(containerId, params, category);
  } else {
    // Use incremental update
    smartUpdateParamList(containerId, oldParams, newParams, category);
  }

  // Update stored state
  window.paramListState[key] = newParams;
}

/**
 * Load parameter rules from storage
 * @returns {Promise<void>}
 */
async function loadParamRules() {
  // Only skip if containers are already populated (prevents flickering during operations)
  const trackingContainer = document.getElementById('trackingParamsList');
  const functionalContainer = document.getElementById('functionalParamsList');

  if (
    trackingContainer &&
    trackingContainer.children.length > 0 &&
    functionalContainer &&
    functionalContainer.children.length > 0
  ) {
    console.log('[ParamConfig] Skipping load - containers already populated');
    return;
  }

  try {
    const rules = await getCustomParamRules();
    updateParamTags('trackingParamsList', rules.tracking, 'tracking');
    updateParamTags('functionalParamsList', rules.functional, 'functional');
    console.log('[ParamConfig] Loaded parameter rules:', rules);
  } catch (error) {
    console.debug('[ParamConfig] Failed to load parameter rules:', error);
    toast.show(getLocalMessage('loadParamRulesFailed') || '加载参数配置失败', 'error');
  }
}

/**
 * Show add parameter modal
 * @param {string} category - Category ('tracking' or 'functional')
 */
function showAddParamModal(category) {
  currentParamCategory = category;
  currentEditingParam = null;
  isEditMode = false;

  // Update modal title based on category
  const modalTitle = document.getElementById('paramModalTitle');
  if (modalTitle) {
    if (category === 'tracking') {
      modalTitle.textContent = getLocalMessage('addTrackingParamTitle') || '添加跟踪参数';
    } else if (category === 'functional') {
      modalTitle.textContent = getLocalMessage('addFunctionalParamTitle') || '添加功能参数';
    } else {
      modalTitle.textContent = getLocalMessage('addParamTitle') || '添加参数';
    }
  }

  elements.paramNameInput.value = '';
  elements.paramNameInput.classList.remove('error');
  elements.paramInputModal.classList.add('show');
  document.body.classList.add('modal-open');

  // Delay focus to ensure modal animation completes
  setTimeout(() => {
    elements.paramNameInput.focus();
  }, 100);
}

/**
 * Show edit parameter modal
 * @param {string} category - Category ('tracking' or 'functional')
 * @param {string} param - Parameter name to edit
 */
function showEditParamModal(category, param) {
  currentParamCategory = category;
  currentEditingParam = param;
  isEditMode = true;

  // Update modal title
  const modalTitle = document.getElementById('paramModalTitle');
  if (modalTitle) {
    modalTitle.textContent = getLocalMessage('editParamTitle') || '编辑参数';
  }

  elements.paramNameInput.value = param;
  elements.paramNameInput.classList.remove('error');
  elements.paramInputModal.classList.add('show');
  document.body.classList.add('modal-open');

  // Delay focus and select to ensure modal animation completes
  setTimeout(() => {
    elements.paramNameInput.focus();
    // Select all text for easy replacement
    elements.paramNameInput.select();
  }, 100);
}

/**
 * Hide add parameter modal
 */
function hideAddParamModal() {
  elements.paramInputModal.classList.remove('show');
  document.body.classList.remove('modal-open');
  currentParamCategory = null;
  currentEditingParam = null;
  isEditMode = false;
}

/**
 * Validate parameter name
 * @param {string} paramName - Parameter name to validate
 * @returns {Object} Validation result with valid flag and error message
 */
function validateParamName(paramName) {
  if (!paramName || paramName.trim() === '') {
    return {
      valid: false,
      error: getLocalMessage('paramNameEmpty') || '参数名不能为空',
    };
  }

  // Only allow letters, numbers, and underscores
  const validPattern = /^[a-zA-Z0-9_]+$/;
  if (!validPattern.test(paramName)) {
    return {
      valid: false,
      error: getLocalMessage('paramNameInvalid') || '参数名只能包含字母、数字、下划线',
    };
  }

  return { valid: true };
}

/**
 * Add or edit parameter (unified function)
 * @param {string} category - Category ('tracking' or 'functional')
 * @param {string} paramName - Parameter name
 * @returns {Promise<boolean>} Success status
 */
async function addParam(category, paramName) {
  try {
    const validation = validateParamName(paramName);
    if (!validation.valid) {
      toast.show(validation.error, 'error');
      elements.paramNameInput.classList.add('error');
      return false;
    }

    const lowerParamName = paramName.toLowerCase().trim();
    const rules = await getCustomParamRules();

    // Edit mode: update existing parameter
    if (isEditMode && currentEditingParam) {
      const lowerCurrentParam = currentEditingParam.toLowerCase();

      // If name hasn't changed, just close modal
      if (lowerParamName === lowerCurrentParam) {
        hideAddParamModal();
        return true;
      }

      // Check if parameter already exists
      const existsInCurrentCategory = rules[category].includes(lowerParamName);
      const existsInOtherCategory =
        category === 'tracking' ? rules.functional.includes(lowerParamName) : rules.tracking.includes(lowerParamName);

      if (existsInCurrentCategory) {
        // Same category duplicate
        toast.show(
          getLocalMessage('paramExistsInSameCategory') ||
            `Parameter "${lowerParamName}" already exists in current category`,
          'error',
        );
        elements.paramNameInput.classList.add('error');
        return false;
      } else if (existsInOtherCategory) {
        // Cross category duplicate
        const otherCategoryKey = category === 'tracking' ? 'paramExistsInFunctional' : 'paramExistsInTracking';
        const otherCategory = getLocalMessage(otherCategoryKey);
        toast.show(
          getLocalMessage('paramExistsInOtherCategory') ||
            `Parameter "${lowerParamName}" already exists in ${otherCategory}`,
          'error',
        );
        elements.paramNameInput.classList.add('error');
        return false;
      }

      // Remove old parameter and add new one
      const index = rules[category].indexOf(lowerCurrentParam);
      if (index > -1) {
        rules[category].splice(index, 1);
      }
      rules[category].push(lowerParamName);

      const success = await saveCustomParamRules(rules);

      if (success) {
        // Update only the specific category with incremental update
        updateParamTags(
          category === 'tracking' ? 'trackingParamsList' : 'functionalParamsList',
          rules[category],
          category,
        );
        hideAddParamModal();
        toast.show(getLocalMessage('paramUpdated') || '参数已更新', 'success');
        return true;
      } else {
        toast.show(getLocalMessage('paramUpdateFailed') || '更新参数失败', 'error');
        return false;
      }
    }

    // Add mode: add new parameter
    else {
      // Check if parameter already exists
      const existsInCurrentCategory = rules[category].includes(lowerParamName);
      const existsInOtherCategory =
        category === 'tracking' ? rules.functional.includes(lowerParamName) : rules.tracking.includes(lowerParamName);

      if (existsInCurrentCategory) {
        // Same category duplicate
        toast.show(
          getLocalMessage('paramExistsInSameCategory') ||
            `Parameter "${lowerParamName}" already exists in current category`,
          'error',
        );
        elements.paramNameInput.classList.add('error');
        return false;
      } else if (existsInOtherCategory) {
        // Cross category duplicate
        const otherCategoryKey = category === 'tracking' ? 'paramExistsInFunctional' : 'paramExistsInTracking';
        const otherCategory = getLocalMessage(otherCategoryKey);
        toast.show(
          getLocalMessage('paramExistsInOtherCategory') ||
            `Parameter "${lowerParamName}" already exists in ${otherCategory}`,
          'error',
        );
        elements.paramNameInput.classList.add('error');
        return false;
      }

      // Add parameter
      rules[category].push(lowerParamName);

      const success = await saveCustomParamRules(rules);

      if (success) {
        // Update only the specific category with incremental update
        updateParamTags(
          category === 'tracking' ? 'trackingParamsList' : 'functionalParamsList',
          rules[category],
          category,
        );
        hideAddParamModal();
        toast.show(getLocalMessage('paramAdded') || '参数已添加', 'success');
        return true;
      } else {
        toast.show(getLocalMessage('paramAddFailed') || '添加参数失败', 'error');
        return false;
      }
    }
  } catch (error) {
    console.debug('[ParamConfig] Failed to add/edit parameter:', error);
    toast.show(getLocalMessage('paramAddFailed') || '添加参数失败', 'error');
    return false;
  }
}

/**
 * Remove parameter
 * @param {string} category - Category ('tracking' or 'functional')
 * @param {string} paramName - Parameter name
 * @returns {Promise<void>}
 */
async function removeParam(category, paramName) {
  try {
    const rules = await getCustomParamRules();
    const newParams = rules[category].filter((p) => p !== paramName);
    rules[category] = newParams;

    const success = await saveCustomParamRules(rules);
    if (success) {
      // Update only the specific category with incremental update
      updateParamTags(
        category === 'tracking' ? 'trackingParamsList' : 'functionalParamsList',
        newParams,
        category,
      );
      toast.show(getLocalMessage('paramRemoved') || '参数已删除', 'success');
    } else {
      toast.show(getLocalMessage('paramRemoveFailed') || '删除参数失败', 'error');
    }
  } catch (error) {
    console.debug('[ParamConfig] Failed to remove parameter:', error);
    toast.show(getLocalMessage('paramRemoveFailed') || '删除参数失败', 'error');
  }
}

/**
 * Reset tracking parameters to defaults
 * @returns {Promise<void>}
 */
async function resetTrackingParams() {
  const confirmed = confirm(
    getLocalMessage('resetTrackingParamsConfirm') || '确定要恢复跟踪参数的默认配置吗？',
  );

  if (!confirmed) {
    return;
  }

  try {
    const currentRules = await getCustomParamRules();
    const success = await saveCustomParamRules({
      tracking: [...DEFAULT_PARAM_RULES.tracking],
      functional: currentRules.functional, // Keep functional params unchanged
    });

    if (success) {
      // Use full render for reset operations and re-establish state
      renderParamTags('trackingParamsList', DEFAULT_PARAM_RULES.tracking, 'tracking');
      // Re-establish state for the tracking category to enable future incremental updates
      if (window.paramListState) {
        window.paramListState['trackingParamsList'] = [...DEFAULT_PARAM_RULES.tracking].sort();
      }
      updateParamTags('functionalParamsList', currentRules.functional, 'functional');
      toast.show(getLocalMessage('trackingParamsReset') || '跟踪参数已恢复默认', 'success');
    } else {
      toast.show(getLocalMessage('paramRulesResetFailed') || '恢复默认配置失败', 'error');
    }
  } catch (error) {
    console.debug('[ParamConfig] Failed to reset tracking parameters:', error);
    toast.show(getLocalMessage('paramRulesResetFailed') || '恢复默认配置失败', 'error');
  }
}

/**
 * Reset functional parameters to defaults
 * @returns {Promise<void>}
 */
async function resetFunctionalParams() {
  const confirmed = confirm(
    getLocalMessage('resetFunctionalParamsConfirm') || '确定要恢复功能参数的默认配置吗？',
  );

  if (!confirmed) {
    return;
  }

  try {
    const currentRules = await getCustomParamRules();
    const success = await saveCustomParamRules({
      tracking: currentRules.tracking, // Keep tracking params unchanged
      functional: [...DEFAULT_PARAM_RULES.functional],
    });

    if (success) {
      updateParamTags('trackingParamsList', currentRules.tracking, 'tracking');
      // Use full render for reset operations and re-establish state
      renderParamTags('functionalParamsList', DEFAULT_PARAM_RULES.functional, 'functional');
      // Re-establish state for the functional category to enable future incremental updates
      if (window.paramListState) {
        window.paramListState['functionalParamsList'] = [...DEFAULT_PARAM_RULES.functional].sort();
      }
      toast.show(getLocalMessage('functionalParamsReset') || '功能参数已恢复默认', 'success');
    } else {
      toast.show(getLocalMessage('paramRulesResetFailed') || '恢复默认配置失败', 'error');
    }
  } catch (error) {
    console.debug('[ParamConfig] Failed to reset functional parameters:', error);
    toast.show(getLocalMessage('paramRulesResetFailed') || '恢复默认配置失败', 'error');
  }
}

/**
 * Bind event listeners for parameter configuration
 */
function bindEventListeners() {
  // Add tracking parameter button
  elements.addTrackingParamBtn?.addEventListener('click', () => {
    showAddParamModal('tracking');
  });

  // Add functional parameter button
  elements.addFunctionalParamBtn?.addEventListener('click', () => {
    showAddParamModal('functional');
  });

  // Reset tracking parameters button
  elements.resetTrackingParamsBtn?.addEventListener('click', resetTrackingParams);

  // Reset functional parameters button
  elements.resetFunctionalParamsBtn?.addEventListener('click', resetFunctionalParams);

  // Modal close button
  elements.paramInputClose?.addEventListener('click', hideAddParamModal);

  // Modal cancel button
  elements.paramCancelBtn?.addEventListener('click', hideAddParamModal);

  // Modal confirm button
  elements.paramConfirmBtn?.addEventListener('click', () => {
    const paramName = elements.paramNameInput.value.trim();
    if (currentParamCategory && paramName) {
      addParam(currentParamCategory, paramName);
    }
  });

  // Input enter key
  elements.paramNameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const paramName = elements.paramNameInput.value.trim();
      if (currentParamCategory && paramName) {
        addParam(currentParamCategory, paramName);
      }
    }
  });

  // Input ESC key to close modal
  elements.paramNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAddParamModal();
    }
  });

  // Click outside modal to close
  elements.paramInputModal?.addEventListener('click', (e) => {
    if (e.target === elements.paramInputModal) {
      hideAddParamModal();
    }
  });

  // Remove error state on input
  elements.paramNameInput?.addEventListener('input', () => {
    elements.paramNameInput.classList.remove('error');
  });
}

/**
 * Initialize parameter configuration module
 * @param {Object} elementsMap - Map of DOM elements
 * @returns {Promise<void>}
 */
export async function initializeParamConfig(elementsMap) {
  elements = elementsMap;

  // Bind event listeners
  bindEventListeners();

  // Load parameter rules
  await loadParamRules();
}
