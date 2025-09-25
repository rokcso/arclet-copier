// 分析模块主入口 - 统一导出所有分析功能

// 从核心模块导出通用方法
export {
  sendEvent,
  sendEventsBatch,
  processEventQueue,
  clearEventQueue,
  getQueueStatus,
} from "./umami-core.js";

// 从事件模块导出具体事件方法
export { trackInstall } from "./analytics-events.js";
