import {
  listPlayers,
  listPublicPlayersByStore,
  createPlayer,
  updatePlayer,
  softDeletePlayer
} from "../models/playerModel.js";
import { AppError } from "../utils/appError.js";

function resolveStoreId(req) {
  if (req.user.role === "store_owner") {
    return req.user.store_id;
  }
  return Number(req.body.store_id);
}

export async function listPlayersController(req, res) {
  let rows;
  if (!req.user) {
    rows = await listPublicPlayersByStore(req.store.id);
  } else {
    const role = req.user.role;
    const storeId = req.user.role === "store_owner" ? req.user.store_id : null;
    rows = await listPlayers({ role, storeId });
  }
  res.json({ success: true, data: rows });
}

export async function createPlayerController(req, res) {
  const storeId = resolveStoreId(req);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }

  const payload = {
    store_id: storeId,
    nickname: req.body.nickname,
    gender: req.body.gender,
    game_type: req.body.game_type,
    price_per_hour: req.body.price_per_hour,
    status: req.body.status || "idle"
  };
  const created = await createPlayer(payload);
  res.status(201).json({ success: true, data: created });
}

export async function updatePlayerController(req, res) {
  const id = Number(req.params.id);
  const storeId = resolveStoreId(req);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }

  const result = await updatePlayer(id, {
    store_id: storeId,
    nickname: req.body.nickname,
    gender: req.body.gender,
    game_type: req.body.game_type,
    price_per_hour: req.body.price_per_hour,
    status: req.body.status
  });
  if (result.affectedRows === 0) {
    throw new AppError("Player not found", 404);
  }
  res.json({ success: true, message: "Player updated" });
}

export async function deletePlayerController(req, res) {
  const id = Number(req.params.id);
  const storeId = req.user.role === "store_owner" ? req.user.store_id : Number(req.body.store_id);
  if (!storeId) {
    throw new AppError("store_id is required", 422);
  }
  const result = await softDeletePlayer(id, storeId);
  if (result.affectedRows === 0) {
    throw new AppError("Player not found", 404);
  }
  res.json({ success: true, message: "Player deleted" });
}
