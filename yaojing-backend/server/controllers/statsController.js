import { getOverviewByRole } from "../services/statsService.js";

export async function getOverviewController(req, res) {
  const data = await getOverviewByRole(req.user);
  res.json({ success: true, data });
}

