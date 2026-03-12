import bcrypt from "bcrypt";
import { findUserByUsername } from "../models/userModel.js";
import { signJwt } from "../utils/jwt.js";
import { AppError } from "../utils/appError.js";

export async function login(username, password) {
  const user = await findUserByUsername(username);
  if (!user) {
    throw new AppError("Invalid username or password", 401);
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    throw new AppError("Invalid username or password", 401);
  }

  const token = signJwt({
    user_id: user.id,
    role: user.role,
    store_id: user.store_id
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      store_id: user.store_id
    }
  };
}

