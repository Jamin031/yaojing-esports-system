import { findStoreBySubdomain } from "../models/storeModel.js";
import { AppError } from "../utils/appError.js";

function parseSubdomain(host = "") {
  const cleanHost = host.split(":")[0].toLowerCase();
  if (!cleanHost || cleanHost === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(cleanHost)) {
    return null;
  }

  const parts = cleanHost.split(".");
  if (parts.length < 2) {
    return null;
  }

  if (parts[0] === "www") {
    return parts[1] || null;
  }
  return parts[0] || null;
}

export async function resolveStoreBySubdomain(req, res, next) {
  const host = req.headers.host || "";
  const subdomain = parseSubdomain(host);
  if (!subdomain) {
    throw new AppError("Unable to resolve store subdomain from host", 400);
  }

  const store = await findStoreBySubdomain(subdomain);
  if (!store) {
    throw new AppError("Store not found for subdomain", 404);
  }

  req.store = store;
  next();
}

