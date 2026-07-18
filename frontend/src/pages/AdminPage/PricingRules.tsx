// @ts-nocheck
/**
 * PricingRules —— 管理员后台「定价规则」面板。
 *
 * 可运行时调整(无需重启,DB 写入后立即生效):
 *   - 汇率 / 注册奖励 / 邀请奖励 / 邀请上限
 *   - AI 单场景单价(喵币/次)
 *   - 充值套餐(coins + yuan)
 *   - 兑换码档位(与套餐对齐)
 * 任何字段留空 → 回退到代码默认值。
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../utils/apiClient";

type CostKey =
  | "image_generate" | "image_regenerate" | "image_lineart"
  | "material_combo_per_image" | "style_mutate_per_image" | "outfit_styling"
  | "chat_text" | "workflow_step" | "inspiration_analyze";

const COST_LABEL: Record<CostKey, string> = {
  image_generate: "文生图",
  image_regenerate: "重生成",
  image_lineart: "线稿",
  material_combo_per_image: "材料组合",
  style_mutate_per_image: "款式裂变",
  outfit_styling: "穿搭效果",
  chat_text: "文本对话",
  workflow_step: "工作流步骤",
  inspiration_analyze: "灵感分析",
};

const TIER_LABEL: Record<string, string> = {
  basic: "基础包(B-)",
  plus: "进阶包(P-)",
  pro: "豪华包(R-)",
};

type FormState = {
  yuanRate: string;
  signupBonus: string;
  inviteReward: string;
  inviteMax: string;
  costs: Record<string, string>;
  packages: { id: string; name: string; coins: string; yuan: string }[];
  redeemTiers: Record<string, { name: string; coins: string; yuan: string }>;
};

const EMPTY_FORM: FormState = {
  yuanRate: "",
  signupBonus: "",
  inviteReward: "",
  inviteMax: "",
  costs: {},
  packages: [],
  redeemTiers: {},
};

export default function PricingRules() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const num = (s: string) => (s === "" ? NaN : Number(s));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiClient.get<{
        effective: any; defaults: any; costKeys: string[]; tierKeys: string[];
      }>("/api/admin/pricing");
      const eff = d.effective || {};
      const set = (v: any) => (v == null ? "" : String(v));
      const f: FormState = {
        yuanRate: set(eff.yuanRate),
        signupBonus: set(eff.signupBonus),
        inviteReward: set(eff.inviteReward),
        inviteMax: set(eff.inviteMax),
        costs: {},
        packages: (eff.packages || []).map((p: any) => ({
          id: p.id, name: p.name, coins: set(p.coins), yuan: set(p.yuan),
        })),
        redeemTiers: {},
      };
      for (const k of eff.costs ? Object.keys(eff.costs) : []) f.costs[k] = set(eff.costs[k]);
      for (const k of Object.keys(eff.redeemTiers || {})) {
        const t = eff.redeemTiers[k];
        f.redeemTiers[k] = { name: t.name, coins: set(t.coins), yuan: set(t.yuan) };
      }
      setForm(f);
      setLoaded(true);
    } catch (e) {
      setError(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setCost = (k: string, v: string) => {
    setForm((f) => ({ ...f, costs: { ...f.costs, [k]: v } }));
    setDirty(true);
    setMsg(null);
  };
  const setPkg = (i: number, key: "name" | "coins" | "yuan", v: string) => {
    setForm((f) => ({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, [key]: v } : p)) }));
    setDirty(true);
    setMsg(null);
  };
  const setTier = (k: string, key: "name" | "coins" | "yuan", v: string) => {
    setForm((f) => ({ ...f, redeemTiers: { ...f.redeemTiers, [k]: { ...f.redeemTiers[k], [key]: v } } }));
    setDirty(true);
    setMsg(null);
  };
  const setScalar = (key: keyof FormState, v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    setDirty(true);
    setMsg(null);
  };

  const validate = (): string | null => {
    const { yuanRate, signupBonus, inviteReward, inviteMax, packages, redeemTiers } = form;
    if (yuanRate !== "" && num(yuanRate) <= 0) return "汇率必须为正数";
    for (const [k, v] of Object.entries(form.costs)) if (v !== "" && (!Number.isInteger(num(v)) || num(v) < 0)) return `单价「${COST_LABEL[k] || k}」必须为非负整数`;
    if (signupBonus !== "" && (!Number.isInteger(num(signupBonus)) || num(signupBonus) < 0)) return "注册奖励必须为非负整数";
    if (inviteReward !== "" && (!Number.isInteger(num(inviteReward)) || num(inviteReward) < 0)) return "邀请奖励必须为非负整数";
    if (inviteMax !== "" && (!Number.isInteger(num(inviteMax)) || num(inviteMax) < 0)) return "邀请上限必须为非负整数";
    for (const [i, p] of packages.entries()) {
      if (!p.name.trim()) return `套餐 ${i + 1} 名称不能为空`;
      if (p.coins === "" || !Number.isInteger(num(p.coins)) || num(p.coins) <= 0) return `套餐「${p.name || i + 1}」喵币必须为正整数`;
      if (p.yuan === "" || !Number.isInteger(num(p.yuan)) || num(p.yuan) <= 0) return `套餐「${p.name || i + 1}」价格必须为正整数(元)`;
    }
    for (const [k, t] of Object.entries(redeemTiers)) {
      if (!t.name.trim()) return `兑换档位「${k}」名称不能为空`;
      if (t.coins === "" || !Number.isInteger(num(t.coins)) || num(t.coins) <= 0) return `兑换档位「${k}」喵币必须为正整数`;
      if (t.yuan === "" || !Number.isInteger(num(t.yuan)) || num(t.yuan) <= 0) return `兑换档位「${k}」价格必须为正整数(元)`;
    }
    return null;
  };

  // 构造提交值:空字段不传(回退默认值)
  const buildPayload = () => {
    const o: any = {};
    if (form.yuanRate !== "") o.yuanRate = num(form.yuanRate);
    if (form.signupBonus !== "") o.signupBonus = num(form.signupBonus);
    if (form.inviteReward !== "") o.inviteReward = num(form.inviteReward);
    if (form.inviteMax !== "") o.inviteMax = num(form.inviteMax);
    const costs: any = {};
    for (const [k, v] of Object.entries(form.costs)) if (v !== "") costs[k] = num(v);
    if (Object.keys(costs).length) o.costs = costs;
    o.packages = form.packages.map((p) => ({
      id: p.id, name: p.name.trim(), coins: num(p.coins), yuan: num(p.yuan),
    }));
    const tiers: any = {};
    for (const [k, t] of Object.entries(form.redeemTiers)) {
      tiers[k] = { name: t.name.trim(), coins: num(t.coins), yuan: num(t.yuan) };
    }
    o.redeemTiers = tiers;
    return o;
  };

  const save = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await apiClient.put("/api/admin/pricing", { value: buildPayload() });
      setMsg("已保存,新规则立即生效");
      setDirty(false);
      await load();
    } catch (e) {
      setError(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    setForm(EMPTY_FORM);
    setDirty(true);
    setMsg(null);
    setError(null);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            定价规则
            {loaded && dirty && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">有未保存修改</span>}
          </h2>
          <p className="text-xs text-text-tertiary mt-0.5">调整即时生效;留空的字段将回退到代码内默认值</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetDefaults} disabled={saving}
            className="px-3 py-1.5 rounded-lg text-[12px] border border-border text-text-secondary hover:bg-surface-secondary transition-colors disabled:opacity-50">
            恢复默认
          </button>
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="px-3 py-1.5 rounded-lg text-[12px] bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saving ? "保存中…" : "保存规则"}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* 加载态 */}
        {!loaded && loading && (
          <div className="flex items-center gap-2 py-8 text-text-tertiary">
            <div className="w-4 h-4 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            <span className="text-sm">加载当前定价…</span>
          </div>
        )}

        {loaded && (
          <>
            {/* 标量:汇率 / 奖励 / 上限 */}
            <Section title="基础参数">
              <Field label="汇率(1 元 = ? 喵币)" hint="基础包基准,仅作参考换算">
                <input type="number" min="1" value={form.yuanRate} onChange={(e) => setScalar("yuanRate", e.target.value)}
                  placeholder="100"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
              </Field>
              <Field label="注册奖励(喵币)" hint="新用户赠送">
                <input type="number" min="0" value={form.signupBonus} onChange={(e) => setScalar("signupBonus", e.target.value)}
                  placeholder="100" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
              </Field>
              <Field label="邀请奖励(喵币/人)" hint="邀请人可获得">
                <input type="number" min="0" value={form.inviteReward} onChange={(e) => setScalar("inviteReward", e.target.value)}
                  placeholder="100" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
              </Field>
              <Field label="邀请奖励上限(人)" hint="最多得多少次邀请奖励">
                <input type="number" min="0" value={form.inviteMax} onChange={(e) => setScalar("inviteMax", e.target.value)}
                  placeholder="10" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
              </Field>
            </Section>

            {/* AI 单价 */}
            <Section title="AI 单价(喵币/次)">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(Object.keys(COST_LABEL) as CostKey[]).map((k) => (
                  <Field key={k} label={COST_LABEL[k]}>
                    <input type="number" min="0" value={form.costs[k] ?? ""} onChange={(e) => setCost(k, e.target.value)}
                      placeholder="默认" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
                  </Field>
                ))}
              </div>
            </Section>

            {/* 充值套餐 */}
            <Section title="充值套餐" hint="点击下方卡片区域可直接编辑(序号即为档位)">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {form.packages.map((p, i) => (
                  <div key={p.id} className="rounded-xl border border-border bg-surface-secondary/40 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">套餐 {i + 1}</div>
                    <input value={p.name} onChange={(e) => setPkg(i, "name", e.target.value)} placeholder="名称(如 基础包)"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
                    <div className="flex gap-2">
                      <input type="number" min="1" value={p.coins} onChange={(e) => setPkg(i, "coins", e.target.value)}
                        placeholder="喵币" className="inp flex-1" />
                      <input type="number" min="1" value={p.yuan} onChange={(e) => setPkg(i, "yuan", e.target.value)}
                        placeholder="¥" className="inp w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 兑换码档位 */}
            <Section title="兑换码档位" hint="与套餐对齐,用于官方渠道售卖的兑换码">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.entries(form.redeemTiers).map(([k, t]) => (
                  <div key={k} className="rounded-xl border border-border bg-surface-secondary/40 p-3 space-y-2">
                    <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{TIER_LABEL[k] || k}</div>
                    <input value={t.name} onChange={(e) => setTier(k, "name", e.target.value)} placeholder="名称"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none" />
                    <div className="flex gap-2">
                      <input type="number" min="1" value={t.coins} onChange={(e) => setTier(k, "coins", e.target.value)}
                        placeholder="喵币" className="inp flex-1" />
                      <input type="number" min="1" value={t.yuan} onChange={(e) => setTier(k, "yuan", e.target.value)}
                        placeholder="¥" className="inp w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{error}</div>
        )}
        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{msg}</div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        {hint && <div className="text-[11px] text-text-tertiary mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">{label}</label>
      {children}
      {hint && <div className="text-[10px] text-text-tertiary mt-0.5">{hint}</div>}
    </div>
  );
}
