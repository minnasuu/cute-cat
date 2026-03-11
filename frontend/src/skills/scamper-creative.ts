import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

/** 🔀 SCAMPER 创意改造 — 发发
 *  基于原型: structured-output
 *  对产品/方案从 SCAMPER 七个维度进行创意发散
 */
const scamperCreative: SkillHandler = {
  id: 'scamper-creative',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[scamper-creative] agent=${ctx.agentId} @${ctx.timestamp}`);

    const result = await executePrimitive('structured-output', ctx, {
      systemPrompt: `你是一位创意策划大师，精通 SCAMPER 创意思维法。

SCAMPER 是由 Bob Eberle 提出的创意激发工具，通过七个维度对现有产品、方案或概念进行系统性的创意改造。

## 七个维度
- **S - Substitute（替代）**：能用什么替代现有元素？
- **C - Combine（合并）**：能与什么进行组合？
- **A - Adapt（调整）**：能借鉴或适配什么？
- **M - Modify/Magnify（修改/放大）**：能改变或放大什么特征？
- **P - Put to other uses（另作他用）**：能用在其他场景吗？
- **E - Eliminate（消除）**：能去掉什么多余部分？
- **R - Reverse/Rearrange（反转/重组）**：能颠倒或重新排列吗？

## 输出要求
请严格按以下 JSON 格式输出：
{
  "subject": "分析对象的概括",
  "dimensions": [
    {
      "letter": "S",
      "name": "Substitute（替代）",
      "coreQuestion": "该维度的核心提问",
      "ideas": [
        {
          "idea": "具体创意点",
          "detail": "创意的详细描述和实施思路",
          "feasibility": 4,
          "impact": "high|medium|low",
          "effort": "high|medium|low"
        }
      ]
    },
    {
      "letter": "C",
      "name": "Combine（合并）",
      "coreQuestion": "...",
      "ideas": [...]
    },
    {
      "letter": "A",
      "name": "Adapt（调整）",
      "coreQuestion": "...",
      "ideas": [...]
    },
    {
      "letter": "M",
      "name": "Modify/Magnify（修改/放大）",
      "coreQuestion": "...",
      "ideas": [...]
    },
    {
      "letter": "P",
      "name": "Put to other uses（另作他用）",
      "coreQuestion": "...",
      "ideas": [...]
    },
    {
      "letter": "E",
      "name": "Eliminate（消除）",
      "coreQuestion": "...",
      "ideas": [...]
    },
    {
      "letter": "R",
      "name": "Reverse/Rearrange（反转/重组）",
      "coreQuestion": "...",
      "ideas": [...]
    }
  ],
  "topIdeas": [
    {
      "idea": "最具潜力的创意",
      "fromDimension": "来源维度字母",
      "reason": "推荐理由"
    }
  ],
  "summary": "整体创意改造方向的总结建议"
}

## 创意规范
1. 每个维度必须至少生成 1-3 个具体、可落地的创意点
2. feasibility（可行性）评分 1-5 分，5 为最高
3. 最后从所有创意中挑选 Top 3 最具潜力的创意
4. 创意要大胆但不脱离实际，给出实施思路

请只输出 JSON，不要添加额外文字说明。`,
      difySkillId: '',
    });

    return { success: result.success, data: result.data, summary: result.summary, status: result.status };
  },
};

export default scamperCreative;
