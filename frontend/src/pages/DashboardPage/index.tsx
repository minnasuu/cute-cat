import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/apiClient';
import CatMiniAvatar from '../../components/CatMiniAvatar';
import CatLogo from '../../components/CatLogo';
import Navbar from '../../components/Navbar';
import UserProfileDropdown from './UserProfileDropdown';

interface Team {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cats: Array<{ id: string; name: string; role: string; catColors: any; accent: string }>;
  _count: { cats: number; workflows: number; workflowRuns: number };
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，有我们呢';
  if (hour < 9) return '早上好呀';
  if (hour < 12) return '上午好呀';
  if (hour < 14) return '中午好呀';
  if (hour < 18) return '下午好呀';
  if (hour < 24) return '晚上好呀';
  return '夜深了，有我们呢';
};

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      const data = await apiClient.get('/api/teams');
      setTeams(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      await apiClient.post('/api/teams', { name: newTeamName, description: newTeamDesc });
      setShowCreate(false);
      setNewTeamName('');
      setNewTeamDesc('');
      loadTeams();
    } catch {
      // toast shown by apiClient
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`确定要删除团队「${teamName}」吗？此操作不可恢复。`)) return;
    try {
      await apiClient.delete(`/api/teams/${teamId}`);
      loadTeams();
    } catch {
      // toast shown by apiClient
    }
  };

  const totalCats = teams.reduce((sum, t) => sum + t._count.cats, 0);
  const totalWorkflows = teams.reduce((sum, t) => sum + t._count.workflows, 0);
  const totalRuns = teams.reduce((sum, t) => sum + t._count.workflowRuns, 0);

  return (
    <div className="min-h-screen bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* Navbar */}
      <Navbar
        rightSlot={user ? (
          <UserProfileDropdown
            user={user}
            teamCount={teams.length}
            totalCats={totalCats}
            totalWorkflows={totalWorkflows}
            onLogout={logout}
          />
        ) : undefined}
      />

      <main className="max-w-6xl mx-auto px-6" style={{minHeight: 'calc(100vh - 133px)'}}>
        {/* Hero welcome */}
        <section className="relative py-12 md:py-16">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">
            喵～ {user?.nickname}，{getGreeting()}！🐾
          </h1>
          <p className="text-text-secondary font-medium">你的猫猫们已经准备好大干一场啦</p>
        </section>

        {/* Stats — LandingPage style minimal cards */}
        <section className="py-6 mb-8 border-y border-border bg-surface-secondary/30 -mx-6 px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: '我的团队', val: String(teams.length) },
              { label: '猫猫总数', val: String(totalCats) },
              { label: '工作流', val: String(totalWorkflows) },
              { label: '总执行次数', val: String(totalRuns) },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-black text-text-primary">{s.val}</div>
                <div className="text-xs font-bold text-text-tertiary uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Teams Section */}
        <section className="pb-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-sm font-bold text-primary-500 uppercase tracking-widest mb-1">TEAMS</p>
              <h2 className="text-2xl font-black tracking-tight">我的团队</h2>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all"
            >
              + 创建团队
            </button>
          </div>

          {loading ? (
            <div className="text-center py-20 text-text-tertiary font-medium">加载中...</div>
          ) : teams.length === 0 ? (
            <div className="text-center py-20 rounded-[32px] border border-border bg-surface-secondary/50">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center">
                <CatLogo size={48} />
              </div>
              <h3 className="text-xl font-black text-text-primary mb-2">还没有团队</h3>
              <p className="text-text-secondary font-medium mb-8 max-w-sm mx-auto">创建你的第一个猫猫团队，开始 AI 工作流之旅</p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-10 py-4 text-lg font-bold bg-primary-500 text-text-inverse rounded-2xl hover:bg-primary-600 transition-all"
              >
                创建第一个团队
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {teams.map(team => (
                <div
                  key={team.id}
                  className="rounded-[24px] border border-border p-6 bg-surface hover:border-border-strong hover:shadow-lg transition-all cursor-pointer group"
                  onClick={() => navigate(`/teams/${team.id}`)}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h3 className="text-lg font-black text-text-primary group-hover:text-primary-600 transition-colors">{team.name}</h3>
                      {team.description && <p className="text-sm text-text-secondary font-medium mt-1 line-clamp-1">{team.description}</p>}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id, team.name); }}
                      className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1.5 rounded-lg hover:bg-danger-50"
                      title="删除团队"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>

                  {/* Cat avatars */}
                  <div className="flex items-center gap-1.5 mb-4">
                    {team.cats.slice(0, 6).map(cat => (
                      <div key={cat.id} className="w-9 h-9 rounded-full bg-surface-secondary border-2 border-surface shadow-sm overflow-hidden flex items-center justify-center">
                        <CatMiniAvatar colors={cat.catColors} size={28} />
                      </div>
                    ))}
                    {team._count.cats > 6 && (
                      <div className="w-9 h-9 rounded-full bg-surface-tertiary border-2 border-surface shadow-sm flex items-center justify-center text-xs text-text-secondary font-bold">
                        +{team._count.cats - 6}
                      </div>
                    )}
                    {team._count.cats === 0 && <span className="text-xs text-text-tertiary font-medium">还没有猫猫</span>}
                  </div>

                  {/* Stats pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-xs font-bold text-text-secondary">
                      🐱 {team._count.cats} 只猫猫
                    </span>
                    <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-xs font-bold text-text-secondary">
                      📋 {team._count.workflows} 个工作流
                    </span>
                    <span className="px-3 py-1 rounded-full bg-surface-secondary border border-border text-xs font-bold text-text-secondary">
                      ▶️ {team._count.workflowRuns} 次执行
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer — same as LandingPage */}
      <footer className="py-4 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">&copy; 2026 CuCaTopia.</p>
        </div>
      </footer>

      {/* Create Team Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-surface rounded-[28px] shadow-2xl p-8 w-full max-w-md mx-4 border border-border" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-black text-text-primary mb-6">创建新团队</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">团队名称</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="例如：我的内容团队"
                  autoFocus
                  className="w-full px-4 py-3.5 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-tertiary uppercase tracking-widest mb-2">
                  团队描述 <span className="normal-case tracking-normal font-medium">(可选)</span>
                </label>
                <textarea
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="这个团队的用途..."
                  rows={2}
                  className="w-full px-4 py-3.5 rounded-2xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none resize-none text-sm font-medium"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-3.5 text-text-secondary font-bold rounded-2xl border border-border-strong hover:bg-surface-secondary transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="flex-1 py-3.5 bg-text-primary text-text-inverse font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {creating ? '创建中...' : '创建团队'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
