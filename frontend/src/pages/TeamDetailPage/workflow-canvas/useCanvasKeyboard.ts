import { useEffect, useCallback, useRef } from 'react';

interface UseCanvasKeyboardOptions {
  /** 当前选中的节点索引 */
  selectedStepIndex: number | null;
  /** 当前选中的连线索引 */
  activeEdgeIndex: number | null;
  /** 删除选中节点 */
  onDeleteStep: (index: number) => void;
  /** 删除选中连线 */
  onDeleteEdge: (index: number) => void;
  /** 取消所有选中 */
  onClearSelection: () => void;
  /** 空格键按下/释放状态变化 */
  onSpaceChange?: (pressed: boolean) => void;
}

export function useCanvasKeyboard(options: UseCanvasKeyboardOptions) {
  const {
    selectedStepIndex,
    activeEdgeIndex,
    onDeleteStep,
    onDeleteEdge,
    onClearSelection,
    onSpaceChange,
  } = options;

  // 用 ref 保存最新值，避免事件监听器闭包问题
  const stateRef = useRef(options);
  stateRef.current = options;

  const isSpacePressed = useRef(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 忽略在输入框中的按键
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((e.target as HTMLElement).isContentEditable) return;

    const { selectedStepIndex, activeEdgeIndex, onDeleteStep, onDeleteEdge, onClearSelection } = stateRef.current;

    switch (e.key) {
      case 'Delete':
      case 'Backspace': {
        if (selectedStepIndex !== null) {
          e.preventDefault();
          onDeleteStep(selectedStepIndex);
        } else if (activeEdgeIndex !== null && activeEdgeIndex > 0) {
          e.preventDefault();
          onDeleteEdge(activeEdgeIndex);
        }
        break;
      }

      case 'Escape': {
        e.preventDefault();
        onClearSelection();
        break;
      }

      case ' ': {
        // 空格键：进入画布拖拽模式
        if (!isSpacePressed.current) {
          e.preventDefault();
          isSpacePressed.current = true;
          stateRef.current.onSpaceChange?.(true);
        }
        break;
      }
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ' && isSpacePressed.current) {
      isSpacePressed.current = false;
      stateRef.current.onSpaceChange?.(false);
    }
  }, []);

  // 窗口失焦时重置空格状态
  const handleBlur = useCallback(() => {
    if (isSpacePressed.current) {
      isSpacePressed.current = false;
      stateRef.current.onSpaceChange?.(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleKeyDown, handleKeyUp, handleBlur]);

  return { isSpacePressed };
}
