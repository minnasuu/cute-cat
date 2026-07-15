// @ts-nocheck
/**
 * Lookbook 图片角色(slot)定义与辅助函数。
 *
 * 三种角色(统一进 images[].slot):
 *   main    — 主图(至多一张,封面/缩略图首选)
 *   lineart — 线稿(灵感扩散专属,不参与主图互换)
 *   其余 slot(final/material-combo/editorial/flat/render/...) — 效果图
 *
 * 主图互换(前端算好整张 images[] 后 PATCH 提交):
 *   降级 main→render   : 目标 slot 改 "render",imageUrl 置 null
 *   提升 render→main   : 目标 slot 改 "main",已有主图那条改 "render"
 */

export const MAIN_SLOT = "main";
export const LINEART_SLOT = "lineart";
export const RENDER_SLOT = "render";

/** 主图与线稿之外的 slot 都视为效果图(含历史细分 slot:final/material-combo/editorial/flat 等) */
export function slotRole(slot: string | undefined | null): "main" | "lineart" | "render" {
  if (slot === MAIN_SLOT) return "main";
  if (slot === LINEART_SLOT) return "lineart";
  return "render";
}

/** 取当前主图条目;undefined = 当前无主图 */
export function findMainImage<T extends { slot?: string }>(images: T[] | undefined | null): T | undefined {
  return Array.isArray(images) ? images.find((im) => im.slot === MAIN_SLOT) : undefined;
}

/**
 * 主图互换:返回新的 images 数组(不修改入参),供 PATCH /products/:id 整体提交。
 *   targetIndex        : 要变更的那张图的索引
 *   action: "promote"   : 把该效果图提升为主图(已有主图则降级为 render)
 *           "demote"    : 把主图降级为效果图,主图留空
 * 返回 { images, imageUrl } 一并提交(imageUrl 为派生兼容字段)。
 */
export function swapMainImage<T extends { slot?: string; url?: string }>(
  images: T[] | undefined | null,
  targetIndex: number,
  action: "promote" | "demote",
): { images: T[]; imageUrl: string | null } {
  const imgs = Array.isArray(images) ? images.map((im) => ({ ...im })) : [];
  const target = imgs[targetIndex];
  if (!target) return { images: imgs, imageUrl: findMainImage(imgs)?.url ?? null };

  if (action === "demote") {
    imgs[targetIndex] = { ...target, slot: RENDER_SLOT };
    return { images: imgs, imageUrl: null };
  }
  // promote
  for (let i = 0; i < imgs.length; i++) {
    if (imgs[i].slot === MAIN_SLOT) imgs[i] = { ...imgs[i], slot: RENDER_SLOT };
  }
  imgs[targetIndex] = { ...target, slot: MAIN_SLOT };
  return { images: imgs, imageUrl: target.url ?? null };
}
