import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatSVG from '../../components/CatSVG';
import CatLogo from "../../components/CatLogo";
import type { Assistant } from '../../data/types';
import { workflows } from '../../data/workflows';
import {
  officialCatsCommunity,
  legacyWorkflowAgentLabels,
} from "../../data/officialCatsCommunity";
import { OFFICIAL_BRAND_CAT_COLORS } from "../../data/officialBrandCat";
import { AppIcon } from "../../components/icons";

const allCats: Assistant[] = officialCatsCommunity;

const agentNameMap: Record<string, string> = {
  ...Object.fromEntries(officialCatsCommunity.map((c) => [c.id, c.name])),
  ...legacyWorkflowAgentLabels,
};

function resolveWorkflowAgent(agentId: string): Assistant | null {
  const hit = officialCatsCommunity.find((c) => c.id === agentId);
  if (hit) return hit;
  const label = legacyWorkflowAgentLabels[agentId];
  if (!label) return null;
  return {
    id: agentId,
    name: label,
    role: "",
    description: "",
    accent: "#8DB889",
    systemPrompt: "",
    skills: [],
    item: "clipboard",
    catColors: OFFICIAL_BRAND_CAT_COLORS,
    messages: [],
  };
}

/* ── 工作流主题色 ── */
const workflowColors: Record<string, string> = {
  'web-page-builder': '#5C6BC0',
};

/* ── Tab types ── */
type Tab = "cats" | "workflows";

function stepCapabilityLabel(skillId?: string): string {
  if (skillId === "aigc") return "AIGC";
  return skillId ? `${skillId}` : "—";
}

const CommunityPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('cats');
  const [selectedCat, setSelectedCat] = useState<Assistant | null>(null);
  const [expandedWf, setExpandedWf] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; iconSymbol: string; count: number }[] = [
    { id: "cats", label: "官方猫猫", iconSymbol: "Cat", count: allCats.length },
    {
      id: "workflows",
      label: "官方工作流",
      iconSymbol: "RefreshCw",
      count: workflows.length,
    },
  ];

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => navigate("/")}
          >
            <CatLogo
              size={40}
              className="group-hover:rotate-12 transition-transform"
            />
            <span className="text-xl font-bold tracking-tight">CuCaTopia</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="text-sm font-medium text-text-tertiary hover:text-text-primary transition-colors"
            >
              首页
            </button>
            <button
              onClick={() => navigate("/login")}
              className="px-5 py-2 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              开始使用
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative py-16 md:py-20">
        <div className="absolute top-0 left-1/4 w-80 h-80 bg-primary-100/30 rounded-full blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm font-bold text-primary-500 uppercase tracking-widest mb-4">
            COMMUNITY
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            猫猫专家阵容
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            17 只官方猫猫各有岗位角色，统一围绕 AIGC 协作；执行管道当前为占位，便于后续接入真实生成能力。
          </p>
        </div>
      </section>

      {/* Tab Bar */}
      <div className="sticky top-16 z-40 bg-surface/90 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  tab === t.id
                    ? "border-primary-500 text-primary-600"
                    : "border-transparent text-text-tertiary hover:text-text-primary"
                }`}
              >
                <AppIcon symbol={t.iconSymbol} size={18} className="text-primary-600" />
                <span>{t.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tab === t.id
                      ? "bg-primary-100 text-primary-600"
                      : "bg-surface-secondary text-text-tertiary"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* ═══ Cats Tab ═══ */}
        {tab === "cats" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {allCats.map((cat) => (
              <div
                key={cat.id}
                onClick={() =>
                  setSelectedCat(selectedCat?.id === cat.id ? null : cat)
                }
                className={`rounded-[24px] border p-6 cursor-pointer transition-all group ${
                  selectedCat?.id === cat.id
                    ? "border-primary-300 bg-primary-50/50 shadow-lg ring-2 ring-primary-200"
                    : "border-border bg-surface hover:border-border-strong hover:shadow-lg"
                }`}
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-16 h-16 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CatSVG colors={cat.catColors} size={60} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-text-primary">
                      {cat.name}
                    </h3>
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white mt-1"
                      style={{ background: cat.accent }}
                    >
                      {cat.role}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-text-secondary font-medium leading-relaxed mb-4 line-clamp-2">
                  {cat.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200 text-[11px] font-bold text-primary-700">
                    ✨ AIGC 协作
                  </span>
                </div>

                {/* Expanded detail */}
                {selectedCat?.id === cat.id && (
                  <div className="mt-5 pt-5 border-t border-border space-y-4">
                    {/* Messages */}
                    <div>
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">
                        口头禅
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.messages.map((msg, i) => (
                          <span
                            key={i}
                            className="px-3 py-1.5 rounded-full bg-surface-secondary border border-border text-xs font-medium text-text-secondary"
                          >
                            &ldquo;{msg}&rdquo;
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-2">
                        AIGC 说明
                      </p>
                      <p className="text-xs text-text-secondary font-medium leading-relaxed p-3 rounded-xl bg-surface-secondary/60 border border-border">
                        不再按「技能」拆分能力；该猫猫在团队内以岗位角色参与工作流，统一走 AIGC 执行入口（当前占位）。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ Workflows Tab ═══ */}
        {tab === "workflows" && (
          <div>
            <p className="text-text-secondary font-medium mb-8 max-w-2xl">
              官方示意工作流：按猫猫岗位串联，多步统一走 AIGC 占位执行，便于后续接入真实生成管道。
            </p>
            <div className="space-y-5">
              {workflows.map((wf) => {
                const isExpanded = expandedWf === wf.id;
                const color = workflowColors[wf.id] ?? "#8DB889";
                const involvedCats = [
                  ...new Set(wf.steps.map((s) => s.agentId)),
                ]
                  .map((id) => resolveWorkflowAgent(id))
                  .filter(Boolean) as Assistant[];

                return (
                  <div
                    key={wf.id}
                    className={`rounded-[24px] border bg-surface transition-all ${
                      isExpanded
                        ? "border-border-strong shadow-lg"
                        : "border-border hover:border-border-strong hover:shadow-md"
                    }`}
                  >
                    {/* Header */}
                    <div
                      className="p-6 cursor-pointer"
                      onClick={() => setExpandedWf(isExpanded ? null : wf.id)}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 text-white"
                          style={{ background: color }}
                        >
                          <AppIcon
                            symbol={wf.id === "web-page-builder" ? "Globe" : "ClipboardList"}
                            size={24}
                            className="text-white"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-black text-text-primary mb-1">
                            {wf.name}
                          </h4>
                          <p className="text-sm text-text-secondary font-medium leading-relaxed line-clamp-2">
                            {wf.description}
                          </p>
                          {/* Meta badges */}
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-secondary border border-border text-text-tertiary">
                              {wf.steps.length} 步骤
                            </span>
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-secondary border border-border text-text-tertiary">
                              {involvedCats.length} 只猫协作
                            </span>
                            {wf.scheduled && (
                              <span
                                className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white"
                                style={{ background: color }}
                              >
                                ⏰ {wf.cron}
                              </span>
                            )}
                            {/* Participating cat avatars */}
                            <div className="flex -space-x-1.5 ml-1">
                              {involvedCats.map((cat) => (
                                <div
                                  key={cat.id}
                                  className="w-6 h-6 rounded-full overflow-hidden border-2 border-surface bg-surface-secondary flex items-center justify-center"
                                  title={cat.name}
                                >
                                  <CatSVG colors={cat.catColors} size={18} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-text-tertiary shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-6 pb-6 pt-0">
                        {/* Steps flow */}
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest mb-4">
                          工作流步骤
                        </p>
                        <div className="space-y-0">
                          {wf.steps.map((step, i) => {
                            const cat = resolveWorkflowAgent(step.agentId);
                            const cap = stepCapabilityLabel(step.skillId);
                            return (
                              <div key={i} className="flex gap-4">
                                {/* Timeline line */}
                                <div className="flex flex-col items-center">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                                    style={{ background: color }}
                                  >
                                    {i + 1}
                                  </div>
                                  {i < wf.steps.length - 1 && (
                                    <div
                                      className="w-0.5 flex-1 min-h-[20px]"
                                      style={{ background: `${color}30` }}
                                    />
                                  )}
                                </div>
                                {/* Step content */}
                                <div
                                  className={`flex-1 pb-5 ${i === wf.steps.length - 1 ? "pb-0" : ""}`}
                                >
                                  <div className="p-4 rounded-xl bg-surface-secondary/40 border border-border">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-6 h-6 rounded-full overflow-hidden border border-border bg-surface flex items-center justify-center">
                                          <CatSVG
                                            colors={
                                              cat?.catColors ??
                                              OFFICIAL_BRAND_CAT_COLORS
                                            }
                                            size={18}
                                          />
                                        </div>
                                        <span
                                          className="text-xs font-bold"
                                          style={{
                                            color: cat?.accent ?? "#8DB889",
                                          }}
                                        >
                                          {agentNameMap[step.agentId] ??
                                            step.agentId}
                                        </span>
                                      </div>
                                      <span className="text-text-tertiary text-xs">
                                        ·
                                      </span>
                                      <span className="text-[11px] font-bold text-text-secondary">
                                        {cap}
                                      </span>
                                      {step.inputFrom &&
                                        (() => {
                                          // 优先用 stepId 找来源步骤的猫咪名
                                          const sourceStep = wf.steps.find(
                                            (s) => s.stepId === step.inputFrom,
                                          );
                                          const label = sourceStep
                                            ? (agentNameMap[
                                                sourceStep.agentId
                                              ] ?? sourceStep.agentId)
                                            : (agentNameMap[step.inputFrom] ??
                                              step.inputFrom);
                                          return (
                                            <span className="text-[9px] font-bold uppercase bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded ml-auto">
                                              ← {label}
                                            </span>
                                          );
                                        })()}
                                    </div>
                                    <p className="text-sm text-text-primary font-medium">
                                      {step.action}
                                    </p>
                                    {/* Step params preview */}
                                    {step.params && step.params.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {step.params.map((p) => (
                                          <span
                                            key={p.key}
                                            className="px-2 py-0.5 rounded text-[9px] font-bold bg-surface-tertiary text-text-tertiary border border-border"
                                          >
                                            {p.label}
                                            {p.required ? " *" : ""}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <CatLogo size={36} />
          </div>
          <p className="text-text-tertiary text-xs font-medium">
            &copy; 2026 CuCaTopia.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default CommunityPage;
