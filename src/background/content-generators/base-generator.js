// Base class for content generators (Strategy Pattern)

/**
 * Base content generator class
 * All concrete generators should extend this class
 */
export class BaseContentGenerator {
  /**
   * Generate content based on tab and settings
   * @param {object} formatInfo - Format information { type, templateId }
   * @param {object} tab - Tab object
   * @param {object} settings - User settings
   * @param {object} helpers - Helper functions { getPageTitle, getPageMetadata, handleCreateShortUrl, createMarkdownLink }
   * @returns {Promise<object>} { content, message, format, templateName }
   */
  async generate(formatInfo, tab, settings, helpers) {
    throw new Error("generate() must be implemented by subclass");
  }
}
