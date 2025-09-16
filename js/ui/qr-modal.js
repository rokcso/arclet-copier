// 二维码模态框组件

import { ThemeService } from '../services/theme-service.js';

export class QRModal {
  constructor() {
    this.elements = {
      qrModal: document.getElementById("qrModal"),
      qrModalOverlay: document.getElementById("qrModalOverlay"),
      qrModalClose: document.getElementById("qrModalClose"),
      qrCodeContainer: document.getElementById("qrCodeContainer"),
      qrUrlDisplay: document.getElementById("qrUrlDisplay"),
    };

    this.initialize();
  }

  // 初始化事件监听器
  initialize() {
    // 点击关闭按钮
    if (this.elements.qrModalClose) {
      this.elements.qrModalClose.addEventListener("click", () => this.hide());
    }

    // 点击遮罩层关闭
    if (this.elements.qrModalOverlay) {
      this.elements.qrModalOverlay.addEventListener("click", () => this.hide());
    }

    // 按ESC键关闭
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.elements.qrModal.classList.contains("show")) {
        this.hide();
      }
    });
  }

  // 生成二维码
  generateQRCode(url) {
    if (!this.elements.qrCodeContainer) return;

    // 清空容器
    this.elements.qrCodeContainer.innerHTML = "";

    // 根据当前主题选择二维码颜色
    const isDarkTheme =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (document.documentElement.getAttribute("data-theme") !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    // 创建二维码
    if (typeof QRCode !== 'undefined') {
      new QRCode(this.elements.qrCodeContainer, {
        text: url,
        width: 200,
        height: 200,
        colorDark: isDarkTheme ? "#f1f5f9" : "#000000",
        colorLight: isDarkTheme ? "#1e293b" : "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });
    }

    // 显示URL
    if (this.elements.qrUrlDisplay) {
      this.elements.qrUrlDisplay.textContent = url;
    }
  }

  // 显示模态框
  show(url) {
    this.generateQRCode(url);
    if (this.elements.qrModal) {
      this.elements.qrModal.classList.add("show");
    }
  }

  // 隐藏模态框
  hide() {
    if (this.elements.qrModal) {
      this.elements.qrModal.classList.remove("show");
    }
  }
}
