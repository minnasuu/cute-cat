import type { AgentContext, AgentResult } from './types';
import { extractUpstreamText } from './_framework';
import { callDifySkillStream } from '../utils/backendClient';
import { listVibeStyleLibLibrary } from '../pages/VibeStyleLib/vibeStyleLibApi';

/**
 * 视觉设计师：从 VibeStyleLib 灵感库中匹配最合适的设计风格
 * 优化策略：仅传 styleDescription 给 AI 匹配（节省 token），匹配成功后拼接完整 designPrompt
 */
export default async function runVisualDesigner(ctx: AgentContext): Promise<AgentResult> {
  try {
    // 1. 获取灵感库数据（加超时保护，避免 API 不可用时永久卡住）
    let libraryItems: Awaited<ReturnType<typeof listVibeStyleLibLibrary>> = [];
    try {
      const libPromise = listVibeStyleLibLibrary();
      const libTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('灵感库 API 超时')), 10_000)
      );
      libraryItems = await Promise.race([libPromise, libTimeout]);
    } catch (libErr) {
      console.warn('[visual-designer] 灵感库获取失败，使用空列表:', libErr instanceof Error ? libErr.message : libErr);
    }
    
    // 灵感库为空时，使用默认风格（而不是中断流程）
    if (libraryItems.length === 0) {
      console.warn('[visual-designer] 灵感库为空，使用默认视觉风格');
      const defaultPrompt = `## 默认视觉风格

**色彩方案**
- 主色：#3B82F6 (蓝色，专业可信)
- 辅色：#10B981 (绿色，活力积极)
- 中性色：#F3F4F6 (浅灰背景)、#1F2937 (深色文字)

**排版**
- 标题字体：Inter / PingFang SC，font-weight: 600-700
- 正文字体：Inter / PingFang SC，font-size: 16px，line-height: 1.6
- 层级清晰：大标题 36-48px，区域标题 24px，卡片标题 18px

**组件风格**
- 圆角：卡片 16-24px，按钮 12px，Badge 全圆角
- 阴影：柔和双层 (0 1px 3px rgba(0,0,0,0.04), 0 8px 16px rgba(0,0,0,0.04))
- 边框：统一 0.5px solid
- 间距：模块间距 32-80px，组件内 padding 16-32px

**设计原则**
- 现代简约风格，注重留白和呼吸感
- 主色面积控制在 10% 以内，大面积用白色/浅灰
- 响应式布局：移动端 1 列 → 平板 2 列 → 桌面 3 列`;

      return {
        success: true,
        data: { 
          text: `选择：默认现代简约风格\n理由：灵感库暂无数据，使用通用的现代简约设计风格，适合大多数 Web 应用场景。\n\n---\n\n${defaultPrompt}`,
          selectedStyleId: null,
          selectedStyleTags: ['现代', '简约', '专业'],
        },
        summary: '已使用默认现代简约风格（灵感库暂无数据）',
        status: 'success',
      };
    }

    // 2. 构建风格库目录（仅包含 styleDescription，节省 token）
    const styleCatalog = libraryItems
      .map((item, idx) => {
        const desc = item.designSummary.styleDescription;
        return `### 风格 ${idx + 1}\n${desc}`;
      })
      .join('\n\n');

    // 3. 构建系统提示词
    const systemPrompt = `你是 CuCaTopia 官方工作台猫猫「墨墨」，岗位角色：视觉设计师。
你的任务是根据上游的产品架构和交互设计内容，从预定义的视觉风格库中选择最匹配的风格。

## 视觉风格库

${styleCatalog}

## 🚨🚨🚨 最高优先级规则：只输出风格选择结果 🚨🚨🚨

你的回复必须**严格遵守以下固定格式**，只输出两行，不多不少：

选择：风格 N
理由：一句话说明为什么选这个风格

- 第一行必须以"选择：风格"开头，N 是风格编号数字
- 第二行必须以"理由："开头，用一句话（≤50字）简要说明匹配原因
- **绝对禁止**在这两行之前写任何文字（包括"好的"、"分析如下"等）
- **绝对禁止**在这两行之后写任何文字（包括总结、补充说明、设计建议等）
- **绝对禁止**输出完整的设计规范、配色方案、CSS 代码等
- **绝对禁止**逐个分析每个风格的优劣

正确示例：
选择：风格 3
理由：产品定位为年轻潮流电商，该风格的活力配色和圆角卡片最贴合目标用户审美。

错误示例：
❌ 好的，我来分析一下各个风格...（废话）
❌ 选择：风格 3\n理由：...\n\n以下是完整设计规范...（多余内容）
❌ 让我逐一分析：风格1适合...风格2适合...（逐个分析）`;

    const upstreamText = extractUpstreamText(ctx);

    console.log(`[visual-designer] 灵感库条目数: ${libraryItems.length}, 上游输入长度: ${upstreamText.length}`);

    // 4. 调用 AI 进行风格匹配（直接调用 callDifySkill，不经过 primitive）
    const userText = upstreamText || '请为一个通用企业官网选择合适的视觉风格';

    const TIMEOUT_MS = 120_000;
    const resultPromise = callDifySkillStream('ai-chat', userText, 'qwen', ctx.onChunk, { systemPrompt, maxTokens: 4096 });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('请求超时')), TIMEOUT_MS)
    );
    const resp = await Promise.race([resultPromise, timeoutPromise]);

    if (resp.error) {
      return {
        success: false,
        data: { text: '' },
        summary: `视觉设计匹配失败: ${resp.error}`,
        status: 'error',
      };
    }

    const rawResponse = resp.answer || '';

    // 5. 清理 AI 返回，只提取"选择"和"理由"
    let aiResponse = rawResponse.trim();

    // 去除 markdown 代码块包裹
    const codeMatch = aiResponse.match(/```(?:markdown|md)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) aiResponse = codeMatch[1].trim();

    // 提取"选择：风格 N"行
    const selectLine = aiResponse.match(/选择[：:]\s*风格\s*(\d+)/);
    // 提取"理由：xxx"行
    const reasonLine = aiResponse.match(/理由[：:]\s*(.+)/);

    // 重新拼装干净的两行结果
    if (selectLine) {
      const cleanReason = reasonLine ? reasonLine[1].trim() : '该风格最匹配产品定位';
      aiResponse = `选择：风格 ${selectLine[1]}\n理由：${cleanReason}`;
    }

    // 6. 解析 AI 返回的风格编号
    const styleMatch = aiResponse.match(/风格\s*(\d+)/);
    const selectedIndex = styleMatch ? parseInt(styleMatch[1], 10) - 1 : 0;

    if (selectedIndex < 0 || selectedIndex >= libraryItems.length) {
      console.warn(`[visual-designer] AI 返回的风格编号无效: ${styleMatch?.[1]}, 默认使用第一个风格`);
    }

    const selectedStyle = libraryItems[Math.max(0, Math.min(selectedIndex, libraryItems.length - 1))];

    // 6. 拼接完整输出：AI 分析 + 完整 designPrompt
    const fullOutput = `${aiResponse}

---

## 完整视觉设计规范

${selectedStyle.designPrompt}

---

**设计摘要**: ${selectedStyle.summary}
**色板**: ${selectedStyle.colors.join(', ')}
**标签**: ${selectedStyle.tags.join(', ')}`;

    return {
      success: true,
      data: { 
        text: fullOutput,
        selectedStyleId: selectedStyle.id,
        selectedStyleTags: selectedStyle.tags,
      },
      summary: fullOutput.length > 300 ? fullOutput.slice(0, 300) + '…' : fullOutput,
      status: 'success',
    };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[visual-designer] 执行失败:', msg);
    return {
      success: false,
      data: { text: '' },
      summary: `视觉设计匹配失败: ${msg}`,
      status: 'error',
    };
  }
}
