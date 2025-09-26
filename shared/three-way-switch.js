/**
 * 通用三段式开关组件
 * 统一管理三段式开关逻辑，避免重复实现
 */

/**
 * 初始化三段式开关
 * @param {HTMLElement} switchElement - 开关容器元素
 * @param {Array} options - 选项配置数组，格式：[{value: 'option1', key: 'messageKey'}, ...]
 * @param {Function} onChange - 值改变回调函数
 * @returns {Object} 返回包含 updateSliderPosition 方法的对象
 */
export function initializeThreeWaySwitch(switchElement, options, onChange) {
  if (!switchElement) return;

  const switchOptions = switchElement.querySelectorAll(".switch-option");

  // 计算滑块的自适应位置和宽度
  function updateSliderPosition() {
    const currentValue = switchElement.getAttribute("data-value");
    const currentIndex = options.findIndex(
      (opt) => opt.value === currentValue,
    );

    if (currentIndex === -1) return;

    // 清除所有active状态
    switchOptions.forEach((option) => option.classList.remove("active"));

    // 设置当前选项为active
    if (switchOptions[currentIndex]) {
      switchOptions[currentIndex].classList.add("active");
    }

    // 修复滑块位置计算 - 解决超出容器问题
    const optionElement = switchOptions[currentIndex];
    const optionWidth = optionElement.offsetWidth;
    const optionLeft = optionElement.offsetLeft;

    // 获取容器的padding值
    const containerStyle = getComputedStyle(switchElement);
    const containerPadding = parseFloat(containerStyle.paddingLeft);

    // 关键修复：translateX需要减去容器padding，因为滑块已经有left: 2px的基础定位
    const sliderTranslateX = optionLeft - containerPadding;

    // 更新CSS变量来控制滑块
    switchElement.style.setProperty("--slider-width", `${optionWidth}px`);
    switchElement.style.setProperty("--slider-x", `${sliderTranslateX}px`);
  }

  // 为每个选项添加点击事件
  switchOptions.forEach((option, index) => {
    option.addEventListener("click", () => {
      const newValue = options[index].value;
      switchElement.setAttribute("data-value", newValue);
      updateSliderPosition();

      if (onChange) {
        onChange(newValue, options[index]);
      }
    });
  });

  // 初始化位置
  updateSliderPosition();

  // 窗口大小变化时重新计算
  const resizeHandler = () => updateSliderPosition();
  window.addEventListener("resize", resizeHandler);

  // 返回控制方法和清理函数
  return {
    updateSliderPosition,
    destroy: () => {
      window.removeEventListener("resize", resizeHandler);
    }
  };
}

/**
 * 创建URL清理开关的配置
 * @returns {Array} URL清理选项配置
 */
export function getUrlCleaningOptions() {
  return [
    { value: "off", key: "cleaningDisabled" },
    { value: "smart", key: "smartCleaningEnabled" },
    { value: "aggressive", key: "aggressiveCleaningEnabled" },
  ];
}

/**
 * 为开关元素设置初始值
 * @param {HTMLElement} switchElement - 开关容器元素
 * @param {string} value - 初始值
 */
export function setThreeWaySwitchValue(switchElement, value) {
  if (!switchElement) return;
  switchElement.setAttribute("data-value", value);
}
