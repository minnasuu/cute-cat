/**
 * 技能原型注册表
 *
 * 原型是底层能力引擎，不对用户暴露。
 * 技能层通过 executePrimitive() 调用原型，附带预设配置。
 */
import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
import type { PrimitiveId } from '../../data/types';
import type { SkillContext } from '../types';

import textToText from './text-to-text';
import textToImage from './text-to-image';
import structuredOutput from './structured-output';
import apiCall from './api-call';
import dbQuery from './db-query';
import emailSend from './email-send';
import webPush from './web-push';
import htmlRender from './html-render';
import chartRender from './chart-render';
import browserAction from './browser-action';
import fileIo from './file-io';
import workflowEngine from './workflow-engine';

const primitiveHandlers: PrimitiveHandler[] = [
  textToText,
  textToImage,
  structuredOutput,
  apiCall,
  dbQuery,
  emailSend,
  webPush,
  htmlRender,
  chartRender,
  browserAction,
  fileIo,
  workflowEngine,
];

const registry = new Map<PrimitiveId, PrimitiveHandler>(
  primitiveHandlers.map((h) => [h.id, h])
);

/**
 * 根据原型 ID 执行原型
 * 这是技能层调用原型的唯一入口
 */
export async function executePrimitive(
  primitiveId: PrimitiveId,
  skillCtx: SkillContext,
  config: Record<string, unknown> = {},
): Promise<PrimitiveResult> {
  const handler = registry.get(primitiveId);
  if (!handler) {
    return {
      success: false,
      data: null,
      summary: `未知原型: ${primitiveId}`,
      status: 'error',
    };
  }

  const primitiveCtx: PrimitiveContext = {
    agentId: skillCtx.agentId,
    input: skillCtx.input,
    config,
    timestamp: skillCtx.timestamp,
  };

  return handler.execute(primitiveCtx);
}

export type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';
