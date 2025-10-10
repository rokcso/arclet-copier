const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

// 获取构建模式
const isDev = process.argv.includes("--watch");
const isProduction = !isDev;

// 读取 manifest 版本号
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"),
);
const version = manifest.version;

// 构建输出目录
const outdir = isDev
  ? path.join(__dirname, "..", "dist-dev")
  : path.join(__dirname, "dist", `arclet-copier-v${version}`);

console.log(`🚀 Building Arclet Copier v${version}...`);
console.log(`📦 Mode: ${isDev ? "Development" : "Production"}`);
console.log(`📁 Output: ${outdir}\n`);

// 清理输出目录
if (fs.existsSync(outdir)) {
  fs.rmSync(outdir, { recursive: true, force: true });
}

// 创建输出目录
fs.mkdirSync(outdir, { recursive: true });

// 自定义资源复制函数
function copyDirectory(src, dest) {
  // 创建目标目录
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // 读取源目录
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // 递归复制子目录
      copyDirectory(srcPath, destPath);
    } else {
      // 复制文件
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  // 确保目标目录存在
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

// esbuild 配置
const buildOptions = {
  // 入口文件 - 所有 JavaScript 文件
  entryPoints: [
    "background/background.js",
    "popup/popup.js",
    "options/options.js",
    "batch/batch.js",
    "content/content.js",
    "offscreen/offscreen.js",
  ],

  // 输出配置
  bundle: true, // 打包依赖
  outdir: outdir, // 输出目录
  format: "esm", // ES Module 格式
  platform: "browser", // 浏览器平台
  target: "chrome96", // Chrome 96+ (Manifest V3 要求)

  // 代码优化
  minify: isProduction, // 生产环境压缩
  sourcemap: isDev ? "inline" : false, // 开发环境 source map
  treeShaking: true, // Tree shaking

  // 保留原始文件名
  entryNames: "[dir]/[name]",
  assetNames: "[dir]/[name]",
  chunkNames: "[name]-[hash]",

  // 外部依赖（Chrome API 不需要打包）
  external: [],

  // 代码分割配置
  splitting: false, // Chrome 扩展不需要代码分割

  // 元信息
  metafile: isProduction, // 生产环境生成元信息用于分析

  // 插件配置
  plugins: [
    // 自定义资源复制插件
    {
      name: "copy-assets",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            return; // 如果有错误，跳过复制
          }

          try {
            console.log("📦 Copying static assets...");

            const rootDir = path.join(__dirname, "..");

            // 复制 HTML 文件
            copyFile(
              path.join(rootDir, "popup/popup.html"),
              path.join(outdir, "popup/popup.html"),
            );
            copyFile(
              path.join(rootDir, "options/options.html"),
              path.join(outdir, "options/options.html"),
            );
            copyFile(
              path.join(rootDir, "batch/batch.html"),
              path.join(outdir, "batch/batch.html"),
            );
            copyFile(
              path.join(rootDir, "offscreen/offscreen.html"),
              path.join(outdir, "offscreen/offscreen.html"),
            );

            // 复制 CSS 文件
            copyFile(
              path.join(rootDir, "popup/popup.css"),
              path.join(outdir, "popup/popup.css"),
            );
            copyFile(
              path.join(rootDir, "options/options.css"),
              path.join(outdir, "options/options.css"),
            );
            copyFile(
              path.join(rootDir, "batch/batch.css"),
              path.join(outdir, "batch/batch.css"),
            );

            // 复制 shared CSS 文件
            const sharedCssFiles = fs
              .readdirSync(path.join(rootDir, "shared"))
              .filter((file) => file.endsWith(".css"));
            sharedCssFiles.forEach((file) => {
              copyFile(
                path.join(rootDir, "shared", file),
                path.join(outdir, "shared", file),
              );
            });

            // 复制第三方库
            const libDir = path.join(rootDir, "shared/lib");
            if (fs.existsSync(libDir)) {
              copyDirectory(libDir, path.join(outdir, "shared/lib"));
            }

            // 复制资源目录
            copyDirectory(
              path.join(rootDir, "assets"),
              path.join(outdir, "assets"),
            );

            // 复制多语言文件
            copyDirectory(
              path.join(rootDir, "_locales"),
              path.join(outdir, "_locales"),
            );

            // 复制 manifest.json
            copyFile(
              path.join(rootDir, "manifest.json"),
              path.join(outdir, "manifest.json"),
            );

            console.log("✅ Static assets copied successfully!");
          } catch (error) {
            console.error("❌ Failed to copy assets:", error);
            result.errors.push({
              text: `Asset copy failed: ${error.message}`,
            });
          }
        });
      },
    },

    // 构建信息插件
    {
      name: "build-info",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            console.error("\n❌ Build failed with errors:");
            result.errors.forEach((error) => {
              console.error(error);
            });
            return;
          }

          if (result.warnings.length > 0) {
            console.warn("\n⚠️  Build warnings:");
            result.warnings.forEach((warning) => {
              console.warn(warning);
            });
          }

          console.log("\n✅ Build completed successfully!");

          // 生产环境显示构建分析
          if (isProduction && result.metafile) {
            const outputs = Object.keys(result.metafile.outputs);
            let totalSize = 0;

            console.log("\n📊 Build Analysis:");
            outputs.forEach((output) => {
              const size = result.metafile.outputs[output].bytes;
              totalSize += size;
              const fileName = path.relative(outdir, output);
              const sizeKB = (size / 1024).toFixed(2);
              console.log(`   ${fileName}: ${sizeKB} KB`);
            });

            const totalKB = (totalSize / 1024).toFixed(2);
            const totalMB = (totalSize / 1024 / 1024).toFixed(2);
            console.log(`\n   Total JS: ${totalKB} KB (${totalMB} MB)`);

            // 计算整个输出目录大小
            function getDirectorySize(dir) {
              let size = 0;
              const files = fs.readdirSync(dir, { withFileTypes: true });
              files.forEach((file) => {
                const filePath = path.join(dir, file.name);
                if (file.isDirectory()) {
                  size += getDirectorySize(filePath);
                } else {
                  size += fs.statSync(filePath).size;
                }
              });
              return size;
            }

            const totalDirSize = getDirectorySize(outdir);
            const totalDirKB = (totalDirSize / 1024).toFixed(2);
            const totalDirMB = (totalDirSize / 1024 / 1024).toFixed(2);
            console.log(
              `   Total Package: ${totalDirKB} KB (${totalDirMB} MB)`,
            );

            // 保存元信息到文件（用于后续分析）
            const metafilePath = path.join(outdir, "meta.json");
            fs.writeFileSync(
              metafilePath,
              JSON.stringify(result.metafile, null, 2),
            );
            console.log(`\n📄 Metafile saved to: ${metafilePath}`);
          }

          console.log(`\n📁 Output directory: ${outdir}`);

          if (isProduction) {
            console.log("\n📋 Installation Steps:");
            console.log("1. Open Chrome and navigate to chrome://extensions/");
            console.log('2. Enable "Developer mode" (top right)');
            console.log('3. Click "Load unpacked extension"');
            console.log(`4. Select directory: ${outdir}`);
          } else {
            console.log("\n🔄 Watching for changes...");
          }
        });
      },
    },
  ],

  // 日志级别
  logLevel: "info",
};

// 开发模式 - Watch
if (isDev) {
  console.log("👀 Watch mode enabled - waiting for changes...\n");

  esbuild
    .context(buildOptions)
    .then((ctx) => {
      ctx.watch();
      console.log("✅ Initial build complete!");
    })
    .catch((error) => {
      console.error("❌ Watch failed:", error);
      process.exit(1);
    });
} else {
  // 生产模式 - 单次构建
  esbuild.build(buildOptions).catch((error) => {
    console.error("❌ Build failed:", error);
    process.exit(1);
  });
}
