// @ts-nocheck
import { useMemo, useState } from "react";
import {
  SKILL_PHASE_META,
  ALL_PHASE_IDS,
  WRITEABLE_PHASE_IDS,
  type SkillArticle,
  type SkillCategory,
  type SkillPhaseId,
} from "../types/skill";
import { useSkillStore } from "../store/skill";
import { Markdown } from "../lib/markdown";
import { Modal } from "../components/ui";

export default function SkillsPage() {
  const store = useSkillStore();
  const [cat, setCat] = useState<SkillPhaseId | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<SkillArticle | null>(null);

  const filtered = useMemo(() => {
    let list = store.articles;
    if (cat !== "all") list = list.filter((a) => a.category === cat);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((a) => [a.title, a.zhTitle, a.tags.join(" ")].some((s) => s.toLowerCase().includes(needle)));
    }
    return list;
  }, [cat, q, store.articles]);

  const countByCat = useMemo(() => {
    const out = new Map<SkillPhaseId, number>();
    for (const a of store.articles) out.set(a.category as SkillPhaseId, (out.get(a.category as SkillPhaseId) ?? 0) + 1);
    return out;
  }, [store.articles]);

  const comingSoon = cat !== "all" && SKILL_PHASE_META[cat as SkillPhaseId]?.comingSoon;
  const showComingSoon = comingSoon && filtered.length === 0;

  // 分组：核心知识（01~07） vs 即将开放（08~10）
  const corePhases = ALL_PHASE_IDS.filter((id) => !SKILL_PHASE_META[id].comingSoon);
  const laterPhases = ALL_PHASE_IDS.filter((id) => !!SKILL_PHASE_META[id].comingSoon);

  return (
    <div className="grid grid-cols-[260px_1fr] h-[calc(100vh-64px)] min-h-0">
      <aside className="border-r border-gray-200 bg-gray-50 px-4 py-5 flex flex-col overflow-auto">
        <div className="px-2 mb-2 text-[10px] uppercase tracking-wider text-gray-500">知识库 · 10 阶段</div>
        <nav className="flex flex-col gap-0.5 flex-1">
          <CatBtn current={cat === "all"} onClick={() => setCat("all")} icon="✦" label="全部" count={store.articles.length} />
          <div className="px-2 mt-3 mb-1 text-[10px] uppercase tracking-wider text-gray-400">核心知识</div>
          {corePhases.map((c) => (
            <CatBtn key={c} current={cat === c} onClick={() => setCat(c)} icon={SKILL_PHASE_META[c].icon}
              label={`${SKILL_PHASE_META[c].phase}. ${SKILL_PHASE_META[c].labelZh}`} sublabel={SKILL_PHASE_META[c].labelEn}
              count={countByCat.get(c) ?? 0} />
          ))}
          <ComingSoonGroup phases={laterPhases} active={cat} onPick={setCat} counts={countByCat} />
        </nav>
        <div className="mt-4 px-2 text-[10px] text-gray-500 leading-relaxed border-t border-gray-200 pt-3">
          所有 Design / Lookbook 生成的 AI 审核时都会默认从知识条目里匹配出 1～3 条 knowledge 作为上下文。
        </div>
      </aside>

      <main className="overflow-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-[34px] font-semibold text-blue-600 tracking-tight">知识库</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {filtered.length} 条知识
              {cat !== "all" ? ` · ${SKILL_PHASE_META[cat as SkillPhaseId].hint}` : " · 用 + 沉淀的闭环"}
            </p>
          </div>
          <div className="flex gap-3">
            <input value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="搜索标题 / 标签 / 内容 …"
              className="w-72 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            {!comingSoon && <AddArticleButton />}
          </div>
        </header>

        {showComingSoon ? (
          <ComingSoonPlaceholder phase={cat as SkillPhaseId} />
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-500 text-sm">该分类暂无条目 — 用右上角 + 新增一条。</div>
        ) : (
          <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {filtered.map((a) => <ArticleCard key={a.id} a={a} onClick={() => setOpen(a)} />)}
          </div>
        )}
      </main>

      {open && <ArticleModal article={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** 「即将开放」分组 — 折叠 + 置灰，点击展开仍只读 */
function ComingSoonGroup({ phases, active, onPick, counts }: {
  phases: SkillPhaseId[]; active: SkillPhaseId | "all"; onPick: (id: SkillPhaseId | "all") => void;
  counts: Map<SkillPhaseId, number>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button onClick={() => setExpanded((v) => !v)}
        className="w-full px-2 mt-3 mb-1 text-[10px] uppercase tracking-wider text-gray-400 flex items-center justify-between">
        <span>即将开放 · 占位</span>
        <span className="text-gray-400">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && phases.map((c) => (
        <CatBtn key={c} current={active === c} onClick={() => onPick(c)} icon={SKILL_PHASE_META[c].icon}
          label={`${SKILL_PHASE_META[c].phase}. ${SKILL_PHASE_META[c].labelZh}`} sublabel={`${SKILL_PHASE_META[c].labelEn} · 即将开放`}
          count={counts.get(c) ?? 0} disabled />
      ))}
    </div>
  );
}

function ComingSoonPlaceholder({ phase }: { phase: SkillPhaseId }) {
  const meta = SKILL_PHASE_META[phase];
  return (
    <div className="py-20 text-center">
      <div className="text-5xl mb-3">🔒</div>
      <div className="text-gray-700 font-medium">{meta.labelZh} · {meta.labelEn}</div>
      <div className="text-sm text-gray-500 mt-1">{meta.hint}</div>
      <div className="text-xs text-gray-400 mt-3">知识沉淀中，即将开放。</div>
    </div>
  );
}

function CatBtn({ current, onClick, icon, label, sublabel, count, disabled }: {
  current: boolean; onClick: () => void; icon: string; label: string; sublabel?: string; count?: number; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${current ? "bg-blue-600/10 text-blue-700 border border-blue-200" : "text-gray-600 hover:bg-gray-100"}`}>
      <span className="w-5 text-center text-base">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="text-[13px] font-medium block">{label}</span>
        {sublabel && <span className="text-[10px] text-gray-500 block">{sublabel}</span>}
      </span>
      {(count ?? 0) > 0 && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

function ArticleCard({ a, onClick }: { a: SkillArticle; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      {a.pinned ? (
        <article className="rounded-2xl border-2 border-blue-500/40 bg-gray-50 p-5 shadow-sm min-h-[150px] hover:shadow-md transition-shadow cursor-pointer relative">
          <PinBadge />
          <Inner a={a} />
        </article>
      ) : (
        <article className="rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm min-h-[150px] hover:border-blue-500/50 hover:shadow-md transition-shadow cursor-pointer">
          <Inner a={a} />
        </article>
      )}
    </button>
  );
}

function PinBadge() { return <span className="absolute top-3 right-3 text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">PIN</span>; }

function Inner({ a }: { a: SkillArticle }) {
  const meta = SKILL_PHASE_META[a.category as SkillPhaseId];
  const labelZh = meta?.labelZh ?? a.category;
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded">{labelZh}</span>
        <span className="text-lg font-medium text-gray-900 leading-tight">{a.zhTitle}</span>
      </div>
      <p className="text-[13px] text-gray-500 line-clamp-3 mt-2 leading-relaxed">{stripMd(a.body).slice(0, 140)}</p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {a.tags.slice(0, 5).map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">#{t}</span>)}
      </div>
      <div className="text-[10px] text-gray-500 mt-2 font-mono">{new Date(a.updatedAt).toLocaleDateString()}</div>
    </>
  );
}

function ArticleModal({ article, onClose }: { article: SkillArticle; onClose: () => void }) {
  const store = useSkillStore();
  const [draft, setDraft] = useState(article);
  const [editing, setEditing] = useState(false);

  const phaseMeta = SKILL_PHASE_META[article.category as SkillPhaseId];
  const isComingSoon = !!phaseMeta?.comingSoon;

  async function save() {
    await store.upsert({ ...draft, updatedAt: new Date().toISOString() });
    onClose();
  }
  function togglePin() { setDraft({ ...draft, pinned: !draft.pinned }); }

  return (
    <Modal open onClose={onClose} title={article.zhTitle || article.title}>
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        <header className="flex items-center justify-between mb-4">
          <div className="text-xs text-gray-500">
            <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full">{phaseMeta?.labelZh ?? article.category}</span>
            <span className="ml-2">{article.title}</span>
          </div>
          {!isComingSoon && (
            <button onClick={togglePin} className="text-xs text-blue-600 underline">{article.pinned ? "取消置顶" : "置顶"}</button>
          )}
        </header>
        {editing ? (
          <div className="space-y-3">
            {isComingSoon && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                当前阶段为占位骨架（即将开放），不可编辑。
              </div>
            )}
            {(["title", "zhTitle", "tags", "systemHint"] as const).map((k) => {
              const val = draft[k] ?? "";
              return (
                <label key={k} className="block">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">{k}</div>
                  {k === "tags" ? (
                    <input value={(val as string[]).join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                      disabled={isComingSoon}
                      className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60" />
                  ) : (
                    <input value={val as string} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                      disabled={isComingSoon}
                      className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60" />
                  )}
                </label>
              );
            })}
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">body</div>
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12}
                disabled={isComingSoon}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 disabled:opacity-60" />
            </label>
          </div>
        ) : (
          <div className="text-[13px]">
            <Markdown source={draft.body} />
            <div className="mt-5 flex flex-wrap gap-1.5">
              {draft.tags.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">#{t}</span>)}
            </div>
          </div>
        )}
      </div>
      <footer className="mt-5 flex justify-between">
        {!isComingSoon && (
          <button onClick={() => setEditing((v) => !v)} className="text-xs text-blue-600 underline">{editing ? "取消编辑" : "编辑"}</button>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:border-gray-800">关闭</button>
          {!isComingSoon && editing && <button onClick={save} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-500">保存</button>}
        </div>
      </footer>
    </Modal>
  );
}

function AddArticleButton() {
  const store = useSkillStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<SkillArticle>>({ category: "phase-03-design", title: "", zhTitle: "", body: "", tags: [] });

  async function save() {
    if (!draft.title || !draft.zhTitle) return;
    const now = new Date().toISOString();
    await store.upsert({
      id: crypto.randomUUID(), category: draft.category as SkillPhaseId, title: draft.title ?? "",
      zhTitle: draft.zhTitle ?? "", body: draft.body ?? "", tags: draft.tags ?? [],
      relatedProducts: [], relatedMaterials: [], createdAt: now, updatedAt: now, pinned: false,
    });
    setOpen(false);
    setDraft({ category: "phase-03-design", title: "", zhTitle: "", body: "", tags: [] });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-medium shadow-sm">+ 新增</button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="新增知识条目">
          <div className="space-y-3">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">阶段</div>
              <select value={draft.category as string} onChange={(e) => setDraft({ ...draft, category: e.target.value as SkillPhaseId })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500">
                {WRITEABLE_PHASE_IDS.map((c) => <option key={c} value={c}>{SKILL_PHASE_META[c].phase}. {SKILL_PHASE_META[c].labelZh} ({SKILL_PHASE_META[c].labelEn})</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">中文标题</div>
              <input value={draft.zhTitle} onChange={(e) => setDraft({ ...draft, zhTitle: e.target.value })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">English title</div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">标签 (, 分隔)</div>
              <input value={(draft.tags ?? []).join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500" />
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-gray-500">正文 (Markdown)</div>
              <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={8}
                className="w-full mt-0.5 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500" />
            </label>
          </div>
          <footer className="mt-4 flex justify-end">
            <button onClick={save} disabled={!draft.zhTitle || !draft.title}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-40">保存</button>
          </footer>
        </Modal>
      )}
    </>
  );
}

function stripMd(s: string): string {
  return s.replace(/```[\s\S]*?```/g, "").replace(/[#>|*_\-]/g, "").replace(/\s+/g, " ").trim();
}
