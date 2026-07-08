// @ts-nocheck
import { useNavigate } from "react-router-dom";
import { MODE_HINT, MODE_LABEL, type DesignMode } from "../types/design";
import { Card } from "../components/ui";

const ICONS: Record<DesignMode, string> = {
  illustration: "✎", single: "✦", collection: "✸", occasion: "✺",
};

const SUMMARIES: Record<DesignMode, string> = {
  illustration: "原创插画 / 印花 / 主视觉作品 — 输出英文 prompt 可用于 Midjourney / SD。可同步存入视觉资产库。",
  single: "一款具体产品，专注 silhouette · colorway · fabric 的 AI chat 创作流。",
  collection: "一个季节方向下的多品协同：系列主题、联合色板、Lookbook 输出。",
  occasion: "重要节日（春节、情人节、圣诞…）驱动的主题系列 — 节日、主题、色系、走秀节奏对齐。",
};

const CTAS: Record<DesignMode, string> = {
  illustration: "开始插画创作",
  single: "开始单品创作",
  collection: "开始系列创作",
  occasion: "开始专题系列",
};

export default function DesignLandingPage() {
  const navigate = useNavigate();
  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto">
      <header className="mb-10">
        <h1 className="text-5xl font-semibold text-primary-600 tracking-tight">Create</h1>
        <p className="text-gray-500 mt-2 max-w-xl">
          选择一种创作模式进入 AI Chat 工作台。三者最终都产出产品 — 产品进入 Lookbook。
        </p>
      </header>
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {(["illustration", "single", "collection", "occasion"] as DesignMode[]).map((m) => (
          <button key={m} onClick={() => void navigate(`/laisse-ancie/design/${m}`)} className="text-left">
            <Card interactive className="h-full flex flex-col gap-3 min-h-[220px]">
              <div className="text-4xl text-primary-600 leading-none">{ICONS[m]}</div>
              <div>
                <h2 className="text-[22px] font-medium text-gray-900">{MODE_LABEL[m]}</h2>
                <p className="text-[12px] text-gray-500 mt-1">{MODE_HINT[m]}</p>
              </div>
              <p className="text-[13px] text-gray-600 flex-1">{SUMMARIES[m]}</p>
              <div className="text-[13px] font-medium text-primary-600 mt-1">{CTAS[m]} →</div>
            </Card>
          </button>
        ))}
      </section>
    </div>
  );
}
