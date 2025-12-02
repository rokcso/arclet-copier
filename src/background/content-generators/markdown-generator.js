// Markdown content generator

import { getLocalMessage } from "../../shared/ui/i18n.js";
import { createMarkdownLink } from "../../shared/formatters.js";
import { BaseContentGenerator } from "./base-generator.js";

/**
 * Generator for Markdown link format
 */
export class MarkdownContentGenerator extends BaseContentGenerator {
  async generate(formatInfo, tab, settings, helpers) {
    const title = await helpers.getPageTitle(tab.id, tab.url, tab);
    const content = await createMarkdownLink(
      tab.url,
      title,
      settings.urlCleaning,
    );

    return {
      content,
      message: getLocalMessage("markdownCopied"),
      format: "markdown",
      templateName: null,
    };
  }
}
