// Toast通知管理器 - Arc风格，单例模式
class ToastManager {
  constructor() {
    this.container = null;
    this.currentToast = null; // 当前唯一的toast实例
    this.timeoutId = null; // 自动关闭定时器
  }

  // 确保容器存在
  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "arclet-toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  // 显示toast - 单例模式，始终只显示一个toast
  show(message, type = "info", options = {}) {
    const {
      duration = 2000, // 2秒自动消失
      title = null,
      closable = false, // Arc风格默认不显示关闭按钮
    } = options;

    // 清除现有的自动关闭定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const container = this.ensureContainer();

    // 如果已有toast，更新其内容和样式
    if (this.currentToast && this.currentToast.parentNode) {
      this.updateToast(this.currentToast, message, type);
    } else {
      // 创建新的toast
      this.currentToast = this.createToast(
        message,
        type,
        title,
        closable,
        duration,
      );
      container.appendChild(this.currentToast);

      // 入场动画
      requestAnimationFrame(() => {
        this.currentToast.classList.add("show");
      });
    }

    // 自动关闭
    if (duration > 0) {
      this.timeoutId = setTimeout(() => {
        this.closeToast(this.currentToast);
      }, duration);
    }

    return this.currentToast.id;
  }

  // 更新现有toast的内容和样式
  updateToast(toast, message, type) {
    // 移除所有类型样式
    toast.className = toast.className.replace(/toast-\w+/g, "").trim();

    // 添加新的类型样式
    toast.classList.add(`toast-${type}`);

    // 更新消息内容
    const messageElement = toast.querySelector(".toast-message");
    if (messageElement) {
      messageElement.textContent = message;
    }

    // 重新触发动画效果
    toast.classList.remove("show");
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
  }

  // 创建toast元素
  createToast(message, __, ___, ____, duration) {
    const toast = document.createElement("div");
    const id =
      "toast-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    toast.id = id;
    toast.className = `toast toast-${this.type}`;

    // Arc风格不需要这些变量

    // Arc风格只显示简单的消息内容，不需要图标、标题和关闭按钮
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-text">
          <div class="toast-message">${this.escapeHtml(message)}</div>
        </div>
      </div>
    `;

    return toast;
  }

  // 关闭toast
  closeToast(toast) {
    if (!toast || !toast.parentNode) {
      return;
    }

    // 清除定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    toast.classList.add("hiding");

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);

        // 清空当前toast引用
        if (this.currentToast === toast) {
          this.currentToast = null;
        }

        // 如果没有toast了，移除容器
        if (!this.currentToast && this.container) {
          this.container.remove();
          this.container = null;
        }
      }
    }, 300); // 与CSS动画时间匹配
  }

  // 清空所有toast
  clear() {
    // 清除定时器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 关闭当前toast
    if (this.currentToast && this.currentToast.parentNode) {
      this.closeToast(this.currentToast);
    }
  }

  // Arc风格不需要图标，保留此函数以保持兼容性
  getTypeIcon() {
    return "";
  }

  // HTML转义
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 便捷方法
  success(message, options) {
    return this.show(message, "success", options);
  }

  error(message, options) {
    return this.show(message, "error", options);
  }

  warning(message, options) {
    return this.show(message, "warning", options);
  }

  info(message, options) {
    return this.show(message, "info", options);
  }
}

// 创建全局实例
const toast = new ToastManager();

export default toast;
