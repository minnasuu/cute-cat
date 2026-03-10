import React, { useEffect, useRef, useState } from 'react';

interface AiGenerateDialogProps {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
}

const AiGenerateDialog: React.FC<AiGenerateDialogProps> = ({
  open, loading, onClose, onGenerate,
}) => {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSubmit = () => {
    if (!prompt.trim() || loading) return;
    onGenerate(prompt);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-in">
        {/* Gradient top accent */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-green-400" />

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-200/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">AI 智能建流</h3>
              <p className="text-[11px] text-gray-400 font-medium">描述你想要自动化的任务，AI 将自动编排工作流</p>
            </div>
            <button
              onClick={onClose}
              className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="例如：每天自动爬取行业资讯并生成日报..."
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-sm font-medium transition-all"
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !prompt.trim()}
              className="px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-200/50 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                  </svg>
                  生成中
                </span>
              ) : '生成'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .animate-in {
          animation: dialogIn 0.25s ease-out;
        }
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AiGenerateDialog;
