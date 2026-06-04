/**
 * 奖励待办 — 同步服务器 v2
 * 支持：多用户登录、主人模式、软删除、工时计时、分类标签
 *
 * API：
 *   POST /api/register           — 注册新用户
 *   POST /api/login              — 用户登录
 *   POST /api/master-login       — 主人登录（密码 888266）
 *   GET  /api/data               — 获取当前用户数据（需 token）
 *   POST /api/data               — 保存当前用户数据（需 token）
 *   GET  /api/admin/users        — 主人：列出所有用户
 *   GET  /api/admin/data/:user   — 主人：查看指定用户数据
 *   POST /api/ocr                — OCR 识别
 *   GET  /api/health             — 健康检查
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();
app.use(require('compression')());
const PORT = process.env.PORT || 3456;
const DATA_DIR = path.join(__dirname, 'data');
const MASTER_PASSWORD = process.env.MASTER_PASS || '888266';

// Ensure directories exist
[path.join(__dirname, 'data'), path.join(__dirname, 'uploads')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ---- Token Store (in-memory sessions) ----
const sessions = new Map(); // token -> { username, roomCode, role, expiresAt }

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setSession(username, roomCode, role) {
  const token = createToken();
  sessions.set(token, { username, roomCode, role, expiresAt: Date.now() + 24 * 3600 * 1000 });
  return token;
}

function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}

// Clean expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (now > v.expiresAt) sessions.delete(k);
}, 3600_000);

// ---- Password Hashing ----
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd).digest('hex');
}

// ---- Room File Helpers ----
function roomFile(roomCode) {
  const safe = roomCode.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 32);
  return path.join(DATA_DIR, `${safe}.json`);
}

function readRoom(roomCode) {
  const file = roomFile(roomCode);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeRoom(roomCode, data) {
  const file = roomFile(roomCode);
  data._updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function createRoom(roomCode) {
  return {
    roomCode,
    masterPassword: hashPassword(MASTER_PASSWORD),
    users: {},
    createdAt: new Date().toISOString()
  };
}

// ---- Auth Middleware ----
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ success: false, message: '请先登录' });
  const session = getSession(token);
  if (!session) return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  req.session = session;
  next();
}

function requireMaster(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ success: false, message: '请先登录' });
  const session = getSession(token);
  if (!session || session.role !== 'master') {
    return res.status(403).json({ success: false, message: '需要主人权限' });
  }
  req.session = session;
  next();
}

// ==================== Static Files ====================
// Serve the web app
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, fp) => {
    if (fp.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

// ==================== Auth APIs ====================

/**
 * POST /api/register
 * Body: { roomCode, username, password }
 */
app.post('/api/register', (req, res) => {
  try {
    const { roomCode, username, password } = req.body;
    if (!roomCode || !username || !password) {
      return res.status(400).json({ success: false, message: '房间码、用户名、密码不能为空' });
    }
    const safeUser = username.replace(/[^a-zA-Z0-9_一-龥]/g, '').slice(0, 20);
    if (!safeUser) return res.status(400).json({ success: false, message: '用户名格式不正确' });

    let room = readRoom(roomCode);
    if (!room) room = createRoom(roomCode);
    if (!room.users) room.users = {};

    if (room.users[safeUser]) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    room.users[safeUser] = {
      password: hashPassword(password),
      data: {
        tasks: [],
        deletedTasks: [],
        rewards: [
          { id: uid(), title: '看一部电影', cost: 50, icon: '🎬' },
          { id: uid(), title: '喝杯奶茶', cost: 30, icon: '🧋' },
          { id: uid(), title: '买一本新书', cost: 80, icon: '📚' },
        ],
        totalPoints: 0,
        lifetimePoints: 0,
        redeemedHistory: [],
        workSessions: []  // 工时记录
      },
      createdAt: new Date().toISOString()
    };

    writeRoom(roomCode, room);
    const token = setSession(safeUser, roomCode, 'user');
    res.json({ success: true, token, username: safeUser, roomCode, message: '注册成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '注册失败: ' + err.message });
  }
});

/**
 * POST /api/login
 * Body: { roomCode, username, password }
 */
app.post('/api/login', (req, res) => {
  try {
    const { roomCode, username, password } = req.body;
    const safeUser = username.replace(/[^a-zA-Z0-9_一-龥]/g, '').slice(0, 20);

    const room = readRoom(roomCode);
    if (!room || !room.users || !room.users[safeUser]) {
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    const user = room.users[safeUser];
    if (user.password !== hashPassword(password)) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    const token = setSession(safeUser, roomCode, 'user');
    res.json({ success: true, token, username: safeUser, roomCode, message: '登录成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '登录失败: ' + err.message });
  }
});

/**
 * POST /api/master-login
 * Body: { roomCode, masterPassword }
 */
app.post('/api/master-login', (req, res) => {
  try {
    const { roomCode, masterPassword } = req.body;
    if (masterPassword !== MASTER_PASSWORD) {
      return res.status(403).json({ success: false, message: '主人密码错误' });
    }

    let room = readRoom(roomCode);
    if (!room) {
      room = createRoom(roomCode);
      writeRoom(roomCode, room);
    }

    const token = setSession('__master__', roomCode, 'master');
    res.json({ success: true, token, username: '__master__', role: 'master', roomCode, message: '主人登录成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '登录失败: ' + err.message });
  }
});

// ==================== Data APIs (require auth) ====================

/**
 * GET /api/data — 获取当前用户的数据
 */
app.get('/api/data', requireAuth, (req, res) => {
  try {
    const { username, roomCode } = req.session;
    const room = readRoom(roomCode);
    if (!room || !room.users || !room.users[username]) {
      return res.status(404).json({ success: false, message: '用户数据不存在' });
    }
    const data = room.users[username].data;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/data — 保存当前用户的数据
 * Body: { data: { tasks, rewards, totalPoints, ... } }
 */
app.post('/api/data', requireAuth, (req, res) => {
  try {
    const { username, roomCode } = req.session;
    const { data: clientData } = req.body;
    if (!clientData || typeof clientData !== 'object') {
      return res.status(400).json({ success: false, message: '数据格式错误' });
    }

    let room = readRoom(roomCode);
    if (!room) room = createRoom(roomCode);
    if (!room.users) room.users = {};
    if (!room.users[username]) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // Merge: preserve deletedTasks, merge everything else
    const existing = room.users[username].data || {};
    room.users[username].data = {
      ...existing,
      ...clientData,
      // Preserve server-side deletedTasks if client sent none
      deletedTasks: clientData.deletedTasks || existing.deletedTasks || [],
      workSessions: clientData.workSessions || existing.workSessions || []
    };

    writeRoom(roomCode, room);
    res.json({ success: true, message: '同步成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '保存失败: ' + err.message });
  }
});

// ==================== Master Admin APIs ====================

/**
 * GET /api/admin/users — 主人查看房间所有用户列表
 */
app.get('/api/admin/users', requireMaster, (req, res) => {
  try {
    const { roomCode } = req.session;
    const room = readRoom(roomCode);
    if (!room) return res.json({ success: true, users: [] });

    const users = Object.entries(room.users || {}).map(([name, u]) => ({
      username: name,
      taskCount: (u.data?.tasks || []).length,
      deletedCount: (u.data?.deletedTasks || []).length,
      completedCount: (u.data?.tasks || []).filter(t => t.completed).length,
      totalPoints: u.data?.totalPoints || 0,
      createdAt: u.createdAt
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/data/:username — 主人查看指定用户的完整数据
 */
app.get('/api/admin/data/:username', requireMaster, (req, res) => {
  try {
    const { roomCode } = req.session;
    const username = req.params.username;
    const room = readRoom(roomCode);
    if (!room || !room.users || !room.users[username]) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    const data = room.users[username].data;
    res.json({ success: true, data, username });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== OCR Endpoint ====================
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片文件'));
  }
});

let _worker = null;
async function getWorker() {
  if (_worker) return _worker;
  _worker = await createWorker('chi_sim+eng');
  return _worker;
}

app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传图片' });
    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(req.file.path);
    fs.unlink(req.file.path, () => {});

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const tasks = lines.map(line => {
      let title = line.replace(/^[\s•\-*□○▷✓✅☐☑\d+\.\、]+/, '').trim();
      let deadlineHint = '', points = 10;
      const dm = title.match(/(\d{1,2}[月\/\-]\d{1,2}[日号]?|今天|明天|后天|周[一二三四五六日])/);
      if (dm) deadlineHint = dm[1];
      if (/[!！]/.test(title)) points = 20;
      return { title, deadlineHint, points };
    }).filter(t => t.title.length >= 2);

    res.json({ success: true, tasks, rawText: text });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: 'OCR失败: ' + err.message });
  }
});

// ==================== Health ====================
app.get('/api/health', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  let publicUrl = null;
  try {
    const urlFile = path.join(__dirname, 'public', 'tunnel-url.txt');
    if (fs.existsSync(urlFile)) publicUrl = fs.readFileSync(urlFile, 'utf-8').trim();
  } catch (e) { /* ignore */ }
  res.json({ status: 'ok', uptime: process.uptime(), sessions: sessions.size, publicUrl });
});

// ==================== Helpers ====================
function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏆 奖励待办同步服务器 v2 已启动: http://localhost:${PORT}`);
  console.log(`   数据目录: ${DATA_DIR}`);
  console.log(`   主人密码: ${MASTER_PASSWORD}`);
  console.log(`   API:`);
  console.log(`     POST /api/register         注册`);
  console.log(`     POST /api/login            登录`);
  console.log(`     POST /api/master-login     主人登录`);
  console.log(`     GET/POST /api/data         用户数据`);
  console.log(`     GET /api/admin/users       主人-用户列表`);
  console.log(`     GET /api/admin/data/:user  主人-用户数据`);
  console.log(`     POST /api/ocr              OCR识别`);
});
