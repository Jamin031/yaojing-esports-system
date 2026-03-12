const jwt = require('jsonwebtoken');
const { loadUserAccessById } = require('../utils/access');

async function resolveUserFromHeader(authHeader) {
  const header = authHeader || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return { user: null, error: 'token_missing' };
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'yaojing-dev-secret');
    const user = await loadUserAccessById(payload.user_id);
    if (!user) {
      return { user: null, error: 'user_not_found' };
    }
    return { user, error: '' };
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return { user: null, error: 'token_expired' };
    }
    return { user: null, error: 'token_invalid' };
  }
}

async function requireAuth(req, res, next) {
  const { user, error } = await resolveUserFromHeader(req.headers.authorization || '');

  if (!user) {
    return res.status(401).json({
      success: false,
      code: error || 'unauthorized',
      data: null,
      message: 'Unauthorized',
    });
  }

  req.user = user;
  next();
}

async function optionalAuth(req, res, next) {
  const { user } = await resolveUserFromHeader(req.headers.authorization || '');
  if (user) {
    req.user = user;
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  resolveUserFromHeader,
};
