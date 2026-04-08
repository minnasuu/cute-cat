require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// ======================== 全局异常兜底（防止进程崩溃导致 502）========================
process.on('uncaughtException', (err) => {
  console.error('🔥 [FATAL] uncaughtException:', err);
  // 不退出进程 —— 让容器保持运行，避免 nginx 502
});
process.on('unhandledRejection', (reason) => {
  console.error('🔥 [FATAL] unhandledRejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 8002;

const rawOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const defaultDevOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost',
  'http://127.0.0.1',
];
const allowedOrigins = rawOrigins.length > 0 ? rawOrigins : defaultDevOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// V2.0 Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/cats', require('./routes/cats'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/dify', require('./routes/dify'));
app.use('/api/email', require('./routes/email'));
app.use('/health', require('./routes/health'));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
  });
}

// ======================== 全局错误中间件（兜底所有路由未捕获的异常）========================
app.use((err, req, res, _next) => {
  console.error('🔥 [EXPRESS] Unhandled error on', req.method, req.originalUrl, ':', err);
  if (!res.headersSent) {
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐱 CuCaTopia V2.0 backend running on port ${PORT}`);

  // 启动定时工作流调度器
  const { startScheduler } = require('./scheduler');
  startScheduler();
});
