'use strict';

/**
 * combo-logic.js —— material-combo / style-mutate 的纯函数派生(无副作用、零 async、零依赖)。
 *
 * 原本散落在 routes/design-generator.js 内部,为了方便单测,这里集中实现。
 * route 文件里同名函数保持本地副本(避免 require 链加载 lib/storage → sharp),本模块做测试真相源;
 * 任何修改必须两边同步。
 *
 *  ★ 同步须知(给未来的 contributor) ——
 *   buildComboPlan      ← routes/design-generator.js 里同名
 *   buildMaterialComboPrompt ← routes/design-generator.js 里同名
 *   buildColorMixPrompt      ← routes/design-generator.js 里同名
 *   finalStyleBits           ← routes/design-generator.js 里同名
 *   以上四函数签名/行为本模块是权威;route 文件里只是把「用 require 引用本文件」改成「本地同名实现」。
 *
 * 这个模块只导出四个纯函数,严禁在里面 require lib/storage / lib/gen-image / @prisma/client。
 */

/**
 * 由 fabricsMeta/illustrationsMeta 数组 + mode 推导出要生成的张数与该有的格子列表(items)。
 *
 * 覆盖三种场景:
 *   · cross + 面料             → m×n 格,fabrics.length > 0
 *   · cross + 仅插画(无面料)   → 1×n 格,fabrics.length === 0 且 illustrations.length > 0(虚拟面料占位)
 *   · color-mix(拼色)          → 1 格(默认)
 *
 * 本函数不包含任何校验逻辑,仅做数学推导;校验在 POST /material-combo handler 里完成。
 *
 * @param {{mode:string,fabricsLength:number,stylesLength:number,illustrationsLength:number}} p
 * @returns {{total:number,items:Array<{fi:number,si:number}>,onlyIllustration:boolean}}
 */
function buildComboPlan({ mode, fabricsLength, stylesLength, illustrationsLength }) {
  if (mode === 'color-mix') {
    return { total: 1, items: [{ fi: 0, si: 0 }], onlyIllustration: false };
  }
  if (fabricsLength > 0) {
    const items = [];
    for (let fi = 0; fi < fabricsLength; fi++) {
      for (let si = 0; si < stylesLength; si++) items.push({ fi, si });
    }
    return { total: items.length, items, onlyIllustration: false };
  }
  if (illustrationsLength > 0) {
    // 仅插画 × n 款式 → n 格(叉乘退化)。fi=0 只是占位,runBatch 内 fabrics[0] 为 undefined,
    // 所以该模式下 prompt / 参考图会通过「fabric===undefined → 仅插画」分支处理。
    const items = [];
    for (let si = 0; si < stylesLength; si++) items.push({ fi: 0, si });
    return { total: items.length, items, onlyIllustration: true };
  }
  return { total: 0, items: [], onlyIllustration: false };
}

/** 白底产品图硬约束(共用) */
function finalStyleBits() {
  return [
    'Clean studio lighting, sharp detail, e-commerce catalog style.',
    'NO model, NO mannequin, NO background clutter, pure white backdrop.',
    'Flat-laid or hung neatly, full product clearly visible, front-facing composition.',
  ].join(' ');
}

/**
 * 叉乘模式 prompt:单面料替换到单款式(原逻辑);面料为 undefined 时走「仅插画 × 款式」变种。
 *
 * 调用方必须根据 fabric 参数保证 referenceImages 顺序与这里图序号一致:
 *   · fabric 有值           referenceImages=[style.url, fabric.url?, illustration.url?]
 *   · fabric===undefined    referenceImages=[style.url, illustration.url?]  ← 仅插画变种
 */
function buildMaterialComboPrompt({ name, description, fabric, style, illustration }) {
  const category = style?.category || 'fashion product';
  const bits = [
    `Product photography of a single ${category} called "${name}", on pure white background.`,
  ];
  const desc = description.trim();
  if (fabric === undefined) {
    // 仅插画变种:插画取代面料作为图2(印花/刺绣图案源)注入款式。
    // ⚠️ 此时图序号是 [图1=款式, 图2=插画],绝对不能再提「图3」,否则图序错位、模型认知会乱。
    bits.push(desc
      ? `将图2的插画图案以印花或刺绣工艺应用在服装上,${desc}。图1是服装款式图。`
      : `将图2的插画图案以印花或刺绣工艺应用在服装上,作为服装的标志性图案元素。图1是服装款式图。`);
  } else {
    const fabricDesc = fabric?.text
      ? `面料(文字描述): ${fabric.text}。${desc}`
      : desc;
    bits.push(
      fabricDesc ? `将图1换成图2的面料花样,${fabricDesc}。` : `将图1换成图2的面料花样。`,
    );
    // 插画(可选):图3 只在上游有面料时才出现。
    if (illustration?.url) {
      bits.push('将图3的插画图案以印花或刺绣工艺应用在服装上,作为服装的标志性图案元素。');
    }
  }
  bits.push(finalStyleBits());
  return bits.join('\n');
}

/**
 * 拼色(color-mix)模式 prompt:多面料 × 1 款式 → 1 张拼色图。
 * 图序号:[图1=款式, 图2..图N=面料(按顺序), 图最后=插画(可选)]。
 */
function buildColorMixPrompt({ name, description, fabrics, style, illustration }) {
  const category = style?.category || 'fashion product';
  const fabricsArr = Array.isArray(fabrics) ? fabrics : [];
  const fabricCount = fabricsArr.length;

  const bits = [
    `Product photography of a single ${category} called "${name}", on pure white background.`,
  ];
  const fabricRange = fabricCount > 1 ? `图2至图${fabricCount + 1}` : '图2';
  const desc = description.trim();
  const core = desc
    ? `将图1（款式）用${fabricRange}的面料花样拼接/拼色制作,${desc}。`
    : `将图1（款式）用${fabricRange}的面料花样拼接/拼色制作。`;
  bits.push(core);
  bits.push(
    'Each fabric should appear as a clearly distinct color-blocked panel on the garment with a patchwork aesthetic; seams between different fabrics may be visible.',
  );
  if (illustration?.url) {
    bits.push('将插画图案以印花或刺绣工艺应用在服装上,作为服装的标志性图案元素。');
  }
  bits.push(finalStyleBits());
  return bits.join('\n');
}

module.exports = {
  buildComboPlan,
  buildMaterialComboPrompt,
  buildColorMixPrompt,
  finalStyleBits,
};
