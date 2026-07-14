// @ts-nocheck
/**
 * Materials(面料库)——同面料多个颜色,每个颜色一张图(色卡=图片)。
 * 去掉类别筛选(全部视为面料),保留搜索与新增/编辑/只读 3 态弹窗。
 *
 * 保存流程:create → updateMaterial(写入 colorImages hex/name) →
 * 逐卡上传新图(uploadMaterialColorImage,后端同时保留 hex/name)。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { Modal } from "../components/ui";
import type { MaterialRow } from "../store/resource";
import type { ColorImageEntry } from "../types/design";
import { compressForUpload } from "../lib/images";

type Card = { hex: string; name: string; url: string; imageFile?: File | null };

function toCards(m: MaterialRow): Card[] {
  const ci = Array.isArray(m.colorImages) ? (m.colorImages as any[]) : [];
  if (ci.length) {
    return ci
      .filter((c) => c && typeof c === "object")
      .map((c) => ({ hex: String(c.hex || ""), name: String(c.name || ""), url: String(c.url || ""), imageFile: null }));
  }
  // 回退:老数据 colors(hex[]) → 每色一卡(url 空)
  const cols = Array.isArray(m.colors) ? m.colors : [];
  if (cols.length) return cols.map((c) => ({ hex: String(c), name: "", url: "", imageFile: null }));
  // 再回退:单图 → 单卡
  if (m.image) return [{ hex: "", name: "", url: String(m.image), imageFile: null }];
  return [{ hex: "#cccccc", name: "", url: "", imageFile: null }];
}

const SEED: MaterialRow[] = [
  {
    id: "fabric-silk-001", slug: "lashed-silk-satin", category: "面料", name: "水洗真丝贡丝锦",
    code: "HK-SS-21", supplier: "Silk Workshop Hangzhou", origin: "Hangzhou · China",
    composition: "100% mulberry silk · 19 momme satin ground", weight: "19 momme", texture: "washed matte satin",
    finish: "garment-washed stone", care: ["hand-wash ≤30 °C", "no bleach", "iron reverse-side"],
    uses: ["bias-cut slip dresses", "tailored camp-collar shirting"], seasons: ["SS", "Resort"],
    priceAmount: 86, priceCur: "CNY", priceUnit: "/ metre · 135 cm", priceNote: "MOQ 100 m · lead 30 days",
    colors: ["#d8c9a3", "#a89274", "#9b6a3a", "#1f3a44"],
  },
  {
    id: "fabric-wool-001", slug: "double-face-merino", category: "面料", name: "双面美利奴法兰绒",
    code: "BC-DF-1403", supplier: "Biella Textile Co.", origin: "Biella · Italy",
    composition: "100% extra-fine ZQ Merino · 310 g/m² double-face", weight: "310 g/m²", texture: "rounded, brushed on both faces",
    finish: "double-face, ready-to-cut selvedge",
    care: ["dry-clean recommended", "steam only"], uses: ["unlined blazers", "duster coats"], seasons: ["FW", "Pre-fall"],
    priceAmount: 112, priceCur: "EUR", priceUnit: "/ metre · 150 cm",
    colors: ["#2c2a2d", "#8a8580", "#d3c4a9", "#c59289"],
  },
  {
    id: "fabric-linen-001", slug: "linen-plain", category: "面料", name: "法国亚麻平纹",
    code: "FR-LN-001", supplier: "Tissage de France", origin: "Normandie · France",
    composition: "100% flax · 180 g/m² plain", weight: "180 g/m²", texture: "crisp slub",
    uses: ["summer shirts", "trousers"], seasons: ["SS"],
    priceAmount: 54, priceCur: "EUR", priceUnit: "/ metre · 150 cm",
  },
];

export default function MaterialsPage() {
  const { teamId } = useCurrentTeam();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<null | { mode: "view" | "edit" | "create"; mat?: MaterialRow }>(null);

  const refresh = useCallback(async (tid: string) => {
    setLoading(true);
    try {
      const r = await teamApi(tid).listMaterials();
      setRows((!r || r.length === 0) ? SEED : r);
    } catch {
      setRows(SEED);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (teamId) void refresh(teamId); }, [refresh, teamId]);

  const visible = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((m) =>
      m.name.toLowerCase().includes(needle) || (m.code || "").toLowerCase().includes(needle) ||
      (m.composition || "").toLowerCase().includes(needle) ||
      (m.uses || []).some((u) => u.toLowerCase().includes(needle)) ||
      (m.colors || []).some((c) => c.toLowerCase().includes(needle)) ||
      (m.supplier || "").toLowerCase().includes(needle));
  }, [q, rows]);

  const handleSave = useCallback(async (values: Partial<MaterialRow> & { colorImages: Card[] }, pendingFiles?: (File | null)[]) => {
    if (!teamId) return;
    const api = teamApi(teamId);
    const { colorImages, ...data } = values;
    const files = pendingFiles || [];
    const payload: any = { ...data };
    for (const k of Object.keys(payload)) { if (payload[k] === "") payload[k] = null; }
    let id = payload.id as string | undefined;
    // 1) 创建/更新主记录(colorImages 先只带 hex + name; 保留旧 url 避免被覆盖)
    let ciListRaw: any[] = [];
    if (id) {
      const existingColorImages = (() => {
        try { return rows.find((r) => r.id === id)?.colorImages ?? []; } catch { return []; }
      })();
      ciListRaw = colorImages.map((c, i) => {
        const old: any = Array.isArray(existingColorImages) ? existingColorImages[i] : null;
        return { hex: c.hex, name: c.name, url: old?.url || c.url || "" };
      });
      await api.updateMaterial(id, { ...payload, colorImages: ciListRaw }).catch(async (e) => {
        // 线上 schema 未同步时(colorImages 列不存在)退化为不带 colorImages 重试
        const msg = String(e?.message || "");
        if (msg.includes("column") || msg.includes("colorImages") || msg.includes("Unknown field")) {
          const { colorImages: _omit, ...withoutCi } = payload;
          return await api.updateMaterial(id, withoutCi);
        }
        throw e;
      });
    } else {
      ciListRaw = colorImages.map((c) => ({ hex: c.hex, name: c.name, url: "" }));
      try {
        const created = await api.createMaterial({ ...payload, category: "面料", colorImages: ciListRaw });
        id = created.id;
      } catch (e: any) {
        // 同上,线上 schema 未同步时退化为不带 colorImages
        const msg = String(e?.message || "");
        if (msg.includes("column") || msg.includes("colorImages") || msg.includes("Unknown field")) {
          const { colorImages: _omit, ...withoutCi } = payload;
          const created = await api.createMaterial({ ...payload: withoutCi, category: "面料" });
          id = created.id;
        } else throw e;
      }
    }
    // 2) 逐卡上传新图(后端不覆盖 hex/name,只更新 url)
    if (id) {
      for (let i = 0; i < colorImages.length; i++) {
        const file = files[i];
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("idx", String(i));
          await api.uploadMaterialColorImage(id, fd).catch(() => {});
        }
      }
      // 3) 上传后最终再同步一次 colorImages(hex/name 对齐卡片)
      const finalCi: any[] = [];
      for (let i = 0; i < colorImages.length; i++) {
        const c = colorImages[i];
        const cur: any = ciListRaw[i] || {};
        finalCi.push({ hex: c.hex, name: c.name, url: cur.url || c.url || "" });
      }
      await api.updateMaterial(id, { colorImages: finalCi }).catch(() => {});
    }
    setEditor(null);
    await refresh(teamId);
  }, [teamId, refresh, rows]);

  if (loading) return <div className="p-10 text-gray-500">加载中…</div>;

  return (
    <div className="h-[calc(100vh-64px)] min-h-0 overflow-auto bg-white">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-semibold text-gray-800 tracking-tight">面料库</h1>
          <p className="text-xs text-gray-500 mt-0.5">{visible.length} {visible.length === 1 ? "item" : "items"}</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="按成分、用途、颜色、供应商搜索…"
            className="w-80 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
          <button onClick={() => setEditor({ mode: "create" })}
            className="shrink-0 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-xl font-medium transition-colors">
            + 新增面料
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="py-16 text-center text-gray-500 text-sm">没有符合搜索的面料</div>
      ) : (
        <div className="p-6 grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
          {visible.map((m) => (
            <button key={m.id} onClick={() => setEditor({ mode: "view", mat: m })} className="text-left">
              <MaterialCard mat={m} />
            </button>
          ))}
        </div>
      )}

      <MaterialModal editor={editor} onClose={() => setEditor(null)} onSwitchEdit={() => setEditor((e) => e ? { ...e, mode: "edit" } : e)} onSave={handleSave} />
    </div>
  );
}

/** 卡面:色卡图横排铺开(每色一张小图),叠色点兜底(老数据) */
function MaterialCard({ mat }: { mat: MaterialRow }) {
  const cards = toCards(mat);
  const hexs: string[] = mat.colors ?? [];
  return (
    <figure className="rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer">
      <div className="relative h-48 overflow-hidden">
        {cards.some((c) => c.url) ? (
          <div className="absolute inset-0 flex">
            {cards.map((c, i) => (
              <div key={i} className="flex-1 h-full relative overflow-hidden">
                {c.url ? (
                  <img src={c.url} alt={c.name || c.hex} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: c.hex || "#eee" }} />
                )}
              </div>
            ))}
          </div>
        ) : hexs.length > 0 ? (
          <SwatchStrip colors={hexs} />
        ) : (
          <div className="bg-gray-100 w-full h-full" />
        )}
        <figcaption className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
          <div className="text-white text-sm font-medium leading-tight">{mat.name}</div>
          <div className="text-white/70 text-[10px] font-mono mt-0.5">{mat.code} · {cardsCountLabel(cards)}</div>
        </figcaption>
      </div>
      <figcaption className="px-3 py-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-gray-600 truncate">{(mat.composition || "").split(" · ")[0]}</div>
          <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
            {cards.slice(0, 5).map((c, i) => (
              <span key={i} className="inline-block w-4 h-4 rounded-sm border border-gray-200/60 shrink-0" style={{ background: c.url ? `url(${c.url}) center/cover` : (c.hex || "#eee") }} aria-hidden />
            ))}
            {cards.length > 5 && <span className="text-[10px] text-gray-500">+{cards.length - 5}</span>}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

function cardsCountLabel(cards: Card[]): string {
  const n = cards.length;
  return n > 0 ? `共 ${n} 色` : "面料";
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

function MaterialModal({ editor, onClose, onSwitchEdit, onSave }: {
  editor: null | { mode: "view" | "edit" | "create"; mat?: MaterialRow };
  onClose: () => void;
  onSwitchEdit: () => void;
  onSave: (values: Partial<MaterialRow> & { colorImages: Card[] }, pendingFiles?: (File | null)[]) => Promise<void>;
}) {
  if (!editor) return null;
  const { mode, mat } = editor;
  const isEditing = mode === "edit" || mode === "create";
  const title = mode === "create" ? "新增面料" : (mode === "edit" ? "编辑面料" : (mat?.name ?? "面料"));
  return (
    <Modal open onClose={onClose} title={title} maxWidth="max-w-5xl">
      {!isEditing ? <MaterialView mat={mat!} onEdit={onSwitchEdit} /> : <MaterialForm key={mat?.id ?? "new"} initial={mat ?? null} onCancel={onClose} onSave={onSave} />}
    </Modal>
  );
}

/** 只读详情 */
function MaterialView({ mat, onEdit }: { mat: MaterialRow; onEdit: () => void }) {
  const price = mat.priceAmount != null ? { amount: mat.priceAmount, currency: mat.priceCur || "CNY", unit: mat.priceUnit || "", note: mat.priceNote } : null;
  const cards = toCards(mat);
  const hexs: string[] = mat.colors ?? [];
  const showCards = cards.length > 0;
  return (
    <div className="grid grid-cols-[280px_1fr] gap-7 flex-1 min-h-0 h-[60vh]">
      <aside className="rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 overflow-y-auto max-h-full">
        {showCards ? (
          <ul className="divide-y divide-gray-200">
            {cards.map((c, i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                {c.url ? (
                  <img src={c.url} alt={c.name || c.hex} className="w-16 h-16 rounded-lg border border-gray-200 shrink-0 object-cover" />
                ) : (
                  <span className="w-16 h-16 rounded-lg border border-gray-200 shrink-0" style={{ background: c.hex || "#eee" }} aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-gray-800 font-medium truncate">{c.name || "(未命名颜色)"}</div>
                  {c.hex && <div className="text-[12px] font-mono text-gray-500 mt-0.5">{c.hex}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {mat.image ? <div className="aspect-square overflow-hidden border-b border-gray-200"><img src={mat.image} alt={mat.name} className="w-full h-full object-cover" /></div> : null}
            <ul className="divide-y divide-gray-200">
              {hexs.map((c) => (
                <li key={c} className="flex items-center gap-3 p-3">
                  <span className="w-14 h-14 rounded-lg border border-gray-200 shrink-0" style={{ background: c.includes(",") ? `linear-gradient(135deg, ${c})` : c }} aria-hidden />
                  <div className="text-[13px] text-gray-800 font-mono">{c}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <article className="overflow-auto max-h-full text-xs space-y-5 pr-1">
        <div className="flex items-center justify-between">
          {price ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl text-primary-600 font-semibold leading-none">
                {CURRENCY_SYMBOL[price.currency] ?? price.currency}{price.amount % 1 === 0 ? price.amount : price.amount.toFixed(2)}
              </span>
              <span className="text-[11px] text-gray-500">{price.unit}</span>
              {price.note && <span className="text-[10px] text-gray-500 ml-2">{price.note}</span>}
            </div>
          ) : null}
          <button onClick={onEdit} className="shrink-0 ml-4 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">编辑</button>
        </div>
        {mat.composition && <Section label="成分">{mat.composition}</Section>}
        {mat.texture && <Section label="手感">{mat.texture}</Section>}
        {mat.weight && <Section label="克重"><span className="font-mono">{mat.weight}</span></Section>}
        {mat.finish && <Section label="工艺">{mat.finish}</Section>}
        {mat.code && <Section label="代码"><span className="font-mono">{mat.code}</span></Section>}
        {mat.origin && <Section label="产地"><span className="font-mono">{mat.origin}</span></Section>}
        {mat.supplier && <Section label="供应商"><span className="font-mono">{mat.supplier}</span></Section>}
        {mat.uses && mat.uses.length > 0 && <Section label="用途"><ul className="list-disc pl-4 space-y-0.5">{mat.uses.map((u) => <li key={u}>{u}</li>)}</ul></Section>}
        {mat.seasons && mat.seasons.length > 0 && <Section label="季节"><div className="flex flex-wrap gap-1.5">{mat.seasons.map((s) => <span key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{s}</span>)}</div></Section>}
        {mat.care && mat.care.length > 0 && <Section label="洗护"><ul className="list-disc pl-4 space-y-0.5">{mat.care.map((c) => <li key={c}>{c}</li>)}</ul></Section>}
        {(mat.notes || mat.originNote) && <Section label="备注"><div className="bg-gray-50 rounded-2xl p-4 text-gray-600 leading-relaxed whitespace-pre-line">{mat.notes ?? mat.originNote}</div></Section>}
      </article>
    </div>
  );
}

/** 编辑 / 新增 表单 */
function MaterialForm({ initial, onCancel, onSave }: {
  initial: MaterialRow | null;
  onCancel: () => void;
  onSave: (values: Partial<MaterialRow> & { colorImages: Card[] }, pendingFiles?: (File | null)[]) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<Card[]>(() => toCards(initial ?? { colors: ["#cccccc"] } as any));
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [composition, setComposition] = useState(initial?.composition ?? "");
  const [weight, setWeight] = useState(initial?.weight ?? "");
  const [texture, setTexture] = useState(initial?.texture ?? "");
  const [finish, setFinish] = useState(initial?.finish ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [priceAmount, setPriceAmount] = useState<string>(initial?.priceAmount != null ? String(initial.priceAmount) : "");
  const [priceCur, setPriceCur] = useState(initial?.priceCur ?? "CNY");
  const [priceUnit, setPriceUnit] = useState(initial?.priceUnit ?? "");
  const [uses, setUses] = useState<string>((initial?.uses ?? []).join("\n"));
  const [care, setCare] = useState<string>((initial?.care ?? []).join("\n"));
  const [seasons, setSeasons] = useState<string>((initial?.seasons ?? []).join("\n"));

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        ...(initial?.id ? { id: initial.id } : {}),
        slug: initial?.slug || undefined,
        name: name.trim(),
        code: code.trim() || null,
        category: "面料",
        supplier: supplier.trim() || null,
        origin: origin.trim() || null,
        composition: composition.trim() || null,
        weight: weight.trim() || null,
        texture: texture.trim() || null,
        finish: finish.trim() || null,
        colors: cards.map((c) => c.hex).filter(Boolean),
        notes: notes.trim() || null,
        priceAmount: priceAmount ? Number(priceAmount) : null,
        priceCur,
        priceUnit: priceUnit.trim() || null,
        uses: uses.split("\n").map((s) => s.trim()).filter(Boolean),
        care: care.split("\n").map((s) => s.trim()).filter(Boolean),
        seasons: seasons.split("\n").map((s) => s.trim()).filter(Boolean),
        // colorImages 仅含可 JSON 序列化的字段;File 对象单独走 uploadMaterialColorImage
        colorImages: cards.map((c) => ({ hex: c.hex, name: c.name, url: c.url || "" })),
      };
      // 单独传 File 数组,避免 JSON 序列化失败
      const pendingFiles = await Promise.all(cards.map(async (c) => {
        if (!c.imageFile) return null;
        try { return await compressForUpload(c.imageFile); } catch { return null; }
      }));
      await onSave(payload, pendingFiles);
    } finally {
      setSaving(false);
    }
  };

  const updateCard = (i: number, patch: Partial<Card>) =>
    setCards((cs) => cs.map((c, j) => j === i ? { ...c, ...patch } : c));
  const addCard = () => setCards((cs) => cs.length < 12 ? [...cs, { hex: "#cccccc", name: "", url: "", imageFile: null }] : cs);
  const removeCard = (i: number) => setCards((cs) => cs.length > 1 ? cs.filter((_, j) => j !== i) : cs);

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1";

  return (
    <div className="flex-1 min-h-0 h-[60vh] overflow-auto pr-1 text-xs space-y-5">
      {/* 色卡列表(每色一张图) */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <div className={labelCls}>色卡 ({cards.length}/12)</div>
          <button onClick={addCard} disabled={cards.length >= 12} className="text-[10px] text-primary-600 disabled:text-gray-300 hover:underline">+ 添加色卡</button>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {cards.map((c, i) => (
            <div key={i} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white">
              <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
                {c.url && !c.imageFile ? (
                  <img src={c.url} alt={c.name} className="w-full h-full object-cover" />
                ) : c.imageFile ? (
                  <img src={URL.createObjectURL(c.imageFile)} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" style={{ background: c.hex || "#eee" }} />
                )}
              </div>
              <div className="flex-1 grid grid-cols-[80px_1fr] gap-2 items-center">
                <div className="flex items-center gap-1">
                  <input type="color" value={c.hex || "#cccccc"} onChange={(e) => updateCard(i, { hex: e.target.value })} className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0" />
                  <input value={c.hex} onChange={(e) => updateCard(i, { hex: e.target.value })} className="w-16 text-[11px] font-mono border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-primary-500" />
                </div>
                <input value={c.name} onChange={(e) => updateCard(i, { name: e.target.value })} placeholder="颜色名(可选)" className={`${inputCls} col-span-1`} />
              </div>
              <label className="text-[11px] text-primary-600 hover:underline cursor-pointer shrink-0">
                上传
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0] || null; updateCard(i, { imageFile: f });
                }} />
              </label>
              <button onClick={() => removeCard(i)} disabled={cards.length <= 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 px-1">×</button>
            </div>
          ))}
        </div>
        <span className="text-[10px] text-gray-400">每个颜色一张实拍/纹理图，在材料组合中可选其中某色</span>
      </div>

      {/* 基础信息 */}
      <div className="grid grid-cols-2 gap-3">
        <div><div className={labelCls}>名称 *</div><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></div>
        <div><div className={labelCls}>代码</div><input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} /></div>
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
