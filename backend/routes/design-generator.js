'use strict';

/**
 * design-generator —— 设计工作流图片生成路由。
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
 * 单品图片 slot 模板生成器。
 * 根据 plan 中出现的品类关键词,切换描述用语(服装/包包/配饰/家居/文创)。
 *
 * clothing → 默认用语(garment / garment photography / flat sketch)
 * bag      → tote / handbag / bag product
 * accessory→ accessory / jewelry
 * home     → home object / lifestyle product
 * stationery→ stationery / paper goods
 */
function singleSlots(planText) {
  const p = planText.toLowerCase();
  // 简单启发式:匹配中文/英文关键词确定品类
  const isBag = /包|bag|tote|handbag/.test(p);
  const isAccessory = /配饰|首饰|帽子|围巾|项链|戒指|accessory|jewelry|hat|scarf/.test(p);
  const isHome = /家居|抱枕|香薰|餐具|花瓶|cushion|candle|vase|home/.test(p);
  const isStationery = /文创|明信片|贴纸|手账|贴纸|stationery|sticker|postcard/.test(p);

  // 根据品类挑主语词(用于替换 "garment")
  let noun = 'fashion garment';
  let detailNoun = 'stitching, buttons, craftsmanship';
  if (isBag) { noun = 'designer handbag'; detailNoun = 'stitching, hardware, strap, closure'; }
  else if (isAccessory) { noun = 'designer accessory'; detailNoun = 'material texture, clasp, fine detail, craftsmanship'; }
  else if (isHome) { noun = 'home lifestyle product'; detailNoun = 'material texture, surface finish, craftsmanship'; }
  else if (isStationery) { noun = 'stationery product'; detailNoun = 'print detail, paper texture, color accuracy'; }

  return [
    { slot: 'flat', label: '白底效果图', aspectRatio: '3:4',
      prompt: `Product photo, single ${noun} on pure white background. ${planText} Clean studio lighting, front view, sharp detail, e-commerce style.` },
    { slot: 'tech', label: '款式结构图', aspectRatio: '3:4',
      prompt: `Technical flat sketch of a ${noun}. ${planText} Front + back view, clean line art, design detail callouts, spec annotations, white background.` },
    { slot: 'detail', label: '细节图', aspectRatio: '1:1',
      prompt: `Extreme close-up detail shot of a ${noun}. ${planText} ${detailNoun}, soft studio lighting, editorial quality.` },
    { slot: 'editorial', label: '场景效果图', aspectRatio: '3:4',
      prompt: `Editorial lifestyle photo featuring a ${noun}. ${planText} Styled in a realistic setting, soft natural light, premium brand atmosphere, luxurious mood.` },
  ];
}

/**
 * 按类别推导出需要生成的图片列表。
 * 每张图有 slot(用途标识)、prompt(英文 prompt)、label(中文说明)、aspectRatio。
 */
function planImages(mode, plan) {
  const planText = (plan || '').trim();
  if (mode === 'illustration') {
    // 插画 = 1:1 正方形 · 纯图案(碎花等可居中或平铺) · 不要服装/人物
    return [{
      slot: 'illustration',
      label: '插画图案',
      aspectRatio: '1:1',
      prompt: `Create a seamless 1:1 square illustration artwork. Subject: ${planText}.

Rules:
- Output is a clean 1:1 square artwork, suitable as a fabric print or surface pattern.
- NO clothing, NO human figures, NO models, NO garments, NO fashion poses.
- Subject is centered on a solid pastel/white background, or as a repeatable tile pattern that fills the canvas (e.g. floral=scattered scatter, motif=centered emblem).
- Style: flat vector / watercolor-textile / modern minimal, editorial quality.
- High detail, crisp edges, commercially printable.`,
    }];
  }
  if (mode === 'collection') {
    // 系列 = 系列总览 + 色彩企划 + 默认示意款 4 张
    const out = [
      { slot: 'collection-overview', label: '系列总览', aspectRatio: '16:9',
        prompt: `Product collection lookbook overview. ${planText} Items arranged in a grid, cohesive color story, editorial styling, premium brand catalog layout.` },
      { slot: 'collection-color', label: '色彩企划', aspectRatio: '1:1',
        prompt: `Color palette storyboard for a collection. ${planText} Color chips, material swatches, mood hues, premium brand identity, editorial flat photography.` },
    ];
    // 示意款 4 张,按品类自适应
    const heroSlots = singleSlots(planText);
    // hero 前缀一下 slot 名避免与 collection 冲突
    out.push(...heroSlots.map((s) => ({ ...s, slot: 'hero-' + s.slot, label: '主款' + s.label })));
    return out;
  }
  // default: single 单品(品类自适应)
  return singleSlots(planText);
}

/**
 * POST /api/teams/:teamId/design/generate
 * body: { mode: 'single'|'illustration'|'collection', plan: string, provider?: 'glm'|'ark' }
 * 返回: { images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/generate', async (req, res) => {
  const { mode = 'single', plan, provider } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  // provider 可选,未传则走 env IMAGE_PROVIDER → glm 兜底(向后兼容)
  const imgOptsBase = { provider };
  const slots = planImages(mode, plan);
  // 并行生成——总耗时取决于最慢的单张(而非 N 张串联),避免撑过 nginx proxy_read_timeout
  const results = await Promise.all(slots.map(async (slot) => {
    try {
      const r = await generateImage(slot.prompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: slot.slot,
        ...imgOptsBase,
      });
      // gen-image 成功返回 {url},失败返回 {error}(已含 provider 真实原因)
      if (r?.url) return { slot: slot.slot, label: slot.label, url: r.url, prompt: r.prompt };
      return { slot: slot.slot, label: slot.label, error: r?.error || '生成失败', prompt: slot.prompt };
    } catch (e) {
      console.error(`[design-generator] slot ${slot.slot} error:`, e?.message || String(e));
      return { slot: slot.slot, label: slot.label, error: e?.message || '生成失败', prompt: slot.prompt };
    }
  }));
  res.json({ mode, images: results });
});

/**
 * POST /api/teams/:teamId/design/regenerate
 * body: { slot: string, label: string, plan: string, instruction: string, provider?: 'glm'|'ark' }
 * 返回: { slot, label, url, prompt, error? }
 */
router.post('/regenerate', async (req, res) => {
  const { slot = 'flat', label = '图', plan, instruction = '', provider } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  // 在 plan 基础上叠加修图指令
  // 拼合全部模式下的 slot,按 slot 名匹配(含 collection 的 hero- 前缀);找不到就按 slot 名回退
  const baseSlots = [...planImages('single', plan), ...planImages('illustration', plan), ...planImages('collection', plan)];
  const base = baseSlots.find((s) => s.slot === slot) || { aspectRatio: '1:1', prompt: plan };
  const finalPrompt = instruction
    ? `${base.prompt} Modification: ${instruction}`
    : base.prompt;

  const r = await generateImage(finalPrompt, {
    teamId: req.team.id,
    aspectRatio: base.aspectRatio,
    safeName: slot,
    provider,
  });
  if (r?.url) {
    res.json({ slot, label, url: r.url, prompt: r.prompt });
  } else {
    res.status(500).json({ slot, label, error: r?.error || '生成失败', prompt: finalPrompt });
  }
});

module.exports = router;
