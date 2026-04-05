import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import { showToast } from '../../components/Toast';
import CatLogo from '../../components/CatLogo';
import type { WorkflowStep } from '../../data/types';
import { generateStepId, ensureStepIds } from '../../data/types';
import { aiGenerateWorkflow } from './handleAiGenerateWorkflow';

// Canvas components
import WorkflowCanvas from './workflow-canvas/WorkflowCanvas';
import StepConfigPanel from './workflow-canvas/StepConfigPanel';
import EdgePopover from './workflow-canvas/EdgePopover';
import CanvasToolbar from './workflow-canvas/CanvasToolbar';
import BasicInfoDrawer from './workflow-canvas/BasicInfoDrawer';
import AiGenerateDialog from './workflow-canvas/AiGenerateDialog';
import Minimap from './workflow-canvas/Minimap';
import { autoLayout, type NodePositions } from './workflow-canvas/canvas-utils';
import { useCanvasViewport } from './workflow-canvas/useCanvasViewport';
import { AppIcon } from '../../components/icons';
import { Clock, MousePointer2 } from 'lucide-react';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; accent: string; systemPrompt?: string; skills?: any[];
}

const WorkflowEditorPage: React.FC = () => {
  const { teamId, workflowId } = useParams<{ teamId: string; workflowId: string }>();
  const navigate = useNavigate();
  const isEditing = workflowId && workflowId !== 'new';

  // ── 核心数据状态（保留原有逻辑） ──
  const [cats, setCats] = useState<TeamCat[]>([]);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('ClipboardList');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([{ stepId: generateStepId(), agentId: '' }]);
  const [trigger, setTrigger] = useState('manual');
  const [cron, setCron] = useState('');
  const [, setScheduled] = useState(false);
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [persistent, setPersistent] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── AI 生成状态 ──
  const [aiLoading, setAiLoading] = useState(false);

  // ── 画布状态（新增） ──
  const [nodePositions, setNodePositions] = useState<NodePositions>(new Map());
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [activeEdgeIndex, setActiveEdgeIndex] = useState<number | null>(null);
  const [edgePopover, setEdgePopover] = useState<{ index: number; pos: { x: number; y: number } } | null>(null);
  const [showBasicInfo, setShowBasicInfo] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);

  // 画布 viewport ref
  const viewportRef = useRef<ReturnType<typeof useCanvasViewport> | null>(null);

  // 画布容器尺寸（Minimap 需要）
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const mainRef = useRef<HTMLDivElement>(null);

  // 跟踪画布容器尺寸
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── 数据加载（保留原有逻辑） ──
  useEffect(() => {
    apiClient.get(`/api/cats/team/${teamId}`).then((data: TeamCat[]) => setCats(data)).catch(console.error);
    if (isEditing) {
      apiClient.get(`/api/workflows/${workflowId}`).then(wf => {
        setName(wf.name);
        setIcon(wf.icon || 'ClipboardList');
        setDescription(wf.description);
        setSteps(ensureStepIds(wf.steps || []));
        const isCron = wf.trigger === 'cron' || !!wf.scheduled;
        setTrigger(isCron ? 'cron' : 'manual');
        setCron(wf.cron || '');
        setScheduled(isCron);
        setScheduledEnabled(wf.enabled !== undefined ? !!wf.enabled : !!wf.scheduledEnabled);
        setStartTime(wf.startTime || '');
        setEndTime(wf.endTime || '');
        setPersistent(!!wf.persistent);
      }).catch(() => navigate(`/teams/${teamId}`));
    }
  }, [teamId, workflowId, isEditing, navigate]);

  // ── 自动布局：steps 变化时重新计算节点位置（DAG 感知） ──
  useEffect(() => {
    setNodePositions(autoLayout(steps));
  }, [steps]);

  // ── 步骤操作函数（保留原有逻辑） ──
  const addStep = useCallback(() => {
    setSteps(prev => [...prev, { stepId: generateStepId(), agentId: '' }]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps(prev => {
      const removedStepId = prev[index]?.stepId;
      return prev.filter((_, i) => i !== index).map(s => {
        // 清理引用了被删除步骤的 inputFrom
        if (removedStepId && s.inputFrom === removedStepId) {
          return { ...s, inputFrom: undefined };
        }
        return s;
      });
    });
    if (selectedStepIndex === index) setSelectedStepIndex(null);
    else if (selectedStepIndex !== null && selectedStepIndex > index) {
      setSelectedStepIndex(selectedStepIndex - 1);
    }
  }, [selectedStepIndex]);

  const updateStep = useCallback((index: number, field: keyof WorkflowStep, value: any) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== index) return s;
      return { ...s, [field]: value };
    }));
  }, []);

  // ── 保存（保留原有逻辑） ──
  const handleSave = async () => {
    if (!name.trim()) { showToast('请输入工作流名称', 'warning'); return; }
    if (steps.length === 0) { showToast('请至少添加一个步骤', 'warning'); return; }
    setSaving(true);
    try {
      const isScheduled = trigger === 'cron';
      const data = {
        name, icon, description, steps,
        scheduled: isScheduled,
        scheduledEnabled: isScheduled ? scheduledEnabled : false,
        cron: isScheduled ? cron : undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        persistent,
      };
      if (isEditing) {
        await apiClient.put(`/api/workflows/${workflowId}`, data);
      } else {
        await apiClient.post(`/api/workflows/team/${teamId}`, data);
      }
      navigate(`/teams/${teamId}`);
    } catch {
      // toast shown by apiClient
    } finally {
      setSaving(false);
    }
  };

  // ── AI 生成 ──
  const handleAiGenerate = async (aiPrompt: string) => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await aiGenerateWorkflow(aiPrompt, cats);
      if (!result) return;

      if (result.name) setName(result.name);
      if (result.icon) setIcon(result.icon);
      if (result.description) setDescription(result.description);
      if (result.scheduled) {
        setTrigger('cron');
        setScheduled(true);
        setScheduledEnabled(true);
        if (result.cron) setCron(result.cron);
        if (result.startTime) setStartTime(result.startTime);
        if (result.endTime) setEndTime(result.endTime);
      }
      if (result.persistent !== undefined) setPersistent(result.persistent);

      // 自动为没有 agentId 的步骤分配默认猫猫
      if (Array.isArray(result.steps)) {
        const defaultCat = cats.find(c => c.role === 'Default');
        const finalSteps = ensureStepIds(result.steps.map(s => {
          if (!s.agentId && defaultCat) {
            return { ...s, agentId: defaultCat.id };
          }
          return s;
        }));
        setSteps(finalSteps);
      }

      setShowAiDialog(false);
    } finally {
      setAiLoading(false);
    }
  };

  // ── 画布交互处理器 ──

  const handleNodeDrag = useCallback((index: number, pos: { x: number; y: number }) => {
    setNodePositions(prev => {
      const next = new Map(prev);
      next.set(index, pos);
      return next;
    });
  }, []);

  const handleEdgeClick = useCallback((index: number, midpoint: { x: number; y: number }) => {
    if (index < 1) return; // 开始节点的连线（负数或0）不可编辑
    setActiveEdgeIndex(index);
    setEdgePopover({ index, pos: midpoint });
  }, []);

  const handleUpdateInputFrom = useCallback((index: number, inputFrom: string | undefined) => {
    updateStep(index, 'inputFrom', inputFrom);
  }, [updateStep]);

  const handleAutoLayout = useCallback(() => {
    setNodePositions(autoLayout(steps));
  }, [steps]);

  const handleDoubleClickCanvas = useCallback((_pos: { x: number; y: number }) => {
    // 双击画布空白区域添加新步骤
    addStep();
  }, [addStep]);

  const handleSelectStep = useCallback((index: number | null) => {
    setSelectedStepIndex(index);
    // 关闭 edge popover
    setEdgePopover(null);
    setActiveEdgeIndex(null);
  }, []);

  // ── 拖拽连线完成 → 更新 inputFrom ──
  const handleConnect = useCallback((sourceIndex: number, targetIndex: number) => {
    // sourceIndex 是输出端口所属节点索引，targetIndex 是输入端口所属节点索引
    // 对于开始节点 (sourceIndex = -1)，目标步骤的 inputFrom 应该清空（默认就是从开始节点来的）
    if (sourceIndex === -1) {
      updateStep(targetIndex, 'inputFrom', undefined);
    } else {
      // 使用 stepId 标识来源步骤（唯一且稳定）
      const sourceStep = steps[sourceIndex];
      if (sourceStep?.stepId) {
        updateStep(targetIndex, 'inputFrom', sourceStep.stepId);
      }
    }
  }, [steps, updateStep]);

  // ── 删除连线 → 清除 inputFrom ──
  const handleDeleteEdge = useCallback((index: number) => {
    if (index > 0) {
      updateStep(index, 'inputFrom', undefined);
      setActiveEdgeIndex(null);
      setEdgePopover(null);
    }
  }, [updateStep]);

  return (
    <div className="h-screen flex flex-col bg-surface text-text-primary selection:bg-primary-100 selection:text-primary-900">
      {/* ── Header（与 CatEditorPage / 项目 surface 主题一致） ── */}
      <header className="relative z-30 flex items-center justify-between h-20 px-6 shrink-0">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        <div className="absolute top-8 right-1/4 w-72 h-72 bg-accent-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />

        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(`/teams/${teamId}`)}
            className="flex items-center gap-1.5 text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            返回团队
          </button>
          <div className="w-px h-4 bg-black/10 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-primary-600 inline-flex shrink-0">
              <AppIcon symbol={icon} size={22} />
            </span>
            <h1 className="text-xl md:text-2xl font-black tracking-tight truncate">
              {name || (isEditing ? '编辑工作流' : '新工作流')}
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 ml-1 shrink-0">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                trigger === 'cron'
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'bg-surface-secondary text-text-tertiary border-border'
              }`}
            >
              {trigger === 'cron' ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} strokeWidth={2.5} />
                  {cron || '定时'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <MousePointer2 size={12} strokeWidth={2.5} />
                  手动
                </span>
              )}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-secondary border border-border text-[10px] font-bold text-text-tertiary">
              {steps.length} 步
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {cats.length === 0 && (
            <span className="text-[10px] font-bold text-red-600 mr-2 text-right max-w-[min(42vw,14rem)] sm:max-w-[16rem] leading-tight">
              团队暂无猫猫，请在工作台重新初始化或联系管理员
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 text-sm font-bold bg-text-primary text-text-inverse rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>

      {/* ── Canvas Area ── */}
      <main ref={mainRef} className="flex-1 relative overflow-hidden">
        {/* Canvas */}
        <WorkflowCanvas
          steps={steps}
          cats={cats}
          nodePositions={nodePositions}
          selectedStepIndex={selectedStepIndex}
          activeEdgeIndex={activeEdgeIndex}
          onSelectStep={handleSelectStep}
          onNodeDrag={handleNodeDrag}
          onAddStep={addStep}
          onRemoveStep={removeStep}
          onEdgeClick={handleEdgeClick}
          onDoubleClickCanvas={handleDoubleClickCanvas}
          onConnect={handleConnect}
          onDeleteEdge={handleDeleteEdge}
          viewportRef={viewportRef}
        />

        {/* Edge Popover (rendered on top of canvas) */}
        {edgePopover && (
          <div className="absolute inset-0 pointer-events-none" style={viewportRef.current?.viewportStyle}>
            <div className="pointer-events-auto">
              <EdgePopover
                open={true}
                stepIndex={edgePopover.index}
                step={steps[edgePopover.index]}
                steps={steps}
                cats={cats}
                position={edgePopover.pos}
                onUpdateInputFrom={handleUpdateInputFrom}
                onClose={() => { setEdgePopover(null); setActiveEdgeIndex(null); }}
              />
            </div>
          </div>
        )}

        {/* Canvas Toolbar */}
        <CanvasToolbar
          zoomPercent={viewportRef.current?.zoomPercent ?? 100}
          isMinZoom={viewportRef.current?.isMinZoom ?? false}
          isMaxZoom={viewportRef.current?.isMaxZoom ?? false}
          onZoomIn={() => viewportRef.current?.zoomIn()}
          onZoomOut={() => viewportRef.current?.zoomOut()}
          onZoomReset={() => viewportRef.current?.zoomReset()}
          onAutoLayout={handleAutoLayout}
          onOpenBasicInfo={() => setShowBasicInfo(true)}
          onOpenAiGenerate={() => setShowAiDialog(true)}
        />

        {/* Minimap */}
        <Minimap
          nodePositions={nodePositions}
          viewport={viewportRef.current?.viewport ?? { panX: 0, panY: 0, zoom: 1 }}
          containerSize={containerSize}
          stepCount={steps.length}
          steps={steps}
          onSetPan={(panX, panY) => viewportRef.current?.setPan(panX, panY)}
        />
      </main>

      {/* ── Side Panels ── */}
      {selectedStepIndex !== null && steps[selectedStepIndex] && (
        <StepConfigPanel
          open={true}
          stepIndex={selectedStepIndex}
          step={steps[selectedStepIndex]}
          cats={cats}
          onClose={() => setSelectedStepIndex(null)}
          onUpdateStep={updateStep}
        />
      )}

      <BasicInfoDrawer
        open={showBasicInfo}
        name={name}
        icon={icon}
        description={description}
        trigger={trigger}
        cron={cron}
        scheduledEnabled={scheduledEnabled}
        startTime={startTime}
        endTime={endTime}
        persistent={persistent}
        onClose={() => setShowBasicInfo(false)}
        onChangeName={setName}
        onChangeIcon={setIcon}
        onChangeDescription={setDescription}
        onChangeTrigger={setTrigger}
        onChangeCron={setCron}
        onChangeScheduledEnabled={setScheduledEnabled}
        onChangeStartTime={setStartTime}
        onChangeEndTime={setEndTime}
        onChangePersistent={setPersistent}
        onSetScheduled={setScheduled}
      />

      <AiGenerateDialog
        open={showAiDialog}
        loading={aiLoading}
        onClose={() => setShowAiDialog(false)}
        onGenerate={handleAiGenerate}
      />

      {/* ── Footer（与 CatEditorPage 一致） ── */}
      <footer className="py-4 border-t border-border shrink-0">
        <div className="w-full mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <CatLogo size={36} />
          </Link>
          <p className="text-text-tertiary text-xs font-medium">&copy; 2026 CuCaTopia.</p>
        </div>
      </footer>
    </div>
  );
};

export default WorkflowEditorPage;
