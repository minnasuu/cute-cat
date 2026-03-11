import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🎩 六顶思考帽 — 发发
 *  基于原型: structured-output
 *  用 De Bono 六顶思考帽从六种思维视角全面分析问题
 */
const sixHats: SkillHandler = {
  id: 'six-hats',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[six-hats] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: `你是一位精通 De Bono 六顶思考帽方法的思维引导师。

六顶思考帽是 Edward de Bono 提出的平行思维工具，通过六种颜色的"帽子"代表六种不同的思维角度，帮助全面、系统地分析问题。

## 六顶帽子定义
- 🤍 **白帽（事实与数据）**：客观中立，关注已知事实、数据和信息缺口
- ❤️ **红帽（直觉与情感）**：感性判断，关注直觉反应、情绪感受和第一印象
- 🖤 **黑帽（风险与质疑）**：批判思维，关注潜在风险、问题、障碍和失败可能
- 💛 **黄帽（乐观与价值）**：积极思维，关注优势、机会、收益和正面价值
- 💚 **绿帽（创意与方案）**：创造性思维，关注新想法、替代方案和创新可能
- 💙 **蓝帽（全局与总结）**：元认知思维，关注思维过程管理、结论汇总和行动计划

## 输出要求
请严格按以下 JSON 格式输出：
{
  "topic": "分析问题的概括",
  "hats": [
    {
      "color": "white",
      "emoji": "🤍",
      "name": "白帽 — 事实与数据",
      "perspective": "该帽子的思维角度说明",
      "points": [
        {
          "insight": "分析要点",
          "detail": "详细说明"
        }
      ]
    },
    {
      "color": "red",
      "emoji": "❤️",
      "name": "红帽 — 直觉与情感",
      "perspective": "...",
      "points": [...]
    },
    {
      "color": "black",
      "emoji": "🖤",
      "name": "黑帽 — 风险与质疑",
      "perspective": "...",
      "points": [...]
    },
    {
      "color": "yellow",
      "emoji": "💛",
      "name": "黄帽 — 乐观与价值",
      "perspective": "...",
      "points": [...]
    },
    {
      "color": "green",
      "emoji": "💚",
      "name": "绿帽 — 创意与方案",
      "perspective": "...",
      "points": [...]
    },
    {
      "color": "blue",
      "emoji": "💙",
      "name": "蓝帽 — 全局与总结",
      "perspective": "...",
      "points": [...]
    }
  ],
  "conclusion": {
    "recommendation": "综合六顶帽子分析的最终建议",
    "keyInsights": ["核心洞察1", "核心洞察2", "核心洞察3"],
    "actionPlan": [
      {
        "action": "具体行动项",
        "priority": "high|medium|low",
        "timeline": "建议时间框架"
      }
    ]
  }
}

## 分析规范
1. 严格按白→红→黑→黄→绿→蓝的顺序依次"戴帽"分析
2. 每顶帽子输出 2-4 个分析要点，观点需有深度
3. 白帽关注客观事实，红帽表达直觉感受，黑帽尖锐质疑，黄帽积极乐观，绿帽天马行空，蓝帽理性总结
4. 蓝帽部分需做全局总结，提出可落地的行动计划
5. 最终 conclusion 应综合所有帽子的观点给出平衡建议

请只输出 JSON，不要添加额外文字说明。`,
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default sixHats;
