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
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDesignStore } from "../store/design";
import { useSkillStore } from "../store/skill";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { useIsMobile } from "../../../hooks/use-media-query";
import { teamApi } from "../lib/api";
import { PromptBar } from "../components/PromptBar";
import { apiClient } from "../lib/api";
import { MODE_LABEL, type DesignMode, type Product, type MaterialRecommendation } from "../types/design";
import type { VisualAsset } from "../types/visual-asset";
import type { InspirationItem } from "../store/resource";
import type { SkillArticle } from "../types/skill";
import { buildKnowledgeInjectors, type KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { Markdown } from "../lib/markdown";
import { parseDesignIntent, hasLetteringElement, categorizeCategory, type DesignIntent } from "../lib/design-intent";
import { matchInspirations, type MatchedInspiration } from "../lib/inspiration-match";
import { parseDesignProposal, extractHexColors } from "../lib/design-proposal";
import { useEditingProduct } from "../contexts/editing-product";
import { useAuth } from "../../../contexts/AuthContext";
import { useComposerPrompt } from "../contexts/composer-prompt";
import { ImageCard, LiveElapsed, Field, type GeneratedImage } from "./image-card";
import { RecForm } from "./rec-form";
import ComposerBrief from "./ComposerBrief";
import { GenerateButton, AI_COST_PER_IMAGE } from "../../../components/GenerateButton";
import ComposerPipeline from "./ComposerPipeline";

type DesignStage =
  | "greeting"
  | "references"
  | "proposal"
  | "brainstorming"
  | "planning"
  | "generating"
  | "presenting"
  | "presenting-html"
  // 线稿→推荐材质→成图(仅 single / collection)
  | "generating-lineart"
  | "presenting-lineart"
  | "material-recommend"   // AI 推荐材质+配色(用户确认/编辑中)
  | "generating-final";

const STAGE_MARKER = /<!--STAGE:(\w+)-->/;

// AI 模型列表(后端唯一文本模型: 豆包 doubao-seed-2-1-pro,火山方舟)
const MODELS = [
  { id: "ark", label: "豆包Seed", hint: "doubao-seed-2-1-pro" },
] as const;
type ModelId = typeof MODELS[number]["id"];

/** 设计顾问总 prompt:引导 AI 走完 "汲取灵感库 → 设计方案 → 确认出图" 三步工作流。 */
const DESIGNER_SYSTEM = `你是 Laisse Ancie (来兮·安兮)的品牌服装、单品、视觉设计师。你的工作不是一次性输出 JSON,而是通过多轮对话引导用户完成一套以灵感库为核心的设计流程。

## 工作流(3 步)

### 步骤 1 · 汲取品牌风格灵感池(最关键的一步)
前端已把整个灵感库作为「品牌风格灵感池」注入到 system prompt(每张灵感一行摘要,标记 #[ID])。
这个灵感库就是品牌积淀的全部视觉资产,是你的**唯一设计出发点**——不要在对话里再让用户上传/推荐灵感,直接从库里汲取:
- 对应用户想要的品类/元素/场景,从灵感池中挑选最契合的 2-4 张作为本次方案的借鉴来源
- 汲取维度可以是:配色、构图、风格、设计手法、图形元素、肌理、氛围……自由组合
- 引用时用 #[ID] 标注具体借鉴了谁(如「从 #[abc123] 汲取复古玫瑰配色,呼应 #[def456] 的满铺构图」),让用户可溯源

### 步骤 2 · proposal(生成 1 个整合方案)——必须严格输出
结合下面几部分信息,**输出 1 个完整设计方案**(不要给多个方向让用户选):
1. 「品牌风格灵感池」中你挑出的那几张灵感(已作为 #[ID] 注入到 system prompt,含 category / visualStyle / designApproach / 配色 / 特征等)
2. 「团队知识库」中注入的资产 / 品牌 / Lookbook(如已注入)
3. 用户的历史对话上下文、本次 mode(illustration / single / collection)

**方案必须包含:**
- **产品名**(有调性)+ **主题叙述**(2-3 句话,讲清核心概念)
- **灵感借鉴说明**:明确写出从灵感池中哪几张汲取什么,用 #[ID] 标注(如「从 #[abc123] 汲取 ××、呼应 #[def456] 的 ××」)——不要求把整张库都用上,挑最契合的即可
- **材质与色彩方案**:具体色值/色号,指明「材料库 ×× 面料，如果库中没有符合要求的材料，可以根据实际进行调整」
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
- 方案必须从真实灵感/材料出发,而不是空想。**每份方案必须从「品牌风格灵感池」中挑选 2-4 张最契合的灵感作为借鉴来源**,用 #[ID] 标注,说明具体借鉴了什么(配色 / 构图 / 风格 / 元素…)。
- 必须参考「团队知识库」中的面料与工艺,从真实可用的面料出发。如果库中没有符合要求的材料，可以根据实际进行调。
- 引用格式示例:「—— 灵感:#abc123 复古玫瑰油画的配色」「—— 材料:纯棉」。
- 如果当前灵感库为空,告知用户「灵感库还是空的,建议先到左侧上传灵感图后再开始」;并加 <!--STAGE:proposal-->。

## 品牌印花/图形元素作为方案组成部分(硬约束)
当「参考灵感 / 团队知识库」注入块里出现了**品牌印花文案**(如「推荐品牌印花文案:"Good morning, It's another beautiful day."」),意味着用户想做**字母/文字/标语**类单品。方案中**必须**把 brand slogan 作为印花/图形的核心文字元素来设计,不能跳过或一笔带过:
- 具体给出「文字排版方案」:位置 / 字体风格 / 字号层级 / 配色 / 与主图形的关系
- 排版四选一(或微调): ① 弧形(前胸/包面环绕) ② 横排居中 ③ 竖排侧缝/侧边 ④ 散落满铺小字
- 字体建议: sans-serif modern / serif editorial / hand-brush script —— 选与灵感 visualStyle 一致的那种
- 配色: 取自灵感中的具体色号;且 slogan 颜色与底色要有足够印刷对比度
- 如果 slogan 较长,可以只取其一两句或适应该排版(但必须保留原句意)
- 不要输出抽象描述"加上品牌标语",要具体:「把 along the upper chest in arched hand-brush serif …」

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

/**
 * 从 AI 回复中提取自包含 HTML(代码块或裸 <html>…</html> 片段)。
 * 插画 HTML 生成路径的解析函数。
 */
function extractHtmlBlock(text: string): string | null {
  const fence = text.match(/```(?:html|HTML)?\s*\n?([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const auto = text.match(/<html[\s\S]*<\/html>/i);
  return auto ? auto[0] : null;
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  product?: Product;
  /** 本次回复引用的灵感图(前端匹配后注入,用于渲染「参考灵感」卡片) */
  references?: InspirationItem[];
  /** 插画最终自包含 HTML(仅 illustration 模式下产出,供画布渲染) */
  html?: string;
  /** 请求耗时(ms),完成后写入 */
  timingMs?: number;
  /** 请求开始时间戳(进行中显示实时耗时) */
  startedAt?: number;
}

/** design-chat 追加的 stage:插画 HTML 稿生成完毕 */
type ExtendedStage = DesignStage | "presenting-html";

/**
 * 插画 HTML 生成的系统 prompt —— 声明「只输出一段自包含 HTML 代码块」,
 * 复用品牌调色板 + 灵感参考。
 */
const ILLUSTRATION_HTML_SYSTEM = `你是 Laisse Ancie (来兮·安兮)的插画师。基于下面确认的设计方案,交付一幅完整、独立、可直接在浏览器打开的插画作品。

## 输出格式硬约束(必须遵守)
- 只输出一段自包含的 HTML 文档(HTML + inline CSS + inline SVG / canvas 绘图),不能有外部资源、不能联网。
- 输出时**只输出一个** \`\`\`html ... \`\`\` 代码块,**代码块外不要有任何解释、说明或对话文字**。
- 画布填满 viewport,整体是 1:1 方形、可印刷的印花 / 图形作品。

## 风格与规则
- 主题 / 元素 / 配色沿用下面的「参考灵感」与「团队知识库」(品牌调色板),与方案保持一致。
- **不要**出现服装、人物、模特、走秀姿势、文字标语。
- 风格:平面矢量 / 水彩 / 现代极简 / 编辑级图案,印刷友好(高清边缘、平涂或渐层)。
- 允许 inline CSS 动画(如缓慢旋转 / 呼吸),让画面"活"起来。

方案确认后立即输出插画 HTML,末尾加 <!--STAGE:presenting-html-->:`;

/** 公共聊天流式 helper —— send / generateHtml / regenerateHtml 共用。
 *  用 fetch 直接流式读取 SSE,teamId 由调用方注入(避免在类函数内用 React hook)。*/
/** 格式化耗时为可读字符串 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem}s`;
}

/** 新手指引开场白(按 mode 给不同引导)。新会话复位时复用。 */
function getGreeting(mode: DesignMode): string {
  return mode === "illustration"
    ? "欢迎来到 Laisse Ancie 插画工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…)和**风格**(水彩、矢量、现代极简、装饰艺术…),我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 品牌 / 知识,生成 1 个插画方案\n3️⃣ 你确认后,生成插画(默认出图,可切换为 HTML 画布)\n\n下方会在你确认方案后出现【图片 / HTML】切换,两种输出都可在这切换。"
    : "欢迎来到 Laisse Ancie 灵感扩散工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…),或者直接说品类(连衣裙、托特包、香薰、贴纸…),我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 品牌 / 知识,生成 1 个完整方案\n3️⃣ 你确认后,生成**设计线稿** → 再选材料 → 生成最终成图\n\n工作流:方案 → 线稿 → 选材料 → 成图";
}

async function streamChat(opts: {
  chatUrl: string;
  system: string;
  prompt: string;
  model: ModelId;
  assistantId?: string;
  maxTokens?: number;
  onStart?: () => void;
  onTick?: (accumulated: string) => void;
  onDone?: (finalText: string, accumulated: string, elapsedMs: number) => void;
}): Promise<void> {
  const { chatUrl, system, prompt, model, maxTokens = 2048, onStart, onTick, onDone } = opts;
  const streamTimeoutMs = 290_000;
  const ac = new AbortController();
  const timeoutId = globalThis.setTimeout(() => ac.abort(), streamTimeoutMs);
  const t0 = Date.now();
  onStart?.();
  try {
    const res = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ system, prompt, model, maxTokens }),
      signal: ac.signal,
    });
    if (!res.ok) {
      let errMsg = `请求失败(HTTP ${res.status})`;
      try { const j = await res.json(); if (j?.error) errMsg = j.error; } catch { /* */ }
      onDone?.(`⚠ ${errMsg}`, `⚠ ${errMsg}`, Date.now() - t0);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      onDone?.("⚠ 当前浏览器不支持流式响应", "⚠ 当前浏览器不支持流式响应", Date.now() - t0);
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
            onTick?.(accumulated);
          } else if (currentEvent === "done") {
            const finalText = stripStageMarker(payload?.text ?? accumulated);
            onDone?.(finalText, payload?.text ?? accumulated, Date.now() - t0);
            return;
          } else if (currentEvent === "error") {
            onDone?.(`⚠ 生成失败: ${payload?.error ?? "未知错误"}`, "", Date.now() - t0);
            return;
          }
        }
      }
    }
    // reader 正常结束但没有 event:done —— 强制收尾
    const finalText = stripStageMarker(accumulated);
    onDone?.(finalText, accumulated, Date.now() - t0);
  } catch (err: any) {
    let msg = err?.message || "未知错误";
    if (err instanceof DOMException && err.name === "AbortError") msg = "生成超时(上限约 290s),请稍后重试或精简 prompt";
    onDone?.(`⚠ ${msg}`, "", Date.now() - t0);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
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
  const { user } = useAuth();
  const { editingProduct, clearEditingProduct } = useEditingProduct();
  const { resetNonce } = useComposerPrompt();

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [stage, setStage] = useState<DesignStage>("greeting");
  const [planText, setPlanText] = useState("");
  const [, setTick] = useState(0); // 触发实时计时器重渲染
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [generating, setGenerating] = useState(false);
  // 当前正在编辑的 Lookbook 产品 id:录入后继续 chat 视为编辑同一产品(原地更新而非复制)
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  // 已录入产品的快照(status / statusHistory / createdAt),再次录入时保留原有工序信息
  const savedProductRef = useRef<Product | null>(null);
  const [model, setModelState] = useState<ModelId>(() => {
    const saved = localStorage.getItem("laisse-ancie:model");
    return (MODELS.some((m) => m.id === saved) ? saved : "ark") as ModelId;
  });
  const [references, setReferences] = useState<InspirationItem[]>([]); // 最近一次匹配到的灵感引用
  const referencesRef = useRef<InspirationItem[]>([]); // ref 镜像,避免 saveToLookbook 闭包读到旧值
  const intentRef = useRef<DesignIntent | null>(null); // 最近一次解析的设计意图,供线稿生成取 top-2 参考灵感
  const [recommendation, setRecommendation] = useState<MaterialRecommendation | null>(null); // AI 推荐的材质+配色方案
  // 结构化设计简报(稳定左栏):名称 + 描述 + 参考灵感,与 chat 管线并存
  const [designName, setDesignName] = useState("");
  const [briefDescription, setBriefDescription] = useState("");
  interface BriefRef { id: string; url: string; name: string; source: "upload" | "library"; category?: string | null; visualStyle?: string | null; analysisStatus?: string | null; }
  const [briefRefs, setBriefRefs] = useState<BriefRef[]>([]);
  const setModel = (id: ModelId) => { setModelState(id); localStorage.setItem("laisse-ancie:model", id); };

  /** 从已解析灵感列表中取最多 2 个 category 作为产品品类展示 */
  const intentCategory = (m: DesignMode): string => {
    const cats = referencesRef.current?.map((r) => r.category).filter(Boolean) ?? [];
    const unique = [...new Set(cats)].slice(0, 2);
    return unique.join(" / ") || MODE_LABEL[m] || m;
  };
  const isMobile = useIsMobile();
  const [planOpen, setPlanOpen] = useState(false); // 移动端企划(单品/系列)抽屉开关
  const [canvasOpen, setCanvasOpen] = useState(false); // 移动端画布(插画)抽屉开关
  const scrollRef = useRef<HTMLDivElement>(null);

  // —— 插画(支持图片 + HTML 两种_output)的状态 ——
  const [illustOutputMode, setIllustOutputMode] = useState<"image" | "html">("image"); // 当前插画产出模式(默认图片)
  const [illustHtml, setIllustHtml] = useState<string | null>(null);     // 当前画布渲染的自包含 HTML
  const [illustBusy, setIllustBusy] = useState(false);                    // 插画生成进行中(不阻塞 chat)
  const [illustMsgId, setIllustMsgId] = useState<string | null>(null);   // 当前展示插画的消息 id(渲染画布入口)
  const [expressMode, setExpressMode] = useState(false);                // 单品极速模式(跳过线稿 + 选材料,直接出图)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  // 极速模式仅单品可用:切到其他模式时自动关闭
  useEffect(() => {
    if (mode !== "single" && expressMode) setExpressMode(false);
  }, [mode]);

  // 开场自动发一条 assistant 消息(按 mode 给不同引导)
  useEffect(() => {
    if (msgs.length === 0 && !busy) {
      setMsgs([{ id: "greeting", role: "assistant", text: getGreeting(mode) }]);
      setStage("greeting");
    }
  }, []);

  // ── 编辑模式:从 Lookbook 跳转过来时,回填产品方案到 chat 上下文 ──
  const editInitializedRef = useRef(false);
  useEffect(() => {
    if (editInitializedRef.current) return;
    const ep = editingProduct;
    if (!ep || mode !== "single") return; // 仅单品模式支持继续编辑
    if (!ep.sections && !ep.description) return;
    editInitializedRef.current = true;

    // 回填方案文本 + 图片 + 材料推荐到 chat
    const rawPlan = ep.sections?.rawPlan || ep.description || "";
    setPlanText(rawPlan);
    if (ep.recommendation) setRecommendation(ep.recommendation);
    if (ep.images?.length) {
      setImages(ep.images.map((im) => ({ slot: im.slot, label: im.label, url: im.url })));
    }
    if (ep.html) {
      setIllustHtml(ep.html);
      setIllustOutputMode("html");
    }

    // 智能判断恢复到哪个阶段:根据已有产物自动跳到最远的完成阶段,
    // 避免每次编辑都从方案重走「方案→线稿→配色→效果图」全流程。
    // 例:只有效果图要改 → 直接落在 presenting,调 PromptBar/卡片即可重生成。
    const resumeStage = (() => {
      if (ep.html) return "presenting-html";
      const hasFinal = (ep.images ?? []).some((im) => im.slot === "final");
      const hasLineart = (ep.images ?? []).some((im) => im.slot === "lineart");
      const hasImages = (ep.images ?? []).length > 0;
      if (hasFinal) return "presenting";
      if (hasLineart) return "presenting-lineart";
      if (hasImages) return "presenting";
      return "proposal";
    })();
    setStage(resumeStage);

    // 构建 3 条欢迎消息:①产品条 ②灵感条 ③方案条
    const title = ep.sections?.productName || ep.title || "未命名款式";
    const matchInfo = (ep.sections?.inspirationRefs || []).map((r) => {
      const refAsset = knowledge?.inspirations?.find((i) => i.id === r.id);
      return `${refAsset?.category ?? "灵感"} #${r.id.slice(0, 8)}${r.summary ? " — " + r.summary : ""}`;
    }).join("\n");

    // 按恢复阶段给出对应引导,让用户知道可以直接定点修改而非重走全流程
    const stageHint = resumeStage === "presenting"
      ? "已载入最终效果图。告诉我要调整哪里,我会按你的要求直接重新生成。"
      : resumeStage === "presenting-lineart"
        ? "已载入设计线稿。可以修改单张线稿,或确认后进入选材料。"
        : resumeStage === "presenting-html"
          ? "已载入插画 HTML 画布。告诉我调整方向即可重出。"
          : "已载入设计方案。确认出图,或提出修改意见。";
    const welcome: ChatMsg[] = [
      {
        id: crypto.randomUUID(), role: "assistant",
        text: `🔄 已载入 **${title}** 的设计上下文。\n${stageHint}`,
      },
      ...(matchInfo ? [{
        id: crypto.randomUUID(), role: "assistant" as const,
        text: `📎 引用的灵感:\n${matchInfo}`,
      }] : []),
    ];
    setMsgs(welcome);

    // 编辑模式:记录当前产品 id 与快照,后续 chat / 再次录入视为编辑同一产品
    if (ep.id) {
      setCurrentProductId(ep.id);
      savedProductRef.current = ep;
    }

    // 清空编辑上下文(避免重复注入)
    clearEditingProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProduct]);

  // 「制作相似」新会话信号:nonce 变化时强制清空工作台(无确认),等同于 +新会话
  const resetNonceRef = useRef(resetNonce);
  useEffect(() => {
    if (resetNonceRef.current !== resetNonce) {
      resetNonceRef.current = resetNonce;
      forceResetSession();
    }
  }, [resetNonce]);

  /** 强制新会话(无确认):清空聊天窗口与 AI 上下文,回到开场白重新开始一个全新设计 */
  function forceResetSession() {
    setMsgs([{ id: crypto.randomUUID(), role: "assistant", text: getGreeting(mode) }]);
    setStage("greeting");
    setPlanText("");
    setImages([]);
    setRecommendation(null);
    setIllustHtml(null);
    setIllustOutputMode("image");
    setExpressMode(false);
    setDraft(null);
    setCurrentProductId(null);
    savedProductRef.current = null;
    setReferences([]);
    referencesRef.current = [];
    clearEditingProduct();
  }

  /** 新会话(+新会话按钮):带确认弹窗;「制作相似」等外部信号走 forceResetSession */
  function resetSession() {
    const hasContent = msgs.length > 1 || planText || images.length > 0 || recommendation || illustHtml || stage !== "greeting";
    if (hasContent && !confirm("开始新会话将清空当前聊天与方案,确定继续?")) return;
    forceResetSession();
  }

  /** 灵感池排序优先级:细品类精准命中 > 同 mode > 未分类 */
  function rankByIntent(cluster: ReturnType<typeof categorizeCategory>, intent: DesignIntent): number {
    if (!cluster) return 3;
    if (intent.categoryCluster && cluster.id === intent.categoryCluster) return 0;
    if (cluster.mode === intent.mode) return 1;
    return 2;
  }

  /**
   * 构建「品牌风格灵感池」注入块 —— 按用户输入的「大品类」(mode)筛选灵感库,
   * 只把同品类的灵感作为参考;细品类精准命中的排在最前。
   * 每张灵感压缩为一行文本摘要(保留 #[id] 标记供 AI 自由引用)。
   */
  function buildReferencesBlock(raw: string): { block: string; refs: InspirationItem[]; intent: DesignIntent } {
    const intent = parseDesignIntent(raw);
    intentRef.current = intent; // 记录意图,供 startGeneration 取 top-2 参考灵感
    const allRefs = knowledge?.inspirations ?? [];

    // ── 按「大品类」筛选:只把与用户输入同 mode 的灵感作为参考 ──
    //   排序优先级:① 细品类精准命中(categoryCluster 相同) ② 同 mode 兜底 ③ 未分类放最后
    const ranked = allRefs
      .map((it) => ({ it, cluster: categorizeCategory(it.category ?? "") }))
      .sort((a, b) => {
        const ra = rankByIntent(a.cluster, intent);
        const rb = rankByIntent(b.cluster, intent);
        if (ra !== rb) return ra - rb;
        // 同级时:有命中的排前、useCount 高的优先
        if (a.cluster && !b.cluster) return -1;
        if (!a.cluster && b.cluster) return 1;
        return (b.it.useCount ?? 0) - (a.it.useCount ?? 0);
      });
    // 筛选出同 mode 的作为主池(若无命中则回退到全库,避免空白)
    const sameMode = ranked.filter((x) => x.cluster && x.cluster.mode === intent.mode);
    const pool = sameMode.length ? sameMode : ranked;
    const refs = pool.map((x) => x.it);
    setReferences(refs);
    referencesRef.current = refs; // ref 镜像供 saveToLookbook 解析 #[id] 引用

    // ── 品牌 slogan 结构化注入:当用户意图含「字母/文字/标语」元素,且品牌有 slogan ──
    const slogan = knowledge?.brand?.slogan?.trim();
    const sloganElement = hasLetteringElement(intent) && slogan
      ? [
        "## 推荐品牌印花文案(方案中必须把这段 slogan 作为字母/文字/标语元素设计进去)",
        `"${slogan}"`,
      ].filter(Boolean).join("\n")
      : "";

    // ── 灵感池一行摘要: #[id] category · visualStyle · designApproach | 配色 | 特征 ──
    const MAX_LIB = 60; // 上限 60 张(控制 token 预算)
    const libLines = refs.slice(0, MAX_LIB).map((it) => {
      const head = `#[${it.id}] ${it.category ?? "general"}`;
      const styleBits = [it.visualStyle, it.designApproach].filter(Boolean).join(" · ").slice(0, 80);
      const colors = it.colors?.length ? `配色: ${it.colors.slice(0, 5).join("/")}` : "";
      const features = it.styleFeatures?.length ? `特征: ${it.styleFeatures.slice(0, 4).join("/")}`
        : it.designHighlights?.length ? `特征: ${it.designHighlights.slice(0, 4).join("/")}` : "";
      return [head, styleBits, [colors, features].filter(Boolean).join(" | ")].filter(Boolean).join(" ");
    });

    const poolLabel = sameMode.length
      ? `已按「${intent.categoryCluster ?? intent.mode}」大品类筛选 ${refs.length} 张`
      : `全库 ${refs.length} 张(未识别具体大品类)`;
    const block = [
      refs.length
        ? [
          `## 品牌风格灵感池(${poolLabel},同品类作为品牌风格来源与设计思路参考,自由汲取,引用时用 #[ID] 标注)`,
          ...libLines,
        ].join("\n")
        : "## 品牌风格灵感池(灵感库为空,建议先到左侧上传灵感图,作为设计参考)",
      // 意图解析摘要(帮助 AI 快速理解维度)
      `## 设计意图(前端已解析)`,
      `- 品类簇: ${intent.categoryCluster ?? "未识别"}  关键词: ${intent.category ?? "—"}`,
      intent.elements.length ? `- 设计元素: ${intent.elements.join(", ")}` : null,
      intent.scene.length ? `- 场景/季节: ${intent.scene.join(", ")}` : null,
      intent.mode ? `- 大类: ${intent.mode}` : null,
      sloganElement,
    ].filter(Boolean).join("\n\n");

    return { block, refs, intent };
  }

  /** 从结构化简报生成:组合名称/描述/参考灵感为 prompt,清洗开场 greeting 后走 chat 企划流程 */
  async function generateFromBrief() {
    if (busy || knowledgeLoading || !designName.trim()) return;
    const parts = [
      `设计名称:${designName.trim()}`,
      briefDescription.trim() ? `设计需求:${briefDescription.trim()}` : "",
      briefRefs.length ? `参考灵感:${briefRefs.map((r) => r.name || r.category || "灵感").join("、")}` : "",
    ].filter(Boolean);
    const composed = `请基于以下简报开始设计方案:\n${parts.join("\n")}`;
    // 清洗开场 greeting / 历史,从简报干净起步
    setMsgs([]);
    setStage("greeting");
    setPlanText("");
    // 档案化参考灵感到主 references(供系统 prompt 灵感池引用)
    setReferences((prev) => [
      ...prev,
      ...briefRefs
        .filter((b) => b.source === "library")
        .map((b) => ({ id: b.id, url: b.url, category: b.category, visualStyle: b.visualStyle }) as any),
    ]);
    await send(composed);
  }

  /** 单品 / 系列:chat 主流程(设计顾问 + 灵感 + 知识 → 方案) */
  async function send(raw: string) {
    if (!raw.trim() || busy || knowledgeLoading) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: raw.trim() };
    setMsgs((xs) => [...xs, userMsg]);
    setBusy(true);

    // 展示阶段(presenting / presenting-html):AI 给出反馈后,按用户修改要求立即重新生成
    // (系统 prompt 约定「前端会自动重新生成修改的那张图」)。暂存意图,send 结束后触发,避免 busy 状态被 finally 提前翻转。
    // 用 const 容器持有可变值,避免 TS 对闭包内赋值的 let 收窄为 never。
    const postSendRegen = { value: null as { slot: string; label: string; instruction: string } | null };
    let postSendRegenHtml = false;

    const assistantId = crypto.randomUUID();
    const t0 = Date.now();
    setMsgs((xs) => [...xs, { id: assistantId, role: "assistant", text: "", startedAt: t0 }]);

    const { block: referencesBlock, refs: matchedRefs } = buildReferencesBlock(raw);
    const history = [...msgs, userMsg].map((m) => `[${m.role}] ${m.text.replace(STAGE_MARKER, "").trim()}`).join("\n\n");
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge).map((inj) => inj(raw, knowledge)).filter(Boolean).join("\n\n")
      : "";
    const system = [
      DESIGNER_SYSTEM,
      referencesBlock,
      knowledgeBlock ? `## 团队知识库(自动注入)\n${knowledgeBlock}` : "",
    ].filter(Boolean).join("\n\n");

    await streamChat({
      chatUrl: teamApi(teamId ?? "").chatUrl,
      system,
      prompt: history,
      model,
      assistantId,
      onTick: (accumulated) => {
        setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: stripStageMarker(accumulated) } : m));
      },
      onDone: (finalText, rawAccum, elapsedMs) => {
        const newStage = parseStage(rawAccum) || stage;
        const withRefs = newStage === "proposal" || newStage === "references" || stage === "greeting"
          ? { text: finalText, references: matchedRefs, timingMs: elapsedMs, startedAt: undefined }
          : { text: finalText, timingMs: elapsedMs, startedAt: undefined };
        setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, ...withRefs } : m));
        setStage(newStage);
        if (newStage === "planning" || newStage === "brainstorming" || newStage === "proposal") {
          setPlanText(finalText);
        }
        // 展示阶段:AI 反馈后按用户修改要求立即重新生成主图
        if ((newStage === "presenting" || newStage === "presenting-html") && raw.trim()) {
          if (newStage === "presenting-html") {
            postSendRegenHtml = true;
          } else {
            const primary = images.find((im) => im.slot === "final" && im.url)
              ?? images.find((im) => im.url);
            if (primary) postSendRegen.value = { slot: primary.slot, label: primary.label, instruction: raw };
          }
        }
      },
    });
    setBusy(false);
    // send 的 chat 轮次结束后,触发展示阶段的立即重新生成(此时 busy 已释放,regenerate 自行管理 busy)
    if (postSendRegenHtml) void regenerateHtml(raw);
    if (postSendRegen.value) void regenerateOne(postSendRegen.value.slot, postSendRegen.value.label, postSendRegen.value.instruction);
  }

  /**
   * 插画:确认方案后,让 AI 输出自包含 HTML 作为最终交付物。
   * 不调用 /design/generate 图片接口,而是复用 /chat 流式,解析 ```html … ``` 块。
   */
  async function generateHtml() {
    if (illustBusy || busy || generating) return;
    setIllustBusy(true);
    setStage("generating");

    const trigger: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      text: "请基于上面的方案,输出一幅完整的插画(自包含 HTML + inline CSS / SVG,可直接在浏览器打开)。仅输出 ```html … ``` 代码块,代码块外不要有任何文字。",
    };
    const assistantId = crypto.randomUUID();
    setMsgs((xs) => [...xs, trigger, { id: assistantId, role: "assistant", text: "生成插画稿…" }]);

    const { block: referencesBlock } = buildReferencesBlock(planText || "");
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge).map((inj) => inj(planText || "", knowledge)).filter(Boolean).join("\n\n")
      : "";
    const system = [
      ILLUSTRATION_HTML_SYSTEM,
      referencesBlock,
      knowledgeBlock ? `## 团队知识库(自动注入)\n${knowledgeBlock}` : "",
    ].filter(Boolean).join("\n\n");
    const history = [...msgs, trigger].map((m) => `[${m.role}] ${m.text.replace(STAGE_MARKER, "").trim()}`).join("\n\n");

    await streamChat({
      chatUrl: teamApi(teamId ?? "").chatUrl,
      system,
      prompt: history,
      model,
      maxTokens: 4096,
      onTick: () => { /* 插画生成中不逐 token 更新,保持「生成插画稿…」 */ },
      onDone: (finalText, rawAccum, elapsedMs) => {
        const html = extractHtmlBlock(rawAccum);
        if (html) {
          setIllustHtml(html);
          setIllustMsgId(assistantId);
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: `✅ 插画稿已生成(${formatDuration(elapsedMs)}),可在右侧画布查看;告诉我要调整的地方。`, html, timingMs: elapsedMs }
            : m));
          setStage("presenting-html");
        } else {
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: `⚠ 未检测到 HTML 输出(${formatDuration(elapsedMs)}),请重试或调整方案。`, timingMs: elapsedMs }
            : m));
          setStage("proposal");
        }
      },
    });
    setIllustBusy(false);
  }

  /** 插画:在画布下方「修改」输入 → 让 AI 基于上一版重出完整 HTML */
  async function regenerateHtml(instruction: string) {
    if (!instruction.trim() || illustBusy || busy) return;
    setIllustBusy(true);
    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: "user",
      text: `请在上一版插画基础上修改: ${instruction}\n仅输出新的完整 \`\`\`html … \`\`\` 代码块,代码块外不要有任何文字。`,
    };
    const assistantId = crypto.randomUUID();
    setMsgs((xs) => [...xs, userMsg, { id: assistantId, role: "assistant", text: "调整插画稿…" }]);

    const { block: referencesBlock } = buildReferencesBlock(planText || "");
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge).map((inj) => inj(planText || "", knowledge)).filter(Boolean).join("\n\n")
      : "";
    const system = [
      ILLUSTRATION_HTML_SYSTEM,
      referencesBlock,
      knowledgeBlock ? `## 团队知识库(自动注入)\n${knowledgeBlock}` : "",
    ].filter(Boolean).join("\n\n");
    const history = [...msgs, userMsg].map((m) => `[${m.role}] ${m.text.replace(STAGE_MARKER, "").trim()}`).join("\n\n");

    await streamChat({
      chatUrl: teamApi(teamId ?? "").chatUrl,
      system,
      prompt: history,
      model,
      maxTokens: 4096,
      onTick: () => { },
      onDone: (finalText, rawAccum, elapsedMs) => {
        const html = extractHtmlBlock(rawAccum);
        if (html) {
          setIllustHtml(html);
          setIllustMsgId(assistantId);
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: `✅ 插画稿已更新(${formatDuration(elapsedMs)}),可在右侧画布查看;继续调整或确认。`, html, timingMs: elapsedMs }
            : m));
          setStage("presenting-html");
        } else {
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: `⚠ 未检测到 HTML 输出(${formatDuration(elapsedMs)}),请重试。`, timingMs: elapsedMs }
            : m));
        }
      },
    });
    setIllustBusy(false);
  }

  /** 单品极速模式:跳过线稿和选材料,直接调用 /design/generate 出图(三视图/平铺图) */
  async function expressGenerate() {
    if (generating) return;
    setGenerating(true);
    setStage("generating");
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: "⏳ 正在快速生成设计图…", startedAt: Date.now() }]);
    const t0 = Date.now();
    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", "/design/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, plan: planText }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      setImages((data.images || []).map((im) => ({ ...im, originalUrl: im.originalUrl ?? null })));
      setStage("presenting");
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, {
        id: crypto.randomUUID(), role: "assistant",
        text: `✨ 设计图已生成(${formatDuration(elapsed)})! 看看这套作品,有需要调整的地方随时告诉我。`,
        timingMs: elapsed,
      }]);
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败(${formatDuration(elapsed)}): ${e.message}`, timingMs: elapsed }]);
      setStage("proposal");
    } finally {
      setGenerating(false);
    }
  }

  /** 本次操作预计生成的图片数(用于按钮显示花费) */
  function getGenerateCount(): number {
    // 单品/系列/插画:均为 1 次生成请求
    return 1;
  }

  /** 用户确认企划 → 进入生成:
   *  - 插画(illustration):按 illustOutputMode 分叉(图片/HTML),走原有路径;
   *  - 单品 / 系列(single/collection):走「线稿生成」(线稿 → 选材料 → 最终成图)。 */
  async function startGeneration() {
    // 单品极速模式:跳线稿 & 选材料,直达效果图
    if (expressMode && mode === "single") { await expressGenerate(); return; }
    if (mode === "illustration") {
      if (illustOutputMode === "html") { await generateHtml(); return; }
      // 插画 + 图片模式 → 走 /design/generate(1:1 印花图案)
    }
    if (generating) return;
    setGenerating(true);
    // 单品 / 系列 → 线稿;插画 → 最终图
    const isLineart = mode !== "illustration";
    setStage(isLineart ? "generating-lineart" : "generating");
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: isLineart ? "⏳ 正在生成设计线稿…" : "⏳ 正在生成设计图…", startedAt: Date.now() }]);
    const t0 = Date.now();
    try {
      const path = isLineart ? "/design/lineart" : "/design/generate";
      // 线稿:从「同大品类」的灵感池子里,取最相关的 top-2 作为图像参考
      //   (与 text 参考池品类对齐,让图参考与文字方案方向一致)
      let topRefs: MatchedInspiration[] = [];
      if (isLineart && intentRef.current) {
        const intent = intentRef.current;
        const sameMode = (knowledge?.inspirations ?? [])
          .map((it) => ({ it, cluster: categorizeCategory(it.category ?? "") }))
          .filter((x) => x.cluster && x.cluster.mode === intent.mode)
          .map((x) => x.it);
        const candidatePool = sameMode.length ? sameMode : knowledge?.inspirations ?? [];
        topRefs = matchInspirations(intent, candidatePool, 2);
      }
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode,
          plan: planText,
          referenceImages: topRefs.map((r) => ({
            url: r.thumbUrl || r.url,
            category: r.category,
            visualStyle: r.visualStyle,
            designApproach: r.designApproach,
            styleFeatures: r.styleFeatures,
            designHighlights: r.designHighlights,
            colors: r.colors,
          })),
        }),
      });
      // 504/代理层返回 HTML 时,res.json() 会抛 "Unexpected token '<'" —— 先校验避免无意义报错
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      setImages((data.images || []).map((im) => ({ ...im, originalUrl: im.originalUrl ?? null })));
      setStage(isLineart ? "presenting-lineart" : "presenting");
      const elapsed = Date.now() - t0;
      const refHint = isLineart && topRefs.length
        ? ` 线稿参考了灵感库中的「${topRefs.map((r) => r.category ?? "灵感").join("」「")}」。`
        : "";
      setMsgs((xs) => [...xs, {
        id: crypto.randomUUID(), role: "assistant",
        text: isLineart
          ? `✏️ 设计线稿已生成(${formatDuration(elapsed)})!${refHint}看看结构是否满意,可以修改单张线稿,确认后进入选材料。`
          : `✨ 设计图已生成(${formatDuration(elapsed)})! 看看这套作品,有需要调整的地方随时告诉我。`,
        timingMs: elapsed,
      }]);
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败(${formatDuration(elapsed)}): ${e.message}`, timingMs: elapsed }]);
      // 回退到当前方案阶段
      setStage((cur) => cur === "generating-lineart" || cur === "generating" ? "proposal" : cur);
    } finally {
      setGenerating(false);
    }
  }

  /** 获取 AI 材质+配色推荐 */
  const fetchRecommendation = useCallback(async () => {
    const api = teamApi(teamId ?? "");
    const lineartImg = images.find((im) => im.slot === "lineart");
    try {
      const data = await api.recommendMaterials({ plan: planText, lineartUrl: lineartImg?.url });
      if (data?.recommendation) {
        setRecommendation(data.recommendation);
      } else {
        // fallback:空壳推荐,用户手动填写
        setRecommendation({ name: '', category: '面料', texture: '', composition: '', finish: '', colors: ['#E8D5B7', '#C4A882', '#6B5B45'], reason: '' });
      }
    } catch (e: any) {
      console.error('[composer] fetchRecommendation failed:', e?.message);
      setRecommendation({ name: '', category: '面料', texture: '', composition: '', finish: '', colors: ['#E8D5B7', '#C4A882', '#6B5B45'], reason: '' });
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ AI 推荐暂不可用(${e?.message || '网络错误'}),请手动填写材质与配色。` }]);
    }
  }, [teamId, planText, images]);

  /** 线稿确认 → 进入材质推荐阶段(仅 single / collection) */
  async function confirmLineart() {
    setStage("material-recommend");
    setRecommendation(null);
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: "线稿已确认。正在根据设计方案推荐材质与配色…" }]);
    await fetchRecommendation();
  }

  /** 确认材质方案 → 生成最终设计图(带材质+配色) */
  async function generateFinal() {
    if (!recommendation || !recommendation.name.trim() || generating) return;
    setGenerating(true);
    setStage("generating-final");
    const t0 = Date.now();
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⏳ 使用「${recommendation.name}」(${recommendation.colors.join(' / ')})生成最终设计图…`, startedAt: t0 }]);
    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", "/design/generate-final"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, plan: planText, material: recommendation }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      // 线稿保留,最终图追加(final 槽)
      setImages((prev) => [...prev.filter((im) => im.slot === "lineart"), ...(data.images || []).map((im) => ({ ...im, originalUrl: im.originalUrl ?? null }))]);
      setStage("presenting");
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `✨ 最终设计图已生成(${formatDuration(elapsed)})! 看看这套作品,有需要调整的地方随时告诉我。`, timingMs: elapsed }]);
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败(${formatDuration(elapsed)}): ${e.message}`, timingMs: elapsed }]);
      setStage("material-recommend");
    } finally {
      setGenerating(false);
    }
  }

  // 单图修图(线稿 / 最终图均走此接口;最终图自动叠加材料描述)
  async function regenerateOne(slot: string, label: string, instruction: string) {
    if (!instruction.trim()) return;
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "user", text: `修改「${label}」: ${instruction}` }]);
    setBusy(true);
    const t0 = Date.now();
    try {
      const isFinal = slot === "final";
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", "/design/regenerate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ slot, label, plan: planText, instruction, mode: isFinal ? mode : undefined, material: isFinal ? recommendation ?? undefined : undefined }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`服务暂不可用 (HTTP ${res.status})${errText.slice(0, 80) ? `: ${errText.slice(0, 80)}` : ''}`);
      }
      const data = await res.json();
      const elapsed = Date.now() - t0;
      if (data.url) {
        setImages((prev) => prev.map((im) => im.slot === slot ? { ...im, url: data.url, originalUrl: data.originalUrl ?? null, prompt: data.prompt } : im));
        setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `✅ 已更新「${label}」(${formatDuration(elapsed)})`, timingMs: elapsed }]);
      } else {
        setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 修图失败(${formatDuration(elapsed)}): ${data.error || "未知错误"}`, timingMs: elapsed }]);
      }
    } catch (e: any) {
      const elapsed = Date.now() - t0;
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 修图失败(${formatDuration(elapsed)}): ${e.message}`, timingMs: elapsed }]);
    } finally {
      setBusy(false);
    }
  }

  /** 把本次设计录入 Lookbook(含结构化解析)。
   *  - 单品/系列/插画+图片:必须有图片;
   *  - 插画+HTML:必须有 html。
   *  - 解析 planText 为 DesignSections,填充 title/category/colors/targetPrice 等字段。 */
  async function saveToLookbook() {
    const hasImage = images.length > 0;
    const hasHtml = !!(mode === "illustration" && illustOutputMode === "html" && illustHtml);
    if (!hasImage && !hasHtml) return;
    const now = new Date().toISOString();
    const mainImage = images.find((im) => im.url);
    // 收集所有可访问的图片(结构化数组,供 Lookbook 直接展示缩略图)
    const productImages = images.filter((im): im is typeof im & { url: string } => !!im.url).map((im) => ({ slot: im.slot, label: im.label, url: im.url, originalUrl: im.originalUrl ?? null }));

    // ── 解析设计提案:把 AI 方案文本拆成结构化字段 ──
    const planSource = planText || msgs.filter((m) => m.role === "assistant" && m.references && m.references.length > 0).slice(-1)[0]?.text || "";
    const sections = parseDesignProposal(planSource, recommendation ?? undefined, referencesRef.current ?? undefined);

    // 颜色:以 recommendation(可编辑的材质配色方案)为权威来源,与生成最终图时注入
    // 的 material.colors 保持一致。计划文本里解析出的 colorway 是 AI 原始方案,
    // 若与 recommendation 合并会同时出现两套配色(原方案 + 修改后),因此仅在没有
    // recommendation 时(如插画模式)回退到计划色板。
    const colors = (() => {
      if (recommendation?.colors?.length) {
        return [...new Set(recommendation.colors.map((c) => c.toUpperCase()))];
      }
      if (sections.colorway?.length) {
        return [...new Set(sections.colorway[0].hex.map((c) => c.toUpperCase()))];
      }
      return [];
    })();

    // 目标价:从 sections.targetPrice 解析数字
    const priceNum = sections.targetPrice?.replace(/[^\d.]/g, "");
    const targetPriceNum = priceNum && !isNaN(Number(priceNum)) ? Math.round(Number(priceNum)) : undefined;

    // 已有当前产品 id(录入后继续 chat / 再次录入)→ 编辑同一产品,保留工序信息;
    // 否则新建。这样「录入后再 chat」等同于编辑,不会在 Lookbook 里产生重复条目。
    const previous = savedProductRef.current;
    const product: Product = {
      id: currentProductId ?? crypto.randomUUID(),
      mode,
      title: sections.productName || `Design ${now.slice(0, 10)}`,
      description: sections.themeNarrative || planSource.slice(0, 500),
      seasons: [],
      category: intentCategory(mode),
      colors,
      targetPriceNum,
      silhouette: sections.silhouette,
      fabricComposition: sections.fabric?.[0]?.composition || recommendation?.composition || undefined,
      recommendation: recommendation ?? undefined,
      tech_pack_url: mainImage?.url,
      images: productImages,
      ...(hasHtml ? { html: illustHtml! } : {}),
      sections,
      aiDraftRaw: JSON.stringify({
        plan: planSource,
        images,
        ...(recommendation ? { recommendation } : {}),
        ...(hasHtml ? { html: illustHtml! } : {}),
        sections, // sections 也入 raw,方便回看
      }),
      // 编辑已有产品时保留原始状态与工序历史,仅更新时间戳
      status: previous?.status ?? "draft",
      statusHistory: previous?.statusHistory ?? [],
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await store.upsertProduct(product);
      // 记录为当前产品:后续 chat / 再次录入继续编辑同一产品
      setCurrentProductId(product.id);
      savedProductRef.current = product;
      // 录入成功 → 跳转到 Lookbook
      navigateTab("lookbook");
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `⚠ 录入失败: ${e.message}` }]);
    }
  }

  // 新流程用 proposal 阶段(旧 planning 仍兼容)。插画生成用 illustBusy,不阻塞 chat。
  const canGenerate = (stage === "planning" || stage === "proposal") && !generating && !illustBusy;
  // 线稿展示阶段(仅 single / collection)
  const showLineart = mode !== "illustration" && (stage === "presenting-lineart" || stage === "generating-lineart") && images.some((im) => im.slot === "lineart");
  // 最终图展示(线稿保留 + 最终图)
  const showFinalImages = mode !== "illustration" && stage === "presenting" && images.some((im) => im.slot === "final");
  // 极速模式效果图展示(单品 slot=single,直接出图,跳过了线稿/选材料)
  const showExpressImages = expressMode && mode === "single" && stage === "presenting" && images.some((im) => im.slot === "single");
  // 图片画廊:线稿 / 极速模式效果图 / 最终图 / 插画图片
  const showImages = (showLineart || showFinalImages || showExpressImages || (stage === "presenting" && mode === "illustration")
    || (stage === "generating" && images.length > 0))
    && !(mode === "illustration" && illustOutputMode === "html");
  // 插画 HTML 产物 → 画布
  const showCanvas = mode === "illustration" && illustOutputMode === "html" && (stage === "presenting-html" || illustHtml);
  const inIllustGenerating = mode === "illustration" && stage === "generating";
  // 插画当前产物是图片(右侧渲染 ImageCard,修改走 regenerateOne)
  const illustShowingImage = mode === "illustration" && illustOutputMode === "image" && images.length > 0;
  // 线稿确认按钮(仅 presenting-lineart)
  const canConfirmLineart = mode !== "illustration" && stage === "presenting-lineart";

  // 插画模式沿用原 chat + 画布/侧栏布局(保持不动);单品/系列走结构化双栏(设计简报 + 生成流程)
  if (mode === "illustration") {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] h-[calc(100vh-64px)] min-h-0">
          <div className="flex flex-col min-h-0">
            <header className="flex items-center justify-between px-3 md:px-6 py-3 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between gap-2">
                {/* 模型切换下拉 */}
                {/* <select
                value={model}
                onChange={(e) => setModel(e.target.value as ModelId)}
                disabled={busy || generating}
                title="切换 AI 模型"
                className="hidden sm:block text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 focus:outline-none focus:border-primary-400 disabled:opacity-40"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select> */}
                {/* 移动端:插画+HTML→画布抽屉;其他→企划抽屉 */}
                {isMobile && (
                  <button
                    onClick={() => (mode === "illustration" && illustOutputMode === "html") ? setCanvasOpen(true) : setPlanOpen(true)}
                    className="text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600"
                  >
                    {(mode === "illustration" && illustOutputMode === "html") ? "画布" : "企划"}
                  </button>
                )}
                <span className="text-[11px] text-gray-500 font-mono capitalize">{stage}</span>
              </div>
              <button
                onClick={resetSession}
                disabled={busy || generating || illustBusy}
                title="清空当前聊天与方案,开始一个全新设计"
                className="shrink-0 text-[11px] font-mono border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 hover:border-gray-800 hover:text-gray-900 disabled:opacity-40"
              >
                + 新会话
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4 bg-gray-50">
              {msgs.map((m) => (
                <div key={m.id} className={`w-fit rounded-2xl px-4 py-3 max-w-[85%] text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-primary-500 text-white ml-auto rounded-br-sm whitespace-pre-wrap" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                  {m.role === "assistant" ? <Markdown source={m.text} /> : m.text}
                  {busy && m.role === "assistant" && m.startedAt && (
                    <LiveElapsed startedAt={m.startedAt} setTick={setTick} />
                  )}
                  {!busy && m.timingMs && m.role === "assistant" && (
                    <span className="text-[10px] text-gray-400 ml-1">{formatDuration(m.timingMs)}</span>
                  )}
                </div>
              ))}

              {/* 插画:图片/HTML 切换( proposer/planning / presenting / presenting-html 阶段均可见 ) */}
              {mode === "illustration" && (stage === "planning" || stage === "proposal" || stage === "presenting" || stage === "presenting-html") && (
                <div className="flex justify-center">
                  <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-[12px] shadow-sm">
                    <button
                      onClick={() => setIllustOutputMode("image")}
                      disabled={illustBusy || generating}
                      className={`px-3 py-1 rounded-md transition-colors ${(illustOutputMode === "image") ? "bg-primary-500 text-white font-medium" : "text-gray-600 hover:text-primary-600"}`}
                    >图片</button>
                    <button
                      onClick={() => setIllustOutputMode("html")}
                      disabled={illustBusy || generating}
                      className={`px-3 py-1 rounded-md transition-colors ${(illustOutputMode === "html") ? "bg-primary-500 text-white font-medium" : "text-gray-600 hover:text-primary-600"}`}
                    >HTML</button>
                  </div>
                </div>
              )}

              {/* 线稿确认按钮(仅 single / collection 的 presenting-lineart) */}
              {canConfirmLineart && (
                <div className="flex justify-center gap-3">
                  <button onClick={saveToLookbook} className="px-5 py-3 rounded-2xl border border-gray-300 hover:border-gray-400 text-gray-600 font-medium text-sm transition-colors">
                    保存到 Lookbook
                  </button>
                  <button onClick={confirmLineart} className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm shadow-lg transition-colors">
                    线稿确认,下一步选材料
                  </button>
                </div>
              )}

              {/* 最终成图:进入 generating-final 时展示提示 */}
              {stage === "generating-final" && (() => {
                const lastMsg = [...msgs].reverse().find((m) => m.startedAt);
                return (
                  <div className="flex justify-center">
                    <div className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm">
                      {lastMsg?.startedAt ? <>⏳ 正在结合「{recommendation?.name}」生成最终设计图…<LiveElapsed startedAt={lastMsg.startedAt} setTick={setTick} /></> : `正在结合「{recommendation?.name}」生成最终设计图…`}
                    </div>
                  </div>
                );
              })()}

              {/* 生成中(单品/系列:图片;插画:图片 / HTML) */}
              {(generating || inIllustGenerating) && (() => {
                const lastMsg = [...msgs].reverse().find((m) => m.startedAt);
                const label = mode === "illustration" ? (illustOutputMode === "html" ? "正在生成插画 HTML" : "正在生成插画图") : "正在生成设计图";
                return (
                  <div className="flex justify-center">
                    <div className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm">
                      {lastMsg?.startedAt ? <>{label}…<LiveElapsed startedAt={lastMsg.startedAt} setTick={setTick} /></> : `${label}…`}
                    </div>
                  </div>
                );
              })()}

              {/* 设计图展示(线稿 / 最终图 / 插画+图片) —— 录入按钮已移到右侧 preview 区 */}
              {showImages && images.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">
                    {showLineart ? "设计线稿" : (showExpressImages ? "设计图(极速)" : (showFinalImages && recommendation ? `最终设计图 · ${recommendation.name}` : "设计图"))}
                  </div>
                  <div className={images.length === 1 ? "max-w-sm mx-auto" : "grid grid-cols-2 gap-2 md:gap-3"}>
                    {images.map((im) => (
                      <ImageCard key={im.slot} image={im} onRegenerate={(inst) => regenerateOne(im.slot, im.label, inst)} />
                    ))}
                  </div>
                </div>
              )}

              {/* 插画:生成后提示(画布在右侧 aside 渲染) */}
              {showCanvas && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 text-[12px] text-gray-600">
                  ✨ 插画稿已生成,可在右侧画布查看;告诉我要调整的地方。
                </div>
              )}
            </div>

            {/* 底部:固定生成按钮 + 输入框 */}
            <div className="shrink-0 border-t border-gray-200 bg-white">
              {canGenerate && (
                <div className="px-4 pt-3">
                  <GenerateButton
                    loading={generating || illustBusy}
                    estimatedCoins={getGenerateCount() * AI_COST_PER_IMAGE}
                    userCoins={user?.coins}
                    onClick={startGeneration}
                    className="justify-center"
                  />
                </div>
              )}
              <PromptBar
                placeholder={
                  knowledgeLoading ? "加载知识库中…" :
                    stage === "greeting" ? "输入一个主题 + 风格(如:猫咪 / 复古水彩)…" :
                      stage === "brainstorming" ? "选一个方向(1/2/3),或提出自己的想法…" :
                        (stage === "planning" || stage === "proposal") ? "确认方案(OK/开始),或提出修改意见…" :
                          (stage === "presenting" || stage === "presenting-html") ? "描述你想修改的地方…" :
                            "输入…"
                }
                disabled={knowledgeLoading}
                onSubmit={send}
              />
            </div>
          </div>

          {/* 桌面端侧栏:单品/系列/插画+图片=设计方案·材料选择 / 插画+HTML=画布预览 + 修图输入 */}
          {mode === "illustration" && illustOutputMode === "html"
            ? <IllustrationCanvas html={illustHtml} generating={illustBusy} stage={stage} illustHtml={illustHtml} onModify={regenerateHtml} onSaveToLookbook={saveToLookbook} />
            : <PlanSideBar planText={planText} stage={stage} images={images} onSaveToLookbook={saveToLookbook} recommendation={recommendation} onRecommendationChange={setRecommendation} onRefreshRecommendation={fetchRecommendation} onGenerateFinal={generateFinal} generating={generating} expressMode={expressMode} />
          }
        </div>
        {/* 移动端抽屉(<md,跟主内容同级渲染) */}
        {isMobile && (mode === "illustration" && illustOutputMode === "html")
          ? <IllustrationCanvasDrawer html={illustHtml} generating={illustBusy} open={canvasOpen} onClose={() => setCanvasOpen(false)} onModify={regenerateHtml} stage={stage} onSaveToLookbook={saveToLookbook} />
          : isMobile && <ComposerPlanDrawer planText={planText} open={planOpen} onClose={() => setPlanOpen(false)} stage={stage} images={images} onSaveToLookbook={saveToLookbook} recommendation={recommendation} onRecommendationChange={setRecommendation} onRefreshRecommendation={fetchRecommendation} onGenerateFinal={generateFinal} generating={generating} expressMode={expressMode} />
        }
      </>
    );
  }

  // ── 单品 / 系列:结构化双栏 ──
  // 左:设计简报(固定 header + 可滚动内容 + 底部生成按钮) 右:生成流程(企划→线稿→材质→终稿)
  const hasImg = images.some((im) => im.url);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
        <div className="flex flex-col bg-white border-r border-gray-200 min-h-0">

          {/* 中间:可滚动内容 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <ComposerBrief
              designName={designName} setDesignName={setDesignName}
              description={briefDescription} setDescription={setBriefDescription}
              references={briefRefs as any} setReferences={setBriefRefs as any}
              knowledge={knowledge} brandLoading={brandLoading} knowledgeLoading={knowledgeLoading}
              generating={generating}
              onGenerate={() => void generateFromBrief()}
              onRefine={(t) => void send(t)}
              onNewSession={resetSession}
              refineBusy={busy}
            />
          </div>

          {/* 底部:固定生成按钮 */}
          {canGenerate && (
            <div className="shrink-0 border-t border-gray-200 bg-white px-4 pt-3 pb-4">
              <GenerateButton
                loading={generating}
                estimatedCoins={getGenerateCount() * AI_COST_PER_IMAGE}
                userCoins={user?.coins}
                onClick={() => void startGeneration()}
              />
            </div>
          )}
        </div>

        {/* 右:生成流程 */}
        <ComposerPipeline
          stage={stage}
          planText={planText}
          images={images}
          recommendation={recommendation}
          generating={generating}
          expressMode={expressMode}
          onConfirmProposal={() => void startGeneration()}
          onConfirmLineart={() => void confirmLineart()}
          onGenerateFinal={() => void generateFinal()}
          onRegenerateOne={regenerateOne}
          onSaveToLookbook={saveToLookbook}
          onRecommendationChange={setRecommendation}
          onRefreshRecommendation={fetchRecommendation}
        />
      </div>

      {/* 移动端抽屉(<md):单品走结构化方案/材质/成图抽屉 */}
      {isMobile && (
        <ComposerPlanDrawer planText={planText} open={planOpen} onClose={() => setPlanOpen(false)} stage={stage} images={images} onSaveToLookbook={saveToLookbook} recommendation={recommendation} onRecommendationChange={setRecommendation} onRefreshRecommendation={fetchRecommendation} onGenerateFinal={generateFinal} generating={generating} expressMode={expressMode} />
      )}
    </>
  );
}

/** 桌面端插画画布(≥md,渲染自包含 HTML + 修图输入 + 录入 Lookbook) */
function IllustrationCanvas({ html, generating, stage, onModify, onSaveToLookbook }: { html: string | null; generating: boolean; stage: string; illustHtml: string | null; onModify: (inst: string) => void; onSaveToLookbook: () => void }) {
  const [open, setOpen] = useState(false);
  const [inst, setInst] = useState("");
  const canSave = stage === "presenting-html" && !!html;
  return (
    <aside className="hidden md:flex flex-col border-l border-gray-200 bg-gray-50 p-5 overflow-y-auto min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">画布预览</div>
        {generating ? (
          <div className="w-full aspect-square max-w-[320px] mx-auto rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 text-sm">生成插画稿中…</div>
        ) : html ? (
          <iframe
            key={html.slice(0, 40)}
            srcDoc={html}
            sandbox="allow-scripts"
            className="w-full aspect-square max-w-[320px] mx-auto rounded-lg border border-gray-200 bg-white"
            title="插画画布"
          />
        ) : (
          <div className="w-full aspect-square max-w-[320px] mx-auto rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-center text-[12px] text-gray-400 px-6">
            确认方案后<br />这里将渲染插画(HTML)
          </div>
        )}
      </div>
      {/* 保存到 Lookbook —— 统一放右侧 preview 区底部 */}
      {canSave && (
        <button onClick={onSaveToLookbook}
          className="mt-4 shrink-0 w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
          保存到 Lookbook
        </button>
      )}
      {/* 修图输入 */}
      <div className="mt-4 shrink-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">修改插画</div>
        {!open ? (
          <button onClick={() => setOpen(true)} className="text-[11px] text-primary-600 hover:underline">✎ 修改</button>
        ) : (
          <div className="flex gap-1">
            <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="告诉我要怎么调整…"
              className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-primary-500" />
            <button onClick={() => { if (inst.trim()) { onModify(inst); setInst(""); setOpen(false); } }}
              className="text-[11px] bg-primary-500 hover:bg-primary-600 text-white px-3 rounded transition-colors">重新生成</button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** 桌面端「设计方案 / 材质推荐 / 设计图稿」侧栏(单品 / 系列 / 插画+图片 共用) */
function PlanSideBar({ planText, stage, images, onSaveToLookbook, recommendation, onRecommendationChange, onRefreshRecommendation, onGenerateFinal, generating, expressMode }: {
  planText: string; stage: string; images: GeneratedImage[]; onSaveToLookbook: () => void;
  recommendation: MaterialRecommendation | null;
  onRecommendationChange: (r: MaterialRecommendation) => void;
  onRefreshRecommendation: () => void;
  onGenerateFinal: () => void;
  generating: boolean;
  expressMode: boolean;
}) {
  const canSave = (stage === "presenting" || stage === "presenting-lineart" || stage === "material-recommend") && images.some((im) => im.url);
  const isRecForm = stage === "material-recommend" || stage === "generating-final";
  const hasLineart = images.some((im) => im.slot === "lineart" && im.url);
  const hasFinal = images.some((im) => im.slot === "final" && im.url);
  const hasExpress = expressMode && images.some((im) => im.slot === "single" && im.url);
  return (
    <aside className="hidden md:flex flex-col border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0">
      {/* ① 设计图稿(线稿+效果图缩略 / 极速模式产物,始终可见) */}
      {(hasLineart || hasFinal || hasExpress) && (
        <div className="shrink-0 p-4 pb-2 border-b border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">设计图稿</div>
          <div className="flex gap-2 overflow-x-auto">
            {images.filter((im) => (im.slot === "lineart" || im.slot === "final" || (expressMode && im.slot === "single")) && im.url && !im.error).map((im) => (
              <div key={im.slot} className="shrink-0 w-20">
                <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white">
                  <img src={im.url} alt={im.label} className="w-full h-full object-cover" />
                </div>
                <div className="text-[9px] text-gray-500 mt-1 text-center truncate">{im.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ② 内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pt-3">
        {isRecForm
          ? <RecForm recommendation={recommendation} onChange={onRecommendationChange}
            onRefresh={onRefreshRecommendation} onConfirm={onGenerateFinal}
            loading={!recommendation} disabled={generating} />
          : <>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">设计方案</div>
            {!planText && <p className="text-sm text-gray-500">完成方案后,这里会显示设计方案。</p>}
            {planText && <div className="text-[12.5px] text-gray-700 leading-relaxed"><Markdown source={planText.slice(0, 600)} /></div>}
            {recommendation && recommendation.name && (
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">材质与配色</div>
                <div className="text-[12px] text-gray-700 font-medium">{recommendation.name}</div>
                <div className="flex gap-1 mt-1.5">
                  {recommendation.colors.map((c, i) => (
                    <span key={i} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
            )}
            {/* 极速模式:从方案文本提取配色展示 */}
            {expressMode && !recommendation && planText && (() => {
              const hexes = extractHexColors(planText);
              if (!hexes.length) return null;
              return (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">方案配色</div>
                  <div className="flex gap-1">
                    {hexes.map((c, i) => (
                      <span key={i} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        }
      </div>

      {/* ③ 保存到 Lookbook */}
      {canSave && (
        <div className="shrink-0 p-4 pt-0">
          <button onClick={onSaveToLookbook}
            className="w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
            保存到 Lookbook
          </button>
        </div>
      )}
    </aside>
  );
}

/** 移动端企划抽屉(<md 才渲染),挂在 Composer 外层由父组件组合。 */
export function ComposerPlanDrawer({ planText, open, onClose, stage, images, onSaveToLookbook, recommendation, onRecommendationChange, onRefreshRecommendation, onGenerateFinal, generating, expressMode }: {
  planText: string; open: boolean; onClose: () => void; stage: string; images: GeneratedImage[]; onSaveToLookbook: () => void;
  recommendation: MaterialRecommendation | null;
  onRecommendationChange: (r: MaterialRecommendation) => void;
  onRefreshRecommendation: () => void;
  onGenerateFinal: () => void;
  generating: boolean;
  expressMode: boolean;
}) {
  const canSave = (stage === "presenting" || stage === "presenting-lineart" || stage === "material-recommend") && images.some((im) => im.url);
  const isRecForm = stage === "material-recommend" || stage === "generating-final";
  const hasLineart = images.some((im) => im.slot === "lineart" && im.url);
  const hasFinal = images.some((im) => im.slot === "final" && im.url);
  const hasExpress = expressMode && images.some((im) => im.slot === "single" && im.url);
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-80 max-w-[85vw] bg-white border-l border-gray-200 shadow-xl flex flex-col transition-transform duration-200 md:hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between p-4 pb-2 border-b border-gray-100">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">
            {isRecForm ? '材质推荐' : '设计方案'}
          </div>
          <button onClick={onClose} aria-label="关闭" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* 图稿缩略 */}
        {(hasLineart || hasFinal || hasExpress) && (
          <div className="shrink-0 px-4 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
            {images.filter((im) => (im.slot === "lineart" || im.slot === "final" || (expressMode && im.slot === "single")) && im.url && !im.error).map((im) => (
              <div key={im.slot} className="shrink-0 w-14">
                <div className="aspect-square rounded border border-gray-200 overflow-hidden bg-white">
                  <img src={im.url} alt={im.label} className="w-full h-full object-cover" />
                </div>
                <div className="text-[8px] text-gray-500 mt-0.5 text-center truncate">{im.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isRecForm
            ? <RecForm recommendation={recommendation} onChange={onRecommendationChange}
              onRefresh={onRefreshRecommendation} onConfirm={onGenerateFinal}
              loading={!recommendation} disabled={generating} />
            : <>
              {!planText && <p className="text-sm text-gray-500">完成方案后,这里会显示设计方案。</p>}
              {planText && <div className="text-[12.5px] text-gray-700 leading-relaxed"><Markdown source={planText.slice(0, 600)} /></div>}
              {recommendation && recommendation.name && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">材质与配色</div>
                  <div className="text-[12px] text-gray-700 font-medium">{recommendation.name}</div>
                  <div className="flex gap-1 mt-1.5">
                    {recommendation.colors.map((c, i) => (
                      <span key={i} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
                    ))}
                  </div>
                </div>
              )}
              {/* 极速模式:从方案文本提取配色展示 */}
              {expressMode && !recommendation && planText && (() => {
                const hexes = extractHexColors(planText);
                if (!hexes.length) return null;
                return (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">方案配色</div>
                    <div className="flex gap-1">
                      {hexes.map((c, i) => (
                        <span key={i} className="w-5 h-5 rounded border border-gray-200" style={{ background: c }} title={c} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          }
        </div>

        {canSave && (
          <div className="shrink-0 p-4 pt-0">
            <button onClick={onSaveToLookbook}
              className="w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
              保存到 Lookbook
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

/** 移动端插画画布抽屉(<md 才渲染) */
export function IllustrationCanvasDrawer({ html, generating, open, onClose, onModify, stage, onSaveToLookbook }: {
  html: string | null; generating: boolean; open: boolean; onClose: () => void; onModify: (inst: string) => void; stage: string; onSaveToLookbook: () => void;
}) {
  const [inst, setInst] = useState("");
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 right-0 z-50 h-full w-72 max-w-[85vw] bg-white border-l border-gray-200 shadow-xl p-4 overflow-y-auto transition-transform duration-200 md:hidden ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">画布预览</div>
          <button onClick={onClose} aria-label="关闭画布" className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="mb-4">
          {generating ? (
            <div className="aspect-square rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">生成中…</div>
          ) : html ? (
            <iframe srcDoc={html} sandbox="allow-scripts" className="w-full aspect-square rounded-lg border border-gray-200 bg-white" title="插画画布" />
          ) : (
            <div className="aspect-square rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-center text-[12px] text-gray-400">确认方案后显示插画</div>
          )}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">修改插画</div>
        <div className="flex gap-1">
          <input value={inst} onChange={(e) => setInst(e.target.value)} placeholder="告诉我要怎么调整…"
            className="flex-1 text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-primary-500" />
          <button onClick={() => { if (inst.trim()) { onModify(inst); setInst(""); } }}
            className="text-[11px] bg-primary-500 hover:bg-primary-600 text-white px-3 rounded transition-colors">生成</button>
        </div>
      </aside>
    </>
  );
}

