import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const WORKER_DEBUG_VERSION = "worker-v1.0.4";

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/internal", (_req, res) => {
  res.json({
    status: "ok",
    debugVersion: WORKER_DEBUG_VERSION,
  });
});

export default router;
