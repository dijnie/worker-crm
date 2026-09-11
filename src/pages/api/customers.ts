import type { NextApiRequest, NextApiResponse } from "next";
import { validateApiToken } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";
import { getApiToken } from "@/lib/db";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const isValid = await validateApiToken(req, getApiToken());
  if (!isValid) {
    return res.status(401).json({ message: "Invalid API token" });
  }

  const customerService = new CustomerService();

  if (req.method === "GET") {
    try {
      const customers = await customerService.getAll();
      return res.status(200).json({ customers });
    } catch (error) {
      console.error("Error loading customers:", error);
      return res.status(500).json({ message: "Couldn't load customers" });
    }
  }

  if (req.method === "POST") {
    try {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const result = await customerService.create(body);
      if (result.success) {
        return res.status(201).json({
          message: "Customer created successfully",
          success: true,
        });
      }
      return res.status(500).json({
        message: "Couldn't create customer",
        success: false,
      });
    } catch (error) {
      console.error("Error creating customer:", error);
      return res.status(500).json({
        message:
          error instanceof Error ? error.message : "Couldn't create customer",
        success: false,
      });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
}
