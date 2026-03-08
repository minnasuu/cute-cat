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

  // 系统指令（JSON schema、技能参考等）已在后端 system prompt 中
  // 前端只发送用户需求 + 猫猫数据
  const prompt = `## 用户需求
${aiPrompt}

## 可用猫猫团队
${catInfo}`;

  // 优先使用千问，失败后回退 gemini
  const models = ['qwen', 'gemini'];
  let lastError = '';

  for (const model of models) {
    try {
      console.log(`[ai-workflow-gen] trying model: ${model}`);
      const response = await callDifySkill('workflow-gen', prompt, model);

      if (response.error) {
        console.warn(`[ai-workflow-gen] ${model} failed:`, response.error);
        lastError = response.error;
        continue; // 尝试下一个模型
      }

      const answer = response.answer || '';
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`[ai-workflow-gen] ${model} returned non-JSON, trying next`);
        lastError = 'AI 返回格式异常';
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.suggestionMode) {
        showToast('当前团队能力不足，已为您生成补充建议', 'warning');
      } else {
        showToast(`AI 工作流生成成功 (${model})`, 'success');
      }

      return parsed as AiGenerateResult;
    } catch (err: any) {
      console.warn(`[ai-workflow-gen] ${model} error:`, err);
      lastError = err.message || String(err);
      continue; // 尝试下一个模型
    }
  }

  // 所有模型都失败
  showToast(`AI 生成失败: ${lastError}`, 'warning');
  return null;
}
