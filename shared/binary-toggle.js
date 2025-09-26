/**
 * 二元开关组件
 * 统一管理二元开关的创建、初始化和事件处理
 */

/**
 * 创建二元开关HTML结构
 * @param {string} id - 开关的唯一ID
 * @param {boolean} checked - 初始状态
 * @param {string} labelText - 可选的标签文本
 * @returns {string} HTML字符串
 */
export function createBinaryToggleHTML(id, checked = false, labelText = '') {
  const checkedAttr = checked ? 'checked' : '';

  return `
    <input
      type="checkbox"
      id="${id}"
      class="toggle-checkbox"
      ${checkedAttr}
    />
    <label for="${id}" class="toggle-label">
      <span class="toggle-slider"></span>
    </label>
    ${labelText ? `<span class="toggle-text">${labelText}</span>` : ''}
  `;
}

/**
 * 初始化二元开关
 * @param {string|HTMLElement} element - 开关元素或选择器
 * @param {Object} options - 配置选项
 * @param {boolean} options.checked - 初始状态
 * @param {Function} options.onChange - 状态改变回调函数
 * @param {boolean} options.disabled - 是否禁用
 * @returns {Object} 返回包含控制方法的对象
 */
export function initializeBinaryToggle(element, options = {}) {
  const checkbox = typeof element === 'string'
    ? document.getElementById(element)
    : element;

  if (!checkbox) {
    console.warn(`Binary toggle element not found: ${element}`);
    return null;
  }

  const {
    checked = false,
    onChange = null,
    disabled = false
  } = options;

  // 设置初始状态
  if (checked !== undefined) {
    checkbox.checked = checked;
  }

  if (disabled) {
    checkbox.disabled = true;
  }

  // 添加事件监听器
  const handleChange = (event) => {
    if (onChange) {
      onChange(event.target.checked, event);
    }
  };

  checkbox.addEventListener('change', handleChange);

  // 返回控制方法
  return {
    /**
     * 获取当前状态
     * @returns {boolean}
     */
    getValue() {
      return checkbox.checked;
    },

    /**
     * 设置状态
     * @param {boolean} value - 新状态
     * @param {boolean} triggerChange - 是否触发change事件
     */
    setValue(value, triggerChange = false) {
      checkbox.checked = value;
      if (triggerChange && onChange) {
        onChange(value, { target: checkbox, type: 'change' });
      }
    },

    /**
     * 切换状态
     * @param {boolean} triggerChange - 是否触发change事件
     */
    toggle(triggerChange = false) {
      this.setValue(!checkbox.checked, triggerChange);
    },

    /**
     * 启用/禁用开关
     * @param {boolean} disabled - 是否禁用
     */
    setDisabled(disabled) {
      checkbox.disabled = disabled;
    },

    /**
     * 销毁开关，移除事件监听器
     */
    destroy() {
      checkbox.removeEventListener('change', handleChange);
    },

    /**
     * 获取原始DOM元素
     * @returns {HTMLElement}
     */
    getElement() {
      return checkbox;
    }
  };
}

/**
 * 批量初始化多个二元开关
 * @param {Array} toggleConfigs - 开关配置数组
 * @param {Object} globalOptions - 全局配置选项
 * @returns {Object} 返回所有开关的控制对象
 */
export function initializeMultipleBinaryToggles(toggleConfigs, globalOptions = {}) {
  const toggles = {};

  toggleConfigs.forEach(config => {
    const { id, ...options } = config;
    const mergedOptions = { ...globalOptions, ...options };

    const toggle = initializeBinaryToggle(id, mergedOptions);
    if (toggle) {
      toggles[id] = toggle;
    }
  });

  return {
    toggles,

    /**
     * 获取所有开关的状态
     * @returns {Object} 状态对象
     */
    getAllValues() {
      const values = {};
      Object.keys(toggles).forEach(id => {
        values[id] = toggles[id].getValue();
      });
      return values;
    },

    /**
     * 设置多个开关的状态
     * @param {Object} values - 状态对象
     * @param {boolean} triggerChange - 是否触发change事件
     */
    setValues(values, triggerChange = false) {
      Object.keys(values).forEach(id => {
        if (toggles[id]) {
          toggles[id].setValue(values[id], triggerChange);
        }
      });
    },

    /**
     * 销毁所有开关
     */
    destroyAll() {
      Object.values(toggles).forEach(toggle => toggle.destroy());
    }
  };
}
