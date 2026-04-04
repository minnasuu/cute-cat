'use strict';

const { runWithAI, extractUpstreamText } = require('../_framework');

const SYSTEM_PROMPT = `你是 CuCaTopia 官方工作台猫猫「花椒」，岗位角色：产品策划。
你的任务是根据用户的建站需求，输出一份完整的网站信息架构。

输出要求：
1. 必须输出合法的 JSON 对象（不要包裹在 markdown 代码块中）
2. JSON 顶层结构：
   {
     "goal": "建站目标（一句话）",
     "audience": "目标受众描述",
     "siteMap": ["首页", "关于我们", ...],
     "pages": [
       {
         "name": "页面名",
         "path": "/path",
         "modules": [
           { "name": "模块名", "description": "模块内容要点", "priority": "high|medium|low" }
         ]
       }
     ]
   }
3. pages 数组至少包含 3 个页面，每页至少 2 个模块
4. 用中文填写内容，字段名用英文
5. 只输出 JSON，不要附加任何解释文字`;

module.exports = async function runProductArchitect(ctx) {
  const { merged } = ctx;
  const params = merged?._params || {};
  const topic = params.topic || merged?.topic || '';
  const audience = params.audience || merged?.audience || '';

  let userText = topic;
  if (audience) userText += `\n目标用户：${audience}`;
  if (!userText.trim()) {
    userText = extractUpstreamText(merged) || '请生成一个通用企业官网的信息架构';
  }

  const result = await runWithAI('product-architect', ctx, SYSTEM_PROMPT, userText, {
    maxTokens: 4096,
  });

  // 尝试清理 markdown 包裹
  if (result.success && result.data?.text) {
    let text = result.data.text.trim();
    const codeMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeMatch) text = codeMatch[1].trim();
    result.data.text = text;
    result.summary = `产品架构已生成（${text.length} 字符）`;
  }

  return result;
};
