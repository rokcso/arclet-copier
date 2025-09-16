// 共享常量定义
// 从 background.js 和 popup.js 中提取的重复常量

// URL参数分类定义
export const PARAM_CATEGORIES = {
  // 跟踪参数 - 可以安全移除
  TRACKING: [
    // UTM 系列
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    // 社交媒体跟踪
    "fbclid",
    "igshid",
    "gclid",
    "msclkid",
    "dclid",
    "wbraid",
    "gbraid",
    // 分析工具
    "ref",
    "referrer",
    "source",
    "campaign",
    "medium",
    // 其他常见跟踪
    "spm",
    "from",
    "share_from",
    "tt_from",
    "tt_medium",
    "share_token",
  ],

  // 功能性参数 - 应该保留
  FUNCTIONAL: [
    "page",
    "p",
    "offset",
    "limit",
    "size",
    "per_page", // 分页
    "sort",
    "order",
    "orderby",
    "direction",
    "sort_by", // 排序
    "q",
    "query",
    "search",
    "keyword",
    "filter",
    "s", // 搜索筛选
    "tab",
    "view",
    "mode",
    "type",
    "category",
    "section", // 界面状态
    "id",
    "uid",
    "token",
    "key",
    "code",
    "lang",
    "locale", // 功能标识
  ],
};

// 扩展配置
export const EXTENSION_CONFIG = {
  get NAME() {
    return chrome.i18n.getMessage("extName") || "Arclet Copier";
  },
  DEFAULT_SETTINGS: {
    urlCleaning: "smart",
    silentCopyFormat: "url",
    appearance: "system",
    language: "zh_CN",
  },
};

// 主题选项
export const THEME_OPTIONS = [
  { value: "system", key: "appearanceSystem" },
  { value: "light", key: "appearanceLight" },
  { value: "dark", key: "appearanceDark" },
];

// URL清理选项
export const CLEANING_OPTIONS = [
  { value: "off", key: "cleaningDisabled" },
  { value: "smart", key: "smartCleaningEnabled" },
  { value: "aggressive", key: "aggressiveCleaningEnabled" },
];

// 受限页面协议
export const RESTRICTED_PROTOCOLS = [
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "moz-extension:",
];
