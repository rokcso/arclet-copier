# Edge Add-ons Store — Submission Content

## Single Purpose Description

Arclet Copier helps users quickly copy browser tab URLs in multiple formats — plain URL, Markdown link, shortened URL, or custom templates. It offers intelligent URL parameter cleaning, batch copying across tabs, QR code generation, and keyboard shortcut support to streamline sharing and referencing web pages.

---

## Permission Justifications

### 1. activeTab

When the user triggers a copy action via the keyboard shortcut (Ctrl+Shift+C / Cmd+Shift+C) or clicks the extension toolbar icon, this permission allows the extension to read the currently active tab's URL and page title — and only that tab. No tab data is accessed without an explicit user action. This is the minimum-scope permission needed for the extension's core copy function.

### 2. tabs

This permission serves three purposes:

1. **Active tab queries** — Querying the active tab's URL and title for copy operations triggered by keyboard shortcuts.
2. **Tab metadata retrieval** — Retrieving tab metadata by ID to prevent race conditions (e.g., when a tab is closed during an async short URL generation).
3. **Batch Copy feature** — Listing all open tabs across browser windows so users can select, filter, and copy multiple URLs at once. Without this permission, the batch copy page cannot function.

### 3. storage

Used to persist user preferences across browser sessions via `chrome.storage.sync` (synced across devices) and `chrome.storage.local` (device-local cache). Synced data includes: copy format (URL / Markdown / short URL / custom templates), URL parameter cleaning mode, theme appearance and color, display language, notification preferences, and short URL service selection. Local storage caches generated short URLs to avoid redundant API calls. No user browsing data is stored.

### 4. notifications

Used to display desktop notifications when a copy operation completes or fails, providing immediate user feedback without requiring the user to switch contexts. Users can choose between Chrome/Edge native notifications, in-page toast notifications, or disabling notifications entirely in settings. The native notification API also serves as an automatic fallback when the target page is a restricted system page (e.g., `chrome://`, `edge://`) where in-page notifications cannot be injected.

### 5. offscreen

Required by Manifest V3 for clipboard write operations from the Service Worker. Since MV3 Service Workers lack DOM access and cannot use `document.execCommand('copy')` or the Navigator Clipboard API directly, the extension creates a minimal hidden offscreen document to perform clipboard writes. This is the officially recommended approach by Chrome/Edge for extensions that need to copy text from background contexts. The offscreen document contains only a text input element and does not load any external resources.

### 6. clipboardWrite

This is the extension's core permission — writing copied URLs to the system clipboard. When a user presses the keyboard shortcut, clicks the toolbar button, uses the right-click context menu, or initiates batch copy, the formatted URL text is written to the clipboard for pasting into other applications. Without this permission, the extension cannot fulfill its primary function.

### 7. contextMenus

Adds a "Silent Copy" option to the browser's right-click context menu that appears on pages, links, images, videos, and editable text areas. This provides an alternative, mouse-driven way to copy the current page URL for users who prefer context menus over keyboard shortcuts, improving accessibility.

### 8. Host Permissions

`https://is.gd/*`: Default short URL generation service
`https://tinyurl.com/*`: Alternative short URL generation service
`https://da.gd/*`: Alternative short URL generation service (fallback)
`https://cleanuri.com/*`: Alternative short URL generation service (POST API)

These four hosts are short URL generation APIs. When a user requests a shortened URL (either for a single page or in batch mode), the extension sends the long URL to one of these services and receives a shortened version in response. The host permissions are technically required to bypass CORS restrictions and make cross-origin HTTP requests from the extension.

The extension only contacts these endpoints in direct response to a user action requesting short URL generation, and sends only the URL the user explicitly wants to shorten. No other data is transmitted.
