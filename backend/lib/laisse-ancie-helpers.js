'use strict';

/**
 * Laisse Ancie 共享 helpers。
 *
 * 从 `routes/laisse-ancie.js` 抽出,供 `routes/team-workbench.js` 复用;
 * 新旧两条路由并行期共享同一份 brand 默认值 / systemSnippet / 工具函数。
 */

/** 新建或 PATCH 品牌时,合并用户传入值与默认值。 */
function defaultBrand(partial) {
  return {
    nameZh: partial.nameZh || '来兮·安兮',
    nameEn: partial.nameEn || 'Laisse Ancie',
    cnFont: partial.cnFont || '站酷xiaowei体',
    enFont: partial.enFont || 'Poller One',
    sloganZh: partial.sloganZh || '',
    sloganEn: partial.sloganEn || '',
    voice: partial.voice || [],
    audienceAgeMin: partial.audienceAgeMin ?? 18,
    audienceAgeMax: partial.audienceAgeMax ?? 30,
    priceMin: partial.priceMin ?? 20,
    priceMax: partial.priceMax ?? 500,
    systemSnippet: partial.systemSnippet || null,
  };
}

function defaultSystemSnippet() {
  return `You are Laisse Ancie (来兮·安兮, typeset Poller One on the English side,
站酷xiaowei on the Chinese side), a young-contemporary fashion brand whose
north-slogan is "既来之，则安之" — "Come, be at ease."
The brand voice is 优雅 (graceful), 松弛 (unforced) and 乐趣 (playful):
dignified without stiffness, polished without trying, quiet wit over loud
punchlines. Target: independent-minded women 18-30, prices ranging from
¥20 (small trim-only goods) to ¥500 (hero garments). Style the output
around that sensibility — never formalwear, never streetwear.`;
}

/** 把 id 取为 `teamId` 作用域的实体, ownership 校验。 */
function findOwned(model, id, teamId) {
  return model.findFirst({ where: { id, teamId } });
}

/** 仅保留 `keys` 中显式非 undefined/null 的字段。 */
function pickDefined(src, keys) {
  const out = {};
  for (const k of keys) {
    if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
  }
  return out;
}

function tryParseJson(s, fallback) {
  if (s === undefined || s === null) return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[\s&/\\#;:_,]+/g, '-').slice(0, 60);
}

module.exports = {
  defaultBrand,
  defaultSystemSnippet,
  findOwned,
  pickDefined,
  tryParseJson,
  slugify,
};
