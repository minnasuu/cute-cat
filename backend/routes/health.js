const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const storage = require('../lib/storage');

// 健康检查端点
router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 上传目录健康检查 —— 排查「重新部署后图片 404」:
// 返回 uploads 目录是否存在、是否为空、存储模式(local/s3)、卷挂载路径。
// 若 directoryExists=true 但 fileCount=0,多半是 CI 流程清了命名卷(docker-compose down -v / prune)。
router.get('/uploads', (req, res) => {
  const root = storage.UPLOAD_ROOT;
  let directoryExists = false;
  let fileCount = 0;
  let sample = [];
  try {
    directoryExists = fs.existsSync(root) && fs.statSync(root).isDirectory();
    if (directoryExists) {
      // 递归统计文件数(最多采样 5 个)
      const walk = (dir) => {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else {
            fileCount++;
            if (sample.length < 5) sample.push(full.replace(root, ''));
          }
        }
      };
      walk(root);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  res.json({
    status: 'ok',
    mode: storage.mode,
    uploadRoot: root,
    directoryExists,
    fileCount,
    sample,
    hint: directoryExists && fileCount === 0
      ? '上传目录存在但为空。CI 部署若执行了 docker-compose down -v 或 docker volume prune,命名卷数据会被清空。请检查 CI 脚本,避免清理命名卷(cucatopiacom_uploads)。'
      : undefined,
  });
});

module.exports = router;

