import * as XLSX from 'xlsx';

const LABELS = {
  orderNo: '\u8BA2\u5355\u53F7',
  storeName: '\u6765\u6E90\u7F51\u5427',
  contact: '\u5BA2\u6237\u8054\u7CFB\u65B9\u5F0F',
  orderInfo: '\u8BA2\u5355\u4FE1\u606F',
  orderAmount: '\u8BA2\u5355\u91D1\u989D',
  storeShare: '\u7F51\u5427\u5206\u6210',
  westShare: '\u897F\u90E8\u7535\u7ADE\u5206\u6210',
  playStoreShare: '\u966A\u73A9\u5E97\u5206\u6210',
  dispatchPlayStore: '\u6D3E\u5355\u966A\u73A9\u5E97',
  status: '\u5F53\u524D\u72B6\u6001',
  createdAt: '\u521B\u5EFA\u65F6\u95F4',
};

export function exportOrdersToExcel(list, filename = '\u8BA2\u5355\u5BFC\u51FA', options = {}) {
  const includeStoreName = options.includeStoreName !== false;
  const includeContact = options.includeContact !== false;
  const includeOrderInfo = options.includeOrderInfo !== false;
  const includeOrderAmount = options.includeOrderAmount !== false;
  const includeStoreShare = options.includeStoreShare !== false;
  const includeWestShare = options.includeWestShare !== false;
  const includePlayStoreShare = options.includePlayStoreShare !== false;
  const includeDispatchPlayStore = options.includeDispatchPlayStore !== false;
  const includeStatus = options.includeStatus !== false;
  const includeCreatedAt = options.includeCreatedAt !== false;

  const rows = list.map((item) => {
    const row = {
      [LABELS.orderNo]: item.order_no,
    };

    if (includeStoreName) {
      row[LABELS.storeName] = item.store_name;
    }
    if (includeContact) {
      row[LABELS.contact] = item.contact;
    }
    if (includeOrderInfo) {
      row[LABELS.orderInfo] = item.order_info;
    }
    if (includeOrderAmount) {
      row[LABELS.orderAmount] = Number(item.order_amount || 0);
    }
    if (includeStoreShare) {
      row[LABELS.storeShare] = Number(item.store_share || 0);
    }
    if (includeWestShare) {
      row[LABELS.westShare] = Number(item.west_share || 0);
    }
    if (includePlayStoreShare) {
      row[LABELS.playStoreShare] = Number(item.play_store_share || item.shop_share || 0);
    }
    if (includeDispatchPlayStore) {
      row[LABELS.dispatchPlayStore] = item.play_store_name || item.shop_name || '-';
    }
    if (includeStatus) {
      row[LABELS.status] = item.status_text || item.status || '-';
    }
    if (includeCreatedAt) {
      row[LABELS.createdAt] = item.created_at;
    }

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, '\u8BA2\u5355\u6570\u636E');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
