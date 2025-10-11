import { vi, beforeEach } from "vitest";

// Mock Chrome APIs
global.chrome = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    local: {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    // Ensure onChanged exists at the storage level
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  i18n: {
    getUILanguage: vi.fn(() => "en-US"),
  },
  runtime: {
    getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
    getManifest: vi.fn(() => ({
      version: "1.6.6",
      name: "Arclet Copier",
    })),
    sendMessage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
  },
  offscreen: {
    createDocument: vi.fn(),
    closeDocument: vi.fn(),
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
  },
};

// Mock console methods for cleaner test output
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();

  // Reset Chrome API mocks
  chrome.storage.sync.get.mockResolvedValue({});
  chrome.storage.sync.set.mockResolvedValue(undefined);
  chrome.storage.sync.clear.mockResolvedValue(undefined);
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.clear.mockResolvedValue(undefined);

  // Reset console mocks
  console.debug.mockClear();
  console.log.mockClear();
  console.warn.mockClear();
  console.error.mockClear();
});
