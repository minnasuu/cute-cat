'use strict';

/**
 * illustration-styles.js —— 用户插画风格库(teamId 作用域,文件持久化)。
 *
 * 设计取舍:
 *   - 复用现有本地上传卷(/app/backend/uploads),不引入新表/迁移 —— 在线上
 *     Postgres 实例 migration 未跑通、不想新增 schema 的前提下即可上线。
 *   - 索引落盘为 JSON: illustration-styles/<teamId>/index.json;每个团队限 10 条,
 *     超限时拒绝追加(前端同步软上限)。
 *   - 风格图本身走 storage.js 统一落盘(local 卷 或 S3),URL 与 PRESET_STYLES
 *     的 refImage 同构,前端无需区分「自带/用户」。
 *
 * 每条: { id, label, description, refImage, createdAt }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const storage = require('./storage');
const { UPLOAD_ROOT } = storage;

const MAX_PER_TEAM = 10;

function teamDir(teamId) {
  return path.join(UPLOAD_ROOT, 'illustration-styles', String(teamId));
}
function indexPath(teamId) {
  return path.join(teamDir(teamId), 'index.json');
}

function readIndex(teamId) {
  const p = indexPath(teamId);
  try {
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.warn(`[illustration-styles] readIndex ${teamId} failed: ${err.message}`);
    return [];
  }
}

function writeIndex(teamId, items) {
  const dir = teamDir(teamId);
  fs.mkdirSync(dir, { recursive: true });
  const p = indexPath(teamId);
  // 原子写入:先写 .tmp 再 rename,避免并发读到半截 JSON
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, p);
}

/** 列出某团队的用户风格(按创建时间升序,与渲染顺序一致) */
async function listStyles(teamId) {
  return readIndex(teamId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/**
 * 追加一条用户风格,返回完整 record。
 * @param {{teamId:string,label:string,description?:string,refImage:string}} input
 * @throws {Error} code='LIMIT_EXCEEDED' 已满 10 条
 */
async function addStyle(input) {
  const { teamId } = input;
  const items = readIndex(teamId);
  if (items.length >= MAX_PER_TEAM) {
    const err = new Error(`每个团队最多保存 ${MAX_PER_TEAM} 个自定义风格`);
    err.code = 'LIMIT_EXCEEDED';
    err.limit = MAX_PER_TEAM;
    throw err;
  }
  const rec = {
    id: `us-${crypto.randomUUID()}`,
    label: (input.label || '').trim() || '自定义风格',
    description: (input.description || '').trim(),
    refImage: input.refImage,
    createdAt: Date.now(),
  };
  items.push(rec);
  writeIndex(teamId, items);
  return rec;
}

/**
 * 删除一条用户风格;顺带异步清理风格图(失败仅记日志,不阻塞)。
 * @returns {boolean} false = 该 id 不是用户风格(或不存在)
 */
async function deleteStyle(teamId, styleId) {
  if (!styleId || !String(styleId).startsWith('us-')) return false;
  const items = readIndex(teamId);
  const idx = items.findIndex((it) => it.id === styleId);
  if (idx === -1) return false;
  const [removed] = items.splice(idx, 1);
  writeIndex(teamId, items);
  if (removed?.refImage) {
    storage.deleteImageByUrl(removed.refImage).catch((err) => {
      console.warn(`[illustration-styles] delete refImage cleanup ${removed.id} failed: ${err?.message || err}`);
    });
  }
  return true;
}

module.exports = { MAX_PER_TEAM, listStyles, addStyle, deleteStyle };
