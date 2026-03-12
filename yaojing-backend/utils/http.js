function buildPagination(query = {}, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const rawPageSize = query.pageSize ?? query.page_size ?? query.limit;
  const limit = Math.min(maxLimit, Math.max(1, Number(rawPageSize) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, pageSize: limit, limit, offset };
}

function ok(res, data = null, message = 'success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    message,
  });
}

function fail(res, message = 'failed', statusCode = 400, data = null) {
  return res.status(statusCode).json({
    success: false,
    data,
    message,
  });
}

module.exports = {
  buildPagination,
  ok,
  fail,
};
