import React, { useEffect, useRef } from 'react';

interface BasicInfoDrawerProps {
  open: boolean;
  name: string;
  icon: string;
  description: string;
  trigger: string;
  cron: string;
  scheduledEnabled: boolean;
  startTime: string;
  endTime: string;
  persistent: boolean;
  onClose: () => void;
  onChangeName: (v: string) => void;
  onChangeIcon: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangeTrigger: (v: string) => void;
  onChangeCron: (v: string) => void;
  onChangeScheduledEnabled: (v: boolean) => void;
  onChangeStartTime: (v: string) => void;
  onChangeEndTime: (v: string) => void;
  onChangePersistent: (v: boolean) => void;
  onSetScheduled: (v: boolean) => void;
}

const BasicInfoDrawer: React.FC<BasicInfoDrawerProps> = ({
  open, name, icon, description, trigger, cron,
  scheduledEnabled, startTime, endTime, persistent,
  onClose, onChangeName, onChangeIcon, onChangeDescription,
  onChangeTrigger, onChangeCron, onChangeScheduledEnabled,
  onChangeStartTime, onChangeEndTime, onChangePersistent, onSetScheduled,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-[2px] z-40" onClick={onClose} />
      )}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-[380px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="text-2xl">{icon}</div>
          <span className="text-sm font-bold text-gray-900">基本信息</span>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">图标</label>
            <input
              type="text"
              value={icon}
              onChange={(e) => onChangeIcon(e.target.value)}
              className="w-16 px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-center text-xl outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="工作流名称"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">描述</label>
            <textarea
              value={description}
              onChange={(e) => onChangeDescription(e.target.value)}
              placeholder="这个工作流做什么..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium resize-none"
            />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">触发方式</label>
            <div className="flex gap-2">
              <button
                onClick={() => { onChangeTrigger('manual'); onSetScheduled(false); }}
                className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  trigger === 'manual'
                    ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-500'
                }`}
              >
                🖱️ 手动
              </button>
              <button
                onClick={() => { onChangeTrigger('cron'); onSetScheduled(true); }}
                className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  trigger === 'cron'
                    ? 'border-primary-400 bg-primary-50 text-primary-700 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-500'
                }`}
              >
                ⏰ 定时
              </button>
            </div>
          </div>

          {trigger === 'cron' && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">定时规则</label>
                <input
                  type="text"
                  value={cron}
                  onChange={(e) => onChangeCron(e.target.value)}
                  placeholder="例如：每周五 18:00"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all outline-none text-sm font-medium"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">开始时间</label>
                  <input type="time" value={startTime} onChange={(e) => onChangeStartTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 outline-none text-sm font-medium" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">结束时间</label>
                  <input type="time" value={endTime} onChange={(e) => onChangeEndTime(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-400 outline-none text-sm font-medium" />
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50">
                <div>
                  <span className="text-sm font-bold text-gray-900">启用调度</span>
                  <p className="text-[10px] text-gray-400 mt-0.5">按规则自动执行</p>
                </div>
                <button
                  onClick={() => onChangeScheduledEnabled(!scheduledEnabled)}
                  className={`w-10 h-5.5 rounded-full transition-all cursor-pointer relative ${scheduledEnabled ? 'bg-primary-500' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${scheduledEnabled ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>
            </>
          )}

          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50">
            <div>
              <span className="text-sm font-bold text-gray-900">持久化保存</span>
              <p className="text-[10px] text-gray-400 mt-0.5">保存历史记录与结果</p>
            </div>
            <button
              onClick={() => onChangePersistent(!persistent)}
              className={`w-10 h-5.5 rounded-full transition-all cursor-pointer relative ${persistent ? 'bg-primary-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${persistent ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default BasicInfoDrawer;
