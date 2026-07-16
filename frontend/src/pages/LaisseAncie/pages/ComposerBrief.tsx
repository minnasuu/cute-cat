// @ts-nocheck
/**
 * ComposerBrief —— 灵感扩散左栏「设计简报」。
 *
 * 稳定结构化表单(替代原来的自由对话入口):顶部 header(标题+模式切换+新会话) +
 * 设计名称 + 灵感参考槽位(上传/从库选) + 设计需求描述 + 品牌色/调性 +
 * 底部保留多轮细化输入。
 *
 * 数据/管线仍由 ComposerPage 控制器提供;本组件只负责渲染 + 收集输入。
 */
import { useEffect, useRef, useState } from "react";
import { useComposerPrompt } from "../contexts/composer-prompt";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import { compressForUpload } from "../lib/images";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";

export interface RefImage {
  id: string;
  url: string;
  name: string;
  source: "upload" | "library";
}

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
  // 简报状态
  designName: string;
  setDesignName: (v: string) => void;
  references: RefImage[];
  setReferences: (upsert: (prev: RefImage[]) => RefImage[]) => void;
  description: string;
  setDescription: (v: string) => void;
  // 动作
  onGenerate: () => void;
  onNewSession: () => void;
  generating: boolean;
  // 多轮细化(走原 send)
  onRefine: (text: string) => void;
  refineBusy: boolean;
}

const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

export default function ComposerBrief({
  knowledge, brandLoading, knowledgeLoading,
  designName, setDesignName, references, setReferences, description, setDescription,
  onGenerate, onNewSession, generating, onRefine, refineBusy,
}: Props) {
  const { teamId } = useCurrentTeam();
  const { draftPrompt, clearDraftPrompt } = useComposerPrompt();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftRefine, setDraftRefine] = useState("");

  function sendRefine() {
    const v = draftRefine.trim();
    if (!v || refineBusy) return;
    onRefine(v);
    setDraftRefine("");
  }

  // 「制作相似」草稿 → 填入描述(仅首次)
  useEffect(() => {
    if (draftPrompt && draftPrompt.trim()) {
      setDescription((d) => (d.trim() ? d : draftPrompt));
      clearDraftPrompt();
    }
  }, [draftPrompt, clearDraftPrompt, setDescription]);

  // 上传参考图 → 入库(inspirations)
  async function handleFiles(list: FileList | null) {
    if (!list?.length || !teamId) return;
    setUploading(true);
    try {
      for (const raw of Array.from(list)) {
        const id = crypto.randomUUID();
        const compressed = await compressForUpload(raw);
        const fd = new FormData();
        fd.append("file", compressed);
        const res = await teamApi(teamId).uploadInspiration(fd);
        const ref: RefImage = { id, url: res.url || res.thumbUrl || "", name: raw.name || "参考图", source: "upload" };
        setReferences((prev) => [...prev, ref]);
      }
    } finally { setUploading(false); }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeRef(id: string) { setReferences((prev) => prev.filter((r) => r.id !== id)); }

  function pickFromLibrary(it: any) {
    setReferences((prev) => [...prev, {
      id: it.id, url: it.thumbUrl || it.url || it.image || "", name: it.name || it.category || "灵感",
      source: "library",
    }]);
    setPickerOpen(false);
  }

  const libItems = knowledge?.inspirations || [];

  return (
    <div className="overflow-y-auto bg-white min-h-0 flex flex-col">
      {/* 顶部 header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-[15px] font-medium text-gray-800 min-h-7">
            灵感扩散
          </h1>
          <button
            onClick={onNewSession}
            disabled={generating || refineBusy}
            className="h-7 text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 hover:border-gray-800 disabled:opacity-40"
          >
            + 新会话
          </button>
        </div>
        <span className="text-[10px] text-gray-500">
          结构化简报 → AI 管线(方案·线稿·材质·成图)
        </span>
      </header>

      <div className="p-5 space-y-5 flex-1">
        {/* ① 设计名称 */}
        <div>
          <label className={labelCls}>
            名称 <span className="text-red-500">*</span>
          </label>
          <input
            data-tour="tour-name"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder="如:春日雏菊连衣裙"
            className={inputCls}
          />
        </div>

        {/* ② 灵感参考(上传 + 库)*/}
        <div>
          <label className={labelCls}>
            灵感参考{" "}
            <span className="text-gray-400 normal-case tracking-normal">
              ({references.length}/6)
            </span>
          </label>
          <div data-tour="tour-refs" className="flex flex-wrap gap-2">
            {references.map((r) => (
              <div
                key={r.id}
                className="w-20 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group"
              >
                {r.url ? (
                  <img
                    src={r.url}
                    alt={r.name}
                    className="w-20 h-16 object-cover"
                  />
                ) : (
                  <div className="w-20 h-16 bg-gray-200" />
                )}
                {r.source === "library" && (
                  <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">
                    库
                  </span>
                )}
                {!generating && (
                  <button
                    onClick={() => removeRef(r.id)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/50 text-white text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                )}
                <div
                  className="px-1 py-0.5 text-[7px] text-gray-400 truncate"
                  title={r.name}
                >
                  {r.name}
                </div>
              </div>
            ))}
            {references.length < 6 && !generating && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                >
                  <span className="text-lg text-gray-400">+</span>
                  <span className="text-[9px] text-gray-400 mt-0.5">
                    {uploading ? "上传中" : "上传"}
                  </span>
                </button>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                >
                  <span className="text-base text-primary-500">▦</span>
                  <span className="text-[9px] text-primary-600 mt-0.5">
                    从库选择
                  </span>
                </button>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
            }}
          />
          <span className="text-[10px] text-gray-400">
            上传图片作为参考,或直接选灵感库
          </span>
        </div>

        {/* ③ 设计需求 */}
        <div>
          <label className={labelCls}>设计需求</label>
          <textarea
            data-tour="tour-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="人群、场景、风格调性、特殊工艺要求等(可选)"
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* ④ 品牌色 / 调性(自动注入) */}
        {knowledge?.brand?.colors?.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">品牌色 · 调性</span>
              <span className="text-gray-400">(自动注入 AI prompt)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(knowledge.brand.colors || []).map((c: any, i: number) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <span
                    className="w-3.5 h-3.5 rounded border border-gray-300"
                    style={{ background: c?.bg || c }}
                  />
                  <span className="font-mono text-[10px] text-gray-500">
                    {c?.bg || c}
                  </span>
                </span>
              ))}
              {(knowledge.brand.voice || []).map((v: string) => (
                <span
                  key={v}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}


      </div>

      {/* 多轮细化(保留对话入口,但收起在简报下方) */}
      <div className="shrink-0 border-t border-gray-200 bg-white/90 backdrop-blur p-3">
        <div className="flex gap-2 items-end max-w-2xl">
          <textarea
            value={draftRefine}
            onChange={(e) => setDraftRefine(e.target.value)}
            rows={1}
            placeholder="对方案/线稿/成图提出修改(回车发送)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendRefine();
              }
            }}
            className={`${inputCls} resize-none flex-1`}
          />
          <button
            onClick={sendRefine}
            disabled={refineBusy || !draftRefine.trim()}
            className="text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-medium shrink-0"
          >
            {refineBusy ? "…" : "发送"}
          </button>
        </div>
      </div>

      {/* 灵感库选择弹窗 */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="sticky top-0 flex items-center justify-between px-5 py-3 bg-white/95 backdrop-blur border-b border-gray-100">
              <h2 className="text-sm font-medium">从灵感库选择参考</h2>
              <button
                onClick={() => setPickerOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400"
              >
                ×
              </button>
            </header>
            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {libItems.length === 0 && (
                <div className="col-span-full text-center text-[12px] text-gray-400 py-10">
                  灵感库暂无图片,请先到「灵感」页添加。
                </div>
              )}
              {libItems.map((it: any) => (
                <button
                  key={it.id}
                  onClick={() => pickFromLibrary(it)}
                  className="text-left rounded-xl border border-gray-200 hover:border-primary-400 transition-all overflow-hidden"
                >
                  <div className="aspect-square bg-gray-100">
                    {it.thumbUrl || it.url || it.image ? (
                      <img
                        src={it.thumbUrl || it.url || it.image}
                        alt={it.name || it.category}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">
                        无图
                      </div>
                    )}
                  </div>
                  <div className="p-1.5">
                    <div className="text-[9px] text-gray-700 truncate">
                      {it.name || it.category || "灵感"}
                    </div>
                    {it.visualStyle && (
                      <div className="text-[8px] text-gray-400 truncate">
                        {it.visualStyle}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
