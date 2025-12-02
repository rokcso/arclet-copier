// URL content generator

import { processUrl } from "../../shared/constants.js";
import { getLocalMessage } from "../../shared/ui/i18n.js";
import { BaseContentGenerator } from "./base-generator.js";

/**
 * Generator for plain URL format
 */
export class UrlContentGenerator extends BaseContentGenerator {
  async generate(formatInfo, tab, settings, helpers) {
    return {
      content: await processUrl(tab.url, settings.urlCleaning),
      message: getLocalMessage("urlCopied"),
      format: "url",
      templateName: null,
    };
  }
}
