'use strict';

/**
 * design-generator —— 设计工作流图片生成路由。
 *
 * 挂在 `/api/teams/:teamId/design`,由 team-workbench.js 的 sub-router 挂载。
 *
 * POST /api/teams/:teamId/design/generate       —— 按设计方案批量生成图片
 * POST /api/teams/:teamId/design/regenerate     —— 单张图重生成(修图)
 * POST /api/teams/:teamId/design/lineart        —— 生成设计线稿(单品/系列)
 * POST /api/teams/:teamId/design/generate-final —— 材料驱动的最终成图
 * POST /api/teams/:teamId/design/recommend-materials —— AI 材料推荐(库内+库外)
 * POST /api/teams/:teamId/design/material-combo —— 材料组合:面料图+款式参考+品牌 → 白底效果图
 * POST /api/teams/:teamId/design/style-mutate —— 款式裂变:母款+裂变轴 → N 张子款白底图
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { generateImage, generateImageBuffer, uploadImageBuffer } = require('../lib/gen-image');
const { callArkStream } = require('../workflow-executor');
const { analyzeInspiration } = require('../lib/analyze-inspiration');
const storage = require('../lib/storage');
const {
  buildComboPlan,
  buildMaterialComboPrompt,
  buildColorMixPrompt,
  finalStyleBits,
} = require('../lib/combo-logic');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { findOwned } = require('../lib/laisse-ancie-helpers');
const { chargeAI } = require('../lib/billing');
const coins = require('../lib/coins');

const router = express.Router();

// ── 产品封面取值(对齐前端 pickProductCover):主图 > 第一张效果图 > imageUrl > null ──
function pickProductCover(product) {
  if (!product) return null;
  const images = Array.isArray(product.images) ? product.images : [];
  const main = images.find((im) => im && im.slot === 'main' && im.url);
  if (main?.url) return main.url;
  // 回退:第一张带 url 的效果图(跳过 lineart 线稿)
  const render = images.find((im) => im && im.url && im.slot !== 'lineart' && im.slot !== 'main');
  if (render?.url) return render.url;
  // 最终回退:遗留单图字段
  return product.imageUrl || null;
}

// ── 生图扣币:在调模型前按张数扣,余额不足返回 402 ──
async function chargeImages(req, count, scenario, refId) {
  if (!req.userId || count <= 0) return;
  try {
    await chargeAI(req.userId, scenario, { refId, count, note: `design:${scenario} x${count}` });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') {
      const e = new Error('喵币不足，请充值后再试');
      e.code = 'INSUFFICIENT_COINS';
      e.coins = await coins.getUserCoins(req.userId);
      e.cost = coins.getCost(scenario) * count;
      throw e;
    }
    throw err;
  }
}

// ── material-combo 守卫常量 ───────────────────────────────────
const MAX_FABRIC = 6;
const MAX_STYLE = 6;
const MAX_CELLS = MAX_FABRIC * MAX_STYLE;        // 36 张上限
const MAX_FABRIC_MIXED = 12;                       // 拼色模式面料软上限(仅 UI 提示)
const MC_BATCH_CAP = Number.parseInt(process.env.MC_BATCH_CAP || '', 10) || 4; // 并发生成上限
const MC_BATCH_TTL_MS = 15 * 60 * 1000;           // 批次在内存保留 15 分钟
// 材料组合生图 provider:MaiziTech 图像编辑(多图参考,把款式图换成面料花样)。走「真·参考图」,非文生图。
const MATERIAL_COMBO_PROVIDER = process.env.MATERIAL_COMBO_PROVIDER || 'maizi-image-edit';

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
  { name: 'illustrations', maxCount: 1 },
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
/** @type {Map<string, {teamId:string,name:string,description:string,fabrics:Array,styles:Array,items:Array,status:string,createdAt:number,updatedAt:number,error?:string}>} */
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
    illustrations: (b.illustrations || []).map((i) => ({ url: i.url, name: i.name, text: i.text })),
    items: b.items.map((it) => ({ fi: it.fi, si: it.si, status: it.status, url: it.url, error: it.error, prompt: it.prompt })),
    total: b.items.length,
    completed,
    failed,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** 清理过期批次 + 兜底「永 pending」格子,每 30s 扫一次
 *  正常情况下 mapConcurrent + 任务内 try/catch 已把每格置为 done/error;
 *  若 generateImage 内出现未捕获异常或外部长时间无响应(比如上游模型服务 hang),批次状态会卡 running、格子卡 pending。
 *  此 watchdog 给每个批次一个软上限(MC_BATCH_TTL_MS),超时即把仍在 pending 的格子标 error 并把批次置 done,
 *  前端据此可提示用户「超时可重试」,避免永久 pending。 */
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of mcBatches) {
    if (now - b.updatedAt > MC_BATCH_TTL_MS) {
      for (const it of b.items) {
        if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = '生成超时,请重试'; }
      }
      b.status = 'done';
      b.updatedAt = now;
      mcBatches.delete(id);
    }
  }
}, 30000).unref();

/** 单批次生成调度:对每个 cell 构建 prompt 并调 generateImage */
async function runBatch(batchId) {
  const b = mcBatches.get(batchId);
  if (!b) return;
  // 诊断:进入调度的第一时间落日志,便于定位「POST 202 却永远 pending」类问题
  console.log(`[design-generator] runBatch START batchId=${batchId} mode=${b.mode} cells=${b.items.length} provider=${MATERIAL_COMBO_PROVIDER}`);
  try {
    b.status = 'running';
    b.updatedAt = Date.now();

    const illustration = (b.illustrations || [])[0];
    // fabrics 为空时叉乘退化为「仅插画 × 款式」:每格只配款式 + 插画,无面料花样替换。
    const onlyIllustration = b.mode !== 'color-mix' && (!b.fabrics || b.fabrics.length === 0);
    const makePrompt = b.mode === 'color-mix'
      ? () => buildColorMixPrompt({
        name: b.name, description: b.description,
        fabrics: b.fabrics, style: b.styles[0], illustration,
      })
      : (cell) => buildMaterialComboPrompt({
        name: b.name, description: b.description,
        fabric: onlyIllustration ? undefined : b.fabrics[cell.fi],
        style: b.styles[cell.si],
        illustration: onlyIllustration ? illustration : illustration,
      });

    // 参考图顺序=图序号:
    //   叉乘(有面料)   [款式, 面料, 插画]
    //   叉乘(仅插画)   [款式, 插画]  ← fabrics 为空时,面料占位被跳过,图序与 prompt 一致
    //   拼色           [款式, 面料1, 面料2, ..., 插画]
    // 插画可选,空 url 会被 gen-image 过滤。
    const makeRefImages = b.mode === 'color-mix'
      ? () => [b.styles[0]?.url, ...b.fabrics.map((f) => f?.url), illustration?.url].filter(Boolean)
      : (cell) => {
        const styleUrl = b.styles[cell.si]?.url;
        if (onlyIllustration) {
          return [styleUrl, illustration?.url].filter(Boolean);
        }
        return [styleUrl, b.fabrics[cell.fi]?.url, illustration?.url].filter(Boolean);
      };

    const tasks = b.items.map((cell) => async () => {
      const cellLabel = b.mode === 'color-mix' ? `mix-${cell.fi}-${cell.si}` : `f${cell.fi}-s${cell.si}`;
      console.log(`[design-generator] runBatch cell START batchId=${batchId} cell=${cellLabel}`);
      // 输入校验
      if (b.mode === 'color-mix') {
        if (!b.fabrics?.length || !b.styles?.[0]) {
          cell.status = 'error'; cell.error = '拼色需要面料 + 款式'; return cell;
        }
      } else {
        const style = b.styles[cell.si];
        if (!style) {
          cell.status = 'error'; cell.error = '该格的款式分析结果缺失'; return cell;
        }
        if (!onlyIllustration) {
          const fabric = b.fabrics[cell.fi];
          if (!fabric) {
            cell.status = 'error'; cell.error = '该格的面料分析结果缺失'; return cell;
          }
        }
      }
      const prompt = b.mode === 'color-mix' ? makePrompt() : makePrompt(cell);
      cell.prompt = prompt;
      const safeName = b.mode === 'color-mix'
        ? `material-combo-mix-${cell.fi}-${cell.si}`
        : `material-combo-f${cell.fi}-s${cell.si}`;
      const referenceImages = (b.mode === 'color-mix' ? makeRefImages() : makeRefImages(cell)).filter(Boolean);
      try {
        const img = await generateImage(prompt, {
          teamId: b.teamId,
          aspectRatio: '1:1',
          safeName,
          provider: MATERIAL_COMBO_PROVIDER,
          referenceImages,
        });
        if (img?.url) {
          cell.url = img.url;
          cell.status = 'done';
          console.log(`[design-generator] runBatch cell DONE batchId=${batchId} cell=${cellLabel}`);
        } else {
          cell.error = img?.error || '生成失败';
          cell.status = 'error';
          console.warn(`[design-generator] runBatch cell ERROR batchId=${batchId} cell=${cellLabel} error=${cell.error}`);
        }
      } catch (cellErr) {
        // generateImage 理论上不抛出,但兜底:确保格子不会永远 pending
        cell.error = cellErr?.message || '生成本格异常';
        cell.status = 'error';
        console.error(`[design-generator] runBatch cell THROW batchId=${batchId} cell=${cellLabel} error=${cellErr?.message}`);
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
 * 构建品牌注入提示块:把品牌 Slogan 作为字母/印花元素注入 prompt。
 * slogan → 要求作为印花/刺绣/标语文字呈现在单品上。
 * logo   → 不再注入(此前会把品牌 LOGO 作为布标参考注入,导致所有产品自带猫咪 logo 布标)。
 * 没有 slogan 时返回空串,不影响原 prompt。
 */
function buildBrandBlock(brandLogo, brandSlogan) {
  const slogan = (brandSlogan || '').trim();
  if (!slogan) return '';
  return `\n\n[BRAND IDENTITY]\nBrand slogan "${slogan}" MUST appear on the product as a printed, embroidered, woven, or screen-printed text/lettering element.`;
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
  const { mode = 'single', plan, provider, referenceImages, brandLogo, brandSlogan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });
  if (mode === 'illustration') {
    // 插画不进线稿流程,回退到标准图(防御性)
    return res.redirect(307, req.originalUrl.replace('/lineart', '/generate'));
  }
  const brandBlock = buildBrandBlock(brandLogo, brandSlogan);
  const slots = planLineart(mode, plan).map((s) => ({ ...s, prompt: `${s.prompt}${brandBlock}` }));
  try {
    await chargeImages(req, slots.length, 'image_lineart', `lineart:${mode}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    throw err;
  }
  const imgOptsBase = { provider };
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
      if (r?.url) return { slot: slot.slot, label: slot.label, url: r.url, originalUrl: r.originalUrl ?? null, prompt: enrichedPrompt };
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
  const { mode = 'single', plan, provider, brandLogo, brandSlogan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  const brandBlock = buildBrandBlock(brandLogo, brandSlogan);
  const slots = planImages(mode, plan).map((s) => ({ ...s, prompt: `${s.prompt}${brandBlock}` }));
  try {
    await chargeImages(req, slots.length, 'image_generate', `generate:${mode}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    throw err;
  }

  // provider 可选,未传则走 ark(唯一生图 provider,向后兼容)
  const imgOptsBase = { provider };
  // 并行生成——总耗时取决于最慢的单张(而非 N 张串联),避免撑过 nginx proxy_read_timeout
  const results = await Promise.all(slots.map(async (slot) => {
    try {
      const r = await generateImage(slot.prompt, {
        teamId: req.team.id,
        aspectRatio: slot.aspectRatio,
        safeName: slot.slot,
        ...imgOptsBase,
      });
      // gen-image 成功返回 {url, originalUrl},失败返回 {error}(已含 provider 真实原因)
      if (r?.url) return { slot: slot.slot, label: slot.label, url: r.url, originalUrl: r.originalUrl ?? null, prompt: r.prompt };
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
  const { slot = 'flat', label = '图', plan, instruction = '', provider, mode, material, brandLogo, brandSlogan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });

  const brandBlock = buildBrandBlock(brandLogo, brandSlogan);

  try {
    await chargeImages(req, 1, 'image_regenerate', `regenerate:${slot}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    throw err;
  }

  // 在 plan 基础上叠加修图指令
  // 拼合全部模式下的 slot(含线稿),按 slot 名匹配;找不到就按 slot 名回退
  const baseSlots = [
    ...planImages('single', plan), ...planImages('illustration', plan), ...planImages('collection', plan),
    ...planLineart('single', plan), ...planLineart('collection', plan),
  ].map((s) => ({ ...s, prompt: `${s.prompt}${brandBlock}` }));
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
    base = { prompt: `${mi.prompt}${brandBlock}\n\n${desc}\nMatch the material qualities described above (texture, weight, drape, finish, color).`, aspectRatio: mi.aspectRatio };
    aspectRatio = mi.aspectRatio;
  }
  if (!base) base = { aspectRatio: '1:1', prompt: `${plan}${brandBlock}` };

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
    res.json({ slot, label, url: r.url, originalUrl: r.originalUrl ?? null, prompt: r.prompt });
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
  const { mode = 'single', plan, material, provider, brandLogo, brandSlogan } = req.body || {};
  if (!plan) return res.status(400).json({ error: 'plan required' });
  if (!material || !material.name) return res.status(400).json({ error: 'material required' });

  const brandBlock = buildBrandBlock(brandLogo, brandSlogan);
  const baseSlots = planImages(mode, plan).map((s) => ({ ...s, prompt: `${s.prompt}${brandBlock}` }));
  try {
    await chargeImages(req, baseSlots.length, 'image_generate', `generate-final:${mode}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    throw err;
  }

  // 最终图 base prompt(复用 planImages 的产品图描述)
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
    // ── 顶层兜底:async 回调里任何未捕获异常(如作用域错误、DB/COS 瞬时故障)
    // 都会以 unhandledRejection 收尾,request 就 hang 到网关 60s 超时报 504、
    // 服务端也不会打出任何日志 —— 曾经因此排查困难。这里把整个 async 用
    // try/catch 包住,确保任何异常都会返回一个响应,并留下服务端错误日志。
    try {
      if (uploadErr) {
        console.error('[design-generator] material-combo upload error:', uploadErr.message);
        return res.status(400).json({ error: `上传失败: ${uploadErr.message}` });
      }
      const files = req.files || {};
      const fabricFiles = files.fabrics ?? [];
      const styleFiles = files.styles ?? [];
      const illustrationFiles = files.illustrations ?? [];
      const { name = '', description = '' } = req.body || {};

      // 解析每种槽位的元数据(前端始终上传):按位置决定上传 or 库行
      let fabricsMeta = [];
      let stylesMeta = [];
      let illustrationsMeta = [];
      try { if (req.body?.fabricsMeta) fabricsMeta = JSON.parse(req.body.fabricsMeta); } catch { }
      try { if (req.body?.stylesMeta) stylesMeta = JSON.parse(req.body.stylesMeta); } catch { }
      try { if (req.body?.illustrationsMeta) illustrationsMeta = JSON.parse(req.body.illustrationsMeta); } catch { }
      if (!Array.isArray(fabricsMeta)) fabricsMeta = [];
      if (!Array.isArray(stylesMeta) || !stylesMeta.length) {
        return res.status(400).json({ error: 'stylesMeta 缺失或为空' });
      }
      // fabrics 允许为空(支撑「仅插画+款式」二选一);但若 fabricsMeta 缺失而 fabricFiles 有上传,
      // 按位置派生元数据——后端兜底不依赖前端字段,并让直连 API 也能按文件数构建 fabrics 行。
      if (!fabricsMeta.length && fabricFiles.length) {
        fabricsMeta = fabricFiles.map((f) => ({ kind: 'upload', name: f.originalname || '面料' }));
      }

      // 生成模式:叉乘(cross,默认) | 拼色(color-mix, m 面料 + 1 款式 → 1 图)
      const mode = req.body?.mode === 'color-mix' ? 'color-mix' : 'cross';

      // 守卫(基于元数据数组长度 —— 即「槽位数」,而非文件数)
      if (!name.trim()) return res.status(400).json({ error: '请填写名称' });
      // 文件数必须等于「上传」槽位数(kind==='upload' 才消耗文件,kind==='text' / 'library-*' 不消耗)
      const uploadFabricCount = fabricsMeta.filter((m) => m.kind === 'upload').length;
      const uploadStyleCount = stylesMeta.filter((m) => m.kind === 'upload').length;
      const uploadIllustrationCount = illustrationsMeta.filter((m) => m.kind === 'upload').length;
      if (uploadFabricCount !== fabricFiles.length) {
        return res.status(400).json({ error: `面料文件数不匹配,期望 ${uploadFabricCount},收到 ${fabricFiles.length}` });
      }
      if (uploadStyleCount !== styleFiles.length) {
        return res.status(400).json({ error: `款式文件数不匹配,期望 ${uploadStyleCount},收到 ${styleFiles.length}` });
      }
      if (uploadIllustrationCount !== illustrationFiles.length) {
        return res.status(400).json({ error: `插画文件数不匹配,期望 ${uploadIllustrationCount},收到 ${illustrationFiles.length}` });
      }

      // 校验两大模式各自的约束(公共守卫在更上层 name/文件数阶段已完成)
      if (mode === 'color-mix') {
        // 拼色:恰好 1 项款式 + 1~N 项面料(软上限 MAX_FABRIC_MIXED 仅提示)
        if (stylesMeta.length !== 1) {
          return res.status(400).json({ error: '拼色模式需要恰好一项款式' });
        }
        if (fabricsMeta.length > MAX_FABRIC_MIXED) {
          return res.status(400).json({ error: `拼色面料建议 ${MAX_FABRIC_MIXED} 项以内,避免 prompt 过长` });
        }
      } else {
        // 叉乘
        if (fabricsMeta.length > MAX_FABRIC) return res.status(400).json({ error: `面料最多 ${MAX_FABRIC} 项` });
        if (stylesMeta.length > MAX_STYLE) return res.status(400).json({ error: `款式最多 ${MAX_STYLE} 项` });
      }

      // 用 buildComboPlan 推导格子列表(cross 返回 m×n 或退化列表,color-mix 返回 1 格),
      // 便于下游 chargeImages / batch 构建统一通过 plan.items 引用。
      const plan = buildComboPlan({
        mode,
        fabricsLength: fabricsMeta.length,
        stylesLength: stylesMeta.length,
        illustrationsLength: illustrationsMeta.length,
      });
      if (plan.total === 0) {
        return res.status(400).json({ error: '面料或插画至少需要一项' });
      }
      if (mode !== 'color-mix' && plan.total > MAX_CELLS) {
        return res.status(400).json({ error: `面料×款式组合超过 ${MAX_CELLS} 张上限` });
      }
      const totalCells = plan.total;

      // material-combo 按总张数预扣喵币(余额不足 402)
      try {
        await chargeImages(req, totalCells, 'material_combo_per_image', `material-combo:${mode}`);
      } catch (err) {
        if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
        throw err;
      }

      // 用于线上定位「material-combo 504」的时序日志:
      // handler 内三个循环里的 persistTempFile(COS 上传) 和 findOwned(DB 查询) 都是 await,
      // 任何一次卡 >网关超时(60~120s) 都会导致前端收到 504、大模型请求根本没发出去。
      // 此处打点让运维一眼看出「卡在哪一步、每步多长」。
      const t_handler0 = Date.now();
      console.log(`[design-generator] material-combo start batch: fabrics=${fabricsMeta.length} styles=${stylesMeta.length} illustrations=${illustrationsMeta.length} mode=${mode}`);
      try {
        // 按 fabricsMeta 顺序构建面料行,上传文件逐条消耗(kind==='upload' 才取下一个)
        let fIdx = 0;
        const fabrics = [];
        for (const meta of fabricsMeta) {
          if (meta.kind === 'upload') {
            const f = fabricFiles[fIdx++];
            const url = await persistTempFile(f.path, f.filename, f.mimetype);
            // 面料视觉细节直接以参考图(面料图)传给生图模型,此处不再 Ark 分析转文字。
            fabrics.push({ name: meta.name || f.originalname || `面料${fabrics.length + 1}`, url, text: '', raw: '' });
          } else if (meta.kind === 'text') {
            // 文本描述面料:无图,用文字作为面料依据
            fabrics.push({ name: meta.name || meta.description || '自定义面料', url: '', text: meta.description || '', raw: '' });
          } else {
            // library-fabric:从材料库取值(色卡图优先,回退 image)
            const rec = await findOwned(prisma.lAMaterial, meta.matId, req.team.id);
            if (!rec) {
              console.warn(`[design-material-combo] 找不到面料 id=${meta.matId}`);
              fabrics.push({ name: '(面料不存在)', url: '', text: '', raw: '' });
              continue;
            }
            const cis = Array.isArray(rec.colorImages) ? rec.colorImages : [];
            const ci = meta.colorIdx >= 0 ? cis[meta.colorIdx] : null;
            const url = (ci && ci.url) || rec.image || '';
            const colorName = ci?.name ? ` · ${ci.name}` : (meta.hex ? ` · ${meta.hex}` : '');
            fabrics.push({
              name: `${rec.name || '面料'}${colorName}`,
              url,
              text: '',
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
            // 款式视觉细节直接以参考图(款式图)传给生图模型,此处不再 Ark 分析转文字。
            styles.push({ name: meta.name || f.originalname || `款式${styles.length + 1}`, url, text: '', raw: '' });
          } else if (meta.kind === 'library-product') {
            // library-product:从 Lookbook 单品库选款式参考,取产品封面图作为参考图
            const rec = await findOwned(prisma.lAProduct, meta.productId, req.team.id);
            if (!rec) {
              console.warn(`[design-material-combo] 找不到款式单品 id=${meta.productId}`);
              styles.push({ name: '(款式单品不存在)', url: '', text: '', raw: '' });
              continue;
            }
            const url = pickProductCover(rec);
            if (!url) { styles.push({ name: '(款式缺少参考图)', url: '', text: '', raw: '' }); continue; }
            styles.push({ name: rec.title || '款式', url, text: '', raw: '' });
          } else {
            // library-style:从款式库取值(参考图即款式 image)
            const rec = await findOwned(prisma.lAStyle, meta.styleId, req.team.id);
            if (!rec) {
              console.warn(`[design-material-combo] 找不到款式 id=${meta.styleId}`);
              styles.push({ name: '(款式不存在)', url: '', text: '', raw: '' });
              continue;
            }
            styles.push({
              name: rec.name || '款式',
              url: rec.image || '',
              text: '',
              raw: '',
            });
          }
        }

        // 按 illustrationsMeta 顺序构建插画行(可印/刺绣到衣服上的图案)
        let iIdx = 0;
        const illustrations = [];
        for (const meta of illustrationsMeta) {
          if (meta.kind === 'upload') {
            const f = illustrationFiles[iIdx++];
            const url = await persistTempFile(f.path, f.filename, f.mimetype);
            illustrations.push({ name: meta.name || f.originalname || `插画${illustrations.length + 1}`, url, text: '', raw: '' });
          } else {
            // library-illustration:从插画库取值(参考图即插画 image)
            const rec = await findOwned(prisma.lAIllustrationAsset, meta.illustrationId, req.team.id);
            if (!rec) {
              console.warn(`[design-material-combo] 找不到插画 id=${meta.illustrationId}`);
              illustrations.push({ name: '(插画不存在)', url: '', text: '', raw: '' });
              continue;
            }
            illustrations.push({
              name: rec.name || '插画',
              url: rec.image || '',
              text: '',
              raw: '',
            });
          }
        }

        // 3) 构建 batch
        //    叉乘(cross):m×n 格;拼色(color-mix):1 格(全部面料 × 单个款式)
        const batchId = `mc-${crypto.randomUUID()}`;
        const now = Date.now();
        const items = plan.items;
        const batch = {
          batchId,
          teamId: req.team.id,
          mode,
          name: name.trim(),
          description: description.trim(),
          fabrics,
          styles,
          illustrations,
          items,
          status: 'running',
          createdAt: now,
          updatedAt: now,
        };
        mcBatches.set(batchId, batch);
        console.log(`[design-generator] material-combo ready ${batchId} in ${Date.now() - t_handler0}ms, ${items.length} cells → 202`);

        // 4) 202 立即返回,fire-and-forget 后台生成
        res.status(202).json(batchPublicView(batch));
        // 兜底捕获:runBatch 内已 try/catch,但 fire-and-forget 需要给顶层 promise 一层
        // 保护,避免任何遗漏路径变成 unhandledRejection、cells 永远 pending。
        runBatch(batchId).catch((err) => {
          console.error(`[design-generator] runBatch ${batchId} unhandled:`, err?.message || String(err));
          const b = mcBatches.get(batchId);
          if (b) {
            b.status = 'error';
            b.error = err?.message || '批次异常';
            for (const it of b.items) {
              if (it.status === 'pending' || it.status === 'running') {
                it.status = 'error';
                it.error = b.error;
              }
            }
            b.updatedAt = Date.now();
          }
        });
      } catch (e) {
        console.error('[design-generator] material-combo error:', e?.message || String(e));
        res.status(500).json({ error: e?.message || '生成失败' });
      }
    } catch (fatal) {
      // 顶层兜底:即便前面所有 try/catch 都漏掉(例如 ReferenceError、语法性问题、
      // 未 await 就抛出的同步异常),也保证有响应返回,避免请求 hang 到网关超时。
      console.error('[design-generator] material-combo fatal (unhandled):',
        fatal?.stack || fatal?.message || String(fatal));
      if (!res.headersSent) {
        res.status(500).json({ error: fatal?.message || 'material-combo 内部异常' });
      }
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

  // 单格重生成扣 1 张
  try {
    await chargeImages(req, 1, 'image_regenerate', `material-combo:regenerate:${fi}-${si}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    throw err;
  }
  if (!Number.isInteger(fi) || !Number.isInteger(si)) {
    return res.status(400).json({ error: 'fi / si 必须为整数' });
  }
  const fabric = batch.fabrics[fi];
  const style = batch.styles[si];
  const illustration = (batch.illustrations || [])[0];
  if (!fabric || !style) return res.status(400).json({ error: '无效的 fi / si' });

  const cell = batch.items.find((it) => it.fi === fi && it.si === si);
  if (!cell) return res.status(400).json({ error: '未找到对应的组合格' });

  // optimistic:立即标 pending 返回,后台重跑
  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  cell.originalUrl = undefined;
  batch.updatedAt = Date.now();

  res.json({ fi, si, status: cell.status, url: cell.url, error: cell.error, prompt: cell.prompt });

  // 后台生成
  try {
    const mode = batch.mode === 'color-mix' ? 'color-mix' : 'cross';
    const prompt = mode === 'color-mix'
      ? buildColorMixPrompt({
        name: batch.name, description: batch.description,
        fabrics: batch.fabrics, style: batch.styles[0], illustration,
      })
      : buildMaterialComboPrompt({
        name: batch.name, description: batch.description,
        fabric, style, illustration,
      });
    cell.prompt = prompt;
    const safeName = mode === 'color-mix'
      ? `material-combo-mix-${fi}-${si}`
      : `material-combo-f${fi}-s${si}`;
    // referenceImages 顺序:[款式, 面料, 插画](插画可选,有则作为「印花/刺绣图案」交给模型)
    const referenceImages = (mode === 'color-mix'
      ? [batch.styles[0]?.url, ...batch.fabrics.map((f) => f?.url), illustration?.url]
      : [style?.url, fabric?.url, illustration?.url]
    ).filter(Boolean);
    const img = await generateImage(prompt, {
      teamId: batch.teamId,
      aspectRatio: '1:1',
      safeName,
      provider: MATERIAL_COMBO_PROVIDER,
      referenceImages,
    });
    if (img?.url) {
      cell.url = img.url;
      cell.originalUrl = img.originalUrl ?? null;
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
 * 综合所有输入构建单张效果图的 prompt。
 * 目标:以「款式图(图1)+面料图(图2)」为参考图,让图生图模型把图1换成图2的面料花样。
 * 参考图由调用方以 referenceImages:[style.url, fabric.url] 传入(顺序=图序号),
 * prompt 不再冗长描述款式/面料的视觉细节(让图自己说话),只保留:
 *   1. 替换指令(核心) + 名称
 *   2. 用户描述信息(可选)
 *   3. 白底产品图硬约束
 *
 * 注:材料组合不再注入品牌配色/信息,仅发送极简 prompt。
 */

// finalStyleBits / buildMaterialComboPrompt / buildColorMixPrompt 均由 lib/combo-logic 提供。
// 未在本地重复实现的原因见 lib/combo-logic.js 顶部同步须知。

// ── style-mutate 守卫常量 ─────────────────────────────────────
const MAX_MUTATIONS = 12;
const SM_BATCH_CAP = Number.parseInt(process.env.SM_BATCH_CAP || '', 10) || MC_BATCH_CAP;
const SM_BATCH_TTL_MS = MC_BATCH_TTL_MS;
const STYLE_MUTATE_PROVIDER = process.env.STYLE_MUTATE_PROVIDER || MATERIAL_COMBO_PROVIDER;

const smMulterStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(storage.TMP_DIR, { recursive: true });
    cb(null, storage.TMP_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `sm-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}${ext}`);
  },
});
const smUpload = multer({
  storage: smMulterStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime'));
  },
}).fields([
  { name: 'style', maxCount: 1 },
  { name: 'fabric', maxCount: 1 },
]);

/** @type {Map<string, any>} */
const smBatches = new Map();

function smBatchPublicView(b) {
  const completed = b.items.filter((it) => it.status === 'done').length;
  const failed = b.items.filter((it) => it.status === 'error').length;
  return {
    batchId: b.batchId,
    teamId: b.teamId,
    status: b.status,
    error: b.error,
    name: b.name,
    mother: b.mother ? { url: b.mother.url, name: b.mother.name } : null,
    fabric: b.fabric ? { url: b.fabric.url, name: b.fabric.name } : null,
    mutations: b.mutations,
    items: b.items.map((it) => ({
      mi: it.mi,
      label: it.label,
      axisId: it.axisId,
      optionId: it.optionId,
      status: it.status,
      url: it.url,
      error: it.error,
      prompt: it.prompt,
      // 标记该格已保留 buffer、下次重试为重传而非重新生图
      needsReupload: !!it._imgBuf,
    })),
    total: b.items.length,
    completed,
    failed,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, b] of smBatches) {
    if (now - b.updatedAt > SM_BATCH_TTL_MS) smBatches.delete(id);
  }
}, 30000).unref();

async function persistStyleMutateTemp(tmpPath, filename, mime) {
  const savePath = storage.createSavePath('design/style-mutate', filename);
  await storage.saveUpload(tmpPath, savePath, mime);
  return storage.getPublicUrl(savePath);
}

/**
 * 款式裂变 prompt:图1=母款,可选图2=面料。
 * 指令:保留母款 DNA,仅按 promptHint 改一个维度。
 */
function buildStyleMutatePrompt({ name, description, mutation, hasFabric, fabricText }) {
  const bits = [
    `Product photography of a single fashion garment called "${name}", on pure white background.`,
    'Image 1 is the mother style. Keep the same product category, overall design DNA, fabric print language, and construction language unless the mutation below explicitly changes it.',
    `Mutation (change ONLY this dimension): ${mutation.promptHint || mutation.label}.`,
    `Variant label: ${mutation.label}.`,
  ];
  if (hasFabric) {
    bits.push('Image 2 is the locked fabric swatch — keep fabric color/print consistent with Image 2.');
  } else if (fabricText) {
    // 文本描述面料:没有图,把文字描述作为面料依据
    bits.push(`Locked fabric (text description, no image reference): ${fabricText}. Match the fabric qualities, color, and texture described.`);
  }
  const desc = (description || '').trim();
  if (desc) bits.push(`Additional brief: ${desc}`);
  bits.push(
    'Do NOT invent a totally new design. The result should clearly read as a sibling SKU of the mother style.',
  );
  bits.push(finalStyleBits());
  return bits.join('\n');
}

async function runStyleMutateBatch(batchId) {
  const b = smBatches.get(batchId);
  if (!b) return;
  // 诊断:进入调度的第一时间落日志
  console.log(`[design-generator] runStyleMutateBatch START batchId=${batchId} cells=${b.items.length} provider=${STYLE_MUTATE_PROVIDER} motherUrl=${b.mother?.url ? 'yes' : 'no'}`);
  try {
    b.status = 'running';
    b.updatedAt = Date.now();

    const tasks = b.items.map((cell) => async () => {
      console.log(`[design-generator] style-mutate cell START batchId=${batchId} mi=${cell.mi} label=${cell.label}`);
      const mutation = b.mutations[cell.mi];
      if (!mutation || !b.mother?.url) {
        cell.status = 'error';
        cell.error = '母款或裂变项缺失';
        return cell;
      }
      // 已有 buffer(此前 COS 上传失败保留)→ 直接重传,不再调模型生图
      if (cell._imgBuf) {
        console.log(`[design-generator] style-mutate cell RE-UPLOAD batchId=${batchId} mi=${cell.mi}`);
        cell.status = 'running';
        const upload = await uploadImageBuffer(cell._imgBuf, b.teamId, `style-mutate-${cell.mi}`);
        if (upload?.url) {
          cell.url = upload.url;
          cell.originalUrl = upload.originalUrl ?? null;
          cell.status = 'done';
          cell.error = undefined;
          cell._imgBuf = undefined;
          console.log(`[design-generator] style-mutate cell RE-UPLOAD DONE batchId=${batchId} mi=${cell.mi}`);
        } else {
          cell.error = upload?.error || '保存图片失败';
          cell.status = 'error';
          console.warn(`[design-generator] style-mutate cell RE-UPLOAD ERROR batchId=${batchId} mi=${cell.mi} error=${cell.error}`);
        }
        return cell;
      }
      const prompt = buildStyleMutatePrompt({
        name: b.name,
        description: b.description,
        mutation,
        hasFabric: !!b.fabric?.url,
        fabricText: b.fabric?.text || '',
      });
      cell.prompt = prompt;
      const referenceImages = [b.mother.url, b.fabric?.url].filter(Boolean);
      try {
        // 拆分为「生图」+「上传」两步,便于 COS 上传失败时保留 buffer 重传
        const gen = await generateImageBuffer(prompt, {
          teamId: b.teamId,
          aspectRatio: '1:1',
          safeName: `style-mutate-${cell.mi}`,
          provider: STYLE_MUTATE_PROVIDER,
          referenceImages,
        });
        if (!gen?.buffer) {
          cell.error = gen?.error || '生成失败';
          cell.status = 'error';
          console.warn(`[design-generator] style-mutate cell GEN ERROR batchId=${batchId} mi=${cell.mi} error=${cell.error}`);
          return cell;
        }
        const upload = await uploadImageBuffer(gen.buffer, b.teamId, `style-mutate-${cell.mi}`);
        if (upload?.url) {
          cell.url = upload.url;
          cell.originalUrl = upload.originalUrl ?? null;
          cell.status = 'done';
          console.log(`[design-generator] style-mutate cell DONE batchId=${batchId} mi=${cell.mi}`);
        } else {
          // COS 上传失败:保留 buffer 供重试(重传而非重新生图)
          cell._imgBuf = gen.buffer;
          cell.error = upload?.error || '保存图片失败';
          cell.status = 'error';
          console.warn(`[design-generator] style-mutate cell UPLOAD ERROR batchId=${batchId} mi=${cell.mi} error=${cell.error}(buffer retained for retry)`);
        }
      } catch (cellErr) {
        cell.error = cellErr?.message || '生成本格异常';
        cell.status = 'error';
        console.error(`[design-generator] style-mutate cell THROW batchId=${batchId} mi=${cell.mi} error=${cellErr?.message}`);
      }
      return cell;
    });

    await mapConcurrent(tasks, SM_BATCH_CAP, () => {
      b.updatedAt = Date.now();
    });
    b.status = 'done';
    b.updatedAt = Date.now();
  } catch (e) {
    console.error(`[design-generator] style-mutate batch ${batchId} error:`, e?.message || String(e));
    b.status = 'error';
    b.error = e?.message || '批次异常';
    b.updatedAt = Date.now();
  }
}

/**
 * POST /api/teams/:teamId/design/style-mutate
 * multipart: name, description, styleMeta, fabricMeta?, mutations(JSON), style?(file), fabric?(file)
 */
router.post('/style-mutate', (req, res) => {
  smUpload(req, res, async (uploadErr) => {
    if (uploadErr) {
      console.error('[design-generator] style-mutate upload error:', uploadErr.message);
      return res.status(400).json({ error: `上传失败: ${uploadErr.message}` });
    }
    const files = req.files || {};
    const styleFiles = files.style ?? [];
    const fabricFiles = files.fabric ?? [];
    const { name = '', description = '' } = req.body || {};

    let styleMeta = null;
    let fabricMeta = null;
    let mutations = [];
    try { if (req.body?.styleMeta) styleMeta = JSON.parse(req.body.styleMeta); } catch { /* */ }
    try { if (req.body?.fabricMeta) fabricMeta = JSON.parse(req.body.fabricMeta); } catch { /* */ }
    try { if (req.body?.mutations) mutations = JSON.parse(req.body.mutations); } catch { /* */ }

    if (!name.trim()) return res.status(400).json({ error: '请填写名称' });
    if (!styleMeta || typeof styleMeta !== 'object') {
      return res.status(400).json({ error: 'styleMeta 缺失' });
    }
    if (!Array.isArray(mutations) || !mutations.length) {
      return res.status(400).json({ error: '请至少勾选一个裂变项' });
    }
    if (mutations.length > MAX_MUTATIONS) {
      return res.status(400).json({ error: `裂变项最多 ${MAX_MUTATIONS} 个` });
    }
    for (const m of mutations) {
      if (!m?.axisId || !m?.optionId || !m?.label || !m?.promptHint) {
        return res.status(400).json({ error: 'mutations 项缺少 axisId/optionId/label/promptHint' });
      }
    }

    const needStyleUpload = styleMeta.kind === 'upload';
    const needFabricUpload = fabricMeta && fabricMeta.kind === 'upload';
    if (needStyleUpload && styleFiles.length !== 1) {
      return res.status(400).json({ error: '母款上传文件缺失' });
    }
    if (!needStyleUpload && styleFiles.length) {
      return res.status(400).json({ error: '库母款不应附带上传文件' });
    }
    if (needFabricUpload && fabricFiles.length !== 1) {
      return res.status(400).json({ error: '面料上传文件缺失' });
    }
    if (!needFabricUpload && fabricFiles.length) {
      return res.status(400).json({ error: '库面料不应附带上传文件' });
    }

    try {
      await chargeImages(req, mutations.length, 'style_mutate_per_image', `style-mutate:${mutations.length}`);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS') {
        return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
      }
      throw err;
    }

    try {
      let mother;
      if (styleMeta.kind === 'upload') {
        const f = styleFiles[0];
        const url = await persistStyleMutateTemp(f.path, f.filename, f.mimetype);
        mother = { name: styleMeta.name || f.originalname || '母款', url };
      } else if (styleMeta.kind === 'library-product') {
        // 从 Lookbook 单品库选母款:取产品封面图(images 主图 > 第一张效果图 > imageUrl)作为参考图
        const rec = await findOwned(prisma.lAProduct, styleMeta.productId, req.team.id);
        if (!rec) return res.status(404).json({ error: '母款单品不存在' });
        const url = pickProductCover(rec);
        if (!url) return res.status(400).json({ error: '母款缺少参考图' });
        mother = { name: rec.title || '母款', url };
      } else {
        const rec = await findOwned(prisma.lAStyle, styleMeta.styleId, req.team.id);
        if (!rec) return res.status(404).json({ error: '母款款式不存在' });
        mother = { name: rec.name || '母款', url: rec.image || '' };
        if (!mother.url) return res.status(400).json({ error: '母款缺少参考图' });
      }

      let fabric = null;
      if (fabricMeta) {
        if (fabricMeta.kind === 'upload') {
          const f = fabricFiles[0];
          const url = await persistStyleMutateTemp(f.path, f.filename, f.mimetype);
          fabric = { name: fabricMeta.name || f.originalname || '面料', url };
        } else if (fabricMeta.kind === 'text') {
          // 文本描述面料:直接用文字作为参考,无图
          fabric = { name: fabricMeta.name || fabricMeta.description || '自定义面料', url: '', text: fabricMeta.description || '' };
        } else {
          const rec = await findOwned(prisma.lAMaterial, fabricMeta.matId, req.team.id);
          if (!rec) return res.status(404).json({ error: '面料不存在' });
          const cis = Array.isArray(rec.colorImages) ? rec.colorImages : [];
          const ci = fabricMeta.colorIdx >= 0 ? cis[fabricMeta.colorIdx] : null;
          const url = (ci && ci.url) || rec.image || '';
          const colorName = ci?.name ? ` · ${ci.name}` : (fabricMeta.hex ? ` · ${fabricMeta.hex}` : '');
          fabric = { name: `${rec.name || '面料'}${colorName}`, url };
        }
      }

      const batchId = `sm-${crypto.randomUUID()}`;
      const now = Date.now();
      const items = mutations.map((m, mi) => ({
        mi,
        label: m.label,
        axisId: m.axisId,
        optionId: m.optionId,
        status: 'pending',
      }));
      const batch = {
        batchId,
        teamId: req.team.id,
        name: name.trim(),
        description: description.trim(),
        mother,
        fabric,
        mutations,
        items,
        status: 'running',
        createdAt: now,
        updatedAt: now,
      };
      smBatches.set(batchId, batch);
      res.status(202).json(smBatchPublicView(batch));
      runStyleMutateBatch(batchId).catch((err) => {
        console.error(`[design-generator] runStyleMutateBatch ${batchId} unhandled:`, err?.message || String(err));
        const b = smBatches.get(batchId);
        if (b) {
          b.status = 'error';
          b.error = err?.message || '批次异常';
          for (const it of b.items) {
            if (it.status === 'pending' || it.status === 'running') {
              it.status = 'error';
              it.error = b.error;
            }
          }
          b.updatedAt = Date.now();
        }
      });
    } catch (e) {
      console.error('[design-generator] style-mutate error:', e?.message || String(e));
      res.status(500).json({ error: e?.message || '生成失败' });
    }
  });
});

router.get('/style-mutate/batch/:batchId', (req, res) => {
  const batch = smBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });
  res.json(smBatchPublicView(batch));
});

router.post('/style-mutate/batch/:batchId/regenerate', async (req, res) => {
  const batch = smBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });

  const mi = Number.parseInt(req.body?.mi, 10);
  if (!Number.isInteger(mi)) return res.status(400).json({ error: 'mi 必须为整数' });

  const cell = batch.items.find((it) => it.mi === mi);
  const mutation = batch.mutations[mi];
  if (!cell || !mutation) return res.status(400).json({ error: '无效的 mi' });

  // 已有 buffer(COS 上传失败保留)→ 重传模式:直接上传,不重新生图,不扣币
  const isReupload = !!cell._imgBuf;

  if (!isReupload) {
    try {
      await chargeImages(req, 1, 'image_regenerate', `style-mutate:regenerate:${mi}`);
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS') {
        return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
      }
      throw err;
    }
  }

  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  batch.status = 'running';
  batch.updatedAt = Date.now();

  res.json({
    mi,
    label: cell.label,
    status: cell.status,
    url: cell.url,
    error: cell.error,
    prompt: cell.prompt,
    ...(isReupload ? { reupload: true } : {}),
  });

  try {
    let uploadResult;
    if (isReupload) {
      // 重传:直接上传保留的 buffer
      console.log(`[design-generator] style-mutate cell RE-UPLOAD (regenerate) batchId=${batch.batchId} mi=${mi}`);
      uploadResult = await uploadImageBuffer(cell._imgBuf, batch.teamId, `style-mutate-${mi}`);
    } else {
      // 重新生图
      const prompt = buildStyleMutatePrompt({
        name: batch.name,
        description: batch.description,
        mutation,
        hasFabric: !!batch.fabric?.url,
        fabricText: batch.fabric?.text || '',
      });
      cell.prompt = prompt;
      const referenceImages = [batch.mother?.url, batch.fabric?.url].filter(Boolean);
      const gen = await generateImageBuffer(prompt, {
        teamId: batch.teamId,
        aspectRatio: '1:1',
        safeName: `style-mutate-${mi}`,
        provider: STYLE_MUTATE_PROVIDER,
        referenceImages,
      });
      if (!gen?.buffer) {
        cell.error = gen?.error || '生成失败';
        cell.status = 'error';
        return;
      }
      uploadResult = await uploadImageBuffer(gen.buffer, batch.teamId, `style-mutate-${mi}`);
      if (!uploadResult?.url) {
        // COS 上传失败:保留 buffer 供下次重试
        cell._imgBuf = gen.buffer;
      }
    }
    if (uploadResult?.url) {
      cell.url = uploadResult.url;
      cell.originalUrl = uploadResult.originalUrl ?? null;
      cell.status = 'done';
      cell._imgBuf = undefined;
    } else {
      cell.error = uploadResult?.error || '保存图片失败';
      cell.status = 'error';
    }
  } catch (e) {
    console.error(`[design-generator] style-mutate regenerate ${batch.batchId} (${mi}) error:`, e?.message || String(e));
    cell.error = e?.message || '生成异常';
    cell.status = 'error';
  } finally {
    const stillPending = batch.items.some((it) => it.status === 'pending');
    batch.status = stillPending ? 'running' : 'done';
    batch.updatedAt = Date.now();
  }
});

// ── outfit-styling 守卫常量 ──────────────────────────────────
const MAX_PRODUCTS = 5;
const OUTFIT_STYLING_PROVIDER = process.env.OUTFIT_STYLING_PROVIDER || 'maizi-image-edit'; // 多图参考(模特 + 单品)
const OS_BATCH_TTL_MS = 15 * 60 * 1000;
// 穿搭效果生图比例:3:4 竖版更适合全身穿搭展示
const OUTFIT_STYLING_ASPECT = process.env.OUTFIT_STYLING_ASPECT || '3:4';

// ── illustration-create 守卫常量 ──────────────────────────────
// 文生图 / 图生图 统一走 maizi-image-edit(参考图生图):风格由 styleRefUrl 决定
const ILLUSTRATION_PROVIDER = process.env.ILLUSTRATION_PROVIDER || 'maizi-image-edit';
const IC_BATCH_TTL_MS = 15 * 60 * 1000;
// 插画生成比例:1:1 正方形
const ILLUSTRATION_ASPECT = process.env.ILLUSTRATION_ASPECT || '1:1';

// multer 单图上传(field 'image',可选 —— 文生图不传)
const icMulterStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(storage.TMP_DIR, { recursive: true });
    cb(null, storage.TMP_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `ic-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}${ext}`);
  },
});
const icUpload = multer({
  storage: icMulterStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime'));
  },
}).fields([{ name: 'image', maxCount: 1 }]);

// ─── outfit-styling 批次 store (进程内,带 TTL 清理) ────────────
/** @type {Map<string, {teamId:string,name:string,description:string,products:Array,model:Object,items:Array,status:string,createdAt:number,updatedAt:number,error?:string}>} */
const osBatches = new Map();

function osBatchPublicView(b) {
  return {
    batchId: b.batchId,
    teamId: b.teamId,
    status: b.status,
    error: b.error,
    name: b.name,
    products: (b.products || []).map((p) => ({ id: p.id, title: p.title, url: p.url })),
    model: b.model ? { id: b.model.id, name: b.model.name, url: b.model.url } : null,
    items: (b.items || []).map((it) => ({ status: it.status, url: it.url, error: it.error, prompt: it.prompt })),
    total: b.items?.length || 0,
    completed: (b.items || []).filter((it) => it.status === 'done').length,
    failed: (b.items || []).filter((it) => it.status === 'error').length,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, b] of osBatches) {
    if (now - b.updatedAt > OS_BATCH_TTL_MS) {
      for (const it of b.items) {
        if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = '生成超时,请重试'; }
      }
      b.status = 'done';
      b.updatedAt = now;
      osBatches.delete(id);
    }
  }
}, 30000).unref();

/**
 * 穿搭效果 prompt:图1 = 模特,图2..图N = 单品。
 * 指示 AI 让模特穿上所有单品,保持模特身材/面容/姿态,自然垂坠。
 * 关键:明确要求健康的肤色、自然的唇色、有活力的表情,避免苍白/面无血色。
 */
function buildOutfitStylingPrompt({ name, description, products, model }) {
  const lines = [];
  lines.push('Outfit styling composite. Image 1 is a full-body photo of a fashion model');
  if (model) {
    const stats = [];
    if (model.height != null) stats.push(`height ${model.height}cm`);
    if (model.bust != null) stats.push(`bust ${model.bust}cm`);
    if (model.waist != null) stats.push(`waist ${model.waist}cm`);
    if (model.hip != null) stats.push(`hip ${model.hip}cm`);
    if (model.shoes != null) stats.push(`shoe size ${model.shoes}`);
    if (stats.length) lines.push(`(${stats.join(', ')})`);
  }
  lines.push('.');
  products.forEach((p, i) => {
    lines.push(`Image ${i + 2} is a ${p.title || 'clothing item'}.`);
  });
  lines.push(
    `Dress the model (Image 1) in ALL the clothing items (Images 2-${products.length + 1}) together as a complete, cohesive outfit. ` +
    `Preserve the model's body proportions, posture, and face. ` +
    `Each garment should drape naturally and fit the figure. ` +
    `Keep each item's original color, material, and design faithful to its photo. ` +
    `The model must have a healthy, natural skin tone with warm undertones — never pale, washed-out, or anemic-looking. ` +
    `Lips should have a subtle natural rose/healthy color, not white or colorless. ` +
    `The expression should be lively, confident, and vibrant — conveying energy and vitality. ` +
    `Professional fashion photography, clean studio background, warm flattering lighting that enhances skin tone, photorealistic.`
  );
  if (name) lines.push(`Outfit theme: ${name}.`);
  if (description) lines.push(`Style notes: ${description}.`);
  return lines.join(' ');
}

async function runOutfitStylingBatch(batchId) {
  const b = osBatches.get(batchId);
  if (!b) return;
  console.log(`[design-generator] runOutfitStylingBatch START batchId=${batchId} products=${b.products?.length} provider=${OUTFIT_STYLING_PROVIDER}`);
  try {
    b.status = 'running';
    b.updatedAt = Date.now();
    const cell = b.items[0];
    const prompt = buildOutfitStylingPrompt({
      name: b.name, description: b.description, products: b.products || [], model: b.model,
    });
    cell.prompt = prompt;
    // 参考图顺序=图序号:[模特, 单品1, 单品2, ...]
    const referenceImages = [b.model?.url, ...(b.products || []).map((p) => p?.url)].filter(Boolean);
    try {
      const img = await generateImage(prompt, {
        teamId: b.teamId,
        aspectRatio: OUTFIT_STYLING_ASPECT,
        safeName: 'outfit-styling',
        provider: OUTFIT_STYLING_PROVIDER,
        referenceImages,
      });
      if (img?.url) {
        cell.url = img.url;
        cell.originalUrl = img.originalUrl ?? null;
        cell.status = 'done';
        console.log(`[design-generator] runOutfitStylingBatch DONE batchId=${batchId}`);
      } else {
        cell.error = img?.error || '生成失败';
        cell.status = 'error';
        console.warn(`[design-generator] runOutfitStylingBatch ERROR batchId=${batchId} error=${cell.error}`);
      }
    } catch (cellErr) {
      cell.error = cellErr?.message || '生成本图异常';
      cell.status = 'error';
      console.error(`[design-generator] runOutfitStylingBatch THROW batchId=${batchId} error=${cellErr?.message}`);
    }
    b.updatedAt = Date.now();
    b.status = b.items.every((it) => it.status === 'done') ? 'done'
      : b.items.some((it) => it.status === 'done') ? 'done' : 'error';
  } catch (e) {
    console.error(`[design-generator] runOutfitStylingBatch ${batchId} error:`, e?.message || String(e));
    b.status = 'error';
    b.error = e?.message || '批次生成异常';
    b.updatedAt = Date.now();
    for (const it of b.items) {
      if (it.status === 'pending') { it.status = 'error'; it.error = b.error; }
    }
  }
}

// POST /api/teams/:teamId/design/outfit-styling
// 穿搭效果:JSON body { name, description, products:[{id,title,url}], model:{id,name,url,height,...} }
// 模特图 + 1-5 张单品图作为多图参考 → 1 张模特穿搭效果图(无需文件上传,直接用库图 URL)
router.post('/outfit-styling', async (req, res) => {
  try {
    const body = req.body || {};
    const { name = '', description = '' } = body;
    const products = Array.isArray(body.products) ? body.products : [];
    const model = body.model && typeof body.model === 'object' ? body.model : null;

    if (!name.trim()) return res.status(400).json({ error: '请填写名称' });
    if (products.length < 1 || products.length > MAX_PRODUCTS) {
      return res.status(400).json({ error: `单品数量需在 1-${MAX_PRODUCTS} 款之间` });
    }
    if (!model || !model.url) {
      return res.status(400).json({ error: '请选择一张模特图片' });
    }
    // 守卫每条单品必须有图片 URL
    for (const [i, p] of products.entries()) {
      if (!p || !p.url) return res.status(400).json({ error: `单品 ${i + 1} 缺少图片` });
    }

    // 穿搭效果按 1 张预扣喵币(余额不足 402)
    try {
      await chargeImages(req, 1, 'outfit_styling', 'outfit-styling');
    } catch (err) {
      if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
      throw err;
    }

    // 构建批次(单图)
    const batchId = `os-${crypto.randomUUID()}`;
    const now = Date.now();
    const batch = {
      batchId,
      teamId: req.team.id,
      name: name.trim(),
      description: description.trim(),
      products: products.map((p) => ({ id: p.id, title: p.title || '单品', url: p.url })),
      model: { id: model.id, name: model.name || '模特', url: model.url, height: model.height ?? null, bust: model.bust ?? null, waist: model.waist ?? null, hip: model.hip ?? null, shoes: model.shoes ?? null },
      items: [{ status: 'pending' }],
      status: 'running',
      createdAt: now,
      updatedAt: now,
    };
    osBatches.set(batchId, batch);
    console.log(`[design-generator] outfit-styling ready ${batchId} products=${products.length} → 202`);

    // 202 立即返回,fire-and-forget 后台生成
    res.status(202).json(osBatchPublicView(batch));
    runOutfitStylingBatch(batchId).catch((err) => {
      console.error(`[design-generator] runOutfitStylingBatch ${batchId} unhandled:`, err?.message || String(err));
      const b = osBatches.get(batchId);
      if (b) {
        b.status = 'error';
        b.error = err?.message || '批次异常';
        for (const it of b.items) {
          if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = b.error; }
        }
        b.updatedAt = Date.now();
      }
    });
  } catch (fatal) {
    console.error('[design-generator] outfit-styling fatal:', fatal?.stack || fatal?.message || String(fatal));
    if (!res.headersSent) res.status(500).json({ error: fatal?.message || '穿搭效果内部异常' });
  }
});

// GET /api/teams/:teamId/design/outfit-styling/batch/:batchId —— 轮询进度
router.get('/outfit-styling/batch/:batchId', (req, res) => {
  const batch = osBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });
  res.json(osBatchPublicView(batch));
});

// POST /api/teams/:teamId/design/outfit-styling/batch/:batchId/regenerate —— 重试生成
router.post('/outfit-styling/batch/:batchId/regenerate', async (req, res) => {
  const batch = osBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });

  try {
    await chargeImages(req, 1, 'image_regenerate', 'outfit-styling:regenerate');
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    }
    throw err;
  }

  const cell = batch.items[0];
  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  batch.status = 'running';
  batch.updatedAt = Date.now();

  res.json({ status: cell.status, url: cell.url, error: cell.error, prompt: cell.prompt });

  try {
    const prompt = buildOutfitStylingPrompt({
      name: batch.name, description: batch.description, products: batch.products || [], model: batch.model,
    });
    cell.prompt = prompt;
    const referenceImages = [batch.model?.url, ...(batch.products || []).map((p) => p?.url)].filter(Boolean);
    const img = await generateImage(prompt, {
      teamId: batch.teamId,
      aspectRatio: OUTFIT_STYLING_ASPECT,
      safeName: 'outfit-styling',
      provider: OUTFIT_STYLING_PROVIDER,
      referenceImages,
    });
    if (img?.url) {
      cell.url = img.url;
      cell.originalUrl = img.originalUrl ?? null;
      cell.status = 'done';
    } else {
      cell.error = img?.error || '生成失败';
      cell.status = 'error';
    }
  } catch (e) {
    console.error(`[design-generator] outfit-styling regenerate ${batch.batchId} error:`, e?.message || String(e));
    cell.error = e?.message || '生成异常';
    cell.status = 'error';
  } finally {
    batch.status = batch.items.some((it) => it.status === 'done') ? 'done'
      : batch.items.every((it) => it.status === 'error') ? 'error' : 'done';
    batch.updatedAt = Date.now();
  }
});

// ══════════════════════════════════════════════════════════════
// illustration-create —— 插画创作(文生图 / 图生图) → 1 张 1:1 白底插画
// ══════════════════════════════════════════════════════════════

// ─── illustration-create 批次 store (进程内,带 TTL 清理) ─────────
/** @type {Map<string, {batchId:string,teamId:string,mode:string,name:string,prompt?:string,styleRefUrl?:string,refUrl?:string,brandLogo?:string,brandSlogan?:string,items:Array,status:string,createdAt:number,updatedAt:number,error?:string}>} */
const icBatches = new Map();

function icBatchPublicView(b) {
  const item = (b.items && b.items[0]) || { status: 'pending' };
  return {
    batchId: b.batchId,
    teamId: b.teamId,
    status: b.status,
    error: b.error,
    name: b.name,
    mode: b.mode,
    styleRefUrl: b.styleRefUrl || null,
    item: {
      status: item.status,
      url: item.url || null,
      originalUrl: item.originalUrl ?? null,
      error: item.error || null,
      prompt: item.prompt || null,
    },
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, b] of icBatches) {
    if (now - b.updatedAt > IC_BATCH_TTL_MS) {
      for (const it of b.items) {
        if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = '生成超时,请重试'; }
      }
      b.status = 'done';
      b.updatedAt = now;
      icBatches.delete(id);
    }
  }
}, 30000).unref();

/**
 * 文生图 prompt:品牌风格(brand block)+ 用户描述 + 1:1 白底插画指令。
 * prompt 主体是用户的插画描述,让其真正驱动画面内容。
 */
/**
 * 统一插画 prompt:风格由参考图(styleRefUrl)决定,不再用文本描述风格。
 *
 * 文生图(text):referenceImages=[styleRefUrl]
 *   → 图1=风格参考图,按用户描述生成同风格插画
 * 图生图(image):referenceImages=[userImgUrl, styleRefUrl]
 *   → 图1=用户照片,图2=风格参考图,将图1转绘为图2的风格
 */
function buildIllustrationPrompt({ mode, userPrompt, brandBlock }) {
  if (mode === 'image') {
    // 图生图:图1=用户照片,图2=风格参考图
    const extra = (userPrompt || '').trim();
    return `Transform Image 1 into the artistic style shown in Image 2. Preserve the subject, composition, and recognizable features of Image 1, but completely restyle it to match the visual aesthetic, color palette, brushwork, texture, and mood of Image 2.${extra ? `\n\nAdditional context: ${extra}` : ''}${brandBlock ? `\n\n${brandBlock}` : ''}`;
  }
  // 文生图:图1=风格参考图,根据描述生成同风格插画
  return `Create a 1:1 illustration in the exact artistic style shown in Image 1. Subject: ${userPrompt}.\n\nMatch the visual aesthetic, color palette, brushwork, texture, and mood of the reference style image. Output on pure white background. No text, no watermarks, no border.${brandBlock ? `\n\n${brandBlock}` : ''}`;
}

async function runIllustrationCreateBatch(batchId) {
  const b = icBatches.get(batchId);
  if (!b) return;
  console.log(`[design-generator] runIllustrationCreateBatch START batchId=${batchId} mode=${b.mode} provider=${ILLUSTRATION_PROVIDER}`);
  try {
    b.status = 'running';
    b.updatedAt = Date.now();
    const cell = b.items[0];
    const brandBlock = buildBrandBlock(b.brandLogo, b.brandSlogan);
    const prompt = buildIllustrationPrompt({ mode: b.mode, userPrompt: b.prompt, brandBlock });
    cell.prompt = prompt;
    // 参考图组装:文生图=[风格参考图],图生图=[用户照片, 风格参考图]
    const referenceImages = b.mode === 'image'
      ? [b.refUrl, b.styleRefUrl].filter(Boolean)
      : [b.styleRefUrl].filter(Boolean);
    try {
      const img = await generateImage(prompt, {
        teamId: b.teamId,
        aspectRatio: ILLUSTRATION_ASPECT,
        safeName: 'illustration-create',
        provider: ILLUSTRATION_PROVIDER,
        referenceImages,
      });
      if (img?.url) {
        cell.url = img.url;
        cell.originalUrl = img.originalUrl ?? null;
        cell.status = 'done';
        console.log(`[design-generator] runIllustrationCreateBatch DONE batchId=${batchId}`);
      } else {
        cell.error = img?.error || '生成失败';
        cell.status = 'error';
        console.warn(`[design-generator] runIllustrationCreateBatch ERROR batchId=${batchId} error=${cell.error}`);
      }
    } catch (cellErr) {
      cell.error = cellErr?.message || '生成本图异常';
      cell.status = 'error';
      console.error(`[design-generator] runIllustrationCreateBatch THROW batchId=${batchId} error=${cellErr?.message}`);
    }
    b.updatedAt = Date.now();
    b.status = b.items.every((it) => it.status === 'done') ? 'done'
      : b.items.some((it) => it.status === 'done') ? 'done' : 'error';
  } catch (e) {
    console.error(`[design-generator] runIllustrationCreateBatch ${batchId} error:`, e?.message || String(e));
    b.status = 'error';
    b.error = e?.message || '批次生成异常';
    b.updatedAt = Date.now();
    for (const it of b.items) {
      if (it.status === 'pending') { it.status = 'error'; it.error = b.error; }
    }
  }
}

/**
 * POST /api/teams/:teamId/design/illustration-create
 * body: multipart { mode: 'text'|'image', name, prompt?, styleRefUrl, brandLogo?, brandSlogan? } + field 'image'(file,仅图生图)
 * 两种模式统一走参考图生图:
 *   - 文生图(text):referenceImages=[styleRefUrl] → 按描述生成该风格插画
 *   - 图生图(image):referenceImages=[userImgUrl, styleRefUrl] → 将用户照片转绘为该风格
 * 返回 202: { batchId, status:'running', item, ... }
 */
router.post('/illustration-create', (req, res) => {
  icUpload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        console.error('[design-generator] illustration-create upload error:', uploadErr.message);
        return res.status(400).json({ error: `上传失败: ${uploadErr.message}` });
      }
      const body = req.body || {};
      const mode = String(body.mode || 'text');
      const name = (body.name || '').trim();
      const prompt = (body.prompt || '').trim();
      const styleRefUrl = body.styleRefUrl || undefined;
      const brandLogo = body.brandLogo || undefined;
      const brandSlogan = body.brandSlogan || undefined;
      const refFile = req.files?.image?.[0];

      if (!['text', 'image'].includes(mode)) {
        return res.status(400).json({ error: "mode 必须为 'text' 或 'image'" });
      }
      if (!name) return res.status(400).json({ error: '请填写名称' });
      if (!styleRefUrl) return res.status(400).json({ error: '请选择风格' });

      if (mode === 'image') {
        if (!refFile) return res.status(400).json({ error: '请上传参考图' });
      } else {
        if (!prompt) return res.status(400).json({ error: '请填写插画描述' });
      }

      // 插画创作按 1 张预扣喵币(余额不足 402)
      try {
        await chargeImages(req, 1, 'illustration_create', `illustration-create:${mode}`);
      } catch (err) {
        if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
        throw err;
      }

      // 持久化用户上传的参考图(仅 image 模式)
      let refUrl = null;
      if (refFile) {
        const savePath = storage.createSavePath(`design/illustration-create`, refFile.filename);
        await storage.saveUpload(refFile.path, savePath, refFile.mimetype);
        refUrl = storage.getPublicUrl(savePath);
      }

      // 建 batch(单条 item pending)
      const batchId = `ic-${crypto.randomUUID()}`;
      const now = Date.now();
      const batch = {
        batchId,
        teamId: req.team.id,
        mode,
        name,
        prompt: prompt || undefined,
        styleRefUrl,
        refUrl,
        brandLogo,
        brandSlogan,
        items: [{ status: 'pending' }],
        status: 'running',
        createdAt: now,
        updatedAt: now,
      };
      icBatches.set(batchId, batch);
      console.log(`[design-generator] illustration-create ready ${batchId} mode=${mode} styleRefUrl=${styleRefUrl ? 'yes' : '-'} → 202`);

      res.status(202).json(icBatchPublicView(batch));
      runIllustrationCreateBatch(batchId).catch((err) => {
        console.error(`[design-generator] runIllustrationCreateBatch ${batchId} unhandled:`, err?.message || String(err));
        const b = icBatches.get(batchId);
        if (b) {
          b.status = 'error';
          b.error = err?.message || '批次异常';
          for (const it of b.items) {
            if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = b.error; }
          }
          b.updatedAt = Date.now();
        }
      });
    } catch (fatal) {
      console.error('[design-generator] illustration-create fatal:', fatal?.stack || fatal?.message || String(fatal));
      if (!res.headersSent) res.status(500).json({ error: fatal?.message || '插画创作内部异常' });
    }
  });
});

// GET /api/teams/:teamId/design/illustration-create/batch/:batchId —— 轮询进度
router.get('/illustration-create/batch/:batchId', (req, res) => {
  const batch = icBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });
  res.json(icBatchPublicView(batch));
});

// POST /api/teams/:teamId/design/illustration-create/batch/:batchId/regenerate —— 重生成
router.post('/illustration-create/batch/:batchId/regenerate', async (req, res) => {
  const batch = icBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });

  try {
    await chargeImages(req, 1, 'image_regenerate', 'illustration-create:regenerate');
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    }
    throw err;
  }

  const cell = batch.items[0];
  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  cell.originalUrl = undefined;
  batch.status = 'running';
  batch.updatedAt = Date.now();

  res.json({ status: cell.status, url: cell.url, error: cell.error, prompt: cell.prompt });

  try {
    const brandBlock = buildBrandBlock(batch.brandLogo, batch.brandSlogan);
    const prompt = buildIllustrationPrompt({ mode: batch.mode, userPrompt: batch.prompt, brandBlock });
    cell.prompt = prompt;
    // 参考图组装:文生图=[风格参考图],图生图=[用户照片, 风格参考图]
    const referenceImages = batch.mode === 'image'
      ? [batch.refUrl, batch.styleRefUrl].filter(Boolean)
      : [batch.styleRefUrl].filter(Boolean);
    const img = await generateImage(prompt, {
      teamId: batch.teamId,
      aspectRatio: ILLUSTRATION_ASPECT,
      safeName: 'illustration-create',
      provider: ILLUSTRATION_PROVIDER,
      referenceImages,
    });
    if (img?.url) {
      cell.url = img.url;
      cell.originalUrl = img.originalUrl ?? null;
      cell.status = 'done';
    } else {
      cell.error = img?.error || '生成失败';
      cell.status = 'error';
    }
  } catch (e) {
    console.error(`[design-generator] illustration-create regenerate ${batch.batchId} error:`, e?.message || String(e));
    cell.error = e?.message || '生成异常';
    cell.status = 'error';
  } finally {
    batch.status = batch.items.some((it) => it.status === 'done') ? 'done'
      : batch.items.every((it) => it.status === 'error') ? 'error' : 'done';
    batch.updatedAt = Date.now();
  }
});

// ══════════════════════════════════════════════════════════════
// regular-generate —— 常规生图(文生图 / 图生图 → 1–4 张通用产品图)
// ══════════════════════════════════════════════════════════════

// ── regular-generate 守卫常量 ────────────────────────────────
const MAX_REGULAR_IMAGES = 4;
const RG_BATCH_CAP = Number.parseInt(process.env.RG_BATCH_CAP || '', 10) || 4;
const RG_BATCH_TTL_MS = 15 * 60 * 1000;
// 常规生图 provider:MaiziTech 图像编辑(多图参考,图生图时把参考图作为图1)
const REGULAR_GENERATE_PROVIDER = process.env.REGULAR_GENERATE_PROVIDER || 'maizi-image-edit';
// 常规生图比例:1:1 正方形
const REGULAR_GENERATE_ASPECT = process.env.REGULAR_GENERATE_ASPECT || '1:1';

// multer 单图上传(field 'image',可选 —— 文生图不传)
const rgMulterStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(storage.TMP_DIR, { recursive: true });
    cb(null, storage.TMP_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `rg-${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}${ext}`);
  },
});
const rgUpload = multer({
  storage: rgMulterStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|avif|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('unsupported mime'));
  },
}).fields([{ name: 'image', maxCount: 1 }]);

// ─── regular-generate 批次 store (进程内,带 TTL 清理) ──────────
/** @type {Map<string, {batchId:string,teamId:string,mode:string,name:string,count:number,prompt:string,refUrl?:string,brandLogo?:string,brandSlogan?:string,items:Array,status:string,createdAt:number,updatedAt:number,error?:string}>} */
const rgBatches = new Map();

function rgBatchPublicView(b) {
  const completed = b.items.filter((it) => it.status === 'done').length;
  const failed = b.items.filter((it) => it.status === 'error').length;
  return {
    batchId: b.batchId,
    teamId: b.teamId,
    status: b.status,
    error: b.error,
    name: b.name,
    mode: b.mode,
    count: b.count,
    refUrl: b.refUrl || null,
    items: b.items.map((it) => ({
      ci: it.ci,
      status: it.status,
      url: it.url || null,
      originalUrl: it.originalUrl ?? null,
      error: it.error || null,
      prompt: it.prompt || null,
    })),
    total: b.items.length,
    completed,
    failed,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, b] of rgBatches) {
    if (now - b.updatedAt > RG_BATCH_TTL_MS) {
      for (const it of b.items) {
        if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = '生成超时,请重试'; }
      }
      b.status = 'done';
      b.updatedAt = now;
      rgBatches.delete(id);
    }
  }
}, 30000).unref();

/**
 * 常规生图 prompt:文生图 = 纯文本产品图指令;图生图 = 把参考图转绘为产品图。
 * 风格由 prompt 驱动(无风格参考图),参考图仅作为图生图的主体内容参考。
 */
function buildRegularPrompt({ mode, userPrompt, brandBlock }) {
  if (mode === 'image') {
    const extra = (userPrompt || '').trim();
    return `Transform Image 1 into a polished product photograph on pure white background. Preserve the subject and composition of Image 1, but render it as a clean e-commerce product shot with studio lighting against a pure white backdrop.${extra ? `\n\nAdditional context: ${extra}` : ''}${brandBlock ? `\n\n${brandBlock}` : ''}`;
  }
  // 文生图:纯文本产品图指令
  return `Create a product photograph on pure white background. Subject: ${userPrompt}. Clean studio lighting, sharp detail, e-commerce catalog style. No model, no mannequin, no background clutter, pure white backdrop.${brandBlock ? `\n\n${brandBlock}` : ''}`;
}

async function runRegularGenerateBatch(batchId) {
  const b = rgBatches.get(batchId);
  if (!b) return;
  console.log(`[design-generator] runRegularGenerateBatch START batchId=${batchId} mode=${b.mode} count=${b.count} provider=${REGULAR_GENERATE_PROVIDER}`);
  try {
    b.status = 'running';
    b.updatedAt = Date.now();
    const brandBlock = buildBrandBlock(b.brandLogo, b.brandSlogan);
    const prompt = buildRegularPrompt({ mode: b.mode, userPrompt: b.prompt, brandBlock });

    const tasks = b.items.map((cell) => async () => {
      console.log(`[design-generator] regular-generate cell START batchId=${batchId} ci=${cell.ci}`);
      cell.prompt = prompt;
      // 参考图组装:文生图=[],图生图=[refUrl]
      const referenceImages = b.mode === 'image' && b.refUrl ? [b.refUrl] : [];
      try {
        const img = await generateImage(prompt, {
          teamId: b.teamId,
          aspectRatio: REGULAR_GENERATE_ASPECT,
          safeName: `regular-generate-${cell.ci}`,
          provider: REGULAR_GENERATE_PROVIDER,
          referenceImages,
        });
        if (img?.url) {
          cell.url = img.url;
          cell.originalUrl = img.originalUrl ?? null;
          cell.status = 'done';
          console.log(`[design-generator] regular-generate cell DONE batchId=${batchId} ci=${cell.ci}`);
        } else {
          cell.error = img?.error || '生成失败';
          cell.status = 'error';
          console.warn(`[design-generator] regular-generate cell ERROR batchId=${batchId} ci=${cell.ci} error=${cell.error}`);
        }
      } catch (cellErr) {
        cell.error = cellErr?.message || '生成本格异常';
        cell.status = 'error';
        console.error(`[design-generator] regular-generate cell THROW batchId=${batchId} ci=${cell.ci} error=${cellErr?.message}`);
      }
      return cell;
    });

    await mapConcurrent(tasks, RG_BATCH_CAP);

    b.updatedAt = Date.now();
    b.status = b.items.every((it) => it.status === 'done') ? 'done'
      : b.items.some((it) => it.status === 'done') ? 'done' : 'error';
  } catch (e) {
    console.error(`[design-generator] runRegularGenerateBatch ${batchId} error:`, e?.message || String(e));
    b.status = 'error';
    b.error = e?.message || '批次生成异常';
    b.updatedAt = Date.now();
    for (const it of b.items) {
      if (it.status === 'pending') { it.status = 'error'; it.error = b.error; }
    }
  }
}

/**
 * POST /api/teams/:teamId/design/regular-generate
 * body: multipart { mode: 'text'|'image', name, prompt, count: 1-4, refUrl?, brandLogo?, brandSlogan? } + field 'image'(file,仅图生图)
 * 文生图:text → 纯文本产品图;图生图:image → 参考图转绘为产品图
 * 返回 202: { batchId, status:'running', items, ... }
 */
router.post('/regular-generate', (req, res) => {
  rgUpload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        console.error('[design-generator] regular-generate upload error:', uploadErr.message);
        return res.status(400).json({ error: `上传失败: ${uploadErr.message}` });
      }
      const body = req.body || {};
      const mode = String(body.mode || 'text');
      const name = (body.name || '').trim();
      const prompt = (body.prompt || '').trim();
      const count = Math.min(Math.max(Number.parseInt(body.count, 10) || 1, 1), MAX_REGULAR_IMAGES);
      const brandLogo = body.brandLogo || undefined;
      const brandSlogan = body.brandSlogan || undefined;
      const refFile = req.files?.image?.[0];

      if (!['text', 'image'].includes(mode)) {
        return res.status(400).json({ error: "mode 必须为 'text' 或 'image'" });
      }
      if (!name) return res.status(400).json({ error: '请填写名称' });
      if (mode === 'image') {
        if (!refFile) return res.status(400).json({ error: '请上传参考图' });
      } else {
        if (!prompt) return res.status(400).json({ error: '请填写描述' });
      }

      // 常规生图按 N 张预扣喵币(余额不足 402)
      try {
        await chargeImages(req, count, 'image_generate', `regular-generate:${mode}`);
      } catch (err) {
        if (err.code === 'INSUFFICIENT_COINS') return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
        throw err;
      }

      // 持久化用户上传的参考图(仅 image 模式)
      let refUrl = null;
      if (refFile) {
        const savePath = storage.createSavePath('design/regular-generate', refFile.filename);
        await storage.saveUpload(refFile.path, savePath, refFile.mimetype);
        refUrl = storage.getPublicUrl(savePath);
      }

      // 建 batch(count 个 pending cell)
      const batchId = `rg-${crypto.randomUUID()}`;
      const now = Date.now();
      const items = Array.from({ length: count }, (_, ci) => ({ ci, status: 'pending' }));
      const batch = {
        batchId,
        teamId: req.team.id,
        mode,
        name,
        count,
        prompt,
        refUrl,
        brandLogo,
        brandSlogan,
        items,
        status: 'running',
        createdAt: now,
        updatedAt: now,
      };
      rgBatches.set(batchId, batch);
      console.log(`[design-generator] regular-generate ready ${batchId} mode=${mode} count=${count} refUrl=${refUrl ? 'yes' : '-'} → 202`);

      res.status(202).json(rgBatchPublicView(batch));
      runRegularGenerateBatch(batchId).catch((err) => {
        console.error(`[design-generator] runRegularGenerateBatch ${batchId} unhandled:`, err?.message || String(err));
        const b = rgBatches.get(batchId);
        if (b) {
          b.status = 'error';
          b.error = err?.message || '批次异常';
          for (const it of b.items) {
            if (it.status === 'pending' || it.status === 'running') { it.status = 'error'; it.error = b.error; }
          }
          b.updatedAt = Date.now();
        }
      });
    } catch (fatal) {
      console.error('[design-generator] regular-generate fatal:', fatal?.stack || fatal?.message || String(fatal));
      if (!res.headersSent) res.status(500).json({ error: fatal?.message || '常规生图内部异常' });
    }
  });
});

// GET /api/teams/:teamId/design/regular-generate/batch/:batchId —— 轮询进度
router.get('/regular-generate/batch/:batchId', (req, res) => {
  const batch = rgBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });
  res.json(rgBatchPublicView(batch));
});

// POST /api/teams/:teamId/design/regular-generate/batch/:batchId/regenerate —— 单格重生成
router.post('/regular-generate/batch/:batchId/regenerate', async (req, res) => {
  const batch = rgBatches.get(req.params.batchId);
  if (!batch) return res.status(404).json({ error: '批次不存在或已过期,请重新生成' });
  if (batch.teamId !== req.team.id) return res.status(403).json({ error: '无权访问该批次' });

  const ci = Number.parseInt(req.body?.ci, 10);
  if (!Number.isInteger(ci)) return res.status(400).json({ error: 'ci 必须为整数' });

  const cell = batch.items.find((it) => it.ci === ci);
  if (!cell) return res.status(400).json({ error: '无效的 ci' });

  // 单格重生成扣 1 张
  try {
    await chargeImages(req, 1, 'image_regenerate', `regular-generate:regenerate:${ci}`);
  } catch (err) {
    if (err.code === 'INSUFFICIENT_COINS') {
      return res.status(402).json({ error: err.message, code: 'INSUFFICIENT_COINS', coins: err.coins, cost: err.cost });
    }
    throw err;
  }

  cell.status = 'pending';
  cell.error = undefined;
  cell.url = undefined;
  cell.originalUrl = undefined;
  batch.status = 'running';
  batch.updatedAt = Date.now();

  res.json({ ci, status: cell.status, url: cell.url, error: cell.error, prompt: cell.prompt });

  try {
    const brandBlock = buildBrandBlock(batch.brandLogo, batch.brandSlogan);
    const prompt = buildRegularPrompt({ mode: batch.mode, userPrompt: batch.prompt, brandBlock });
    cell.prompt = prompt;
    const referenceImages = batch.mode === 'image' && batch.refUrl ? [batch.refUrl] : [];
    const img = await generateImage(prompt, {
      teamId: batch.teamId,
      aspectRatio: REGULAR_GENERATE_ASPECT,
      safeName: `regular-generate-${ci}`,
      provider: REGULAR_GENERATE_PROVIDER,
      referenceImages,
    });
    if (img?.url) {
      cell.url = img.url;
      cell.originalUrl = img.originalUrl ?? null;
      cell.status = 'done';
    } else {
      cell.error = img?.error || '生成失败';
      cell.status = 'error';
    }
  } catch (e) {
    console.error(`[design-generator] regular-generate regenerate ${batch.batchId} (${ci}) error:`, e?.message || String(e));
    cell.error = e?.message || '生成异常';
    cell.status = 'error';
  } finally {
    const stillPending = batch.items.some((it) => it.status === 'pending');
    batch.status = stillPending ? 'running' : 'done';
    batch.updatedAt = Date.now();
  }
});

module.exports = router;
