'use strict';

/**
 * community —— 作品交流社区。
 *
 *  GET  /api/community/posts?type=work|feedback|announcements&take=&skip=  分页 feed
 *  POST /api/community/posts                                               发布
 *    body: { type:work, title, content, images, refProductId }               作品(作者)
 *    body: { type:feedback, title, content }                                 反馈(登录用户)
 *    body: { type:announcement, title, content }                            官方通知(仅 admin)
 *  POST /api/community/products/:id/public   公开作品(作者,设 isPublic + 建 work post)
 *  POST /api/community/products/:id/unpublish 取消公开(作者,撤 isPublic + 删 work post)
 *  DELETE /api/community/posts/:id            删除(作者或 admin)
 *  POST /api/community/posts/:id/like         点赞 +1
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, getAccessTokenFromRequest, verifyToken } = require('../middleware/auth');
const { isAdminEmail } = require('../lib/admin');

const router = express.Router();
const prisma = new PrismaClient();

// ── 可选认证(公开 feed 允许未登录浏览) ──
function optionalAuth(req, res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    if (decoded.type === 'refresh') return next();
    req.userId = decoded.userId;
  } catch { /* ignore */ }
  next();
}

async function requireUser(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: '请先登录' });
  next();
}

async function getUserRole(userId) {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  return u || null;
}

function publicPost(p) {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    content: p.content,
    images: p.images,
    refProductId: p.refProductId,
    likes: p.likes,
    pinned: p.pinned,
    createdAt: p.createdAt,
    author: p.author,
  };
}

// ── feed ──
router.get('/posts', optionalAuth, async (req, res) => {
  try {
    const type = req.query.type || 'work';
    const take = Math.min(Number.parseInt(req.query.take, 10) || 30, 100);
    const skip = Number.parseInt(req.query.skip, 10) || 0;

    const where = {};
    if (['work', 'feedback', 'announcement'].includes(type)) where.type = type;

    const [items, total] = await Promise.all([
      prisma.communityPost.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
        include: { author: { select: { id: true, nickname: true } } },
      }),
      prisma.communityPost.count({ where }),
    ]);
    res.json({ items: items.map(publicPost), total, take, skip });
  } catch (err) {
    console.error('[community] feed error:', err);
    // 给前端展示具体原因(表不存在/字段错误等),方便排查;不影响用户时翻译成中文兜底
    const detail = err?.message || '未知错误';
    res.status(500).json({ error: '获取社区内容失败', detail });
  }
});

// ── 发布 ──
router.post('/posts', requireUser, async (req, res) => {
  try {
    const { type = 'feedback', title, content, images, refProductId } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: '请填写标题' });

    const role = await getUserRole(req.userId);

    if (type === 'announcement') {
      if (!role || (role.role !== 'admin' && !isAdminEmail(role.email))) {
        return res.status(403).json({ error: '仅管理员可发布官方通知' });
      }
    }

    if (type === 'work') {
      // 作品必须关联自己的 LAProduct
      if (!refProductId) return res.status(400).json({ error: '作品需要关联一个设计产品' });
      const product = await prisma.lAProduct.findFirst({ where: { id: refProductId, teamId: { not: undefined } } });
      if (!product) return res.status(404).json({ error: '关联的产品不存在' });
      // 验证产品属于当前用户的某个团队
      const owned = await prisma.lAProduct.findFirst({
        where: { id: refProductId },
        include: { team: { select: { ownerId: true } } },
      });
      if (!owned || !owned.team || owned.team.ownerId !== req.userId) {
        return res.status(403).json({ error: '只能公开自己的作品' });
      }
    }

    const imgs = Array.isArray(images) ? images : [];
    const post = await prisma.communityPost.create({
      data: {
        userId: req.userId,
        type,
        title: title.trim(),
        content: content?.trim() || null,
        images: imgs,
        refProductId: type === 'work' ? refProductId : null,
        pinned: type === 'announcement',
      },
      include: { author: { select: { id: true, nickname: true } } },
    });
    res.status(201).json(publicPost(post));
  } catch (err) {
    console.error('[community] create error:', err);
    res.status(500).json({ error: '发布失败' });
  }
});

// ── 公开/取消公开作品 ──
router.post('/products/:id/public', requireUser, async (req, res) => {
  try {
    const product = await prisma.lAProduct.findFirst({
      where: { id: req.params.id },
      include: { team: { select: { ownerId: true } } },
    });
    if (!product) return res.status(404).json({ error: '产品不存在' });
    if (!product.team || product.team.ownerId !== req.userId) return res.status(403).json({ error: '只能公开自己的作品' });

    await prisma.lAProduct.update({ where: { id: product.id }, data: { isPublic: true } });

    // 幂等:若已存在该产品的 work post 则不重复建
    const existing = await prisma.communityPost.findFirst({ where: { type: 'work', refProductId: product.id } });
    if (!existing) {
      const imgs = Array.isArray(product.images) ? product.images : [];
      await prisma.communityPost.create({
        data: {
          userId: req.userId,
          type: 'work',
          title: product.title,
          content: product.description,
          images: imgs,
          refProductId: product.id,
        },
      });
    }
    res.json({ success: true, isPublic: true });
  } catch (err) {
    console.error('[community] public error:', err);
    res.status(500).json({ error: '公开失败' });
  }
});

router.post('/products/:id/unpublish', requireUser, async (req, res) => {
  try {
    const product = await prisma.lAProduct.findFirst({
      where: { id: req.params.id },
      include: { team: { select: { ownerId: true } } },
    });
    if (!product) return res.status(404).json({ error: '产品不存在' });
    if (!product.team || product.team.ownerId !== req.userId) return res.status(403).json({ error: '只能操作自己的作品' });

    await prisma.lAProduct.update({ where: { id: product.id }, data: { isPublic: false } });
    await prisma.communityPost.deleteMany({ where: { type: 'work', refProductId: product.id } });
    res.json({ success: true, isPublic: false });
  } catch (err) {
    console.error('[community] unpublish error:', err);
    res.status(500).json({ error: '取消公开失败' });
  }
});

// ── 删除 ──
router.delete('/posts/:id', requireUser, async (req, res) => {
  try {
    const post = await prisma.communityPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: '不存在' });
    const role = await getUserRole(req.userId);
    const isAdmin = role && (role.role === 'admin' || isAdminEmail(role.email));
    if (post.userId !== req.userId && !isAdmin) return res.status(403).json({ error: '无权删除' });
    await prisma.communityPost.delete({ where: { id: post.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ── 点赞 ──
router.post('/posts/:id/like', requireUser, async (req, res) => {
  try {
    const post = await prisma.communityPost.update({
      where: { id: req.params.id },
      data: { likes: { increment: 1 } },
      select: { id: true, likes: true },
    });
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    res.status(404).json({ error: '不存在' });
  }
});

module.exports = router;
