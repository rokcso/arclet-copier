# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arclet Copier is a Chrome extension for intelligent URL copying and link management. It supports custom templates, batch operations, short URL generation, QR codes, and multi-language support (9 languages). The project uses Manifest V3 and ES6 modules.

## Build and Development Commands

```bash
# Build the extension for distribution
npm run build
# or
npm run package

# The build output will be in scripts/dist/arclet-copier-v{version}/
```

**No test suite is currently implemented.** The project relies on manual testing as documented in TESTING.md.

## Architecture Overview

### Modular Structure by Function
The codebase uses a functional module architecture where each directory represents a specific capability:

- `background/` - Service Worker handling shortcuts, context menus, and core copy logic
- `popup/` - Main UI interface with copy buttons and settings controls  
- `offscreen/` - Clipboard operations using Offscreen Documents API
- `options/` - Advanced settings page with template management
- `batch/` - Bulk tab copying functionality
- `shared/` - Common utilities, constants, and the template engine

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
- `chromeNotifications`: boolean
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

## Development Notes

### Testing
Manual testing procedures are documented in `TESTING.md` with 100+ test cases covering all features.

### Debugging
- Background script logs appear in extension service worker console
- Popup logs in extension popup dev tools  
- Enable "Developer mode" in chrome://extensions/ for live reload

### Manifest V3 Considerations
- Uses Service Worker instead of background page
- Offscreen Documents API for clipboard access (replaces content scripts)
- All async operations properly handled with error boundaries