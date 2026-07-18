/**
 * rec-form —— AI 材质+配色推荐编辑表单(从 Composer 抽出,供 ComposerPipeline 复用)。
 *
 * 本组件只负责展示与编辑材质/配色字段,不再渲染「确认」按钮——
 * 流程推进按钮统一收纳到左栏底部 GenerateButton(按 stage 切换动作)。
 */
import { SwatchStrip } from "./Materials";
import type { MaterialRecommendation } from "../types/design";

export function RecForm({ recommendation, onChange, onRefresh, onConfirm, loading, disabled, readOnly = false }: {
  recommendation: MaterialRecommendation | null;
  onChange: (r: MaterialRecommendation) => void;
  onRefresh: () => void;
  onConfirm?: () => void;
  loading: boolean;
  disabled: boolean;
  /** 只读模式:步骤已确认,隐藏编辑 UI */
  readOnly?: boolean;
}) {
  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  if (loading || !recommendation) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">AI 材质推荐</div>
        <div className="text-[12px] text-gray-500">推荐中…</div>
      </div>
    );
  }

  const setField = (field: keyof MaterialRecommendation, value: any) => {
    onChange({ ...recommendation, [field]: value });
  };

  const addColor = () => {
    if (recommendation.colors.length >= 5) return;
    onChange({ ...recommendation, colors: [...recommendation.colors, '#CCCCCC'] });
  };

  const removeColor = (idx: number) => {
    if (recommendation.colors.length <= 1) return;
    onChange({ ...recommendation, colors: recommendation.colors.filter((_, i) => i !== idx) });
  };

  const updateColor = (idx: number, hex: string) => {
    const next = [...recommendation.colors];
    next[idx] = hex;
    onChange({ ...recommendation, colors: next });
  };

  // 只读模式:步骤已确认,仅展示内容,隐藏编辑入口
  if (readOnly) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">AI 材质推荐 ✓</div>
        <div className="text-[12px] text-gray-700 font-medium mb-1">{recommendation.name}</div>
        {recommendation.composition && <div className="text-[11px] text-gray-500 mb-1">{recommendation.composition}</div>}
        {recommendation.texture && <div className="text-[11px] text-gray-500 mb-1">{recommendation.texture}</div>}
        {recommendation.finish && <div className="text-[11px] text-gray-500 mb-2">{recommendation.finish}</div>}
        <div className="flex gap-1 mb-2">
          {recommendation.colors.map((c, i) => (
            <span key={i} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
          ))}
        </div>
        {recommendation.reason && (
          <div className="text-[10px] text-gray-500 italic">💬 {recommendation.reason}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">
          AI 材质推荐
        </div>
        <button
          onClick={onRefresh}
          disabled={disabled}
          className="text-[10px] text-primary-600 hover:underline disabled:opacity-40"
        >
          换一批
        </button>
      </div>

      <label className={labelCls}>材质名</label>
      <input
        className={`${inputCls} mb-2.5`}
        value={recommendation.name}
        onChange={(e) => setField("name", e.target.value)}
        placeholder="如:真丝双绉 / 棉麻平纹"
        disabled={disabled}
      />

      <label className={labelCls}>成分 / 克重</label>
      <input
        className={`${inputCls} mb-2.5`}
        value={recommendation.composition ?? ""}
        onChange={(e) => setField("composition", e.target.value)}
        placeholder="如:100%桑蚕丝 16mm"
        disabled={disabled}
      />

      <label className={labelCls}>触感 / 表面</label>
      <input
        className={`${inputCls} mb-2.5`}
        value={recommendation.texture ?? ""}
        onChange={(e) => setField("texture", e.target.value)}
        placeholder="如:光滑垂坠 / 粗粝自然"
        disabled={disabled}
      />

      <label className={labelCls}>后整工艺</label>
      <input
        className={`${inputCls} mb-2.5`}
        value={recommendation.finish ?? ""}
        onChange={(e) => setField("finish", e.target.value)}
        placeholder="如:哑光 / 丝光 / 水洗"
        disabled={disabled}
      />

      <div className="flex items-center justify-between">
        <label className={`${labelCls} !mb-0`}>
          配色 ({recommendation.colors.length}/5)
        </label>
        <button
          onClick={addColor}
          disabled={disabled || recommendation.colors.length >= 5}
          className="text-[10px] text-primary-600 hover:underline disabled:opacity-40"
        >
          + 添加
        </button>
      </div>
      <div className="space-y-1.5 mb-3">
        {recommendation.colors.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="color"
              value={c}
              disabled={disabled}
              onChange={(e) => updateColor(i, e.target.value)}
              className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
            />
            <input
              className={`${inputCls} !py-1 flex-1`}
              value={c}
              onChange={(e) => updateColor(i, e.target.value)}
              disabled={disabled}
            />
            <button
              onClick={() => removeColor(i)}
              disabled={disabled || recommendation.colors.length <= 1}
              className="text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-30 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="relative h-6 rounded-lg overflow-hidden border border-gray-200 mb-3">
        <SwatchStrip colors={recommendation.colors} />
      </div>

      {recommendation.reason && (
        <div className="text-[10px] text-gray-500 mb-3 italic">
          💬 {recommendation.reason}
        </div>
      )}
    </div>
  );
}
