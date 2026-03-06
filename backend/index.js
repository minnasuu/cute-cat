require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/assistants', require('./routes/assistants'));
app.use('/api/workflows', require('./routes/workflows'));
app.use('/api/workflow-runs', require('./routes/workflowRuns'));
app.use('/api/dify', require('./routes/dify'));
app.use('/api/email', require('./routes/email'));
app.use('/api/auth', require('./routes/auth'));
app.use('/health', require('./routes/health'));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐱 Cute Cat backend running on port ${PORT}`);
});
