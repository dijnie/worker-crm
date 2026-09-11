import type { NextApiRequest, NextApiResponse } from "next";
import { validateApiToken } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";
import { getApiToken, getDB } from "@/lib/services/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const isValid = await validateApiToken(req, getApiToken());
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API token" });
  }

  const subscriptionService = new SubscriptionService(getDB());

  if (req.method === "GET") {
    try {
      const subscriptions = await subscriptionService.getAll();
      return res.status(200).json({ subscriptions });
    } catch (error) {
      console.error("Error loading subscriptions:", error);
      return res.status(500).json({ message: "Couldn't load subscriptions" });
    }
  }

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await subscriptionService.create(body);
      return res.status(201).json({
        message: "Subscription created successfully",
        success: true,
      });
    } catch (error) {
      console.error("Error creating subscription:", error);
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to create subscription",
        success: false,
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
