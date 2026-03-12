import { createStore, listStores, updateStore } from "../models/storeModel.js";
import { AppError } from "../utils/appError.js";

export async function createStoreController(req, res) {
  const { name, subdomain, commission_rate } = req.body;
  const store = await createStore({ name, subdomain, commission_rate });
  res.status(201).json({ success: true, data: store });
}

export async function listStoresController(req, res) {
  const stores = await listStores();
  res.json({ success: true, data: stores });
}

export async function updateStoreController(req, res) {
  const id = Number(req.params.id);
  const { name, subdomain, commission_rate } = req.body;
  const result = await updateStore(id, { name, subdomain, commission_rate });
  if (result.affectedRows === 0) {
    throw new AppError("Store not found", 404);
  }
  res.json({ success: true, message: "Store updated" });
}

