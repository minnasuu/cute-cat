import { useState, useCallback, useRef } from 'react';
import { canConnect, getOutputPortPos, type NodePositions, NODE_HEIGHT, START_NODE_SIZE } from './canvas-utils';

export interface EdgeDragState {
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 输出端口所属节点索引 */
  sourceIndex: number;
  /** 源端口画布坐标 */
  sourcePos: { x: number; y: number };
  /** 当前鼠标画布坐标 */
  mousePos: { x: number; y: number };
  /** 悬浮目标节点索引 */
  targetIndex: number | null;
}

const INITIAL_STATE: EdgeDragState = {
  isDragging: false,
  sourceIndex: -1,
  sourcePos: { x: 0, y: 0 },
  mousePos: { x: 0, y: 0 },
  targetIndex: null,
};

interface UseEdgeDragOptions {
  nodePositions: NodePositions;
  zoom: number;
  panX: number;
  panY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onConnect: (sourceIndex: number, targetIndex: number) => void;
}

export function useEdgeDrag(options: UseEdgeDragOptions) {
  const [dragState, setDragState] = useState<EdgeDragState>(INITIAL_STATE);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** 从输出端口开始拖拽连线 */
  const handlePortPointerDown = useCallback((nodeIndex: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const { nodePositions, zoom, panX, panY } = optionsRef.current;
    const nodePos = nodePositions.get(nodeIndex);
    if (!nodePos) return;

    // 计算源端口的画布坐标
    const height = nodeIndex === -1 ? START_NODE_SIZE : NODE_HEIGHT;
    const sourcePos = getOutputPortPos(nodePos, undefined, height);

    setDragState({
      isDragging: true,
      sourceIndex: nodeIndex,
      sourcePos,
      mousePos: { ...sourcePos },
      targetIndex: null,
    });

    // 全局事件监听（pointer capture 不适用于跨元素检测端口）
    const handleMove = (ev: PointerEvent) => {
      const { containerRef, zoom, panX, panY, nodePositions } = optionsRef.current;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      // 屏幕坐标 → 画布坐标
      const canvasX = (ev.clientX - rect.left - panX) / zoom;
      const canvasY = (ev.clientY - rect.top - panY) / zoom;

      // 检测是否悬浮在某个输入端口上
      let foundTarget: number | null = null;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el) {
        const portEl = (el as HTMLElement).closest?.('[data-port-type="input"]');
        if (portEl) {
          const idx = parseInt(portEl.getAttribute('data-port-index') || '', 10);
          if (!isNaN(idx) && canConnect(nodeIndex, idx)) {
            foundTarget = idx;
          }
        }
      }

      setDragState(prev => ({
        ...prev,
        mousePos: { x: canvasX, y: canvasY },
        targetIndex: foundTarget,
      }));
    };

    const handleUp = () => {
      setDragState(prev => {
        if (prev.targetIndex !== null) {
          // 连接成功
          optionsRef.current.onConnect(prev.sourceIndex, prev.targetIndex);
        }
        return INITIAL_STATE;
      });
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, []);

  /** 取消拖拽 */
  const cancelDrag = useCallback(() => {
    setDragState(INITIAL_STATE);
  }, []);

  return {
    dragState,
    handlePortPointerDown,
    cancelDrag,
  };
}
