import React from 'react';

interface CanvasToolbarProps {
  zoomPercent: number;
  isMinZoom: boolean;
  isMaxZoom: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onAutoLayout: () => void;
  onOpenBasicInfo: () => void;
  onOpenAiGenerate: () => void;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  zoomPercent, isMinZoom, isMaxZoom,
  onZoomIn, onZoomOut, onZoomReset, onAutoLayout,
  onOpenBasicInfo, onOpenAiGenerate,
}) => {
  return (
    <div className="absolute bottom-4 left-4 z-30 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white/80 backdrop-blur-xl border border-gray-200/80 shadow-lg">
      {/* Zoom controls */}
      <button
        onClick={onZoomOut}
        disabled={isMinZoom}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        title="缩小"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14" />
        </svg>
      </button>
      <button
        onClick={onZoomReset}
        className="min-w-[42px] h-8 px-1.5 rounded-xl flex items-center justify-center text-[11px] font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
        title="重置缩放"
      >
        {zoomPercent}%
      </button>
      <button
        onClick={onZoomIn}
        disabled={isMaxZoom}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        title="放大"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Auto layout */}
      <button
        onClick={onAutoLayout}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
        title="自动排列"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {/* Basic info */}
      <button
        onClick={onOpenBasicInfo}
        className="h-8 px-2.5 rounded-xl flex items-center gap-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer"
        title="基本信息"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span className="text-[11px] font-bold">基本信息</span>
      </button>

      {/* AI Generate */}
      <button
        onClick={onOpenAiGenerate}
        className="h-8 px-2.5 rounded-xl flex items-center gap-1.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all shadow-sm cursor-pointer"
        title="AI 智能建流"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span className="text-[11px] font-bold">AI 建流</span>
      </button>
    </div>
  );
};

export default CanvasToolbar;
