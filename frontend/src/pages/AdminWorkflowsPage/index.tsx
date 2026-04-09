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
  const [repairingWorkbench, setRepairingWorkbench] = useState(false);
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const reloadWorkflows = async () => {
    setLoading(true);
    try {
      const list = await apiClient.get<Workflow[]>('/api/admin/workflows');
      setWorkflows(list || []);
      setSelectedId((prev) => prev ?? (list?.[0]?.id ?? null));
    } finally {
      setLoading(false);
    }
  };

  const onRepairWorkbench = async () => {
    setRepairingWorkbench(true);
    try {
      await apiClient.post('/api/admin/workflows/repair-workbench', {});
      await reloadWorkflows();
    } finally {
      setRepairingWorkbench(false);
    }
  };

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

  const onDelete = async (wf: Workflow) => {
    if (!wf?.id) return;
    setDeletingId(wf.id);
    try {
      await apiClient.delete(`/api/admin/workflows/${encodeURIComponent(wf.id)}`);
      setWorkflows((prev) => {
        const next = prev.filter((x) => x.id !== wf.id);
        return next;
      });
      setSelectedId((prev) => {
        if (prev !== wf.id) return prev;
        const remain = workflows.filter((x) => x.id !== wf.id);
        return remain[0]?.id ?? null;
      });
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
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

      <main className="pt-20 px-6 pb-10 h-full flex flex-col h-screen">
        <div className="max-w-6xl mx-auto h-full flex flex-col">
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black">管理员后台 · 工作流编辑</h1>
                <p className="text-sm text-text-tertiary mt-1">
                  当前登录：{user?.email}
                </p>
              </div>
              <button
                type="button"
                disabled={repairingWorkbench}
                onClick={() => void onRepairWorkbench()}
                className="text-xs font-bold rounded-xl px-3 py-2 bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {repairingWorkbench ? '同步中…' : '同步工作台官方工作流'}
              </button>
            </div>
            <p className="text-sm text-text-tertiary mt-1">
              点击“同步工作台官方工作流”会把工作台默认能力更新到最新模板。
            </p>
          </div>

          <div className="flex-1 h-px flex gap-4">
            <section className="w-80 rounded-2xl border border-border bg-surface p-3">
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
                    <div
                      key={w.id}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                        selectedId === w.id
                          ? 'bg-primary-50 border-primary-200'
                          : 'bg-surface-secondary/40 border-transparent hover:border-border'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(w.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="text-sm font-extrabold">{w.name}</div>
                          <div className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2">
                            {w.description}
                          </div>
                          <div className="text-[10px] text-text-tertiary mt-1">
                            teamId: {w.teamId.slice(0, 8)}… · {w.enabled ? 'enabled' : 'disabled'}
                          </div>
                        </button>

                        <div className="shrink-0 pt-0.5">
                          {confirmDeleteId === w.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={deletingId === w.id}
                                onClick={() => void onDelete(w)}
                                className="text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-500/10 hover:bg-red-500/20 rounded-lg px-2 py-1 disabled:opacity-40"
                              >
                                {deletingId === w.id ? '删除中…' : '确认'}
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === w.id}
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[11px] font-semibold text-text-tertiary hover:text-text-secondary hover:bg-surface rounded-lg px-2 py-1 disabled:opacity-40"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(w.id)}
                              className="text-[11px] font-bold text-red-500 hover:text-red-600 bg-red-500/5 hover:bg-red-500/10 rounded-lg px-2 py-1"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="flex-1 h-full flex flex-col">
              {!selected || !draft ? (
                <div className="text-sm text-text-tertiary">选择一个工作流后开始编辑。</div>
              ) : (
                <div className="space-y-4 flex-1 h-px overflow-y-auto rounded-2xl border border-border bg-surface p-4">
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
                </div>
                
              )}
               <div className="flex justify-end pt-2">
                    <div className="flex items-center gap-2">
                      {selected ? (
                        confirmDeleteId === selected.id ? (
                          <>
                            <button
                              type="button"
                              disabled={deletingId === selected.id}
                              onClick={() => void onDelete(selected)}
                              className="px-4 py-2 rounded-2xl bg-red-600 text-white text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40"
                            >
                              {deletingId === selected.id ? '删除中…' : '确认删除'}
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === selected.id}
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-4 py-2 rounded-2xl border border-border bg-surface text-text-secondary text-sm font-bold hover:bg-surface-secondary transition-colors disabled:opacity-40"
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(selected.id)}
                            className="px-4 py-2 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm font-bold hover:bg-red-100 transition-colors"
                          >
                            删除
                          </button>
                        )
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void onSave()}
                        className="px-6 py-2 rounded-2xl bg-text-primary text-text-inverse text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        保存
                      </button>
                    </div>
                  </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

