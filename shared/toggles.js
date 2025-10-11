/**
 * 统一的Toggle组件导出文件
 * 整合所有toggle组件的功能，提供统一的API接口
 */

// 导入所有toggle组件
export {
  initializeThreeWaySwitch,
  getUrlCleaningOptions,
  setThreeWaySwitchValue,
} from "./three-way-switch.js";

export {
  initializeBinaryToggle,
  createBinaryToggleHTML,
  initializeMultipleBinaryToggles,
} from "./binary-toggle.js";

/**
 * 统一的toggle组件初始化器
 * 根据元素类型自动选择合适的初始化函数
 * @param {string|HTMLElement} element - 元素或选择器
 * @param {Object} options - 配置选项
 * @returns {Object|null} 返回对应的控制对象
 */
export function initializeToggle(element, options = {}) {
  const el = typeof element === 'string'
    ? document.querySelector(element)
    : element;

  if (!el) {
    console.debug(`Toggle element not found: ${element}`);
    return null;
  }

  // 根据元素类名判断toggle类型
  if (el.classList.contains('three-way-switch')) {
    const { threeWayOptions = [], onChange } = options;
    return initializeThreeWaySwitch(el, threeWayOptions, onChange);
  }
  else if (el.type === 'checkbox' || el.classList.contains('toggle-checkbox')) {
    return initializeBinaryToggle(el, options);
  }
  else {
    console.debug(`Unknown toggle type for element:`, el);
    return null;
  }
}

/**
 * 批量初始化页面中的所有toggle组件
 * @param {Object} config - 配置对象
 * @param {Array} config.binaryToggles - 二元开关配置数组
 * @param {Array} config.threeWayToggles - 三段式开关配置数组
 * @param {Object} config.globalOptions - 全局配置选项
 * @returns {Object} 返回所有toggle的控制对象
 */
export function initializeAllToggles(config = {}) {
  const {
    binaryToggles = [],
    threeWayToggles = [],
    globalOptions = {}
  } = config;

  const toggles = {
    binary: {},
    threeWay: {}
  };

  // 初始化二元开关
  binaryToggles.forEach(toggleConfig => {
    const { id, ...options } = toggleConfig;
    const mergedOptions = { ...globalOptions, ...options };

    const toggle = initializeBinaryToggle(id, mergedOptions);
    if (toggle) {
      toggles.binary[id] = toggle;
    }
  });

  // 初始化三段式开关
  threeWayToggles.forEach(toggleConfig => {
    const { id, options: threeWayOptions, onChange, ...restOptions } = toggleConfig;
    const element = document.getElementById(id);

    if (element) {
      const toggle = initializeThreeWaySwitch(element, threeWayOptions, onChange);
      if (toggle) {
        toggles.threeWay[id] = toggle;
      }
    }
  });

  return {
    ...toggles,

    /**
     * 获取所有toggle的状态
     * @returns {Object} 状态对象
     */
    getAllValues() {
      const values = {};

      // 二元开关状态
      Object.keys(toggles.binary).forEach(id => {
        values[id] = toggles.binary[id].getValue();
      });

      // 三段式开关状态
      Object.keys(toggles.threeWay).forEach(id => {
        values[id] = toggles.threeWay[id].getValue();
      });

      return values;
    },

    /**
     * 设置多个toggle的状态
     * @param {Object} values - 状态对象
     * @param {boolean} triggerChange - 是否触发change事件
     */
    setValues(values, triggerChange = false) {
      Object.keys(values).forEach(id => {
        if (toggles.binary[id]) {
          toggles.binary[id].setValue(values[id], triggerChange);
        } else if (toggles.threeWay[id]) {
          toggles.threeWay[id].setValue(values[id], triggerChange);
        }
      });
    },

    /**
     * 销毁所有toggle
     */
    destroyAll() {
      Object.values(toggles.binary).forEach(toggle => toggle.destroy());
      Object.values(toggles.threeWay).forEach(toggle => toggle.destroy());
    },

    /**
     * 获取特定toggle的控制对象
     * @param {string} id - toggle ID
     * @returns {Object|null} 控制对象
     */
    getToggle(id) {
      return toggles.binary[id] || toggles.threeWay[id] || null;
    }
  };
}
