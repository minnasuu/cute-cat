'use strict';

const { runWithAIStream, extractUpstreamText } = require('../_framework');
const { generateImage } = require('../../../lib/gen-image');

module.exports = async function runPixelImage(ctx) {
  const upstream = extractUpstreamText(ctx.merged);
  const userInput = String(ctx.context?.userInput || '').trim();
  const workflowName = String(ctx.context?.workflowName || '').trim();
  const runId = String(ctx.context?.runId || '').trim();
  const teamId = String(ctx.teamId || '');

  // 1) 让文本模型先产出英文 prompt（Imagen 对英文更稳定）
  const translateSystem = `你是资深视觉提示词工程师。
把用户的中文需求整理成「英文」图片生成 prompt（适配 Imagen 文生图）。
要求：
- 只输出英文 prompt（一段即可），不要解释，不要加引号，不要加 Markdown。
- 具体、可视化、包含材质/配色/风格/光照/构图要点
- 不要出现裸露/未成年人/侵权品牌商标等敏感内容
- 如果是商品图：用干净背景，强调主体细节`;

  const translateUser = [
    workflowName ? `任务：${workflowName}` : null,
    userInput ? `用户输入：${userInput}` : null,
    upstream ? `上游信息：${upstream}` : null,
  ].filter(Boolean).join('\n');

  const promptResult = await runWithAIStream(
    'pixel-image',
    ctx,
    translateSystem,
    translateUser || '请生成一段英文图片提示词',
    { maxTokens: 512 },
  );

  if (!promptResult.success) return promptResult;
  const prompt = String(promptResult.data?.text || '').trim();
  if (!prompt) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: '[pixel-image] prompt 生成失败（空）',
    };
  }

  // 2) 调用 Imagen 生成图片
  const result = await generateImage(prompt, {
    teamId: teamId || 'anonymous',
    aspectRatio: '1:1',
    safeName: workflowName || 'image',
  });
  if (!result) {
    return {
      success: false,
      status: 'error',
      data: { text: '' },
      summary: '[pixel-image] Imagen 调用失败',
    };
  }

  return {
    success: true,
    status: 'success',
    data: {
      text: result.url,
      _resultType: 'image',
      imageUrl: result.url,
      prompt: result.prompt,
      model: result.model,
    },
    summary: `已生成图片：${result.url}`,
  };
};
