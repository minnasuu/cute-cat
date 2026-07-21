/**
 * combo-logic 单测 —— 零依赖、不启动服务,直接命中「仅插画 × 款式」分支。
 *
 * 为什么单独测 combo-logic 而不是直接测 POST /material-combo:
 *   POST handler 依赖 multer + Prisma + lib/storage(sharp) + lib/gen-image(Maizi/Ark),
 *   本地开发环境没装 sharp、没 DATABASE_URL,require 链直接 MODULE_NOT_FOUND。
 *   combo-logic 是纯函数,是这次修复里唯一真正承载「fabrics 为空时叉乘退化」语义的地方,
 *   所以这里做单测,route 文件里只是把「用 require 引用本文件」改成「本地同名实现」。
 *
 * 运行: node --test backend/test/combo-logic.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComboPlan,
  buildMaterialComboPrompt,
  buildColorMixPrompt,
  finalStyleBits,
} from '../lib/combo-logic.js';

// ─── buildComboPlan ───────────────────────────────────────────

test('buildComboPlan: 叉乘 2 面料 × 3 款式 = 6 格', () => {
  const { total, items, onlyIllustration } = buildComboPlan({
    mode: 'cross', fabricsLength: 2, stylesLength: 3, illustrationsLength: 0,
  });
  assert.equal(total, 6);
  assert.equal(onlyIllustration, false);
  assert.equal(items.length, 6);
  // 顺序:先遍历款式(si),再遍历面料(fi) → 与 route 内原 for 循环一致
  assert.deepEqual(items.map((c) => [c.fi, c.si]), [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
  ]);
});

test('buildComboPlan: 仅插画 × 2 款式 = 2 格(叉乘退化,fi=0 占位)', () => {
  const { total, items, onlyIllustration } = buildComboPlan({
    mode: 'cross', fabricsLength: 0, stylesLength: 2, illustrationsLength: 1,
  });
  assert.equal(total, 2);
  assert.equal(onlyIllustration, true);
  assert.deepEqual(items, [{ fi: 0, si: 0 }, { fi: 0, si: 1 }]);
});

test('buildComboPlan: 仅插画 × 1 款式 = 1 格', () => {
  const { total, items, onlyIllustration } = buildComboPlan({
    mode: 'cross', fabricsLength: 0, stylesLength: 1, illustrationsLength: 1,
  });
  assert.equal(total, 1);
  assert.equal(onlyIllustration, true);
  assert.deepEqual(items, [{ fi: 0, si: 0 }]);
});

test('buildComboPlan: 无面料且无插画 → total=0(由 handler 拒绝)', () => {
  const { total, items, onlyIllustration } = buildComboPlan({
    mode: 'cross', fabricsLength: 0, stylesLength: 3, illustrationsLength: 0,
  });
  assert.equal(total, 0);
  assert.equal(items.length, 0);
  assert.equal(onlyIllustration, false);
});

test('buildComboPlan: 拼色模式固定 1 格(无视 fabricsLength)', () => {
  const { total, items, onlyIllustration } = buildComboPlan({
    mode: 'color-mix', fabricsLength: 3, stylesLength: 1, illustrationsLength: 0,
  });
  assert.equal(total, 1);
  assert.deepEqual(items, [{ fi: 0, si: 0 }]);
  assert.equal(onlyIllustration, false);
});

// ─── buildMaterialComboPrompt ─────────────────────────────────

test('buildMaterialComboPrompt: 仅插画变种 → 图2=插画,不提图3', () => {
  const prompt = buildMaterialComboPrompt({
    name: '春日雏菊连衣裙',
    description: '清爽夏日风格',
    fabric: undefined,
    style: { category: 'fashion product' },
    illustration: { url: 'https://example.com/ill.jpg' },
  });
  // 图序号必须与 referenceImages:[style.url, illustration.url] 一致
  assert.match(prompt, /图2的插画图案/);
  assert.match(prompt, /图1是服装款式图/);
  // 绝对不能再提「图3」,否则图序错位
  assert.doesNotMatch(prompt, /图3/);
  // 描述信息要带进 prompt
  assert.match(prompt, /清爽夏日风格/);
  // 白底产品图硬约束仍在
  assert.match(prompt, /pure white backdrop/);
});

test('buildMaterialComboPrompt: 仅插画变种 + 空描述 → 默认文案', () => {
  const prompt = buildMaterialComboPrompt({
    name: 'T',
    description: '   ',
    fabric: undefined,
    style: { category: 'fashion product' },
    illustration: { url: 'https://example.com/ill.jpg' },
  });
  assert.match(prompt, /标志性图案元素/);
  assert.doesNotMatch(prompt, /图3/);
});

test('buildMaterialComboPrompt: 有面料 + 插画 → 图2=面料花样,图3=插画', () => {
  const prompt = buildMaterialComboPrompt({
    name: 'T',
    description: '清爽',
    fabric: { url: 'https://example.com/fabric.jpg', text: '' },
    style: { category: 'fashion product' },
    illustration: { url: 'https://example.com/ill.jpg' },
  });
  assert.match(prompt, /将图1换成图2的面料花样/);
  assert.match(prompt, /图3的插画图案/);
});

test('buildMaterialComboPrompt: 面料文本描述(无图) → 用文字代替图2参考', () => {
  const prompt = buildMaterialComboPrompt({
    name: 'T',
    description: '清爽',
    fabric: { text: '纯棉 180g' },
    style: { category: 'fashion product' },
    illustration: { url: 'https://example.com/ill.jpg' },
  });
  assert.match(prompt, /面料\(文字描述\): 纯棉 180g/);
  assert.match(prompt, /图3的插画图案/);
});

test('buildMaterialComboPrompt: 有面料 + 无插画 → 不提图3', () => {
  const prompt = buildMaterialComboPrompt({
    name: 'T',
    description: '',
    fabric: { url: 'https://example.com/fabric.jpg' },
    style: { category: 'fashion product' },
    illustration: { url: '' },
  });
  assert.match(prompt, /将图1换成图2的面料花样/);
  assert.doesNotMatch(prompt, /图3/);
});

// ─── buildColorMixPrompt ──────────────────────────────────────

test('buildColorMixPrompt: 3 面料拼色 → 图2至图4', () => {
  const prompt = buildColorMixPrompt({
    name: '拼色外套',
    description: '春夏',
    fabrics: [{ url: 'f1' }, { url: 'f2' }, { url: 'f3' }],
    style: { category: 'fashion product' },
    illustration: { url: '' },
  });
  assert.match(prompt, /图2至图4的面料花样/);
  assert.match(prompt, /patchwork aesthetic/);
});

test('buildColorMixPrompt: 1 面料拼色 → 图2(单图)', () => {
  const prompt = buildColorMixPrompt({
    name: '拼色外套',
    description: '',
    fabrics: [{ url: 'f1' }],
    style: { category: 'fashion product' },
    illustration: { url: '' },
  });
  assert.match(prompt, /图2的面料花样/);
  assert.doesNotMatch(prompt, /图2至图/);
});

test('buildColorMixPrompt: 拼色 + 插画 → 插画作为最后图', () => {
  const prompt = buildColorMixPrompt({
    name: '拼色外套',
    description: '',
    fabrics: [{ url: 'f1' }, { url: 'f2' }],
    style: { category: 'fashion product' },
    illustration: { url: 'https://example.com/ill.jpg' },
  });
  assert.match(prompt, /图2至图3的面料花样/);
  assert.match(prompt, /插画图案以印花或刺绣工艺/);
});

// ─── finalStyleBits ───────────────────────────────────────────

test('finalStyleBits: 共用白底产品图硬约束', () => {
  const bits = finalStyleBits();
  assert.match(bits, /pure white backdrop/);
  assert.match(bits, /NO model/);
  assert.match(bits, /NO mannequin/);
});
