import jwt from "jsonwebtoken";

export function signJwt(payload) {
  const secret = process.env.JWT_SECRET || "replace_me";
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt(token) {
  const secret = process.env.JWT_SECRET || "replace_me";
  return jwt.verify(token, secret);
}

