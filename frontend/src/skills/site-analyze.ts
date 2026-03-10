import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 拼接 Dify 输入字符串（纯文本，不含 JSON 包装） */
function buildDifyInput(articleTitles: string[], craftNames: string[]): string {
  const articlesPart = articleTitles.length > 0
    ? articleTitles.map(t => `《${t}》`).join('、')
    : '暂无文章';

  const craftsPart = craftNames.length > 0
    ? craftNames.join('、')
    : '暂无 Crafts';

  return `现有文章：${articlesPart}。现有crafts：${craftsPart}`;
}

/** 🔬 网站诊断 — 小白
 *  基于原型: api-call (数据采集) + text-to-text (AI 分析)
 *  先通过 api-call 原型采集文章和 Crafts 列表，再调用 text-to-text 原型进行诊断分析。
 */
const siteAnalyze: SkillHandler = {
  id: 'site-analyze',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[site-analyze] agent=${ctx.agentId} @${ctx.timestamp}`);

    try {
      // 1. 通过 api-call 原型并行采集文章和 Crafts 数据
      const [articlesResult, craftsResult] = await Promise.all([
        executePrimitive('api-call', ctx, {
          proxyEndpoint: '/api/articles',
          proxyBody: {},
        }).catch(() => ({ success: false, data: null, summary: '', status: 'error' as const })),
        executePrimitive('api-call', ctx, {
          proxyEndpoint: '/api/crafts',
          proxyBody: {},
        }).catch(() => ({ success: false, data: null, summary: '', status: 'error' as const })),
      ]);

      // 提取标题/名称列表
      const articlesData = articlesResult.success && Array.isArray(articlesResult.data)
        ? articlesResult.data
        : [];
      const craftsData = craftsResult.success && Array.isArray(craftsResult.data)
        ? craftsResult.data
        : [];

      const articleTitles = articlesData.map((a: any) => a.title).filter(Boolean);
      const craftNames = craftsData.map((c: any) => c.name).filter(Boolean);

      // 2. 拼接诊断输入
      const difyInput = buildDifyInput(articleTitles, craftNames);

      // 3. 通过 text-to-text 原型调用 AI 诊断
      const enrichedCtx: SkillContext = { ...ctx, input: difyInput };

      const analysisResult = await executePrimitive('text-to-text', enrichedCtx, {
        systemPrompt: '你是一位网站内容诊断专家。请分析以下个站的内容分布、质量和覆盖范围，指出不足之处并给出优化建议。',
        difySkillId: 'site-analyze',
        model: 'qwen',
        outputFormat: 'text',
      });

      if (!analysisResult.success) {
        return {
          success: false,
          data: { error: analysisResult.summary },
          summary: `网站诊断失败: ${analysisResult.summary}`,
          status: 'error',
        };
      }

      const analysisData = analysisResult.data as Record<string, unknown> | null;

      return {
        success: true,
        data: {
          currentArticles: articleTitles,
          currentCrafts: craftNames,
          analysis: analysisData?.text || analysisResult.summary,
          conversationId: analysisData?.conversationId,
        },
        summary: analysisResult.summary,
        status: 'success',
      };
    } catch (err) {
      return {
        success: false,
        data: { error: String(err) },
        summary: `网站诊断异常: ${String(err)}`,
        status: 'error',
      };
    }
  },
};

export default siteAnalyze;
