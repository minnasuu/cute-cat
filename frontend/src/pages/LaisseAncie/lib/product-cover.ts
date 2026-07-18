/**
 * pickProductCover —— 选产品封面图。
 *
 * 主图 > 效果图(优先 editorial/flat/material-combo 等 render 类,跳过线稿) > 第一张 > null。
 * 合并 images[] + 遗留 imageUrl(兼容未迁移数据)。
 *
 * 从 Lookbook.tsx 抽出,供 Lookbook / 穿搭效果等复用,避免模块间的静态依赖。
 */
import { MAIN_SLOT, RENDER_SLOT, slotRole } from "./imageRole";

interface CoverImage {
  slot?: string;
  label?: string;
  url?: string | null;
}

export function pickProductCover(product: { images?: CoverImage[] | null; imageUrl?: string | null }): string | null {
  const imgs = (product?.images ?? []).filter((im) => im?.url);
  // 尚无主图但遗留兜底 imageUrl → 视为主图,保证旧数据也有封面
  const legacyMain = !imgs.some((im) => im.slot === MAIN_SLOT) && product.imageUrl
    ? [{ slot: MAIN_SLOT, label: "主图", url: product.imageUrl }, ...imgs]
    : imgs;
  const main = legacyMain.find((im) => im.slot === MAIN_SLOT);
  if (main?.url) return main.url;
  // 效果图中按优先级取一张(render 类 slot)
  const render = legacyMain
    .filter((im) => slotRole(im.slot) === RENDER_SLOT)
    .sort((a, b) => {
      const order = ["editorial", "flat", "single", "material-combo", "style-mutate", "outfit-styling", "collection", "illustration", "hero-editorial", "detail", "final"];
      return order.indexOf(a.slot || "") - order.indexOf(b.slot || "");
    })[0];
  if (render?.url) return render.url;
  return legacyMain[0]?.url ?? null;
}
