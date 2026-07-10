'use strict';

/**
 * design-generator —— 设计工作流图片生成路由。
 *
 * 挂在 `/api/teams/:teamId/design`,由 team-workbench.js 的 sub-router 挂载。
 *
 * POST /api/teams/:teamId/design/generate       —— 按设计企划批量生成图片
 * POST /api/teams/:teamId/design/regenerate     —— 单张图重生成(修图)
 * POST /api/teams/:teamId/design/lineart        —— 生成设计线稿(单品/系列)
 * POST /api/teams/:teamId/design/generate-final —— 材料驱动的最终成图
 * POST /api/teams/:teamId/design/recommend-materials —— AI 材料推荐(库内+库外)
 */

const express = require('express');
const { generateImage } = require('../lib/gen-image');
const { callArkStream } = require('../workflow-executor');

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
 * 线稿(设计稿模式)slot —— single / collection 各 1 张线稿/三视图草图。
 * 与 planImages 的关键区别:输出黑白/灰阶线稿(用于用户确认结构),而非最终产品图。
 */
function planLineart(mode, plan) {
  const planText = (plan || '').trim();
  if (mode === 'collection') {
    return [{
      slot: 'lineart',
      label: '系列线稿',
      aspectRatio: '16:9',
      prompt: `Technical line drawing of a fashion collection overview. ${planText}.

Show ALL pieces of the collection as flat-sketches (technical line drawings) arranged in a clean editorial grid on pure white background.
Clean construction lines only, NO shading, NO color, NO background clutter, NO text.
All pieces visible in one frame, evenly spaced, premium catalog-line layout.`,
    }];
  }
  // default: single 单品 —— 1 张线稿(服装:正/反面; 物品:三视图)
  const noun = pickNoun(planText);
  const isClothing = isClothingCategory(planText);
  const viewDesc = isClothing
    ? 'Shows BOTH front view and back view of the garment as a technical flat-sketch in one image — clean construction lines, front and back clearly visible.'
    : 'Shows three professional views as a technical line drawing — front view, side view, and back/top view, arranged in a clean 3-view product layout.';
  return [{
    slot: 'lineart',
    label: isClothing ? '服装线稿(正反面)' : '物品线稿(三视图)',
    aspectRatio: '1:1',
    prompt: `Technical flat-sketch, single ${noun} on pure white background. ${planText}.

${viewDesc}
Clean construction lines only, NO shading, NO color, NO background clutter, NO text, NO model, pure white backdrop.
Catalog-quality technical drawing.`,
  }];
}

/**
 * POST /api/teams/:teamId/design/lineart —— 生成线稿(设计稿模式)
 * body: { mode: 'single'|'collection', plan: string, provider?: 'ark' }
 * 返回: { mode, images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/lineart', async (req, res) => {
  const { mode = 'single', plan, provider } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });
  if (mode === 'illustration') {
    // 插画不进线稿流程,回退到标准图(防御性)
    return res.redirect(307, req.originalUrl.replace('/lineart', '/generate'));
  }
  const imgOptsBase = { provider };
  const slots = planLineart(mode, plan);
  const results = await Promise.all(slots.map(async (slot) => {
    try {
      const r = await generateImage(slot.prompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: slot.slot,
        ...imgOptsBase,
      });
      if (r?.url) return { slot: slot.slot, label: slot.label, url: r.url, prompt: r.prompt };
      return { slot: slot.slot, label: slot.label, error: r?.error || '生成失败', prompt: slot.prompt };
    } catch (e) {
      console.error(`[design-generator] lineart slot ${slot.slot} error:`, e?.message || String(e));
      return { slot: slot.slot, label: slot.label, error: e?.message || '生成失败', prompt: slot.prompt };
    }
  }));
  res.json({ mode, images: results });
});

/**
 * POST /api/teams/:teamId/design/generate
 * body: { mode: 'single'|'illustration'|'collection', plan: string, provider?: 'ark' }
 * 返回: { images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/generate', async (req, res) => {
  const { mode = 'single', plan, provider } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  // provider 可选,未传则走 ark(唯一生图 provider,向后兼容)
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
 * body: { slot, label, plan, instruction, provider?, mode?, material? }
 *  - mode / material 同时存在时,最终图修图自动叠加材料描述到 base prompt
 * 返回: { slot, label, url, prompt, error? }
 */
router.post('/regenerate', async (req, res) => {
  const { slot = 'flat', label = '图', plan, instruction = '', provider, mode, material } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  // 在 plan 基础上叠加修图指令
  // 拼合全部模式下的 slot(含线稿),按 slot 名匹配;找不到就按 slot 名回退
  const baseSlots = [
    ...planImages('single', plan), ...planImages('illustration', plan), ...planImages('collection', plan),
    ...planLineart('single', plan), ...planLineart('collection', plan),
  ];
  let base = baseSlots.find((s) => s.slot === slot);
  let aspectRatio = base?.aspectRatio || '1:1';

  // 最终图修图:slot 名为 'final' 走 generate-final 的产品图框架 + 材料描述
  if (!base && slot === 'final' && material && material.name && mode) {
    const mi = planImages(mode, plan)[0];
    const desc = [
      `Material: ${material.name}.`,
      material.composition || material.texture ? `${[material.composition, material.texture].filter(Boolean).join(' · ')}.` : '',
      material.finish ? `Finish: ${material.finish}.` : '',
      (Array.isArray(material.colors) && material.colors.length) ? `Material colors: ${material.colors.join(', ')}.` : '',
    ].filter(Boolean).join('\n');
    base = { prompt: `${mi.prompt}\n\n${desc}\nMatch the material qualities described above (texture, weight, drape, finish, color).`, aspectRatio: mi.aspectRatio };
    aspectRatio = mi.aspectRatio;
  }
  if (!base) base = { aspectRatio: '1:1', prompt: plan };

  const finalPrompt = instruction
    ? `${base.prompt} Modification: ${instruction}`
    : base.prompt;

  const r = await generateImage(finalPrompt, {
    teamId: req.team.id,
    aspectRatio,
    safeName: slot,
    provider,
  });
  if (r?.url) {
    res.json({ slot, label, url: r.url, prompt: r.prompt });
  } else {
    res.status(500).json({ slot, label, error: r?.error || '生成失败', prompt: finalPrompt });
  }
});

/**
 * 用 LLM 基于设计方案,推荐 1 个最合适的材质 + 配色方案(不限材料库,自由推荐)。
 * body: { plan: string, lineartUrl?: string }
 * 返回: { recommendation: { name, category?, texture?, composition?, finish?, reason?, colors: string[] } }
 */
router.post('/recommend-materials', async (req, res) => {
  const { plan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  const system = `你是 Laisse Ancie (来兮·安兮)的材料与配色顾问。基于下面的设计方案,提出 1 个最合适的面料 + 色彩方案。

## 规则
- 结合方案的触感、克重、垂感、光泽、季节、风格调性推荐材质。
- 配色方案(3–5 个 hex 色)需与方案情绪 / 季节匹配。
- 只输出严格的 JSON(不要解释、不要 Markdown 代码块外文字):

{ "recommendation": {
    "name": "面料名(中文,具体到品类/工艺,如「真丝双绉」「棉麻平纹」「水洗羊毛呢」)",
    "category": "面料",
    "texture": "触感/表面描述(如:光滑垂坠/粗粝自然/蓬松柔软)",
    "composition": "成分/克重(如:100%桑蚕丝 16mm/棉麻 200gsm)",
    "finish": "后整工艺(如:哑光/轻度水洗/丝光/涂层,可省略)",
    "colors": ["#hex主色","#hex辅色","#hex点缀色"],
    "reason": "一句话理由(结合触感/垂感/光泽/季节/风格)"
}}`;

  const prompt = `## 设计方案
${plan}

请输出推荐 JSON。`;

  try {
    // 用流式调用但收集全部文本(非流式结果,一次返回)
    let fullText = '';
    await callArkStream(system, prompt, 1024, {
      onDelta: (d) => { fullText += d; },
    });
    // 解析 JSON(容错:去掉首尾 ```json 包裹)
    const cleaned = fullText.replace(/```(?:json)?/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('no JSON');
    const data = JSON.parse(cleaned.slice(start, end + 1));
    const rec = data?.recommendation;
    if (!rec || typeof rec.name !== 'string' || !Array.isArray(rec.colors)) {
      throw new Error('malformed recommendation');
    }
    // sanitize
    const sanitized = {
      name: String(rec.name).slice(0, 60),
      category: rec.category ? String(rec.category).slice(0, 20) : '面料',
      texture: rec.texture ? String(rec.texture).slice(0, 60) : undefined,
      composition: rec.composition ? String(rec.composition).slice(0, 60) : undefined,
      finish: rec.finish ? String(rec.finish).slice(0, 40) : undefined,
      reason: rec.reason ? String(rec.reason).slice(0, 100) : undefined,
      colors: rec.colors.filter((c) => typeof c === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(c)).slice(0, 5)
        .map((c) => c.startsWith('#') ? c : `#${c}`),
    };
    if (sanitized.colors.length === 0) sanitized.colors = ['#E8D5B7', '#C4A882', '#6B5B45'];
    res.json({ recommendation: sanitized });
  } catch (e) {
    console.error('[design-generator] recommend-materials failed:', e?.message || String(e));
    // 失败兜底:返回空壳推荐,让用户手动填写
    res.json({
      recommendation: null,
      notice: 'AI 推荐暂不可用,请手动填写材质与配色。',
      fallback: true,
    });
  }
});

/**
 * POST /api/teams/:teamId/design/generate-final —— 材料驱动的最终成图
 * body: { mode: 'single'|'collection', plan: string, material: MaterialRow, provider?: 'ark' }
 * 返回: { mode, images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/generate-final', async (req, res) => {
  const { mode = 'single', plan, material, provider } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });
  if (!material || !material.name) return res.status(400).json({ error: 'material required' });

  // 最终图 base prompt(复用 planImages 的产品图描述)
  const baseSlots = planImages(mode, plan);
  const materialDesc = [
    `Material: ${material.name}.`,
    material.composition || material.texture ? `${[material.composition, material.texture].filter(Boolean).join(' · ')}.` : '',
    material.finish ? `Finish: ${material.finish}.` : '',
    (Array.isArray(material.colors) && material.colors.length) ? `Material colors: ${material.colors.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
  const refImage = material.image || null;

  const imgOptsBase = { provider, referenceImageUrl: refImage || undefined };
  const results = await Promise.all(baseSlots.map(async (slot) => {
    try {
      const finalPrompt = `${slot.prompt}\n\n${materialDesc}\nMatch the material qualities described above (texture, weight, drape, finish, color).`;
      const r = await generateImage(finalPrompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: `final-${slot.slot}`,
        ...imgOptsBase,
      });
      if (r?.url) return { slot: 'final', label: `${slot.label} · ${material.name}`, url: r.url, prompt: r.prompt };
      return { slot: 'final', label: `${slot.label} · ${material.name}`, error: r?.error || '生成失败', prompt: finalPrompt };
    } catch (e) {
      console.error(`[design-generator] generate-final slot ${slot.slot} error:`, e?.message || String(e));
      return { slot: 'final', label: `${slot.label} · ${material.name}`, error: e?.message || '生成失败', prompt: '' };
    }
  }));
  res.json({ mode, images: results });
});

module.exports = router;
