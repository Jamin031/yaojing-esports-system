function formatDate(input) {
  const d = new Date(input);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

const stores = [
  { id: 1, name: 'Yishiguang', commission_rate: 0.3 },
  { id: 2, name: 'Aurora Esports', commission_rate: 0.28 },
  { id: 3, name: 'Xinghe Cyber', commission_rate: 0.26 },
];

const playStores = [
  { id: 1, name: 'Play Studio A', commission_rate: 0.9 },
  { id: 2, name: 'Play Studio B', commission_rate: 0.88 },
  { id: 3, name: 'Play Studio C', commission_rate: 0.92 },
];

const users = [
  {
    id: 1,
    name: 'Super Admin',
    username: 'superadmin_demo',
    password: 'ChangeMe123!',
    role: 'super_admin',
    store_id: null,
    created_at: daysAgo(30),
  },
  {
    id: 2,
    name: 'Admin A',
    username: 'admin_demo_a',
    password: 'ChangeMe123!',
    role: 'admin',
    store_id: null,
    created_at: daysAgo(20),
  },
  {
    id: 3,
    name: 'Admin B',
    username: 'admin_demo_b',
    password: 'ChangeMe123!',
    role: 'admin',
    store_id: null,
    created_at: daysAgo(10),
  },
  {
    id: 4,
    name: 'Admin C',
    username: 'admin_demo_c',
    password: 'ChangeMe123!',
    role: 'admin',
    store_id: null,
    created_at: daysAgo(5),
  },
  {
    id: 5,
    name: 'Yishiguang Owner',
    username: 'store_owner_demo',
    password: 'ChangeMe123!',
    role: 'store_owner',
    store_id: 1,
    created_at: daysAgo(2),
  },
];

const orders = [
  {
    id: 1,
    order_no: 'WB20260304001',
    store_id: 1,
    contact: '13800000001',
    order_info: '4H duo queue',
    order_amount: 300,
    status: 'completed',
    play_store_id: 1,
    created_at: daysAgo(0),
  },
  {
    id: 2,
    order_no: 'WB20260304002',
    store_id: 2,
    contact: '13800000002',
    order_info: '2H coaching',
    order_amount: 180,
    status: 'pending_contact',
    play_store_id: 2,
    created_at: daysAgo(0),
  },
  {
    id: 3,
    order_no: 'WB20260303001',
    store_id: 3,
    contact: '13800000003',
    order_info: '5H carry service',
    order_amount: 460,
    status: 'completed',
    play_store_id: 3,
    created_at: daysAgo(1),
  },
  {
    id: 4,
    order_no: 'WB20260302001',
    store_id: 1,
    contact: '13800000004',
    order_info: '3H entertainment game',
    order_amount: 240,
    status: 'completed',
    play_store_id: 1,
    created_at: daysAgo(2),
  },
  {
    id: 5,
    order_no: 'WB20260301001',
    store_id: 2,
    contact: '13800000005',
    order_info: 'night package',
    order_amount: 520,
    status: 'completed',
    play_store_id: 2,
    created_at: daysAgo(3),
  },
  {
    id: 6,
    order_no: 'WB20260228001',
    store_id: 1,
    contact: '13800000006',
    order_info: 'weekend rank rush',
    order_amount: 680,
    status: 'pending_contact',
    play_store_id: null,
    created_at: daysAgo(5),
  },
];

const seq = {
  storeId: stores.length + 1,
  userId: users.length + 1,
  playStoreId: playStores.length + 1,
  orderId: orders.length + 1,
};

function getStoreById(storeId) {
  return stores.find((item) => Number(item.id) === Number(storeId)) || null;
}

function getPlayStoreById(playStoreId) {
  return playStores.find((item) => Number(item.id) === Number(playStoreId)) || null;
}

function withOrderRelations(order) {
  const store = getStoreById(order.store_id);
  const playStore = getPlayStoreById(order.play_store_id);
  return {
    ...order,
    store_name: store?.name || '-',
    store_commission_rate: store?.commission_rate ?? 0,
    play_store_name: playStore?.name || '-',
    play_store_commission_rate: playStore?.commission_rate ?? 0,
  };
}

module.exports = {
  stores,
  playStores,
  users,
  orders,
  seq,
  formatDate,
  withOrderRelations,
  getStoreById,
  getPlayStoreById,
};
