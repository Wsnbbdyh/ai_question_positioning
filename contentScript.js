// contentScript.js
// AI 对话问题收集器 - 在右侧显示所有问题列表，点击可定位

(function() {
  'use strict';

  // ===== 配置 =====
  const CONFIG = {
    SIDEBAR_ID: 'ai-question-sidebar',
    SIDEBAR_WIDTH: 340,
    DEBOUNCE_DELAY: 500,
    
    // 针对不同 AI 平台的消息选择器
    PLATFORM_SELECTORS: {
      // Gemini (新版 Angular 界面)
      'gemini.google.com': [
        'user-query',
        '.user-query-bubble-with-background',
        'model-response'
      ],
      // ChatGPT (Web - chat.openai.com)
      'chat.openai.com': [
        // 新版 ChatGPT 选择器
        'div[data-message-author-role="user"]',
        'div[data-message-author-role="assistant"]',
        'div[class*="message"][role*="presentation"]',
        // 备用选择器
        'article[data-message-author-role="user"]',
        'article[data-message-author-role="assistant"]',
        'div[class*="MessageContainer"]',
        'div[data-message-id]',
        // 旧版兼容
        'div[class*="message"]',
        'article[role="presentation"]'
      ],
      // ChatGPT Canvas 模式
      'chatgpt.com': [
        'div[data-message-author-role="user"]',
        'div[data-message-author-role="assistant"]',
        'article[data-message-author-role="user"]',
        'article[data-message-author-role="assistant"]'
      ],
      // Claude
      'claude.ai': [
        '[data-testid="message"]',
        'div[class*="ChatMessage"]'
      ],
      // Character.AI
      'character.ai': [
        '[class*="message"]',
        '[class*="ChatMessage"]'
      ],
      // Microsoft Copilot
      'copilot.microsoft.com': [
        '[data-testid="message"]',
        'div[class*="message"]'
      ]
    },
    
    // 默认选择器
    DEFAULT_SELECTOR: [
      'article',
      '[role="article"]',
      'div[data-role="message"]',
      'div[class*="message"]',
      'div[class*="Message"]'
    ]
  };

  // ===== 状态 =====
  let sidebarCreated = false;
  let sidebarEl = null;
  let listEl = null;
  let observer = null;
  let currentPlatform = '';
  let openTriggerEl = null;  // 关闭后用于重新打开的浮动按钮
  let sidebarVisible = true;
  let themeObserver = null;
  let prefersDarkMql = null;

  // ===== 工具函数 =====
  
  /**
   * 获取当前平台
   */
  function getCurrentPlatform() {
    const hostname = window.location.hostname;
    console.log('[AI Question] Current hostname:', hostname);
    for (const platform of Object.keys(CONFIG.PLATFORM_SELECTORS)) {
      if (hostname.includes(platform.replace('https://', '').replace('www.', ''))) {
        console.log('[AI Question] Matched platform:', platform);
        return platform;
      }
    }
    console.log('[AI Question] No matched platform, using default');
    return 'default';
  }

  /**
   * 获取消息选择器
   */
  function getMessageSelectors() {
    const platform = getCurrentPlatform();
    currentPlatform = platform;
    
    if (CONFIG.PLATFORM_SELECTORS[platform]) {
      return CONFIG.PLATFORM_SELECTORS[platform];
    }
    return CONFIG.DEFAULT_SELECTOR;
  }

  /**
   * 提取文本：一条消息只对应列表中的一条
   */
  function extractQuestions(text) {
    if (!text || typeof text !== 'string') return [];

    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];

    // 不再按标点拆分，整条消息作为一个项
    // 为了列表不要太长，超长就截断显示
    const display = cleaned.length > 200 ? cleaned.slice(0, 197) + '…' : cleaned;
    return [display];
  }

  /**
   * 获取消息的时间戳
   */
  function getMessageTime(element) {
    // 尝试从各种属性获取时间
    const timeAttr = element.getAttribute('data-time');
    if (timeAttr) return parseInt(timeAttr);
    
    const timestamp = element.querySelector('[class*="time"], [class*="Time"], [class*="timestamp"]');
    if (timestamp) {
      return timestamp.getAttribute('data-timestamp') || 0;
    }
    
    // 使用元素在文档中的顺序
    return 0;
  }

  /**
   * 解析 rgb/rgba 颜色字符串
   */
  function parseRgb(color) {
    if (!color) return null;
    const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4])
    };
  }

  /**
   * 计算相对亮度 (0..1)
   */
  function relativeLuminance({ r, g, b }) {
    const srgb = [r, g, b].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  /**
   * 获取页面“有效背景色”（向上查找非透明背景）
   */
  function getEffectiveBackgroundColor(startEl) {
    let el = startEl;
    const visited = new Set();

    while (el && !visited.has(el)) {
      visited.add(el);
      const bg = window.getComputedStyle(el).backgroundColor;
      const rgb = parseRgb(bg);
      if (rgb && rgb.a > 0.05) return rgb;
      el = el.parentElement;
    }

    const bodyBg = parseRgb(window.getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg.a > 0.05) return bodyBg;

    const htmlBg = parseRgb(window.getComputedStyle(document.documentElement).backgroundColor);
    if (htmlBg && htmlBg.a > 0.05) return htmlBg;

    return { r: 255, g: 255, b: 255, a: 1 };
  }

  /**
   * 判断当前页面是否为深色主题
   */
  function detectIsDarkTheme() {
    // 1) 优先看页面真实背景色（Gemini 深浅色切换时最直观）
    const bg = getEffectiveBackgroundColor(document.querySelector('main') || document.body);
    const lum = relativeLuminance(bg);
    if (!Number.isNaN(lum)) return lum < 0.45;

    // 2) 兜底：系统偏好
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /**
   * 应用主题到侧边栏/打开按钮（用 CSS 变量统一控制）
   */
  function applyTheme() {
    if (!sidebarEl) return;

    const isDark = detectIsDarkTheme();

    const pageBg = getEffectiveBackgroundColor(document.querySelector('main') || document.body);
    const cssRgb = (rgb) => `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
    const blend = (from, to, t) => ({
      r: from.r + (to.r - from.r) * t,
      g: from.g + (to.g - from.g) * t,
      b: from.b + (to.b - from.b) * t
    });
    const bgSolid = cssRgb(pageBg);
    const darkLift = cssRgb(blend(pageBg, { r: 255, g: 255, b: 255 }, 0.06));
    const darkLiftHover = cssRgb(blend(pageBg, { r: 255, g: 255, b: 255 }, 0.12));
    const lightDrop = cssRgb(blend(pageBg, { r: 0, g: 0, b: 0 }, 0.03));
    const lightDropHover = cssRgb(blend(pageBg, { r: 0, g: 0, b: 0 }, 0.06));

    const varsDark = {
      // 跟随页面真实背景色，避免“偏蓝”的渐变
      '--aq-bg': bgSolid,
      '--aq-text': '#e2e8f0',
      '--aq-text-strong': '#ffffff',
      '--aq-text-muted': '#a0aec0',
      '--aq-text-subtle': '#718096',
      '--aq-border': 'rgba(255, 255, 255, 0.08)',
      '--aq-surface-1': 'rgba(255, 255, 255, 0.04)',
      '--aq-surface-2': 'rgba(255, 255, 255, 0.03)',
      '--aq-item-bg': 'rgba(255, 255, 255, 0.05)',
      '--aq-item-hover-bg': 'rgba(255, 255, 255, 0.08)',
      '--aq-accent': '#4299e1',
      '--aq-shadow': '-4px 0 20px rgba(0, 0, 0, 0.3)',
      '--aq-trigger-bg': darkLift,
      '--aq-trigger-bg-hover': darkLiftHover
    };

    const varsLight = {
      // 浅色同样跟随页面底色，避免突兀
      '--aq-bg': bgSolid,
      '--aq-text': '#1f2937',
      '--aq-text-strong': '#111827',
      '--aq-text-muted': '#4b5563',
      '--aq-text-subtle': '#6b7280',
      '--aq-border': '#e5e7eb',
      '--aq-surface-1': 'rgba(255, 255, 255, 0.75)',
      '--aq-surface-2': 'rgba(255, 255, 255, 0.6)',
      '--aq-item-bg': 'rgba(17, 24, 39, 0.04)',
      '--aq-item-hover-bg': 'rgba(17, 24, 39, 0.07)',
      '--aq-accent': '#2563eb',
      '--aq-shadow': '-4px 0 18px rgba(0, 0, 0, 0.12)',
      '--aq-trigger-bg': lightDrop,
      '--aq-trigger-bg-hover': lightDropHover
    };

    const vars = isDark ? varsDark : varsLight;
    for (const [k, v] of Object.entries(vars)) {
      sidebarEl.style.setProperty(k, v);
    }
    if (openTriggerEl) {
      for (const [k, v] of Object.entries(vars)) {
        openTriggerEl.style.setProperty(k, v);
      }
    }
  }

  /**
   * 监听主题变化（系统深浅色 & 页面 class/style 变化）
   */
  function startThemeSync() {
    if (themeObserver || prefersDarkMql) return;

    // 系统深浅色偏好
    if (window.matchMedia) {
      prefersDarkMql = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => applyTheme();
      try {
        prefersDarkMql.addEventListener('change', onChange);
      } catch (_) {
        prefersDarkMql.addListener(onChange);
      }
    }

    // 监听 documentElement (html) 的变化
    themeObserver = new MutationObserver(() => applyTheme());
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // 同时监听 body（很多 SPA 在 body 上切换主题）
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    // 监听 main 元素（Gemini 等常用容器）
    const mainEl = document.querySelector('main');
    if (mainEl) {
      themeObserver.observe(mainEl, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }

    // 兜底：定时检查主题（每 2 秒）
    let lastBg = window.getComputedStyle(document.body).backgroundColor;
    setInterval(() => {
      const bg = window.getComputedStyle(document.body).backgroundColor;
      if (bg !== lastBg) {
        applyTheme();
        lastBg = bg;
      }
    }, 2000);
  }

  /**
   * 创建侧边栏
   */
  function createSidebar() {
    if (sidebarCreated && sidebarEl) return;

    // 先获取当前平台
    currentPlatform = getCurrentPlatform();

    // 创建侧边栏容器
    sidebarEl = document.createElement('div');
    sidebarEl.id = CONFIG.SIDEBAR_ID;
    sidebarEl.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      width: ${CONFIG.SIDEBAR_WIDTH}px !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: var(--aq-bg) !important;
      color: var(--aq-text) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: var(--aq-shadow) !important;
      border-left: 1px solid var(--aq-border) !important;
    `;

    // 创建头部
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px !important;
      border-bottom: 1px solid var(--aq-border) !important;
      background: var(--aq-surface-1) !important;
    `;
    
    const title = document.createElement('h3');
    title.textContent = '📝 问题列表';
    title.style.cssText = `
      margin: 0 0 8px 0 !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      color: var(--aq-text-strong) !important;
    `;
    
    const platform = document.createElement('div');
    platform.textContent = `平台: ${currentPlatform || '未知'}`;
    platform.style.cssText = `
      font-size: 11px !important;
      color: var(--aq-text-subtle) !important;
    `;

    header.appendChild(title);
    header.appendChild(platform);

    // 创建说明文字
    const tips = document.createElement('div');
    tips.textContent = '点击问题可定位到对应消息';
    tips.style.cssText = `
      padding: 10px 16px !important;
      font-size: 12px !important;
      color: var(--aq-text-muted) !important;
      background: var(--aq-surface-2) !important;
      border-bottom: 1px solid var(--aq-border) !important;
    `;

    // 创建问题列表容器
    listEl = document.createElement('div');
    listEl.id = 'question-list-container';
    listEl.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      padding: 12px !important;
    `;

    // 创建统计信息
    const statsEl = document.createElement('div');
    statsEl.id = 'question-stats';
    statsEl.style.cssText = `
      padding: 10px 16px !important;
      font-size: 12px !important;
      color: var(--aq-text-subtle) !important;
      border-top: 1px solid var(--aq-border) !important;
      background: var(--aq-surface-1) !important;
    `;

    // 创建关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕ 关闭侧边栏';
    closeBtn.style.cssText = `
      margin: 12px !important;
      padding: 8px 16px !important;
      background: #e53e3e !important;
      color: white !important;
      border: none !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      font-size: 12px !important;
      transition: background 0.2s !important;
    `;
    closeBtn.onmouseover = () => { closeBtn.style.background = '#c53030'; };
    closeBtn.onmouseout = () => { closeBtn.style.background = '#e53e3e'; };
    closeBtn.onclick = closeSidebar;

    // 创建「打开侧边栏」浮动按钮（关闭后显示在右侧）
    openTriggerEl = document.createElement('button');
    openTriggerEl.id = 'ai-question-open-trigger';
    openTriggerEl.innerHTML = '📝 问题列表';
    openTriggerEl.title = '打开问题列表';
    openTriggerEl.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      right: 0 !important;
      transform: translateY(-50%) !important;
      z-index: 2147483646 !important;
      padding: 12px 16px !important;
      background: var(--aq-trigger-bg) !important;
      color: var(--aq-text) !important;
      border: 1px solid var(--aq-border) !important;
      border-right: none !important;
      border-radius: 8px 0 0 8px !important;
      cursor: pointer !important;
      font-size: 13px !important;
      font-family: inherit !important;
      box-shadow: -2px 0 12px rgba(0, 0, 0, 0.3) !important;
      display: none !important;
      transition: background 0.2s, transform 0.2s !important;
    `;
    openTriggerEl.onmouseenter = () => {
      openTriggerEl.style.setProperty('background', 'var(--aq-trigger-bg-hover)', 'important');
      openTriggerEl.style.setProperty('transform', 'translateY(-50%) translateX(-4px)', 'important');
    };
    openTriggerEl.onmouseleave = () => {
      openTriggerEl.style.setProperty('background', 'var(--aq-trigger-bg)', 'important');
      openTriggerEl.style.setProperty('transform', 'translateY(-50%) translateX(0)', 'important');
    };
    openTriggerEl.onclick = openSidebar;
    document.body.appendChild(openTriggerEl);

    // 组装侧边栏
    sidebarEl.appendChild(header);
    sidebarEl.appendChild(tips);
    sidebarEl.appendChild(listEl);
    sidebarEl.appendChild(statsEl);
    sidebarEl.appendChild(closeBtn);

    // 添加到页面
    document.body.appendChild(sidebarEl);
    
    // 调整页面主体宽度
    document.body.style.marginRight = CONFIG.SIDEBAR_WIDTH + 'px';

    // 主题同步（Gemini 深浅色切换时跟随）
    startThemeSync();
    applyTheme();
    
    sidebarCreated = true;
  }

  /**
   * 关闭侧边栏（显示打开按钮）
   */
  function closeSidebar() {
    if (!sidebarEl) return;
    sidebarEl.style.display = 'none';
    document.body.style.marginRight = '0';
    if (openTriggerEl) openTriggerEl.style.display = 'block';
    sidebarVisible = false;
  }

  /**
   * 打开侧边栏（隐藏打开按钮）
   */
  function openSidebar() {
    if (!sidebarEl) return;
    sidebarEl.style.display = 'flex';
    document.body.style.marginRight = CONFIG.SIDEBAR_WIDTH + 'px';
    if (openTriggerEl) openTriggerEl.style.display = 'none';
    sidebarVisible = true;
    buildQuestionList();
  }

  /**
   * 高亮消息
   */
  function highlightMessage(messageEl) {
    if (!messageEl) return;
    
    // 保存原始样式
    const originalTransition = messageEl.style.transition;
    const originalBoxShadow = messageEl.style.boxShadow;
    
    // 添加高亮效果
    messageEl.style.transition = 'all 0.3s ease';
    messageEl.style.boxShadow = '0 0 0 3px rgba(66, 153, 225, 0.6), 0 0 20px rgba(66, 153, 225, 0.3)';
    messageEl.style.borderRadius = '8px';
    
    // 滚动到视图中心
    messageEl.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
    
    // 1.5秒后移除高亮
    setTimeout(() => {
      messageEl.style.transition = originalTransition;
      messageEl.style.boxShadow = originalBoxShadow;
    }, 1500);
  }

  /**
   * 构建问题列表
   */
  function buildQuestionList() {
    if (!listEl) return;

    const selectors = getMessageSelectors();
    let allMessages = [];
    
    // 尝试各种选择器
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          allMessages = Array.from(elements);
          break;
        }
      } catch (e) {
        console.log('Selector error:', selector);
      }
    }

    // 如果还没找到，使用通用方法
    if (allMessages.length === 0) {
      // 尝试获取 main 或 body 下的所有可能的消息元素
      const possibleMessages = document.querySelectorAll('main > div, article, section');
      allMessages = Array.from(possibleMessages).filter(el => {
        const text = el.innerText || el.textContent || '';
        return text.length > 5;
      });
    }

    // 收集所有问题
    const questions = [];
    
    allMessages.forEach((msgEl, index) => {
      let text = (msgEl.innerText || msgEl.textContent || '').trim();
      if (!text) return;

      // 过滤掉页面自带的标签文字
      text = text.replace(/^you said\s*/i, '').replace(/^You Said\s*/i, '').trim();
      if (!text) return;

      const extractedQuestions = extractQuestions(text);
      
      if (extractedQuestions.length > 0) {
        extractedQuestions.forEach(q => {
          questions.push({
            text: q,
            element: msgEl,
            index: questions.length + 1,
            time: getMessageTime(msgEl)
          });
        });
      }
    });

    // 渲染列表
    renderQuestions(questions);
    
    // 更新统计
    updateStats(questions.length);
  }

  /**
   * 渲染问题列表
   */
  function renderQuestions(questions) {
    if (!listEl) return;
    
    listEl.innerHTML = '';
    
    if (questions.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--aq-text-subtle);">
          <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
          <div>暂未检测到问题</div>
          <div style="font-size: 12px; margin-top: 8px;">显示对话中所有消息</div>
        </div>
      `;
      return;
    }

    questions.forEach((q, i) => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 10px 12px !important;
        margin-bottom: 8px !important;
        background: var(--aq-item-bg) !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        border: 1px solid transparent !important;
      `;
      
      // 序号
      const number = document.createElement('span');
      number.textContent = `${q.index}. `;
      number.style.cssText = `
        color: var(--aq-accent) !important;
        font-weight: 600 !important;
        margin-right: 4px !important;
      `;
      
      // 问题文本
      const text = document.createElement('span');
      const displayText = q.text.length > 80 ? q.text.substring(0, 77) + '...' : q.text;
      text.textContent = displayText;
      text.style.cssText = `
        color: var(--aq-text) !important;
        font-size: 13px !important;
        line-height: 1.5 !important;
      `;
      
      item.appendChild(number);
      item.appendChild(text);
      
      // 鼠标交互
      item.onmouseenter = () => {
        item.style.setProperty('background', 'var(--aq-item-hover-bg)', 'important');
        item.style.setProperty('border-color', 'var(--aq-accent)', 'important');
        item.style.setProperty('transform', 'translateX(-4px)', 'important');
      };
      
      item.onmouseleave = () => {
        item.style.setProperty('background', 'var(--aq-item-bg)', 'important');
        item.style.setProperty('border-color', 'transparent', 'important');
        item.style.setProperty('transform', 'translateX(0)', 'important');
      };
      
      // 点击事件
      item.onclick = () => {
        highlightMessage(q.element);
      };
      
      listEl.appendChild(item);
    });
  }

  /**
   * 更新统计信息
   */
  function updateStats(count) {
    const statsEl = document.getElementById('question-stats');
    if (statsEl) {
      statsEl.textContent = `共发现 ${count} 个问题`;
    }
  }

  /**
   * 监听页面变化
   */
  function observePage() {
    const target = document.querySelector('main') || document.body;
    if (!target) return;

    // 防抖函数
    let debounceTimer = null;
    const debounce = (func, wait) => {
      return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), wait);
      };
    };

    observer = new MutationObserver(debounce(() => {
      buildQuestionList();
    }, CONFIG.DEBOUNCE_DELAY));

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /**
   * 初始化
   */
  function init() {
    if (sidebarCreated) return;
    
    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          createSidebar();
          buildQuestionList();
          observePage();
        }, 1500);
      });
    } else {
      setTimeout(() => {
        createSidebar();
        buildQuestionList();
        observePage();
      }, 1500);
    }
  }

  // 启动
  init();
  
  // 导出以便调试
  window.AIQuestionSidebar = {
    refresh: buildQuestionList,
    getPlatform: getCurrentPlatform,
    open: openSidebar,
    close: closeSidebar
  };
})();
