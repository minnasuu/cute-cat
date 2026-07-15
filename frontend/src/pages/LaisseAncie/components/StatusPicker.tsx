// @ts-nocheck
/**
 * StatusPicker —— 自定义状态选择器(彩色药丸 + 弹出列表),替代原生 <select>。
 *
 * 每种状态拥有一条 color;当前状态渲染为带色底的药丸,点击弹出可选列表。
 * 提供「配置」入口:新增/重命名/改色/删除状态(持久化到团队 brand.statusConfig)。
 */
import { useEffect, useRef, useState } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import { Modal } from "./ui";

export interface StatusDef {
  id: string;
  label: string;
  color: string;
}

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "draft",        label: "草稿",         color: "#6b7280" },
  { id: "submitted",    label: "已录入",       color: "#0ea5e9" },
  { id: "proto1",       label: "第 1 次打样中", color: "#f59e0b" },
  { id: "proto1_done",  label: "第 1 次打样完成", color: "#d97706" },
  { id: "proto2",       label: "第 2 次打样中", color: "#f97316" },
  { id: "proto2_done",  label: "第 2 次打样完成", color: "#c2410c" },
  { id: "bulk",         label: "大货生产",     color: "#6366f1" },
  { id: "bulk_done",    label: "大货交货",     color: "#4338ca" },
  { id: "finished",     label: "成品确认",     color: "#14b8a6" },
  { id: "pending_list", label: "待上架",       color: "#8b5cf6" },
  { id: "live",         label: "已上架",       color: "#16a34a" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function textColorForBg(hex: string): string {
  const c = hexToRgb(hex);
  if (!c) return "white";
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.6 ? "#1f2937" : "#ffffff";
}

/** 从brand.statusConfig 读状态配置,DEFAULT_STATUSES 兜底 */
export function useStatusConfig(): {
  statuses: StatusDef[];
  save: (next: StatusDef[]) => Promise<void>;
  loading: boolean;
} {
  const { teamId } = useCurrentTeam();
  const [statuses, setStatuses] = useState<StatusDef[]>(DEFAULT_STATUSES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!teamId) { setLoading(false); return; }
    teamApi(teamId).getBrand()
      .then((d) => {
        if (cancelled) return;
        const cfg = Array.isArray(d.profile?.statusConfig) && d.profile.statusConfig.length > 0
          ? d.profile.statusConfig
          : DEFAULT_STATUSES;
        setStatuses(cfg);
      })
      .catch(() => {
        if (!cancelled) setStatuses(DEFAULT_STATUSES);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [teamId]);

  const save = async (next: StatusDef[]) => {
    if (!teamId) return;
    setStatuses(next); // 乐观更新
    try {
      await teamApi(teamId).patchBrand({ statusConfig: next });
    } catch {
      // 失败回滚
      const d = await teamApi(teamId).getBrand();
      setStatuses(Array.isArray(d.profile?.statusConfig) && d.profile.statusConfig.length > 0 ? d.profile.statusConfig : DEFAULT_STATUSES);
    }
  };

  return { statuses, save, loading };
}

/** 单个状态选择器 + 配置入口 */
export function StatusPicker({
  value,
  onChange,
  statuses,
  onOpenConfig,
}: {
  value: string;
  onChange: (next: string) => void;
  statuses: StatusDef[];
  onOpenConfig?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = statuses.find((s) => s.id === value) ?? (value ? { id: value, label: value, color: "#6b7280" } : null);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border border-transparent min-w-[72px] justify-center"
        style={current ? { backgroundColor: current.color + "1f", color: current.color, borderColor: current.color + "40" } : { backgroundColor: "#f3f4f6", color: "#6b7280" }}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: current?.color ?? "#6b7280" }} />
        {current?.label ?? "未设置"}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-gray-200 bg-white shadow-lg py-1 max-h-64 overflow-y-auto">
          {statuses.map((s) => {
            const active = s.id === value;
            return (
              <button
                key={s.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(s.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-gray-50 transition-colors ${active ? "bg-gray-50" : ""}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.label}</span>
                {active && <span className="ml-auto text-primary-600">✓</span>}
              </button>
            );
          })}
          {statuses.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-gray-400">暂无状态,请先配置</div>
          )}
          {onOpenConfig && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onOpenConfig(); }}
                className="w-full px-3 py-1.5 text-left text-[12px] text-primary-600 hover:bg-primary-50 transition-colors"
              >
                ⚙ 配置状态
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 状态配置弹窗(增/删/改 label + color) */
export function StatusConfigModal({
  open,
  onClose,
  statuses,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  statuses: StatusDef[];
  onSave: (next: StatusDef[]) => void;
}) {
  const [draft, setDraft] = useState<StatusDef[]>(statuses);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open) { setDraft(statuses); setDirty(false); }
  }, [open, statuses]);

  const update = (i: number, patch: Partial<StatusDef>) => {
    setDraft((d) => d.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    setDirty(true);
  };
  const add = () => {
    const id = `st_${Date.now().toString(36)}`;
    setDraft((d) => [...d, { id, label: "新状态", color: "#6b7280" }]);
    setDirty(true);
  };
  const remove = (i: number) => {
    setDraft((d) => d.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const save = async () => {
    // 简单校验:空 label 不允许,id 去重
    const cleaned = draft.filter((s) => s.label.trim()).map((s) => ({ ...s, label: s.label.trim(), id: s.id || `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }));
    await onSave(cleaned);
    setDirty(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="配置状态" maxWidth="max-w-md">
      <div className="space-y-2">
        <p className="text-[12px] text-gray-500 mb-3">自定义状态名称与颜色,会同步到团队内所有成员。</p>
        {draft.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="color"
              value={s.color}
              onChange={(e) => update(i, { color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-gray-200 p-0 shrink-0"
              title="选择颜色"
            />
            <input
              value={s.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="状态名称"
              className="flex-1 px-3 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0"
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="w-full py-1.5 text-[12px] text-primary-600 border border-dashed border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
        >
          + 新增状态
        </button>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">取消</button>
        <button onClick={save} disabled={!dirty} className="px-4 py-2 text-sm bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50">保存</button>
      </div>
    </Modal>
  );
}

export { textColorForBg };
