/**
 * Template Management Module
 * Handles template CRUD operations, validation, and preview
 */

import {
  getAllTemplates,
  getCustomTemplates,
  saveCustomTemplates,
  createTemplate,
  templateEngine,
  TemplateChangeNotifier,
} from '../../../shared/constants.js';
import toast from '../../../shared/toast.js';
import { getLocalMessage } from '../../../shared/ui/i18n.js';
import { updateIconSelector } from './emoji-picker.js';

// Module state
let elements = {};
let currentEditingTemplate = null;
let allTemplates = [];

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load templates from storage
 * @returns {Promise<void>}
 */
async function loadTemplates() {
  try {
    allTemplates = await getAllTemplates();
    renderTemplateList();
  } catch (error) {
    console.debug('Failed to load templates:', error);
    toast.error(getLocalMessage('templateLoadFailed') || 'Failed to load templates');
  }
}

/**
 * Render template list in the UI
 */
function renderTemplateList() {
  if (!elements.templateList) {
    return;
  }

  elements.templateList.innerHTML = '';

  allTemplates.forEach((template) => {
    const templateItem = createTemplateItem(template);
    elements.templateList.appendChild(templateItem);
  });
}

/**
 * Create a single template item element
 * @param {Object} template - Template object
 * @returns {HTMLElement} Template item element
 */
function createTemplateItem(template) {
  const item = document.createElement('div');
  item.className = 'template-item';
  item.dataset.templateId = template.id;

  item.innerHTML = `
    <div class="template-header">
      <div class="template-icon">${template.icon}</div>
      <div class="template-name">${escapeHtml(template.name)}</div>
      <div class="template-actions">
        <button class="template-action-btn edit" data-action="edit" title="编辑">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="m18.5 2.5 a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="template-action-btn delete" data-action="delete" title="${getLocalMessage('deleteTemplate') || '删除'}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,6 5,6 21,6"></polyline>
            <path d="m19,6 v14 a2,2 0 0,1 -2,2 H7 a2,2 0 0,1 -2,-2 V6 m3,0 V4 a2,2 0 0,1 2,-2 h4 a2,2 0 0,1 2,2 v2"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="template-content">${escapeHtml(template.template)}</div>
  `;

  // Add event listeners for actions
  const editBtn = item.querySelector('[data-action="edit"]');
  const deleteBtn = item.querySelector('[data-action="delete"]');

  if (editBtn) {
    editBtn.addEventListener('click', () => editTemplate(template));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteTemplate(template));
  }

  return item;
}

/**
 * Show template modal for creating or editing
 * @param {Object|null} template - Template to edit, or null for new template
 */
function showTemplateModal(template = null) {
  // Check if required elements exist
  if (!elements.templateModal || !elements.templateModalTitle || !elements.templateName) {
    return;
  }

  currentEditingTemplate = template;

  if (template) {
    elements.templateModalTitle.textContent = getLocalMessage('editTemplate') || '编辑模板';

    elements.templateName.value = template.name;
    if (elements.templateIcon) {
      elements.templateIcon.value = template.icon;
    }
    if (elements.templateContent) {
      elements.templateContent.value = template.template;
    }

    // Update icon selector UI
    updateIconSelector(template.icon);
  } else {
    elements.templateModalTitle.textContent = getLocalMessage('createTemplate') || '创建模板';
    elements.templateName.value = '';
    if (elements.templateIcon) {
      elements.templateIcon.value = '📝';
    }
    if (elements.templateContent) {
      elements.templateContent.value = '';
    }

    // Update icon selector UI to default
    updateIconSelector('📝');
  }

  updateTemplatePreview();
  validateTemplate();
  elements.templateModal.classList.add('show');
  document.body.classList.add('modal-open');

  // Focus on name input if it exists
  if (elements.templateName) {
    elements.templateName.focus();
  }
}

/**
 * Hide template modal
 */
function hideTemplateModal() {
  elements.templateModal.classList.remove('show');
  document.body.classList.remove('modal-open');
  currentEditingTemplate = null;
}

/**
 * Edit a template
 * @param {Object} template - Template to edit
 */
function editTemplate(template) {
  showTemplateModal(template);
}

/**
 * Delete a template
 * @param {Object} template - Template to delete
 * @returns {Promise<void>}
 */
async function deleteTemplate(template) {
  const confirmMessage =
    getLocalMessage('confirmDeleteTemplate')?.replace('{name}', template.name) ||
    `确定要删除模板"${template.name}"吗？`;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    const customTemplates = await getCustomTemplates();
    const updatedTemplates = customTemplates.filter((t) => t.id !== template.id);
    await saveCustomTemplates(updatedTemplates);

    // Notify other pages that template was deleted
    await TemplateChangeNotifier.notify('deleted', template.id);

    toast.success(getLocalMessage('templateDeleted') || '模板已删除');

    await loadTemplates();
  } catch (error) {
    console.debug('Failed to delete template:', error);
    toast.error(getLocalMessage('templateDeleteFailed') || '删除模板失败');
  }
}

/**
 * Save template (create or update)
 * @returns {Promise<void>}
 */
async function saveTemplate() {
  const name = elements.templateName.value.trim();
  const icon = elements.templateIcon.value.trim();
  const content = elements.templateContent.value.trim();

  if (!name) {
    toast.error(getLocalMessage('templateNameRequired') || '请输入模板名称');
    return;
  }

  if (!content) {
    toast.error(getLocalMessage('templateContentRequired') || '请输入模板内容');
    return;
  }

  const validation = templateEngine.validateTemplate(content);
  if (!validation.valid) {
    const errorPrefix = getLocalMessage('templateValidationError') || 'Template validation error';
    toast.error(`${errorPrefix}: ${validation.errors.join(', ')}`);
    return;
  }

  try {
    const customTemplates = await getCustomTemplates();

    if (currentEditingTemplate) {
      // Update existing template
      const index = customTemplates.findIndex((t) => t.id === currentEditingTemplate.id);
      if (index !== -1) {
        customTemplates[index] = {
          ...currentEditingTemplate,
          name,
          icon,
          template: content,
          lastUsed: new Date().toISOString(),
        };
      }
    } else {
      // Create new template
      const newTemplate = createTemplate(name, content, icon);
      customTemplates.push(newTemplate);
    }

    await saveCustomTemplates(customTemplates);

    // Notify other pages that template was changed
    if (currentEditingTemplate) {
      await TemplateChangeNotifier.notify('updated', currentEditingTemplate.id);
    } else {
      const newTemplateId = customTemplates[customTemplates.length - 1].id;
      await TemplateChangeNotifier.notify('created', newTemplateId);
    }

    toast.success(
      currentEditingTemplate
        ? getLocalMessage('templateUpdated') || '模板已更新'
        : getLocalMessage('templateCreated') || '模板已创建',
    );

    hideTemplateModal();
    await loadTemplates();
  } catch (error) {
    console.debug('Failed to save template:', error);
    toast.error(getLocalMessage('templateSaveFailed') || '保存模板失败');
  }
}

/**
 * Update template preview
 */
function updateTemplatePreview() {
  if (!elements.templateContent || !elements.templatePreview) {
    return;
  }

  const content = elements.templateContent.value.trim();
  const previewContent = elements.templatePreview;

  if (!content) {
    previewContent.innerHTML = `<span class="preview-placeholder">${getLocalMessage('previewPlaceholder') || '输入模板内容以查看预览'}</span>`;
    return;
  }

  // Create comprehensive mock context for preview based on arcletcopier.com
  const mockContext = {
    url: 'https://www.arcletcopier.com/?utm_source=chrome&utm_medium=extension&utm_campaign=template_test&ref=github#features',
    title: 'Arclet Copier - Clean & Efficient Chrome Extension for Quick URL Copying',
    urlCleaning: 'smart',
    shortUrl: 'https://is.gd/ArcletCopy',
    author: 'Rokcso',
    description:
      'A powerful Chrome extension for intelligent URL copying with custom templates, batch operations, short URLs, and multi-language support.',
  };

  templateEngine
    .processTemplate(content, mockContext)
    .then((result) => {
      previewContent.textContent = result;
    })
    .catch((error) => {
      previewContent.innerHTML = `<span style="color: #ef4444;">预览错误: ${escapeHtml(error.message)}</span>`;
    });
}

/**
 * Validate template
 * @returns {Object} Validation result
 */
function validateTemplate() {
  const content = elements.templateContent.value.trim();
  const nameValid = elements.templateName.value.trim().length > 0;

  if (!content) {
    // Update save button state
    elements.templateSaveBtn.disabled = !nameValid;
    return { valid: true, errors: [], fields: [] };
  }

  const validation = templateEngine.validateTemplate(content);

  // Update save button state
  elements.templateSaveBtn.disabled = !(validation.valid && nameValid);

  // Never log errors during input - only show errors when user tries to save
  return validation;
}

/**
 * Insert field at cursor position
 * @param {string} fieldName - Field name to insert
 */
function insertField(fieldName) {
  const textarea = elements.templateContent;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const fieldText = `{{${fieldName}}}`;

  textarea.value = text.substring(0, start) + fieldText + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + fieldText.length, start + fieldText.length);

  updateTemplatePreview();
  validateTemplate();
}

/**
 * Bind event listeners for template management
 */
function bindEventListeners() {
  if (!elements.templateList) {
    console.debug('templateList element not found');
    return;
  }

  // Add template button
  if (elements.addTemplateBtn) {
    elements.addTemplateBtn.addEventListener('click', () => {
      showTemplateModal();
    });
  }

  // Modal close events
  elements.templateModalClose?.addEventListener('click', hideTemplateModal);
  elements.templateCancelBtn?.addEventListener('click', hideTemplateModal);

  // Click outside modal to close
  elements.templateModal?.addEventListener('click', (e) => {
    if (e.target === elements.templateModal) {
      hideTemplateModal();
    }
  });

  // Save template
  elements.templateSaveBtn?.addEventListener('click', saveTemplate);

  // Template content changes
  elements.templateContent?.addEventListener('input', () => {
    updateTemplatePreview();
    validateTemplate();
  });

  elements.templateName?.addEventListener('input', validateTemplate);

  // Preview refresh
  elements.previewRefreshBtn?.addEventListener('click', updateTemplatePreview);

  // Variable button clicks
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('variable-btn') && e.target.dataset.field) {
      insertField(e.target.dataset.field);
    }
  });

  // Icon selector functionality
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('icon-option')) {
      // Update active state
      const selector = e.target.closest('.template-icon-selector');
      if (selector) {
        selector.querySelectorAll('.icon-option').forEach((opt) => opt.classList.remove('active'));
        e.target.classList.add('active');

        // Update hidden input value
        const iconInput = document.getElementById('templateIcon');
        if (iconInput) {
          iconInput.value = e.target.dataset.icon;
        }
      }
    }
  });

  // Keyboard shortcuts
  elements.templateContent?.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        saveTemplate();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        updateTemplatePreview();
      }
    }
  });
}

/**
 * Initialize template management module
 * @param {Object} elementsMap - Map of DOM elements
 * @returns {Promise<void>}
 */
export async function initializeTemplateManager(elementsMap) {
  elements = elementsMap;

  // Bind event listeners
  bindEventListeners();

  // Load templates
  await loadTemplates();
}
