// 设置界面UI组件

import { CLEANING_OPTIONS, THEME_OPTIONS } from "../shared/constants.js";
import { I18nUtils } from "../shared/utils.js";
import { StorageManager } from "../shared/storage-manager.js";
import { ThemeService } from "../services/theme-service.js";

export class SettingsUI {
  constructor() {
    this.elements = {
      removeParamsToggle: document.getElementById("removeParamsToggle"),
      silentCopyFormat: document.getElementById("silentCopyFormat"),
      appearanceSwitch: document.getElementById("appearanceSwitch"),
      languageSelect: document.getElementById("languageSelect"),
    };
  }

  // 通用三段滑块初始化函数
  initializeThreeWaySwitch(switchElement, options, onChange) {
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

      // 计算滑块位置和宽度
      const optionWidth = switchOptions[currentIndex].offsetWidth;
      const optionLeft = switchOptions[currentIndex].offsetLeft;

      // 更新CSS变量来控制滑块
      switchElement.style.setProperty("--slider-width", `${optionWidth}px`);
      switchElement.style.setProperty("--slider-x", `${optionLeft}px`);
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
    window.addEventListener("resize", updateSliderPosition);

    return { updateSliderPosition };
  }

  // 初始化URL清理选择器
  initializeUrlCleaningSelect(onUrlCleaningChange) {
    return this.initializeThreeWaySwitch(
      this.elements.removeParamsToggle,
      CLEANING_OPTIONS,
      (value, option) => {
        // 显示通知
        if (option.key && window.showArcNotification) {
          window.showArcNotification(I18nUtils.getMessage(option.key));
        }
        if (onUrlCleaningChange) {
          onUrlCleaningChange(value);
        }
      },
    );
  }

  // 初始化外观滑块
  initializeAppearanceSwitch(onAppearanceChange) {
    return this.initializeThreeWaySwitch(
      this.elements.appearanceSwitch,
      THEME_OPTIONS,
      async (value) => {
        ThemeService.applyTheme(value);
        await StorageManager.saveSetting("appearance", value);
        if (window.showArcNotification) {
          window.showArcNotification(
            I18nUtils.getMessage("appearanceChanged") ||
              "Appearance changed successfully!",
          );
        }
        if (onAppearanceChange) {
          onAppearanceChange(value);
        }
      },
    );
  }

  // 处理语言切换
  async handleLanguageChange(onLanguageChange) {
    const newLocale = this.elements.languageSelect.value;
    await StorageManager.saveSetting("language", newLocale);

    if (onLanguageChange) {
      await onLanguageChange(newLocale);
    }

    if (window.showArcNotification) {
      window.showArcNotification(
        I18nUtils.getMessage("languageChangeNotification") ||
          "Language changed successfully!",
      );
    }
  }

  // 处理静默复制格式变化
  async handleSilentCopyFormatChange() {
    await StorageManager.saveSetting(
      "silentCopyFormat",
      this.elements.silentCopyFormat.value,
    );
    if (window.showArcNotification) {
      window.showArcNotification(
        I18nUtils.getMessage("silentCopyFormatChanged"),
      );
    }
  }

  // 加载设置到UI
  async loadSettings() {
    const settings = await StorageManager.getUserSettings();
    console.log("SettingsUI.loadSettings - 加载的设置:", settings);

    // URL清理设置
    if (this.elements.removeParamsToggle) {
      console.log(
        "SettingsUI.loadSettings - 设置URL清理模式:",
        settings.urlCleaning,
      );
      this.elements.removeParamsToggle.setAttribute(
        "data-value",
        settings.urlCleaning,
      );
    }

    // 静默复制格式
    if (this.elements.silentCopyFormat) {
      this.elements.silentCopyFormat.value = settings.silentCopyFormat;
    }

    // 外观设置
    if (this.elements.appearanceSwitch) {
      this.elements.appearanceSwitch.setAttribute(
        "data-value",
        settings.appearance,
      );
    }

    // 语言设置
    if (this.elements.languageSelect) {
      this.elements.languageSelect.value = settings.language;
    }

    return settings;
  }

  // 绑定事件监听器
  bindEventListeners(callbacks = {}) {
    // 静默复制格式变化
    if (this.elements.silentCopyFormat) {
      this.elements.silentCopyFormat.addEventListener("change", () =>
        this.handleSilentCopyFormatChange(),
      );
    }

    // 语言选择变化
    if (this.elements.languageSelect) {
      this.elements.languageSelect.addEventListener("change", () =>
        this.handleLanguageChange(callbacks.onLanguageChange),
      );
    }
  }
}
