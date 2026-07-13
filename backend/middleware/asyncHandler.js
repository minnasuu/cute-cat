'use strict';

/**
 * asyncHandler —— 把 async 路由 handler 包一层,让 rejected promise 自动 forward 到
 * Express 全局错误中间件(index.js 的 4 参数 error handler)。
 *
 * 没有它的话,async handler 内 throw / 未捕获的 rejected promise 会让请求挂起
 * (Express 4.x 不自动捕获),直到 TCP 超时才返回空响应,前端看到的是 0 bytes / ERR_EMPTY_RESPONSE。
 *
 * 用法:
 *   router.get('/things', asyncHandler(async (req, res) => {
 *     const data = await prisma.thing.findMany();
 *     res.json(data);
 *   }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { asyncHandler };
