import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/apiClient';
import CatSVG from '../components/CatSVG';
import CatMiniAvatar from '../components/CatMiniAvatar';
import type { CatColors } from '../components/CatSVG';

interface TeamCat {
  id: string;
  name: string;
  role: string;
  description?: string;
  catColors: CatColors;
  skills: any[];
  accent: string;
  templateId?: string;
  messages: string[];
}

interface TeamWorkflow {
  id: string;
  name: string;
  icon: string;
  description: string;
  steps: any[];
  trigger: string;
  cron?: string;
  enabled: boolean;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cats: TeamCat[];
  workflows: TeamWorkflow[];
  _count: { cats: number; workflows: number; workflowRuns: number };
}

const TeamDetailPage: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cats' | 'workflows' | 'history'>('cats');
  const [selectedCat, setSelectedCat] = useState<TeamCat | null>(null);

  const loadTeam = useCallback(async () => {
    if (!teamId) return;
    try {
      const data = await apiClient.get(`/api/teams/${teamId}`);
      setTeam(data);
    } catch (err) {
      console.error(err);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  }, [teamId, navigate]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const handleDeleteCat = async (catId: string, catName: string) => {
    if (!confirm(`确定要移除「${catName}」吗？`)) return;
    try {
      await apiClient.delete(`/api/cats/${catId}`);
      loadTeam();
    } catch {
      // toast shown by apiClient
    }
  };

  const handleDeleteWorkflow = async (wfId: string, wfName: string) => {
    if (!confirm(`确定要删除工作流「${wfName}」吗？`)) return;
    try {
      await apiClient.delete(`/api/workflows/${wfId}`);
      loadTeam();
    } catch {
      // toast shown by apiClient
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  if (!team) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-secondary to-primary-50/30">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-text-tertiary hover:text-text-secondary transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <span className="text-2xl">{team.icon || '🐱'}</span>
            <span className="text-lg font-bold text-text-primary">{team.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-tertiary">{user?.nickname}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Team info */}
        {team.description && <p className="text-text-secondary mb-6">{team.description}</p>}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-tertiary rounded-lg p-1 w-fit">
          {(['cats', 'workflows', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {tab === 'cats' ? `🐱 猫猫 (${team._count.cats})` : tab === 'workflows' ? `📋 工作流 (${team._count.workflows})` : `📊 执行历史`}
            </button>
          ))}
        </div>

        {/* === Cats Tab === */}
        {activeTab === 'cats' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {team.cats.map(cat => (
                <div
                  key={cat.id}
                  className="bg-surface rounded-xl border border-border p-4 hover:shadow-lg hover:border-hover transition-all cursor-pointer group relative"
                  onClick={() => setSelectedCat(cat)}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCat(cat.id, cat.name); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1"
                    title="移除猫猫"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                  <div className="flex justify-center mb-3">
                    <div className="w-20 h-20">
                      <CatSVG colors={cat.catColors} className="w-full h-full" />
                    </div>
                  </div>
                  <h4 className="font-semibold text-text-primary text-center">{cat.name}</h4>
                  <p className="text-xs text-center mt-1" style={{ color: cat.accent }}>{cat.role}</p>
                  <div className="flex flex-wrap gap-1 justify-center mt-2">
                    {cat.skills.slice(0, 3).map((skill: any) => (
                      <span key={skill.id} className="text-xs bg-surface-tertiary text-text-secondary px-2 py-0.5 rounded-full">{skill.icon} {skill.name}</span>
                    ))}
                    {cat.skills.length > 3 && <span className="text-xs text-text-tertiary">+{cat.skills.length - 3}</span>}
                  </div>
                </div>
              ))}

              {/* Add cat card */}
              <div
                className="bg-surface/50 rounded-xl border-2 border-dashed border-border-strong p-4 hover:border-primary-400 hover:bg-primary-50/50 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px]"
                onClick={() => navigate(`/teams/${teamId}/cats/new`)}
              >
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-2xl mb-2">+</div>
                <span className="text-sm font-medium text-text-secondary">添加猫猫</span>
              </div>
            </div>
          </div>
        )}

        {/* === Workflows Tab === */}
        {activeTab === 'workflows' && (
          <div>
            <div className="space-y-3">
              {team.workflows.map(wf => (
                <div key={wf.id} className="bg-surface rounded-xl border border-border p-5 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{wf.icon}</span>
                      <div>
                        <h4 className="font-semibold text-text-primary">{wf.name}</h4>
                        <p className="text-sm text-text-secondary mt-0.5">{wf.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-surface-tertiary text-text-secondary px-2 py-1 rounded-full">{wf.steps.length} 步骤</span>
                      {wf.trigger === 'cron' && wf.cron && <span className="text-xs bg-accent-100 text-accent-600 px-2 py-1 rounded-full">⏰ {wf.cron}</span>}
                      <button
                        onClick={() => handleDeleteWorkflow(wf.id, wf.name)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {/* Step preview */}
                  <div className="flex items-center gap-2 mt-3 overflow-x-auto">
                    {wf.steps.map((step: any, i: number) => {
                      const cat = team.cats.find(c => c.id === step.agentId || c.templateId === step.agentId);
                      return (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-text-tertiary text-xs">→</span>}
                          <div className="flex items-center gap-1 bg-surface-secondary px-2 py-1 rounded-lg shrink-0">
                            {cat && <div className="w-5 h-5"><CatMiniAvatar colors={cat.catColors} size={16} /></div>}
                            <span className="text-xs text-text-secondary">{step.action?.substring(0, 15) || step.skillId}</span>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Add workflow */}
            <button
              onClick={() => navigate(`/teams/${teamId}/workflows/new`)}
              className="w-full mt-4 py-4 bg-surface/50 border-2 border-dashed border-border-strong rounded-xl text-text-secondary hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-all font-medium"
            >
              + 创建工作流
            </button>
          </div>
        )}

        {/* === History Tab === */}
        {activeTab === 'history' && (
          <div className="text-center py-16 text-text-tertiary">
            <div className="text-4xl mb-3">📊</div>
            <p>执行工作流后，记录会出现在这里</p>
          </div>
        )}
      </main>

      {/* Cat Detail Modal */}
      {selectedCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCat(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl p-8 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-24 h-24"><CatSVG colors={selectedCat.catColors} className="w-full h-full" /></div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary">{selectedCat.name}</h3>
                  <span className="text-sm font-medium" style={{ color: selectedCat.accent }}>{selectedCat.role}</span>
                  <p className="text-sm text-text-secondary mt-1">{selectedCat.description}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCat(null)} className="text-text-tertiary hover:text-text-secondary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <h4 className="font-semibold text-text-primary mb-3">技能列表</h4>
            <div className="space-y-2">
              {selectedCat.skills.map((skill: any) => (
                <div key={skill.id} className="bg-surface-secondary rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span>{skill.icon}</span>
                    <span className="font-medium text-sm text-text-primary">{skill.name}</span>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{skill.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setSelectedCat(null); navigate(`/teams/${teamId}/cats/${selectedCat.id}`); }}
                className="flex-1 py-2 bg-primary-500 text-text-inverse text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
              >
                编辑猫猫
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamDetailPage;
