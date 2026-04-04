import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../utils/apiClient";
import CatMiniAvatar from "../../components/CatMiniAvatar";
import type { AiStatRow, WorkbenchPayload } from "./workbenchTypes";
import { OFFICIAL_BRAND_PREVIEW_COLORS } from "./workbenchTheme";

const UsagePage: React.FC = () => {
  const [rows, setRows] = useState<AiStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const wb = await apiClient.get<WorkbenchPayload>("/api/teams/workbench");
      setRows(Array.isArray(wb.aiStats) ? wb.aiStats : []);
    } catch {
      setRows([]);
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
          <h1 className="text-sm font-black tracking-tight">猫猫调用次数</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-text-secondary text-sm font-medium mb-6">
          按猫猫聚合的 AI 调用次数，便于了解各角色参与度。
        </p>

        <div className="rounded-[20px] border border-border bg-surface-secondary/30 overflow-hidden">
          {loading ? (
            <p className="p-8 text-center text-text-tertiary text-sm font-medium">
              加载中…
            </p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-text-tertiary text-sm font-medium">
              暂无调用记录
            </p>
          ) : (
            <ul className="divide-y divide-border max-h-[min(70vh,520px)] overflow-y-auto">
              {rows.map((row) => (
                <li
                  key={row.catId}
                  className="px-4 py-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full border border-border overflow-hidden flex items-center justify-center bg-surface shrink-0">
                      <CatMiniAvatar
                        colors={OFFICIAL_BRAND_PREVIEW_COLORS}
                        size={22}
                      />
                    </div>
                    <span className="text-sm font-bold truncate">{row.name}</span>
                  </div>
                  <span className="text-sm font-black text-primary-600 tabular-nums">
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
};

export default UsagePage;
