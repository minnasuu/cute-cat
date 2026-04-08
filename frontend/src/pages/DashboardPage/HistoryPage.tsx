import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient } from "../../utils/apiClient";
import type { WorkbenchPayload, WorkflowRun } from "./workbenchTypes";

/** 对用户展示的友好工作流名称 */
function friendlyName(name: string): string {
  if (name === "落地页") return "落地页";
  return name;
}

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wb = await apiClient.get<WorkbenchPayload>("/api/teams/workbench");
      setRuns(Array.isArray(wb.runs) ? wb.runs : []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback(
    async (runId: string) => {
      setDeletingId(runId);
      try {
        await apiClient.delete(`/api/workflows/runs/${runId}`);
        setRuns((prev) => prev.filter((r) => r.id !== runId));
      } catch {
        // apiClient 已有 toast
      } finally {
        setDeletingId(null);
        setConfirmId(null);
      }
    },
    [],
  );

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors"
          >
            ← 创作首页
          </Link>
          <span className="text-text-tertiary text-sm">/</span>
          <h1 className="text-sm font-black tracking-tight">历史记录</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <p className="text-text-secondary text-sm font-medium mb-6">
          最近的任务与运行状态（按时间倒序）。
        </p>

        <div className="rounded-[20px] border border-border bg-surface-secondary/30 overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-text-tertiary text-sm font-medium">
              加载中…
            </p>
          ) : runs.length === 0 ? (
            <p className="p-8 text-center text-text-tertiary text-sm font-medium">
              还没有运行记录
            </p>
          ) : (
            <ul className="divide-y divide-border max-h-[min(70vh,520px)] overflow-y-auto">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="px-4 py-3 hover:bg-surface/80 group relative cursor-pointer"
                  onClick={() =>
                    navigate(`/dashboard?runId=${encodeURIComponent(r.id)}`)
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[11px] font-bold text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-md shrink-0">
                        {friendlyName(r.workflowName)}
                      </span>
                      <span className="text-sm font-bold text-text-primary truncate">
                        {r.userInput || r.workflowName}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          r.status === "success"
                            ? "text-primary-600"
                            : r.status === "failed"
                              ? "text-danger-500"
                              : "text-warning-600"
                        }`}
                      >
                        {r.status}
                      </span>

                      {/* 删除按钮 */}
                      {confirmId === r.id ? (
                        <span className="flex items-center gap-1 text-[11px]">
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className="text-danger-500 font-bold hover:text-danger-600 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {deletingId === r.id ? "删除中…" : "确认"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(r.id)}
                          className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-danger-500 transition-all text-xs cursor-pointer"
                          title="删除此记录"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-text-tertiary">
                      {new Date(r.startedAt).toLocaleString("zh-CN")}
                      {r.totalDuration != null ? ` · ${r.totalDuration}s` : ""}
                    </p>
                    <span className="text-[10px] text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      查看结果 →
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default HistoryPage;
