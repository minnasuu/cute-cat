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
 * POST /api/teams/:teamId/design/material-combo —— 材料组合:面料图+款式参考+品牌 → 白底效果图
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { generateImage } = require('../lib/gen-image');
const { callArkStream } = require('../workflow-executor');
const { analyzeInspiration } = require('../lib/analyze-inspiration');
const storage = require('../lib/storage');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { findOwned } = require('../lib/laisse-ancie-helpers');

const router = express.Router();

// ── material-combo 守卫常量 ───────────────────────────────────
const MAX_FABRIC = 6;
const MAX_STYLE = 6;
const MAX_CELLS = MAX_FABRIC * MAX_STYLE;        // 36 张上限
const MC_BATCH_CAP = Number.parseInt(process.env.MC_BATCH_CAP || '', 10) || 4; // 并发生成上限
const MC_BATCH_TTL_MS = 15 * 60 * 1000;           // 批次在内存保留 15 分钟

// ── material-combo 专用 multer ─────────────────────────────────
const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(storage.TMP_DIR, { recursive: true });
    cb(null, storage.TMP_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `mc-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}${ext}`);
  },
});
const mcUpload = multer({
  storage: multerStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime'));
  },
}).fields([
  { name: 'fabrics', maxCount: MAX_FABRIC },
  { name: 'styles', maxCount: MAX_STYLE },
]);

/** 把 multer 暂存文件落到最终位置(本地或 S3),返回公网/相对 URL(saveUpload 内部会压缩) */
async function persistTempFile(tmpPath, filename, mime) {
  const savePath = storage.createSavePath(`design/material-combo`, filename);
  await storage.saveUpload(tmpPath, savePath, mime);
  return storage.getPublicUrl(savePath);
}

/**
 * 并发池:worker-pool 模式,任务按 index 有序完成。
 * @param {Array<() => Promise<any>>} tasks
 * @param {number} cap 并发上限
 * @param {(index:number, result:any)=>void} [onProgress] 每个任务完成回调
 */
async function mapConcurrent(tasks, cap, onProgress) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(cap, tasks.length) || 1 }, async () => {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { value: await tasks[i]() };
      } catch (e) {
        results[i] = { error: e?.message || String(e) };
      }
      onProgress?.(i, results[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── material-combo 批次 store (进程内,带 TTL 清理) ────────────
/** @type {Map<string, {teamId:string,name:string,description:string,brand?:any,fabrics:Array,styles:Array,items:Array,status:string,createdAt:number,updatedAt:number,error?:string}>} */
const mcBatches = new Map();

function batchPublicView(b) {
  const completed = b.items.filter((it) => it.status === 'done').length;
  const failed = b.items.filter((it) => it.status === 'error').length;
  return {
    batchId: b.batchId,
    teamId: b.teamId,
    status: b.status,
    error: b.error,
    name: b.name,
    fabrics: b.fabrics.map((f) => ({ url: f.url, name: f.name, text: f.text })),
    styles: b.styles.map((s) => ({ url: s.url, name: s.name, text: s.text })),
    items: b.items.map((it) => ({ fi: it.fi, si: it.si, status: it.status, url: it.url, error: it.error, prompt: it.prompt })),
    total: b.items.length,
    completed,
    failed,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** 清理过期批次,每 30s 扫一次 */
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of mcBatches) {
    if (now - b.updatedAt > MC_BATCH_TTL_MS) mcBatches.delete(id);
  }
}, 30000).unref();

/** 单批次生成调度:对每个 cell 构建 prompt 并调 generateImage */
async function runBatch(batchId) {
  const b = mcBatches.get(batchId);
  if (!b) return;
  try {
    b.status = 'running';
    b.updatedAt = Date.now();

    const tasks = b.items.map((cell) => async () => {
      const fabric = b.fabrics[cell.fi];
      const style = b.styles[cell.si];
      if (!fabric || !style) {
        cell.status = 'error';
        cell.error = '该格的面料或款式分析结果缺失';
        return cell;
      }
      const prompt = buildMaterialComboPrompt({
        name: b.name,
        description: b.description,
        brand: b.brand,
        fabric,
        style,
      });
      cell.prompt = prompt;
      const img = await generateImage(prompt, {
        teamId: b.teamId,
        aspectRatio: '1:1',
        safeName: `material-combo-f${cell.fi}-s${cell.si}`,
      });
      if (img?.url) {
        cell.url = img.url;
        cell.status = 'done';
      } else {
        cell.error = img?.error || '生成失败';
        cell.status = 'error';
      }
      return cell;
    });

    await mapConcurrent(tasks, MC_BATCH_CAP);

    b.updatedAt = Date.now();
    // 全部完成(或失败) → 批次终态
    b.status = b.items.every((it) => it.status === 'done') ? 'done'
      : b.items.some((it) => it.status === 'done') ? 'done'
      : b.status = 'error';
  } catch (e) {
    console.error(`[design-generator] runBatch ${batchId} error:`, e?.message || String(e));
    b.status = 'error';
    b.error = e?.message || '批次生成异常';
    b.updatedAt = Date.now();
    // 剩余 pending 格标 error,避免永远 pending
    for (const it of b.items) {
      if (it.status === 'pending') { it.status = 'error'; it.error = b.error; }
    }
  }
}

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
/**
 * 把参考灵感数组压成一段视觉引导文本,追加到线稿 prompt。
 * 每个参考灵感取 category / visualStyle / designApproach / styleFeatures / colors ——
 * 让线稿在结构、元素、配色上贴近灵感图,同时保持 SeedDream 纯文本输入兼容。
 */
function buildReferenceVisionBlock(referenceImages) {
  if (!Array.isArray(referenceImages) || !referenceImages.length) return "";
  const lines = referenceImages.map((r, i) => {
    const head = `Reference ${i + 1} (${r.category ?? "inspiration"}):`;
    const bits = [];
    if (r.visualStyle) bits.push(`visual style ${r.visualStyle}`);
    if (r.designApproach) bits.push(`design approach ${r.designApproach}`);
    if (r.styleFeatures?.length) bits.push(`key features ${r.styleFeatures.join(", ")}`);
    if (r.designHighlights?.length) bits.push(`highlights ${r.designHighlights.join(", ")}`);
    if (r.colors?.length) bits.push(`palette ${r.colors.join(", ")}`);
    const body = bits.join("; ");
    return body ? `${head} ${body}` : null;
  }).filter(Boolean);
  if (!lines.length) return "";
  return `\n\nVisual references — draw structural, stylistic, and color guidance from these inspiration images: ${lines.join(". ")}. Incorporate their silhouettes, motifs, composition, and palette into the line drawing.`;
}

/**
 * POST /api/teams/:teamId/design/lineart —— 生成线稿(设计稿模式)
 * body: { mode: 'single'|'collection', plan: string, provider?: 'ark',
 *         referenceImages?: [{ url, category?, visualStyle?, designApproach?, styleFeatures?, designHighlights?, colors? }] }
 * 返回: { mode, images: [{ slot, label, url, prompt, error? }] }
 */
router.post('/lineart', async (req, res) => {
  const { mode = 'single', plan, provider, referenceImages } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });
  if (mode === 'illustration') {
    // 插画不进线稿流程,回退到标准图(防御性)
    return res.redirect(307, req.originalUrl.replace('/lineart', '/generate'));
  }
  const imgOptsBase = { provider };
  const slots = planLineart(mode, plan);
  const results = await Promise.all(slots.map(async (slot) => {
    try {
      // 把参考灵感视觉描述注入线稿 prompt;把首图 URL 作为参考图传入 gen-image
      // (当前 SeedDream 忽略 referenceImageUrl,留作 imageRef provider 扩展点)
      const visionBlock = buildReferenceVisionBlock(referenceImages);
      const enrichedPrompt = visionBlock ? `${slot.prompt}${visionBlock}` : slot.prompt;
      const referenceImageUrl = (Array.isArray(referenceImages) && referenceImages[0]?.url) || undefined;
      const r = await generateImage(enrichedPrompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: slot.slot,
        referenceImageUrl,
        ...imgOptsBase,
      });
      if (r?.url) return { slot: slot.slot, label: slot.label, url: r.url, prompt: enrichedPrompt };
      return { slot: slot.slot, label: slot.label, error: r?.error || '生成失败', prompt: enrichedPrompt };
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

/**
 * POST /api/teams/:teamId/design/material-combo —— 材料组合:m×n 矩阵 → m×n 张白底效果图
 *
 * multipart form-data:
 *   - name: string (产品名称)
 *   - description: string (其他描述)
 *   - fabrics: file[] (1–6 张面料图片)
 *   - styles: file[] (1–6 张款式参考图片)
 *   - brand: JSON string (可选,品牌信息;不传则从 DB 读)
 *
 * 流程:
 *   1. 守卫校验(名称 / 文件数 / ≤36 张组合)
 *   2. 并行持久化所有文件 + 上传
 *   3. Ark 并行分析所有面料(材质/色彩/质感)与款式(廓形/结构/细节)
 *   4. 构建 m×n batch,每格 status='pending'
 *   5. 202 立即返回 batchId + 分析结果(前端轮询 /batch/:id)
 *   6. fire-and-forget runBatch:每格构建 prompt + Maizi 生图,并发上限 MC_BATCH_CAP
 *
 * 返回 202: { batchId, status:'running', fabrics, styles, items, total, completed, failed }
 */
router.post('/material-combo', (req, res) => {
  mcUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      console.error('[design-generator] material-combo upload error:', uploadErr.message);
      return res.status(400).json({ error: `上传失败: ${uploadErr.message}` });
    }
    const files = req.files || {};
    const fabricFiles = files.fabrics ?? [];
    const styleFiles = files.styles ?? [];
    const { name = '', description = '' } = req.body || {};

    // 解析每种槽位的元数据(前端始终上传):按位置决定上传 or 库行
    let fabricsMeta = [];
    let stylesMeta = [];
    try { if (req.body?.fabricsMeta) fabricsMeta = JSON.parse(req.body.fabricsMeta); } catch {}
    try { if (req.body?.stylesMeta) stylesMeta = JSON.parse(req.body.stylesMeta); } catch {}
    if (!Array.isArray(fabricsMeta) || !fabricsMeta.length) {
      return res.status(400).json({ error: 'fabricsMeta 缺失或为空' });
    }
    if (!Array.isArray(stylesMeta) || !stylesMeta.length) {
      return res.status(400).json({ error: 'stylesMeta 缺失或为空' });
    }

    // 守卫(基于元数据数组长度 —— 即「槽位数」,而非文件数)
    if (!name.trim()) return res.status(400).json({ error: '请填写名称' });
    if (fabricsMeta.length > MAX_FABRIC) return res.status(400).json({ error: `面料最多 ${MAX_FABRIC} 项` });
    if (stylesMeta.length > MAX_STYLE) return res.status(400).json({ error: `款式最多 ${MAX_STYLE} 项` });
    const totalCells = fabricsMeta.length * stylesMeta.length;
    if (totalCells > MAX_CELLS) return res.status(400).json({ error: `面料×款式组合超过 ${MAX_CELLS} 张上限` });
    // 文件数必须等于「上传」槽位数(后端只接 order 一致的上传文件)
    const uploadFabricCount = fabricsMeta.filter((m) => m.kind === 'upload').length;
    const uploadStyleCount = stylesMeta.filter((m) => m.kind === 'upload').length;
    if (uploadFabricCount !== fabricFiles.length) {
      return res.status(400).json({ error: `面料文件数不匹配,期望 ${uploadFabricCount},收到 ${fabricFiles.length}` });
    }
    if (uploadStyleCount !== styleFiles.length) {
      return res.status(400).json({ error: `款式文件数不匹配,期望 ${uploadStyleCount},收到 ${styleFiles.length}` });
    }

    try {
      const brand = await resolveBrand(req);

      // 按 fabricsMeta 顺序构建面料行,上传文件逐条消耗(kind==='upload' 才取下一个)
      let fIdx = 0;
      const fabrics = [];
      for (const meta of fabricsMeta) {
        if (meta.kind === 'upload') {
          const f = fabricFiles[fIdx++];
          const url = await persistTempFile(f.path, f.filename, f.mimetype);
          let text = '';
          let raw = '';
          try {
            const a = await analyzeFabric(f, url);
            text = a?.text || '';
            raw = a?.raw || '';
          } catch (e) {
            console.warn(`[design-material-combo] 面料分析失败: ${e?.message}`);
            text = '';
          }
          fabrics.push({ name: meta.name || f.originalname || `面料${fabrics.length + 1}`, url, text, raw });
        } else {
          // library-fabric:从材料库取值,合成分析文本
          const rec = await findOwned(prisma.lAMaterial, meta.matId, req.team.id);
          if (!rec) {
            console.warn(`[design-material-combo] 找不到面料 id=${meta.matId}`);
            fabrics.push({ name: '(面料不存在)', url: meta.hex ? '' : '', text: '面料不存在或无权访问', raw: '' });
            continue;
          }
          const cis = Array.isArray(rec.colorImages) ? rec.colorImages : [];
          const ci = meta.colorIdx >= 0 ? cis[meta.colorIdx] : null;
          const url = (ci && ci.url) || rec.image || '';
          const colorName = ci?.name ? ` · ${ci.name}` : (meta.hex ? ` · ${meta.hex}` : '');
          fabrics.push({
            name: `${rec.name || '面料'}${colorName}`,
            url,
            text: fabricTextFromRecord(rec, meta.colorIdx),
            raw: '',
          });
        }
      }

      // 按 stylesMeta 顺序构建款式行
      let sIdx = 0;
      const styles = [];
      for (const meta of stylesMeta) {
        if (meta.kind === 'upload') {
          const f = styleFiles[sIdx++];
          const url = await persistTempFile(f.path, f.filename, f.mimetype);
          let text = '';
          let raw = '';
          try {
            const a = await analyzeStyleRef(f, url);
            text = a?.text || '';
            raw = a?.raw || '';
          } catch (e) {
            console.warn(`[design-material-combo] 款式分析失败: ${e?.message}`);
          }
          styles.push({ name: meta.name || f.originalname || `款式${styles.length + 1}`, url, text, raw });
        } else {
          // library-style:从款式库取值,合成分析文本
          const rec = await findOwned(prisma.lAStyle, meta.styleId, req.team.id);
          if (!rec) {
            console.warn(`[design-material-combo] 找不到款式 id=${meta.styleId}`);
            styles.push({ name: '(款式不存在)', url: '', text: '款式不存在或无权访问', raw: '' });
            continue;
          }
          styles.push({
            name: rec.name || '款式',
            url: rec.image || '',
            text: styleTextFromRecord(rec),
            raw: '',
          });
        }
      }

      // 3) 构建 batch(每格待生成)
      const batchId = `mc-${crypto.randomUUID()}`;
      const now = Date.now();
      const items = [];
      for (let fi = 0; fi < fabrics.length; fi++) {
        for (let si = 0; si < styles.length; si++) {
          items.push({ fi, si, status: 'pending' });
        }
      }
      const batch = {
        batchId,
        teamId: req.team.id,
        name: name.trim(),
        description: description.trim(),
        brand,
        fabrics,
        styles,
        items,
        status: 'running',
        createdAt: now,
        updatedAt: now,
      };
      mcBatches.set(batchId, batch);

      // 4) 202 立即返回,fire-and-forget 后台生成
      res.status(202).json(batchPublicView(batch));
      runBatch(batchId);
    } catch (e) {
      console.error('[design-generator] material-combo error:', e?.message || String(e));
      res.status(500).json({ error: e?.message || '生成失败' });
    }
  });
});

/**
 * GET /api/teams/:teamId/design/material-combo/batch/:batchId —— 轮询批次进度
 * 实时返回每格状态(pending/done/error)、url、error、prompt。
 * teamId 隔离校验:403,不存在:404。
 */
router.get('/material-combo/batch/:batchId', (req, res) => {
  const batch = mcBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });
  res.json(batchPublicView(batch));
});

/**
 * POST /api/teams/:teamId/design/material-combo/batch/:batchId/regenerate
 * 单格重试:对指定 (fi,si) 重新构建 prompt + Maizi 生图(自带超时+1次重试)。
 * 前端 optimistic 置回 pending,后端完成后覆盖 items 格。
 * 返回单格结果 { fi, si, status, url, error, prompt }。
 */
router.post('/material-combo/batch/:batchId/regenerate', async (req, res) => {
  const batch = mcBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });

  const fi = Number.parseInt(req.body?.fi, 10);
  const si = Number.parseInt(req.body?.si, 10);
  if (!Number.isInteger(fi) || !Number.isInteger(si)) {
    return res.status(400).json({ error: 'fi / si 必须为整数' });
  }
  const fabric = batch.fabrics[fi];
  const style = batch.styles[si];
  if (!fabric || !style) return res.status(400).json({ error: '无效的 fi / si' });

  const cell = batch.items.find((it) => it.fi === fi && it.si === si);
  if (!cell) return res.status(400).json({ error: '未找到对应的组合格' });

  // optimistic:立即标 pending 返回,后台重跑
  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  batch.updatedAt = Date.now();

  res.json({ fi, si, status: cell.status, url: cell.url, error: cell.error, prompt: cell.prompt });

  // 后台生成
  try {
    const prompt = buildMaterialComboPrompt({
      name: batch.name,
      description: batch.description,
      brand: batch.brand,
      fabric,
      style,
    });
    cell.prompt = prompt;
    const img = await generateImage(prompt, {
      teamId: batch.teamId,
      aspectRatio: '1:1',
      safeName: `material-combo-f${fi}-s${si}`,
    });
    if (img?.url) {
      cell.url = img.url;
      cell.status = 'done';
    } else {
      cell.error = img?.error || '生成失败';
      cell.status = 'error';
    }
  } catch (e) {
    console.error(`[design-generator] regenerate ${batchId} (${fi},${si}) error:`, e?.message || String(e));
    cell.error = e?.message || '生成异常';
    cell.status = 'error';
  } finally {
    batch.updatedAt = Date.now();
  }
});

// ─── material-combo helper ─────────────────────────────────────

/**
 * Ark 视觉分析面料图片:提取材质类型 / 表面质感 / 克重垂感 / 主色与配色图案。
 * 返回 { text, raw } —— text 为自然语言摘要(用于拼 prompt),raw 为原始 JSON。
 */
async function analyzeFabric(tmpFile, publicUrl) {
  const system = `你是 Laisse Ancie (来兮·安兮)的面料专家。基于用户给的面料图片做视觉分析,只输出严格的 JSON(不要 Markdown 代码块、不要寒暄、不要前后说明文字)。`;

  const prompt = `仔细观察这张面料图片 —— 它可能是一块服装面料(真丝/棉麻/羊毛/化纤...)、皮革、针织、蕾丝、或者其他服饰材质。

请输出 JSON 分析:
{
  "material": "材质类型(如:真丝双斜纹 / 棉麻平纹 / 羊毛法兰绒 / 牛皮)",
  "surface": "表面质感(如:哑光自然 / 光滑垂坠 / 粗粝颗粒感 / 细腻磨砂)",
  "weightDrape": "克重与垂感(如:轻薄飘逸 / 中等挺括 / 重磅有支撑)",
  "pattern": "图案纹理(如:纯色 / 细条纹 / 碎花提花 / 人字纹;纯色写「纯色」)",
  "colors": ["主色hex","辅色hex"],
  "bestFor": "最适合做的品类(如:连衣裙/衬衫/西装/半裙)"
}

只输出一个合法 JSON 对象,不要前后说明文字。`;

  return analyzeImageWithArk(tmpFile, publicUrl, system, prompt, 'fabric');
}

/**
 * Ark 视觉分析款式参考图片:提取廓形 / 结构细节 / 设计语言。
 */
async function analyzeStyleRef(tmpFile, publicUrl) {
  const system = `你是 Laisse Ancie (来兮·安兮)的版型与款式专家。基于用户给的款式参考图片做视觉分析,只输出严格的 JSON(不要 Markdown 代码块、不要寒暄、不要前后说明文字)。`;

  const prompt = `仔细观察这张款式参考图片 —— 它可能是一件服装(T恤、连衣裙、外套...)、配饰(包袋、鞋履、帽子...)或其他时尚单品。

请输出 JSON 分析:
{
  "silhouette": "整体廓形(如:A 型及膝 / 直筒长款 / 收腰X型 / 宽松oversized)",
  "category": "品类(如:连衣裙 / 衬衫 / 托特包 / 针织开衫)",
  "structure": "结构细节(如:小翻领 / 无领杯领 / 插肩缝 / 对开式门襟 / 隐形拉链)",
  "designLanguage": "设计语言与风格关键词(如:极简Clean Fit / 法式田园 / 都市通勤 / Y2K未来感;用2–5个短语)",
  "keyDetails": "最突出的1–2个设计亮点(如:泡泡袖、荷叶边下摆、明线装饰)"
}

只输出一个合法 JSON 对象,不要前后说明文字。`;

  return analyzeImageWithArk(tmpFile, publicUrl, system, prompt, 'style');
}

/**
 * 通用 Ark 视觉分析:把 tmp 文件优先作 data URL 传入,publicUrl 作后备。
 * 返回 { text, raw } —— text 为失败友好型描述,raw 为原始 JSON 字符串。
 */
async function analyzeImageWithArk(tmpFile, publicUrl, system, contextPrompt, tag) {
  const apiKey = (process.env.ARK_API_KEY || '').trim();
  if (!apiKey) return { text: '(视觉分析未配置 ARK_API_KEY,跳过)', raw: '' };

  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
  const model = (process.env.ARK_TEXT_MODEL || 'doubao-seed-2-1-pro-260628').trim();
  const timeoutMs = Number.parseInt(process.env.INSPIRATION_AI_TIMEOUT_MS || '', 10) || 90000;

  // 读取 buffer 作 data URL(与 analyzeInspiration 一致;不走公网 URL 避免内网抓不到)
  let imageRef = '';
  try {
    const buf = fs.readFileSync(tmpFile.path);
    const ext = (tmpFile.mimetype || 'image/jpeg').split('/')[1] || 'jpeg';
    imageRef = `data:${tmpFile.mimetype || 'image/jpeg'};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn(`[design-generator] ${tag} read buffer failed, fallback to url: ${e?.message}`);
    imageRef = publicUrl;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: [{ type: 'text', text: system }] },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: imageRef } },
            { type: 'text', text: contextPrompt },
          ] },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const t = (await res.text().catch(() => '')).slice(0, 200);
      console.warn(`[design-generator] ${tag} Ark HTTP ${res.status}: ${t}`);
      return { text: `(视觉分析失败 HTTP ${res.status})`, raw: '' };
    }

    const reader = res.body;
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) fullText += delta;
        } catch { /* skip */ }
      }
    }

    if (!fullText.trim()) return { text: '(视觉分析返回为空)', raw: '' };
    // 提取 JSON
    const fence = fullText.match(/`{3}(?:json)?\s*([\s\S]*?)\s*`{3}/);
    const candidate = fence?.[1]?.trim() || fullText.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const jsonStr = candidate.slice(start, end + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        return { text: formatAnalysis(tag, parsed), raw: jsonStr };
      } catch { /* fall through */ }
    }
    return { text: fullText.trim().slice(0, 400), raw: fullText };
  } catch (e) {
    console.warn(`[design-generator] ${tag} Ark call failed: ${e?.message}`);
    return { text: `(视觉分析失败: ${e?.message || 'unknown'})`, raw: '' };
  }
}

/**
 * 把库内 lAMaterial 记录(的字段 + 指定色卡)合成一句「面料分析」自然语言。
 * 用于 library-fabric 行,等价于 Ark 分析结果,供 buildMaterialComboPrompt 使用。
 * @param {any} rec lAMaterial 行
 * @param {number} idx colorImages 下标(回退 image / colors 时为 -1)
 */
function fabricTextFromRecord(rec, idx) {
  const parts = [rec.name, rec.texture, rec.finish].filter(Boolean);
  const colors = Array.isArray(rec.colors) ? rec.colors.slice(0, 3).join('/') : '';
  const cis = Array.isArray(rec.colorImages) ? rec.colorImages : [];
  const ci = idx >= 0 ? cis[idx] : null;
  const col = ci?.hex || (Array.isArray(rec.colors) ? rec.colors[idx] : '');
  let usesArr = rec.uses;
  if (typeof usesArr === 'string') { try { usesArr = JSON.parse(usesArr); } catch { usesArr = []; } }
  const arr = Array.isArray(usesArr) ? usesArr : [];
  const best = arr.length ? `, 适合 ${arr[0]}` : '';
  return `${parts.join(', ')}${colors ? `, 色彩 ${colors}` : ''}${col ? `, ${col}` : ''}${best}`;
}

/**
 * 把库内 lAStyle 记录合成一句「款式分析」自然语言。
 * 用于 library-款式行,等价于 Ark 分析结果。
 * @param {any} rec lAStyle 行
 */
function styleTextFromRecord(rec) {
  const cat = rec.category || '款式';
  const bits = [`[${cat}]`, rec.name].filter(Boolean);
  const tags = Array.isArray(rec.tags) ? rec.tags.slice(0, 3).join('/') : '';
  return `${bits.join(' ')}${tags ? `(${tags})` : ''}`;
}

/** 把 Ark 分析 JSON 压缩成一句自然语言描述,便于拼到 prompt 中 */
function formatAnalysis(tag, j) {
  if (tag === 'fabric') {
    const part = [j.material, j.surface, j.weightDrape, j.pattern].filter(Boolean).join(', ');
    const colors = Array.isArray(j.colors) ? j.colors.slice(0, 3).join('/') : '';
    const best = j.bestFor ? `, 适合 ${j.bestFor}` : '';
    return `${part}${colors ? `, 色彩 ${colors}` : ''}${best}`;
  }
  // style
  const part = [j.silhouette, j.structure].filter(Boolean).join(', ');
  const lang = j.designLanguage ? `, ${j.designLanguage}` : '';
  const detail = j.keyDetails ? `, 亮点: ${j.keyDetails}` : '';
  return `${part}${lang}${detail}`;
}

/**
 * 综合所有输入构建单张白底效果图的英文 prompt。
 * 目标是 gpt-image-2 直出白底产品图:服装/包袋/配饰按品类描述。
 *
 * 叙事结构(对应中文语义「将款式参考的形,换成面料图的质,生成白底产品图」):
 *   1. 品类 + 名称 + 输出格式锚点
 *   2. 替换指令:保留款形的「廓形+结构」,把面料替换成面料图的「材质+色彩+图案」
 *   3. 用户备注
 *   4. 品牌注入(名称/调性/色板)
 *   5. 白底产品图硬约束
 */
function buildMaterialComboPrompt({ name, description, brand, fabric, style }) {
  const category = style?.category || 'fashion product';

  // 1. 锚点:品类 + 名称 + 纯白底产品图
  const bits = [
    `Product photography of a single ${category} called "${name}", on pure white background.`,
  ];

  // 2. 核心替换叙事 —— "把这个款式的形,用那种面料的质做出来"
  const sText = style?.text || '';
  const fText = fabric?.text || '';
  if (sText && fText) {
    // 两者都有:明确表达"形保留、质替换"的关系
    bits.push(
      `Take the silhouette, structure and design of the reference garment — ${sText.replace(/\.$/, '')} — and remake it in a completely different fabric: ${fText.replace(/\.$/, '')}.`,
    );
  } else if (fText) {
    // 只有面料分析成功(款式分析失败回退)
    bits.push(`Make it from this fabric: ${fText}.`);
  } else if (sText) {
    // 只有款式分析成功(面料分析失败回退)
    bits.push(`Match this silhouette and design: ${sText}.`);
  }

  // 3. 用户备注 —— 对应「${备注信息}」
  if (description.trim()) bits.push(`Design notes: ${description.trim()}.`);

  // 4. 品牌注入(名称/调性/slogan/色板)
  if (brand) {
    const brandBits = [];
    if (brand.nameZh || brand.nameEn) brandBits.push(`for the brand "${brand.nameZh || brand.nameEn}"`);
    if (brand.voice) brandBits.push(`brand voice "${brand.voice}"`);
    if (brand.sloganEn) brandBits.push(`tagline "${brand.sloganEn}"`);
    if (brandBits.length) bits.push(`Brand context: ${brandBits.join(', ')}.`);
    const brandColors = Array.isArray(brand.colors) ? brand.colors.map((c) => c?.bg || c).filter(Boolean).slice(0, 5) : [];
    if (brandColors.length) bits.push(`Brand palette reference: ${brandColors.join(', ')}.`);
  }

  // 5. 白底产品图硬约束 —— 对应「生成白底产品图」
  bits.push([
    'Clean studio lighting, sharp detail, e-commerce catalog style.',
    'NO model, NO mannequin, NO background clutter, pure white backdrop.',
    'Flat-laid or hung neatly, full product clearly visible, front-facing composition.',
  ].join(' '));

  return bits.join('\n');
}

/**
 * 解析品牌信息:优先从请求体 brand 字段,否则回退到数据库。
 * brand 字段解析失败时静默忽略以避免阻塞主流程。
 */
async function resolveBrand(req) {
  // 请求直传
  if (req.body?.brand) {
    if (typeof req.body.brand === 'string') {
      try { return JSON.parse(req.body.brand); } catch { /* ignore */ }
    } else if (typeof req.body.brand === 'object') {
      return req.body.brand;
    }
  }
  // 回退:从 DB 拉
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const profile = await prisma.lABrandProfile.findUnique({ where: { teamId: req.team.id } });
    const pairs = await prisma.lAColorPair.findMany({ where: { teamId: req.team.id }, orderBy: { createdAt: 'asc' } });
    if (profile) return { ...profile, colors: pairs || [] };
  } catch (e) {
    console.warn('[design-generator] resolveBrand fallback failed:', e?.message);
  }
  return undefined;
}

module.exports = router;
