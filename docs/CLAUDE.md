# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arclet Copier is a Chrome extension for intelligent URL copying and link management. It supports custom templates, batch operations, short URL generation, QR codes, and multi-language support (9 languages). The project uses Manifest V3 and ES6 modules.

## Build and Development Commands

```bash
# Build the extension for distribution
npm run build

# The build output will be in dist/arclet-copier-v{version}/

# Development mode with file watching and auto-rebuild
npm run dev

# The dev build output will be in dist-dev/
```

**No test suite is currently implemented.** The project relies on manual testing procedures documented in TESTING.md (if it exists).

## Architecture Overview

### Modular Structure by Function
The codebase uses a functional module architecture where each directory represents a specific capability:

- `background/` - Service Worker handling shortcuts, context menus, and core copy logic
- `popup/` - Main UI interface with copy buttons and settings controls  
- `offscreen/` - Clipboard operations using Offscreen Documents API
- `options/` - Advanced settings page with template management
- `batch/` - Bulk tab copying functionality
- `content/` - Content script for enhanced page interaction
- `shared/` - Common utilities, constants, and shared modules including:
  - `constants.js` - Central utility library and template engine
  - `settings-manager.js` - Settings persistence and management
  - `toast.js` - Arc-style toast notification system
  - `short-url-cache.js` - Short URL caching with TTL and LRU eviction
  - `three-way-switch.js` - Custom three-way toggle component
  - `binary-toggle.js` - Two-state toggle component
  - `toggles.js` - General toggle utilities
  - `notification-helper.js` - Chrome notification wrapper

### Key Architectural Patterns

**ES6 Module System**: All JavaScript files use ES6 imports/exports. The `shared/constants.js` file serves as the central utility library imported across modules.

**Message Passing Architecture**: Components communicate via Chrome extension messaging:
- `background.js` ↔ `popup.js` for copy operations
- `background.js` ↔ `offscreen.js` for clipboard access
- All modules use the shared constants for consistency

**Template Engine**: Custom template system supporting 11 variables (`{{url}}`, `{{title}}`, `{{shortUrl}}`, etc.) with validation and fallback handling.

**Persistent Caching**: Multi-layer caching system:
- Short URL cache with 24h TTL and LRU eviction  
- Template storage with Chrome sync storage
- User settings persistence

### Critical Data Flow

1. **Copy Operations**: User action → popup/background → URL processing (shared/constants.js) → offscreen clipboard → notification
2. **Template Processing**: Template selection → variable substitution → URL cleaning → format generation → copy
3. **Short URL Generation**: URL validation → cache check → API call (throttled) → cache storage → copy

## Configuration and Settings

### User Settings (Chrome Storage Sync)
- `urlCleaning`: "off"|"smart"|"aggressive" 
- `silentCopyFormat`: "url"|"markdown"|"shortUrl"|"custom:{templateId}"
- `shortUrlService`: "isgd"|"tinyurl"
- `notificationType`: "off"|"chrome"|"page"
- Theme and language settings

### Template System
Templates are stored in Chrome sync storage with structure:
```javascript
{
  id: string,
  name: string, 
  icon: string,
  template: string, // Contains {{variable}} placeholders
  createdAt: timestamp
}
```

## URL Processing Logic

The URL cleaning system has three modes implemented in `shared/constants.js`:
- **Smart mode**: Removes only tracking parameters (utm_, fbclid, etc.) while preserving functional parameters
- **Aggressive mode**: Removes all query parameters
- **Off mode**: No parameter removal

Parameter classification uses `PARAM_CATEGORIES.TRACKING` and `PARAM_CATEGORIES.FUNCTIONAL` arrays.

## Build System

The project uses **esbuild** for modern, fast builds:

### Build Configuration (`scripts/esbuild.config.js`)
- **Entry Points**: All main JS files (background, popup, options, batch, content, offscreen)
- **Output**: ES modules targeting Chrome 96+
- **Development Mode**: 
  - Inline source maps for debugging
  - File watching with auto-rebuild
  - Extension name suffixed with " - Dev"
  - HTML/CSS/asset file watching
- **Production Mode**:
  - Code minification and tree shaking
  - Build analysis with metafile generation
  - Package size reporting

### Static Asset Handling
The build system automatically copies:
- HTML files (popup, options, batch, offscreen)
- CSS files (all module CSS + shared CSS)
- Third-party libraries (`shared/lib/`)
- Assets directory (icons, images)
- Localization files (`_locales/`)
- Manifest.json (with dev suffix in dev mode)

## Internationalization

Uses Chrome i18n API with `_locales/{lang}/messages.json`. Default locale is `zh_CN`. Language switching updates all UI elements dynamically and persists user preference.

## Extension Permissions and APIs

Key permissions in manifest.json:
- `activeTab`, `tabs` - Access current page info
- `storage` - User settings and cache
- `offscreen` - Clipboard operations
- `clipboardWrite` - Direct clipboard access
- `contextMenus` - Right-click menu
- `notifications` - Success feedback
- `scripting` - Content script injection

Host permissions for external services:
- `https://is.gd/*` - is.gd URL shortening service
- `https://tinyurl.com/*` - TinyURL shortening service

## Development Notes

### Debugging
- Background script logs appear in extension service worker console
- Popup logs in extension popup dev tools  
- Enable "Developer mode" in chrome://extensions/ for live reload

### Manifest V3 Considerations
- Uses Service Worker instead of background page
- Offscreen Documents API for clipboard access (replaces content scripts)
- All async operations properly handled with error boundaries
