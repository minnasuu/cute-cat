import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import Navbar from "../../components/Navbar";
import { useAuth } from '../../contexts/AuthContext';
import CatLogo from "../../components/CatLogo";

interface Post {
  id: string;
  type: 'work' | 'feedback' | 'announcement';
  title: string;
  content?: string | null;
  images: Array<{ slot?: string; label?: string; url: string }>;
  refProductId?: string | null;
  likes: number;
  pinned: boolean;
  createdAt: string;
  author?: { id: string; nickname: string } | null;
}

const TYPE_LABELS: Record<string, string> = {
  work: '作品',
  feedback: '反馈',
  announcement: '官方通知',
};

/**
 * CommunityPage —— 作品交流社区(公开 feed + 反馈 + 官方通知)
 */
const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<'work' | 'feedback' | 'announcement'>('work');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiClient.get<{ items: Post[]; total: number }>(
        `/api/community/posts?type=${tab}&take=60`,
      );
      setPosts(d.items);
    } catch (e: any) {
      // 优先展示后端返回的具体错误 + 原因;无细节时给中文兜底
      const data = e?.data || {};
      const msg = data.detail
        ? `${data.error || "获取社区内容失败"}：${data.detail}`
        : data.error || e?.message || "获取社区内容失败";
      setError(msg);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleLike = async (id: string) => {
    if (!user) { showToast('请先登录', 'warning'); return; }
    try {
      const r = await apiClient.post<{ likes: number }>(`/api/community/posts/${id}/like`, {});
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likes: r.likes } : p)));
    } catch { /* toast */ }
  };

  const coverImg = (imgs: Post['images']) => imgs?.find((i) => i?.url)?.url;

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      {/* 顶部导航:与工作台复用共享 Navbar(工作台/社区),社区页 active=community */}
      <Navbar
        variant="sticky"
        navLinks={[
          { id: "dashboard", label: "工作台", href: "/dashboard" },
          { id: "community", label: "社区", href: "/community" },
        ]}
        activeNavId="community"
      />

      {/* Hero */}
      <section className="relative py-16 md:py-20">
        <div className="absolute top-0 left-1/4 w-80 h-80 bg-primary-100/30 rounded-full blur-[120px] -z-10 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
            创作者社区
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            浏览公开作品、提交产品反馈、查看官方通知。在你的工作台把作品公开,与大家分享创作。
          </p>
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-16 z-40 bg-surface/90 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-6 flex gap-1 -mb-px overflow-x-auto">
          {(["work", "feedback", "announcement"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                tab === t
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-text-tertiary hover:text-text-primary"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        {loading ? (
          <p className="text-center text-text-tertiary py-16">加载中…</p>
        ) : error ? (
          <div className="text-center py-20">
            <div className="mx-auto w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center mb-4">
              <span className="text-2xl">⚠</span>
            </div>
            <p className="text-text-secondary mb-2">加载社区内容失败了</p>
            <p className="text-xs text-text-tertiary mb-5 max-w-sm mx-auto">
              {error}
            </p>
            <button
              onClick={load}
              className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors"
            >
              重新加载
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-text-tertiary mb-4">这里还没有内容</p>
            {tab === "work" && (
              <button
                onClick={() => navigate(user ? "/dashboard" : "/register")}
                className="px-6 py-2.5 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors"
              >
                {user ? "去工作台公开作品" : "注册并创作"}
              </button>
            )}
          </div>
        ) : (
          <div
            className={`grid gap-5 ${tab === "work" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 max-w-3xl mx-auto"}`}
          >
            {posts.map((post) => (
              <article
                key={post.id}
                className="rounded-[24px] border border-border bg-surface overflow-hidden hover:border-border-strong hover:shadow-lg transition-all"
              >
                {tab === "work" && coverImg(post.images) && (
                  <div className="aspect-square bg-surface-secondary overflow-hidden">
                    <img
                      src={coverImg(post.images)}
                      alt={post.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-black text-text-primary truncate">
                      {post.title}
                    </h3>
                    {post.pinned && (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        置顶
                      </span>
                    )}
                  </div>
                  {post.content && tab !== "work" && (
                    <p className="text-sm text-text-secondary line-clamp-3 mb-3">
                      {post.content}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-text-tertiary truncate">
                      {post.author?.nickname || "匿名用户"}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-text-tertiary">
                        {new Date(post.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                      {user && (
                        <button
                          onClick={() => handleLike(post.id)}
                          className="text-xs text-text-tertiary hover:text-danger-500 transition-colors"
                        >
                          ♥ {post.likes}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border">
        <div className="mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">
            © 2026 CuCaTopia.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default CommunityPage;
