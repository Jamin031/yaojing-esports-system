import { listOrdersByRole } from "../models/orderModel.js";
import { createOrderForStore, confirmOrderById, completeOrderById } from "../services/orderService.js";

export async function createOrderController(req, res) {
  const storeId = req.store.id;
  const { package_id, player_id, customer_contact } = req.body;
  const result = await createOrderForStore({
    storeId,
    packageId: Number(package_id),
    playerId: player_id ? Number(player_id) : null,
    customerContact: customer_contact
  });

  res.status(201).json({
    success: true,
    data: result.order,
    notify: result.notifyPayload
  });
}

export async function listOrdersController(req, res) {
  const rows = await listOrdersByRole({
    role: req.user.role,
    storeId: req.user.store_id
  });
  res.json({ success: true, data: rows });
}

export async function confirmOrderController(req, res) {
  await confirmOrderById(Number(req.params.id));
  res.json({ success: true, message: "Order confirmed" });
}

export async function completeOrderController(req, res) {
  await completeOrderById(Number(req.params.id));
  res.json({ success: true, message: "Order completed" });
}

