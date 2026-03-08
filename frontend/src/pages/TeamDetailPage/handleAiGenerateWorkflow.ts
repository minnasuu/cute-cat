import { callDifySkill } from '../../utils/backendClient';
import { showToast } from '../../components/Toast';
import type { WorkflowStep } from '../../data/types';

export interface TeamCat {
  id: string;
  name: string;
  role: string;
  skills: { id: string; name: string; [key: string]: any }[];
}

/** AI 建议添加的猫猫 */
export interface SuggestedCat {
  role: string;
  reason: string;
  suggestedSkills: string[];
}

/** AI 建议添加的技能（给已有猫猫） */
export interface SuggestedSkill {
  agentId: string;
  agentName: string;
  skillId: string;
  skillName: string;
  reason: string;
}

export interface AiGenerateResult {
  name?: string;
  icon?: string;
  description?: string;
  steps?: WorkflowStep[];
  scheduled?: boolean;
  cron?: string;
  startTime?: string;
  endTime?: string;
  persistent?: boolean;
  /** 当团队能力不足时，是否处于建议模式 */
  suggestionMode?: boolean;
  /** 建议添加的新猫猫 */
  suggestedCats?: SuggestedCat[];
  /** 建议给已有猫猫添加的技能 */
  suggestedSkills?: SuggestedSkill[];
  /** 建议模式下的说明文字 */
  suggestionSummary?: string;
}

/**
 * 调用 AI 接口生成工作流配置
 * @param aiPrompt 用户输入的需求描述
 * @param cats 当前团队的猫猫列表（含 id/name/role/skills）
 * @returns 解析后的工作流配置，失败返回 null
 */
export async function aiGenerateWorkflow(
  aiPrompt: string,
  cats: TeamCat[],
): Promise<AiGenerateResult | null> {
  if (!aiPrompt.trim()) return null;

  const hasCats = cats.length > 0;
  const catInfo = hasCats
    ? cats
        .map(
          (c) =>
            `- id: "${c.id}", name: "${c.name}", role: "${c.role}", skills: [${c.skills.map((s) => `{id:"${s.id}",name:"${s.name}"}`).join(', ')}]`,
        )
        .join('\n')
    : '（当前团队暂无猫猫）';

  const prompt = `你是一个工作流编排助手。请根据用户需求，基于可用猫猫团队生成一个完整的工作流配置。

## 用户需求
${aiPrompt}

## 可用猫猫团队
${catInfo}

## 重要：能力评估
在生成工作流之前，请先判断当前团队的猫猫和技能是否能完全覆盖用户需求。

如果**完全能覆盖**，请按正常模式输出工作流 JSON，设置 "suggestionMode": false。

如果**不能完全覆盖**（缺少某些角色的猫猫，或已有猫猫缺少某些必要技能），请：
1. 设置 "suggestionMode": true
2. 在 "suggestedCats" 中列出需要新增的猫猫角色
3. 在 "suggestedSkills" 中列出需要给已有猫猫添加的技能
4. 在 "suggestionSummary" 中用一句话概括缺什么
5. 仍然尽量生成一个工作流（用已有猫猫能覆盖的步骤），不能覆盖的步骤留空 agentId

## 输出要求
请严格输出以下 JSON 格式（不要包含任何其他文字）：
{
  "suggestionMode": false,
  "suggestionSummary": "",
  "suggestedCats": [
    {
      "role": "建议角色名（如 Data Analyst / Content Editor / Visual Designer / QA Reviewer / Operations Assistant / Project Manager / Engineer）",
      "reason": "为什么需要这个角色",
      "suggestedSkills": ["建议技能id列表"]
    }
  ],
  "suggestedSkills": [
    {
      "agentId": "已有猫猫id",
      "agentName": "猫猫名字",
      "skillId": "建议添加的技能id",
      "skillName": "技能名称",
      "reason": "为什么需要这个技能"
    }
  ],
  "name": "工作流名称",
  "icon": "一个 emoji 图标",
  "description": "工作流描述，用 → 连接步骤简述",
  "scheduled": false,
  "cron": "",
  "startTime": "",
  "endTime": "",
  "persistent": false,
  "steps": [
    {
      "agentId": "猫猫id（无匹配则留空字符串）",
      "skillId": "技能id（无匹配则留空字符串）",
      "action": "具体行为描述（含输入输出说明）",
      "inputFrom": "上一步的agentId（第一步不需要）",
      "params": [
        {
          "key": "参数key",
          "label": "显示标签",
          "type": "text|textarea|number|select|tags|toggle|url",
          "placeholder": "占位提示",
          "required": true/false,
          "description": "参数说明"
        }
      ]
    }
  ]
}

## 可用技能 ID 参考
内容创作: generate-article, polish-text, generate-outline, news-to-article, meeting-notes
数据分析: crawl-news, summarize-news, query-dashboard, trend-analysis, site-analyze
视觉设计: generate-image, generate-chart, generate-component, layout-design, image-enhance, css-generate, update-crafts
沟通运营: send-email, send-notification, task-log
开发运维: fix-bug, develop-feature, optimize-perf, quality-check, content-review, regression-test
项目管理: generate-todo, assign-task, review-approve, manage-workflow, run-workflow, recruit-cat

## 角色与技能组对应
Project Manager: generate-todo, assign-task, review-approve, manage-workflow, run-workflow, recruit-cat
Content Editor: generate-article, polish-text, generate-outline, news-to-article, meeting-notes
Data Analyst: crawl-news, summarize-news, query-dashboard, trend-analysis, site-analyze
Visual Designer: generate-image, generate-chart, generate-component, layout-design, image-enhance, css-generate
QA Reviewer: quality-check, content-review, regression-test
Operations Assistant: send-email, send-notification, task-log
Engineer: fix-bug, develop-feature, optimize-perf, update-crafts

注意：
1. agentId 和 skillId 在正常模式下必须来自可用猫猫列表中的真实 id
2. 每个步骤的 params 是该步骤需要用户配置的参数，如果不需要则为空数组
3. 如果需求涉及定时任务，设置 scheduled=true 并填写 cron、startTime、endTime
4. inputFrom 表示该步骤的输入数据来自哪个猫猫（填 agentId），第一步不需要
5. suggestedCats 中的 role 必须是上面角色列表中的有效角色名
6. suggestedSkills 中的 skillId 必须是上面技能 ID 参考中的有效 id`;

  try {
    const response = await callDifySkill('workflow-gen', prompt);

    if (response.error) {
      showToast(`AI 生成失败: ${response.error}`, 'warning');
      return null;
    }

    const answer = response.answer || '';
    const jsonMatch = answer.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      showToast('AI 返回格式异常，请重试', 'warning');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.suggestionMode) {
      showToast('当前团队能力不足，已为您生成补充建议', 'warning');
    } else {
      showToast('AI 工作流生成成功', 'success');
    }

    return parsed as AiGenerateResult;
  } catch (err: any) {
    console.error('[ai-workflow-gen]', err);
    showToast('AI 生成出错，请重试', 'warning');
    return null;
  }
}
