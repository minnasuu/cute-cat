/**
 * ResourceCard —— 款式 / 插画 / 面料等「单图资源」的统一卡片。
 *
 * 设计要点:
 *   - 整张卡片即图片,圆角、白底、微边框;
 *   - 卡片 hover 时右上角浮现操作工具栏(编辑 / 删除 / 共享),默认隐藏;
 *   - 操作按钮通过 stopPropagation 独立响应,不再触发父级「打开详情」;
 *   - 顶部左角可叠加「系统」角标(共享标识)。
 */
import { Pencil, Trash2, Share2 } from "lucide-react";

type Props = {
  image?: string | null;
  name: string;
  tags?: string[];
  meta?: string;          // 右下角辅助 chip(如分类)
  shared?: boolean;       // 左上角「系统」角标(仅款式共享资源)
  isAdmin?: boolean;      // 共享按钮的显隐权限
  onView?: () => void;    // 卡片主体点击(打开只读详情弹窗)
  onEdit?: () => void;    // 铅笔 — 打开编辑弹窗
  onDelete?: () => void;  // 垃圾桶 — 删除
  onShare?: () => void;   // 共享 — 仅 styles 管理端
};

function stop(e: React.MouseEvent) { e.stopPropagation(); }

const ring =
  "ring-1 ring-black/5 shadow-sm hover:shadow-md";
const iconBtn =
  "w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors";

export function ResourceCard(props: Props) {
  const {
    image, name, tags = [], meta, shared, isAdmin,
    onView, onEdit, onDelete, onShare,
  } = props;

  const hasActions = !!(onEdit || onDelete || (isAdmin && onShare));

  return (
    <figure
      className="group rounded-2xl border border-gray-200 bg-white overflow-hidden cursor-pointer"
      title={name}
    >
      <div
        className="relative aspect-square overflow-hidden bg-gray-50"
        onClick={onView}
      >
        {/* 左上:共享角标 */}
        {shared && (
          <span className="absolute top-2 left-2 z-10 text-[8px] px-1.5 py-0.5 rounded-sm bg-amber-500/95 text-white font-medium">
            系统
          </span>
        )}

        {/* 主体图片 / 虚线占位 */}
        {image ? (
          <img src={image} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="rounded-xl border-2 border-dashed border-gray-200 w-20 h-20" />
          </div>
        )}

        {/* 右上:hover 浮现操作工具栏 */}
        {hasActions && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { stop(e); onEdit(); }}
                title="编辑"
                className={`${iconBtn} ${ring} bg-white/90 text-gray-600 hover:bg-primary-500 hover:text-white`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {isAdmin && onShare && (
              <button
                type="button"
                onClick={(e) => { stop(e); onShare(); }}
                title="共享"
                className={`${iconBtn} ${ring} bg-white/90 text-gray-600 hover:bg-amber-500 hover:text-white`}
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { stop(e); onDelete(); }}
                title="删除"
                className={`${iconBtn} ${ring} bg-white/90 text-gray-600 hover:bg-red-500 hover:text-white`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <figcaption className="px-3 py-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-gray-800 font-medium truncate">{name}</div>
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        {meta && (
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 font-medium">
            {meta}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
