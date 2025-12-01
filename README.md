# 🌈 Arclet Copier

**智能URL复制工具** - 一键复制、智能清理、个性格式，让链接分享更高效

## 📋 目录
- [🖼️ 界面预览](#-界面预览)
- [✨ 核心功能](#-核心功能)
- [📦 安装方法](#-安装方法)
- [📖 快速开始](#-快速开始)
- [🔒 权限说明](#-权限说明)
- [🆕 最近更新](#-最近更新)
- [🤝 问题反馈](#-问题反馈)
- [📄 许可证](#-许可证)

## 🖼️ 界面预览

| 界面 | 说明 |
|------|------|
| ![主界面预览](https://raw.githubusercontent.com/rokcso/arclet-copier/refs/heads/main/assets/screenshots/home-1-en.webp) | 主弹窗界面 - 快速复制和格式选择 |
| ![扩展页面预览](https://raw.githubusercontent.com/rokcso/arclet-copier/refs/heads/main/assets/screenshots/home-2-en.webp) | 批量复制功能 - 多标签页批量处理 |
| ![设置页面预览](https://raw.githubusercontent.com/rokcso/arclet-copier/refs/heads/main/assets/screenshots/home-3-en.webp) | 选项设置页面 - 完整配置管理 |
| ![模板系统预览](https://raw.githubusercontent.com/rokcso/arclet-copier/refs/heads/main/assets/screenshots/home-4-en.webp) | 自定义模板 - 个性化复制格式 |

## ✨ 核心功能

- 🎯 **一键复制** - 点击按钮或按 `Ctrl+Shift+C` 立即复制当前页面URL
- 🧹 **智能清理** - 自动移除跟踪参数，保留功能参数，让链接更干净
- 🎨 **自定义模板** - 支持11种变量创建个性化复制格式（Markdown、邮件格式等）
- 📋 **批量处理** - 一次性复制多个标签页，支持预览和去重
- 🔗 **短链生成** - 一键生成短链接，支持缓存避免重复请求
- 📱 **二维码** - 为URL生成二维码，支持复制图片和主题适配
- 🌏 **全球适用** - 支持9种语言，深色主题，多主题色可选

## 安装方法

### 方法一：直接下载安装

1. **下载扩展程序**
   - 点击右侧 [Releases](../../releases) 页面
   - 下载最新版本的 `arclet-copier.zip` 文件
   - 解压到本地文件夹

2. **Chrome 浏览器安装**
   - 打开 Chrome 浏览器
   - 地址栏输入 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择解压后的文件夹

### 方法二：从源码安装

1. **克隆仓库**
   ```bash
   git clone https://github.com/rokcso/arclet-copier.git
   cd arclet-copier
   ```

2. **Chrome 浏览器安装**
   - 打开 Chrome 浏览器
   - 地址栏输入 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

## 📖 快速开始

### 基本使用
1. **点击扩展图标** - 打开复制界面
2. **选择复制格式** - URL、Markdown、短链或自定义模板
3. **一键复制** - 点击按钮或使用快捷键 `Ctrl+Shift+C`

### 快捷键
- **Windows/Linux**: `Ctrl + Shift + C`
- **Mac**: `Cmd + Shift + C`

### 右键菜单
在任意网页右键选择"复制当前 URL"即可快速复制

### 个性设置
- **URL清理**: 自动移除跟踪参数
- **自定义模板**: 创建个性化复制格式
- **批量复制**: 一次处理多个标签页
- **主题外观**: 深色模式、多主题色可选

## 权限说明

此扩展程序需要以下权限：

- `activeTab`：获取当前标签页信息（URL、标题）
- `storage`：保存用户设置
- `notifications`：显示复制成功通知
- `contextMenus`：创建右键菜单项
- `clipboardWrite`：直接写入剪贴板
- `offscreen`：创建后台剪贴板操作文档

所有权限仅用于复制功能，不会收集或上传任何用户数据。

## 🤝 问题反馈

如果遇到问题或有功能建议，请在 [Issues](../../issues) 页面提交反馈。

## 📄 许可证

GPL-3.0 License - 详见 [LICENSE](LICENSE) 文件

## 🆕 最近更新

### v1.6.8
- 🐛 修复快速关闭标签页导致复制错误URL的问题
- ⭐ 使用100次后提示用户评分
- 💖 添加Ko-fi支持按钮
- 🔧 优化权限和右键菜单，提升稳定性

### v1.6.7
- 🧪 引入完整的测试框架，提升代码质量
- ⚡ 优化构建系统，提升开发和部署效率

### v1.6.6
- 🔧 参数配置功能增强，支持更精准的URL参数清理
- ⚡ 界面性能和稳定性提升

## 📈 主要功能演进

**v1.6.0 - 自定义模板系统**
- 支持11种变量字段创建个性化复制格式

**v1.5.0 - 批量复制功能**
- 多标签页批量URL复制，支持预览和筛选

**v1.4.0 - 短链生成**
- 一键生成短链接，支持多种短链服务

**v1.3.0 - 二维码和深色主题**
- URL二维码生成，完整的深色主题支持

**v1.0.0 - 基础功能**
- URL复制、参数过滤、Markdown格式、快捷键
