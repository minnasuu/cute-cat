'use strict';

/**
 * design-generator —— 时尚设计工作流图片生成路由。
 *
 * 挂在 `/api/teams/:teamId/design`,由 team-workbench.js 的 sub-router 挂载。
 *
 * POST /api/teams/:teamId/design/generate  —— 按设计企划批量生成图片
 * POST /api/teams/:teamId/design/regenerate —— 单张图重生成(修图)
 */

const express = require('express');
const { generateImage } = require('../lib/gen-image');

const router = express.Router();

/**
 * 按类别推导出需要生成的图片列表。
 * 每张图有 slot(用途标识)、prompt(英文 prompt)、label(中文说明)、aspectRatio。
 */
function planImages(mode, plan) {
  const planText = (plan || '').trim();
  if (mode === 'illustration') {
    return [{
      slot: 'illustration',
      label: '插画设计图',
      aspectRatio: '3:4',
      prompt: `Original fashion illustration. ${planText} Watercolor and ink, expressive fabric draping, elegant pose, soft editorial lighting, high-detail, premium fashion magazine quality.`,
    }];
  }
  if (mode === 'collection') {
    // 系列 = 系列总览 + 默认示意款 4 张
    const out = [
      { slot: 'collection-overview', label: '系列总览', aspectRatio: '16:9', prompt: `Fashion collection lookbook overview. ${planText} Full outfit flat lays arranged in a grid, cohesive color story, editorial styling, premium brand catalog layout.` },
      { slot: 'collection-color', label: '色彩企划', aspectRatio: '1:1', prompt: `Color palette storyboard for a fashion collection. ${planText} Seasonal color chips, fabric swatches, mood hues, premium brand identity, editorial flat photography.` },
    ];
    // 示意款(可扩展为多个单品)
    out.push(
      { slot: 'hero-flat', label: '主款白底效果图', aspectRatio: '3:4', prompt: `Product photography, single garment on white background. ${planText} Clean studio lighting, front view, sharp detail, e-commerce style.` },
      { slot: 'hero-tech', label: '主款款式版型图', aspectRatio: '3:4', prompt: `Technical flat sketch of a fashion garment. ${planText} Front + back view, clean line art, design detail callouts, spec annotations, white background.` },
      { slot: 'hero-detail', label: '主款细节图', aspectRatio: '1:1', prompt: `Extreme close-up detail shot of a fashion garment. ${planText} Fabric texture, stitching, buttons, craftsmanship, soft studio lighting, editorial quality.` },
      { slot: 'hero-editorial', label: '主款摄影效果图', aspectRatio: '3:4', prompt: `Editorial fashion photography of a single garment. ${planText} Model wearing the piece, soft natural light, outdoor/studio setting, luxurious atmosphere.` },
    );
    return out;
  }
  // default: single 单品
  return [
    { slot: 'flat', label: '白底效果图', aspectRatio: '3:4', prompt: `Product photography, single garment on white background. ${planText} Clean studio lighting, front view, sharp detail, e-commerce style.` },
    { slot: 'tech', label: '款式版型图', aspectRatio: '3:4', prompt: `Technical flat sketch of a fashion garment. ${planText} Front + back view, clean line art, design detail callouts, spec annotations, white background.` },
    { slot: 'detail', label: '细节图', aspectRatio: '1:1', prompt: `Extreme close-up detail shot of a fashion garment. ${planText} Fabric texture, stitching, buttons, craftsmanship, soft studio lighting, editorial quality.` },
    { slot: 'editorial', label: '摄影效果图', aspectRatio: '3:4', prompt: `Editorial fashion photography of a single garment. ${planText} Model wearing the piece, soft natural light, outdoor/studio setting, luxurious atmosphere.` },
  ];
}

/**
 * POST /api/teams/:teamId/design/generate
 * body: { mode: 'single'|'illustration'|'collection', plan: string }
 * 返回: { images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/generate', async (req, res) => {
  const { mode = 'single', plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  const slots = planImages(mode, plan);
  // 并行生成——总耗时取决于最慢的单张(而非 N 张串联),避免撑过 nginx proxy_read_timeout
  const results = await Promise.all(slots.map(async (slot) => {
    try {
      const r = await generateImage(slot.prompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: slot.slot,
      });
      if (r) return { slot: slot.slot, label: slot.label, url: r.url, prompt: r.prompt };
      return { slot: slot.slot, label: slot.label, error: '生成失败', prompt: slot.prompt };
    } catch (e) {
      console.error(`[design-generator] slot ${slot.slot} error:`, e?.message || String(e));
      return { slot: slot.slot, label: slot.label, error: '生成失败', prompt: slot.prompt };
    }
  }));
  res.json({ mode, images: results });
});

/**
 * POST /api/teams/:teamId/design/regenerate
 * body: { slot: string, label: string, plan: string, instruction: string }
 * 返回: { slot, label, url, prompt, error? }
 */
router.post('/regenerate', async (req, res) => {
  const { slot = 'flat', label = '图', plan, instruction = '' } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  // 在 plan 基础上叠加修图指令
  const baseSlots = planImages('single', plan); // 统一用 single 的 slot 结构
  const base = baseSlots.find((s) => s.slot === slot) || { aspectRatio: '3:4', prompt: plan };
  const finalPrompt = instruction
    ? `${base.prompt} Modification: ${instruction}`
    : base.prompt;

  const r = await generateImage(finalPrompt, {
    teamId: req.team.id,
    aspectRatio: base.aspectRatio,
    safeName: slot,
  });
  if (r) {
    res.json({ slot, label: r ? label : label, url: r.url, prompt: r.prompt });
  } else {
    res.status(500).json({ slot, label, error: '生成失败', prompt: finalPrompt });
  }
});

module.exports = router;
