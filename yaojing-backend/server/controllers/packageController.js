import {
  listPackages,
  listActivePackagesByStore,
  createPackage,
  updatePackage,
  softDeletePackage
} from "../models/packageModel.js";
import { AppError } from "../utils/appError.js";

function resolveStoreId(req) {
  if (req.user.role === "store_owner") {
    return req.user.store_id;
  }
  return Number(req.body.store_id);
}

export async function listPackagesController(req, res) {
  let rows;
  if (!req.user) {
    rows = await listActivePackagesByStore(req.store.id);
  } else {
    const role = req.user.role;
    const storeId = req.user.role === "store_owner" ? req.user.store_id : null;
    rows = await listPackages({ role, storeId });
  }
  res.json({ success: true, data: rows });
}

export async function createPackageController(req, res) {
  const storeId = resolveStoreId(req);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }

  const payload = {
    store_id: storeId,
    game_type: req.body.game_type,
    service_type: req.body.service_type,
    title: req.body.title,
    description: req.body.description || "",
    price: req.body.price,
    duration: req.body.duration,
    status: req.body.status || "active"
  };

  const created = await createPackage(payload);
  res.status(201).json({ success: true, data: created });
}

export async function updatePackageController(req, res) {
  const id = Number(req.params.id);
  const storeId = resolveStoreId(req);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }

  const result = await updatePackage(id, {
    store_id: storeId,
    game_type: req.body.game_type,
    service_type: req.body.service_type,
    title: req.body.title,
    description: req.body.description || "",
    price: req.body.price,
    duration: req.body.duration,
    status: req.body.status
  });

  if (result.affectedRows === 0) {
    throw new AppError("Package not found", 404);
  }
  res.json({ success: true, message: "Package updated" });
}

export async function deletePackageController(req, res) {
  const id = Number(req.params.id);
  const storeId = req.user.role === "store_owner" ? req.user.store_id : Number(req.body.store_id);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }

  const result = await softDeletePackage(id, storeId);
  if (result.affectedRows === 0) {
    throw new AppError("Package not found", 404);
  }
  res.json({ success: true, message: "Package deleted" });
}
