// @ts-nocheck
export type VisualAssetKind =
  | "print" | "illustration" | "keyvisual" | "template" | "lookbook" | "packaging";

export const VISUAL_KIND_META: Record<
  VisualAssetKind,
  { labelZh: string; labelEn: string; icon: string; hint: string }
> = {
  print:        { labelZh: "印花",       labelEn: "Prints",       icon: "❀", hint: "独家花纹 · 面料素材" },
  illustration: { labelZh: "插画",       labelEn: "Illustration", icon: "✎", hint: "插画 / Lookbook 手绘" },
  keyvisual:    { labelZh: "主视觉",     labelEn: "Key Visuals",  icon: "◆", hint: "Campaign Hero 视觉" },
  template:     { labelZh: "模板",       labelEn: "Templates",    icon: "▦", hint: "名片 / 卡片 / 礼盒外盒" },
  lookbook:     { labelZh: "Lookbook视觉", labelEn: "Lookbook",   icon: "◫", hint: "Lookbook / 拍摄素材" },
  packaging:    { labelZh: "包装视觉",   labelEn: "Packaging",    icon: "◐", hint: "辅料 / 洗标 / 包装视觉" },
};

export interface VisualAsset {
  id: string;
  kind: VisualAssetKind;
  title: string;
  description?: string;
  src: string;
  thumb?: string;
  tags: string[];
  seasons?: string[];
  pinned?: boolean;
  createdAt: string;
}
