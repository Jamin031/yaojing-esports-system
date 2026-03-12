const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { loadUserAccessByUsername, loadUserAccessById } = require('../utils/access');
const { normalizeUiPermissions } = require('../utils/permissionMatrix');

const JWT_EXPIRES_IN = String(process.env.JWT_EXPIRES_IN || '30d').trim() || '30d';
const JWT_EXPIRE_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000;

function buildToken(user) {
  return jwt.sign(
    {
      user_id: Number(user.id),
      role: user.role,
      store_id: user.store_id,
    },
    process.env.JWT_SECRET || 'yaojing-dev-secret',
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function resolveTokenExpiresAt(token) {
  const payload = jwt.decode(token);
  const expSeconds = Number(payload?.exp || 0);
  if (Number.isFinite(expSeconds) && expSeconds > 0) {
    return expSeconds * 1000;
  }
  return Date.now() + JWT_EXPIRE_FALLBACK_MS;
}

async function login(req, res) {
  const { username = '', password = '' } = req.body || {};

  const user = await loadUserAccessByUsername(String(username));

  if (!user) {
    return res.status(401).json({ success: false, data: null, message: '账号或密码错误' });
  }

  const rawPassword = String(password);
  let matched = false;

  if (String(user.password || '').startsWith('$2')) {
    matched = await bcrypt.compare(rawPassword, user.password);
  } else {
    matched = user.password === rawPassword;
  }

  if (!matched) {
    return res.status(401).json({ success: false, data: null, message: '账号或密码错误' });
  }

  const token = buildToken(user);
  const expiresAt = resolveTokenExpiresAt(token);

  return res.json({
    success: true,
    data: {
      token,
      expiresAt,
      userInfo: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roles: user.roles,
        store_id: user.store_id,
        permissions: normalizeUiPermissions(user.ui_permissions),
        menu_permissions: user.menu_permissions,
        page_permissions: user.page_permissions,
        button_permissions: user.button_permissions,
        field_permissions: user.field_permissions,
        scope_permissions: user.scope_permissions,
        api_permissions: user.permissions,
      },
    },
    message: 'login success',
  });
}

async function profile(req, res) {
  const user = await loadUserAccessById(req.user.id);
  return res.json({
    success: true,
    data: {
      userInfo: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        roles: user.roles,
        store_id: user.store_id,
        permissions: normalizeUiPermissions(user.ui_permissions),
        menu_permissions: user.menu_permissions,
        page_permissions: user.page_permissions,
        button_permissions: user.button_permissions,
        field_permissions: user.field_permissions,
        scope_permissions: user.scope_permissions,
        api_permissions: user.permissions,
      },
    },
    message: 'ok',
  });
}

module.exports = {
  login,
  profile,
};

