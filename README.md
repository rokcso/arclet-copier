# 🌈 Arclet Copier

快速复制当前页面 URL 的 Chrome 扩展程序，支持参数过滤和 Markdown 链接格式。

## 功能特色

- 🔗 **一键复制 URL**：支持 popup 点击和快捷键静默复制
- 🔧 **参数过滤**：可选择性移除 URL 参数，获得干净的链接
- 📝 **Markdown 格式**：支持复制为 `[标题](URL)` 格式的 Markdown 链接
- ⚡ **快捷键支持**：`Ctrl+Shift+C` (Windows/Linux) 或 `Cmd+Shift+C` (Mac)
- 🛡️ **智能处理**：针对 Chrome 系统页面优化，提供友好的用户体验

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
   git clone https://github.com/你的用户名/arclet-copier.git
   cd arclet-copier
   ```

2. **Chrome 浏览器安装**
   - 打开 Chrome 浏览器
   - 地址栏输入 `chrome://extensions/`
   - 开启右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目文件夹

## 使用说明

### Popup 界面操作

1. 点击工具栏中的扩展图标
2. 在弹出界面中：
   - **复制 URL**：复制当前页面链接
   - **复制为 Markdown**：复制为 `[页面标题](URL)` 格式
   - **移除参数**：开关控制是否过滤 URL 参数
   - **静默复制格式**：设置快捷键复制的默认格式

### 快捷键操作

- **Windows/Linux**：`Ctrl + Shift + C`
- **Mac**：`Cmd + Shift + C`

快捷键会根据设置中的"静默复制格式"来复制 URL 或 Markdown 链接。

### 特殊页面说明

在 Chrome 系统页面（如 `chrome://extensions/`）使用时：
- **Popup 操作**：正常工作，可以复制链接
- **快捷键操作**：会提示"当前页面为系统页面，请点击扩展图标使用复制功能"

## 开发者信息

### 项目结构

```
arclet-copier/
├── manifest.json          # 扩展程序配置文件
├── background.js          # 后台脚本，处理快捷键和静默复制
├── popup.html            # 弹出界面 HTML
├── popup.js              # 弹出界面逻辑
├── styles.css            # 样式文件
└── icons/                # 扩展程序图标
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon64.png
    ├── icon128.png
    └── icon256.png
```

### 构建和打包

如果你想从源码构建：

```bash
# 克隆项目
git clone https://github.com/你的用户名/arclet-copier.git
cd arclet-copier

# 运行打包脚本
npm run build
```

### 本地开发

1. 修改代码后，在 `chrome://extensions/` 页面点击扩展程序的"重新加载"按钮
2. 测试功能是否正常工作
3. 提交代码变更

## 权限说明

此扩展程序需要以下权限：

- `activeTab`：获取当前标签页信息（URL、标题）
- `storage`：保存用户设置
- `notifications`：显示复制成功通知
- `scripting`：在网页中注入复制脚本

所有权限仅用于复制功能，不会收集或上传任何用户数据。

## 问题反馈

如果遇到问题或有功能建议，请在 [Issues](../../issues) 页面提交反馈。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 更新日志

### v1.0.0
- 基础 URL 复制功能
- 支持参数过滤
- 支持 Markdown 格式复制
- 快捷键支持
- Chrome 系统页面优化
