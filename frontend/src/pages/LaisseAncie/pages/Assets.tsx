/**
 * AssetsPage —— 品牌信息(原「品牌资产」)。
 *
 * 用户自定义品牌资料表单:标识(logo / 名称 / slogan)、主题色、风格描述、定位(客群 / 价格带)、AI 系统提示。
 * 新用户默认全部为空,由用户自行填写。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { compressForUpload } from "../lib/images";

interface BrandForm {
  logo: string;
  name: string;
  slogan: string;
  voice: string;          // 风格描述(逗号分隔编辑态)
  audienceAgeMin: string;
  audienceAgeMax: string;
  priceMin: string;
  priceMax: string;
  systemSnippet: string;
}

type ColorRow = { bg: string; fg: string; usage: string };
const emptyColor = (): ColorRow => ({ bg: "#ffffff", fg: "#1a1a1a", usage: "" });

function toForm(p: any): BrandForm {
  return {
    logo: p?.logo || "",
    name: p?.name || "",
    slogan: p?.slogan || "",
    voice: Array.isArray(p?.voice) ? p?.voice.join("，") : (p?.voice || ""),
    audienceAgeMin: p?.audienceAgeMin != null ? String(p.audienceAgeMin) : "",
    audienceAgeMax: p?.audienceAgeMax != null ? String(p.audienceAgeMax) : "",
    priceMin: p?.priceMin != null ? String(p.priceMin) : "",
    priceMax: p?.priceMax != null ? String(p.priceMax) : "",
    systemSnippet: p?.systemSnippet || "",
  };
}

export default function AssetsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-8">
      <BrandInfoAssets />
    </div>
  );
}

/* ── 品牌信息(可编辑表单) ──────────────────────────────────── */

function BrandInfoAssets() {
  const { teamId } = useCurrentTeam();
  const [form, setForm] = useState<BrandForm>(toForm(null));
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const r = await teamApi(teamId).getBrand();
      setForm(toForm(r.profile));
      setColors((r.colors && r.colors.length) ? r.colors.map((c: any) => ({ bg: c.bg, fg: c.fg, usage: c.usage || "" })) : []);
    } catch {
      setForm(toForm(null));
      setColors([]);
    } finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  const set = (k: keyof BrandForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // 品牌 logo 上传
  const onLogo = async (file: File | null) => {
    if (!file || !teamId) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", await compressForUpload(file));
      const r = await teamApi(teamId).uploadBrandLogo(fd);
      setForm((f) => ({ ...f, logo: r.url }));
    } catch (e: any) {
      alert(`Logo 上传失败: ${e?.message || "请重试"}`);
    } finally { setLogoUploading(false); }
  };

  // 主题色管理
  const updateColor = (i: number, patch: Partial<ColorRow>) =>
    setColors((cs) => cs.map((c, j) => j === i ? { ...c, ...patch } : c));
  const addColor = () => setColors((cs) => cs.length < 12 ? [...cs, emptyColor()] : cs);
  const removeColor = (i: number) => setColors((cs) => cs.filter((_, j) => j !== i));

  const save = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const payload: any = {
        logo: form.logo || null,
        name: form.name.trim() || null,
        slogan: form.slogan.trim() || null,
        voice: form.voice.split(/[，,\n]/).map((s) => s.trim()).filter(Boolean),
        audienceAgeMin: form.audienceAgeMin ? Number(form.audienceAgeMin) : null,
        audienceAgeMax: form.audienceAgeMax ? Number(form.audienceAgeMax) : null,
        priceMin: form.priceMin ? Number(form.priceMin) : null,
        priceMax: form.priceMax ? Number(form.priceMax) : null,
        systemSnippet: form.systemSnippet.trim() || null,
        colors: colors
          .map((c) => ({ bg: c.bg, fg: c.fg, usage: c.usage.trim() }))
          .filter((c) => /^#/.test(c.bg) && /^#/.test(c.fg)),
      };
      await teamApi(teamId).patchBrand(payload);
      await load();
    } catch (e: any) {
      alert(`保存失败: ${e?.message || "请重试"}`);
    } finally { setSaving(false); }
  };

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  if (loading) return <div className="text-gray-500">加载中…</div>;

  return (
    <div className="space-y-6">
      {/* 标题 + 保存 */}
      <div className="flex items-center justify-between">
        <h2 className="text-[32px] font-semibold text-text-primary tracking-tight">品牌信息</h2>
        <button onClick={save} disabled={saving}
          className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
          {saving ? "保存中…" : "保存品牌信息"}
        </button>
      </div>

      {/* 1. 标识:logo + 名称 + slogan */}
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">标识</h3>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start gap-5">
            <div className="shrink-0 text-center">
              <div className="w-24 h-24 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
                {form.logo
                  ? <img src={form.logo} alt="logo" className="w-full h-full object-contain" />
                  : <span className="text-[10px] text-gray-300 px-2 text-center">暂无 Logo</span>}
              </div>
              <button onClick={() => logoRef.current?.click()} disabled={logoUploading} className="mt-1.5 text-[11px] text-primary-600 hover:underline disabled:opacity-40">
                {logoUploading ? "上传中…" : "上传 Logo"}
              </button>
              <input ref={logoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { onLogo(e.target.files?.[0] || null); e.target.value = ""; }} />
            </div>
            <div className="flex-1 grid grid-cols-1 gap-3">
              <div><div className={labelCls}>名称 <span className="text-red-500">*</span></div><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如:山海织物 / Montsea" className={inputCls} /></div>
              <div><div className={labelCls}>Slogan</div><input value={form.slogan} onChange={(e) => set("slogan", e.target.value)} placeholder="如:自然·自洽 / Be in tune." className={inputCls} /></div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 主题色 */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-[11px] uppercase tracking-wider text-gray-500">主题色 ({colors.length}/12)</h3>
          <button onClick={addColor} disabled={colors.length >= 12} className="text-[10px] text-primary-600 disabled:text-gray-300 hover:underline">+ 添加颜色</button>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          {colors.length === 0 && <div className="text-[12px] text-gray-400">暂无主题色,点击右上角添加。</div>}
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="color" value={c.bg} onChange={(e) => updateColor(i, { bg: e.target.value })} className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0" title="背景色" />
              <input value={c.bg} onChange={(e) => updateColor(i, { bg: e.target.value })} className="w-20 text-[11px] font-mono border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-primary-500" />
              <span className="text-gray-300">/</span>
              <input type="color" value={c.fg} onChange={(e) => updateColor(i, { fg: e.target.value })} className="w-7 h-7 rounded cursor-pointer border border-gray-300 p-0" title="字色" />
              <input value={c.fg} onChange={(e) => updateColor(i, { fg: e.target.value })} className="w-20 text-[11px] font-mono border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-primary-500" />
              <input value={c.usage} onChange={(e) => updateColor(i, { usage: e.target.value })} placeholder="用途(如:主背景)" className={`${inputCls} flex-1`} />
              <span className="inline-flex shrink-0 rounded-lg overflow-hidden border border-gray-200" title="预览">
                <span className="px-3 py-1 text-[11px]" style={{ background: c.bg, color: c.fg }}>示例</span>
              </span>
              <button onClick={() => removeColor(i)} className="text-gray-400 hover:text-red-500 px-1">×</button>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 风格描述(调性) */}
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">风格描述</h3>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div>
            <div className={labelCls}>品牌调性(逗号分隔)</div>
            <input value={form.voice} onChange={(e) => set("voice", e.target.value)} placeholder="如:自然,克制,温暖" className={inputCls} />
            {form.voice && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {form.voice.split(/[，,\n]/).map((v) => v.trim()).filter(Boolean).map((v) => (
                  <span key={v} className="text-[11px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-100">{v}</span>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className={labelCls}>目标客群年龄</div><div className="flex items-center gap-1"><input value={form.audienceAgeMin} onChange={(e) => set("audienceAgeMin", e.target.value)} placeholder="18" className={inputCls} /><span className="text-gray-400 text-[12px]">—</span><input value={form.audienceAgeMax} onChange={(e) => set("audienceAgeMax", e.target.value)} placeholder="30" className={inputCls} /><span className="text-gray-400 text-[12px] ml-1">岁</span></div></div>
            <div><div className={labelCls}>价格带</div><div className="flex items-center gap-1"><span className="text-gray-400 text-[12px]">¥</span><input value={form.priceMin} onChange={(e) => set("priceMin", e.target.value)} placeholder="20" className={inputCls} /><span className="text-gray-400 text-[12px]">—</span><input value={form.priceMax} onChange={(e) => set("priceMax", e.target.value)} placeholder="500" className={inputCls} /></div></div>
          </div>
        </div>
      </section>

      {/* 4. AI 系统提示 */}
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">AI 系统提示</h3>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className={labelCls}>用于生成设计 / 文案的 AI 品牌语境(可选)</div>
          <textarea value={form.systemSnippet} onChange={(e) => set("systemSnippet", e.target.value)} rows={6}
            placeholder="描述品牌风格、受众、设计偏好等,AI 会据此调整输出语气与方向..."
            className={`${inputCls} resize-none`} />
        </div>
      </section>
    </div>
  );
}
