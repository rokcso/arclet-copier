/**
 * Rating Prompt Module
 * Handles the rating prompt modal logic for encouraging users to rate the extension
 */

import { getLocalMessage } from '../../../shared/ui/i18n.js';

// Constants
const MIN_COPY_COUNT = 100;
const PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const PROMPT_DELAY = 1000; // Delay before showing prompt (1 second)

/**
 * Detect browser type
 * @returns {string} Browser identifier ('edge' or 'chrome')
 */
function detectBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();

  // Edge browser detection (UA includes "edg/" or "edge/")
  if (userAgent.includes('edg/') || userAgent.includes('edge/')) {
    return 'edge';
  }

  // Chrome browser detection (UA includes "chrome" but not "edg")
  if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    return 'chrome';
  }

  // Default fallback to chrome
  return 'chrome';
}

/**
 * Get browser-specific store URL
 * @returns {string} Store URL for the current browser
 */
function getStoreUrl() {
  const browser = detectBrowser();

  const storeUrls = {
    edge: 'https://microsoftedge.microsoft.com/addons/detail/flcemgbijffbmbgcmabmmjhankbegdgm',
    chrome: 'https://chromewebstore.google.com/detail/mkflehheaokdfopijachhfdbofkppdil',
  };

  // Return chrome store URL as default fallback
  return storeUrls[browser] || storeUrls.chrome;
}

/**
 * Check if rating prompt should be shown
 * @returns {Promise<boolean>} True if prompt should be shown
 */
async function shouldShowRatingPrompt() {
  try {
    const result = await chrome.storage.local.get([
      'copyCount',
      'lastRatingPromptDate',
      'ratingPromptDismissed',
    ]);

    const copyCount = result.copyCount || 0;
    const lastPromptDate = result.lastRatingPromptDate || 0;
    const dismissed = result.ratingPromptDismissed || false;

    // If user has permanently dismissed, return false
    if (dismissed) {
      return false;
    }

    // Copy count must reach the minimum threshold
    if (copyCount < MIN_COPY_COUNT) {
      return false;
    }

    // Check if enough time has passed since last prompt
    const now = Date.now();
    if (now - lastPromptDate < PROMPT_INTERVAL_MS) {
      return false;
    }

    return true;
  } catch (error) {
    console.debug('[RatingPrompt] Failed to check rating prompt status:', error);
    return false;
  }
}

/**
 * Show rating prompt modal
 */
function showRatingPrompt() {
  const modal = document.getElementById('ratingPromptModal');
  if (modal) {
    modal.classList.add('show');
    document.body.classList.add('modal-open');
  }
}

/**
 * Hide rating prompt modal
 */
function hideRatingPrompt() {
  const modal = document.getElementById('ratingPromptModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
  }
}

/**
 * Handle "Rate Now" button click
 */
async function handleRateNow() {
  const storeUrl = getStoreUrl();
  const browser = detectBrowser();

  console.log(`[RatingPrompt] Detected browser: ${browser}`);
  console.log(`[RatingPrompt] Redirecting to: ${storeUrl}`);

  chrome.tabs.create({ url: storeUrl });

  // Mark as permanently dismissed (user has already rated)
  await chrome.storage.local.set({
    ratingPromptDismissed: true,
  });

  hideRatingPrompt();
}

/**
 * Handle "Rate Later" button click
 */
async function handleRateLater() {
  // Update last prompt date to current time
  await chrome.storage.local.set({
    lastRatingPromptDate: Date.now(),
  });

  hideRatingPrompt();
}

/**
 * Bind event listeners for rating prompt
 */
function bindEventListeners() {
  const rateNowBtn = document.getElementById('rateNowBtn');
  const rateLaterBtn = document.getElementById('rateLaterBtn');
  const ratingPromptClose = document.getElementById('ratingPromptClose');
  const modal = document.getElementById('ratingPromptModal');

  if (rateNowBtn) {
    rateNowBtn.addEventListener('click', handleRateNow);
  }

  if (rateLaterBtn) {
    rateLaterBtn.addEventListener('click', handleRateLater);
  }

  if (ratingPromptClose) {
    ratingPromptClose.addEventListener('click', handleRateLater);
  }

  // Click outside modal to close (equivalent to "rate later")
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleRateLater();
      }
    });
  }
}

/**
 * Initialize rating prompt module
 * @returns {Promise<void>}
 */
export async function initializeRatingPrompt() {
  // Check if prompt should be shown
  const shouldShow = await shouldShowRatingPrompt();

  if (shouldShow) {
    // Delay showing prompt to let user see the settings page first
    setTimeout(() => {
      showRatingPrompt();
    }, PROMPT_DELAY);
  }

  // Bind event listeners
  bindEventListeners();
}
