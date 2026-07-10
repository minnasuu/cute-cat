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
import { matchInspirations, type MatchedInspiration } from "../lib/inspiration-match";
import { SwatchStrip } from "../pages/Materials";

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

/** 设计顾问总 prompt:引导 AI 走完 "匹配灵感 → 设计方案 → 确认出图" 三步工作流。 */
const DESIGNER_SYSTEM = `你是 Laisse Ancie (来兮·安兮)的品牌服装、单品、视觉设计师。你的工作不是一次性输出 JSON,而是通过多轮对话引导用户完成一套以灵感为核心的设计流程。

## 工作流(3 步)

### 步骤 1 · references(匹配灵感借鉴)= 前端已完成后置处理,你无需处理这一步
前端根据用户输入已从灵感库中匹配出 3 个最相关的灵感借鉴(会作为「参考灵感」卡片嵌在对话里)。
你只需在下一步方案中**显式引用**这些灵感即可,不要再自己重新推荐灵感。

### 步骤 2 · proposal(生成 1 个整合方案)——必须严格输出
结合下面几部分信息,**输出 1 个完整设计方案**(不要给多个方向让用户选):
1. 「参考灵感」卡片中的 3 张灵感图(会作为 #[灵感ID] 注入到 system prompt,包含其 category / visualStyle / designApproach / inspiration / colors / 图片 URL 等)
2. 「团队知识库」中注入的资产 / 品牌 / Lookbook(如已注入)
3. 用户的历史对话上下文、本次 mode(illustration / single / collection)

**方案必须包含:**
- **产品名**(有调性)+ **主题叙述**(2-3 句话,讲清核心概念)
- **灵感借鉴说明**:明确写"从 #[灵感ID1] 汲取 ××、从 #[灵感ID2] 借鉴 ××、呼应 #[灵感ID3] 的 ××"——必须把 3 张灵感都用上
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
- 方案必须从真实灵感/材料出发,而不是空想。**每份方案必须引用 system prompt 中「参考灵感」的 3 张灵感图**(#[灵感ID] 的形式),说明具体借鉴了它们的什么(配色 / 构图 / 风格 / 元素…)。
- 必须参考「团队知识库」中的面料与工艺,从真实可用的面料出发。如果库中没有符合要求的材料，可以根据实际进行调。
- 引用格式示例:「—— 灵感:#abc123 复古玫瑰油画的配色」「—— 材料:纯棉」。
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
async function streamChat(opts: {
  chatUrl: string;
  system: string;
  prompt: string;
  model: ModelId;
  assistantId?: string;
  maxTokens?: number;
  onTick?: (accumulated: string) => void;
  onDone?: (finalText: string, accumulated: string) => void;
}): Promise<void> {
  const { chatUrl, system, prompt, model, maxTokens = 2048, onTick, onDone } = opts;
  const streamTimeoutMs = 290_000;
  const ac = new AbortController();
  const timeoutId = globalThis.setTimeout(() => ac.abort(), streamTimeoutMs);
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
      onDone?.(`⚠ ${errMsg}`, `⚠ ${errMsg}`);
      return;
    }
    const reader = res.body?.getReader();
    if (!reader) {
      onDone?.("⚠ 当前浏览器不支持流式响应", "⚠ 当前浏览器不支持流式响应");
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
            onDone?.(finalText, payload?.text ?? accumulated);
            return;
          } else if (currentEvent === "error") {
            onDone?.(`⚠ 生成失败: ${payload?.error ?? "未知错误"}`, "");
            return;
          }
        }
      }
    }
    // reader 正常结束但没有 event:done —— 强制收尾
    const finalText = stripStageMarker(accumulated);
    onDone?.(finalText, accumulated);
  } catch (err: any) {
    let msg = err?.message || "未知错误";
    if (err instanceof DOMException && err.name === "AbortError") msg = "生成超时(上限约 290s),请稍后重试或精简 prompt";
    onDone?.(`⚠ ${msg}`, "");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
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
    return (MODELS.some((m) => m.id === saved) ? saved : "ark") as ModelId;
  });
  const [references, setReferences] = useState<InspirationItem[]>([]); // 最近一次匹配到的灵感引用
  const [recommendation, setRecommendation] = useState<MaterialRecommendation | null>(null); // AI 推荐的材质+配色方案
  const setModel = (id: ModelId) => { setModelState(id); localStorage.setItem("laisse-ancie:model", id); };
  const isMobile = useIsMobile();
  const [planOpen, setPlanOpen] = useState(false); // 移动端企划(单品/系列)抽屉开关
  const [canvasOpen, setCanvasOpen] = useState(false); // 移动端画布(插画)抽屉开关
  const scrollRef = useRef<HTMLDivElement>(null);

  // —— 插画(支持图片 + HTML 两种_output)的状态 ——
  const [illustOutputMode, setIllustOutputMode] = useState<"image" | "html">("image"); // 当前插画产出模式(默认图片)
  const [illustHtml, setIllustHtml] = useState<string | null>(null);     // 当前画布渲染的自包含 HTML
  const [illustBusy, setIllustBusy] = useState(false);                    // 插画生成进行中(不阻塞 chat)
  const [illustMsgId, setIllustMsgId] = useState<string | null>(null);   // 当前展示插画的消息 id(渲染画布入口)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  // 开场自动发一条 assistant 消息(按 mode 给不同引导)
  useEffect(() => {
    if (msgs.length === 0 && !busy) {
      const greeting = mode === "illustration"
        ? "欢迎来到 Laisse Ancie 插画工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…)和**风格**(水彩、矢量、现代极简、装饰艺术…),我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 品牌 / 知识,生成 1 个插画方案\n3️⃣ 你确认后,生成插画(默认出图,可切换为 HTML 画布)\n\n下方会在你确认方案后出现【图片 / HTML】切换,两种输出都可在这切换。"
        : mode === "collection"
          ? "欢迎来到 Laisse Ancie 系列设计工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…)和**品类方向**,我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 品牌 / 知识,生成 1 个完整系列方案\n3️⃣ 你确认后,生成**系列线稿** → 再选材料 → 生成最终成图\n\n工作流:方案 → 线稿 → 选材料 → 成图"
          : "欢迎来到 Laisse Ancie 设计工作室 ✨\n\n告诉我你想做的**主题**(猫咪、玫瑰、海洋、节气、复古、极简…),或者直接说品类(连衣裙、托特包、香薰、贴纸…),我会:\n\n1️⃣ 从灵感库匹配 3 个最相关的借鉴\n2️⃣ 结合灵感 + 品牌 / 知识,生成 1 个完整方案\n3️⃣ 你确认后,生成**设计线稿** → 再选材料 → 生成最终成图\n\n工作流:方案 → 线稿 → 选材料 → 成图";
      setMsgs([{ id: "greeting", role: "assistant", text: greeting }]);
      setStage("greeting");
    }
  }, []);

  /** 构建「参考灵感」注入块(前端本地匹配 3 张灵感) */
  function buildReferencesBlock(raw: string): { block: string; refs: InspirationItem[] } {
    const matchedRefs = matchInspirations(raw, knowledge?.inspirations ?? [], 3);
    setReferences(matchedRefs);
    const block = matchedRefs.length
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
    return { block, refs: matchedRefs };
  }

  /** 单品 / 系列:chat 主流程(设计顾问 + 灵感 + 知识 → 方案) */
  async function send(raw: string) {
    if (!raw.trim() || busy || knowledgeLoading) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: raw.trim() };
    setMsgs((xs) => [...xs, userMsg]);
    setBusy(true);

    const assistantId = crypto.randomUUID();
    setMsgs((xs) => [...xs, { id: assistantId, role: "assistant", text: "" }]);

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
      onDone: (finalText, rawAccum) => {
        const newStage = parseStage(rawAccum) || stage;
        const withRefs = newStage === "proposal" || newStage === "references" || stage === "greeting"
          ? { text: finalText, references: matchedRefs }
          : { text: finalText };
        setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, ...withRefs } : m));
        setStage(newStage);
        if (newStage === "planning" || newStage === "brainstorming" || newStage === "proposal") {
          setPlanText(finalText);
        }
      },
    });
    setBusy(false);
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
      onDone: (finalText, rawAccum) => {
        const html = extractHtmlBlock(rawAccum);
        if (html) {
          setIllustHtml(html);
          setIllustMsgId(assistantId);
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: "✅ 插画稿已生成,可在右侧画布查看;告诉我要调整的地方。", html }
            : m));
          setStage("presenting-html");
        } else {
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: "⚠ 未检测到 HTML 输出,请重试或调整方案。" }
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
      onDone: (finalText, rawAccum) => {
        const html = extractHtmlBlock(rawAccum);
        if (html) {
          setIllustHtml(html);
          setIllustMsgId(assistantId);
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: "✅ 插画稿已更新,可在右侧画布查看;继续调整或确认。", html }
            : m));
          setStage("presenting-html");
        } else {
          setMsgs((xs) => xs.map((m) => m.id === assistantId
            ? { ...m, text: "⚠ 未检测到 HTML 输出,请重试。" }
            : m));
        }
      },
    });
    setIllustBusy(false);
  }

  /** 用户确认企划 → 进入生成:
   *  - 插画(illustration):按 illustOutputMode 分叉(图片/HTML),走原有路径;
   *  - 单品 / 系列(single/collection):走「线稿生成」(线稿 → 选材料 → 最终成图)。 */
  async function startGeneration() {
    if (mode === "illustration") {
      if (illustOutputMode === "html") { await generateHtml(); return; }
      // 插画 + 图片模式 → 走 /design/generate(1:1 印花图案)
    }
    if (generating) return;
    setGenerating(true);
    // 单品 / 系列 → 线稿;插画 → 最终图
    const isLineart = mode !== "illustration";
    setStage(isLineart ? "generating-lineart" : "generating");
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: isLineart ? "开始生成设计线稿…" : "开始生成设计图…" }]);
    try {
      const path = isLineart ? "/design/lineart" : "/design/generate";
      const res = await fetch(teamApi(teamId ?? "").chatUrl.replace("/chat", path), {
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
      setStage(isLineart ? "presenting-lineart" : "presenting");
      setMsgs((xs) => [...xs, {
        id: crypto.randomUUID(), role: "assistant",
        text: isLineart ? "✏️ 设计线稿已生成! 看看结构是否满意,可以修改单张线稿,确认后进入选材料。" : "✨ 设计图已生成! 看看这套作品,有需要调整的地方随时告诉我。"
      }]);
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败: ${e.message}` }]);
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
    setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `使用「${recommendation.name}」(${recommendation.colors.join(' / ')})生成最终设计图…` }]);
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
      setImages((prev) => [...prev.filter((im) => im.slot === "lineart"), ...(data.images || [])]);
      setStage("presenting");
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: "✨ 最终设计图已生成! 看看这套作品,有需要调整的地方随时告诉我。" }]);
    } catch (e: any) {
      setMsgs((xs) => [...xs, { id: crypto.randomUUID(), role: "assistant", text: `生成失败: ${e.message}` }]);
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

  /** 把本次设计录入 Lookbook。
   *  - 单品/系列/插画+图片:必须有图片;
   *  - 插画+HTML:必须有 html。 */
  async function saveToLookbook() {
    const hasImage = mode === "illustration" ? images.length > 0 : images.length > 0;
    const hasHtml = !!(mode === "illustration" && illustOutputMode === "html" && illustHtml);
    if (!hasImage && !hasHtml) return;
    const now = new Date().toISOString();
    const mainImage = images.find((im) => im.url);
    // 收集所有可访问的图片(结构化数组,供 Lookbook 直接展示缩略图)
    const productImages = images.filter((im): im is typeof im & { url: string } => !!im.url).map((im) => ({ slot: im.slot, label: im.label, url: im.url }));
    const product: Product = {
      id: crypto.randomUUID(),
      mode,
      title: `Design ${now.slice(0, 10)}`,
      description: planText,
      seasons: [],
      category: mode,
      colors: recommendation?.colors ?? [],
      recommendation: recommendation ?? undefined,
      tech_pack_url: mainImage?.url,
      images: productImages,
      ...(hasHtml ? { html: illustHtml! } : {}),
      aiDraftRaw: JSON.stringify({ plan: planText, images, ...(recommendation ? { recommendation } : {}), ...(hasHtml ? { html: illustHtml! } : {}) }),
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

  // 新流程用 proposal 阶段(旧 planning 仍兼容)。插画生成用 illustBusy,不阻塞 chat。
  const canGenerate = (stage === "planning" || stage === "proposal") && !generating && !illustBusy;
  // 线稿展示阶段(仅 single / collection)
  const showLineart = mode !== "illustration" && (stage === "presenting-lineart" || stage === "generating-lineart") && images.some((im) => im.slot === "lineart");
  // 最终图展示(线稿保留 + 最终图)
  const showFinalImages = mode !== "illustration" && stage === "presenting" && images.some((im) => im.slot === "final");
  // 图片画廊:线稿 / 最终图 / 插画图片
  const showImages = (showLineart || showFinalImages || (stage === "presenting" && mode === "illustration")
    || (stage === "generating" && images.length > 0))
    && !(mode === "illustration" && illustOutputMode === "html");
  // 插画 HTML 产物 → 画布
  const showCanvas = mode === "illustration" && illustOutputMode === "html" && (stage === "presenting-html" || illustHtml);
  const inIllustGenerating = mode === "illustration" && stage === "generating";
  // 插画当前产物是图片(右侧渲染 ImageCard,修改走 regenerateOne)
  const illustShowingImage = mode === "illustration" && illustOutputMode === "image" && images.length > 0;
  // 线稿确认按钮(仅 presenting-lineart)
  const canConfirmLineart = mode !== "illustration" && stage === "presenting-lineart";

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
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4 bg-gray-50">
            {msgs.map((m) => (
              <div key={m.id} className={`w-fit rounded-2xl px-4 py-3 max-w-[85%] text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-primary-500 text-white ml-auto rounded-br-sm whitespace-pre-wrap" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
                {/* 灵感引用卡片(仅 assistant 消息附带 references 时渲染) */}
                {m.role === "assistant" && m.references && m.references.length > 0 && (
                  <div className="mb-3 pb-3 border-b border-gray-100">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">参考灵感 · 方案将借鉴这 {m.references.length} 张</div>
                    <div className="flex gap-2 overflow-x-auto">
                      {m.references.map((ref) => (
                        <div key={ref.id} className="shrink-0 w-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50" title={`${ref.category ?? ""}${ref.visualStyle ? ` · ${ref.visualStyle}` : ""}`}>
                          <div className="bg-gray-100 overflow-hidden">
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
                {busy && m.role === "assistant" && (
                  <div className="text-gray-500 max-w-[80%] inline-block whitespace-nowrap">请求中…</div>
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

            {/* 生成按钮(企划确认后) */}
            {canGenerate && (
              <div className="flex justify-center">
                <button onClick={startGeneration} className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm shadow-lg transition-colors">
                  {mode === "illustration" ? (illustOutputMode === "html" ? "确认方案,生成插画 HTML" : "确认方案,生成插画图") : "确认方案,生成设计线稿"}
                </button>
              </div>
            )}

            {/* 线稿确认按钮(仅 single / collection 的 presenting-lineart) */}
            {canConfirmLineart && (
              <div className="flex justify-center gap-3">
                <button onClick={saveToLookbook} className="px-5 py-3 rounded-2xl border border-gray-300 hover:border-gray-400 text-gray-600 font-medium text-sm transition-colors">
                  直接录入 Lookbook
                </button>
                <button onClick={confirmLineart} className="px-6 py-3 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-medium text-sm shadow-lg transition-colors">
                  线稿确认,下一步选材料
                </button>
              </div>
            )}

            {/* 最终成图:进入 generating-final 时展示提示 */}
            {stage === "generating-final" && (
              <div className="flex justify-center">
                <div className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm">
                  正在结合「{recommendation?.name}」生成最终设计图…
                </div>
              </div>
            )}

            {/* 生成中(单品/系列:图片;插画:图片 / HTML) */}
            {(generating || inIllustGenerating) && (
              <div className="flex justify-center">
                <div className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-600 text-sm">
                  {mode === "illustration" ? (illustOutputMode === "html" ? "正在生成插画 HTML…" : "正在生成插画图…") : "正在生成设计图…"}
                </div>
              </div>
            )}

            {/* 设计图展示(线稿 / 最终图 / 插画+图片) —— 录入按钮已移到右侧 preview 区 */}
            {showImages && images.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">
                  {showLineart ? "设计线稿" : (showFinalImages && recommendation ? `最终设计图 · ${recommendation.name}` : "设计图")}
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

          <PromptBar
            placeholder={
              knowledgeLoading ? "加载知识库中…" :
                stage === "greeting" ? (mode === "illustration" ? "输入一个主题 + 风格(如:猫咪 / 复古水彩)…" : mode === "collection" ? "输入一个主题 + 品类方向…" : "输入一个主题(猫咪/玫瑰/海洋/节气/极简…)") :
                  stage === "brainstorming" ? "选一个方向(1/2/3),或提出自己的想法…" :
                    (stage === "planning" || stage === "proposal") ? "确认方案(OK/开始),或提出修改意见…" :
                      (stage === "presenting" || stage === "presenting-html") ? "描述你想修改的地方…" :
                        "输入…"
            }
            disabled={knowledgeLoading}
            onSubmit={send}
          />
        </div>

        {/* 桌面端侧栏:单品/系列/插画+图片=设计方案·材料选择 / 插画+HTML=画布预览 + 修图输入 */}
        {mode === "illustration" && illustOutputMode === "html"
          ? <IllustrationCanvas html={illustHtml} generating={illustBusy} stage={stage} illustHtml={illustHtml} onModify={regenerateHtml} onSaveToLookbook={saveToLookbook} />
          : <PlanSideBar planText={planText} stage={stage} images={images} onSaveToLookbook={saveToLookbook} recommendation={recommendation} onRecommendationChange={setRecommendation} onRefreshRecommendation={fetchRecommendation} onGenerateFinal={generateFinal} generating={generating} />
        }
      </div>
      {/* 移动端抽屉(<md,跟主内容同级渲染) */}
      {isMobile && (mode === "illustration" && illustOutputMode === "html")
        ? <IllustrationCanvasDrawer html={illustHtml} generating={illustBusy} open={canvasOpen} onClose={() => setCanvasOpen(false)} onModify={regenerateHtml} stage={stage} onSaveToLookbook={saveToLookbook} />
        : isMobile && <ComposerPlanDrawer planText={planText} open={planOpen} onClose={() => setPlanOpen(false)} stage={stage} images={images} onSaveToLookbook={saveToLookbook} recommendation={recommendation} onRecommendationChange={setRecommendation} onRefreshRecommendation={fetchRecommendation} onGenerateFinal={generateFinal} generating={generating} />
      }
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
      {/* 录入 Lookbook —— 统一放右侧 preview 区底部 */}
      {canSave && (
        <button onClick={onSaveToLookbook}
          className="mt-4 shrink-0 w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
          录入 Lookbook
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
function PlanSideBar({ planText, stage, images, onSaveToLookbook, recommendation, onRecommendationChange, onRefreshRecommendation, onGenerateFinal, generating }: {
  planText: string; stage: string; images: GeneratedImage[]; onSaveToLookbook: () => void;
  recommendation: MaterialRecommendation | null;
  onRecommendationChange: (r: MaterialRecommendation) => void;
  onRefreshRecommendation: () => void;
  onGenerateFinal: () => void;
  generating: boolean;
}) {
  const canSave = (stage === "presenting" || stage === "presenting-lineart" || stage === "material-recommend") && images.some((im) => im.url);
  const isRecForm = stage === "material-recommend" || stage === "generating-final";
  const hasLineart = images.some((im) => im.slot === "lineart" && im.url);
  const hasFinal = images.some((im) => im.slot === "final" && im.url);
  return (
    <aside className="hidden md:flex flex-col border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0">
      {/* ① 设计图稿(线稿+效果图缩略,始终可见) */}
      {(hasLineart || hasFinal) && (
        <div className="shrink-0 p-4 pb-2 border-b border-gray-200">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">设计图稿</div>
          <div className="flex gap-2 overflow-x-auto">
            {images.filter((im) => (im.slot === "lineart" || im.slot === "final") && im.url && !im.error).map((im) => (
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
          </>
        }
      </div>

      {/* ③ 录入 Lookbook */}
      {canSave && (
        <div className="shrink-0 p-4 pt-0">
          <button onClick={onSaveToLookbook}
            className="w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
            录入 Lookbook
          </button>
        </div>
      )}
    </aside>
  );
}

/** 材质+配色推荐编辑表单 */
function RecForm({ recommendation, onChange, onRefresh, onConfirm, loading, disabled }: {
  recommendation: MaterialRecommendation | null;
  onChange: (r: MaterialRecommendation) => void;
  onRefresh: () => void;
  onConfirm: () => void;
  loading: boolean;
  disabled: boolean;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500">AI 材质推荐</div>
        <button onClick={onRefresh} disabled={disabled} className="text-[10px] text-primary-600 hover:underline disabled:opacity-40">
          换一批
        </button>
      </div>

      {/* 材质名 */}
      <label className={labelCls}>材质名</label>
      <input className={`${inputCls} mb-2.5`} value={recommendation.name}
        onChange={(e) => setField('name', e.target.value)} placeholder="如:真丝双绉 / 棉麻平纹"
        disabled={disabled} />

      {/* 成分 */}
      <label className={labelCls}>成分 / 克重</label>
      <input className={`${inputCls} mb-2.5`} value={recommendation.composition ?? ''}
        onChange={(e) => setField('composition', e.target.value)} placeholder="如:100%桑蚕丝 16mm"
        disabled={disabled} />

      {/* 触感 */}
      <label className={labelCls}>触感 / 表面</label>
      <input className={`${inputCls} mb-2.5`} value={recommendation.texture ?? ''}
        onChange={(e) => setField('texture', e.target.value)} placeholder="如:光滑垂坠 / 粗粝自然"
        disabled={disabled} />

      {/* 后整 */}
      <label className={labelCls}>后整工艺</label>
      <input className={`${inputCls} mb-2.5`} value={recommendation.finish ?? ''}
        onChange={(e) => setField('finish', e.target.value)} placeholder="如:哑光 / 丝光 / 水洗"
        disabled={disabled} />

      {/* 配色 */}
      <div className="flex items-center justify-between mb-1">
        <label className={`${labelCls} !mb-0`}>配色 ({recommendation.colors.length}/5)</label>
        <button onClick={addColor} disabled={disabled || recommendation.colors.length >= 5}
          className="text-[10px] text-primary-600 hover:underline disabled:opacity-40">+ 添加</button>
      </div>
      <div className="space-y-1.5 mb-3">
        {recommendation.colors.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input type="color" value={c} disabled={disabled}
              onChange={(e) => updateColor(i, e.target.value)}
              className="w-7 h-7 rounded border border-gray-200 cursor-pointer" />
            <input className={`${inputCls} !py-1 flex-1`} value={c}
              onChange={(e) => updateColor(i, e.target.value)} disabled={disabled} />
            <button onClick={() => removeColor(i)} disabled={disabled || recommendation.colors.length <= 1}
              className="text-[10px] text-gray-400 hover:text-red-500 disabled:opacity-30 shrink-0">✕</button>
          </div>
        ))}
      </div>

      {/* 配色预览 */}
      <div className="h-6 rounded-lg overflow-hidden border border-gray-200 mb-3">
        <SwatchStrip colors={recommendation.colors} />
      </div>

      {/* 推荐理由 */}
      {recommendation.reason && (
        <div className="text-[10px] text-gray-500 mb-3 italic">💬 {recommendation.reason}</div>
      )}

      {/* 确认按钮 */}
      <button onClick={onConfirm} disabled={disabled || !recommendation.name.trim()}
        className="w-full text-[12px] bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg font-medium transition-colors">
        确认材质方案,生成效果图
      </button>
    </div>
  );
}

/** 移动端企划抽屉(<md 才渲染),挂在 Composer 外层由父组件组合。 */
export function ComposerPlanDrawer({ planText, open, onClose, stage, images, onSaveToLookbook, recommendation, onRecommendationChange, onRefreshRecommendation, onGenerateFinal, generating }: {
  planText: string; open: boolean; onClose: () => void; stage: string; images: GeneratedImage[]; onSaveToLookbook: () => void;
  recommendation: MaterialRecommendation | null;
  onRecommendationChange: (r: MaterialRecommendation) => void;
  onRefreshRecommendation: () => void;
  onGenerateFinal: () => void;
  generating: boolean;
}) {
  const canSave = (stage === "presenting" || stage === "presenting-lineart" || stage === "material-recommend") && images.some((im) => im.url);
  const isRecForm = stage === "material-recommend" || stage === "generating-final";
  const hasLineart = images.some((im) => im.slot === "lineart" && im.url);
  const hasFinal = images.some((im) => im.slot === "final" && im.url);
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
        {(hasLineart || hasFinal) && (
          <div className="shrink-0 px-4 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
            {images.filter((im) => (im.slot === "lineart" || im.slot === "final") && im.url && !im.error).map((im) => (
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
            </>
          }
        </div>

        {canSave && (
          <div className="shrink-0 p-4 pt-0">
            <button onClick={onSaveToLookbook}
              className="w-full text-[12px] bg-primary-500 hover:bg-primary-600 text-white px-3 py-2 rounded-lg font-medium transition-colors">
              录入 Lookbook
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

/** 单张设计图卡片 + 修图输入 */
function ImageCard({ image, onRegenerate }: { image: GeneratedImage; onRegenerate: (inst: string) => void }) {
  const [inst, setInst] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
      <div className="bg-gray-100 overflow-hidden">
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
