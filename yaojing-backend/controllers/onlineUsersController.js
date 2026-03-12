const { query } = require('../config/db');

async function listOnlineUsers(req, res) {
  const { store_id, status } = req.query;
  const params = {};
  let where = 'ou.is_deleted = 0';

  if (store_id) {
    where += ' AND ou.store_id = :store_id';
    params.store_id = Number(store_id);
  }

  if (status) {
    where += ' AND ou.status = :status';
    params.status = String(status);
  }

  const rows = await query(
    `SELECT
      ou.id,
      ou.store_id,
      s.name AS store_name,
      ou.nickname,
      ou.game_name,
      ou.status,
      ou.last_seen_at,
      ou.created_at
    FROM online_users ou
    LEFT JOIN stores s ON s.id = ou.store_id
    WHERE ${where}
    ORDER BY ou.last_seen_at DESC`,
    params
  );

  const onlineCount = rows.filter((item) => item.status === 'online').length;

  return res.json({
    success: true,
    data: {
      list: rows,
      total: rows.length,
      online_count: onlineCount,
    },
  });
}

module.exports = {
  listOnlineUsers,
};
