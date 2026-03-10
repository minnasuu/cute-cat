import type { SkillHandler, SkillContext, SkillResult } from './types';
import { executePrimitive } from './primitives';

interface TodoItem {
  category: string;
  title: string;
  description: string;
}

/** 从 AI 返回的 JSON 中解析任务列表，限制 0-5 个 */
function parseAITodos(data: unknown): TodoItem[] {
  try {
    let items: unknown[];

    if (typeof data === 'string') {
      // 去掉可能的 markdown 代码块包裹
      let json = data.trim();
      const codeBlockMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        json = codeBlockMatch[1].trim();
      }
      items = JSON.parse(json);
    } else if (Array.isArray(data)) {
      items = data;
    } else if (data && typeof data === 'object' && 'result' in (data as Record<string, unknown>)) {
      const result = (data as Record<string, unknown>).result;
      if (Array.isArray(result)) {
        items = result;
      } else if (typeof result === 'string') {
        items = JSON.parse(result);
      } else {
        return [];
      }
    } else {
      return [];
    }

    if (!Array.isArray(items)) return [];

    // 过滤有效条目并限制 5 个
    const validCategories = ['文章', 'Crafts', '功能扩展'];
    return items
      .filter(
        (item: any) =>
          item &&
          typeof item.title === 'string' &&
          item.title.trim() &&
          typeof item.category === 'string' &&
          validCategories.includes(item.category)
      )
      .slice(0, 5)
      .map((item: any) => ({
        category: item.category,
        title: item.title.trim(),
        description: (item.description || item.title).trim(),
      }));
  } catch {
    console.warn('[assign-task] Failed to parse AI response as JSON');
    return [];
  }
}

/** 从上游 input 构建发送给 AI 的文本 */
function buildPromptText(input: unknown): string {
  if (!input) return '';

  if (typeof input === 'string') return input;

  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    const parts: string[] = [];

    if (obj.todos && typeof obj.todos === 'string') {
      parts.push(`代办清单：\n${obj.todos}`);
    }
    if (obj.analysis && typeof obj.analysis === 'string') {
      parts.push(`网站诊断：\n${obj.analysis}`);
    }
    if (obj.summary && typeof obj.summary === 'string') {
      parts.push(`产出统计：\n${obj.summary}`);
    }

    if (parts.length > 0) return parts.join('\n\n');

    // fallback: 序列化整个对象
    return JSON.stringify(obj, null, 2);
  }

  return '';
}

/** 根据分类决定负责的猫猫和 skill */
function getAgentForCategory(category: string): { agentId: string; skillId: string } {
  switch (category) {
    case '文章':
      return { agentId: 'writer', skillId: 'generate-article' };
    case 'Crafts':
      return { agentId: 'engineer', skillId: 'update-crafts' };
    case '功能扩展':
      return { agentId: 'manager', skillId: 'manage-workflow' };
    default:
      return { agentId: 'manager', skillId: 'manage-workflow' };
  }
}

const CATEGORY_ICONS: Record<string, string> = {
  '文章': '📝',
  'Crafts': '🎨',
  '功能扩展': '🔧',
  '其他': '📌',
};

/** 📌 任务分配 — 花椒（AI 辅助拆解）
 *  基于原型: structured-output (AI 拆解) + workflow-engine (创建工作流)
 */
const assignTask: SkillHandler = {
  id: 'assign-task',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[assign-task] agent=${ctx.agentId} @${ctx.timestamp}`);

    try {
      // 构建发给 AI 的文本
      const promptText = buildPromptText(ctx.input);

      if (!promptText) {
        return {
          success: true,
          data: { workflows: [], message: '上游无内容可供分析' },
          summary: '上游未产出可执行的任务条目，跳过分配',
          status: 'warning',
        };
      }

      // 1. 通过 structured-output 原型调用 AI 提取任务
      const aiCtx: typeof ctx = { ...ctx, input: promptText };
      const aiResult = await executePrimitive('structured-output', aiCtx, {
        systemPrompt: '你是一位项目经理猫猫。请分析以下内容，拆解出可执行的任务列表。每个任务必须包含 category（文章/Crafts/功能扩展）、title、description 字段。输出纯 JSON 数组，不要包含其他文字。最多 5 项。',
        difySkillId: 'assign-task',
        schema: '[{ "category": "文章|Crafts|功能扩展", "title": "string", "description": "string" }]',
      });

      if (!aiResult.success) {
        return {
          success: false,
          data: { error: aiResult.summary },
          summary: `AI 任务拆解失败: ${aiResult.summary}`,
          status: 'error',
        };
      }

      const aiData = aiResult.data as Record<string, unknown>;
      const todos = parseAITodos(aiData.result ?? aiResult.summary);

      if (todos.length === 0) {
        return {
          success: true,
          data: { workflows: [], message: 'AI 判断当前无需分配任务' },
          summary: 'AI 分析后认为当前无明确可执行任务，跳过分配',
          status: 'warning',
        };
      }

      // 2. 通过 workflow-engine 原型为每个任务创建工作流
      const created: { name: string; id: string; category: string }[] = [];
      const failed: { name: string; error: string }[] = [];

      for (const todo of todos) {
        const { agentId, skillId } = getAgentForCategory(todo.category);

        const workflowInput = {
          name: todo.title,
          description: `[${todo.category}] ${todo.description}`,
          steps: [
            {
              agentId,
              skillId,
              action: todo.description,
            },
          ],
          scheduled: false,
          scheduledEnabled: false,
          persistent: false,
        };

        const wfCtx: typeof ctx = { ...ctx, input: workflowInput };

        try {
          const wfResult = await executePrimitive('workflow-engine', wfCtx, {
            action: 'create',
            teamId: 'default',
          });

          if (wfResult.success && wfResult.data) {
            const data = wfResult.data as Record<string, unknown>;
            created.push({ name: todo.title, id: (data.id as string) || '', category: todo.category });
          } else {
            failed.push({ name: todo.title, error: wfResult.summary });
          }
        } catch (err) {
          failed.push({ name: todo.title, error: String(err) });
        }
      }

      // 生成摘要
      const parts: string[] = [];
      parts.push(`📌 AI 任务分配完成：共 ${todos.length} 项，成功 ${created.length} 项`);
      if (created.length > 0) {
        parts.push('');
        const grouped = created.reduce(
          (acc, c) => {
            (acc[c.category] = acc[c.category] || []).push(c.name);
            return acc;
          },
          {} as Record<string, string[]>
        );
        for (const [cat, names] of Object.entries(grouped)) {
          const icon = CATEGORY_ICONS[cat] || '📌';
          parts.push(`${icon} ${cat}：${names.join('、')}`);
        }
      }
      if (failed.length > 0) {
        parts.push('');
        parts.push(`⚠️ 失败 ${failed.length} 项：${failed.map((f) => f.name).join('、')}`);
      }

      return {
        success: failed.length === 0,
        data: { created, failed, conversationId: aiData.conversationId },
        summary: parts.join('\n'),
        status: failed.length === 0 ? 'success' : 'warning',
      };
    } catch (err) {
      return {
        success: false,
        data: { error: String(err) },
        summary: `任务分配异常: ${String(err)}`,
        status: 'error',
      };
    }
  },
};

export default assignTask;
