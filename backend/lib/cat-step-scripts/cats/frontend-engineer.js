'use strict';

const { runWithAIStream, extractUpstreamText } = require('../_framework');

function healIncompleteJsx(raw) {
  let s = raw.trim();
  const open = (s.match(/\{/g) || []).length;
  const close = (s.match(/\}/g) || []).length;
  const deficit = open - close;
  if (deficit > 0 && deficit <= 8) {
    s += '\n' + '}'.repeat(deficit);
  }
  return s;
}

function stripMarkdownFences(text) {
  let t = text.trim();
  const m = t.match(/^```(?:tsx|ts|jsx|js)?\s*\n?([\s\S]*?)\n?\s*```$/m);
  if (m) t = m[1].trim();
  const inner = t.match(/```(?:tsx|ts|jsx|js)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (inner && inner[1].includes('function App')) t = inner[1].trim();
  return t;
}

function stripImportExportLines(code) {
  return code
    .replace(/^export\s+default\s+function\s+/gm, 'function ')
    .replace(/^export\s+default\s+const\s+/gm, 'const ')
    .replace(/^export\s+function\s+/gm, 'function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+default\s+/gm, '')
    .split('\n')
    .filter((line) => {
      const x = line.trim();
      if (/^import\s+/.test(x)) return false;
      if (/^export\s*\{/.test(x)) return false;
      return true;
    })
    .join('\n');
}

function hasAppComponent(code) {
  return /\bfunction\s+App\s*\(/.test(code) || /\bconst\s+App\s*=/.test(code);
}

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「琥珀」，岗位角色：前端工程师。
你的任务是根据上游 user 消息生成 **一段可在沙箱中运行的 React（JSX）单页代码**，用于落地页 / 官网类页面。

上游 user **通常仅为上一步视觉设计师输出的设计规范/提示词**，你必须仅凭该说明推断模块划分并产出界面。

## 最高优先级：只输出 JSX 源码

- **绝对禁止** markdown 代码块、开场白、结尾说明
- **绝对禁止** import / export
- 必须定义根组件 **App**（function App 或 const App =）
- 使用全局：React、Hooks（useState 等）、UI 组件（Button、Card、CardHeader、CardTitle、CardDescription、CardContent、CardFooter、Badge、Separator、cn、buttonVariants、badgeVariants）
- 使用 Tailwind 工具类；图标用内联 SVG；中文内容；响应式
- 重复模块抽成函数组件并用 .map() 渲染，禁止复制大块近似 JSX
- 实质区块最多 4 个；必须含导航、Hero、至少 1～2 个核心模块

输出完整单文件 JSX。`;

module.exports = async function runFrontendEngineer(ctx) {
  const { merged } = ctx;
  const upstreamText = extractUpstreamText(merged).trim();

  const userText = upstreamText
    ? upstreamText
    : '请生成一个通用企业官网风格的 React 单页（JSX），包含 App 根组件。';

  const result = await runWithAIStream('frontend-engineer', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 16384,
    _resultType: 'react-sandbox',
  });

  if (result.success && result.data?.text) {
    let code = result.data.text.trim();
    code = stripMarkdownFences(code);
    code = stripImportExportLines(code);

    const docIdx = code.search(/function\s+App\s*\(|const\s+App\s*=/);
    if (docIdx > 0) {
      code = code.slice(docIdx);
    }

    if (!hasAppComponent(code)) {
      code = healIncompleteJsx(code);
    }

    if (!hasAppComponent(code)) {
      return {
        success: false,
        data: { text: '', _resultType: 'react-sandbox' },
        summary: '模型未返回可解析的 React 沙箱代码（需包含 App 根组件），请重试该步骤',
        status: 'error',
      };
    }

    result.data.text = code.trim();
    result.data._resultType = 'react-sandbox';
    result.summary = `React 页面已生成（${code.length} 字符，沙箱预览）`;
  }

  return result;
};
