const { query } = require('../config/db');
const { hasAnyRole, hasPagePermission, hasButtonPermission } = require('../middleware/permissions');
const { ok, fail } = require('../utils/http');
const { writeOperationLog } = require('../utils/operationLog');

function canManagePlayShops(user) {
  return (
    hasAnyRole(user, ['super_admin', 'admin']) &&
    hasPagePermission(user, 'play_stores:view') &&
    hasButtonPermission(user, 'play_store:manage')
  );
}

async function listPlayShops(req, res) {
  if (!hasPagePermission(req.user, 'play_stores:view')) {
    return fail(res, 'Forbidden', 403);
  }

  const rows = await query(
    `SELECT id, name, commission_rate, created_at, updated_at
     FROM play_shops
     WHERE is_deleted = 0
     ORDER BY id DESC`
  );

  return ok(res, { list: rows, total: rows.length }, 'play shops fetched');
}

async function createPlayShop(req, res) {
  if (!canManagePlayShops(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const { name, commission_rate } = req.body || {};
  if (!name) {
    return fail(res, 'Name is required', 400);
  }

  await query(
    `INSERT INTO play_shops (name, commission_rate)
     VALUES (:name, :commission_rate)`,
    {
      name: String(name),
      commission_rate: Number(commission_rate ?? 0.9),
    }
  );

  const rows = await query(
    `SELECT id, name, commission_rate
     FROM play_shops
     WHERE name = :name
     ORDER BY id DESC
     LIMIT 1`,
    { name: String(name) }
  );
  const row = rows[0] || null;

  await writeOperationLog(req, {
    action: 'play_shops.create',
    detail: `新增陪玩店：${name}`,
    target_type: 'play_shop',
    target_id: row?.id || null,
    after: row,
  });

  return ok(res, row, 'play shop created');
}

async function updatePlayShop(req, res) {
  if (!canManagePlayShops(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const { name, commission_rate } = req.body || {};

  const beforeRows = await query(
    `SELECT id, name, commission_rate
     FROM play_shops
     WHERE id = :id AND is_deleted = 0
     LIMIT 1`,
    { id }
  );
  if (!beforeRows.length) {
    return fail(res, 'Play shop not found', 404);
  }
  const before = beforeRows[0];

  await query(
    `UPDATE play_shops
     SET name = COALESCE(:name, name),
         commission_rate = COALESCE(:commission_rate, commission_rate),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND is_deleted = 0`,
    {
      id,
      name: typeof name === 'undefined' ? null : String(name),
      commission_rate: typeof commission_rate === 'undefined' ? null : Number(commission_rate),
    }
  );

  const afterRows = await query(
    `SELECT id, name, commission_rate
     FROM play_shops
     WHERE id = :id
     LIMIT 1`,
    { id }
  );
  const after = afterRows[0] || null;
  const commissionChanged = Number(before.commission_rate) !== Number(after?.commission_rate);
  const actionCode = commissionChanged ? 'play_shops.set_commission' : 'play_shops.update';
  const detailText = commissionChanged
    ? `设置陪玩店分成比例：陪玩店${id} ${before.commission_rate} -> ${after?.commission_rate}`
    : `修改陪玩店信息：陪玩店${id}`;

  await writeOperationLog(req, {
    action: actionCode,
    detail: detailText,
    target_type: 'play_shop',
    target_id: id,
    before,
    after,
  });

  return ok(res, after, 'play shop updated');
}

async function deletePlayShop(req, res) {
  if (!canManagePlayShops(req.user)) {
    return fail(res, 'Forbidden', 403);
  }

  const id = Number(req.params.id);
  const beforeRows = await query(`SELECT id, name, is_deleted FROM play_shops WHERE id = :id LIMIT 1`, { id });
  if (!beforeRows.length) {
    return fail(res, 'Play shop not found', 404);
  }
  const before = beforeRows[0];

  await query(`UPDATE play_shops SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = :id`, { id });
  const afterRows = await query(`SELECT id, name, is_deleted FROM play_shops WHERE id = :id LIMIT 1`, { id });

  await writeOperationLog(req, {
    action: 'play_shops.delete',
    detail: `删除陪玩店：陪玩店${id}`,
    target_type: 'play_shop',
    target_id: id,
    before,
    after: afterRows[0] || null,
  });

  return ok(res, { play_shop_id: id }, 'play shop deleted');
}

module.exports = {
  listPlayShops,
  createPlayShop,
  updatePlayShop,
  deletePlayShop,
};


