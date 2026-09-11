import type { NextApiRequest, NextApiResponse } from "next";
import { validateApiToken } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";
import { getApiToken, getDB } from "@/lib/services/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const isValid = await validateApiToken(req, getApiToken());
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API token" });
  }

  const { id } = req.query;
  const customerId = Array.isArray(id) ? id[0] : id;
  if (!customerId) {
    return res.status(400).json({ message: "Missing customer id" });
  }

  const customerService = new CustomerService(getDB());

  if (req.method === "GET") {
    try {
      const customer = await customerService.getById(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      return res.status(200).json({ customer });
    } catch (error) {
      console.error("Error loading customer:", error);
      return res.status(500).json({ message: "Couldn't load customer" });
    }
  }

  res.setHeader("Allow", ["GET"]);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
