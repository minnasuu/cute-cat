// @ts-nocheck
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

const MODE_SPEC: Record<DesignMode, { sys: string; example_json: object }> = {
  illustration: {
    sys: `你是 Laisse Ancie 的视觉插画师。我们围绕 Lookbook / 印花 / 主视觉 / 包装等用途创作原创插画/图形作品。
输出一段详细的英文 prompt，可用于图像生成工具（Midjourney / Stable Diffusion / 内部素材与像素生成）。
最后用 \`\`\`json 输出此作品的结构化 record：

{
  "title": "string",
  "zhTitle": "string (中文作品名)",
  "kind": "illustration | print | keyvisual | template | lookbook | packaging",
  "prompt": "string (image-generation prompt, 英文, 含媒材 · 构图 · 色彩 · 氛围 · 参考)",
  "palette": ["#hex"],
  "aspect": "3:4",
  "usage": "lookbook | packaging | kv | template",
  "description": "string (用途叙述, 100字以内)"
}

先问 1 个关键方向问题，然后输出 prompt + json。`,
    example_json: { title: "Spring Tide · 潮汐新娘插画", zhTitle: "Spring Tide · 插画", kind: "illustration", prompt: "...", palette: ["#1f3a44", "#d8c9a3", "#9b6a3a"], aspect: "3:4", usage: "lookbook", description: "Spring Tide 主题季刊封面插画" },
  },
  single: {
    sys: `你是 Laisse Ancie 的设计师助理。我们围绕一件具体的单品做设计对话。
用户会随对话逐步给出灵感调整。每一轮你都需要在末尾用 \`\`\`json 代码块回复
当前这个产品的完整 JSON 草稿，字段如下：

{
  "title": "string (产品名)",
  "seasons": ["SS26"],
  "category": "string",
  "silhouette": "string",
  "colors": ["#hex"],
  "targetPriceNum": 0,
  "fabricComposition": "string",
  "liningComposition": "(可选)",
  "stitchNotes": "string",
  "measureTable": "string (markdown表格)",
  "gradingNotes": "string",
  "description": "string (150字以内的产品叙述，用于Lookbook文案)"
}

对话开始前先问用户 1 个关键问题；然后根据回答输出完整 JSON。`,
    example_json: { title: "Spring Tide · 水洗真丝挂肩裙", seasons: ["SS26"], category: "dress", silhouette: "19 momme 水洗真丝，挂肩斜裁，窄袖", colors: ["#1f3a44", "#d8c9a3", "#9b6a3a"], targetPriceNum: 368 },
  },
  collection: {
    sys: `你是 Laisse Ancie 的系列设计师。我们围绕一个季节主题来做多品系列的规划对话。
用户在每轮给出方向调整，但每一轮你都需要把整个系列以 \`\`\`json 的形式落地：

{
  "collection": { "title": "string", "season": "SS26", "theme": "string", "palette": ["#hex"], "designerNote": "string" },
  "products": [ { 单品 draft 字段, 同 single 模式, required targetPriceNum } ]
}

第一次回复先问 1 个关键方向问题，之后每轮更新整个系列定义。`,
    example_json: { collection: { title: "Spring Tide", season: "SS26", theme: "潮汐 — 以潮汐色水洗真丝为主", palette: ["#1f3a44", "#d8c9a3", "#9b6a3a"], designerNote: "一次温柔潮汐，用 three drops 讲述潮汐起落。" }, products: [{ title: "Spring Tide · 水洗真丝挂肩裙", seasons: ["SS26"], category: "dress", colors: ["#1f3a44"], targetPriceNum: 368, silhouette: "挂肩斜裁" }] },
  },
  occasion: {
    sys: `你是 Laisse Ancie 的专题系列设计师。我们围绕一个特定节日（春节 / 情人节 / 圣诞 …）做有主题的对齐创作。
每轮末尾都需要用 \`\`\`json 输出专题系列 + 产品：

{
  "collection": { "occasion": "string", "occasion_cn": "春节", "season": "SS26 / FW26", "theme": "string", "palette": ["#hex"], "designerNote": "string" },
  "products": [ 单品 draft 字段, 同 single 模式 ]
}

首次提问问 1 个关键方向问题。`,
    example_json: { collection: { occasion: "Valentine", occasion_cn: "情人节", season: "SS26", theme: "心跳色 — 红粉卵石色 + 水洗蓝", palette: ["#c26273", "#ead7d1", "#e5eeff"], designerNote: "第一次见面那天的心跳，做成可穿戴的礼物。" }, products: [] },
  },
};

function draftFromObject(o: any, mode: DesignMode): Product | null {
  if (!o || typeof o !== "object") return null;
  const now = new Date().toISOString();
  if (mode === "single" || mode === "illustration") return normalizeSingle(o, now, mode);
  const products = Array.isArray(o.products) ? o.products : [];
  const c = o.collection ?? {};
  return normalizeSingle(products[0] ?? o, now, "single", c.title || c.occasion || "untitled");
}

function normalizeSingle(o: any, now: string, mode: DesignMode = "single", titleOverride?: string): Product {
  return {
    id: crypto.randomUUID(),
    mode,
    title: titleOverride || o.title || o.zhTitle || "untitled",
    description: (o.description || "") + (o.prompt ? `\n\n${o.prompt}` : ""),
    seasons: o.seasons ?? [],
    category: o.kind === "illustration" ? "illustration" : (o.category || ""),
    colors: Array.isArray(o.colors) ? o.colors : Array.isArray(o.palette) ? o.palette : [],
    targetPriceNum: typeof o.targetPriceNum === "number" ? o.targetPriceNum : undefined,
    silhouette: o.aspect ? `${o.aspect} ${o.usage ?? ""}` : (o.silhouette),
    fabricComposition: o.fabricComposition || (o.kind ? `kind: ${o.kind}` : undefined),
    tech_pack_url: o.prompt ? `prompt: ${o.prompt.slice(0, 200)}` : undefined,
    aiDraftRaw: typeof o === "string" ? o : JSON.stringify(o),
    status: "draft",
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parseJsonBlock(s: string): any {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = m ? m[1] : s;
  try { return JSON.parse(candidate); } catch { return null; }
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  product?: Product;
}

export default function ComposerPage({
  mode: modeProp,
  knowledge,
}: {
  mode?: DesignMode;
  knowledge?: KnowledgeDeps;
}) {
  const params = useParams<{ mode: DesignMode }>();
  const mode = modeProp ?? params.mode;
  const spec = MODE_SPEC[mode ?? "single"];
  const store = useDesignStore();
  const skillStore = useSkillStore();
  const { teamId, navigateTab } = useCurrentTeam();

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  async function send(raw: string) {
    if (!raw.trim() || busy) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", text: raw.trim() };
    const history = [...msgs, userMsg].map((m) => ({ role: m.role, content: m.text }));
    const userPrompt = history.map((h) => `[${h.role}] ${h.content}`).join("\n\n");
    setMsgs((xs) => [...xs, userMsg]);
    setBusy(true);

    // 预创建一条空的 assistant 消息，流式过程中增量更新它的 text
    const assistantId = crypto.randomUUID();
    setMsgs((xs) => [...xs, { id: assistantId, role: "assistant", text: "" }]);

    // 自动从「资源 + 知识底座」按相关性注入 chat 的 system prompt
    const knowledgeBlock = knowledge
      ? buildKnowledgeInjectors(knowledge)
          .map((injector) => injector(userPrompt + " " + raw, knowledge))
          .filter(Boolean)
          .join("\n\n")
      : "";
    const system = knowledgeBlock ? `${spec.sys}\n\n${knowledgeBlock}` : spec.sys;

    // 流式 SSE 消费：手动 fetch（apiClient 当前只支持 JSON 非流式）
    const streamTimeoutMs = 290_000; // 与 nginx proxy_read_timeout 300s 留余量
    const ac = new AbortController();
    const timeoutId = globalThis.setTimeout(() => ac.abort(), streamTimeoutMs);

    try {
      const res = await fetch(teamApi(teamId ?? "").chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ system, prompt: userPrompt, model: undefined, maxTokens: 2048 }),
        signal: ac.signal,
      });

      if (!res.ok) {
        // 兼容后端非流式的错误 JSON（如 400）
        let errMsg = `请求失败（HTTP ${res.status}）`;
        try {
          const errJson = await res.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch { /* 非 JSON 响应 */ }
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
          if (!trimmed) { currentEvent = ""; continue; } // 事件边界
          if (trimmed.startsWith(":")) continue; // heartbeat 注释行
          if (trimmed.startsWith("event: ")) { currentEvent = trimmed.slice(7).trim(); continue; }
          if (trimmed.startsWith("data: ")) {
            let payload: any = null;
            try { payload = JSON.parse(trimmed.slice(6)); } catch { continue; }

            if (currentEvent === "chunk" && payload?.text) {
              accumulated += payload.text;
              // 增量更新 assistant 消息文本（函数式更新避免覆盖）
              const snap = accumulated;
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: snap } : m));
            } else if (currentEvent === "done") {
              const finalText = payload?.text ?? accumulated;
              const json = parseJsonBlock(finalText);
              const prod = json ? draftFromObject(json, mode ?? "single") : null;
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: finalText, product: prod ?? undefined } : m));
              if (prod) setDraft(prod);
            } else if (currentEvent === "error") {
              setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: `⚠ 生成失败：${payload?.error ?? "未知错误"}` } : m));
            }
          }
        }
      }
    } catch (err: any) {
      let msg = err?.message || "未知错误";
      if (err instanceof DOMException && err.name === "AbortError") {
        msg = "生成超时（当前上限约 290s），请稍后重试或精简 prompt";
      } else if (/aborted/i.test(msg)) {
        msg = "连接已中断（常见于网络波动或反向代理超时），请重试";
      }
      setMsgs((xs) => xs.map((m) => m.id === assistantId ? { ...m, text: `⚠ ${msg}` } : m));
    } finally {
      globalThis.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  async function submitDraft() {
    if (!draft) return;
    const now = new Date().toISOString();
    const withStatus: Product = {
      ...draft,
      status: "submitted",
      statusHistory: [
        { id: crypto.randomUUID(), status: "draft", at: draft.createdAt, actor: "atelier" },
        { id: crypto.randomUUID(), status: "submitted", at: now, actor: "atelier" },
      ],
      updatedAt: now,
    };
    await store.upsertProduct(withStatus);
    navigateTab("lookbook");
  }

  return (
    <div className="grid grid-cols-[1fr_360px] h-[calc(100vh-64px)] min-h-0">
      <div className="flex flex-col min-h-0">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-baseline gap-2">
            <button onClick={() => navigateTab("__design__")} className="text-sm text-gray-500 hover:text-gray-800">←</button>
            <span className="text-2xl font-semibold text-blue-600">{MODE_LABEL[mode ?? "single"]}</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">{mode}</span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 min-h-0 space-y-4 bg-gray-50">
          {msgs.length === 0 && (
            <div className="text-gray-500 text-sm max-w-lg">
              <p className="mb-2 font-medium text-gray-700">本次对话 · 你将与 LongCat 一起创作</p>
              <ul className="list-disc pl-5 space-y-1 text-[13px]">
                <li>先简要描述你的灵感 · 灵感图 · 色板 · 季节</li>
                <li>AI 每轮回复末尾会更新此产品的 JSON</li>
                <li>满意后按下「录入 Lookbook」将产品送下道工序</li>
              </ul>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`rounded-2xl px-4 py-3 max-w-[80%] text-[13.5px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-blue-600 text-white ml-auto rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"}`}>
              {m.text}
            </div>
          ))}
          {busy && (
            <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200 text-gray-500 max-w-[80%] inline-block">生成中…</div>
          )}
        </div>
        <PromptBar placeholder="描述产品 · 灵感 · 季节性 · 颜色 · 面料 …" onSubmit={send} />
      </div>

      <aside className="border-l border-gray-200 bg-gray-50 p-5 overflow-y-auto min-h-0">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">当前草稿</div>
        {!draft && <p className="text-sm text-gray-500">AI 回复中若包含 JSON 则会在此预览。</p>}
        {draft && (
          <>
            <h3 className="text-2xl font-semibold text-gray-900 mb-3">{draft.title || "未命名"}</h3>
            <div className="space-y-3 text-[13px]">
              {draft.category && <Field label="品类" value={draft.category} />}
              {draft.seasons?.length > 0 && <Field label="季节" value={draft.seasons.join(", ")} />}
              {draft.silhouette && <Field label="版型" value={draft.silhouette} />}
              {draft.colors?.length > 0 && (
                <div>
                  <div className="text-gray-500 text-[10px] mb-1">色板</div>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.colors.map((c) => <span key={c} className="w-6 h-6 rounded border border-gray-200" style={{ background: c }} />)}
                  </div>
                </div>
              )}
              {typeof draft.targetPriceNum === "number" && <Field label="目标价" value={`¥${draft.targetPriceNum}`} />}
              {draft.fabricComposition && <Field label="面料" value={draft.fabricComposition} />}
              {draft.description && <Field label="描述" value={draft.description.slice(0, 300)} />}
            </div>
            <button onClick={submitDraft} className="w-full mt-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 text-sm transition-colors">
              ✓ 录入 Lookbook
            </button>
            <button onClick={() => navigateTab("lookbook")} className="w-full mt-2 rounded-xl border border-gray-200 text-gray-700 font-medium py-2 text-sm hover:border-blue-500 hover:text-blue-600 transition-colors">
              先不下发 · 直接进入 Lookbook
            </button>
          </>
        )}
      </aside>
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
