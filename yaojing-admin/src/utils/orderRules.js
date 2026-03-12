function firstDefined(values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

function normalizeStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase();
}

function normalizeRole(role) {
  const text = String(role || '')
    .trim()
    .toLowerCase();
  if (['super_admin', 'super-admin', 'superadmin'].includes(text)) return 'super_admin';
  if (['customer_service', 'customer-service', 'customer', 'service'].includes(text)) return 'customer_service';
  if (['store_owner', 'store-owner', 'owner'].includes(text)) return 'store_owner';
  if (['admin', 'administrator'].includes(text)) return 'admin';
  if (['finance', 'financial'].includes(text)) return 'finance';
  return text;
}

function toBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = String(value)
    .trim()
    .toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getProblemObject(row) {
  return row?.problem || row?.problem_info || row?.problemInfo || {};
}

export function resolveProblemAmount(row) {
  const problem = getProblemObject(row);
  const value = firstDefined([
    row?.revised_amount,
    row?.revisedAmount,
    row?.final_amount,
    row?.finalAmount,
    row?.problem_amount,
    row?.problemAmount,
    row?.actual_amount,
    row?.actualAmount,
    row?.settled_amount,
    row?.settledAmount,
    row?.adjusted_amount,
    row?.adjustedAmount,
    problem.revised_amount,
    problem.revisedAmount,
    problem.final_amount,
    problem.finalAmount,
    problem.problem_amount,
    problem.problemAmount,
    problem.actual_amount,
    problem.actualAmount,
    problem.adjusted_amount,
    problem.adjustedAmount,
    problem.order_amount,
    problem.orderAmount,
    problem.amount,
    row?.order_amount,
    row?.orderAmount,
    row?.amount,
  ]);
  return normalizeNumber(value);
}

export function resolveProblemRemark(row) {
  const problem = getProblemObject(row);
  const value = firstDefined([
    row?.problem_remark,
    row?.problemRemark,
    row?.problem_note,
    row?.problemNote,
    row?.revised_remark,
    row?.revisedRemark,
    row?.handle_remark,
    row?.handleRemark,
    row?.process_remark,
    row?.processRemark,
    problem.problem_remark,
    problem.problemRemark,
    problem.problem_note,
    problem.problemNote,
    problem.revised_remark,
    problem.revisedRemark,
    problem.handle_remark,
    problem.handleRemark,
    problem.process_remark,
    problem.processRemark,
    problem.remark,
    problem.note,
  ]);
  return value || '-';
}

export function resolveOrderRemark(row) {
  const explicitValue = firstDefined([
    row?.customer_order_remark,
    row?.customerOrderRemark,
    row?.customer_remark,
    row?.customerRemark,
    row?.customer_note,
    row?.customerNote,
    row?.user_order_remark,
    row?.userOrderRemark,
    row?.user_remark,
    row?.userRemark,
    row?.user_note,
    row?.userNote,
    row?.buyer_remark,
    row?.buyerRemark,
    row?.order_remark,
    row?.orderRemark,
    row?.order_note,
    row?.orderNote,
    row?.order_comment,
    row?.orderComment,
    row?.customer_message,
    row?.customerMessage,
    row?.order_message,
    row?.orderMessage,
    row?.client_remark,
    row?.clientRemark,
    row?.client_note,
    row?.clientNote,
    row?.customer?.order_remark,
    row?.customer?.orderRemark,
    row?.customer?.remark,
    row?.customer?.note,
    row?.user?.order_remark,
    row?.user?.orderRemark,
    row?.user?.remark,
    row?.user?.note,
  ]);
  const explicitText = String(explicitValue ?? '').trim();
  if (explicitText) return explicitText;

  const genericValue = firstDefined([row?.remark, row?.note, row?.memo, row?.comment, row?.message]);
  const genericText = String(genericValue ?? '').trim();
  if (!genericText) return '-';

  const problemText = String(resolveProblemRemark(row) || '').trim();
  const hasProblemRemark = problemText && problemText !== '-';
  if (hasProblemRemark && genericText === problemText) return '-';
  if (isProblemOrder(row) && hasProblemRemark) return '-';

  return genericText;
}

export function resolveCustomerNickname(row) {
  const value = firstDefined([
    row?.customer_nickname,
    row?.customerNickname,
    row?.nickname,
    row?.nick_name,
    row?.nickName,
    row?.user_nickname,
    row?.userNickname,
    row?.member_nickname,
    row?.memberNickname,
    row?.online_user_nickname,
    row?.onlineUserNickname,
    row?.user?.nickname,
    row?.customer?.nickname,
  ]);
  return value || 'ƒ‰√˚”√ªß';
}

export function resolveOrderContact(row) {
  const value = firstDefined([
    row?.contact,
    row?.customer_contact,
    row?.customerContact,
    row?.phone,
    row?.mobile,
    row?.phone_number,
    row?.phoneNumber,
    row?.customer_phone,
    row?.customerPhone,
    row?.user_phone,
    row?.userPhone,
    row?.user?.phone,
    row?.user?.mobile,
    row?.customer?.phone,
    row?.customer?.mobile,
  ]);
  return value || '';
}

export function isAnonymousOrder(row) {
  const problem = getProblemObject(row);
  const value = firstDefined([
    row?.is_anonymous,
    row?.isAnonymous,
    row?.anonymous,
    row?.customer_is_anonymous,
    row?.customerIsAnonymous,
    row?.user_is_anonymous,
    row?.userIsAnonymous,
    row?.customer?.is_anonymous,
    row?.customer?.isAnonymous,
    row?.user?.is_anonymous,
    row?.user?.isAnonymous,
    problem.is_anonymous,
    problem.isAnonymous,
  ]);
  if (value === undefined) return false;
  return toBoolean(value, false);
}

export function canViewAnonymousCustomerInfo(role) {
  const normalizedRole = normalizeRole(role);
  return ['super_admin', 'admin', 'finance', 'customer_service'].includes(normalizedRole);
}

export function isProblemOrder(row) {
  return normalizeStatus(row?.status) === 'problem';
}

export function isCompletedOrder(row) {
  return normalizeStatus(row?.status) === 'completed';
}

export function isOrderDeleted(row) {
  const value = firstDefined([row?.is_deleted, row?.isDeleted, row?.deleted]);
  return toBoolean(value, false);
}

export function isOrderEffectiveForStats(row, fallback = true) {
  const problem = getProblemObject(row);
  const value = firstDefined([
    row?.include_in_stats,
    row?.includeInStats,
    row?.is_effective,
    row?.isEffective,
    row?.effective,
    problem.include_in_stats,
    problem.includeInStats,
    problem.is_effective,
    problem.isEffective,
    problem.effective,
  ]);
  if (value === undefined) return fallback;
  return toBoolean(value, fallback);
}

export function isProblemVisibleToOwner(row, fallback = true) {
  const problem = getProblemObject(row);
  const value = firstDefined([
    row?.owner_visible,
    row?.ownerVisible,
    row?.store_owner_visible,
    row?.storeOwnerVisible,
    row?.visible_to_store_owner,
    row?.visibleToStoreOwner,
    problem.owner_visible,
    problem.ownerVisible,
    problem.store_owner_visible,
    problem.storeOwnerVisible,
    problem.visible_to_store_owner,
    problem.visibleToStoreOwner,
  ]);
  if (value === undefined) return fallback;
  return toBoolean(value, fallback);
}

export function isCountableCompletedOrder(row) {
  return isCompletedOrder(row) && !isOrderDeleted(row) && isOrderEffectiveForStats(row, true);
}

export function isOwnerVisibleProblemOrder(row) {
  return isProblemOrder(row) && !isOrderDeleted(row) && isProblemVisibleToOwner(row, true);
}

export function isOwnerVisibleCompletedOrder(row) {
  return isCompletedOrder(row) && !isOrderDeleted(row);
}

export function isOwnerAllowedOrderRow(row) {
  return isOwnerVisibleCompletedOrder(row) || isOwnerVisibleProblemOrder(row);
}

