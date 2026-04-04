/**
 * 官方猫 AIGC（skillId: aigc）按 templateId 分发；各猫脚本见同目录下对应文件。
 */
import type { SkillContext, SkillResult } from '../types';
import { OFFICIAL_TEMPLATE_ID_SET } from './official-template-ids';
import { runPlaceholder } from './_framework';

import runProductArchitect from './product-architect';
import runUxDesigner from './ux-designer';
import runVisualDesigner from './visual-designer';
import runFrontendEngineer from './frontend-engineer';

type CatRunner = (ctx: SkillContext) => Promise<SkillResult>;

const HANDLERS: Record<string, CatRunner> = {
  'product-architect': runProductArchitect,
  'ux-designer': runUxDesigner,
  'visual-designer': runVisualDesigner,
  'frontend-engineer': runFrontendEngineer,
};

function resolveTemplateId(ctx: SkillContext): string {
  const fromCtx = ctx.catTemplateId?.trim();
  if (fromCtx) return fromCtx;
  if (OFFICIAL_TEMPLATE_ID_SET.has(ctx.agentId)) return ctx.agentId;
  return '';
}

/** 无 templateId 且 agentId 非官方模板：沿用原「长文案」占位，避免团队自定义猫断档 */
function legacyAigcPlaceholder(ctx: SkillContext): Promise<SkillResult> {
  const role = ctx.catRole?.trim() || '协作猫';
  const input = ctx.input as Record<string, unknown> | undefined;
  const action = input && typeof input === 'object' ? String(input._action || '') : '';
  let upstreamHint = '';
  if (input && typeof input === 'object') {
    if (input.text) upstreamHint = String(input.text).slice(0, 500);
    else if (input.summary) upstreamHint = String(input.summary).slice(0, 500);
  }
  const text =
    `【AIGC 占位】岗位：「${role}」\n\n` +
    '后续将在此统一接入生成式能力（文案、图像等）。当前不调用外部模型，仅用于联调工作流链路。\n\n' +
    (action ? `任务：${action}\n\n` : '') +
    (upstreamHint ? `上游参考：${upstreamHint}${upstreamHint.length >= 500 ? '…' : ''}` : '');
  return Promise.resolve({
    success: true,
    data: { text },
    summary: 'AIGC 占位完成（未调用生成模型）',
    status: 'success',
  });
}

export async function runOfficialCatAigcStep(ctx: SkillContext): Promise<SkillResult> {
  const tid = resolveTemplateId(ctx);
  if (!tid) return legacyAigcPlaceholder(ctx);
  const run = HANDLERS[tid] ?? ((c: SkillContext) => runPlaceholder(tid || 'unknown-cat', c));
  return run(ctx);
}

export { OFFICIAL_TEMPLATE_IDS, OFFICIAL_TEMPLATE_ID_SET } from './official-template-ids';
export { runPlaceholder } from './_framework';
