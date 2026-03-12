import { findStoreById } from "../models/storeModel.js";
import { findPackageById } from "../models/packageModel.js";
import { createOrder, findOrderById, confirmOrder, completeOrder } from "../models/orderModel.js";
import { findPlayerById, setPlayerStatus } from "../models/playerModel.js";
import { generateOrderNo } from "../utils/orderNo.js";
import { AppError } from "../utils/appError.js";
import { buildOrderNotifyPayload, orderEmitter } from "./notifyService.js";

export async function createOrderForStore({ storeId, packageId, playerId, customerContact }) {
  const store = await findStoreById(storeId);
  if (!store) {
    throw new AppError("Store not found", 404);
  }

  const pkg = await findPackageById(packageId);
  if (!pkg || pkg.store_id !== storeId || pkg.status !== "active") {
    throw new AppError("Package not available for this store", 400);
  }

  if (playerId) {
    const player = await findPlayerById(playerId);
    if (!player || player.store_id !== storeId) {
      throw new AppError("Player not found in this store", 400);
    }
  }

  const totalPrice = Number(pkg.price);
  const commissionAmount = Number((totalPrice * Number(store.commission_rate)).toFixed(2));

  const order = await createOrder({
    order_no: generateOrderNo(),
    store_id: storeId,
    package_id: packageId,
    player_id: playerId || null,
    customer_contact: customerContact,
    status: "pending",
    total_price: totalPrice,
    commission_amount: commissionAmount
  });

  const notifyPayload = buildOrderNotifyPayload({
    storeName: store.name,
    amount: totalPrice,
    contact: customerContact
  });
  orderEmitter.emit("order.created", notifyPayload);

  return { order, notifyPayload };
}

export async function confirmOrderById(orderId) {
  const order = await findOrderById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.status !== "pending") {
    throw new AppError("Only pending orders can be confirmed", 400);
  }

  const store = await findStoreById(order.store_id);
  if (!store) {
    throw new AppError("Store not found", 404);
  }

  const commissionAmount = Number((Number(order.total_price) * Number(store.commission_rate)).toFixed(2));
  const result = await confirmOrder(orderId, commissionAmount);
  if (result.affectedRows === 0) {
    throw new AppError("Order confirm failed", 400);
  }

  if (order.player_id) {
    await setPlayerStatus(order.player_id, order.store_id, "busy");
  }
}

export async function completeOrderById(orderId) {
  const order = await findOrderById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.status !== "confirmed") {
    throw new AppError("Only confirmed orders can be completed", 400);
  }

  const result = await completeOrder(orderId);
  if (result.affectedRows === 0) {
    throw new AppError("Order complete failed", 400);
  }

  if (order.player_id) {
    await setPlayerStatus(order.player_id, order.store_id, "idle");
  }
}

