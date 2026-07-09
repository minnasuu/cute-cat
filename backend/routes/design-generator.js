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
 * 根据 plan 出现的品类关键词判断是否为服装(否则按物品处理)。
 * 服装 → 正反面平铺在一张图; 物品 → 三视图(主视/侧视/俯视)在一张图。
 */
function isClothingCategory(planText) {
  const p = planText.toLowerCase();
  // 明确匹配到非服装品类 → 走物品
  const nonClothing = /包|bag|tote|handbag|配饰|首饰|帽子|围巾|项链|戒指|accessory|jewelry|hat|scarf|家居|抱枕|香薰|餐具|花瓶|cushion|candle|vase|home|文创|明信片|贴纸|手账|sticker|postcard|手机壳|phone case/.test(p);
  if (nonClothing) return false;
  // 其余(含明确服装关键词或完全没提到物品关键词)都走服装
  return true;
}

function pickNoun(planText) {
  const p = planText.toLowerCase();
  if (/包|bag|tote|handbag/.test(p)) return 'designer handbag';
  if (/配饰|首饰|帽子|围巾|项链|戒指|accessory|jewelry|hat|scarf/.test(p)) return 'designer accessory';
  if (/家居|抱枕|香薰|餐具|花瓶|cushion|candle|vase|home/.test(p)) return 'home lifestyle product';
  if (/文创|明信片|贴纸|手账|sticker|postcard/.test(p)) return 'stationery product';
  return 'fashion garment';
}

/**
 * 按类别推导需要生成的图片列表 —— 每个 mode 只生成 1 张整合图:
 *   illustration → 1:1 印花图案(可满铺或居中,能直接用于印花)
 *   single       → 1 张整合图(服装:正反面平铺 / 物品:三视图)
 *   collection   → 16:9 系列总览(所有款一起展示)
 * 每张图有 slot(用途标识)、prompt(英文 prompt)、label(中文说明)、aspectRatio。
 */
function planImages(mode, plan) {
  const planText = (plan || '').trim();
  if (mode === 'illustration') {
    // 插画 = 1:1 正方形 · 纯图案,能直接用于印花(满铺或居中) · 不要服装/人物
    return [{
      slot: 'illustration',
      label: '印花图案',
      aspectRatio: '1:1',
      prompt: `Create a seamless 1:1 square illustration artwork optimized for fabric / surface printing. Subject: ${planText}.

Rules:
- Output is a clean 1:1 square, commercially printable at high resolution.
- Design either: (a) fills the canvas as a repeatable tile pattern (scattered floral / all-over motif), OR (b) a single centered emblem / icon on a solid pastel / white background.
- NO clothing, NO human figures, NO models, NO garments, NO fashion poses, NO text.
- Style: flat vector / watercolor-textile / modern minimal, editorial quality.
- Crisp edges, high detail, suitable for textile printing or surface-pattern reproduction.`,
    }];
  }
  if (mode === 'collection') {
    // 系列 = 1 张 16:9 总览,把系列所有款一次性展示在同一画面
    return [{
      slot: 'collection',
      label: '系列总览',
      aspectRatio: '16:9',
      prompt: `Fashion collection overview flat-lay photograph. ${planText}.

Show ALL pieces of the collection arranged together in a clean, cohesive editorial grid on pure white background.
Each piece is flat-laid or hung neatly, with consistent studio lighting and a unified color story.
Premium brand catalog layout, catalog-quality photography, evenly spaced, the full collection visible in one frame.`,
    }];
  }
  // default: single 单品 —— 1 张整合图
  // 服装 → 正反面平铺在一张图; 物品 → 三视图(主视/侧视/俯视)在一张图
  const noun = pickNoun(planText);
  const isClothing = isClothingCategory(planText);
  const viewDesc = isClothing
    ? 'Shows BOTH front view and back view of the garment together in one image — clean flat-laid layout on pure white background, shot from directly above.'
    : 'Shows three professional views in one image — front view, side view, and back/top view, arranged in a clean 3-view product layout on pure white background.';
  return [{
    slot: 'single',
    label: isClothing ? '服装平铺(正反面)' : '物品三视图',
    aspectRatio: '1:1',
    prompt: `Product photography, single ${noun} on pure white background. ${planText}.

${viewDesc}
Clean studio lighting, sharp detail, e-commerce catalog style. No model, no mannequin, no background clutter, pure white backdrop.`,
  }];
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
