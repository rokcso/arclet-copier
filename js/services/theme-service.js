// 主题管理服务

export class ThemeService {
  // 检测系统主题
  static detectSystemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  // 应用主题
  static applyTheme(theme) {
    const htmlElement = document.documentElement;

    if (theme === "system") {
      htmlElement.removeAttribute("data-theme");
    } else {
      htmlElement.setAttribute("data-theme", theme);
    }
  }

  // 监听系统主题变化
  static setupSystemThemeListener(callback) {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", callback);
      return mediaQuery;
    }
    return null;
  }

  // 获取当前有效主题（解析system主题）
  static getCurrentEffectiveTheme(savedTheme) {
    if (savedTheme === "system") {
      return this.detectSystemTheme();
    }
    return savedTheme;
  }
}
