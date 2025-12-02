# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arclet Copier is a Chrome extension (Manifest V3) for quickly copying URLs with advanced features like parameter filtering, custom templates, short URL generation, and QR code creation. The extension supports 9 languages and includes a comprehensive theming system.

## Development Commands

### Build & Development
```bash
# Development mode with file watching and auto-rebuild
npm run dev

# Production build (outputs to dist/arclet-copier-v{version}/)
npm run build

# Load the extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked extension"
# 4. Select dist-dev/ (for dev) or dist/arclet-copier-v{version}/ (for production)
```

### Testing
```bash
# Run all tests
npm test

# Watch mode for tests
npm run test:watch

# Generate coverage report
npm run test:coverage

# Open test UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run
```

### Linting
```bash
# Lint all files
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

## Architecture Overview

### Module Structure
The codebase uses **feature-based modular architecture** with ES6 modules:

```
src/
├── background/         # Service Worker (background.js)
├── content/            # Content script injected into web pages
├── offscreen/          # Offscreen document for clipboard operations
├── pages/              # UI pages (popup, options, batch)
│   ├── popup/          # Main extension popup
│   ├── options/        # Settings/options page
│   └── batch/          # Bulk URL copying page
├── shared/             # Shared utilities and modules
│   ├── constants.js    # Core utilities, URL processing, template engine
│   ├── settings-manager.js
│   ├── notification-helper.js
│   ├── short-url-cache.js
│   ├── analytics.js
│   └── lib/            # Third-party libraries
└── styles/             # CSS organized by feature
```

### Key Architectural Patterns

**1. Shared Module System**
- `src/shared/constants.js` is the **core module** containing:
  - URL parameter processing logic (async `processUrl()`)
  - Template engine (`TemplateEngine` class) for custom copy formats
  - Short URL generation with throttling (`ShortUrlThrottle`)
  - Custom parameter rules management
  - Utility functions for URL validation
- `src/shared/formatters.js` - Common formatting functions (Markdown, list items)
- `src/shared/clipboard-helper.js` - Unified clipboard operations with automatic fallback
- `src/shared/ui/i18n.js` - Internationalization helper with `getLocalMessage()`

**2. Strategy Pattern for Content Generation** (Background Service)
- **Factory Pattern**: `ContentGeneratorFactory` creates appropriate generators
- **Base Class**: `BaseContentGenerator` defines the interface
- **Concrete Generators**:
  - `UrlContentGenerator` - Plain URL processing
  - `MarkdownContentGenerator` - Markdown link format
  - `ShortUrlContentGenerator` - Short URL generation
  - `CustomTemplateContentGenerator` - Custom template processing
- Location: `src/background/content-generators/`
- Usage: `ContentGeneratorFactory.generate(formatInfo, tab, settings, helpers)`

**3. Modular Page Architecture** (Batch Page Example)
- **State Manager**: `batch/state-manager.js` - Centralized state with singleton pattern
- **Event Handlers**: `batch/event-handlers.js` - UI event processing logic
- **Format Generators**: `batch/format-generators.js` - Output formatting
- **Tab Filters**: `batch/tab-filters.js` - Tab filtering and search
- **Tab Renderer**: `batch/tab-renderer.js` - DOM rendering
- This pattern separates concerns and improves testability

**4. Message Passing Architecture**
- Background service worker coordinates between pages
- Uses `chrome.runtime.sendMessage()` for cross-component communication
- Template changes broadcast via `TemplateChangeNotifier`

**5. Clipboard Operations**
- **Unified Helper**: `clipboard-helper.js` handles all copy operations
  - Automatic fallback: Clipboard API → execCommand
  - Environment detection (page vs background)
  - Error handling with custom `ClipboardError` types
  - Copy operation manager prevents duplicate operations (300ms debounce)
- **Background Script**: Uses Offscreen Documents API (Manifest V3 requirement)
  - `offscreen/offscreen.js` handles clipboard writes to bypass CSP restrictions
  - Background script manages offscreen document lifecycle with health checks
- **Page Scripts**: Use `copyToClipboard()` from `clipboard-helper.js`

**6. Storage Strategy**
- `chrome.storage.sync` for user settings (syncs across devices)
- `chrome.storage.local` for caches (short URL cache)
- Settings managed through `settings-manager.js` singleton

**7. Custom Template System**
- Template engine supports 11 variables: `{{url}}`, `{{title}}`, `{{shortUrl}}`, `{{date}}`, `{{time}}`, etc.
- Templates stored in `chrome.storage.sync` as `customTemplates` array
- Real-time validation and preview in options page
- Async processing required due to URL cleaning dependency

**8. URL Parameter Management**
- Three cleaning modes: `off`, `smart`, `aggressive`
- Custom parameter rules (tracking vs functional parameters)
- Async `processUrl()` function - **must be awaited** everywhere
- Rules stored in `customParamRules` in sync storage

**9. Short URL Caching**
- Cache keys based on **cleaned URLs** (post-processing)
- `ShortUrlThrottle` class limits concurrent requests (max 3)
- Persistent cache using `chrome.storage.local`
- Cache helper functions in `constants.js`: `getCachedShortUrl()`, `setCachedShortUrl()`, `getOrGenerateShortUrl()`
- Progress callback support for batch operations

## Important Implementation Details

### URL Processing
- **Always use `await processUrl(url, cleaningMode)`** - it's async!
- URL cleaning happens before caching short URLs to ensure consistency
- Three modes affect parameter filtering:
  - `off`: Keep all parameters
  - `smart`: Remove tracking params (utm_*, fbclid, etc.), keep functional params
  - `aggressive`: Remove all parameters

### Template Engine
- Template processing is **async** due to URL cleaning dependency
- Use `templateEngine.processTemplate(template, context)` with await
- Context object should include: `url`, `title`, `urlCleaning`, `shortUrl` (optional)
- Template validation: `templateEngine.validateTemplate(template)`
- Fallback handling via `processTemplateWithFallback()` when templates are deleted

### Short URL Generation
- Validate URLs with `isValidWebUrl()` before generating short URLs
- Use throttled version: `createShortUrl()` for single requests
- Use `getOrGenerateShortUrl()` for automatic cache + generation
- Services: `isgd` (default), `tinyurl`
- Always check cache first to avoid duplicate API calls

### State Management
- Settings loaded via `settingsManager.get()`
- Settings saved via `settingsManager.save(settings)`
- Listen for storage changes with `chrome.storage.onChanged`
- Template changes trigger `TEMPLATE_CHANGED` messages

### Notification System
- Custom toast notifications via `src/shared/toast.js`
- Chrome native notifications via `notificationHelper.show()`
- User can toggle Chrome notifications on/off
- Toast notifications follow theme colors

## Build System (esbuild)

### Build Configuration
- Modern ES6+ modules with `type: "module"` in package.json
- esbuild handles bundling, minification, tree-shaking
- CSS files processed separately and moved to correct page directories
- Source maps generated in development mode only
- Development builds add " - Dev" suffix to extension name

### Build Output
- **Production**: `dist/arclet-copier-v{version}/`
- **Development**: `dist-dev/`
- Build validates all manifest paths and HTML resource references
- Generates `meta.json` for bundle analysis (production only)

### Watch Mode
- Monitors JavaScript files for changes and auto-rebuilds
- Separate file watcher for HTML, CSS, JSON, and assets
- 100ms debounce on asset copying to prevent duplicate operations

## Testing (Vitest)

### Test Structure
- Test files in `src/shared/__tests__/`
- Chrome API mocks in `test/setup.js`
- jsdom environment for DOM testing
- Path aliases: `@` → `src/`, `@shared` → `src/shared/`

### Coverage
- Target: Core utilities (constants, cache, settings)
- Excluded: Third-party libs, minified files, test files
- Reports: text, JSON, HTML formats

## Chrome Extension Specifics

### Permissions Used
- `activeTab`, `tabs`: Access current tab info
- `storage`: Save settings and cache
- `notifications`: Desktop notifications
- `offscreen`: Clipboard operations
- `clipboardWrite`: Direct clipboard access
- `contextMenus`: Right-click menu

### Host Permissions
- `https://is.gd/*`: Short URL service
- `https://tinyurl.com/*`: Alternative short URL service
- `https://umami.coryso.com/*`: Analytics (optional)

### Content Security Policy
- Uses Offscreen Documents to bypass CSP restrictions on web pages
- No inline scripts or eval()
- All resources loaded from extension package

## Common Patterns

### Adding a New Copy Format
1. Create new generator class in `src/background/content-generators/`
   - Extend `BaseContentGenerator`
   - Implement `generate(formatInfo, tab, settings, helpers)` method
2. Register generator in `ContentGeneratorFactory.generators`
3. Add format option to popup/batch UI
4. Update format selector in respective pages
5. Add tests for the new generator

### Adding a New Template Variable
1. Add field definition to `TEMPLATE_FIELDS` in `constants.js`
2. Add processor to `TemplateEngine.initializeFieldProcessors()`
3. Update options page template field selector
4. Add tests for the new field

### Adding a New Setting
1. Add default value to `settings-manager.js`
2. Add UI control in `pages/options/options.html` and `.js`
3. Update storage listeners if needed
4. Test setting persistence and sync

### Modifying URL Cleaning Logic
1. Update `processUrl()` function in `constants.js` (async)
2. Update custom parameter rules UI in options page
3. Clear short URL cache if cleaning affects cache keys
4. Add tests for new edge cases

### Adding a New Page
1. Create HTML, JS, CSS in `src/pages/{page-name}/`
2. Add entry points to `esbuild.config.js` (JS and CSS)
3. Update manifest.json if needed (for special pages)
4. Add copy operations in build script's `copy-assets` plugin

### Refactoring a Page into Modules
Follow the batch page pattern for complex pages:
1. **State Manager**: Create `{page}/state-manager.js` - Singleton class for state
2. **Event Handlers**: Create `{page}/event-handlers.js` - Pure functions for events
3. **Renderers**: Create `{page}/{component}-renderer.js` - DOM manipulation logic
4. **Utilities**: Create `{page}/{feature}-helper.js` - Feature-specific logic
5. Main page file imports and coordinates these modules
6. Benefits: Better testability, separation of concerns, code reusability

## Internationalization (i18n)

- Message files in `_locales/{lang}/messages.json`
- 9 supported languages: zh_CN, en, es, ja, de, fr, pt, ru, ko
- Use `chrome.i18n.getMessage(key)` or helper `getMessage(key)` from constants.js
- HTML: `data-i18n` attributes processed by page scripts

## Debugging Tips

- Development build includes inline source maps
- Use Chrome DevTools:
  - Background: chrome://extensions → "Inspect views: Service Worker"
  - Popup: Right-click popup → "Inspect"
  - Options: Right-click options page → "Inspect"
- Console debug messages tagged with `[ModuleName]` prefixes
- Build validation runs automatically and reports missing files
- Test cache state with `shortUrlCache.getAll()` in console
