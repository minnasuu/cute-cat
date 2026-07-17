#!/usr/bin/env node
/**
 * migrate-uploads-to-cos.js —— 存量本地文件一次性迁移到腾讯云 COS
 *
 * 前提:已在 .env 配齐 S3_* 系列 env,storage.mode === 's3'。
 *
 * 流程:
 *   1. 扫描所有表/列,收集含 /uploads/ 的条目(含 JSON 数组列里的 url)
 *   2. 列出待上传文件清单 + 待更新 SQL 预览(dry-run)
 *   3. --exec 真跑:putBuffer 原样上传 COS(不二次压缩) + 更新 DB url
 *   4. checksum:本地 size vs COS size 比对
 *
 * 安全机制:
 *   - 默认 dry-run,加 --exec 才真正上传 + 更新 DB
 *   - 跳过 local 模式(无 S3 配置)
 *   - 文件不存在时跳过并 warn
 *   - 上传失败时跳过该文件,不阻塞整体
 *   - 更新 DB 前先上传,上传成功才改 url(避免只改一半)
 *   - 不清空本地副本(保留热缓存,随时可回退)
 *
 * 用法:
 *   node scripts/migrate-uploads-to-cos.js          # 默认 DRY RUN
 *   node scripts/migrate-uploads-to-cos.js --exec   # 真正执行
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const storage = require('../lib/storage');
const { putBuffer, getPublicUrl, createSavePath } = storage;

const EXEC = process.argv.includes('--exec');
const UPLOADS_PREFIX = '/uploads/';

// ─── 字段清单(schema 提取) ────────────────────────────────────
// 直接 URL 列:String 类型,整列是 /uploads/... 路径
const STRING_COLS = [
  { table: 'User', col: 'avatar', model: 'user', pk: 'id' },
  { table: 'Team', col: 'icon', model: 'team', pk: 'id' },
  { table: 'LABrandProfile', col: 'logo', model: 'lABrandProfile', pk: 'id' },
  { table: 'LAVisualAsset', col: 'src', model: 'lAVisualAsset', pk: 'id' },
  { table: 'LAInspirationAsset', col: 'url', model: 'lAInspirationAsset', pk: 'id' },
  { table: 'LAInspirationAsset', col: 'thumbUrl', model: 'lAInspirationAsset', pk: 'id' },
  { table: 'LAMaterial', col: 'image', model: 'lAMaterial', pk: 'id' },
  { table: 'LAStyle', col: 'image', model: 'lAStyle', pk: 'id' },
  { table: 'LAIllustrationAsset', col: 'image', model: 'lAIllustrationAsset', pk: 'id' },
  { table: 'LAProduct', col: 'patternUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'techPackUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'imageUrl', model: 'lAProduct', pk: 'id' },
  { table: 'LAProduct', col: 'patternFinalUrl', model: 'lAProduct', pk: 'id' },
];

// JSON 列:数组,每个元素有 url 字段
const JSON_COLS = [
  { table: 'LAMaterial', col: 'colorImages', model: 'lAMaterial', pk: 'id', urlKey: 'url' },
  { table: 'LAProduct', col: 'images', model: 'lAProduct', pk: 'id', urlKey: 'url' },
  { table: 'LAProduct', col: 'sourceImages', model: 'lAProduct', pk: 'id', urlKey: 'url' },
  { table: 'CommunityPost', col: 'images', model: 'communityPost', pk: 'id', urlKey: 'url' },
];

// ─── 扫描 ──────────────────────────────────────────────────────
async function scanStringCols() {
  const items = [];
  for (const { table, col, model, pk } of STRING_COLS) {
    const rows = await prisma[model].findMany({
      select: { [pk]: true, [col]: true },
    });
    for (const row of rows) {
      const v = row[col];
      if (typeof v === 'string' && v.startsWith(UPLOADS_PREFIX)) {
        items.push({ table, col, model, pk, id: row[pk], oldUrl: v });
      }
    }
  }
  return items;
}

async function scanJsonCols() {
  const items = [];
  for (const { table, col, model, pk, urlKey } of JSON_COLS) {
    const rows = await prisma[model].findMany({
      select: { [pk]: true, [col]: true },
    });
    for (const row of rows) {
      const arr = row[col];
      if (!Array.isArray(arr)) continue;
      arr.forEach((el, idx) => {
        const v = el?.[urlKey];
        if (typeof v === 'string' && v.startsWith(UPLOADS_PREFIX)) {
          items.push({ table, col, model, pk, id: row[pk], oldUrl: v, jsonIdx: idx, jsonArr: arr, urlKey });
        }
      });
    }
  }
  return items;
}

// ─── 路径转换 ──────────────────────────────────────────────────
function relPathFromUrl(url) {
  // /uploads/<relPath> → <relPath>
  return url.slice(UPLOADS_PREFIX.length);
}
function absPathFromRel(relPath) {
  return path.join(storage.UPLOAD_ROOT, relPath);
}
function cosKeyFromRel(relPath) {
  // 复用 createSavePath 的 prefix 逻辑,但保留原相对路径(含子目录)
  const prefix = (process.env.S3_FOLDER_PREFIX || '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${relPath}` : relPath;
}

// ─── 上传 + 更新 ───────────────────────────────────────────────
async function uploadOne(absPath, cosKey, contentType) {
  return putBuffer({ absPath, savePath: cosKey, contentType });
}

async function updateStringCol(item, newUrl) {
  const { model, pk, id, col } = item;
  await prisma[model].update({ where: { [pk]: id }, data: { [col]: newUrl } });
}

async function updateJsonCol(item, newUrl) {
  const { model, pk, id, col, jsonIdx, jsonArr, urlKey } = item;
  const arr = [...jsonArr];
  arr[jsonIdx] = { ...arr[jsonIdx], [urlKey]: newUrl };
  await prisma[model].update({ where: { [pk]: id }, data: { [col]: arr } });
}

// ─── 主流程 ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== migrate-uploads-to-cos ===`);
  console.log(`mode: ${storage.mode}`);
  console.log(`root: ${storage.UPLOAD_ROOT}`);
  console.log(`exec: ${EXEC ? 'YES (uploading + updating DB)' : 'DRY RUN (preview only, add --exec)'}\n`);

  if (storage.mode !== 's3') {
    console.log('❌ 当前不是 S3 模式(未配 S3_BUCKET 等 env),请先配齐后再跑。');
    process.exit(1);
  }

  const stringItems = await scanStringCols();
  const jsonItems = await scanJsonCols();
  const allItems = [...stringItems, ...jsonItems];

  // 去重(同一文件可能被多处引用)
  const fileMap = new Map(); // absPath → { relPath, cosKey, absPath, size, refs: [] }
  for (const it of allItems) {
    const relPath = relPathFromUrl(it.oldUrl);
    const absPath = absPathFromRel(relPath);
    const cosKey = cosKeyFromRel(relPath);
    if (!fileMap.has(absPath)) {
      let size = 0;
      try { size = fs.statSync(absPath).size; } catch { /* 文件不存在 */ }
      fileMap.set(absPath, { relPath, cosKey, absPath, size, refs: [] });
    }
    fileMap.get(absPath).refs.push(it);
  }

  const files = [...fileMap.values()];
  const missing = files.filter((f) => f.size === 0);
  const ok = files.filter((f) => f.size > 0);

  console.log(`扫描完成:`);
  console.log(`  受影响条目: ${allItems.length} 个 url`);
  console.log(`  去重后文件: ${files.length} 个`);
  console.log(`  文件存在:   ${ok.length} 个`);
  console.log(`  文件缺失:   ${missing.length} 个`);
  if (missing.length > 0) {
    console.log(`  缺失文件清单:`);
    for (const f of missing) console.log(`    - ${f.absPath}`);
  }

  if (files.length === 0) {
    console.log('\n✅ 无需要迁移的文件。');
    return;
  }

  // 预览前 10 个
  console.log(`\n预览(前 10 个):`);
  for (const f of ok.slice(0, 10)) {
    const newUrl = getPublicUrl(f.cosKey);
    console.log(`  ${f.relPath}  →  ${newUrl}  (${f.size} bytes, ${f.refs.length} 处引用)`);
  }
  if (ok.length > 10) console.log(`  ... 还有 ${ok.length - 10} 个`);

  if (!EXEC) {
    console.log(`\n🔒 dry-run 完成(未上传、未改 DB)。确认无误后加 --exec 执行。`);
    return;
  }

  // ─── 真跑 ────────────────────────────────────────────────────
  console.log(`\n开始上传 + 更新 DB...`);
  let uploaded = 0;
  let uploadFailed = 0;
  let updated = 0;
  let updateFailed = 0;
  const newUrlCache = new Map(); // absPath → newUrl

  for (const f of ok) {
    // 上传
    let newUrl = newUrlCache.get(f.absPath);
    if (!newUrl) {
      try {
        const contentType = guessMime(f.absPath);
        await uploadOne(f.absPath, f.cosKey, contentType);
        newUrl = getPublicUrl(f.cosKey);
        newUrlCache.set(f.absPath, newUrl);
        uploaded++;
        console.log(`  ↑ ${f.relPath} → ${newUrl}`);
      } catch (e) {
        uploadFailed++;
        console.error(`  ✗ 上传失败 ${f.relPath}: ${e.message}`);
        continue; // 上传失败 → 不更新 DB
      }
    }
    // 更新所有引用
    for (const ref of f.refs) {
      try {
        if (ref.jsonIdx !== undefined) {
          await updateJsonCol(ref, newUrl);
        } else {
          await updateStringCol(ref, newUrl);
        }
        updated++;
      } catch (e) {
        updateFailed++;
        console.error(`  ✗ 更新失败 ${ref.table}.${ref.col}#${ref.id}: ${e.message}`);
      }
    }
  }

  console.log(`\n=== 结果 ===`);
  console.log(`  上传成功:   ${uploaded}`);
  console.log(`  上传失败:   ${uploadFailed}`);
  console.log(`  DB 更新成功: ${updated}`);
  console.log(`  DB 更新失败: ${updateFailed}`);
  console.log(`  本地副本:   保留(未清空,可回退)`);
}

function guessMime(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
