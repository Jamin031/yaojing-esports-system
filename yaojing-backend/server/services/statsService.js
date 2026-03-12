import { getSuperAdminOverview, getStoreOwnerOverview } from "../models/statsModel.js";
import { AppError } from "../utils/appError.js";

export async function getOverviewByRole(user) {
  if (user.role === "super_admin") {
    const { ordersAgg, revenueByStore } = await getSuperAdminOverview();
    return {
      role: "super_admin",
      total_orders: Number(ordersAgg.total_orders || 0),
      total_revenue: Number(ordersAgg.total_revenue || 0),
      total_commission: Number(ordersAgg.total_commission || 0),
      store_revenue: revenueByStore
    };
  }

  if (user.role === "store_owner") {
    const { agg, idlePlayers } = await getStoreOwnerOverview(user.store_id);
    return {
      role: "store_owner",
      store_id: user.store_id,
      store_revenue: Number(agg.store_revenue || 0),
      confirmed_orders: Number(agg.confirmed_orders || 0),
      unfinished_orders: Number(agg.unfinished_orders || 0),
      idle_players: Number(idlePlayers.idle_players || 0)
    };
  }

  throw new AppError("Only super_admin or store_owner can access this endpoint", 403);
}

