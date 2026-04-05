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

## 输出要求

1. 先分析上游内容的行业属性、目标受众和产品气质
2. 从上方风格库中选择 1 个最匹配的风格（说明选择理由）
3. **只需输出风格编号（如"风格 1"）和选择理由，不要输出完整的设计规范**

用中文输出，简洁明了。格式示例：
选择：风格 3
理由：该风格的现代简约设计与产品的轻量化定位高度契合...`;

    const upstreamText = extractUpstreamText(ctx);

    console.log(`[visual-designer] 灵感库条目数: ${libraryItems.length}, 上游输入长度: ${upstreamText.length}`);

    // 4. 调用 AI 进行风格匹配（直接调用 callDifySkill，不经过 primitive）
    const prompt = `${systemPrompt}\n\n---\n\n${upstreamText || '请为一个通用企业官网选择合适的视觉风格'}`;

    const TIMEOUT_MS = 120_000;
    const resultPromise = callDifySkillStream('ai-chat', prompt, 'qwen', ctx.onChunk);
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

    const aiResponse = resp.answer || '';

    // 5. 解析 AI 返回的风格编号
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
