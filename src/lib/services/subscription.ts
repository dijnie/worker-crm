import { asc, eq } from "drizzle-orm";
import {
  features,
  getDb,
  subscriptionFeatures,
  subscriptions,
  type Database,
} from "@/lib/db";

export interface SubscriptionFeature {
  id?: number;
  name: string;
  description?: string | null;
}

export interface SubscriptionRecord {
  id: number;
  name: string;
  description: string;
  price: number;
  created_at: string;
  updated_at: string;
  features: SubscriptionFeature[];
}

export class SubscriptionService {
  private db: Database;

  constructor(db: Database = getDb()) {
    this.db = db;
  }

  async getById(id: number | string): Promise<SubscriptionRecord | null> {
    const r = await this.db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, Number(id)),
      with: {
        features: {
          with: {
            feature: true,
          },
        },
      },
    });

    if (!r) return null;

    return {
      id: r.id,
      name: r.name,
      description: r.description,
      price: r.price,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      features: r.features.map((f) => ({
        id: f.feature.id,
        name: f.feature.name,
        description: f.feature.description,
      })),
    };
  }

  async getAll(): Promise<SubscriptionRecord[]> {
    const records = await this.db.query.subscriptions.findMany({
      orderBy: [asc(subscriptions.id)],
      with: {
        features: {
          with: {
            feature: true,
          },
        },
      },
    });

    return records.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      price: r.price,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      features: r.features.map((f) => ({
        id: f.feature.id,
        name: f.feature.name,
        description: f.feature.description,
      })),
    }));
  }

  async create(subscriptionData: {
    name: string;
    description: string;
    price: number;
    features?: Array<{
      name: string;
      description?: string;
    }>;
  }): Promise<{ success: boolean; subscriptionId?: number }> {
    const { name, description, price, features: featureList } =
      subscriptionData;

    const [inserted] = await this.db
      .insert(subscriptions)
      .values({
        name,
        description,
        price: Math.round(price),
      })
      .returning({ id: subscriptions.id });

    if (!inserted?.id) {
      throw new Error("Failed to create subscription");
    }

    const subscriptionId = inserted.id;

    if (featureList?.length) {
      for (const feat of featureList) {
        let featureRecord = await this.db.query.features.findFirst({
          where: eq(features.name, feat.name),
        });

        if (!featureRecord) {
          const [newFeat] = await this.db
            .insert(features)
            .values({
              name: feat.name,
              description: feat.description || null,
            })
            .returning({ id: features.id });

          if (newFeat) {
            featureRecord = {
              id: newFeat.id,
              name: feat.name,
              description: feat.description || null,
              createdAt: "",
              updatedAt: "",
            };
          }
        }

        if (featureRecord?.id) {
          await this.db
            .insert(subscriptionFeatures)
            .values({
              subscriptionId,
              featureId: featureRecord.id,
            })
            .onConflictDoNothing();
        }
      }
    }

    return { success: true, subscriptionId };
  }
}
