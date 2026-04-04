import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../utils/apiClient";
import type { WorkbenchPayload, WorkflowRun } from "./workbenchTypes";

const HistoryPage: React.FC = () => {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors"
          >
            ← 工作台
          </Link>
          <span className="text-text-tertiary text-sm">/</span>
          <h1 className="text-sm font-black tracking-tight">历史记录</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
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
                <li key={r.id} className="px-4 py-3 hover:bg-surface/80">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-text-primary truncate">
                      {r.workflowName}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase shrink-0 ${
                        r.status === "success"
                          ? "text-primary-600"
                          : r.status === "failed"
                            ? "text-danger-500"
                            : "text-warning-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-1">
                    {new Date(r.startedAt).toLocaleString("zh-CN")}
                    {r.totalDuration != null ? ` · ${r.totalDuration}s` : ""}
                  </p>
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
