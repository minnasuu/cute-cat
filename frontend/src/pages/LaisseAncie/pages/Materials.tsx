// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../lib/api";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { Modal } from "../components/ui";
import type { MaterialRow } from "../store/resource";

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
  {
    id: "fabric-silk-001", slug: "lashed-silk-satin", category: "面料", name: "水洗真丝贡丝锦",
    code: "HK-SS-21", supplier: "Silk Workshop Hangzhou", origin: "Hangzhou · China",
    composition: "100% mulberry silk · 19 momme satin ground", weight: "19 momme", texture: "washed matte satin",
    finish: "garment-washed stone", care: ["hand-wash ≤30 °C", "no bleach", "iron reverse-side"],
    uses: ["bias-cut slip dresses", "tailored camp-collar shirting"], seasons: ["SS", "Resort"],
    priceAmount: 86, priceCur: "CNY", priceUnit: "/ metre · 135 cm", priceNote: "MOQ 100 m · lead 30 days",
    colors: ["#d8c9a3", "#a89274", "#9b6a3a", "#1f3a44"]
  },

  {
    id: "fabric-wool-001", slug: "double-face-merino", category: "面料", name: "双面美利奴法兰绒",
    code: "BC-DF-1403", supplier: "Biella Textile Co.", origin: "Biella · Italy",
    composition: "100% extra-fine ZQ Merino · 310 g/m² double-face", weight: "310 g/m²", texture: "rounded, brushed on both faces",
    finish: "double-face, ready-to-cut selvedge",
    care: ["dry-clean recommended", "steam only"], uses: ["unlined blazers", "duster coats"], seasons: ["FW", "Pre-fall"],
    priceAmount: 112, priceCur: "EUR", priceUnit: "/ metre · 150 cm",
    colors: ["#2c2a2d", "#8a8580", "#d3c4a9", "#c59289"]
  },

  {
    id: "trim-silk-lining-001", slug: "cupro-twill-lining", category: "工艺", name: "人丝斜纹里布",
    code: "BP-SL-174", supplier: "Beppetex Premium", origin: "Como · Italy",
    composition: "100% cupro · 74 g/m² twill weave", weight: "74 g/m²", texture: "slippery, low-friction",
    care: ["dry-clean"], uses: ["blazer lining", "trouser waistbags"], seasons: ["all"],
    priceAmount: 24, priceCur: "EUR", priceUnit: "/ metre · 148 cm",
    colors: ["#caa97c", "#73332e", "#0e0e0e", "#ece4d2"]
  },

  {
    id: "brand-label-001", slug: "woven-logo-label", category: "品牌标志", name: "机织领标",
    code: "OWL-ER-PVC", supplier: "Orwell & Rose Wovens", origin: "Macclesfield · UK",
    composition: "poly-silk twill · woven jacquard · 100% PVC-free", size: "28 × 45 mm",
    care: ["sewn in · dry-clean"], uses: ["interior neck label"], seasons: ["all"],
    priceAmount: 0.55, priceCur: "GBP", priceUnit: "/ piece · 28 × 45 mm",
    colors: ["#ece1c5", "#0e0e10"]
  },

  {
    id: "pkg-tissue-001", slug: "acid-etched-tissue", category: "包装", name: "酸蚀薄页纸",
    code: "C-POST-17", supplier: "Como白鹭纸业", origin: "Como · Italy",
    composition: "100% TCF woodpulp · 17 g/m² acid-etched", weight: "17 g/m²",
    care: ["n/a"], uses: ["interior wrapping", "box void-fill"], seasons: ["all"],
    priceAmount: 1.6, priceCur: "EUR", priceUnit: "/ metre · 50 cm",
    colors: ["#e7dcc1", "#c4a571", "#0e0e0e"]
  },

  {
    id: "yarn-alpaca-001", slug: "baby-alpaca-worsted", category: "毛线", name: "宝宝阿尔帕卡粗纺纱",
    code: "PE-BA-4000", supplier: "Micuzu Suri & Alpaca", origin: "Arequipa · Peru",
    composition: "100% baby alpaca · 25/2 Nm worsted-spun",
    care: ["hand-wash ≤30 °C", "dry flat"], uses: ["cabled cardigans", "ribbed beanies"], seasons: ["FW", "Midwinter"],
    priceAmount: 56, priceCur: "EUR", priceUnit: "/ 100 g ball · 400 m",
    colors: ["#d8c39c", "#a08c74", "#473b31", "#1c2c4a", "#c2483f"]
  },
];

export default function MaterialsPage() {
  const { teamId } = useCurrentTeam();
  const [cat, setCat] = useState("面料");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  // editor: null = 关闭; { mode: 'view'|'edit'|'create', mat? }
  const [editor, setEditor] = useState<null | { mode: "view" | "edit" | "create"; mat?: MaterialRow }>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const r = await teamApi(tid).listMaterials();
      if (!r || r.length === 0) { setRows(SEED); }
      else {
        setRows(r);
      }
    } catch {
      setRows(SEED);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (teamId) void refresh(teamId); }, [refresh, teamId]);

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

  // 编辑器保存：create / edit 共用。values 含可选 imageFile（新图优先于 image 字符串）
  const handleSave = useCallback(async (values: Partial<MaterialRow> & { imageFile?: File | null }) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    const { imageFile, ...data } = values;
    const payload: any = { ...data };
    // 移除空字符串，避免把后端字段误写成 ""
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }
    let id = payload.id as string | undefined;
    if (id) {
      await api.updateMaterial(id, payload);
    } else {
      const created = await api.createMaterial(payload);
      id = created.id;
    }
    // 上传新图（需要先有 id）
    if (id && imageFile) {
      const fd = new FormData();
      fd.append("file", imageFile);
      const { url } = await api.uploadMaterialImage(id, fd);
      await api.updateMaterial(id, { image: url });
    }
    setEditor(null);
    await refresh(teamId);
  }, [teamId, refresh]);

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
                className={`text-left flex items-baseline justify-between rounded-xl px-3 py-2.5 transition-colors ${active ? "bg-primary-50 text-gray-800 border border-primary-200" : "text-gray-600 hover:bg-gray-100"}`}>
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
          <div className="flex items-center gap-3">
            <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按成分、用途、颜色搜索…"
              className="w-72 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
            <button onClick={() => setEditor({ mode: "create" })}
              className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-xl font-medium transition-colors">
              + 新增材料
            </button>
          </div>
        </header>

        {visible.length === 0 ? (
          <div className="py-16 text-center text-gray-500 text-sm">没有符合搜索的物料</div>
        ) : (
          <div className="p-6 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {visible.map((m) => (
              <button key={m.id} onClick={() => setEditor({ mode: "view", mat: m })} className="text-left">
                <MaterialCard mat={m} />
              </button>
            ))}
          </div>
        )}
      </main>

      <MaterialModal
        editor={editor}
        onClose={() => setEditor(null)}
        onSwitchEdit={() => setEditor((e) => e ? { ...e, mode: "edit" } : e)}
        onSave={handleSave}
      />
    </div>
  );
}

function MaterialCard({ mat }: { mat: MaterialRow }) {
  const colors = mat.colors ?? [];
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
      <div className="relative h-44 overflow-hidden">
        {mat.image ? (
          <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
        ) : (
          <SwatchStrip colors={colors} />
        )}
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

export function SwatchStrip({ colors }: { colors: string[] }) {
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

/** 三态弹窗：view(只读详情) / edit(编辑) / create(新增) */
function MaterialModal({ editor, onClose, onSwitchEdit, onSave }: {
  editor: null | { mode: "view" | "edit" | "create"; mat?: MaterialRow };
  onClose: () => void;
  onSwitchEdit: () => void;
  onSave: (values: Partial<MaterialRow> & { imageFile?: File | null }) => Promise<void>;
}) {
  if (!editor) return null;
  const { mode, mat } = editor;
  const isEditing = mode === "edit" || mode === "create";
  const title = mode === "create" ? "新增材料" : (mode === "edit" ? "编辑材料" : (mat?.name ?? "材料"));

  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-5xl">
      {!isEditing ? (
        <MaterialView mat={mat!} onEdit={onSwitchEdit} />
      ) : (
        <MaterialForm key={mat?.id ?? "new"} initial={mat ?? null} onCancel={onClose} onSave={onSave} />
      )}
    </Modal>
  );
}

/** 只读详情 */
function MaterialView({ mat, onEdit }: { mat: MaterialRow; onEdit: () => void }) {
  const price = mat.priceAmount != null ? { amount: mat.priceAmount, currency: mat.priceCur || "CNY", unit: mat.priceUnit || "", note: mat.priceNote } : null;
  const colors: string[] = mat.colors ?? [];
  return (
    <div className="grid grid-cols-[260px_1fr] gap-7 flex-1 min-h-0 h-[60vh]">
      <aside className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 overflow-y-auto max-h-full">
        {mat.image ? (
          <div className="aspect-square overflow-hidden border-b border-gray-200">
            <img src={mat.image} alt={mat.name} className="w-full h-full object-cover" />
          </div>
        ) : null}
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
          {!colors.length && <li className="p-4 text-[12px] text-gray-400">暂无配色</li>}
        </ul>
      </aside>

      <article className="overflow-auto max-h-full text-xs space-y-5 pr-1">
        <div className="flex items-center justify-between">
          {price ? (
            <div className="flex items-baseline justify-between gap-4 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl text-primary-600 font-semibold leading-none">
                  {CURRENCY_SYMBOL[price.currency] ?? price.currency}{price.amount % 1 === 0 ? price.amount : price.amount.toFixed(2)}
                </span>
                <span className="text-[11px] text-gray-500">{price.unit}</span>
              </div>
              {price.note && <div className="text-[10px] text-gray-500 text-right max-w-[55%]">{price.note}</div>}
            </div>
          ) : null}
          <button onClick={onEdit} className="shrink-0 ml-4 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
            编辑
          </button>
        </div>
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
  );
}

/** 编辑 / 新增 表单 */
function MaterialForm({ initial, onCancel, onSave }: {
  initial: MaterialRow | null;
  onCancel: () => void;
  onSave: (values: Partial<MaterialRow> & { imageFile?: File | null }) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [category, setCategory] = useState(initial?.category ?? "面料");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [composition, setComposition] = useState(initial?.composition ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? "");
  const [texture, setTexture] = useState(initial?.texture ?? "");
  const [finish, setFinish] = useState(initial?.finish ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [colors, setColors] = useState<string[]>(initial?.colors ?? ["#cccccc"]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [priceAmount, setPriceAmount] = useState<string>(initial?.priceAmount != null ? String(initial.priceAmount) : "");
  const [priceCur, setPriceCur] = useState(initial?.priceCur ?? "CNY");
  const [priceUnit, setPriceUnit] = useState(initial?.priceUnit ?? "");
  const [uses, setUses] = useState<string>((initial?.uses ?? []).join("\n"));
  const [care, setCare] = useState<string>((initial?.care ?? []).join("\n"));
  const [seasons, setSeasons] = useState<string>((initial?.seasons ?? []).join("\n"));

  const canAddColor = colors.length < 5;
  const canRemoveColor = colors.length > 1;

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        ...(initial?.id ? { id: initial.id } : {}),
        slug: initial?.slug || undefined,
        name: name.trim(),
        code: code.trim() || null,
        category,
        supplier: supplier.trim() || null,
        origin: origin.trim() || null,
        composition: composition.trim() || null,
        weight: weight.trim() || null,
        texture: texture.trim() || null,
        finish: finish.trim() || null,
        colors,
        notes: notes.trim() || null,
        priceAmount: priceAmount ? Number(priceAmount) : null,
        priceCur,
        priceUnit: priceUnit.trim() || null,
        uses: uses.split("\n").map((s) => s.trim()).filter(Boolean),
        care: care.split("\n").map((s) => s.trim()).filter(Boolean),
        seasons: seasons.split("\n").map((s) => s.trim()).filter(Boolean),
      };
      // imageFile 优先；没换图则把现有 url 传回去保持同步
      await onSave({ ...payload, image: imageUrl || null, imageFile });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="flex-1 min-h-0 h-[60vh] overflow-auto pr-1 text-xs space-y-5">
      {/* 图片上传 */}
      <div>
        <div className={labelCls}>材料参考图</div>
        <div className="flex items-center gap-3">
          <div className="w-28 h-28 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
            {imageUrl ? (
              <img src={imageUrl} alt="材料" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">暂无图片</div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-primary-600 hover:underline cursor-pointer">
              上传图片
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setImageFile(f);
                  if (f) setImageUrl(URL.createObjectURL(f));
                }} />
            </label>
            {imageUrl && (
              <button onClick={() => { setImageUrl(""); setImageFile(null); }} className="text-[11px] text-gray-500 hover:underline">移除图片</button>
            )}
            <span className="text-[10px] text-gray-400">建议上传材料实拍或纹理图</span>
          </div>
        </div>
      </div>

      {/* 1-5 配色器 */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className={labelCls}>配色（{colors.length}/5）</div>
          <button onClick={() => setColors((cs) => cs.length < 5 ? [...cs, "#cccccc"] : cs)}
            disabled={!canAddColor}
            className="text-[10px] text-primary-600 disabled:text-gray-300 hover:underline">+ 添加颜色</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-1 border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
              <input type="color" value={c} onChange={(e) => {
                setColors((cs) => cs.map((x, j) => j === i ? e.target.value : x));
              }} className="w-7 h-7 rounded cursor-pointer border-0 p-0" />
              <input value={c} onChange={(e) => {
                setColors((cs) => cs.map((x, j) => j === i ? e.target.value : x));
              }} className="w-20 text-[11px] font-mono border-0 focus:outline-none" />
              <button onClick={() => setColors((cs) => cs.length > 1 ? cs.filter((_, j) => j !== i) : cs)}
                disabled={!canRemoveColor}
                className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1">×</button>
            </div>
          ))}
        </div>
        {colors.length === 5 && <div className="text-[10px] text-gray-400 mt-1">已达上限（最多 5 色）</div>}
      </div>

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div><div className={labelCls}>名称 *</div><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div><div className={labelCls}>代码</div><input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} /></div>
        <div>
          <div className={labelCls}>类别</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div><div className={labelCls}>供应商</div><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} /></div>
        <div><div className={labelCls}>产地</div><input value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputCls} /></div>
        <div><div className={labelCls}>克重</div><input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><div className={labelCls}>成分</div><input value={composition} onChange={(e) => setComposition(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><div className={labelCls}>手感</div><input value={texture} onChange={(e) => setTexture(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><div className={labelCls}>工艺</div><input value={finish} onChange={(e) => setFinish(e.target.value)} className={inputCls} /></div>
        <div className="col-span-2"><div className={labelCls}>备注</div><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} /></div>
      </div>

      {/* 价格 */}
      <div>
        <div className={labelCls}>价格</div>
        <div className="flex gap-2">
          <input value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} placeholder="金额" className={`${inputCls} w-24`} />
          <select value={priceCur} onChange={(e) => setPriceCur(e.target.value)} className={`${inputCls} w-20`}>
            <option value="CNY">¥</option><option value="EUR">€</option><option value="USD">$</option><option value="GBP">£</option>
          </select>
          <input value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)} placeholder="单位(如 / metre · 135 cm)" className={`${inputCls} flex-1`} />
        </div>
      </div>

      {/* 用途 / 洗护 / 季节（每行一条） */}
      <div className="grid grid-cols-3 gap-3">
        <div><div className={labelCls}>用途（每行一条）</div><textarea value={uses} onChange={(e) => setUses(e.target.value)} rows={4} className={inputCls} /></div>
        <div><div className={labelCls}>洗护（每行一条）</div><textarea value={care} onChange={(e) => setCare(e.target.value)} rows={4} className={inputCls} /></div>
        <div><div className={labelCls}>季节（每行一条）</div><textarea value={seasons} onChange={(e) => setSeasons(e.target.value)} rows={4} className={inputCls} /></div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
        <button onClick={onCancel} className="text-[12px] text-gray-600 hover:underline px-3 py-1.5">取消</button>
        <button onClick={submit} disabled={saving || !name.trim()}
          className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
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
