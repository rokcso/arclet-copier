import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// For ES modules, we need to define __dirname manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取构建模式
const isDev = process.argv.includes("--watch");
const isProduction = !isDev;

// 读取 manifest 版本号
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"),
);
const version = manifest.version;

// 构建输出目录
const outdir = isDev
  ? path.join(__dirname, "dist-dev")
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
// 构建验证函数
function validateBuild(outdir, manifest) {
  const errors = [];

  // 验证 background script
  if (manifest.background?.service_worker) {
    const backgroundPath = path.join(
      outdir,
      manifest.background.service_worker,
    );
    if (!fs.existsSync(backgroundPath)) {
      errors.push(
        `Background script not found: ${manifest.background.service_worker}`,
      );
    }
  }

  // 验证 content scripts
  if (manifest.content_scripts) {
    manifest.content_scripts.forEach((contentScript, index) => {
      contentScript.js?.forEach((jsFile) => {
        const jsPath = path.join(outdir, jsFile);
        if (!fs.existsSync(jsPath)) {
          errors.push(`Content script ${index} not found: ${jsFile}`);
        }
      });
    });
  }

  // 验证 options page
  if (manifest.options_page) {
    const optionsPath = path.join(outdir, manifest.options_page);
    if (!fs.existsSync(optionsPath)) {
      errors.push(`Options page not found: ${manifest.options_page}`);
    }
  }

  // 验证 popup
  if (manifest.action?.default_popup) {
    const popupPath = path.join(outdir, manifest.action.default_popup);
    if (!fs.existsSync(popupPath)) {
      errors.push(`Popup page not found: ${manifest.action.default_popup}`);
    }
  }

  // 验证 assets
  if (manifest.action?.default_icon) {
    Object.values(manifest.action.default_icon).forEach((icon) => {
      const iconPath = path.join(outdir, icon);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Action icon not found: ${icon}`);
      }
    });
  }

  if (manifest.icons) {
    Object.values(manifest.icons).forEach((icon) => {
      const iconPath = path.join(outdir, icon);
      if (!fs.existsSync(iconPath)) {
        errors.push(`Extension icon not found: ${icon}`);
      }
    });
  }

  // 验证 HTML 文件中的资源引用
  const htmlFiles = findFiles(outdir, ".html");
  htmlFiles.forEach((htmlFile) => {
    const content = fs.readFileSync(htmlFile, "utf8");
    const relativePath = path.relative(outdir, htmlFile);
    const htmlDir = path.dirname(htmlFile);

    // 检查 CSS 引用
    const cssMatches = content.match(/href=["']([^"']+\.css)["']/g);
    if (cssMatches) {
      cssMatches.forEach((match) => {
        const cssPath = match.match(/href=["']([^"']+\.css)["']/)[1];
        const resolvedPath = path.resolve(htmlDir, cssPath);
        if (!fs.existsSync(resolvedPath)) {
          errors.push(`CSS file not found in ${relativePath}: ${cssPath}`);
        }
      });
    }

    // 检查 JS 引用
    const jsMatches = content.match(/src=["']([^"']+\.js)["']/g);
    if (jsMatches) {
      jsMatches.forEach((match) => {
        const jsPath = match.match(/src=["']([^"']+\.js)["']/)[1];
        const resolvedPath = path.resolve(htmlDir, jsPath);
        if (!fs.existsSync(resolvedPath)) {
          errors.push(`JS file not found in ${relativePath}: ${jsPath}`);
        }
      });
    }

    // 检查图片引用
    const imgMatches = content.match(
      /src=["']([^"']+\.(png|jpg|jpeg|svg|ico))["']/g,
    );
    if (imgMatches) {
      imgMatches.forEach((match) => {
        const imgPath = match.match(
          /src=["']([^"']+\.(png|jpg|jpeg|svg|ico))["']/,
        )[1];
        const resolvedPath = path.resolve(htmlDir, imgPath);
        if (!fs.existsSync(resolvedPath)) {
          errors.push(`Image file not found in ${relativePath}: ${imgPath}`);
        }
      });
    }
  });

  if (errors.length > 0) {
    console.error("\n❌ Build validation failed:");
    errors.forEach((error) => console.error(`   • ${error}`));
    throw new Error(`Build validation failed with ${errors.length} errors`);
  } else {
    console.log("✅ Build validation passed!");
  }
}

// 查找指定扩展名的文件
function findFiles(dir, ext) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

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
  // 入口文件 - 所有 JavaScript 和 CSS 文件
  entryPoints: [
    "src/background/background.js",
    "src/pages/popup/popup.js",
    "src/pages/options/options.js",
    "src/pages/batch/batch.js",
    "src/content/content.js",
    "src/offscreen/offscreen.js",
    // CSS 文件
    "src/styles/pages/popup.css",
    "src/styles/pages/options.css",
    "src/styles/pages/batch.css",
    // shared 目录下的 JS 文件
    "src/shared/analytics.js",
    "src/shared/binary-toggle.js",
    "src/shared/cache-helper.js",
    "src/shared/constants.js",
    "src/shared/notification-helper.js",
    "src/shared/settings-manager.js",
    "src/shared/short-url-cache.js",
    "src/shared/three-way-switch.js",
    "src/shared/toast.js",
    "src/shared/toggles.js",
    "src/shared/umami-core.js",
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
    // CSS 文件路径重定向插件
    {
      name: "css-path-redirect",
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, (args) => {
          if (args.kind === "entry-point") {
            // 修改 CSS 文件的输出路径
            const fileName = path.basename(args.path, ".css");
            const pageName = path.basename(path.dirname(args.path));

            return {
              path: args.path,
              namespace: "css-redirect",
              pluginData: {
                originalPath: args.path,
                outputPath: `pages/${pageName}/${fileName}.css`,
              },
            };
          }
        });

        build.onLoad(
          { filter: /.*/, namespace: "css-redirect" },
          async (args) => {
            const contents = await fs.promises.readFile(
              args.pluginData.originalPath,
              "utf8",
            );
            return {
              contents,
              loader: "css",
            };
          },
        );

        build.onEnd((result) => {
          // 修改输出文件路径
          if (result.outputFiles) {
            result.outputFiles.forEach((outputFile) => {
              const originalPath = outputFile.path;
              // 检查是否是需要重定向的 CSS 文件
              if (originalPath.includes("styles/pages/")) {
                const fileName = path.basename(originalPath, ".css");
                const pageName = path.basename(path.dirname(originalPath));
                const newPath = path.join(
                  path.dirname(originalPath),
                  "..",
                  "pages",
                  pageName,
                  `${fileName}.css`,
                );

                // 确保目标目录存在
                const targetDir = path.dirname(newPath);
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }

                // 移动文件
                if (fs.existsSync(originalPath)) {
                  fs.renameSync(originalPath, newPath);
                }
              }
            });
          }
        });
      },
    },
    // 自定义资源复制插件
    {
      name: "copy-assets",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) {
            return; // 如果有错误，跳过复制
          }

          try {
            // 移动 CSS 文件到正确位置
            const outputStylesDir = path.join(outdir, "styles", "pages");
            if (fs.existsSync(outputStylesDir)) {
              const cssFiles = fs
                .readdirSync(outputStylesDir)
                .filter((file) => file.endsWith(".css"));
              cssFiles.forEach((cssFile) => {
                const pageName = path.basename(cssFile, ".css");
                const sourcePath = path.join(outputStylesDir, cssFile);
                const targetDir = path.join(outdir, "pages", pageName);
                const targetPath = path.join(targetDir, cssFile);

                // 确保目标目录存在
                if (!fs.existsSync(targetDir)) {
                  fs.mkdirSync(targetDir, { recursive: true });
                }

                // 移动文件
                if (fs.existsSync(sourcePath)) {
                  fs.renameSync(sourcePath, targetPath);
                }
              });

              // 删除空的 styles 目录
              try {
                fs.rmSync(path.join(outdir, "styles"), {
                  recursive: true,
                  force: true,
                });
              } catch {
                // 忽略删除错误
              }
            }
            console.log("📦 Copying static assets...");

            const rootDir = __dirname;

            // 复制 HTML 文件到正确的目录结构
            copyFile(
              path.join(rootDir, "src/pages/popup/popup.html"),
              path.join(outdir, "pages/popup/popup.html"),
            );
            copyFile(
              path.join(rootDir, "src/pages/options/options.html"),
              path.join(outdir, "pages/options/options.html"),
            );
            copyFile(
              path.join(rootDir, "src/pages/batch/batch.html"),
              path.join(outdir, "pages/batch/batch.html"),
            );
            copyFile(
              path.join(rootDir, "src/offscreen/offscreen.html"),
              path.join(outdir, "offscreen/offscreen.html"),
            );

            // CSS 文件现在由 esbuild 处理，不需要手动复制

            // 复制 shared 目录 - 只复制 CSS 和其他非 JS 文件
            const sharedSrcDir = path.join(rootDir, "src/shared");
            if (fs.existsSync(sharedSrcDir)) {
              const sharedDestDir = path.join(outdir, "shared");
              if (!fs.existsSync(sharedDestDir)) {
                fs.mkdirSync(sharedDestDir, { recursive: true });
              }

              const entries = fs.readdirSync(sharedSrcDir, {
                withFileTypes: true,
              });
              for (const entry of entries) {
                const srcPath = path.join(sharedSrcDir, entry.name);
                const destPath = path.join(sharedDestDir, entry.name);

                if (entry.isDirectory()) {
                  // 递归复制目录
                  copyDirectory(srcPath, destPath);
                } else if (!entry.name.endsWith(".js")) {
                  // 只复制非 JS 文件（JS 文件由 esbuild 处理）
                  fs.copyFileSync(srcPath, destPath);
                }
              }
            }

            // 复制 styles 目录中的组件到 shared
            const stylesDir = path.join(rootDir, "src/styles");
            if (fs.existsSync(stylesDir)) {
              const componentsDir = path.join(stylesDir, "components");
              if (fs.existsSync(componentsDir)) {
                copyDirectory(
                  componentsDir,
                  path.join(outdir, "shared/components"),
                );
              }
              const themesDir = path.join(stylesDir, "themes");
              if (fs.existsSync(themesDir)) {
                copyDirectory(themesDir, path.join(outdir, "shared/themes"));
              }
            }

            // 复制第三方库（非 JS 文件）
            const libDir = path.join(rootDir, "src/shared/lib");
            if (fs.existsSync(libDir)) {
              const libDestDir = path.join(outdir, "shared/lib");
              if (!fs.existsSync(libDestDir)) {
                fs.mkdirSync(libDestDir, { recursive: true });
              }

              const entries = fs.readdirSync(libDir, { withFileTypes: true });
              for (const entry of entries) {
                const srcPath = path.join(libDir, entry.name);
                const destPath = path.join(libDestDir, entry.name);

                if (entry.isDirectory()) {
                  copyDirectory(srcPath, destPath);
                } else if (!entry.name.endsWith(".js")) {
                  // 只复制非 JS 文件
                  fs.copyFileSync(srcPath, destPath);
                }
              }
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

            // 复制 manifest.json（开发模式添加 - Dev 后缀）
            const manifestPath = path.join(rootDir, "manifest.json");
            const manifestContent = JSON.parse(
              fs.readFileSync(manifestPath, "utf8"),
            );

            // 开发模式下修改扩展名称
            if (isDev) {
              manifestContent.name = manifestContent.name + " - Dev";
            }

            fs.writeFileSync(
              path.join(outdir, "manifest.json"),
              JSON.stringify(manifestContent, null, 2),
            );

            // 验证构建后的文件路径完整性
            console.log("🔍 Validating file paths...");
            validateBuild(outdir, manifestContent);

            console.log("✅ Static assets copied successfully!");
          } catch (error) {
            console.debug("❌ Failed to copy assets:", error);
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
            console.debug("\n❌ Build failed with errors:");
            result.errors.forEach((error) => {
              console.debug(error);
            });
            return;
          }

          if (result.warnings.length > 0) {
            console.debug("\n⚠️  Build warnings:");
            result.warnings.forEach((warning) => {
              console.debug(warning);
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
            console.log("\n📦 Create ZIP for distribution:");
            console.log(`   cd ${path.dirname(outdir)}`);
            console.log(
              `   zip -r arclet-copier-v${version}.zip ${path.basename(outdir)}`,
            );
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

      // 监听 HTML 和 CSS 文件变化
      if (fs.watch) {
        const rootDir = __dirname;

        // 需要监听的文件和目录
        const watchPaths = [
          path.join(rootDir, "src"),
          path.join(rootDir, "_locales"),
          path.join(rootDir, "assets"),
          path.join(rootDir, "manifest.json"),
        ];

        // 防抖函数
        let copyTimeout;
        const debouncedCopy = () => {
          clearTimeout(copyTimeout);
          copyTimeout = setTimeout(() => {
            console.log("\n🔄 Files changed, copying assets...");
            try {
              // 复制 HTML 文件到正确的目录结构
              copyFile(
                path.join(rootDir, "src/pages/popup/popup.html"),
                path.join(outdir, "pages/popup/popup.html"),
              );
              copyFile(
                path.join(rootDir, "src/pages/options/options.html"),
                path.join(outdir, "pages/options/options.html"),
              );
              copyFile(
                path.join(rootDir, "src/pages/batch/batch.html"),
                path.join(outdir, "pages/batch/batch.html"),
              );
              copyFile(
                path.join(rootDir, "src/offscreen/offscreen.html"),
                path.join(outdir, "offscreen/offscreen.html"),
              );

              // CSS 文件现在由 esbuild 处理，不需要手动复制

              // 复制 shared 目录 - 只复制 CSS 和其他非 JS 文件
              const sharedSrcDir = path.join(rootDir, "src/shared");
              if (fs.existsSync(sharedSrcDir)) {
                const sharedDestDir = path.join(outdir, "shared");
                if (!fs.existsSync(sharedDestDir)) {
                  fs.mkdirSync(sharedDestDir, { recursive: true });
                }

                const entries = fs.readdirSync(sharedSrcDir, {
                  withFileTypes: true,
                });
                for (const entry of entries) {
                  const srcPath = path.join(sharedSrcDir, entry.name);
                  const destPath = path.join(sharedDestDir, entry.name);

                  if (entry.isDirectory()) {
                    copyDirectory(srcPath, destPath);
                  } else if (!entry.name.endsWith(".js")) {
                    fs.copyFileSync(srcPath, destPath);
                  }
                }
              }

              // 复制 styles 目录中的组件到 shared
              const stylesDir = path.join(rootDir, "src/styles");
              if (fs.existsSync(stylesDir)) {
                const componentsDir = path.join(stylesDir, "components");
                if (fs.existsSync(componentsDir)) {
                  copyDirectory(
                    componentsDir,
                    path.join(outdir, "shared/components"),
                  );
                }
                const themesDir = path.join(stylesDir, "themes");
                if (fs.existsSync(themesDir)) {
                  copyDirectory(themesDir, path.join(outdir, "shared/themes"));
                }
              }

              // 复制第三方库
              const libDir = path.join(rootDir, "src/shared/lib");
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
              const manifestPath = path.join(rootDir, "manifest.json");
              const manifestContent = JSON.parse(
                fs.readFileSync(manifestPath, "utf8"),
              );
              manifestContent.name = manifestContent.name + " - Dev";
              fs.writeFileSync(
                path.join(outdir, "manifest.json"),
                JSON.stringify(manifestContent, null, 2),
              );

              console.log("✅ Assets copied successfully!");
            } catch (error) {
              console.debug("❌ Failed to copy assets:", error);
            }
          }, 100);
        };

        // 监听每个路径
        watchPaths.forEach((watchPath) => {
          if (fs.existsSync(watchPath)) {
            fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
              if (filename) {
                // 只监听 HTML、CSS、JSON 和资源文件
                if (
                  filename.endsWith(".html") ||
                  filename.endsWith(".css") ||
                  filename.endsWith(".json") ||
                  filename.endsWith(".png") ||
                  filename.endsWith(".jpg") ||
                  filename.endsWith(".svg") ||
                  filename.endsWith(".ico")
                ) {
                  console.log(`📝 Changed: ${filename}`);
                  debouncedCopy();
                }
              }
            });
          }
        });

        console.log("👀 Also watching HTML, CSS, and asset files...");
      }
    })
    .catch((error) => {
      console.debug("❌ Watch failed:", error);
      process.exit(1);
    });
} else {
  // 生产模式 - 单次构建
  esbuild.build(buildOptions).catch((error) => {
    console.debug("❌ Build failed:", error);
    process.exit(1);
  });
}
