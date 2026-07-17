// @ts-nocheck
/**
 * StyleMutate ——「款式裂变」工作台。
 *
 * 输入:1 张母款(上传/库) + 裂变轴勾选(廓形/领型/袖长/长短/细节) + 可选锁定面料
 *   → N 张「保留母款 DNA、仅改所选维度」的白底子款图。
 * 后端异步批次 + 前端轮询,交互对齐材料组合。
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { teamApi } from "../lib/api";
import type { StyleMutateBatch } from "../lib/api";
import { useDesignStore } from "../store/design";
import type { KnowledgeDeps } from "../../DashboardPage/knowledge-injectors";
import { compressForUpload } from "../lib/images";
import { Modal } from "../components/ui";
import { GenerateButton, AI_COST_PER_IMAGE } from "../../../components/GenerateButton";
import { useAuth } from "../../../contexts/AuthContext";
import { useImageRetry } from "../../../hooks/useImageRetry";
import { useStyleMutateTour } from "../controller/useStyleMutateTour";
import TourOverlay, { type TourStep } from "../components/TourOverlay";

const MAX_MUTATIONS = 8;
const POLL_MS = 3000;
const POLL_MAX_ATTEMPTS = 120;

/** 服装品类:决定该品类下可用的裂变轴 */
export const GARMENT_CATEGORIES = [
  { id: "top", label: "上衣" },
  { id: "bottom", label: "下装" },
  { id: "skirt", label: "半身裙" },
  { id: "dress", label: "连衣裙" },
  { id: "outerwear", label: "外套" },
  { id: "other", label: "其他" },
] as const;

export type GarmentCategoryId = (typeof GARMENT_CATEGORIES)[number]["id"];

/** 单个裂变选项 */
export interface MutationOption {
  id: string;
  label: string;
  promptHint: string;
}

/** 单条裂变轴 */
export interface MutationAxis {
  id: string;
  label: string;
  /** 该轴适用的品类(空数组 = 通用,所有品类都显示) */
  categories?: GarmentCategoryId[];
  options: MutationOption[];
}

/** 裂变轴定义(与后端 promptHint 对齐) */
export const MUTATION_AXES: MutationAxis[] = [
  // ── 通用轴(所有品类) ──
  {
    id: "silhouette",
    label: "版型",
    options: [
      { id: "boxy", label: "方正版", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to a structured boxy fit with straight side seams." },
      { id: "relaxed", label: "宽松", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to a relaxed loose fit with comfortable ease." },
      { id: "oversized", label: "oversize", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to an oversized fit with generous volume." },
      { id: "slim", label: "修身", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to a slim fitted shape that follows the body." },
      { id: "cocoon", label: "茧型", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to a soft cocoon shape with rounded volume." },
      { id: "trapeze", label: "梯形 A-字", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Change the silhouette to a trapeze A-line shape." },
      { id: "fit-flare", label: "收腰外扩", promptHint: "Modify ONLY the garment silhouette. Keep all other design elements unchanged. Create a fitted upper body with a softly flared lower body." },
    ],
  },
  {
    id: "sleeve",
    label: "袖型",
    categories: ["top", "dress", "outerwear"],
    options: [
      { id: "sleeveless", label: "无袖", promptHint: "Modify ONLY the sleeves. Remove sleeves to make it sleeveless." },
      { id: "cap", label: "盖袖", promptHint: "Modify ONLY the sleeves. Change them to cap sleeves." },
      { id: "short", label: "短袖", promptHint: "Modify ONLY the sleeves. Change them to short sleeves." },
      { id: "elbow", label: "中袖", promptHint: "Modify ONLY the sleeves. Change them to elbow-length sleeves." },
      { id: "long", label: "长袖", promptHint: "Modify ONLY the sleeves. Change them to long sleeves." },
      { id: "balloon", label: "灯笼袖", promptHint: "Modify ONLY the sleeves. Change them to balloon sleeves with soft volume." },
      { id: "bishop", label: "主教袖", promptHint: "Modify ONLY the sleeves. Change them to bishop sleeves gathered at the cuff." },
      { id: "puff", label: "泡泡袖", promptHint: "Modify ONLY the sleeves. Change them to short puff sleeves." },
      { id: "dolman", label: "蝙蝠袖", promptHint: "Modify ONLY the sleeves. Change them to dolman sleeves." },
      { id: "kimono", label: "和服袖", promptHint: "Modify ONLY the sleeves. Change them to kimono sleeves." },
    ],
  },
  {
    id: "length",
    label: "衣长",
    options: [
      { id: "cropped", label: "短款", promptHint: "Modify ONLY the garment length. Shorten it to a cropped length." },
      { id: "regular", label: "常规", promptHint: "Modify ONLY the garment length. Keep a regular length." },
      { id: "longline", label: "长款", promptHint: "Modify ONLY the garment length. Extend it to a longline length." },
      { id: "tunic", label: "长袍", promptHint: "Modify ONLY the garment length. Extend it to a tunic length." },
    ],
  },
  {
    id: "hem",
    label: "下摆",
    options: [
      { id: "straight", label: "平摆", promptHint: "Modify ONLY the hem. Change it to a straight hem." },
      { id: "round", label: "圆摆", promptHint: "Modify ONLY the hem. Change it to a curved shirt-tail hem." },
      { id: "high-low", label: "前短后长", promptHint: "Modify ONLY the hem. Change it to a high-low hem." },
      { id: "slit", label: "开叉", promptHint: "Modify ONLY the hem. Add side slits." },
      { id: "drawstring", label: "抽绳", promptHint: "Modify ONLY the hem. Add an adjustable drawstring hem." },
      { id: "asymmetric", label: "不对称", promptHint: "Modify ONLY the hem. Change it to an asymmetric uneven hem." },
    ],
  },
  {
    id: "detail",
    label: "设计细节",
    options: [
      { id: "ruffle", label: "荷叶边", promptHint: "Keep the original design. Add delicate ruffle trims." },
      { id: "frill", label: "木耳边", promptHint: "Keep the original design. Add soft lettuce-edge frills." },
      { id: "pin-tuck", label: "细褶", promptHint: "Keep the original design. Add fine pintuck detailing." },
      { id: "gather", label: "抽褶", promptHint: "Keep the original design. Add soft gathered detailing." },
      { id: "smock", label: "司马克", promptHint: "Keep the original design. Add smocking details for texture." },
      { id: "patch-pocket", label: "贴袋", promptHint: "Keep the original design. Add functional patch pockets." },
      { id: "flap-pocket", label: "翻盖口袋", promptHint: "Keep the original design. Add flap pockets." },
      { id: "zipper", label: "金属拉链", promptHint: "Keep the original design. Add an exposed metal zipper." },
      { id: "button-placket", label: "门襟", promptHint: "Keep the original design. Add a front button placket." },
      { id: "contrast-stitch", label: "撞色明线", promptHint: "Keep the original design. Add contrast topstitching for a sporty feel." },
      { id: "belt", label: "腰带", promptHint: "Keep the original design. Add a matching waist belt." },
    ],
  },
  {
    id: "fabric",
    label: "面料材质",
    options: [
      { id: "cotton", label: "纯棉", promptHint: "Change ONLY the fabric to premium cotton jersey." },
      { id: "linen", label: "亚麻", promptHint: "Change ONLY the fabric to washed linen." },
      { id: "silk", label: "真丝", promptHint: "Change ONLY the fabric to luxurious silk with natural sheen." },
      { id: "jersey", label: "针织", promptHint: "Change ONLY the fabric to soft knit jersey." },
      { id: "denim", label: "牛仔", promptHint: "Change ONLY the fabric to lightweight denim." },
      { id: "twill", label: "斜纹", promptHint: "Change ONLY the fabric to cotton twill." },
      { id: "corduroy", label: "灯芯绒", promptHint: "Change ONLY the fabric to fine wale corduroy." },
      { id: "wool", label: "羊毛", promptHint: "Change ONLY the fabric to soft wool blend." },
      { id: "suede", label: "麂皮", promptHint: "Change ONLY the fabric to soft faux suede." },
    ],
  },
  {
    id: "pattern",
    label: "图案",
    options: [
      { id: "solid", label: "纯色", promptHint: "Change ONLY the pattern to a solid clean look, no print." },
      { id: "stripe", label: "条纹", promptHint: "Change ONLY the pattern to classic vertical stripes." },
      { id: "floral", label: "碎花", promptHint: "Change ONLY the pattern to a delicate floral print." },
      { id: "plaid", label: "格纹", promptHint: "Change ONLY the pattern to a classic plaid check." },
      { id: "color-block", label: "拼色", promptHint: "Change ONLY the pattern to bold color-blocking panels." },
      { id: "camo", label: "迷彩", promptHint: "Change ONLY the pattern to a subtle camouflage print." },
    ],
  },

  // ── 上衣专属 ──
  {
    id: "neckline",
    label: "领型",
    categories: ["top", "dress", "outerwear"],
    options: [
      { id: "crew", label: "圆领", promptHint: "Modify ONLY the neckline. Change it to a classic crew neck." },
      { id: "vneck", label: "V领", promptHint: "Modify ONLY the neckline. Change it to a V-neck." },
      { id: "boat", label: "船领", promptHint: "Modify ONLY the neckline. Change it to a wide boat neckline." },
      { id: "square", label: "方领", promptHint: "Modify ONLY the neckline. Change it to a square neckline." },
      { id: "henley", label: "亨利领", promptHint: "Modify ONLY the neckline. Change it to a henley neckline with a short button placket." },
      { id: "polo", label: "POLO领", promptHint: "Modify ONLY the neckline. Change it to a polo collar." },
      { id: "shirt-collar", label: "衬衫领", promptHint: "Modify ONLY the neckline. Change it to a classic shirt collar." },
      { id: "peter-pan", label: "娃娃领", promptHint: "Modify ONLY the neckline. Change it to a rounded Peter Pan collar." },
      { id: "stand", label: "立领", promptHint: "Modify ONLY the neckline. Change it to a stand collar." },
      { id: "mock", label: "半高领", promptHint: "Modify ONLY the neckline. Change it to a mock neck." },
      { id: "turtleneck", label: "高领", promptHint: "Modify ONLY the neckline. Change it to a full turtleneck." },
      { id: "off-shoulder", label: "一字肩", promptHint: "Modify ONLY the neckline. Change it to an off-shoulder neckline exposing the shoulders." },
    ],
  },
  {
    id: "shoulder",
    label: "肩型",
    categories: ["top", "dress", "outerwear"],
    options: [
      { id: "regular", label: "正肩", promptHint: "Modify ONLY the shoulder construction. Change it to a regular set shoulder." },
      { id: "drop", label: "落肩", promptHint: "Modify ONLY the shoulder construction. Change it to drop shoulders." },
      { id: "raglan", label: "插肩", promptHint: "Modify ONLY the shoulder construction. Change it to raglan sleeves." },
      { id: "extended", label: "宽肩", promptHint: "Modify ONLY the shoulder construction. Extend the shoulder width." },
      { id: "padded", label: "垫肩", promptHint: "Modify ONLY the shoulder construction. Add subtle padded shoulders for structure." },
    ],
  },
  {
    id: "closure",
    label: "闭合方式",
    categories: ["top", "dress", "outerwear"],
    options: [
      { id: "pullover", label: "套头", promptHint: "Modify ONLY the closure. Change it to a pullover style with no opening." },
      { id: "button-front", label: "前开扣", promptHint: "Modify ONLY the closure. Add a full front button placket." },
      { id: "zip-front", label: "前拉链", promptHint: "Modify ONLY the closure. Add a front zipper closure." },
      { id: "open-cardigan", label: "开衫", promptHint: "Modify ONLY the closure. Change it to an open front cardigan with no closure." },
      { id: "tie-waist", label: "系带", promptHint: "Modify ONLY the closure. Add a tie waist closure." },
    ],
  },

  // ── 下装专属 ──
  {
    id: "waistline",
    label: "腰型",
    categories: ["bottom", "skirt"],
    options: [
      { id: "high", label: "高腰", promptHint: "Modify ONLY the waistline. Raise it to a high-waisted cut above the natural waist." },
      { id: "mid", label: "中腰", promptHint: "Modify ONLY the waistline. Keep it at the natural mid waist." },
      { id: "low", label: "低腰", promptHint: "Modify ONLY the waistline. Lower it to sit on the hips." },
      { id: "elastic", label: "松紧腰", promptHint: "Modify ONLY the waistline. Add a comfortable elastic waistband." },
      { id: "paperbag", label: "抽绳纸袋腰", promptHint: "Modify ONLY the waistline. Add a gathered paperbag waist with tie." },
    ],
  },
  {
    id: "leg",
    label: "裤腿版型",
    categories: ["bottom"],
    options: [
      { id: "straight", label: "直筒", promptHint: "Modify ONLY the leg shape. Change it to a straight leg cut." },
      { id: "skinny", label: "紧身", promptHint: "Modify ONLY the leg shape. Change it to a skinny fitted leg." },
      { id: "wide", label: "阔腿", promptHint: "Modify ONLY the leg shape. Change it to a wide leg silhouette." },
      { id: "bootcut", label: "喇叭裤", promptHint: "Modify ONLY the leg shape. Create a bootcut that flares below the knee." },
      { id: "cargo", label: "工装裤", promptHint: "Modify ONLY the leg shape. Change it to relaxed cargo pants." },
      { id: "culottes", label: "阔短裤", promptHint: "Modify ONLY the leg shape. Make them wide-leg culotte length." },
    ],
  },

  // ── 裙装专属 ──
  {
    id: "skirt-length",
    label: "裙长",
    categories: ["skirt", "dress"],
    options: [
      { id: "mini", label: "超短裙", promptHint: "Modify ONLY the skirt length. Shorten it to a mini length." },
      { id: "above-knee", label: "膝上", promptHint: "Modify ONLY the skirt length. End it above the knee." },
      { id: "knee", label: "及膝", promptHint: "Modify ONLY the skirt length. Keep it at knee length." },
      { id: "midi", label: "中长裙", promptHint: "Modify ONLY the skirt length. Make it midi length, below the knee." },
      { id: "maxi", label: "及踝长裙", promptHint: "Modify ONLY the skirt length. Extend it to a floor-grazing maxi." },
    ],
  },
  {
    id: "skirt-shape",
    label: "裙型",
    categories: ["skirt", "dress"],
    options: [
      { id: "a-line", label: "A字裙", promptHint: "Modify ONLY the skirt shape. Create a classic A-line skirt from waist to hem." },
      { id: "pencil", label: "铅笔裙", promptHint: "Modify ONLY the skirt shape. Create a slim pencil skirt shape." },
      { id: "circle", label: "大摆裙", promptHint: "Modify ONLY the skirt shape. Make a full circle skirt with lots of volume." },
      { id: "pleated", label: "百褶裙", promptHint: "Modify ONLY the skirt shape. Add structured pleats throughout the skirt." },
      { id: "wrap", label: "裹身裙", promptHint: "Modify ONLY the skirt shape. Create a wrap-style skirt with diagonal overlap." },
    ],
  },

  // ── 外套专属 ──
  {
    id: "collar-type",
    label: "领型(外套)",
    categories: ["outerwear"],
    options: [
      { id: "notched-lapel", label: "平驳领", promptHint: "Modify ONLY the collar. Change it to a classic notched lapel." },
      { id: "peak-lapel", label: "戗驳领", promptHint: "Modify ONLY the collar. Change it to a sharp peaked lapel." },
      { id: "shawl", label: "青果领", promptHint: "Modify ONLY the collar. Change it to a smooth shawl collar." },
      { id: "hood", label: "连帽", promptHint: "Modify ONLY the collar. Replace collar with an attached hood." },
      { id: "mandarin", label: "立领(中山)", promptHint: "Modify ONLY the collar. Add a short mandarin collar." },
    ],
  },
  {
    id: "outerwear-length",
    label: "衣长(外套)",
    categories: ["outerwear"],
    options: [
      { id: "cropped", label: "短外套", promptHint: "Modify ONLY the garment length. Shorten it to a cropped jacket length." },
      { id: "hip", label: "常规及臀", promptHint: "Modify ONLY the garment length. Hip length, covering the hip." },
      { id: "mid-thigh", label: "中长款", promptHint: "Modify ONLY the garment length. Extend to mid-thigh length." },
      { id: "knee-length", label: "及膝长款", promptHint: "Modify ONLY the garment length. Extend it to knee-length coat." },
    ],
  },
];

/** 通用轴被品类专属轴覆盖的映射:通用 axisId → {品类 → 覆盖它的专属 axisId} */
const UNIVERSAL_AXIS_COVERED_BY: Record<string, Record<string, string>> = {
  length: { skirt: "skirt-length", dress: "skirt-length", outerwear: "outerwear-length" },
  hem: { skirt: "skirt-shape", dress: "skirt-shape" },
};

type StyleRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string }
  | { kind: "library-style"; id: string; styleId: string; name: string; url: string };
type FabricRow =
  | { kind: "upload"; id: string; file: File; preview: string; name: string }
  | { kind: "library-fabric"; id: string; matId: string; colorIdx: number; name: string; url: string; hex?: string }
  | { kind: "text"; id: string; description: string }
  | null;

type MutationKey = string; // `${axisId}::${optionId}`

interface Props {
  knowledge?: KnowledgeDeps;
  brandLoading?: boolean;
  knowledgeLoading?: boolean;
}

function mutKey(axisId: string, optionId: string): MutationKey {
  return `${axisId}::${optionId}`;
}

export default function StyleMutatePage({ knowledge, brandLoading, knowledgeLoading }: Props) {
  const { teamId, navigateTab } = useCurrentTeam();
  const { user } = useAuth();
  const store = useDesignStore();

  const [mother, setMother] = useState<StyleRow | null>(null);
  const [fabric, setFabric] = useState<FabricRow>(null);
  const [fabricTextInput, setFabricTextInput] = useState("");
  const [selected, setSelected] = useState<Set<MutationKey>>(new Set());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picker, setPicker] = useState<null | "style" | "fabric">(null);

  const [category, setCategory] = useState<GarmentCategoryId | "">("");
  const [batch, setBatch] = useState<StyleMutateBatch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 用户自定义裂变项(自由输入),不入库,仅本次提交用 */
  const [customMutations, setCustomMutations] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  /** 前端移除的结果格(轮询不会重新加回) */
  const [removedMis, setRemovedMis] = useState<Set<number>>(() => new Set());
  /** 裂变方式:batch=批量(每项一张,多选≤8) / merge=合并(所有维度合并一张,每轴单选) */
  const [mutateMode, setMutateMode] = useState<"batch" | "merge">("batch");

  const styleRef = useRef<HTMLInputElement>(null);
  const fabricRef = useRef<HTMLInputElement>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  // ── 生图自动重试 ──
  // ── 新手引导 ──
  const tour = useStyleMutateTour({
    setName,
    setDescription,
    setCategory,
    setMother,
    setSelected,
    setCustomMutations,
    setBatch,
  });

  const { resetRetries, tryAutoRetry } = useImageRetry({
    maxRetries: 1,
    getKey: (it) => it.mi,
    retryFn: (item, isAutoRetry) => retryCell(item.mi, isAutoRetry),
    onFailed: (item, error) => {
      // 两次都失败 → 错误局部化到对应图片下方,不显示在左侧全局
      setBatch((b) => {
        if (!b) return b;
        return {
          ...b,
          items: b.items.map((it) =>
            it.mi === item.mi ? { ...it, status: "error", error: error || "生成失败,请重试" } : it,
          ),
        };
      });
    },
  });

  // 当前品类下可用的裂变轴:专属轴按品类匹配 + 通用轴在无专属替代时展示
  const visibleAxes = MUTATION_AXES.filter((axis) => {
    if (axis.categories && axis.categories.length > 0) {
      return category && axis.categories.includes(category);
    }
    // 通用轴:选中的品类有专属替代轴时隐藏(如裙装时隐藏通用「衣长」,因已有「裙长」)
    const covered = UNIVERSAL_AXIS_COVERED_BY[axis.id];
    if (category && covered && covered[category]) return false;
    return true;
  });

  const selectedMutations = [
    // 标准轴勾选(被品类专属轴覆盖的通用轴 + 锁定面料后的面料材质轴 → 剔除)
    ...MUTATION_AXES.flatMap((axis) => {
      // 通用轴被当前品类的专属轴覆盖 → 剔除(避免与「裙长」等专属轴语义重复)
      const covered = UNIVERSAL_AXIS_COVERED_BY[axis.id];
      if (category && !axis.categories?.length && covered?.[category]) return [];
      // 已锁定面料时,剔除「面料材质」轴的所有勾选(避免与锁定面料 prompt 矛盾)
      if (axis.id === "fabric" && fabric != null) return [];
      return axis.options
        .filter((o) => selected.has(mutKey(axis.id, o.id)))
        .map((o) => ({
          axisId: axis.id,
          optionId: o.id,
          label: `${axis.label}·${o.label}`,
          promptHint: o.promptHint,
        }));
    }),
    // 自定义裂变项(无 axisId/optionId,前端拼接 promptHint)
    ...customMutations.map((text) => ({
      axisId: "custom",
      optionId: `custom_${text}`,
      label: `自定义·${text}`,
      promptHint: `Modify the garment to incorporate: ${text}. Keep the overall DNA and other design elements of the original mother style.`,
    })),
  ];

  const batchRunning = !!batch && batch.status === "running";
  const visibleItems = batch ? batch.items.filter((it) => !removedMis.has(it.mi)) : [];
  const visibleCompleted = visibleItems.filter((it) => it.status === "done" && it.url).length;
  const canSubmit =
    !!name.trim() &&
    !!mother &&
    selectedMutations.length > 0 &&
    (mutateMode === "merge" || selectedMutations.length <= MAX_MUTATIONS) &&
    !batchRunning &&
    !submitting &&
    !brandLoading &&
    !knowledgeLoading;

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (batchId: string) => {
      stopPolling();
      pollAttempts.current = 0;
      resetRetries();
      pollTimer.current = setInterval(async () => {
        pollAttempts.current += 1;
        if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
          // 超时:标记尚未完成的格子为失败(可手动重试)
          setBatch((b) => {
            if (!b) return b;
            return {
              ...b,
              status: "done",
              items: b.items.map((it) => it.status === "pending" ? { ...it, status: "error", error: "生成超时,可重试" } : it),
            };
          });
          stopPolling();
          return;
        }
        try {
          const url = teamApi(teamId!).styleMutateBatchUrl(batchId);
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: StyleMutateBatch = await res.json();
          setBatch(data);
          // 轮询发现失败的格子 → 通过共享 hook 自动重试
          if (data.items) {
            for (const it of data.items) {
              if (it.status === "error" && !removedMis.has(it.mi)) {
                tryAutoRetry(it, it.error || "生成失败");
              }
            }
          }
          if (data.status === "done" || data.status === "error") stopPolling();
        } catch {
          /* 轮询偶发失败忽略 */
        }
      }, POLL_MS);
    },
    [stopPolling, teamId, removedMis, resetRetries, tryAutoRetry],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  // 新用户自动触发引导(延迟一帧入场,让页面先渲染)
  useEffect(() => {
    if (tour.shouldRegister && !tour.tourActive) {
      const t = setTimeout(() => tour.startTour(), 300);
      return () => clearTimeout(t);
    }
  }, [tour.shouldRegister, tour.tourActive]);

  // 输入变化(母款/面料/品类/勾选/自定义)→ 清空旧批次,让底部按钮回到「生成」
  useEffect(() => {
    setBatch(null);
    stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mother, fabric, selectedMutations.length, category, customMutations.length]);

  // 添加自定义裂变项(回车 / 逗号触发)
  function addCustomMutation(text: string) {
    const t = text.trim();
    if (!t) return;
    if (mutateMode === "merge") {
      // 合并模式:自定义款式仅 1 个
      if (customMutations.length >= 1) {
        setError("合并模式下自定义款式最多 1 个");
        return;
      }
    } else if (selectedMutations.length + customMutations.length >= MAX_MUTATIONS) {
      setError(`最多勾选 ${MAX_MUTATIONS} 个裂变项`);
      return;
    }
    if (customMutations.includes(t)) return;
    setCustomMutations((prev) => [...prev, t]);
    setCustomInput("");
    setError(null);
  }
  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustomMutation(customInput);
    } else if (e.key === "Backspace" && !customInput && customMutations.length) {
      setCustomMutations((prev) => prev.slice(0, -1));
    }
  }

  /** 切换裂变方式:清空已选与批次,避免模式间残留(批量多选 vs 合并单选语义不同) */
  function switchMutateMode(next: "batch" | "merge") {
    if (next === mutateMode || batchRunning) return;
    setMutateMode(next);
    setSelected(new Set());
    setCustomMutations([]);
    setBatch(null);
    setError(null);
    stopPolling();
  }

  function toggleOption(axisId: string, optionId: string) {
    if (batchRunning) return;
    const key = mutKey(axisId, optionId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (mutateMode === "merge") {
          // 合并模式:每轴单选,先清除同轴已选
          for (const k of [...next]) {
            if (k.startsWith(`${axisId}::`)) next.delete(k);
          }
        } else if (next.size >= MAX_MUTATIONS) {
          setError(`最多勾选 ${MAX_MUTATIONS} 个裂变项`);
          return prev;
        }
        next.add(key);
        setError(null);
      }
      return next;
    });
  }

  async function addMotherUpload(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    const compressed = await compressForUpload(raw);
    setMother({
      kind: "upload",
      id: crypto.randomUUID(),
      file: compressed,
      preview: URL.createObjectURL(compressed),
      name: raw.name || "母款",
    });
    if (styleRef.current) styleRef.current.value = "";
  }

  async function addFabricUpload(list: FileList | null) {
    if (!list?.length) return;
    const raw = list[0];
    const compressed = await compressForUpload(raw);
    setFabric({
      kind: "upload",
      id: crypto.randomUUID(),
      file: compressed,
      preview: URL.createObjectURL(compressed),
      name: raw.name || "面料",
    });
    setFabricTextInput("");
    if (fabricRef.current) fabricRef.current.value = "";
  }

  async function submit() {
    if (!teamId || !canSubmit || !mother) return;
    setSubmitting(true);
    setError(null);
    setBatch(null);
    setRemovedMis(new Set());
    stopPolling();
    try {
      const styleMeta =
        mother.kind === "upload"
          ? { kind: "upload", name: mother.name }
          : { kind: "library-style", styleId: mother.styleId };
      const fabricMeta = !fabric
        ? null
        : fabric.kind === "upload"
          ? { kind: "upload", name: fabric.name }
          : fabric.kind === "text"
            ? { kind: "text", description: fabric.description, name: fabric.description }
            : { kind: "library-fabric", matId: fabric.matId, colorIdx: fabric.colorIdx, hex: fabric.hex };

      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("description", description.trim());
      fd.append("styleMeta", JSON.stringify(styleMeta));
      // 合并模式:把所有选中项的 promptHint 合并成单个 mutation → 后端生成 1 张
      const submitMutations = mutateMode === "merge" && selectedMutations.length > 0
        ? [{
          axisId: "merge",
          optionId: "merge",
          label: selectedMutations.map((m) => m.label).join(" + "),
          promptHint: `Apply all of the following modifications to the mother style, keeping the overall design DNA and all other design elements unchanged:\n${selectedMutations.map((m, i) => `${i + 1}. ${m.promptHint}`).join("\n")}`,
        }]
        : selectedMutations;
      fd.append("mutations", JSON.stringify(submitMutations));
      if (fabricMeta) fd.append("fabricMeta", JSON.stringify(fabricMeta));
      if (mother.kind === "upload") fd.append("style", mother.file);
      if (fabric?.kind === "upload") fd.append("fabric", fabric.file);

      const url = teamApi(teamId).styleMutateUrl;
      const res = await fetch(url, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`请求失败 (HTTP ${res.status})${t ? `: ${t.slice(0, 120)}` : ""}`);
      }
      const data: StyleMutateBatch = await res.json();
      setBatch(data);
      if (data.status === "running" && data.batchId) startPolling(data.batchId);
    } catch (e: any) {
      setError(e?.message || "提交失败,请重试");
    } finally {
      setSubmitting(false);
    }
  }

  /** 重试失败的格子(手动/自动共用) */
  async function retryCell(mi: number, isAutoRetry = false) {
    if (!batch || !teamId) return;
    if (!isAutoRetry) {
      setRemovedMis((prev) => {
        if (!prev.has(mi)) return prev;
        const next = new Set(prev);
        next.delete(mi);
        return next;
      });
    }
    // 重置为 pending(隐藏之前的错误)
    setBatch((b) => {
      if (!b) return b;
      return {
        ...b,
        status: "running",
        items: b.items.map((it) =>
          it.mi === mi ? { ...it, status: "pending", error: undefined, url: undefined } : it,
        ),
      };
    });
    try {
      const url = teamApi(teamId).styleMutateRegenerateUrl(batch.batchId);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mi }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startPolling(batch.batchId);
    } catch (e: any) {
      // 使用共享 hook 决定是否自动重试
      const item = batch.items.find((it) => it.mi === mi);
      if (item && !isAutoRetry) {
        tryAutoRetry(item, e?.message || "重试失败");
      } else if (isAutoRetry) {
        // 已重试过一次,仍失败 → 显示错误到图片下方
        setBatch((b) => {
          if (!b) return b;
          return {
            ...b,
            items: b.items.map((it) =>
              it.mi === mi ? { ...it, status: "error", error: e?.message || "生成失败,请重试" } : it,
            ),
          };
        });
      }
    }
  }

  function removeResult(mi: number) {
    setRemovedMis((prev) => {
      const next = new Set(prev);
      next.add(mi);
      return next;
    });
  }

  async function saveToLookbook() {
    if (!batch) return;
    const doneItems = visibleItems.filter((it) => it.status === "done" && it.url);
    if (!doneItems.length) {
      setError("暂无成功生成的图片");
      return;
    }
    const now = new Date().toISOString();
    const brandColors = (knowledge?.brand?.colors || []).map((c: any) => c?.bg || c).filter(Boolean);
    const sourceImages = doneItems.map(() => {
      const src: { style?: { url: string; name: string }; fabric?: { url: string; name: string } } = {};
      if (mother?.kind === "library-style") src.style = { url: mother.url, name: mother.name };
      if (fabric?.kind === "library-fabric") src.fabric = { url: fabric.url, name: fabric.name };
      return Object.keys(src).length ? src : undefined;
    });
    const product: any = {
      mode: "style-mutate",
      title: name || "未命名款式裂变",
      description: description.trim() || "",
      colors: brandColors,
      images: doneItems.map((it) => ({
        slot: "style-mutate",
        label: it.label,
        url: it.url!,
      })),
      sourceImages,
      aiDraftRaw: JSON.stringify({
        batchId: batch.batchId,
        name,
        description,
        mother: batch.mother,
        fabric: batch.fabric,
        mutations: batch.mutations,
        items: batch.items,
      }),
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

  const inputCls =
    "w-full text-[12px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-primary-500 bg-white";
  const labelCls = "text-[10px] uppercase tracking-wider text-gray-500 mb-1 block";
  const hasSuccess = visibleCompleted > 0;
  const motherPreview =
    mother?.kind === "upload" ? mother.preview : mother?.kind === "library-style" ? mother.url : "";
  const fabricPreview =
    fabric?.kind === "upload"
      ? fabric.preview
      : fabric?.kind === "library-fabric"
        ? fabric.url
        : "";

  // 引导步骤定义
  const tourSteps: TourStep[] = [
    { target: 'tour-name', title: '① 输入作品名称', description: '给你的款式裂变作品取个名字,比如「春日雏菊连衣裙·裂变」。' },
    { target: 'tour-category', title: '② 选择服装品类', description: '选择品类后系统展示对应的裂变维度选项(如袖型/领型仅上衣显示)。' },
    { target: 'tour-mother', title: '③ 添加母款', description: '上传母款图或从款式库选择,系统将基于母款裂变出多张子款。' },
    { target: 'tour-mutations', title: '④ 勾选裂变轴', description: '勾选要裂变的维度(袖型/衣长/下摆等),每个选项生成一张子款。' },
    { target: 'tour-generate', title: '⑤ 点击生成', description: '点击底部按钮生成裂变子款白底图。', actionLabel: '立即生成' },
    { target: 'tour-result', title: '⑥ 查看结果', description: '生成的子款图,可点击失败图重试,满意后保存到 Lookbook。' },
  ];

  return (
    <>
      {/* 新手引导浮层 */}
      {tour.tourActive && (
        <TourOverlay
          steps={tourSteps}
          stepIdx={tour.tourStep}
          onAdvance={tour.next}
          onPrev={tour.prev}
          onSkip={tour.skip}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] h-[calc(100vh-64px)] min-h-0">
        {/* 左:表单(上中下布局) */}
        <div className="flex flex-col bg-white min-h-0">
          {/* 顶部:固定 header */}
          <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 px-5 py-3 shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="text-[15px] font-medium text-gray-800 min-h-7 flex items-center gap-2">款式裂变
                {tour.shouldRegister && !tour.tourActive && (
                  <button
                    type="button"
                    onClick={tour.startTour}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors font-normal"
                  >
                    ? 新手引导
                  </button>
                )}
              </h1>
            </div>
            <span className="text-[10px] text-gray-500">
              1 母款 × 裂变轴选项 → N 张子款白底图(≤{MAX_MUTATIONS})
            </span>
          </header>

          {/* 中间:可滚动内容 */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-5 space-y-5 max-w-2xl">
              {/* 名称 */}
              <div data-tour="tour-name">
                <label className={labelCls}>
                  名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如:春日雏菊连衣裙·裂变"
                  className={inputCls}
                  disabled={batchRunning}
                />
              </div>

              {/* 母款 */}
              <div data-tour="tour-mother">
                <label className={labelCls}>
                  母款 <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {mother && (
                    <div className="w-28 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                      {motherPreview ? (
                        <img src={motherPreview} alt={mother.name} className="w-28 h-24 object-cover" />
                      ) : (
                        <div className="w-28 h-24 flex items-center justify-center text-[10px] text-gray-300">无图</div>
                      )}
                      {mother.kind === "library-style" && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                      )}
                      {!batchRunning && (
                        <button
                          onClick={() => setMother(null)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                      <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={mother.name}>
                        {mother.name}
                      </div>
                    </div>
                  )}
                  {!mother && !batchRunning && (
                    <>
                      <button
                        onClick={() => styleRef.current?.click()}
                        className="w-28 h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-lg text-gray-400">+</span>
                        <span className="text-[10px] text-gray-400">上传母款</span>
                      </button>
                      <button
                        onClick={() => setPicker("style")}
                        className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-base text-primary-500">▦</span>
                        <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                      </button>
                    </>
                  )}
                </div>
                <input
                  ref={styleRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => addMotherUpload(e.target.files)}
                />
              </div>

              {/* 服装品类筛选 */}
              <div data-tour="tour-category">
                <label className={labelCls}>服装品类</label>
                <div className="flex flex-wrap gap-1.5">
                  {GARMENT_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={batchRunning}
                      onClick={() => {
                        if (category === c.id) return;
                        // 切换品类:清理会被新品类专属轴覆盖的通用轴勾选(如上衣→半身裙时,清除通用「衣长」勾选)
                        setSelected((prev) => {
                          const next = new Set(prev);
                          for (const [universalId, coverMap] of Object.entries(UNIVERSAL_AXIS_COVERED_BY)) {
                            if (coverMap[c.id]) {
                              const axis = MUTATION_AXES.find((a) => a.id === universalId);
                              axis?.options.forEach((o) => next.delete(mutKey(universalId, o.id)));
                            }
                          }
                          return next;
                        });
                        setCategory(c.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors ${category === c.id
                        ? "bg-primary-50 border-primary-400 text-primary-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                        } disabled:opacity-50`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 裂变方式 + 裂变轴(手风琴:逐轴折叠,降低平铺认知负荷) */}
              <div data-tour="tour-mutations">
                {/* 裂变方式切换 */}
                <div className="mb-2">
                  <div className="inline-flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => switchMutateMode("batch")}
                      disabled={batchRunning}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${mutateMode === "batch" ? "bg-white text-primary-600 shadow-sm font-medium" : "text-gray-500 hover:text-gray-700"} disabled:opacity-50`}
                    >
                      批量生成
                      <span className="relative group flex items-center">
                        <span className="w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[10px] flex items-center justify-center cursor-help">?</span>
                        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-20 w-56 rounded-lg bg-gray-800 text-white text-[10.5px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                          每个选项生成一张子款白底图(可多选,最多 8 张)
                          <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMutateMode("merge")}
                      disabled={batchRunning}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${mutateMode === "merge" ? "bg-white text-primary-600 shadow-sm font-medium" : "text-gray-500 hover:text-gray-700"} disabled:opacity-50`}
                    >
                      合并生成
                      <span className="relative group flex items-center">
                        <span className="w-3.5 h-3.5 rounded-full bg-gray-300 text-white text-[10px] flex items-center justify-center cursor-help">?</span>
                        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-20 w-56 rounded-lg bg-gray-800 text-white text-[10.5px] leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                          所选维度合并生成一张子款图(每个维度单选)
                          <span className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
                        </span>
                      </span>
                    </button>
                  </div>
                </div>

                <label className={labelCls}>
                  裂变轴{" "}
                  <span className="text-gray-400 normal-case tracking-normal">
                    (已选 {selectedMutations.length}{mutateMode === "batch" ? `/${MAX_MUTATIONS}` : ""})
                    {category && <span className="ml-1 text-primary-500">· {GARMENT_CATEGORIES.find((c) => c.id === category)?.label}</span>}
                  </span>
                </label>
                {!category && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-[12px] text-gray-400 mb-3">
                    请先选择服装品类,系统将展示对应的裂变维度选项
                  </div>
                )}
                {category && visibleAxes.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 text-[12px] text-gray-400 mb-3">
                    该品类暂无预置裂变轴,请使用下方自定义款式输入
                  </div>
                )}

                {/* 裂变轴:每轴一行,标签横向铺开,溢出滚动 */}
                {category && (
                  <div className="space-y-2">
                    {visibleAxes.map((axis) => {
                      const disabledByFabric = axis.id === "fabric" && fabric != null;
                      return (
                        <div
                          key={axis.id}
                          className={`flex items-center gap-1 ${disabledByFabric ? "opacity-40 pointer-events-none" : ""}`}
                        >
                          {/* 左:轴标题 */}
                          <span className="shrink-0 text-[11px] font-medium text-gray-700 w-14 text-right">{axis.label}</span>
                          {/* 中:分割线(占满剩余空间) */}
                          <div className="flex-1 mx-1.5 border-t border-dashed border-gray-200" />
                          {/* 右:选项横向滚动 */}
                          <div className="shrink-0 overflow-x-auto max-w-[75%] scrollbar-none">
                            <div className="flex gap-1.5 w-max">
                              {axis.options.map((opt) => {
                                const key = mutKey(axis.id, opt.id);
                                const on = selected.has(key);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={batchRunning || disabledByFabric}
                                    onClick={() => toggleOption(axis.id, opt.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition-colors whitespace-nowrap ${on
                                      ? "bg-primary-500 text-white border-primary-500"
                                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                                      } disabled:opacity-50`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 自定义裂变款式(Tag Input) */}
              <div>
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 min-h-[32px] focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-100">
                  {customMutations.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-50 border border-primary-200 text-primary-700 text-[11px]"
                    >
                      {t}
                      {!batchRunning && (
                        <button
                          type="button"
                          onClick={() => setCustomMutations((prev) => prev.filter((x) => x !== t))}
                          className="text-primary-400 hover:text-red-500 leading-none"
                        >×</button>
                      )}
                    </span>
                  ))}
                  <input
                    value={customInput}
                    onChange={(e) => { setCustomInput(e.target.value); setError(null); }}
                    onKeyDown={handleCustomKeyDown}
                    onBlur={() => { if (customInput.trim()) addCustomMutation(customInput); }}
                    placeholder={customMutations.length ? "继续输入…" : "自定义款式，输入后回车添加，如: 不对称领口…"}
                    disabled={batchRunning}
                    className="flex-1 min-w-[100px] outline-none text-[12px] bg-transparent placeholder:text-gray-400 py-0.5"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">单次有效,不会保存到库。将作为额外裂变维度生成子款白底图。</p>
              </div>

              {/* 可选锁定面料 */}
              <div>
                <label className={labelCls}>
                  锁定面料 <span className="text-gray-400 normal-case tracking-normal">(可选)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {fabric && (
                    <div className="w-24 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden relative group">
                      {fabricPreview ? (
                        <img src={fabricPreview} alt={fabric.name} className="w-24 h-20 object-cover" />
                      ) : fabric.kind === "library-fabric" && fabric.hex ? (
                        <div className="w-24 h-20" style={{ backgroundColor: fabric.hex }} />
                      ) : (
                        <div className="w-24 h-20 bg-gray-200" />
                      )}
                      {fabric.kind === "library-fabric" && (
                        <span className="absolute top-0.5 left-0.5 text-[8px] bg-primary-500 text-white px-1 rounded">库</span>
                      )}
                      {!batchRunning && (
                        <button
                          onClick={() => setFabric(null)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      )}
                      <div className="px-1 py-0.5 text-[8px] text-gray-400 truncate" title={fabric.name}>
                        {fabric.name}
                      </div>
                    </div>
                  )}
                  {!fabric && !batchRunning && (
                    <>
                      <button
                        onClick={() => fabricRef.current?.click()}
                        className="w-28 h-28 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-lg text-gray-400">+</span>
                        <span className="text-[10px] text-gray-400">上传面料</span>
                      </button>
                      <button
                        onClick={() => setPicker("fabric")}
                        className="w-28 h-28 rounded-lg border border-dashed border-primary-200 bg-primary-50/40 flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 transition-colors shrink-0"
                      >
                        <span className="text-base text-primary-500">▦</span>
                        <span className="text-[10px] text-primary-600 mt-0.5">从库选择</span>
                      </button>
                    </>
                  )}
                  {/* 文本描述面料 */}
                  {fabric?.kind === "text" && !batchRunning && (
                    <div className="w-full rounded-lg border border-primary-200 bg-primary-50/30 p-2 flex items-start gap-2 mt-2">
                      <span className="text-primary-500 shrink-0 mt-0.5">✎</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-primary-700 truncate">{fabric.description}</div>
                      </div>
                      <button onClick={() => setFabric(null)} className="text-primary-400 hover:text-red-500 shrink-0" title="清除">×</button>
                    </div>
                  )}
                </div>
                <input
                  ref={fabricRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => addFabricUpload(e.target.files)}
                />
                {(!fabric || fabric.kind !== "text") && !batchRunning && (
                  <textarea
                    value={fabricTextInput}
                    onChange={(e) => setFabricTextInput(e.target.value)}
                    onBlur={() => { if (fabricTextInput.trim()) setFabric({ kind: "text", id: crypto.randomUUID(), description: fabricTextInput.trim() }); }}
                    placeholder="或描述面料文字,如:纯白色纯棉面料、真丝双绉、藏青色斜纹棉…"
                    rows={2}
                    className="w-full mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] placeholder:text-gray-400 focus:outline-none focus:border-primary-400 resize-none"
                  />
                )}
                <span className="text-[10px] text-gray-400">子款默认继承母款面料花色；锁定后面料保持不变,且「面料材质」裂变轴将禁用失效。支持上传 / 库选 / 文字描述三种方式。</span>
              </div>

              {/* 描述 */}
              <div>
                <label className={labelCls}>其他描述</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="补充希望保留的母款 DNA、禁忌改动等(可选)"
                  className={`${inputCls} resize-none`}
                  disabled={batchRunning}
                />
              </div>

              {selectedMutations.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                  {mutateMode === "merge" ? (
                    <>将生成 <span className="font-medium text-primary-600">1</span> 张合并裂变图(合并 {selectedMutations.length} 个维度)</>
                  ) : (
                    <>将生成{" "}
                      <span className="font-medium text-primary-600">{selectedMutations.length}</span>{" "}
                      张子款白底图
                      {selectedMutations.length > MAX_MUTATIONS && (
                        <span className="text-red-500 ml-2">超过上限 {MAX_MUTATIONS}</span>
                      )}</>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-600">
                  ⚠ {error}
                </div>
              )}
            </div>{/* 结束滚动区 */}
          </div>{/* 结束滚动容器 */}

          {/* 底部:固定行动按钮(按批次状态切换,与 Composer 规范一致) */}
          <div data-tour="tour-generate" className="shrink-0 border-t border-gray-200 bg-white px-5 pt-3 pb-4">
            {hasSuccess && !batchRunning && !submitting ? (
              <GenerateButton
                label={`保存到 Lookbook (${visibleCompleted}/${visibleItems.length})`}
                estimatedCoins={0}
                userCoins={user?.coins}
                onClick={saveToLookbook}
              />
            ) : (
              <GenerateButton
                label="立即生成"
                loading={submitting || batchRunning}
                disabled={!canSubmit}
                estimatedCoins={(mutateMode === "merge" ? 1 : selectedMutations.length) * AI_COST_PER_IMAGE}
                userCoins={user?.coins}
                onClick={submit}
              />
            )}
            {batchRunning && batch && (
              <div className="text-[11px] text-gray-500 mt-2 text-center">
                {batch.completed + batch.failed}/{batch.total}
                {batch.failed > 0 && (
                  <span className="text-amber-600 ml-1">({batch.failed} 张失败)</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右:结果网格 */}
        <aside data-tour="tour-result" className="border-l border-gray-200 bg-gray-50 overflow-y-auto min-h-0 p-5 space-y-5">
          {!batch && !submitting && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-6 py-12">
              选择母款并勾选裂变轴后<br />点击底部「立即生成」
            </div>
          )}

          {submitting && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                <span className="text-[12px] text-gray-500">正在上传并启动批次…</span>
              </div>
            </div>
          )}

          {batch && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">
                裂变结果 · {visibleItems.length} 张
                {hasSuccess && (
                  <span className="ml-2 text-gray-400 normal-case tracking-normal">({visibleCompleted}/{visibleItems.length} 成功)</span>
                )}
              </div>

              {/* 母款锚点 */}
              <div className="flex items-center gap-3 text-[11px] text-gray-600">
                <span className="text-gray-400 shrink-0">母款:</span>
                {batch.mother?.url ? (
                  <img
                    src={batch.mother.url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100" />
                )}
                <span className="truncate">{batch.mother?.name || "(无)"}</span>
              </div>

              {visibleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white text-center text-[12px] text-gray-400 px-8 py-10">
                  结果已清空，可重新勾选裂变轴生成
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {visibleItems.map((cell) => (
                    <div
                      key={`m-${cell.mi}`}
                      className="rounded-xl border border-gray-200 bg-white overflow-hidden relative group"
                    >
                      <button
                        type="button"
                        onClick={() => removeResult(cell.mi)}
                        aria-label={`删除 ${cell.label}`}
                        title="删除此结果"
                        className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-black/50 text-white text-[12px] leading-none flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/70"
                      >
                        ×
                      </button>
                      <div className="aspect-square relative bg-white">
                        {cell.status === "pending" && (
                          <div className="w-full h-full flex items-center justify-center flex-col gap-1">
                            <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                            <span className="text-[9px] text-gray-400">生成中…</span>
                          </div>
                        )}
                        {cell.status === "done" && (
                          <img src={cell.url} alt={cell.label} className="w-full h-full object-contain" />
                        )}
                        {cell.status === "error" && (
                          <div className="w-full h-full flex items-center justify-center flex-col gap-1 px-2 text-center">
                            <span className="text-[10px] text-red-500">{cell.error || "生成失败"}</span>
                            <button
                              onClick={() => retryCell(cell.mi)}
                              className="text-[10px] text-primary-600 underline hover:text-primary-700"
                            >
                              重试
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5 text-[10px] text-gray-600 border-t border-gray-100 truncate" title={cell.label}>
                        {cell.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {visibleItems.find((it) => it.prompt) && (
                <details className="text-[11px] text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700">查看生成 prompt</summary>
                  <pre className="mt-2 whitespace-pre-wrap leading-relaxed text-gray-600 max-h-60 overflow-y-auto rounded-lg bg-white border border-gray-200 p-3 font-mono text-[10px]">
                    {visibleItems
                      .filter((it) => it.prompt)
                      .slice(0, 2)
                      .map((it) => `# ${it.label}\n${it.prompt}`)
                      .join("\n\n")}
                  </pre>
                </details>
              )}
            </>
          )}
        </aside>

        <StyleLibraryPicker
          mode={picker}
          knowledge={knowledge}
          onClose={() => setPicker(null)}
          onStyle={(p) => {
            setMother({
              kind: "library-style",
              id: crypto.randomUUID(),
              styleId: p.styleId,
              name: p.name,
              url: p.url,
            });
            setPicker(null);
          }}
          onFabric={(p) => {
            setFabric({
              kind: "library-fabric",
              id: crypto.randomUUID(),
              matId: p.matId,
              colorIdx: p.colorIdx,
              name: p.name,
              url: p.url,
              hex: p.hex,
            });
            setPicker(null);
          }}
        />
      </div>
    </>
  );
}

// ─── 库选择弹窗(款式 / 面料) ─────────────────────────────────
function StyleLibraryPicker({
  mode,
  knowledge,
  onClose,
  onStyle,
  onFabric,
}: {
  mode: null | "style" | "fabric";
  knowledge?: KnowledgeDeps;
  onClose: () => void;
  onStyle: (p: { styleId: string; url: string; name: string }) => void;
  onFabric: (p: { matId: string; colorIdx: number; url: string; name: string; hex?: string }) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (mode) setQ("");
  }, [mode]);
  if (!mode) return null;

  const isFabric = mode === "fabric";
  const materials = (knowledge?.materials || []) as any[];
  const cards: {
    matId: string;
    matCategory: string;
    matName: string;
    colorIdx: number;
    url: string;
    hex?: string;
    colorName?: string;
    shared?: boolean;
  }[] = [];
  for (const m of materials) {
    if (!m) continue;
    const cis: any[] = Array.isArray(m.colorImages) ? m.colorImages : [];
    const matName = m.name || "未命名面料";
    const matCat = m.category || "";
    if (cis.length) {
      cis.forEach((c, i) => {
        if (!c) return;
        cards.push({
          matId: m.id,
          matCategory: matCat,
          matName,
          colorIdx: i,
          url: c.url || "",
          hex: c.hex,
          colorName: c.name || undefined,
          shared: !!m.shared,
        });
      });
    } else if (m.image) {
      cards.push({
        matId: m.id,
        matCategory: matCat,
        matName,
        colorIdx: -1,
        url: m.image || "",
        shared: !!m.shared,
      });
    }
  }
  const cardFilter = cards.filter((c) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [c.matName, c.matCategory, c.colorName || "", c.hex || ""].some((f) =>
      f.toLowerCase().includes(k),
    );
  });

  const styles = (knowledge?.styles || []) as any[];
  const styleFilter = styles.filter((s: any) => {
    if (!q.trim()) return true;
    const k = q.trim().toLowerCase();
    return [s?.name || "", s?.category || ""].some((f) => String(f).toLowerCase().includes(k));
  });

  return (
    <Modal open onClose={onClose} title={isFabric ? "选择面料色卡" : "选择母款"} maxWidth="max-w-5xl">
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isFabric ? "搜索面料名 / 颜色 / 品类..." : "搜索款式名 / 品类..."}
          className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-primary-500"
          autoFocus
        />
      </div>

      {isFabric ? (
        cardFilter.length === 0 ? (
          <div className="text-center text-[12px] text-gray-400 py-16">面料库暂无材料。</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {cardFilter.map((c) => {
              const fullName = c.colorName ? `${c.matName} · ${c.colorName}` : c.colorName || c.hex || c.matName;
              return (
                <button
                  key={`${c.matId}-${c.colorIdx}`}
                  onClick={() =>
                    onFabric({
                      matId: c.matId,
                      colorIdx: c.colorIdx,
                      url: c.url,
                      name: fullName,
                      hex: c.hex,
                    })
                  }
                  className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
                >
                  <div className="aspect-square w-full relative">
                    {c.shared && (
                      <span className="absolute top-2 left-2 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">系统</span>
                    )}
                    {c.url ? (
                      <img src={c.url} alt={fullName} className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-[10px] text-gray-400"
                        style={{ backgroundColor: c.hex && /^#/.test(c.hex) ? c.hex : "#f3f4f6" }}
                      >
                        {c.hex || "无图"}
                      </div>
                    )}
                  </div>
                  <div className="px-1.5 py-1 text-[9px] text-gray-700 truncate" title={fullName}>
                    {fullName}
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : styleFilter.length === 0 ? (
        <div className="text-center text-[12px] text-gray-400 py-16">款式库暂无款式。</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {styleFilter.map((s: any) => (
            <button
              key={s.id}
              onClick={() => onStyle({ styleId: s.id, url: s.image || "", name: s.name || "未命名款式" })}
              className="text-left rounded-xl border border-gray-200 bg-white hover:border-primary-400 hover:shadow-sm transition-all overflow-hidden"
            >
              <div className="aspect-square w-full relative">
                {s.shared && (
                  <span className="absolute top-2 left-2 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">系统</span>
                )}
                {s.image ? (
                  <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-300">无图</div>
                )}
              </div>
              <div className="px-1.5 py-1 text-[9px] text-gray-700 truncate">{s.name}</div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="text-[12px] text-gray-500 hover:text-gray-700 px-3 py-1.5">
          取消
        </button>
      </div>
    </Modal>
  );
}
