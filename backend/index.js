require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8002;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// V2.0 Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/cats', require('./routes/cats'));
app.use('/api/workflows', require('./routes/workflows'));
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐱 Cute Cat V2.0 backend running on port ${PORT}`);

  // 启动定时工作流调度器
  const { startScheduler } = require('./scheduler');
  startScheduler();
});
