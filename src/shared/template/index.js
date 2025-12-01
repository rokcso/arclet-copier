// Template module exports

export { TEMPLATE_FIELDS } from "./fields.js";
export { TemplateEngine, templateEngine } from "./engine.js";
export {
  getCustomTemplates,
  saveCustomTemplates,
  getAllTemplates,
  generateTemplateId,
  createTemplate,
  TemplateChangeNotifier,
  loadTemplatesIntoSelect,
  validateAndFixSelector,
  findTemplateById,
  processTemplateWithFallback,
} from "./manager.js";
