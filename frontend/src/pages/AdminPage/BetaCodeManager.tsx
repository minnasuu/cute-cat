// @ts-nocheck
/**
 * BetaCodeManager —— 内测码管理区块。
 *
 * 管理员可:
 *  - 查看统计(总数 / 已用 / 剩余)
 *  - 批量生成内测码(带备注)
 *  - 查看码列表(状态 / 使用人 / 备注)
 *  - 删除未使用的码
 *  - 导出未使用码为 CSV
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../utils/apiClient";
import { AppIcon } from "../../components/icons/AppIcon";

type BetaCode = {
  id: string;
  code: string;
  used: boolean;
  usedAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  usedBy: { email: string; nickname: string } | null;
};

type BetaStats = {
  total: number;
  used: number;
  unused: number;
};

const PAGE_SIZE = 50;

export default function BetaCodeManager() {
  const [stats, setStats] = useState<BetaStats>({ total: 0, used: 0, unused: 0 });
  const [rows, setRows] = useState<BetaCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genCount, setGenCount] = useState(20);
  const [genNote, setGenNote] = useState("");
  const [genResult, setGenResult] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unused" | "used">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        apiClient.get<BetaStats>("/api/admin/beta-codes/stats"),
        apiClient.get<{ rows: BetaCode[] }>("/api/admin/beta-codes?pageSize=" + PAGE_SIZE),
      ]);
      setStats(statsRes);
      setRows(listRes.rows ?? []);
    } catch {
      /* apiClient 已 toast */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerate(e) {
    e.preventDefault();
    if (genCount < 1 || genCount > 500) return;
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await apiClient.post<{ codes: string[]; count: number }>(
        "/api/admin/beta-codes/generate",
        { n: genCount, note: genNote.trim() },
      );
      setGenResult(res.codes ?? []);
      setGenNote("");
      await loadData();
    } catch {
      /* apiClient 已 toast */
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除这个未使用的内测码?")) return;
    try {
      await apiClient.delete("/api/admin/beta-codes/" + id);
      await loadData();
    } catch {
      /* apiClient 已 toast */
    }
  }

  function exportCSV() {
    const exportRows = rows.filter((r) => !r.used);
    if (exportRows.length === 0) {
      alert("没有未使用的码可导出");
      return;
    }
    const header = "code,note,createdAt";
    const lines = exportRows.map((r) => {
      const note = (r.note ?? "").replace(/"/g, '""');
      return `${r.code},"${note}",${new Date(r.createdAt).toLocaleString("zh-CN")}`;
    });
    const csv = "﻿" + [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beta-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredRows = rows.filter((r) => {
    if (filter === "used") return r.used;
    if (filter === "unused") return !r.used;
    return true;
  });

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">内测码管理</h2>
          <p className="text-xs text-text-tertiary mt-0.5">
            一次性准入码,每个码只能用于一个用户注册。仅持有效码者可注册。
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="px-3 py-1.5 rounded-lg text-xs border border-border text-text-secondary hover:bg-surface-secondary transition-colors inline-flex items-center gap-1"
        >
          <AppIcon symbol="Download" size={14} />
          导出未使用
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border bg-surface-secondary/30">
        <div className="text-center">
          <div className="text-2xl font-black text-text-primary">{stats.total}</div>
          <div className="text-[11px] text-text-tertiary mt-0.5">总数</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black text-emerald-600">{stats.unused}</div>
          <div className="text-[11px] text-text-tertiary mt-0.5">未使用</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-black text-amber-600">{stats.used}</div>
          <div className="text-[11px] text-text-tertiary mt-0.5">已使用</div>
        </div>
      </div>

      {/* 生成器 */}
      <form onSubmit={handleGenerate} className="px-6 py-4 border-b border-border flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">
            生成数量
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={genCount}
            onChange={(e) => setGenCount(parseInt(e.target.value, 10) || 1)}
            className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] uppercase tracking-wider text-text-tertiary mb-1 block">
            备注(可选)
          </label>
          <input
            type="text"
            value={genNote}
            onChange={(e) => setGenNote(e.target.value)}
            placeholder='如:"KOL-A" / "XX 媒体" / "种子用户"'
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-tertiary focus:ring-2 focus:ring-primary-100 focus:border-primary-400 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={generating}
          className="px-4 py-2 rounded-lg text-sm bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {generating ? "生成中…" : "批量生成"}
        </button>
      </form>

      {/* 生成结果 */}
      {genResult && (
        <div className="px-6 py-3 border-b border-border bg-emerald-50/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-700">
              成功生成 {genResult.length} 个码
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(genResult.join("\n"));
                setGenResult(null);
              }}
              className="text-xs text-primary-600 hover:text-primary-700"
            >
              复制全部并关闭
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {genResult.map((c) => (
              <span
                key={c}
                className="px-2 py-0.5 rounded bg-white border border-emerald-200 text-[11px] font-mono text-emerald-700"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-2">
        <span className="text-xs text-text-tertiary">筛选:</span>
        {(["all", "unused", "used"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${
              filter === f
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-border text-text-secondary hover:bg-surface-secondary"
            }`}
          >
            {f === "all" ? "全部" : f === "unused" ? "未使用" : "已使用"}
          </button>
        ))}
        <span className="text-xs text-text-tertiary ml-auto">
          显示 {filteredRows.length} / {rows.length}
        </span>
      </div>

      {/* 列表 */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-text-tertiary border-b border-border bg-surface-secondary/50">
              <th className="px-4 py-3 font-medium">内测码</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">使用人</th>
              <th className="px-4 py-3 font-medium">备注</th>
              <th className="px-4 py-3 font-medium">创建时间</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                    <span>加载中…</span>
                  </div>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-tertiary">
                  {rows.length === 0
                    ? "暂无内测码,使用上方生成器创建"
                    : "没有符合筛选条件的码"}
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-border transition-colors ${
                    r.used ? "bg-surface-secondary/20" : "hover:bg-surface-secondary/40"
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono font-bold tracking-wider text-text-primary">
                    {r.code}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.used ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
                        已使用
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                        未使用
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-[12px]">
                    {r.usedBy ? (
                      <div>
                        <div className="font-medium">{r.usedBy.nickname}</div>
                        <div className="text-text-tertiary">{r.usedBy.email}</div>
                        {r.usedAt && (
                          <div className="text-text-tertiary text-[10px]">
                            {new Date(r.usedAt).toLocaleString("zh-CN")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary text-[12px] max-w-[200px] truncate">
                    {r.note || <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-text-tertiary text-[12px] whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-4 py-2.5">
                    {!r.used && (
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="px-2 py-1 rounded-lg text-[11px] border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
