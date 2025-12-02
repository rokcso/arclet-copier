/**
 * Emoji Picker Module
 * Handles emoji selection functionality for template icons
 */

import { getLocalMessage } from '../../../shared/ui/i18n.js';

// Curated emoji sets for different categories
const emojiData = {
  common: [
    '📝', '📄', '💻', '📚', '📋', '🔗', '🏷️', '⭐',
    '📌', '🔖', '📂', '📁', '🗂️', '📊', '📈', '📉',
    '🔧', '⚙️', '🔨', '💡',
  ],
  smileys: [
    '😀', '😃', '😄', '😁', '😊', '😉', '🤗', '🤔',
    '😎', '🥳', '😍', '🤩', '😘', '😋', '😜', '🤪',
    '😇', '🙂', '🙃', '😌',
  ],
  people: [
    '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍',
    '💯', '💥', '💫', '✨', '⭐', '🌟', '💖', '💕',
    '💗', '💓', '💘', '💝',
  ],
  animals: [
    '🌱', '🌿', '🍀', '🌳', '🌲', '🌺', '🌸', '🌼',
    '🌻', '🌹', '🌷', '💐', '🌍', '🌎', '🌏', '🌙',
    '☀️', '🌤️', '⛅', '🌈',
  ],
  activities: [
    '⚽', '🏀', '🎾', '🎯', '🎮', '🎨', '🎭', '🎵',
    '🎶', '🎤', '🎧', '🏆', '🎪', '🎬', '📸', '🎹',
    '🎸', '🥁', '🎺', '🎻',
  ],
  food: [
    '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍅',
    '🥕', '🌽', '🍞', '🧀', '🍕', '🍔', '☕', '🍵',
    '🍰', '🎂', '🍪', '🍫',
  ],
};

/**
 * Get localized category display name
 * @param {string} category - Category key
 * @returns {string} Localized category name
 */
function getCategoryDisplayName(category) {
  const keyMap = {
    common: 'emojiCategoryCommon',
    smileys: 'emojiCategorySmileys',
    people: 'emojiCategoryPeople',
    animals: 'emojiCategoryAnimals',
    activities: 'emojiCategoryActivities',
    food: 'emojiCategoryFood',
  };
  const i18nKey = keyMap[category];
  return i18nKey ? getLocalMessage(i18nKey) || category : category;
}

/**
 * Generate emoji picker HTML structure
 * @returns {string} HTML string for emoji picker
 */
function generateEmojiPickerHTML() {
  const categoriesHTML = Object.keys(emojiData)
    .map((category, index) => {
      const firstEmoji = emojiData[category][0];
      const isActive = index === 0 ? 'active' : '';
      return `<button type="button" class="emoji-category-btn ${isActive}" data-category="${category}">${firstEmoji}</button>`;
    })
    .join('');

  const gridsHTML = Object.entries(emojiData)
    .map(([category, emojis]) => {
      const emojiElements = emojis
        .map((emoji) => `<span class="emoji-option" data-emoji="${emoji}">${emoji}</span>`)
        .join('');
      return `
        <div class="emoji-category-section" data-category="${category}" id="emoji-category-${category}">
          <div class="emoji-category-title">${getCategoryDisplayName(category)}</div>
          <div class="emoji-grid">${emojiElements}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="emoji-picker-header">
      <div class="emoji-categories">
        ${categoriesHTML}
      </div>
    </div>
    <div class="emoji-picker-content">
      ${gridsHTML}
    </div>
  `;
}

/**
 * Update icon selector UI with selected emoji
 * @param {string} iconValue - Emoji to select
 */
export function updateIconSelector(iconValue) {
  const selector = document.querySelector('.template-icon-selector');
  if (!selector) return;

  // Remove active from all options
  selector.querySelectorAll('.icon-option').forEach((opt) => opt.classList.remove('active'));

  // Find and activate the matching option
  const matchingOption = selector.querySelector(`[data-icon="${iconValue}"]`);
  if (matchingOption) {
    matchingOption.classList.add('active');
  } else {
    // If no matching option found, update the first one
    const firstOption = selector.querySelector('.icon-option');
    if (firstOption) {
      firstOption.textContent = iconValue;
      firstOption.dataset.icon = iconValue;
      firstOption.classList.add('active');
    }
  }
}

/**
 * Bind event listeners for emoji picker
 * @param {HTMLElement} trigger - Trigger button element
 * @param {HTMLElement} picker - Picker container element
 * @param {HTMLElement} iconInput - Hidden icon input element
 */
function bindEventListeners(trigger, picker, iconInput) {
  // Toggle emoji picker
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    picker.classList.toggle('show');
  });

  // Close emoji picker when clicking outside
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && !trigger.contains(e.target)) {
      picker.classList.remove('show');
    }
  });

  // Handle emoji picker interactions
  picker.addEventListener('click', (e) => {
    // Handle category button clicks
    if (e.target.classList.contains('emoji-category-btn')) {
      const category = e.target.dataset.category;

      // Update active category button
      picker.querySelectorAll('.emoji-category-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');

      // Scroll to the corresponding category section
      const targetSection = picker.querySelector(`#emoji-category-${category}`);
      const pickerContent = picker.querySelector('.emoji-picker-content');

      if (targetSection && pickerContent) {
        const sectionTop = targetSection.offsetTop - pickerContent.offsetTop;
        pickerContent.scrollTo({
          top: sectionTop,
          behavior: 'smooth',
        });
      }
    }

    // Handle emoji selection
    if (e.target.classList.contains('emoji-option')) {
      const emoji = e.target.dataset.emoji;

      // Update hidden input
      if (iconInput) {
        iconInput.value = emoji;
      }

      // Update icon selector UI
      updateIconSelector(emoji);

      // Close picker
      picker.classList.remove('show');
    }
  });

  // Auto-update active category on scroll
  const pickerContent = picker.querySelector('.emoji-picker-content');
  if (pickerContent) {
    let scrollTimeout;
    pickerContent.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const categoryBtns = picker.querySelectorAll('.emoji-category-btn');
        const sections = picker.querySelectorAll('.emoji-category-section');

        if (!sections.length) return;

        const scrollTop = pickerContent.scrollTop;
        let activeCategory = null;
        let minDistance = Infinity;

        sections.forEach((section) => {
          const sectionTop = section.offsetTop - pickerContent.offsetTop;
          const distance = Math.abs(scrollTop - sectionTop);

          if (distance < minDistance) {
            minDistance = distance;
            activeCategory = section.dataset.category;
          }
        });

        if (activeCategory) {
          categoryBtns.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.category === activeCategory);
          });
        }
      }, 100);
    });
  }
}

/**
 * Initialize emoji picker module
 */
export function initializeEmojiPicker() {
  const emojiPickerTrigger = document.getElementById('emojiPickerTrigger');
  const emojiPicker = document.getElementById('emojiPicker');
  const iconInput = document.getElementById('templateIcon');

  if (!emojiPickerTrigger || !emojiPicker) {
    return;
  }

  // Initialize picker content
  emojiPicker.innerHTML = generateEmojiPickerHTML();

  // Bind event listeners
  bindEventListeners(emojiPickerTrigger, emojiPicker, iconInput);
}
