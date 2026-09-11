import type { NextApiRequest, NextApiResponse } from "next";
import { validateApiToken } from "@/lib/api";
import { CustomerSubscriptionService } from "@/lib/services/customer_subscription";
import { getApiToken, getDB } from "@/lib/services/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const isValid = await validateApiToken(req, getApiToken());
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API token" });
  }

  const service = new CustomerSubscriptionService(getDB());

  if (req.method === "GET") {
    try {
      const customer_subscriptions = await service.getAll();
      return res.status(200).json({ customer_subscriptions });
    } catch (error) {
      console.error("Error loading customer subscriptions:", error);
      return res
        .status(500)
        .json({ message: "Couldn't load customer subscriptions" });
    }
  }

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await service.create(body);
      if (result.success) {
        return res.status(201).json({
          message: "Customer subscription created successfully",
          success: true,
        });
      }
      return res.status(500).json({
        message: "Couldn't create customer subscription",
        success: false,
      });
    } catch (error) {
      console.error("Error creating customer subscription:", error);
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Couldn't create customer subscription",
        success: false,
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
