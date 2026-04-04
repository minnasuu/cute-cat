import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Armchair,
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Bug,
  Cat,
  CheckCircle,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  FlaskConical,
  Footprints,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Key,
  Laptop,
  LayoutList,
  Layers,
  Lightbulb,
  Loader2,
  Mail,
  MessageCircle,
  MousePointer2,
  Network,
  Palette,
  PartyPopper,
  PenLine,
  Pencil,
  Pin,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Settings,
  Shield,
  Shuffle,
  Smile,
  Sparkles,
  Square,
  SunMedium,
  Timer,
  Trash2,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";

const REGISTRY: Record<string, LucideIcon> = {
  AlertTriangle,
  Armchair,
  ArrowUp,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Bug,
  Cat,
  CheckCircle,
  ClipboardList,
  Clock,
  Eye,
  FileText,
  FlaskConical,
  Footprints,
  Globe,
  HelpCircle,
  Image: ImageIcon,
  Inbox,
  Key,
  Laptop,
  LayoutList,
  Layers,
  Lightbulb,
  Loader2,
  Mail,
  MessageCircle,
  MousePointer2,
  Network,
  Palette,
  PartyPopper,
  PenLine,
  Pencil,
  Pin,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Settings,
  Shield,
  Shuffle,
  Smile,
  Sparkles,
  Square,
  SunMedium,
  Timer,
  Trash2,
  Wrench,
  XCircle,
  Zap,
};

/** 历史 emoji → Lucide 组件名（存量数据兼容） */
const EMOJI_TO_KEY: Record<string, string> = {
  "📋": "ClipboardList",
  "🌐": "Globe",
  "✨": "Sparkles",
  "⚙️": "Settings",
  "🎉": "PartyPopper",
  "✅": "CheckCircle",
  "❌": "XCircle",
  "⏳": "Loader2",
  "⏹": "Square",
  "🐱": "Cat",
  "🔄": "RefreshCw",
  "🎨": "Palette",
  "💬": "MessageCircle",
  "✏️": "Pencil",
  "⬆️": "ArrowUp",
  "🕸️": "Network",
  "🖼️": "Image",
  "📊": "BarChart3",
  "🔆": "SunMedium",
  "📧": "Mail",
  "📒": "BookOpen",
  "📖": "BookOpen",
  "🛡️": "Shield",
  "🐛": "Bug",
  "📌": "Pin",
  "🔧": "Wrench",
  "🧩": "Puzzle",
  "🔀": "Shuffle",
  "📝": "FileText",
  "📑": "LayoutList",
  "👔": "Briefcase",
  "💡": "Lightbulb",
  "📮": "Inbox",
  "💻": "Laptop",
  "🆕": "Plus",
  "🗑️": "Trash2",
  "🔑": "Key",
  "🧪": "FlaskConical",
  "👀": "Eye",
  "🐾": "Footprints",
  "🪑": "Armchair",
  "🤖": "Bot",
  "🧠": "Brain",
  "⏰": "Clock",
  "🖱️": "MousePointer2",
  "⚡": "Zap",
  "😺": "Cat",
  "🐈": "Cat",
  "✍️": "PenLine",
  "🎩": "Layers",
  "▶️": "Play",
  "⚠️": "AlertTriangle",
  "⏱": "Timer",
};

function pascalCaseKey(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (REGISTRY[s]) return s;
  const parts = s.split(/[-_\s]+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("");
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function resolveLucideIcon(symbol: string): LucideIcon {
  const t = symbol.trim();
  if (!t) return HelpCircle;
  const fromEmoji = EMOJI_TO_KEY[t];
  if (fromEmoji && REGISTRY[fromEmoji]) return REGISTRY[fromEmoji];
  if (REGISTRY[t]) return REGISTRY[t];
  const pascal = pascalCaseKey(t);
  if (REGISTRY[pascal]) return REGISTRY[pascal];
  return HelpCircle;
}

export type AppIconProps = {
  symbol: string;
  className?: string;
  style?: CSSProperties;
  size?: number;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
};

/** 将技能/工作流等存储的图标键（Lucide 名或历史 emoji）渲染为矢量图标 */
export function AppIcon({
  symbol,
  className,
  style,
  size = 18,
  strokeWidth = 2,
  "aria-hidden": ariaHidden = true,
}: AppIconProps) {
  const Icon = resolveLucideIcon(symbol);
  return (
    <Icon
      className={className}
      style={style}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={ariaHidden}
    />
  );
}

/** 工作流图标快捷选择（存入库的 icon 字段） */
export const WORKFLOW_ICON_PRESETS = [
  "Globe",
  "ClipboardList",
  "LayoutList",
  "Sparkles",
  "Palette",
  "Laptop",
  "MessageCircle",
  "Mail",
  "BarChart3",
  "PenLine",
  "Bot",
  "Lightbulb",
  "Image",
  "FileText",
  "Wrench",
] as const;
