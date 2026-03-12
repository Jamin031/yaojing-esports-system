import { login } from "../services/authService.js";

export async function loginController(req, res) {
  const { username, password } = req.body;
  const result = await login(username, password);
  res.json({ success: true, ...result });
}

