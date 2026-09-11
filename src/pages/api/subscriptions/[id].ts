import type { NextApiRequest, NextApiResponse } from "next";
import { validateApiToken } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";
import { getApiToken } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const isValid = await validateApiToken(req, getApiToken());
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API token" });
  }

  const { id } = req.query;
  const subscriptionId = Array.isArray(id) ? id[0] : id;
  if (!subscriptionId) {
    return res.status(400).json({ message: "Missing subscription id" });
  }

  const subscriptionService = new SubscriptionService();

  if (req.method === "GET") {
    try {
      const subscription = await subscriptionService.getById(subscriptionId);
      if (!subscription) {
        return res.status(404).json({ message: "Subscription not found" });
      }
      return res.status(200).json({ subscription });
    } catch (error) {
      console.error("Error loading subscription:", error);
      return res.status(500).json({ message: "Couldn't load subscription" });
    }
  }

  res.setHeader("Allow", ["GET"]);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
