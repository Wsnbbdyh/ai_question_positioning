# AI 对话问题收集器

一个 Chrome 扩展程序，在 AI 对话页面（如 Gemini、ChatGPT、Claude 等）右侧显示所有问题列表，点击可定位到对应消息。

## 功能特点

- 📝 自动提取对话中的所有消息并显示在侧边栏
- 🖱️ 点击问题即可跳转到对应消息位置
- ✨ 自动高亮显示目标消息
- 🔄 实时监听对话变化，自动更新问题列表
- 🎨 美观的深色侧边栏界面
- 📊 显示问题总数统计

## 支持平台

- Google Gemini (gemini.google.com)
- OpenAI ChatGPT (chat.openai.com / chatgpt.com)
- Anthropic Claude (claude.ai)
- Character.AI (character.ai)
- Microsoft Copilot (copilot.microsoft.com)
- 腾讯元宝 (yuanbao.tencent.com)

## 安装方法

### 方式一：从源码安装

1. 克隆或下载本仓库到本地目录

2. 打开 Chrome 浏览器，访问 `chrome://extensions/`

3. 开启右上角的「开发者模式」

4. 点击「加载已解压的扩展程序」

5. 选择本仓库的文件夹路径

6. 刷新你的 AI 对话页面即可使用

### 方式二：打包安装

1. 在 `chrome://extensions/` 页面点击「打包扩展程序」

2. 选择本仓库文件夹

3. 生成 `.crx` 文件后拖入 Chrome 即可安装

## 使用方法

1. 安装插件后，访问任意支持的 AI 对话网站

2. 页面右侧会自动出现「问题列表」侧边栏

3. 侧边栏会显示当前对话中的所有消息

4. 点击任意问题，页面会自动滚动到该消息并高亮显示

5. 如需关闭侧边栏，点击底部的「关闭侧边栏」按钮

## 自定义配置

如需针对特定页面调整消息选择器，可以编辑 `contentScript.js` 中的 `CONFIG.PLATFORM_SELECTORS` 部分：

```javascript
PLATFORM_SELECTORS: {
  'your-website.com': [
    'your-message-selector',
    'another-selector'
  ]
}
```

## 开发者调试

在浏览器控制台可以访问插件的调试接口：

```javascript
// 刷新问题列表
window.AIQuestionSidebar.refresh();

// 获取当前平台
window.AIQuestionSidebar.getPlatform();
```

## 文件结构

```
ai-question-sidebar/
├── manifest.json       # 扩展程序配置文件
├── contentScript.js    # 主要逻辑脚本
├── README.md           # 使用说明
└── icons/              # 插件图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 常见问题

**Q: 为什么侧边栏没有显示？**

A: 请确保页面已完全加载，可尝试刷新页面。如果仍不显示，可能是该网站不在支持列表中。

**Q: 如何卸载插件？**

A: 在 Chrome 扩展管理页面 (`chrome://extensions/`) 找到本插件，点击「移除」即可。

## License

MIT License
