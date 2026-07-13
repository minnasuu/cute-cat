#!/usr/bin/env node
/**
 * migrate-upload-paths.js —— 一次性迁移脚本
 *
 * 旧 bug:createLocalSavePath / createS3SavePath 把 folder 路径里的 '/' 也替换成 '-',
 *         导致「inspirations/teamId」被压扁成「inspirations-teamId」。
 *         修复后代码会生成正确的嵌套路径 inspirations/teamId/filename。
 *
 * 本脚本把 UPLOAD_ROOT 下所有 inspirations-XXXXXXXX-XXXX 形式的"压扁目录"
 * 迁移到嵌套路径 inspirations/XXXXXXXX-XXXX/...,
 * 使旧链接在新代码下仍然能访问到图片。
 *
 * 用法:
 *   node scripts/migrate-upload-paths.js          # 默认 DRY RUN(只预览,不实际操作)
 *   node scripts/migrate-upload-paths.js --exec   # 真正执行搬迁
 *
 * 安全机制:
 *   - 默认 dry-run,加 --exec 才真正 mv
 *   - 跳过 S3 模式(无本地文件)
 *   - 目标已存在时跳过
 *   - 迁移后删除空的原目录
 */
'use strict';

const fs = require('fs');
const path = require('path');
const storage = require('../lib/storage');

const EXEC = process.argv.includes('--exec');
const ROOT = storage.UPLOAD_ROOT;

// 匹配旧 bug 产生的目录名:inspirations-<uuid> / design-<uuid> / vibe-... 等
// 形如 "inspirations-dc4c1f99-ee7b-486f-93b3-cceb8ba7a589"(段名-UUID)
const FLAT_DIR_RE = /^([a-z]+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function mv(src, dst) {
  if (EXEC) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
  }
}

function walkAndMigrate(dir, depth = 0) {
  if (depth > 4) return; // 防止过深(正常结构 < 4 层)
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    const m = name.match(FLAT_DIR_RE);
    if (m && depth === 0) {
      // 发现压扁目录:重命名为嵌套路径(在同父目录下建段名子目录,把文件移入)
      const seg = m[1]; // e.g. "inspirations"
      const rest = m[2]; // e.g. "dc4c1f99-..."
      const srcDir = path.join(dir, name);
      const targetDir = path.join(dir, seg, rest);
      console.log(`[migrate] ${path.relative(ROOT, srcDir)}  →  ${path.relative(ROOT, targetDir)}`);
      let moved = 0;
      const files = fs.readdirSync(srcDir);
      for (const f of files) {
        const from = path.join(srcDir, f);
        if (!fs.statSync(from).isFile()) continue;
        const to = path.join(targetDir, f);
        if (fs.existsSync(to)) { console.log(`  skip(目标已存在): ${f}`); continue; }
        mv(from, to);
        moved++;
      }
      // 尝试删除原目录(空才删)
      if (EXEC) {
        const left = fs.readdirSync(srcDir);
        if (left.length === 0) fs.rmdirSync(srcDir);
        console.log(`  √ moved ${moved} file(s)${left.length === 0 ? ', removed old dir' : `, ${left.length} left`}`);
      }
    } else {
      walkAndMigrate(path.join(dir, name), depth + 1);
    }
  }
}

console.log(`\n=== upload path migrate ===`);
console.log(`mode: ${storage.mode}`);
console.log(`root: ${ROOT}`);
console.log(`exec: ${EXEC ? 'YES (moving files)' : 'DRY RUN (preview only, add --exec to move)'}\n`);

if (storage.mode === 's3') {
  console.log('S3 模式 — 本地无文件,跳过。S3 key 不动(旧 key 仍可用,新上传用新 key)。');
  process.exit(0);
}

if (!fs.existsSync(ROOT)) {
  console.log(`上传目录不存在(${ROOT}),跳过。`);
  process.exit(0);
}

walkAndMigrate(ROOT);

console.log(`\n${EXEC ? '✓ migration done' : 'dry-run complete(未实际移动)。确认无误后加 --exec 执行搬迁。'}`);
