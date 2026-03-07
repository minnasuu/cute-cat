import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/apiClient';
import CatMiniAvatar from '../components/CatMiniAvatar';

interface Team {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  cats: Array<{ id: string; name: string; role: string; catColors: any; accent: string }>;
  _count: { cats: number; workflows: number; workflowRuns: number };
}

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamIcon, setNewTeamIcon] = useState('🐱');
  const [creating, setCreating] = useState(false);

  const iconOptions = ['🐱', '🐾', '🏠', '🚀', '🎨', '📝', '💼', '🌟', '🔥', '🌈'];

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
      await apiClient.post('/api/teams', { name: newTeamName, description: newTeamDesc, icon: newTeamIcon });
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-secondary to-primary-50/30">
      {/* Top nav */}
      <header className="bg-surface/80 backdrop-blur-sm border-b border-border sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🐱</span>
            <span className="text-lg font-bold text-text-primary">Cute Cat</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{user?.nickname}</span>
              <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs">{user?.plan}</span>
            </div>
            <button onClick={logout} className="text-sm text-text-tertiary hover:text-danger-500 transition-colors">退出</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">你好，{user?.nickname} 👋</h1>
          <p className="text-text-secondary mt-1">管理你的猫猫团队和工作流</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-3xl font-bold text-green-600">{teams.length}</div>
            <div className="text-sm text-gray-500 mt-1">我的团队</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-3xl font-bold text-orange-600">{teams.reduce((sum, t) => sum + t._count.cats, 0)}</div>
            <div className="text-sm text-gray-500 mt-1">猫猫总数</div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-3xl font-bold text-blue-600">{teams.reduce((sum, t) => sum + t._count.workflows, 0)}</div>
            <div className="text-sm text-gray-500 mt-1">工作流总数</div>
          </div>
        </div>

        {/* Teams Section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">我的团队</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors shadow-sm"
          >
            + 创建团队
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">加载中...</div>
        ) : teams.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="text-6xl mb-4">🐱</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">还没有团队</h3>
            <p className="text-gray-500 mb-6">创建你的第一个猫猫团队，开始 AI 工作流之旅</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 bg-green-500 text-white font-medium rounded-xl hover:bg-green-600 transition-colors shadow-lg shadow-green-200"
            >
              创建第一个团队
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map(team => (
              <div
                key={team.id}
                className="bg-surface rounded-xl border border-border p-6 hover:shadow-lg hover:border-hover transition-all cursor-pointer group"
                onClick={() => navigate(`/teams/${team.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{team.icon || '🐱'}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors">{team.name}</h3>
                      {team.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{team.description}</p>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id, team.name); }}
                    className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all p-1"
                    title="删除团队"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>

                {/* Cat avatars */}
                <div className="flex items-center gap-1 mb-3">
                  {team.cats.slice(0, 5).map(cat => (
                    <div key={cat.id} className="w-8 h-8 rounded-full bg-gray-50 border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
                      <CatMiniAvatar colors={cat.catColors} size={24} />
                    </div>
                  ))}
                  {team._count.cats > 5 && (
                    <div className="w-8 h-8 rounded-full bg-surface-tertiary border-2 border-surface shadow-sm flex items-center justify-center text-xs text-text-secondary font-medium">
                      +{team._count.cats - 5}
                    </div>
                  )}
                  {team._count.cats === 0 && <span className="text-xs text-gray-400">还没有猫猫</span>}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-text-tertiary">
                  <span>🐱 {team._count.cats} 只猫猫</span>
                  <span>📋 {team._count.workflows} 个工作流</span>
                  <span>▶️ {team._count.workflowRuns} 次执行</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Team Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-surface rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-text-primary mb-6">创建新团队</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">团队图标</label>
                <div className="flex gap-2 flex-wrap">
                  {iconOptions.map(icon => (
                    <button
                      key={icon}
                      onClick={() => setNewTeamIcon(icon)}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border-2 transition-all ${newTeamIcon === icon ? 'border-primary-500 bg-primary-50' : 'border-border-strong hover:border-text-tertiary'}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">团队名称</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="例如：我的内容团队"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">团队描述 <span className="text-text-tertiary">(可选)</span></label>
                <textarea
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="这个团队的用途..."
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-surface-secondary focus:bg-surface focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-3 text-text-secondary font-medium rounded-xl border border-border-strong hover:bg-surface-secondary transition-all">取消</button>
                <button
                  onClick={handleCreateTeam}
                  disabled={creating || !newTeamName.trim()}
                  className="flex-1 py-3 bg-primary-500 text-text-inverse font-medium rounded-xl hover:bg-primary-600 transition-all disabled:opacity-50 shadow-lg shadow-primary-200"
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
