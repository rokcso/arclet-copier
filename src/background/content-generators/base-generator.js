// Base class for content generators (Strategy Pattern)

/**
 * Base content generator class
 * All concrete generators should extend this class
 */
export class BaseContentGenerator {
  /**
   * Generate content based on tab and settings
   * @returns {Promise<object>} { content, message, format, templateName }
   */
  async generate() {
    throw new Error("generate() must be implemented by subclass");
  }
}
