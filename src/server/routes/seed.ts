import { Router } from "express";
import { seedDemoData } from "../repositories/seed-repository.js";

export const seedRouter = Router();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

seedRouter.post("/", (request,response) => {
  const date = typeof request.body?.date === "string" ? request.body.date : "";
  if (!datePattern.test(date)) return response.status(400).json({ error: "Ungültiges Datum." });
  return response.json(seedDemoData(date));
});
