// @ts-nocheck
/**
 * Composer —— Laisse Ancie 时尚设计主工作台(多阶段工作流)。
 *
 * 阶段流程:
 *   greeting      → 开场欢迎
 *   brainstorming → 用户输入主题后,脑暴 3 个差异化方向供选择
 *   planning      → 用户选方向后输出详细方案,支持 chat 调整,确认后进入生成
 *   generating    → 调用生图服务批量出图
 *   presenting    → 展示图片 + 可 chat 修图
 *
 * 每轮 AI 回复末尾用 <!--STAGE:xxx--> 标记当前阶段,前端解析推进 UI。
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDesignStore } from "../store/design";
import { useSkillStore } from "../store/skill";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import { PromptBar } from "../components/PromptBar";
import { apiClient } from "../lib/api";
import { MODE_LABEL, type DesignMode, type Product } from "../types/design";
import type { VisualAsset } from "../types/visual-asset";
import type { InspirationItem, MaterialRow } from "../store/resource";
import type { SkillArticle } from "../types/skill";
import { buildKnowledgeInjectors, type KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { Markdown } from "../lib/markdown";

type DesignStage = "greeting" | "brainstorming" | "planning" | "generating" | "presenting";

const STAGE_MARKER = /<!--STAGE:(\w+)-->/;

// 可选 AI 模型列表(与后端 workflow-executor 的 stream 函数对应)
const MODELS = [
  { id: "longcat", label: "LongCat-2.0", hint: "Anthropic 兼容" },
  { id: "glm", label: "GLM", hint: "智谱" },
  { id: "qwen", label: "Qwen", hint: "通义千问" },
] as const;
type ModelId = typeof MODELS[number]["id"];

/** 设计顾问总 prompt:引导 AI 走完多阶段工作流。 */
const DESIGNER_SYSTEM = `你是 Laisse Ancie (来兮·安兮)的资深设计总监。你的工作不是一次性输出 JSON,而是通过多轮对话引导用户完成一套完整的设计流程。

## 工作流阶段(精简为 4 步)

### 阶段 1 · greeting(开场)
前端已在 Chat 区显示欢迎卡,你**不要再重复开场白**。用户输入主题后直接进入阶段 2(brainstorming)。加 <!--STAGE:greeting-->。

### 阶段 2 · brainstorming(三方向脑暴)——用户输入主题后的第一步
用户说出主题(无论多简略),立刻给出 **3 个差异化方向**供选择。每个方向包含:
- **方向名**(4-6 字,有调性)
- **一句话核心概念**
- **关键元素组合**(材质 / 色彩 / 形态 / 细节)
- **与品牌调性(优雅/松弛/乐趣)的关联**

**方向必须差异化**: 覆盖不同的风格路线(如一个偏优雅、一个偏趣味、一个偏极简),让用户有真实的选择空间。

**品类自适应**:
- **插画(illustration)**: 围绕主题给出 3 种艺术风格/氛围方向(如水彩治愈 / 扁平复古 / 线条写意)。**不要问季节、穿着场合**——插画不需要这些。
- **单品(single)**: 品类范围是**服装、包袋、配饰(首饰/帽子/围巾等)、家居(抱枕/香薰/餐具等)、文创(明信片/贴纸/手账等)**——按用户说的品类给方向,不要默认是衣服。如用户说"包包",就围绕包包给出 3 种款型/风格方向。
- **系列(collection)**: 给出 3 种主题叙事/色彩情绪方向。

末尾提示「选一个方向,或告诉我你的想法」并加 <!--STAGE:brainstorming-->。

### 阶段 3 · planning(详细方案 + chat 调整)
用户选定方向后,输出一份**完整设计企划**:
- 产品名 + 主题叙述(一段话)
- 材质与色彩方案(具体色值/色号)
- 形态/结构细节(闭合方式、工艺细节等)
- 目标价格带
- 指明「材料库的 ×× 面料」+「呼应灵感图的 ×× 元素」

末尾问「确认这份方案,开始生成设计图吗? 也可以告诉我你想调整的地方」并加 <!--STAGE:planning-->。

**chat 调整**: 用户确认前如果提出修改意见(如"颜色换成蓝色""加上刺绣"),你在当前方案基础上修改并重新输出完整方案,保持 <!--STAGE:planning-->。

### 阶段 4 · generating(生成中)
用户确认后,回复「开始生成设计图…」并加 <!--STAGE:generating-->。
前端会自动调起图片生成,你不需要做其他事。

### 阶段 5 · presenting(展示与迭代)
图片生成后,展示给用户,并主动询问是否需要调整。
用户描述修改意见后,给出专业反馈并加 <!--STAGE:presenting-->。
前端会自动重新生成修改的那张图。

## 贴近叙事与素材(硬约束)
- 每轮给出的设计方向必须贴近「材料库」中的面料与工艺 — 从真实可用的面料出发,而不是空想。
- 风格方向必须参考「灵感图」的 AI 分析结果(归类 / 廓形 / 配色 / 风格特色 / 设计手法 / 灵感元素),做出一脉相承的延展,而不是另起炉灶。
- **每条方案/产品描述里必须至少明确引用 1 条真实素材**,格式如「—— 材料:真丝电力纺(#M012)」「—— 灵感:复古玫瑰油画(#I037)的配色」。素材名称与编号必须与材料库/灵感图里存在的條目对应,不要凭空编造。
- 如果当前材料库或灵感图为空,直接告知用户「目前素材库还是空的,建议先到左侧上传灵感图或材料后再开始设计」,并加对应阶段的 STAGE 标记。

## 重要规则
- 每轮回复末尾必须加 <!--STAGE:当前阶段--> 标记
- 用中文对话,专业但不生硬,体现 Laisse Ancie 的「优雅·松弛·乐趣」调性
- 用户输入主题后直接给 3 个方向,不要先问一轮问题(季节/客群/面料等)——方向里自然体现这些维度的选择
- 插画/文创绝不问"季节""穿着场合"除非用户主动提
- 单品品类可以是服装/包包/配饰/家居/文创,按用户说的来,不要默认是衣服
- 不要输出 JSON(前端不再解析 JSON,只解析阶段标记)`;

function parseStage(text: string): DesignStage | null {
  const m = text.match(STAGE_MARKER);
  return m ? (m[1] as DesignStage) : null;
}

function stripStageMarker(text: string): string {
  return text.replace(STAGE_MARKER, "").trim();
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  product?: Product;
}

interface GeneratedImage {
  slot: string;
  label: string;
  url?: string;
  prompt?: string;
  error?: string;
}

export default function ComposerPage({
  mode: modeProp,
  knowledge,
  brandLoading,
  knowledgeLoading,
}: {
  mode?: DesignMode;
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}) {
  const params = useParams<{ mode: DesignMode }>();
  const mode = modeProp ?? params.mode ?? "single";
  const store = useDesignStore();
  const skillStore = useSkillStore();
  const { teamId, navigateTab } = useCurrentTeam();

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [stage, setStage] = useState<DesignStage>("greeting");
  const [planText, setPlanText] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [model, setModelState] = useState<ModelId>(() => {
    const saved = localStorage.getItem("laisse-ancie:model");
    return (MODELS.some((m) => m.id === saved) ? saved : "longcat") as ModelId;
  });
  const setModel = (id: ModelId) => { setModelState(id); localStorage.setItem("laisse-ancie:model", id); };
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  // 开场自动发一条 assistant 消息
  useEffect(() => {
    if (msgs.length === 0 && !busy) {
      setMsgs([{
        id: "greeting",
        role: "assistant",
        text: "欢迎来到 Laisse Ancie 设计工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…),或者直接说品类(连衣裙、托特包、香薰、贴纸…),我帮你脑暴 3 个设计方向。\n\n可选方向类型:\n- **插画** — 一张艺术插画(主视觉 / 印花 / 图案)\n- **单品** — 服装 / 包袋 / 配饰 / 家居 / 文创(输出 4 张设计图)\n- **系列** — 一个完整系列(系列总览 + 每款 4 张图)",
      }]);
      setStage("greeting");
    }
  }, []);

  async function send(raw: string) {
    if (!raw.trim() || busy || knowledgeLoading) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: raw.trim() };
    setMsgs((xs) => [...xs, userMsg]);
    setBusy(true);

    const assistantId = crypto.randomUUID();
    setMsgs((xs) => [...xs, { id: assistantId, role: "assistant", text: "" }]);

    // 构造 system prompt(设计顾问 + 知识注入)
    const history = [...msgs, userMsg].map((m) => `[${m.role}] ${m.text.replace(STAGE_MARKER, "").trim()}`).join("\n\n");
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge)
        .map((inj) => inj(raw, knowledge))
        .filter(Boolean)
        .join("\n\n")
      : "";
    const system = knowledgeBlock
      ? `${DESIGNER_SYSTEM}\n\n## 团队知识库(自动注入)\n${knowledgeBlock}`
      : DESIGNER_SYSTEM;

    const streamTimeoutMs = 290_000;
    const ac = new AbortController();
    const timeoutId = globalThis.setTimeout(() => ac.abort(), streamTimeoutMs);

    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ system, prompt: history, model, maxTokens: 2048 }),
        signal: ac.signal,
      });

      if (!res.ok) {
        let errMsg = `请求失败(HTTP ${res.status})`;
        try { const j = await res.json(); if (j?.error) errMsg = j.error; } catch { /* */ }
        setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: `⚠ ${errMsg}` } : m));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: "⚠ 当前浏览器不支持流式响应" } : m));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) { currentEvent = ""; continue; }
          if (trimmed.startsWith(":")) continue;
          if (trimmed.startsWith("event: ")) { currentEvent = trimmed.slice(7).trim(); continue; }
          if (trimmed.startsWith("data: ")) {
            let payload: any = null;
            try { payload = JSON.parse(trimmed.slice(6)); } catch { continue; }
            if (currentEvent === "chunk" && payload?.text) {
              accumulated += payload.text;
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: stripStageMarker(accumulated) } : m));
            } else if (currentEvent === "done") {
              const finalText = stripStageMarker(payload?.text ?? accumulated);
              const newStage = parseStage(payload?.text ?? accumulated) || stage;
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: finalText } : m));
              setStage(newStage);
              // 保存 plan text(用于后续图片生成)
              if (newStage === "planning" || newStage === "brainstorming") {
                setPlanText(finalText);
              }
            } else if (currentEvent === "error") {
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: `⚠ 生成失败: ${payload?.error ?? "未知错误"}` } : m));
            }
          }
        }
      }
    } catch (err: any) {
      let msg = err?.message || "未知错误";
      if (err instanceof DOMException && err.name === "AbortError") msg = "生成超时(当前上限约 290s),请稍后重试或精简 prompt";
      setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: `⚠ ${msg}` } : m));
    } finally {
      globalThis.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  // 用户确认企划 → 批量生成设计图
  async function startGeneration() {
    if (generating) return;
    setGenerating(true);
    setStage("generating");
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: "开始生成设计图…" }]);
    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", "/design/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, plan: planText }),
      });
      // 504/代理层返回 HTML 时,res.json() 会抛 "Unexpected token '<'" —— 先校验避免无意义报错
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      setImages(data.images || []);
      setStage("presenting");
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: "✨ 设计图已生成! 看看这套作品,有需要调整的地方随时告诉我。" }]);
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败: ${e.message}` }]);
      setStage("planning");
    } finally {
      setGenerating(false);
    }
  }

  // 单图修图
  async function regenerateOne(slot: string, label: string, instruction: string) {
    if (!instruction.trim()) return;
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "user", text: `修改「${label}」: ${instruction}` }]);
    setBusy(true);
    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", "/design/regenerate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slot, label, plan: planText, instruction }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      if (data.url) {
        setImages((prev) => prev.map((im) => im.slot === slot ? { ...im, url: data.url, prompt: data.prompt } : im));
        setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `✅ 已更新「${label}」` }]);
      } else {
        setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 修图失败: ${data.error || "未知错误"}` }]);
      }
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 修图失败: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  // 把本次设计(图片+企划)录入 Lookbook
  async function saveToLookbook() {
    if (images.length === 0) return;
    const now = new Date().toISOString();
    const mainImage = images.find((im) => im.url);
    // 收集所有可访问的图片 URL
    const imageUrls = images.filter((im) => im.url).map((im) => im.url);
    const product: Product = {
      id: crypto.randomUUID(),
      mode,
      title: `Design ${now.slice(0, 10)}`,
      description: planText,
      seasons: [],
      category: mode,
      colors: [],
      tech_pack_url: mainImage?.url,
      aiDraftRaw: JSON.stringify({ plan: planText, images }),
      status: "draft",
      statusHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await store.upsertProduct(product);
      // 录入成功 → 跳转到 Lookbook
      navigateTab("lookbook");
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 录入失败: ${e.message}` }]);
    }
  }

  const canGenerate = stage === "planning" && !generating;
  const showImages = stage === "presenting" || (stage === "generating" && images.length > 0);

  return (
    <div className="grid grid-cols-[1fr_360px] h-[calc(100vh-64px)] min-h-0">
      <div className="flex flex-col min-h-0">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-baseline gap-2">
            <button onClick={() => navigateTab("__design__")} className="text-sm text-gray-500 hover:text-gray-800">←</button>
            <span className="text-2xl font-semibold text-primary-600">设计工作室</span>
          </div>
          {/* 模型切换下拉 */}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            disabled={busy || generating}
            title="切换 AI 模型"
            className="text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-primary-400 disabled:opacity-40"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-gray-500 font-mono capitalize">{stage}</span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4 bg-gray-50">
          {msgs.map((m) => (
            <div key={m.id} className={`rounded-2xl px-4 py-3 max-w-[80%] text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-primary-500 text-white ml-auto rounded-br-sm whitespace-pre-wrap" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
              {m.role === "assistant" ? <Markdown source={m.text} /> : m.text}
            </div>
          ))}
          {busy && (
            <div className="text-gray-500 max-w-[80%] inline-block">生成中…</div>
          )}

          {/* 生成按钮(企划确认后) */}
          {canGenerate && (
            <div className="flex justify-center">
              <button onClick={startGeneration} className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm shadow-lg transition-colors">
                确认方案,开始生成设计图
              </button>
            </div>
          )}

          {/* 生成中 */}
          {generating && (
            <div className="flex justify-center">
              <div className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm">正在生成设计图…</div>
            </div>
          )}

          {/* 设计图展示 */}
          {showImages && images.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">设计图</div>
                {stage === "presenting" && (
                  <button onClick={saveToLookbook} className="text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded-lg font-medium transition-colors">
                    录入 Lookbook
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {images.map((im) => (
                  <ImageCard key={im.slot} image={im} onRegenerate={(inst) => regenerateOne(im.slot, im.label, inst)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <PromptBar
          placeholder={
            knowledgeLoading ? "加载知识库中…" :
              stage === "greeting" ? "输入一个主题(猫咪/玫瑰/海洋/节气/极简…)" :
                stage === "brainstorming" ? "选一个方向(1/2/3),或提出自己的想法…" :
                  stage === "planning" ? "确认方案(OK/开始),或提出修改意见…" :
                    stage === "presenting" ? "描述你想修改的地方…" :
                      "输入…"
          }
          disabled={knowledgeLoading}
          onSubmit={send}
        />
      </div>

      <aside className="border-l border-gray-200 bg-gray-50 p-5 overflow-y-auto min-h-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">设计企划</div>
        {!planText && <p className="text-sm text-gray-500">完成咨询对齐后,这里会显示设计企划。</p>}
        {planText && <p className="text-[12.5px] text-gray-700 whitespace-pre-wrap leading-relaxed">{planText.slice(0, 600)}</p>}
      </aside>
    </div>
  );
}

/** 单张设计图卡片 + 修图输入 */
function ImageCard({ image, onRegenerate }: { image: GeneratedImage; onRegenerate: (inst: string) => void }) {
  const [inst, setInst] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
      <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
        {image.url ? (
          <img src={image.url} alt={image.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">{image.error || "生成失败"}</div>
        )}
      </div>
      <div className="p-2">
        <div className="text-[11px] text-gray-600 font-medium mb-1">{image.label}</div>
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-[10px] text-primary-600 hover:underline">修改</button>
        ) : (
          <div className="flex gap-1">
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="修改意见…"
              className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-primary-500" />
            <button onClick={() => { onRegenerate(inst); setInst(""); setOpen(false); }}
              className="text-[10px] bg-primary-500 text-white px-2 rounded hover:bg-primary-500">生成</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap">{value}</div>
    </div>
  );
}
