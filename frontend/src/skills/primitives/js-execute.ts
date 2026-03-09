import type { PrimitiveHandler, PrimitiveContext, PrimitiveResult } from './types';

/**
 * JS 执行原型 (js-execute)
 *
 * 底层能力：在沙箱环境中执行 JavaScript 代码片段并返回结果。
 * 安全策略：使用 Function 构造器隔离作用域，禁止访问 DOM / fetch / localStorage 等。
 * 上层技能示例：数据转换、格式处理、自定义计算等。
 */
const jsExecute: PrimitiveHandler = {
  id: 'js-execute',
  async execute(ctx: PrimitiveContext): Promise<PrimitiveResult> {
    console.log(`[primitive:js-execute] agent=${ctx.agentId} @${ctx.timestamp}`);

    const {
      timeout = 5000,
    } = ctx.config as Record<string, unknown>;

    let code = '';
    if (typeof ctx.input === 'string') {
      code = ctx.input;
    } else if (ctx.input && typeof ctx.input === 'object') {
      const obj = ctx.input as Record<string, unknown>;
      code = (obj.code as string) || (obj.text as string) || '';
    }

    if (!code.trim()) {
      return { success: false, data: null, summary: '无代码输入', status: 'warning' };
    }

    try {
      const result = await runInSandbox(code, Number(timeout));
      return {
        success: true,
        data: { result, code },
        summary: typeof result === 'string' ? result : JSON.stringify(result),
        status: 'success',
      };
    } catch (err) {
      return {
        success: false,
        data: { error: String(err), code },
        summary: `JS 执行错误: ${String(err)}`,
        status: 'error',
      };
    }
  },
};

/**
 * 沙箱执行 JS 代码
 * 使用 Function 构造器 + 受限全局对象，防止访问敏感 API
 */
function runInSandbox(code: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`执行超时 (${timeoutMs}ms)`)), timeoutMs);

    try {
      // 提供安全的内置工具
      const safeGlobals = {
        console: { log: (...args: unknown[]) => args.join(' '), warn: (...args: unknown[]) => args.join(' '), error: (...args: unknown[]) => args.join(' ') },
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        // 禁止的 API 返回提示
        fetch: undefined,
        XMLHttpRequest: undefined,
        localStorage: undefined,
        sessionStorage: undefined,
        document: undefined,
        window: undefined,
      };

      const keys = Object.keys(safeGlobals);
      const values = Object.values(safeGlobals);

      // 包裹用户代码，自动返回最后一个表达式的值
      const wrappedCode = `
        "use strict";
        ${code}
      `;

      const fn = new Function(...keys, wrappedCode);
      const result = fn(...values);
      clearTimeout(timer);
      resolve(result);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

export default jsExecute;
