// Content generator factory (Strategy Pattern)

import { UrlContentGenerator } from "./url-generator.js";
import { MarkdownContentGenerator } from "./markdown-generator.js";
import { ShortUrlContentGenerator } from "./short-url-generator.js";
import { CustomTemplateContentGenerator } from "./custom-template-generator.js";

/**
 * Factory class for creating content generators based on format type
 */
export class ContentGeneratorFactory {
  static generators = {
    url: new UrlContentGenerator(),
    markdown: new MarkdownContentGenerator(),
    shortUrl: new ShortUrlContentGenerator(),
    custom: new CustomTemplateContentGenerator(),
  };

  /**
   * Get generator for specified format type
   * @param {string} type - Format type (url, markdown, shortUrl, custom)
   * @returns {BaseContentGenerator} Generator instance
   */
  static getGenerator(type) {
    return this.generators[type] || this.generators.url;
  }

  /**
   * Generate content using appropriate generator
   * @param {object} formatInfo - Format information { type, templateId }
   * @param {object} tab - Tab object
   * @param {object} settings - User settings
   * @param {object} helpers - Helper functions
   * @returns {Promise<object>} { content, message, format, templateName }
   */
  static async generate(formatInfo, tab, settings, helpers) {
    const generator = this.getGenerator(formatInfo.type);
    return await generator.generate(formatInfo, tab, settings, helpers);
  }
}
