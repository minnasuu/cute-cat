// @ts-nocheck
/**
 * MaterialCombo ——「材料组合」工作台。
 *
 * 固定输入形式:名称 + 面料图片 + 款式参考图片 + 其他描述文字。
 * AI 结合品牌信息自动设计创作,固定输出白底效果图。
 *
 * 流程:
 *   1. 用户填写表单(名称 / 面料图 / 款式参考图 / 描述)
 *   2. 上传两张图到后端,后端用 Ark 视觉模型分析面料 + 款式
 *   3. 结合品牌信息 + 描述生成英文 prompt,调 Maizi 出白底效果图
 *   4. 展示效果图,支持重新生成 / 保存到 Lookbook
 */
import { useState, useRef } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import { useDesignStore } from "../store/design";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { compressForUpload } from "../lib/images";

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

export default function MaterialComboPage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const store = useDesignStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fabricFile, setFabricFile] = useState<File | null>(null);
  const [fabricPreview, setFabricPreview] = useState<string>("");
  const [styleFile, setStyleFile] = useState<File | null>(null);
  const [stylePreview, setStylePreview] = useState<string>("");

  const [generating, setGenerating] = useState(false);
  const [image, setImage] = useState<{ url: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fabricInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !!name.trim() && !!fabricFile && !!styleFile && !generating && !brandLoading && !knowledgeLoading;

  function pickFile(which: "fabric" | "style", file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (which === "fabric") { setFabricFile(file); setFabricPreview(url); }
    else { setStyleFile(file); setStylePreview(url); }
  }

  async function submit() {
    if (!canSubmit || !teamId) return;
    setGenerating(true);
    setError(null);
    setImage(null);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      // 面料图 + 款式参考图上传前前端先压缩(减少传输体积),服务端会再做一次 sharp 压缩兜底
      fd.append("fabric", await compressForUpload(fabricFile!));
      fd.append("style", await compressForUpload(styleFile!));
      // 品牌信息以 JSON 字符串注入,后端直接用于 prompt
      if (knowledge?.brand) fd.append("brand", JSON.stringify(knowledge.brand));

      const res = await fetch(teamApi(teamId).chatUrl.replace("/chat", "/design/material-combo"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      const img = data?.images?.[0];
      if (img?.url) {
        setImage({ url: img.url, prompt: img.prompt || "" });
      } else {
        throw new Error(data?.images?.[0]?.error || "生成失败,请重试");
      }
    } catch (e: any) {
      setError(e?.message || "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function saveToLookbook() {
    if (!image || !teamId) return;
    const now = new Date().toISOString();
    const brandColors = (knowledge?.brand?.colors || []).map((c: any) => c?.bg || c).filter(Boolean);
    const product = {
      mode: "material-combo",
      title: name.trim() || "未命名材料组合",
      description: description.trim() || "",
      colors: brandColors,
      images: [{ slot: "final", label: "白底效果图", url: image.url }],
      aiDraftRaw: JSON.stringify({ prompt: image.prompt, name, description }),
      status: "draft",
      statusHistory: [{ id: crypto.randomUUID(), status: "draft", at: now, actor: "atelier" }],
    };
    try {
      await store.upsertProduct(product);
      navigateTab("lookbook");
    } catch (e: any) {
      setError(`保存失败: ${e?.message || ""}`);
    }
  }

  const inputCls = "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] h-[calc(100vh-64px)] min-h-0">
      {/* 左:表单 */}
      <div className="overflow-y-auto bg-white">
        <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <h1 className="text-[15px] font-medium text-gray-800">材料组合</h1>
          <span className="text-[11px] text-gray-500">名称 + 面料图 + 款式参考 + 描述 → 白底效果图</span>
        </header>

        <div className="p-6 space-y-5 max-w-2xl">
          {/* 名称 */}
          <div>
            <label className={labelCls}>名称 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如:春日雏菊连衣裙" className={inputCls} />
          </div>

          {/* 面料图片 */}
          <div>
            <label className={labelCls}>面料图片 *</label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => fabricInputRef.current?.click()}
                className="w-28 h-28 rounded-xl border border-dashed border-gray-300 bg-gray-50 overflow-hidden shrink-0 cursor-pointer hover:border-primary-400 transition-colors"
              >
                {fabricPreview ? (
                  <img src={fabricPreview} alt="面料" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-gray-400 gap-1">
                    <span className="text-lg">+</span>
                    <span>上传面料图</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input ref={fabricInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => pickFile("fabric", e.target.files?.[0] || null)} />
                <button onClick={() => fabricInputRef.current?.click()}
                  className="text-[11px] text-primary-600 hover:underline text-left">
                  {fabricFile ? "更换图片" : "选择图片"}
                </button>
                {fabricFile && (
                  <button onClick={() => { setFabricFile(null); setFabricPreview(""); }}
                    className="text-[11px] text-gray-500 hover:underline text-left">移除</button>
                )}
                <span className="text-[10px] text-gray-400">面料实拍 / 纹理图,AI 会提取材质、色彩、质感</span>
              </div>
            </div>
          </div>

          {/* 款式参考图片 */}
          <div>
            <label className={labelCls}>款式参考图片 *</label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => styleInputRef.current?.click()}
                className="w-28 h-28 rounded-xl border border-dashed border-gray-300 bg-gray-50 overflow-hidden shrink-0 cursor-pointer hover:border-primary-400 transition-colors"
              >
                {stylePreview ? (
                  <img src={stylePreview} alt="款式参考" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-gray-400 gap-1">
                    <span className="text-lg">+</span>
                    <span>上传款式参考</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <input ref={styleInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => pickFile("style", e.target.files?.[0] || null)} />
                <button onClick={() => styleInputRef.current?.click()}
                  className="text-[11px] text-primary-600 hover:underline text-left">
                  {styleFile ? "更换图片" : "选择图片"}
                </button>
                {styleFile && (
                  <button onClick={() => { setStyleFile(null); setStylePreview(""); }}
                    className="text-[11px] text-gray-500 hover:underline text-left">移除</button>
                )}
                <span className="text-[10px] text-gray-400">款式图 / 走秀图 / 参考衣型,AI 会提取廓形、结构、细节</span>
              </div>
            </div>
          </div>

          {/* 其他描述 */}
          <div>
            <label className={labelCls}>其他描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="补充设计想法、穿着场景、目标人群、特殊工艺要求等(可选)"
              className={`${inputCls} resize-none`} />
          </div>

          {/* 品牌信息提示 */}
          {knowledge?.brand && (knowledge.brand.nameZh || knowledge.brand.nameEn) && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
              <span className="text-gray-500">品牌信息:</span> {knowledge.brand.nameZh}{knowledge.brand.nameEn ? ` (${knowledge.brand.nameEn})` : ""}
              {knowledge.brand.voice ? ` · ${knowledge.brand.voice}` : ""}
              <span className="text-gray-400 ml-1">(自动注入设计 prompt)</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">⚠ {error}</div>
          )}

          {/* 提交 */}
          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={!canSubmit}
              className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white font-medium text-sm shadow-lg transition-colors">
              {generating ? "生成中…" : "生成白底效果图"}
            </button>
            {generating && (
              <span className="text-[11px] text-gray-500">AI 正在分析面料与款式,约需 30–60 秒…</span>
            )}
          </div>
        </div>
      </div>

      {/* 右:结果预览 */}
      <aside className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">白底效果图</div>
        {generating ? (
          <div className="aspect-square max-w-[320px] rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-400 text-sm">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <span className="text-[11px]">生成中…</span>
            </div>
          </div>
        ) : image ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <img src={image.url} alt="白底效果图" className="w-full h-full object-contain bg-white" />
            </div>
            {image.prompt && (
              <details className="text-[11px] text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">查看生成 prompt</summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-600">{image.prompt}</p>
              </details>
            )}
            <div className="flex gap-2">
              <button onClick={submit} disabled={generating}
                className="flex-1 text-[12px] border border-gray-200 hover:border-gray-300 text-gray-600 px-3 py-2 rounded-lg font-medium transition-colors">
                重新生成
              </button>
              <button onClick={saveToLookbook}
                className="flex-1 text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
                保存到 Lookbook
              </button>
            </div>
          </div>
        ) : (
          <div className="aspect-square max-w-[320px] rounded-xl border border-dashed border-gray-300 bg-white flex items-center justify-center text-center text-[12px] text-gray-400 px-6">
            填写左侧表单并点击<br />「生成白底效果图」
          </div>
        )}
      </aside>
    </div>
  );
}
