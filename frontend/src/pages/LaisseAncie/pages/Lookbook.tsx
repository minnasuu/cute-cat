// @ts-nocheck
import { useMemo, useState } from "react";
import { useDesignStore } from "../store/design";
import { useSkillStore } from "../store/skill";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import { MODE_LABEL, STATUS_FLOW, STATUS_LABEL, type Product, type ProductStatus } from "../types/design";

/** 简易行内删除确认状态:id → 是否正在确认中。 */
function useRowDelete() {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // 正在调接口的 id
  const store = useDesignStore();

  async function doDelete(id: string) {
    setPending(id);
    try {
      await store.removeProduct(id);
    } catch (e: any) {
      console.error("[lookbook] delete failed", e);
      alert(`删除失败: ${e?.message || e}`);
    } finally {
      setPending(null);
      setConfirming((cur) => (cur === id ? null : cur));
    }
  }

  return { confirming, setConfirming, pending, doDelete };
}

const ALL_MODES = ["illustration", "single", "collection", "occasion"] as const;
type TabKey = "illustration" | "single" | "collection" | "occasion" | "all";

function nextStatus(s: ProductStatus): ProductStatus | null {
  const i = STATUS_FLOW.indexOf(s);
  return i === -1 || i >= STATUS_FLOW.length - 1 ? null : STATUS_FLOW[i + 1]!;
}

export default function LookbookPage() {
  const { teamId } = useCurrentTeam();
  const store = useDesignStore();
  const [tab, setTab] = useState<TabKey>("all");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const { confirming, setConfirming, pending, doDelete } = useRowDelete();

  const items = useMemo(() => {
    if (tab === "all") return store.products;
    return store.products.filter((p) => p.mode === tab);
  }, [store.products, tab]);

  return (
    <div className="p-8 lg:p-12 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-5xl font-semibold text-primary-600 tracking-tight">Lookbook</h1>
          <p className="text-sm text-gray-500 mt-1">款式总览 — 按创作模式分类 · 点击状态推进工序</p>
        </div>
        <span className="text-xs text-gray-500">{store.products.length} items</span>
      </header>
      <div className="inline-flex rounded-2xl border border-gray-200 overflow-hidden text-sm mb-6">
        <TabBtn current={tab} value="all" onClick={setTab} label="全部" />
        {ALL_MODES.map((m) => <TabBtn key={m} current={tab} value={m} onClick={setTab} label={MODE_LABEL[m]} />)}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-gray-500 text-sm">
          要去往 <span className="text-primary-600">Design</span> 开始创作，产品才会进入 Lookbook
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                {["产品", "季节", "品类", "面料", "目标价", "状态", "知识", "最近更新", "操作"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-200 hover:bg-primary-50/40 cursor-pointer"
                  onClick={() => setActiveProduct(p)}>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{p.title || "(untitled)"}</div>
                    {p.description && <div className="text-[11px] text-gray-500 truncate max-w-[280px]">{p.description}</div>}
                  </td>
                  <td className="px-3 py-3">{p.seasons?.join(", ") || "—"}</td>
                  <td className="px-3 py-3">{p.category || "—"}</td>
                  <td className="px-3 py-3 max-w-[200px] truncate">{p.fabricComposition || "—"}</td>
                  <td className="px-3 py-3">{typeof p.targetPriceNum === "number" ? `¥${p.targetPriceNum}` : "—"}</td>
                  <td className="px-3 py-3"><StatusPill product={p} onClick={() => setActiveProduct(p)} /></td>
                  <td className="px-3 py-3"><SkillsBadge productId={p.id} /></td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-[11px]">{new Date(p.updatedAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3">
                    {confirming === p.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={pending === p.id}
                          onClick={(e) => { e.stopPropagation(); void doDelete(p.id); }}
                          className="text-[11px] px-2 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50"
                        >{pending === p.id ? "删除中" : "确认删除"}</button>
                        <button
                          disabled={pending === p.id}
                          onClick={(e) => { e.stopPropagation(); setConfirming(null); }}
                          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >取消</button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirming(p.id); }}
                        className="text-[11px] px-2 py-1 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="删除该产品"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeProduct && (
        <StageEditor
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onSave={async (p) => { await store.upsertProduct(p); setActiveProduct(null); }}
        />
      )}
    </div>
  );
}

function TabBtn({ current, value, onClick, label }: { current: TabKey; value: TabKey; onClick: (v: TabKey) => void; label: string }) {
  return (
    <button onClick={() => onClick(value)}
      className={`px-4 py-2 transition-colors ${current === value ? "bg-primary-500 text-white" : "bg-white text-gray-700 hover:bg-primary-50"}`}>
      {label}
    </button>
  );
}

function StatusPill({ product, onClick }: { product: Product; onClick: () => void }) {
  const nxt = nextStatus(product.status);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${product.status === "live" ? "bg-primary-50 border-primary-500 text-primary-600" : product.status === "draft" ? "bg-gray-100 border-gray-300 text-gray-600" : "bg-gray-800 border-gray-800 text-white"}`}>
      {STATUS_LABEL[product.status]}
      {nxt && <span className="ml-1 opacity-60">→ {STATUS_LABEL[nxt]}</span>}
    </button>
  );
}

function SkillsBadge({ productId }: { productId: string }) {
  const skills = useSkillStore();
  const n = skills.articles.filter((a) => (a.relatedProducts ?? []).includes(productId)).length;
  if (n === 0) return <span className="text-[11px] text-gray-400">—</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-600">ⓢ {n}</span>;
}

function StageEditor({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (p: Product) => Promise<void> }) {
  const target = nextStatus(product.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function advance() {
    if (!target) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const entry = { id: crypto.randomUUID(), status: target, at: now, actor: "atelier", note: note.trim() || undefined };
      const updated = { ...product, status: target, statusHistory: [...(product.statusHistory || []), entry], updatedAt: now };
      // Use advance endpoint via teamApi
      if (!teamId) return;
      await teamApi(teamId).advanceProduct(product.id, { status: target, note });
      await onSave(updated);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-3xl border border-gray-200 bg-white p-7 shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-[26px] font-medium text-gray-900">{product.title || "(untitled)"}</h2>
            <p className="text-[11px] text-gray-500 font-mono mt-1">{product.id}</p>
          </div>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-800">×</button>
        </header>

        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">工序时间线</div>
          <ol className="space-y-2 max-h-48 overflow-y-auto pr-2">
            {(product.statusHistory || []).length === 0 && (
              <li className="text-[12px] text-gray-500">尚无工序记录 — 首次推进时系统会自动补充 "draft" → "submitted"</li>
            )}
            {(product.statusHistory || []).concat(
              (product.statusHistory || []).length === 0 ? [{ id: "init", status: "draft" as ProductStatus, at: product.createdAt, actor: "atelier" as string }] : []
            ).sort((a, b) => a.at.localeCompare(b.at)).map((e) => (
              <li key={e.id} className="text-[12px] flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-gray-500 w-36">{new Date(e.at).toLocaleString()}</span>
                <span className={`px-2 py-0.5 rounded-full border ${e.status === product.status ? "bg-gray-800 border-gray-800 text-white" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
                  {STATUS_LABEL[e.status]}
                </span>
                {e.note && <span className="text-gray-600">{e.note}</span>}
              </li>
            ))}
          </ol>
        </div>

        <section className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] border-t border-gray-200 pt-4 mb-5">
          <Detail k="季节" v={product.seasons?.join(", ")} />
          <Detail k="品类" v={product.category} />
          <Detail k="面料" v={product.fabricComposition || "—"} />
          <Detail k="目标价" v={typeof product.targetPriceNum === "number" ? `¥${product.targetPriceNum}` : "—"} />
          <Detail k="颜色" v={product.colors?.join(", ")} />
          <Detail k="版型" v={product.silhouette} />
          <Detail k="工艺" v={product.stitchNotes} />
        </section>

        {target ? (
          <div className="border-t border-gray-200 pt-5">
            <div className="text-[11px] text-gray-500 mb-1.5">推进至下工序：</div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-gray-800 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[product.status]}</span>
              <span className="text-gray-500">→</span>
              <span className="bg-primary-500 text-white px-2 py-1 rounded-full text-[11px]">{STATUS_LABEL[target]}</span>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="(可选) 批注 · 工厂 / 成本 / 样品反馈 …" rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-primary-500" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="rounded-xl border border-gray-200 text-gray-700 font-medium py-2 px-4 text-sm hover:border-gray-800">关闭</button>
              <button disabled={submitting} onClick={advance}
                className="rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-medium py-2.5 px-5 text-sm transition-colors disabled:opacity-50">
                确认推进 → {STATUS_LABEL[target]}
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-gray-200 pt-5 text-primary-600 text-[13px]">✓ 产品已上架，流水完成</div>
        )}
      </div>
    </div>
  );
}

function Detail({ k, v }: { k: string; v?: string }) {
  if (!v) return null;
  return (
    <div>
      <span className="text-gray-500 text-[10px] uppercase tracking-wider">{k}</span>
      <div className="text-gray-700 whitespace-pre-wrap">{v}</div>
    </div>
  );
}
