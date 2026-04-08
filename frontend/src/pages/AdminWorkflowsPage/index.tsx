import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';

type Workflow = {
  id: string;
  teamId: string;
  name: string;
  icon: string;
  description: string;
  placeholder?: string | null;
  steps: any;
  enabled: boolean;
  updatedAt?: string;
};

type Step = {
  stepId?: string;
  agentId: string;
  inputFrom?: string;
  systemPrompt?: string;
};

function parseSteps(steps: any): Step[] {
  if (Array.isArray(steps)) return steps as Step[];
  if (typeof steps === 'string') {
    try {
      const v = JSON.parse(steps);
      return Array.isArray(v) ? (v as Step[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function AdminWorkflowsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => workflows.find((w) => w.id === selectedId) ?? null,
    [selectedId, workflows],
  );

  const [draft, setDraft] = useState<{
    name: string;
    icon: string;
    description: string;
    placeholder: string;
    enabled: boolean;
    steps: Step[];
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .get<Workflow[]>('/api/admin/workflows')
      .then((list) => {
        if (!mounted) return;
        setWorkflows(list || []);
        setSelectedId((prev) => prev ?? (list?.[0]?.id ?? null));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      name: selected.name,
      icon: selected.icon,
      description: selected.description ?? '',
      placeholder: selected.placeholder ?? '',
      enabled: !!selected.enabled,
      steps: parseSteps(selected.steps).map((s) => ({
        stepId: s.stepId,
        agentId: s.agentId,
        inputFrom: s.inputFrom,
        systemPrompt: (s as any).systemPrompt ?? (s as any).system_prompt ?? '',
      })),
    });
  }, [selected]);

  const onSave = async () => {
    if (!selected || !draft) return;
    const payload = {
      name: draft.name,
      icon: draft.icon,
      description: draft.description,
      placeholder: draft.placeholder,
      enabled: draft.enabled,
      steps: draft.steps.map((s) => ({
        stepId: s.stepId,
        agentId: s.agentId,
        inputFrom: s.inputFrom,
        systemPrompt: (s.systemPrompt || '').trim(),
      })),
    };
    const updated = await apiClient.put<Workflow>(
      `/api/admin/workflows/${encodeURIComponent(selected.id)}`,
      payload,
    );
    setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
  };

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <Navbar
        variant="fixed"
        scrolled={true}
        logoSize={44}
        navLinks={[
          { id: 'admin', label: '管理员后台', href: '/admin/workflows', activeClass: 'text-primary-500' },
        ]}
        activeNavId="admin"
      />

      <main className="pt-20 px-6 pb-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4">
            <h1 className="text-2xl font-black">管理员后台 · 工作流编辑</h1>
            <p className="text-sm text-text-tertiary mt-1">
              当前登录：{user?.email}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            <section className="rounded-2xl border border-border bg-surface p-3">
              <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest px-2 py-2">
                工作流
              </div>
              {loading ? (
                <div className="text-sm text-text-tertiary px-2 py-4">加载中…</div>
              ) : workflows.length === 0 ? (
                <div className="text-sm text-text-tertiary px-2 py-4">暂无工作流</div>
              ) : (
                <div className="space-y-1">
                  {workflows.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSelectedId(w.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                        selectedId === w.id
                          ? 'bg-primary-50 border-primary-200'
                          : 'bg-surface-secondary/40 border-transparent hover:border-border'
                      }`}
                    >
                      <div className="text-sm font-extrabold">{w.name}</div>
                      <div className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2">
                        {w.description}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1">
                        teamId: {w.teamId.slice(0, 8)}… · {w.enabled ? 'enabled' : 'disabled'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              {!selected || !draft ? (
                <div className="text-sm text-text-tertiary">选择一个工作流后开始编辑。</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <div className="text-xs font-bold text-text-tertiary">名称</div>
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft((p) => (p ? { ...p, name: e.target.value } : p))}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <div className="text-xs font-bold text-text-tertiary">图标</div>
                      <input
                        value={draft.icon}
                        onChange={(e) => setDraft((p) => (p ? { ...p, icon: e.target.value } : p))}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <div className="text-xs font-bold text-text-tertiary">描述</div>
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((p) => (p ? { ...p, description: e.target.value } : p))
                      }
                      rows={3}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-xs font-bold text-text-tertiary">输入占位符</div>
                    <input
                      value={draft.placeholder}
                      onChange={(e) =>
                        setDraft((p) => (p ? { ...p, placeholder: e.target.value } : p))
                      }
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) =>
                        setDraft((p) => (p ? { ...p, enabled: e.target.checked } : p))
                      }
                    />
                    启用
                  </label>

                  <div className="pt-2">
                    <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                      Steps（每步可编辑 system_prompt）
                    </div>
                    <div className="space-y-3">
                      {draft.steps.map((s, idx) => (
                        <div key={idx} className="rounded-2xl border border-border bg-surface-secondary/30 p-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <label className="space-y-1">
                              <div className="text-[11px] font-bold text-text-tertiary">stepId</div>
                              <input
                                value={s.stepId ?? ''}
                                onChange={(e) =>
                                  setDraft((p) => {
                                    if (!p) return p;
                                    const next = [...p.steps];
                                    next[idx] = { ...next[idx], stepId: e.target.value || undefined };
                                    return { ...p, steps: next };
                                  })
                                }
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                              />
                            </label>
                            <label className="space-y-1">
                              <div className="text-[11px] font-bold text-text-tertiary">agentId（TeamCat.id）</div>
                              <input
                                value={s.agentId}
                                onChange={(e) =>
                                  setDraft((p) => {
                                    if (!p) return p;
                                    const next = [...p.steps];
                                    next[idx] = { ...next[idx], agentId: e.target.value };
                                    return { ...p, steps: next };
                                  })
                                }
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono"
                              />
                            </label>
                            <label className="space-y-1">
                              <div className="text-[11px] font-bold text-text-tertiary">inputFrom</div>
                              <input
                                value={s.inputFrom ?? ''}
                                onChange={(e) =>
                                  setDraft((p) => {
                                    if (!p) return p;
                                    const next = [...p.steps];
                                    next[idx] = { ...next[idx], inputFrom: e.target.value || undefined };
                                    return { ...p, steps: next };
                                  })
                                }
                                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                              />
                            </label>
                          </div>

                          <label className="space-y-1 block mt-2">
                            <div className="text-[11px] font-bold text-text-tertiary">system_prompt（可留空=用默认脚本）</div>
                            <textarea
                              value={s.systemPrompt ?? ''}
                              onChange={(e) =>
                                setDraft((p) => {
                                  if (!p) return p;
                                  const next = [...p.steps];
                                  next[idx] = { ...next[idx], systemPrompt: e.target.value };
                                  return { ...p, steps: next };
                                })
                              }
                              rows={6}
                              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono leading-relaxed"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => void onSave()}
                      className="px-6 py-2 rounded-2xl bg-text-primary text-text-inverse text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

