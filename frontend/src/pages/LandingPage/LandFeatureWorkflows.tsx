import { useState, useEffect, useRef, useCallback } from 'react'
import CatSVG from '../../components/CatSVG'
import { assistants } from '../../data/cats'
import { workflows } from '../../data/workflows'
import { AppIcon } from '../../components/icons'

const catMap = Object.fromEntries(assistants.map(c => [c.id, c]))

// 选一个最具代表性的工作流：优先展示「落地页」，否则回退第一个
const DEMO_WORKFLOW = workflows.find(w => w.id === 'landing-page') ?? workflows[0]

const STEP_DURATION = 2400

const workingDialogs: Record<string, string[]> = {
  manager: ['统筹规划中...', '调度安排~', '一切就绪!'],
  writer: ['构思灵感中...', '奋笔疾书~', '文章出炉!'],
  analyst: ['让我查查数据...', '正在分析中~', '数据看起来不错!'],
  designer: ['调色构图中...', '生成画面~', '大作完成!'],
  reviewer: ['仔细检查中...', '质量测试~', '检测通过!'],
  ops: ['邮件编辑中...', '正在发送~', '送达成功!'],
  engineer: ['代码审查中...', '构建编译~', '部署完毕!'],
  'visual-designer': ['调色构图中...', '生成画面~', '大作完成!'],
}

type StepStatus = 'waiting' | 'active' | 'done'

export const LandFeatureWorkflows = () => {
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([])
  const [dialogs, setDialogs] = useState<string[]>([])
  const [cycle, setCycle] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timerRef.current.forEach(t => clearTimeout(t))
    timerRef.current = []
  }, [])

  // Run the execution animation loop
  useEffect(() => {
    clearTimers()
    const steps = DEMO_WORKFLOW.steps
    setStepStatuses(steps.map(() => 'waiting'))
    setDialogs(steps.map(() => ''))

    let delay = 800

    steps.forEach((step, i) => {
      // Start running
      const t1 = setTimeout(() => {
        setStepStatuses(prev => { const n = [...prev]; n[i] = 'active'; return n })
        const agentDialogs = workingDialogs[step.agentId] ?? ['工作中...']
        setDialogs(prev => { const n = [...prev]; n[i] = agentDialogs[0]; return n })
      }, delay)
      timerRef.current.push(t1)

      // Mid dialog
      const t2 = setTimeout(() => {
        const agentDialogs = workingDialogs[step.agentId] ?? ['工作中...']
        setDialogs(prev => { const n = [...prev]; n[i] = agentDialogs[1] ?? agentDialogs[0]; return n })
      }, delay + STEP_DURATION * 0.4)
      timerRef.current.push(t2)

      // Complete
      const doneDelay = delay + STEP_DURATION
      const t3 = setTimeout(() => {
        setStepStatuses(prev => { const n = [...prev]; n[i] = 'done'; return n })
        const agentDialogs = workingDialogs[step.agentId] ?? ['完成!']
        setDialogs(prev => { const n = [...prev]; n[i] = agentDialogs[2] ?? '完成!'; return n })
      }, doneDelay)
      timerRef.current.push(t3)

      delay = doneDelay + 500
    })

    // Restart cycle
    const cycleTimer = setTimeout(() => {
      setCycle(c => c + 1)
    }, delay + 2500)
    timerRef.current.push(cycleTimer)

    return clearTimers
  }, [cycle, clearTimers])

  const allDone = stepStatuses.length > 0 && stepStatuses.every(s => s === 'done')

  return (
    <section id="workflows" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="text-sm font-bold text-secondary-500 uppercase tracking-widest mb-4">工作流</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            串联协作，全自动运转。
          </h2>
          <p className="text-lg text-text-secondary font-medium">
            将多只猫猫串联为流水线，设定触发规则后自动执行。
          </p>
        </div>

        {/* Pipeline execution demo */}
        <div className="max-w-5xl mx-auto">
          {/* Stage header */}
          <div className="bg-surface-secondary rounded-t-2xl border border-border border-b-0 px-5 py-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-400/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
              <div className="w-3 h-3 rounded-full bg-green-400/60" />
            </div>
            <div className="flex-1 text-center">
              <span className="text-xs font-bold text-text-tertiary">{DEMO_WORKFLOW.name}</span>
              <span className="text-[10px] text-text-tertiary ml-2">· {DEMO_WORKFLOW.description}</span>
            </div>
            <div className="w-12" />
          </div>

          {/* Pipeline body */}
          <div className="bg-surface rounded-b-2xl border border-border overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <div className="flex items-start gap-0 pt-16 pb-10 px-8 min-w-max justify-center">
              {DEMO_WORKFLOW.steps.map((step, i) => {
                const cat = catMap[step.agentId]
                const status = stepStatuses[i] ?? 'waiting'
                const dialog = dialogs[i] ?? ''

                return (
                  <div key={i} className="flex items-start">
                    {/* Node */}
                    <div className={`relative flex flex-col items-center gap-2 w-[140px] transition-all duration-400 ${
                      status === 'waiting' ? 'opacity-40' : ''
                    } ${status === 'active' ? 'scale-110 z-10' : ''}`}>
                      {/* Bubble */}
                      <div className={`absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white border border-border rounded-xl px-3 py-1 shadow-md transition-all duration-300 ${
                        status === 'active'
                          ? 'opacity-100 translate-y-0 scale-100'
                          : status === 'done'
                            ? 'opacity-80 translate-y-0 scale-95'
                            : 'opacity-0 translate-y-2 scale-80 pointer-events-none'
                      }`}>
                        <span className={`text-xs font-semibold ${status === 'done' ? 'text-primary-600' : 'text-text-primary'}`}>
                          {dialog}
                        </span>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[5px] rotate-45 w-2 h-2 bg-white border-r border-b border-border" />
                      </div>

                      {/* Cat avatar */}
                      <div className={`w-[80px] transition-all duration-400 ${
                        status === 'active' ? 'animate-bounce-gentle' : ''
                      }`}>
                        {cat && (
                          <CatSVG
                            colors={cat.catColors}
                            className={`w-full h-auto transition-all duration-400 ${
                              status === 'waiting' ? 'saturate-[0.3]' :
                              status === 'active' ? 'saturate-110 drop-shadow-lg' :
                              'saturate-100'
                            }`}
                          />
                        )}
                      </div>

                      {/* Name + skill */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-extrabold" style={{ color: cat?.accent }}>{cat?.name ?? step.agentId}</span>
                        {cat?.role && (
                          <span className="text-[10px] font-semibold text-text-tertiary bg-surface-secondary px-2 py-0.5 rounded-md">
                            {cat.role}
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      {status === 'active' && (
                        <div className="w-4/5 h-[3px] bg-border-light rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-secondary-400 to-secondary-500 rounded-full"
                            style={{ animation: `land-wf-progress ${STEP_DURATION}ms linear forwards` }}
                          />
                        </div>
                      )}

                      {/* Done check */}
                      {status === 'done' && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5.5L4 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}

                      {/* IO tags */}
                      {status === 'waiting' && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[9px] font-bold uppercase bg-blue-50 text-blue-600 px-1.5 py-px rounded tracking-wider">text</span>
                          <span className="text-[9px] text-text-tertiary">→</span>
                          <span className="text-[9px] font-bold uppercase bg-orange-50 text-orange-600 px-1.5 py-px rounded tracking-wider">text</span>
                        </div>
                      )}
                    </div>

                    {/* Arrow connector */}
                    {i < DEMO_WORKFLOW.steps.length - 1 && (
                      <div className="flex items-center h-[80px] w-[50px] flex-shrink-0 translate-y-[10px]">
                        <div className={`flex-1 h-[2px] transition-colors duration-400 ${
                          stepStatuses[i] === 'done' ? 'bg-primary-400' : 'bg-border'
                        }`} />
                        <svg width="10" height="10" viewBox="0 0 24 24" className={`-ml-1 transition-colors duration-400 ${
                          stepStatuses[i] === 'done' ? 'text-primary-400' : 'text-border'
                        }`} fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        {/* Data flow tag */}
                        {stepStatuses[i] === 'done' && (
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 animate-in fade-in zoom-in">
                            <span className="text-[9px] font-bold uppercase bg-primary-50 text-primary-600 px-1.5 py-px rounded tracking-wider">
                              text
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer status */}
            <div className="flex items-center justify-center h-12 border-t border-border">
              {!allDone && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2].map(j => (
                      <span key={j} className="w-1.5 h-1.5 bg-secondary-400 rounded-full animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-text-tertiary">
                    步骤 {stepStatuses.filter(s => s !== 'waiting').length} / {DEMO_WORKFLOW.steps.length} 执行中...
                  </span>
                </div>
              )}
              {!allDone && stepStatuses.every(s => s === 'waiting') && (
                <span className="text-xs font-semibold text-text-tertiary">准备执行...</span>
              )}
              {allDone && (
                <div className="flex items-center gap-2 animate-in fade-in">
                  <span className="text-primary-600 inline-flex"><AppIcon symbol="PartyPopper" size={18} /></span>
                  <span className="text-xs font-bold text-primary-600">
                    工作流执行完成 · {DEMO_WORKFLOW.steps.length} 步全部成功
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes land-wf-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes bounce-gentle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-gentle {
          animation: bounce-gentle 0.6s ease-in-out infinite;
        }
      `}</style>
    </section>
  )
}
