const fs = require("fs");
const path = require("path");

// 获取版本号
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const version = manifest.version;

// 创建 dist 目录
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// 定义需要打包的文件和目录
const filesToInclude = [
  "manifest.json",
  "background.js",
  "popup.html",
  "popup.js",
  "offscreen.html",
  "offscreen.js",
  "qrcode.min.js",
  "style.css",
  "icons/",
  "_locales/",
];

console.log(`🏗️  开始构建 Arclet Copier v${version}...`);

// 创建构建目录
const buildDir = path.join(distDir, `arclet-copier-v${version}`);
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// 复制文件
filesToInclude.forEach((file) => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(buildDir, file);

  if (fs.existsSync(srcPath)) {
    if (fs.statSync(srcPath).isDirectory()) {
      // 复制目录
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.log(`✓ 复制目录: ${file}`);
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ 复制文件: ${file}`);
    }
  } else {
    console.log(`⚠ 文件不存在: ${file}`);
  }
});

console.log(`\n✅ 构建完成!`);
console.log(`📦 构建目录: ${buildDir}`);
console.log(`\n📋 安装步骤:`);
console.log(`1. 打开 Chrome 浏览器`);
console.log(`2. 访问 chrome://extensions/`);
console.log(`3. 开启右上角的 "开发者模式"`);
console.log(`4. 点击 "加载已解压的扩展程序"`);
console.log(`5. 选择文件夹: ${buildDir}`);
console.log(`\n🚀 分享步骤:`);
console.log(`1. 将整个 ${buildDir} 文件夹压缩为 ZIP`);
console.log(`2. 上传到 GitHub Releases 或其他地方`);
console.log(`3. 用户下载解压后按上述步骤安装`);
