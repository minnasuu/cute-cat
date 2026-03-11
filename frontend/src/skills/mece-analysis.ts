import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🧩 MECE 问题拆解法 — 发发
 *  基于原型: structured-output
 *  将复杂问题按 MECE 原则（相互独立、完全穷尽）拆解为多层子问题树
 */
const meceAnalysis: SkillHandler = {
  id: 'mece-analysis',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[mece-analysis] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: `你是一位顶级战略咨询顾问，精通 MECE 分析框架（Mutually Exclusive, Collectively Exhaustive）。

你的任务是将用户提出的复杂问题，按照 MECE 原则拆解为一棵结构清晰的子问题树。

## MECE 原则
- **相互独立（ME）**：每个维度之间不重叠、不交叉
- **完全穷尽（CE）**：所有维度合在一起能完整覆盖问题的全部范围

## 输出要求
请严格按以下 JSON 格式输出：
{
  "topic": "用户原始问题的概括",
  "dimensions": [
    {
      "name": "维度名称",
      "description": "该维度覆盖的范围说明",
      "priority": "high|medium|low",
      "subQuestions": [
        {
          "question": "具体子问题",
          "direction": "分析方向或思路提示",
          "complexity": "high|medium|low"
        }
      ]
    }
  ],
  "meceCheck": {
    "isExclusive": true,
    "isExhaustive": true,
    "explanation": "简要说明各维度为何满足 MECE 原则"
  },
  "nextSteps": ["建议的下一步行动1", "建议的下一步行动2"]
}

## 拆解规范
1. 先识别问题主题，确定 3-5 个互不重叠的分析维度
2. 每个维度下列出 2-4 个具体子问题
3. 为每个子问题标注分析方向和复杂度
4. 最后做 MECE 自检，确认维度间无重叠且覆盖完整
5. 给出 2-3 条可落地的下一步行动建议

请只输出 JSON，不要添加额外文字说明。`,
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default meceAnalysis;
