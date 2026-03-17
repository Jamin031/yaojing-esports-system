require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { initSchema } = require('./utils/initSchema');
const { joinSocketRooms } = require('./services/adminRealtimeService');

const orderRoutes = require('./routes/orders');
const packageRoutes = require('./routes/packages');
const playerRoutes = require('./routes/players');
const authRoutes = require('./routes/auth');
const statsRoutes = require('./routes/stats');
const usersRoutes = require('./routes/users');
const storesRoutes = require('./routes/stores');
const playShopsRoutes = require('./routes/play_shops');
const onlineUsersRoutes = require('./routes/online_users');
const onlineOrdersRoutes = require('./routes/online_orders');
const logsRoutes = require('./routes/logs');
const permissionsRoutes = require('./routes/permissions');
const storeDataRoutes = require('./routes/store_data');
const notificationsRoutes = require('./routes/notifications');
const devicesRoutes = require('./routes/devices');

async function start() {
  await initSchema();

  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake?.auth?.token || '';
    if (!token) {
      next();
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'yaojing-dev-secret');
      socket.user = payload;
      next();
    } catch {
      next(new Error('Unauthorized socket'));
    }
  });

  io.on('connection', (socket) => {
    joinSocketRooms(socket);
  });

  app.set('io', io);

  app.use(express.json());
  app.use(cors());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    if (req.url === '/api/api' || req.url.startsWith('/api/api/')) {
      req.url = req.url.replace(/^\/api\/api/, '/api');
    }
    next();
  });

  app.use('/api/orders', orderRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/stores', storesRoutes);
  app.use('/api/play-shops', playShopsRoutes);
  app.use('/api/play_shops', playShopsRoutes);
  app.use('/api/play-stores', playShopsRoutes);
  app.use('/api/online-orders', onlineOrdersRoutes);
  app.use('/api/online-users', onlineUsersRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/operation-logs', logsRoutes);
  app.use('/api/store-data', storeDataRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/devices', devicesRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok' }, message: 'ok' });
  });

  app.get('/', (req, res) => {
    res.json({ success: true, data: { status: 'ok' }, message: '曜竞 ESPORTS CLUB 后端运行正常' });
  });

  app.use((req, res) => {
    const requestPath = `${req.method} ${req.originalUrl}`;
    const duplicatedApiPrefix = req.originalUrl === '/api/api' || req.originalUrl.startsWith('/api/api/');

    res.status(404).json({
      success: false,
      data: {
        method: req.method,
        path: req.originalUrl,
        duplicated_api_prefix: duplicatedApiPrefix,
      },
      message: duplicatedApiPrefix
        ? `API endpoint not found (detected duplicate /api prefix): ${requestPath}`
        : `API endpoint not found: ${requestPath}`,
    });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({
      success: false,
      data: null,
      message: error?.message || 'Internal server error',
    });
  });

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Routes registered successfully');
  });
}

start().catch((error) => {
  console.error('Server start failed:', error.message);
  process.exit(1);
});
