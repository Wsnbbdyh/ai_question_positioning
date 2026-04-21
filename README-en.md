# AI Question Positioning

A Chrome extension that displays all messages from AI conversations (such as Gemini, ChatGPT, Claude, etc.) in a sidebar on the right side of the page. Click any message to instantly navigate to its location.

## Features

- Automatically extracts and displays all messages from the conversation in the sidebar
- Click-to-navigate: Click any message to jump to its location in the conversation
- Auto-highlight: Target messages are highlighted for easy identification
- Real-time sync: Automatically updates as new messages appear
- Dark sidebar UI: Clean and modern design
- Message count: Shows total number of messages in the conversation

## Supported Platforms

- Google Gemini (gemini.google.com)
- OpenAI ChatGPT (chat.openai.com / chatgpt.com)
- Anthropic Claude (claude.ai)
- Character.AI (character.ai)
- Microsoft Copilot (copilot.microsoft.com)
- Tencent Yuanbao (yuanbao.tencent.com)

## Installation

### Option 1: Load from Source

1. Clone or download this repository to a local directory

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right corner

4. Click "Load unpacked"

5. Select the folder containing this extension

6. Refresh your AI chat page to start using

### Option 2: Packaged Installation

1. On the `chrome://extensions/` page, click "Pack extension"

2. Select this repository folder

3. Drag the generated `.crx` file into Chrome to install

## Usage

1. After installing the extension, visit any supported AI chat website

2. A sidebar with "Message List" will automatically appear on the right side of the page

3. The sidebar displays all messages from the current conversation

4. Click any message in the sidebar, and the page will automatically scroll to and highlight that message

5. To close the sidebar, click the "Close Sidebar" button at the bottom

## Custom Configuration

To customize message selectors for specific pages, edit the `CONFIG.PLATFORM_SELECTORS` section in `contentScript.js`:

```javascript
PLATFORM_SELECTORS: {
  'your-website.com': [
    'your-message-selector',
    'another-selector'
  ]
}
```

## Developer Debugging

Access the extension's debug API via the browser console:

```javascript
// Refresh the message list
window.AIQuestionSidebar.refresh();

// Get current platform
window.AIQuestionSidebar.getPlatform();
```

## File Structure

```
ai-question-sidebar/
├── manifest.json       # Extension configuration file
├── contentScript.js    # Main logic script
├── README.md           # This file
└── icons/              # Extension icons
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## FAQ

**Q: Why is the sidebar not showing?**

A: Make sure the page has fully loaded, try refreshing. If it still doesn't appear, the website may not be in the supported list.

**Q: How to uninstall the extension?**

A: Go to Chrome extensions page (`chrome://extensions/`), find this extension, and click "Remove".

## License

MIT License
