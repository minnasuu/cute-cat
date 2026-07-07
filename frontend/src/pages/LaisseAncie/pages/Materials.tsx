// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api";
import { Modal } from "../components/ui";

interface MaterialRow {
  id: string;
  slug: string;
  category: string;
  name: string;
  code: string;
  supplier?: string | null;
  origin?: string | null;
  colors?: string[];
  composition?: string | null;
  weight?: string | null;
  texture?: string | null;
  finish?: string | null;
  width?: string | null;
  thickness?: string | null;
  diameter?: string | null;
  size?: string | null;
  tex?: string | null;
  shape?: string | null;
  originNote?: string | null;
  care?: string[];
  uses?: string[];
  seasons?: string[];
  notes?: string | null;
  priceAmount?: number | null;
  priceCur?: string | null;
  priceUnit?: string | null;
  priceNote?: string | null;
}

const CATEGORIES = [
  { key: "面料", label: "面料" },
  { key: "毛线", label: "毛线" },
  { key: "串珠", label: "串珠" },
  { key: "工艺", label: "工艺" },
  { key: "辅材", label: "辅材" },
  { key: "品牌标志", label: "品牌标志" },
  { key: "包装", label: "包装" },
];

// Fallback seed when backend hasn't any data yet — mirrors the original materials.ts subset
const SEED: MaterialRow[] = [
  { id: "fabric-silk-001", slug: "lashed-silk-satin", category: "面料", name: "水洗真丝贡丝锦",
    code: "HK-SS-21", supplier: "Silk Workshop Hangzhou", origin: "Hangzhou · China",
    composition: "100% mulberry silk · 19 momme satin ground", weight: "19 momme", texture: "washed matte satin",
    finish: "garment-washed stone", care: ["hand-wash ≤30 °C", "no bleach", "iron reverse-side"],
    uses: ["bias-cut slip dresses", "tailored camp-collar shirting"], seasons: ["SS", "Resort"],
    priceAmount: 86, priceCur: "CNY", priceUnit: "/ metre · 135 cm", priceNote: "MOQ 100 m · lead 30 days",
    colors: ["#d8c9a3", "#a89274", "#9b6a3a", "#1f3a44"] },

  { id: "fabric-wool-001", slug: "double-face-merino", category: "面料", name: "双面美利奴法兰绒",
    code: "BC-DF-1403", supplier: "Biella Textile Co.", origin: "Biella · Italy",
    composition: "100% extra-fine ZQ Merino · 310 g/m² double-face", weight: "310 g/m²", texture: "rounded, brushed on both faces",
    finish: "double-face, ready-to-cut selvedge",
    care: ["dry-clean recommended", "steam only"], uses: ["unlined blazers", "duster coats"], seasons: ["FW", "Pre-fall"],
    priceAmount: 112, priceCur: "EUR", priceUnit: "/ metre · 150 cm",
    colors: ["#2c2a2d", "#8a8580", "#d3c4a9", "#c59289"] },

  { id: "trim-silk-lining-001", slug: "cupro-twill-lining", category: "工艺", name: "人丝斜纹里布",
    code: "BP-SL-174", supplier: "Beppetex Premium", origin: "Como · Italy",
    composition: "100% cupro · 74 g/m² twill weave", weight: "74 g/m²", texture: "slippery, low-friction",
    care: ["dry-clean"], uses: ["blazer lining", "trouser waistbags"], seasons: ["all"],
    priceAmount: 24, priceCur: "EUR", priceUnit: "/ metre · 148 cm",
    colors: ["#caa97c", "#73332e", "#0e0e0e", "#ece4d2"] },

  { id: "brand-label-001", slug: "woven-logo-label", category: "品牌标志", name: "机织领标",
    code: "OWL-ER-PVC", supplier: "Orwell & Rose Wovens", origin: "Macclesfield · UK",
    composition: "poly-silk twill · woven jacquard · 100% PVC-free", size: "28 × 45 mm",
    care: ["sewn in · dry-clean"], uses: ["interior neck label"], seasons: ["all"],
    priceAmount: 0.55, priceCur: "GBP", priceUnit: "/ piece · 28 × 45 mm",
    colors: ["#ece1c5", "#0e0e10"] },

  { id: "pkg-tissue-001", slug: "acid-etched-tissue", category: "包装", name: "酸蚀薄页纸",
    code: "C-POST-17", supplier: "Como白鹭纸业", origin: "Como · Italy",
    composition: "100% TCF woodpulp · 17 g/m² acid-etched", weight: "17 g/m²",
    care: ["n/a"], uses: ["interior wrapping", "box void-fill"], seasons: ["all"],
    priceAmount: 1.6, priceCur: "EUR", priceUnit: "/ metre · 50 cm",
    colors: ["#e7dcc1", "#c4a571", "#0e0e0e"] },

  { id: "yarn-alpaca-001", slug: "baby-alpaca-worsted", category: "毛线", name: "宝宝阿尔帕卡粗纺纱",
    code: "PE-BA-4000", supplier: "Micuzu Suri & Alpaca", origin: "Arequipa · Peru",
    composition: "100% baby alpaca · 25/2 Nm worsted-spun",
    care: ["hand-wash ≤30 °C", "dry flat"], uses: ["cabled cardigans", "ribbed beanies"], seasons: ["FW", "Midwinter"],
    priceAmount: 56, priceCur: "EUR", priceUnit: "/ 100 g ball · 400 m",
    colors: ["#d8c39c", "#a08c74", "#473b31", "#1c2c4a", "#c2483f", "#5a4638"] },
];

export default function MaterialsPage() {
  const [cat, setCat] = useState("面料");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get<MaterialRow[]>("/api/laisse-ancie/materials");
      if (!r || r.length === 0) { setRows(SEED); }
      else {
        // seed one row if collection empty attempt first backend row save; otherwise show rows
        setRows(r);
      }
    } catch {
      setRows(SEED);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const base = rows.filter((m) => m.category === cat);
    if (!q.trim()) return base;
    const needle = q.trim().toLowerCase();
    return base.filter((m) =>
      m.name.toLowerCase().includes(needle) || m.code.toLowerCase().includes(needle) ||
      (m.composition || "").toLowerCase().includes(needle) ||
      (m.uses || []).some((u) => u.toLowerCase().includes(needle)) ||
      (m.colors || []).some((c) => c.toLowerCase().includes(needle)) ||
      (m.supplier || "").toLowerCase().includes(needle));
  }, [cat, q, rows]);

  const openMat = useMemo(() => (openId ? rows.find((m) => m.id === openId) ?? null : null), [openId, rows]);
  if (loading) return <div className="p-10 text-gray-500">加载中…</div>;

  return (
    <div className="grid grid-cols-[220px_1fr] h-[calc(100vh-64px)] min-h-0">
      <aside className="border-r border-gray-200 bg-gray-50 px-4 py-5 flex flex-col overflow-auto">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">Materials</div>
        <div className="flex flex-col gap-1 flex-1">
          {CATEGORIES.map((c) => {
            const count = rows.filter((m) => m.category === c.key).length;
            const active = cat === c.key;
            return (
              <button key={c.key} onClick={() => setCat(c.key)}
                className={`text-left flex items-baseline justify-between rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-blue-600/10 text-gray-800 border border-blue-200" : "text-gray-600 hover:bg-gray-100"}`}>
                <span className="text-[13px] font-medium">{c.label}</span>
                <span className="text-[10px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="overflow-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-[34px] font-semibold text-gray-800 tracking-tight">{cat}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{visible.length} {visible.length === 1 ? "item" : "items"}</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按成分、用途、颜色搜索…"
            className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </header>

        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">没有符合搜索的物料</div>
        ) : (
          <div className="p-6 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {visible.map((m) => (
              <button key={m.id} onClick={() => setOpenId(m.id)} className="text-left">
                <MaterialCard mat={m} />
              </button>
            ))}
          </div>
        )}
      </main>

      <MaterialModal mat={openMat} onClose={() => setOpenId(null)} />
    </div>
  );
}

function MaterialCard({ mat }: { mat: MaterialRow }) {
  const colors = mat.colors ?? [];
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
      <div className="relative h-44 overflow-hidden">
        <SwatchStrip colors={colors} />
        <figcaption className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
          <div className="text-white text-sm font-medium leading-tight">{mat.name}</div>
          <div className="text-white/70 text-[10px] font-mono mt-0.5">{mat.code} · {mat.category}</div>
        </figcaption>
      </div>
      <figcaption className="px-3 py-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-gray-600 truncate">{(mat.composition || "").split(" · ")[0]}</div>
          <div className="mt-2 flex items-end gap-1.5">
            {colors[0] && <SwatchDot hex={colors[0]} />}
            {colors.length > 1 && <span className="text-[10px] text-gray-500">+{colors.length - 1}色</span>}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

function SwatchStrip({ colors }: { colors: string[] }) {
  if (!colors.length) return <div className="bg-gray-100 w-full h-full" />;
  const slice = colors.slice(0, 6);
  return (
    <div className="absolute inset-0 flex">
      {slice.map((c, i) => (
        <span key={i} className="flex-1 h-full relative" style={{ background: c.includes(",") ? `linear-gradient(135deg, ${c})` : c }}>
          {i < slice.length - 1 && <span className="absolute right-0 inset-y-0 w-px bg-white/35" />}
        </span>
      ))}
    </div>
  );
}

function SwatchDot({ hex }: { hex: string }) {
  return <span className="inline-block w-3 h-3 rounded-full border border-gray-200/60" style={{ background: hex }} aria-hidden />;
}

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", EUR: "€", USD: "$", GBP: "£" };

function MaterialModal({ mat, onClose }: { mat: MaterialRow | null; onClose: () => void }) {
  if (!mat) return null;
  const price = mat.priceAmount != null ? { amount: mat.priceAmount, currency: mat.priceCur || "CNY", unit: mat.priceUnit || "", note: mat.priceNote } : null;
  const colors: string[] = mat.colors ?? [];
  return (
    <Modal open onClose={onClose} title={mat.name} maxWidth="max-w-5xl">
      <div className="grid grid-cols-[260px_1fr] gap-7 flex-1 min-h-0 h-[60vh]">
        <aside className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 overflow-y-auto max-h-full">
          <ul className="divide-y divide-gray-200">
            {colors.map((c) => (
              <li key={c} className="flex items-center gap-3 p-3">
                <span className="w-14 h-14 rounded-lg border border-gray-200 shrink-0" style={{ background: c.includes(",") ? `linear-gradient(135deg, ${c})` : c }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-gray-800 font-medium truncate">{c}</div>
                  <div className="text-[10px] font-mono text-gray-500 mt-0.5">{c}</div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <article className="overflow-auto max-h-full text-xs space-y-5 pr-1">
          {price && (
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl text-blue-600 font-semibold leading-none">
                  {CURRENCY_SYMBOL[price.currency] ?? price.currency}{price.amount % 1 === 0 ? price.amount : price.amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-gray-500">{price.unit}</span>
              </div>
              {price.note && <div className="text-[10px] text-gray-500 text-right max-w-[55%]">{price.note}</div>}
            </div>
          )}
          {(mat.notes || mat.originNote) && (
            <div className="bg-gray-50 rounded-2xl p-4 text-gray-600 leading-relaxed whitespace-pre-line">{mat.notes ?? mat.originNote}</div>
          )}
          {mat.code && <Section label="代码"><span className="font-mono">{mat.code}</span></Section>}
          {mat.composition && <Section label="成分"><span>{mat.composition}</span></Section>}
          {mat.weight && <Section label="克重"><span className="font-mono">{mat.weight}</span></Section>}
          {mat.texture && <Section label="手感"><span>{mat.texture}</span></Section>}
          {mat.finish && <Section label="工艺"><span>{mat.finish}</span></Section>}
          {mat.origin && <Section label="产地"><span className="font-mono">{mat.origin}</span></Section>}
          {mat.supplier && <Section label="供应商"><span className="font-mono">{mat.supplier}</span></Section>}
          {mat.uses && mat.uses.length > 0 && (
            <Section label="用途"><ul className="list-disc pl-4 space-y-0.5">{mat.uses.map((u) => <li key={u}>{u}</li>)}</ul></Section>
          )}
          {mat.seasons && mat.seasons.length > 0 && (
            <Section label="季节"><div className="flex flex-wrap gap-1.5">{mat.seasons.map((s) => <span key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{s}</span>)}</div></Section>
          )}
          {mat.care && mat.care.length > 0 && (
            <Section label="洗护"><ul className="list-disc pl-4 space-y-0.5">{mat.care.map((c) => <li key={c}>{c}</li>)}</ul></Section>
          )}
        </article>
      </div>
    </Modal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-[12px] text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}
