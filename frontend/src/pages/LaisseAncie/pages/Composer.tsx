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
import { useIsMobile } from "../../../hooks/use-media-query";
import { teamApi } from "../lib/api";
import { PromptBar } from "../components/PromptBar";
import { apiClient } from "../lib/api";
import { MODE_LABEL, type DesignMode, type Product } from "../types/design";
import type { VisualAsset } from "../types/visual-asset";
import type { InspirationItem, MaterialRow } from "../store/resource";
import type { SkillArticle } from "../types/skill";
import { buildKnowledgeInjectors, type KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { Markdown } from "../lib/markdown";
import { matchInspirations, type MatchedInspiration } from "../lib/inspiration-match";
import type { InspirationItem } from "../store/resource";

type DesignStage = "greeting" | "brainstorming" | "planning" | "generating" | "presenting";

const STAGE_MARKER = /<!--STAGE:(\w+)-->/;

// 可选 AI 模型列表(与后端 workflow-executor 的 stream 函数对应)
const MODELS = [
  { id: "longcat", label: "LongCat-2.0", hint: "Anthropic 兼容" },
  { id: "glm", label: "GLM", hint: "智谱" },
  { id: "qwen", label: "Qwen", hint: "通义千问" },
] as const;
type ModelId = typeof MODELS[number]["id"];

/** 设计顾问总 prompt:引导 AI 走完 "匹配灵感 → 设计方案 → 确认出图" 三步工作流。 */
const DESIGNER_SYSTEM = `你是 Laisse Ancie (来兮·安兮)的资深设计总监。你的工作不是一次性输出 JSON,而是通过多轮对话引导用户完成一套以灵感为核心的设计流程。

## 工作流(3 步)

### 步骤 1 · references(匹配灵感借鉴)= 前端已完成后置处理,你无需处理这一步
前端根据用户输入已从灵感库中匹配出 3 个最相关的灵感借鉴(会作为「参考灵感」卡片嵌在对话里)。
你只需在下一步方案中**显式引用**这些灵感即可,不要再自己重新推荐灵感。

### 步骤 2 · proposal(生成 1 个整合方案)——必须严格输出
结合下面几部分信息,**输出 1 个完整设计方案**(不要给多个方向让用户选):
1. 「参考灵感」卡片中的 3 张灵感图(会作为 #[灵感ID] 注入到 system prompt,包含其 category / visualStyle / designApproach / inspiration / colors / 图片 URL 等)
2. 「团队知识库」中注入的材料 / 资产 / 品牌 / Lookbook(如已注入)
3. 用户的历史对话上下文、本次 mode(illustration / single / collection)

**方案必须包含:**
- **产品名**(有调性)+ **主题叙述**(2-3 句话,讲清核心概念)
- **灵感借鉴说明**:明确写"从 #[灵感ID1] 汲取 ××、从 #[灵感ID2] 借鉴 ××、呼应 #[灵感ID3] 的 ××"——必须把 3 张灵感都用上
- **材质与色彩方案**:具体色值/色号,指明「材料库 ×× 面料」
- **形态 / 结构 / 细节**:闭合方式、工艺、尺寸感知等(按品类自适应,服装问廓形/包包问款型/家居问肌理/文创问形态……不要默认是衣服)
- **目标价格带**

末尾问「确认这个方案,开始生成设计图吗? 也可以告诉我你想调整的地方」并加 <!--STAGE:proposal-->。

**品类自适应提问**(方案中自然体现,不要再单独问):
- **插画(illustration)**:艺术风格 + 整体氛围即可。**不要问季节、穿着场合**——插画不需要这些。
- **单品(single)**:服装 / 包袋 / 配饰(首饰/帽子/围巾) / 家居(抱枕/香薰/餐具) / 文创(明信片/贴纸/手账)——按用户说的品类写方案
- **系列(collection)**:统一主题/叙事 + 整体色彩情绪

### 步骤 3 · generating(生成中)
用户确认后,回复「开始生成设计图…」并加 <!--STAGE:generating-->。
前端会自动调起图片生成,你不需要做其他事。

### 步骤 4 · presenting(展示与迭代)
图片生成后,主动询问是否需要调整。
用户描述修改意见后,给出专业反馈并加 <!--STAGE:presenting-->。
前端会自动重新生成修改的那张图。

## 贴近叙事与素材(硬约束)
- 方案必须从真实灵感/材料出发,而不是空想。**每份方案必须引用 system prompt 中「参考灵感」的 3 张灵感图**(#[灵感ID] 的形式),说明具体借鉴了它们的什么(配色 / 构图 / 风格 / 元素…)。
- 必须参考「团队知识库」中的面料与工艺,从真实可用的面料出发。指明「材料库 ×× 面料」。
- 引用格式示例:「—— 灵感:#abc123 复古玫瑰油画的配色」「—— 材料:真丝电力纺」。引用的灵感 ID / 材料必须真实存在,不要凭空编造。
- 如果当前灵感库为空,告知用户「灵感库还是空的,建议先到左侧上传灵感图后再开始」;并加 <!--STAGE:proposal-->。

## 重要规则
- 每轮回复末尾必须加 <!--STAGE:当前阶段--> 标记
- 用中文对话,专业但不生硬,体现 Laisse Ancie 的「优雅·松弛·乐趣」调性
- 用户输入后只输出 1 个方案,不要再给 3 个方向让用户选,不要再先问一轮问题(季节/客群/面料等)——方案里自然涵盖
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
  /** 本次回复引用的灵感图(前端匹配后注入,用于渲染「参考灵感」卡片) */
  references?: InspirationItem[];
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
  const [references, setReferences] = useState<InspirationItem[]>([]); // 最近一次匹配到的灵感引用
  const setModel = (id: ModelId) => { setModelState(id); localStorage.setItem("laisse-ancie:model", id); };
  const isMobile = useIsMobile();
  const [planOpen, setPlanOpen] = useState(false); // 移动端企划抽屉开关
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
        text: "欢迎来到 Laisse Ancie 设计工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…),或者直接说品类(连衣裙、托特包、香薰、贴纸…),我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 素材 / 知识,生成 1 个完整方案\n3️⃣ 你确认后,生成设计图\n\n可选方向类型:\n- **插画** — 一张艺术插画(主视觉 / 印花 / 图案)\n- **单品** — 服装 / 包袋 / 配饰 / 家居 / 文创(输出 4 张设计图)\n- **系列** — 一个完整系列(系列总览 + 每款 4 张图)",
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

    // ── 步骤 1:前端本地匹配 3 个最相关的灵感借鉴 ──
    const matchedRefs = matchInspirations(raw, knowledge?.inspirations ?? [], 3);
    setReferences(matchedRefs);
    const referencesBlock = matchedRefs.length
      ? [
          "## 参考灵感(前端已匹配,方案必须引用以下 3 张灵感,用 #[ID] 的形式)",
          ...matchedRefs.map((it) => [
            `### #[${it.id}] ${it.category ?? "general"}`,
            it.visualStyle ? `风格: ${it.visualStyle}` : null,
            it.designApproach ? `设计手法: ${it.designApproach}` : null,
            it.colors?.length ? `配色: ${it.colors.join(", ")}` : null,
            it.inspiration?.length ? `启发:\n${it.inspiration.map((h) => `- ${h}`).join("\n")}` : null,
            `图片: ${it.thumbUrl || it.url}`,
          ].filter(Boolean).join("\n")),
        ].join("\n\n")
      : "## 参考灵感\n(灵感库为空,建议先到左侧上传灵感图)";

    // 构造 system prompt(设计顾问 + 参考灵感 + 知识注入)
    const history = [...msgs, userMsg].map((m) => `[${m.role}] ${m.text.replace(STAGE_MARKER, "").trim()}`).join("\n\n");
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge)
        .map((inj) => inj(raw, knowledge))
        .filter(Boolean)
        .join("\n\n")
      : "";
    const system = [
      DESIGNER_SYSTEM,
      referencesBlock,
      knowledgeBlock ? `## 团队知识库(自动注入)\n${knowledgeBlock}` : "",
    ].filter(Boolean).join("\n\n");

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
              // 附带灵感引用(渲染「参考灵感」卡片)——仅在 proposal 阶段注入
              const withRefs = newStage === "proposal" || newStage === "references" || stage === "greeting"
                ? { text: finalText, references: matchedRefs }
                : { text: finalText };
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, ...withRefs } : m));
              setStage(newStage);
              // 保存 plan text(用于后续图片生成)
              if (newStage === "planning" || newStage === "brainstorming" || newStage === "proposal") {
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
    // 收集所有可访问的图片(结构化数组,供 Lookbook 直接展示缩略图)
    const productImages = images.filter((im) => im.url).map((im) => ({ slot: im.slot, label: im.label, url: im.url }));
    const product: Product = {
      id: crypto.randomUUID(),
      mode,
      title: `Design ${now.slice(0, 10)}`,
      description: planText,
      seasons: [],
      category: mode,
      colors: [],
      tech_pack_url: mainImage?.url,
      images: productImages,
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
    <>
    <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] h-[calc(100vh-64px)] min-h-0">
      <div className="flex flex-col min-h-0">
        <header className="flex items-center justify-between px-3 md:px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-baseline gap-2 min-w-0">
            <button onClick={() => navigateTab("__design__")} className="text-sm text-gray-500 hover:text-gray-800 shrink-0">←</button>
            <span className="text-lg md:text-2xl font-semibold text-primary-600 truncate">设计工作室</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 模型切换下拉 */}
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              disabled={busy || generating}
              title="切换 AI 模型"
              className="hidden sm:block text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-primary-400 disabled:opacity-40"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {/* 移动端:查看企划按钮(有企划时显示) */}
            {isMobile && planText && (
              <button
                onClick={() => setPlanOpen(true)}
                className="text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600"
              >
                企划
              </button>
            )}
            <span className="text-[11px] text-gray-500 font-mono capitalize">{stage}</span>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4 bg-gray-50">
          {msgs.map((m) => (
            <div key={m.id} className={`rounded-2xl px-4 py-3 max-w-[85%] text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-primary-500 text-white ml-auto rounded-br-sm whitespace-pre-wrap" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
              {/* 灵感引用卡片(仅 assistant 消息附带 references 时渲染) */}
              {m.role === "assistant" && m.references && m.references.length > 0 && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">参考灵感 · 方案将借鉴这 {m.references.length} 张</div>
                  <div className="flex gap-2 overflow-x-auto">
                    {m.references.map((ref) => (
                      <div key={ref.id} className="shrink-0 w-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50" title={`${ref.category ?? ""}${ref.visualStyle ? ` · ${ref.visualStyle}` : ""}`}>
                        <div className="aspect-[3/4] bg-gray-100 overflow-hidden">
                          <img src={ref.thumbUrl || ref.url} alt={ref.category ?? "inspiration"} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="px-1.5 py-1">
                          <div className="text-[10px] text-gray-700 font-medium truncate">{ref.category ?? "灵感"}</div>
                          {ref.visualStyle && <div className="text-[9px] text-gray-400 truncate">{ref.visualStyle}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
              <div className={images.length === 1 ? "max-w-sm mx-auto" : "grid grid-cols-2 gap-2 md:gap-3"}>
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

      {/* 桌面端设计企划侧边栏(≥md 直出) */}
      <aside className="hidden md:block border-l border-gray-200 bg-gray-50 p-5 overflow-y-auto min-h-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">设计企划</div>
        {!planText && <p className="text-sm text-gray-500">完成方案后,这里会显示设计企划。</p>}
        {planText && <p className="text-[12.5px] text-gray-700 whitespace-pre-wrap leading-relaxed">{planText.slice(0, 600)}</p>}
      </aside>
    </div>
    {/* 移动端企划抽屉(<md,跟主内容同级渲染) */}
    {isMobile && <ComposerPlanDrawer planText={planText} open={planOpen} onClose={() => setPlanOpen(false)} />}
    </>
  );
}

/** 移动端设计企划抽屉(<md 才渲染),挂在 Composer 外层由父组件组合。 */
export function ComposerPlanDrawer({ planText, open, onClose }: { planText: string; open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-72 max-w-[85vw] bg-white border-l border-gray-200 shadow-xl p-4 overflow-y-auto transition-transform duration-200 md:hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">设计企划</div>
          <button
            onClick={onClose}
            ariaLabel="关闭企划"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {!planText && <p className="text-sm text-gray-500">完成方案后,这里会显示设计企划。</p>}
        {planText && <p className="text-[12.5px] text-gray-700 whitespace-pre-wrap leading-relaxed">{planText.slice(0, 600)}</p>}
      </aside>
    </>
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
