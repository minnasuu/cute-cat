import type { SkillHandler, SkillContext, SkillResult } from './types';

const API = 'https://suminhan.cn';

/** 🛠️ 新增 Craft — 管理员私有
 *  创建新的 Craft 组件
 */
const createCraft: SkillHandler = {
  id: 'create-craft',
  async execute(ctx: SkillContext): Promise<SkillResult> {
    console.log(`[create-craft] agent=${ctx.agentId} @${ctx.timestamp}`);

    let name = '';
    let description = '';
    let category = 'component';
    let technologies: string[] = [];
    let htmlCode = '';
    let configSchema: unknown[] = [];

    const input = ctx.input as Record<string, unknown> | undefined;
    if (input && typeof input === 'object') {
      const params = (input._params || input) as Record<string, unknown>;
      name = String(params.name || '');
      description = String(params.description || '');
      category = String(params.category || 'component');
      htmlCode = String(params.htmlCode || '');

      const rawTech = params.technologies;
      if (Array.isArray(rawTech)) {
        technologies = rawTech.map(String).filter(Boolean);
      } else if (typeof rawTech === 'string' && rawTech.trim()) {
        technologies = rawTech.split(/[,，\s]+/).filter(Boolean);
      }

      if (Array.isArray(params.configSchema)) {
        configSchema = params.configSchema;
      }
    }

    if (!name || !htmlCode) {
      return {
        success: false,
        data: null,
        summary: '名称和 HTML 代码为必填项',
        status: 'error',
      };
    }

    try {
      const res = await fetch(`${API}/api/crafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, category, technologies, htmlCode, configSchema }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      return {
        success: true,
        data,
        summary: `Craft「${name}」创建成功`,
        status: 'success',
      };
    } catch (err: any) {
      return {
        success: false,
        data: null,
        summary: `新增 Craft 失败: ${err.message}`,
        status: 'error',
      };
    }
  },
};

export default createCraft;
