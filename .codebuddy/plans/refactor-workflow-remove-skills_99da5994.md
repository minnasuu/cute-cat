---
name: refactor-workflow-remove-skills
overview: 基于"猫咪唯一对应 agentId"的新逻辑，移除 skill/primitive 概念，重塑工作流执行链路。调用猫就是调用它的 agent 脚本，所有输入输出统一为 text。
todos:
  - id: create-agents-layer
    content: 创建 frontend/src/agents/ 目录，编写 types.ts（AgentContext/AgentResult/AgentHandler）、_framework.ts（runWithAI 直调 callDifySkill + 重试超时）、index.ts（agentRegistry 注册表），以及迁移 4 个猫脚本（product-architect/ux-designer/visual-designer/frontend-engineer）
    status: completed
  - id: clean-data-types
    content: 清理 frontend/src/data/types.ts 确认无 Skill/StepParam/PrimitiveId 残留；修改 workbenchTypes.ts 移除 PlanStep.skillId 和 WorkflowRunStep.skillId；修改 backendClient.ts 移除 WorkflowStep.skillId/params、WorkflowRunDB.skillId、AssistantDB.skills
    status: completed
    dependencies:
      - create-agents-layer
  - id: update-pipeline-components
    content: 修改 DashboardWorkflowPipeline.tsx 和 WorkflowPanel.tsx：移除 Skill 类型引用和 getAgentSkill()，将 skill 标签改为 agent.role 展示，getSkillHandler 改为 getAgentHandler，SkillResult 改为 AgentResult
    status: completed
    dependencies:
      - clean-data-types
  - id: update-team-detail-page
    content: 修改 TeamDetailPage/index.tsx：将 getSkillHandler 改为 getAgentHandler、SkillResult 改为 AgentResult、移除 skill 查找逻辑和 skillId 引用；同步修改 workflow-canvas/ 下 StepNode/StepConfigPanel/WorkflowCanvas/EdgePopover 移除 skill 相关展示和配置
    status: completed
    dependencies:
      - create-agents-layer
      - clean-data-types
  - id: update-backend-executor
    content: 修改 backend/workflow-executor.js：executeStep 从按 skillId 分发改为按 agentId 分发到 cat-step-scripts，移除 SKILL_PROMPTS 和 params 解析；同步修改 cat-step-scripts/index.js 和 _framework.js 移除 skillId 引用
    status: completed
  - id: cleanup-and-verify
    content: 使用 [subagent:code-explorer] 全局搜索残留的 skill/Skill/skillId/primitiveId/getSkillHandler 引用并逐一清理；删除 frontend/src/skills/ 整个目录；确认 TypeScript 编译无报错
    status: completed
    dependencies:
      - create-agents-layer
      - update-pipeline-components
      - update-team-detail-page
      - update-backend-executor
---

## 产品概述

重塑工作流执行链路，建立"一只猫 = 一个 agent"的简化模型。移除 skill（技能）和 primitive（技能原型）两层抽象，让工作流步骤直接通过 agentId 定位到对应猫咪的 agent 脚本执行，所有猫的输入输出统一为 text。

## 核心特性

1. **数据模型简化**：WorkflowStep 仅保留 stepId + agentId，移除 skillId/action/params 等技能相关字段；PlanStep、WorkflowRunStep 等类型同步清理
2. **前端执行层重构**：将 skills/ 目录重构为 agents/ 目录，建立 agentRegistry（agentId -> AgentHandler）直接映射，移除 skillRegistry / primitives 两层间接调用；每个 agent 脚本统一 text in / text out
3. **后端执行引擎适配**：workflow-executor.js 的 executeStep 从按 skillId 分发改为按 agentId 分发，直接调用 cat-step-scripts 中对应猫脚本
4. **UI 组件适配**：DashboardWorkflowPipeline、WorkflowPanel、WorkflowCanvas 等组件移除 skill 标签、skill 参数面板等展示，改为直接显示猫咪角色信息
5. **backendClient 类型清理**：WorkflowStep 移除 skillId/params，WorkflowRunDB 等移除 skillId 字段

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Node.js + Express + Prisma
- AI 调用：callDifySkill (前端 → 后端 /api/dify/skill) / callAI (后端直调 Qwen/Gemini)

## 实现方案

### 核心策略

将现有三层调用链（skillRegistry → aigc/ai-chat → primitives/text-to-text → callDifySkill）扁平化为两层（agentRegistry → agentHandler → callDifySkill）。每个 agent 脚本内部直接调用 callDifySkill，不再经过 primitive 中间层。

### 关键技术决策

1. **目录重命名 skills/ → agents/**：保持文件路径语义一致，避免新旧概念混淆。agents/ 内部结构简化为：

- `types.ts`：AgentContext (text input) / AgentResult (text output) / AgentHandler
- `index.ts`：agentRegistry (Map<agentId, AgentHandler>)
- `_framework.ts`：保留 runWithAI / extractUpstreamText（移除对 executePrimitive 的依赖，直接调 callDifySkill）
- 四个猫脚本平铺：product-architect.ts / ux-designer.ts / visual-designer.ts / frontend-engineer.ts
- 删除 primitives/ 子目录、aigc.ts、ai-chat.ts、cats/index.ts 等中间分发层

2. **统一 text in / text out**：AgentContext.input 类型改为 string，AgentResult.data 类型改为 `{ text: string }`，移除 unknown 泛型。前端 pipeline 组件和后端 executor 统一用字符串传递上下游数据。

3. **后端 executeStep 重构**：移除按 skillId 分发逻辑，改为：

- 所有步骤统一按 agentId 查找猫脚本执行
- 保留 catSystemPrompt 注入（猫的性格 prompt）
- 上游数据提取逻辑不变（从 prevResults 中取 text/summary 等）
- 移除 SKILL_PROMPTS 映射和 params 解析逻辑

4. **向后兼容**：backendClient.ts 中 callDifySkill 函数签名和 API 端点不变（仍然调 /api/dify/skill），只是前端不再经过 primitive 层。数据库中已有的 WorkflowRun 记录中 skillId 字段保留为历史数据但不再写入。

### 架构对比

重构前：

```
前端: skillRegistry.get(skillId)
  → aigc.execute(ctx) 或 ai-chat.execute(ctx)
    → cats/index.ts 按 templateId 分发
      → 各猫脚本 → executePrimitive('text-to-text')
        → callDifySkill()

后端: executeStep(step) 按 skillId 分发
  → skillId='aigc' → cat-step-scripts
  → skillId='ai-chat' → SKILL_PROMPTS + callAI
  → 其他 skillId → SKILL_PROMPTS + callAI
```

重构后：

```
前端: agentRegistry.get(agentId)
  → 各猫 handler.execute(ctx)
    → callDifySkill() / callAI()

后端: executeStep(step) 按 agentId 分发
  → cat-step-scripts/cats/<agentId>.js
    → callAI()
```

## 实现注意事项

1. **渐进式清理**：先建立 agents/ 新目录并跑通，确认无报错后再删除 skills/ 旧目录，避免中间态破坏编译
2. **前端 _framework.ts 重构重点**：runWithAI 内部将 executePrimitive('text-to-text', ...) 替换为直接调用 callDifySkill，保留重试和超时逻辑
3. **组件中 skill 引用清理**：DashboardWorkflowPipeline 中移除 `import type { Skill }`、`getAgentSkill()`、skill 标签/IO 标签/provider 展示；节点信息改为显示 agent.role
4. **保持 assistants 数据引用不变**：cats/ 数据目录 (data/cats/) 和 Assistant 类型不变，仅清理其中可能残留的 skills 字段引用

## 目录结构

```
frontend/src/
├── agents/                              # [NEW] 替代 skills/，agent 执行层
│   ├── types.ts                         # [NEW] AgentContext/AgentResult/AgentHandler 类型定义。AgentContext 包含 agentId + input(string) + timestamp 等；AgentResult 包含 success + data({text:string}) + summary + status。不再有 Skill/Primitive 概念
│   ├── index.ts                         # [NEW] agentRegistry: Map<string, AgentHandler> + getAgentHandler()。直接注册 4 个官方猫 handler，不再有 aigc/ai-chat 中间分发
│   ├── _framework.ts                    # [NEW] 基于 skills/cats/_framework.ts 重写。runWithAI 直接调用 callDifySkill 替代 executePrimitive；保留 extractUpstreamText + 重试 + 超时逻辑
│   ├── product-architect.ts             # [NEW] 基于 skills/cats/product-architect.ts 迁移，import 路径改为 ../agents/_framework
│   ├── ux-designer.ts                   # [NEW] 基于 skills/cats/ux-designer.ts 迁移
│   ├── visual-designer.ts              # [NEW] 基于 skills/cats/visual-designer.ts 迁移，灵感库匹配逻辑不变，底层调用改为 callDifySkill
│   └── frontend-engineer.ts            # [NEW] 基于 skills/cats/frontend-engineer.ts 迁移
├── skills/                              # [DELETE] 整个目录删除（包括 primitives/ 子目录）
├── data/
│   ├── types.ts                         # [MODIFY] 确认已移除 Skill/StepParam/PrimitiveId 等类型（当前已清理）
│   └── workflows.ts                     # [NO CHANGE] 步骤结构已是 { stepId, agentId }
├── components/
│   ├── DashboardWorkflowPipeline.tsx    # [MODIFY] 移除 Skill 类型引用和 getAgentSkill()；skill 标签/IO/provider 展示改为 agent.role；箭头数据标签改为 "text"
│   └── WorkflowPanel.tsx                # [MODIFY] 移除 getAgentSkill/Skill 引用；skill 标签改为 role 展示；getSkillHandler 改为 getAgentHandler；SkillResult 改为 AgentResult
├── pages/
│   ├── DashboardPage/
│   │   ├── workbenchTypes.ts            # [MODIFY] PlanStep 移除 skillId/action；WorkflowRunStep 移除 skillId
│   │   └── workbenchUtils.ts            # [NO CHANGE]
│   └── TeamDetailPage/
│       ├── index.tsx                    # [MODIFY] getSkillHandler → getAgentHandler；SkillResult → AgentResult；移除 skill 查找和 skillId 引用
│       └── workflow-canvas/
│           ├── StepNode.tsx             # [MODIFY] 移除 skillId prop；移除技能名称展示
│           ├── StepConfigPanel.tsx       # [MODIFY] 移除 skillId 选择器和技能参数面板（大幅简化）
│           ├── WorkflowCanvas.tsx        # [MODIFY] 移除 getSkillInfo()；StepNode 不再传 skillId
│           └── EdgePopover.tsx           # [MODIFY] 移除 skill 相关引用
├── utils/
│   └── backendClient.ts                 # [MODIFY] WorkflowStep 移除 skillId/params；WorkflowRunDB/CreateWorkflowRunRequest 移除 skillId；AssistantDB 移除 skills 字段；保留 callDifySkill 函数不变

backend/
├── workflow-executor.js                 # [MODIFY] executeStep 从按 skillId 分发改为按 agentId 分发；移除 SKILL_PROMPTS 映射；移除 params 解析逻辑；所有步骤统一走 cat-step-scripts
└── lib/cat-step-scripts/
    ├── _framework.js                    # [MODIFY] 移除 skillId 相关日志字段
    └── index.js                         # [MODIFY] 导出函数名从 runOfficialCatAigcStep 改为 runAgentStep；按 agentId 直接分发
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 在实施各步骤时，搜索确认所有引用了 skills/ 目录、skillId、Skill 类型的文件，确保清理完整不遗漏
- Expected outcome: 输出完整的待修改文件列表和具体引用行号，防止遗漏导致编译错误