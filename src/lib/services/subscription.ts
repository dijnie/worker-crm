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

interface RawSubscriptionRow {
  id: number;
  name: string;
  description: string;
  price: number;
  created_at: string;
  updated_at: string;
  feature_id?: number | null;
  feature_name?: string | null;
  feature_description?: string | null;
}

export const SUBSCRIPTION_QUERIES = {
  BASE_SELECT: `
    SELECT 
      subscriptions.*,
      features.id as feature_id,
      features.name as feature_name,
      features.description as feature_description
    FROM subscriptions
    LEFT JOIN subscription_features 
      ON subscriptions.id = subscription_features.subscription_id
    LEFT JOIN features 
      ON subscription_features.feature_id = features.id
  `,
  INSERT_SUBSCRIPTION: `INSERT INTO subscriptions (name, description, price) VALUES(?, ?, ?)`,
  INSERT_FEATURE: `INSERT OR IGNORE INTO features(name, description) VALUES(?, ?)`,
  SELECT_FEATURE_ID: `SELECT id FROM features WHERE name = ?`,
  INSERT_SUBSCRIPTION_FEATURE: `INSERT INTO subscription_features(subscription_id, feature_id) VALUES(?, ?)`,
};

const processSubscriptionResults = (rows: unknown[]): SubscriptionRecord[] => {
  const subscriptionsMap = new Map<number, SubscriptionRecord>();

  (rows as RawSubscriptionRow[]).forEach((row) => {
    if (!subscriptionsMap.has(row.id)) {
      const subscription: SubscriptionRecord = {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        created_at: row.created_at,
        updated_at: row.updated_at,
        features: [],
      };
      subscriptionsMap.set(row.id, subscription);
    }

    if (row.feature_id && row.feature_name) {
      const subscription = subscriptionsMap.get(row.id);
      if (subscription) {
        subscription.features.push({
          id: row.feature_id,
          name: row.feature_name,
          description: row.feature_description,
        });
      }
    }
  });

  return Array.from(subscriptionsMap.values());
};

export class SubscriptionService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getById(id: number | string): Promise<SubscriptionRecord | null> {
    const query = `${SUBSCRIPTION_QUERIES.BASE_SELECT} WHERE subscriptions.id = ?`;
    const response = await this.DB.prepare(query).bind(Number(id)).all();

    if (response.success && response.results.length) {
      const [subscription] = processSubscriptionResults(response.results);
      return subscription || null;
    }
    return null;
  }

  async getAll(): Promise<SubscriptionRecord[]> {
    const query = `${SUBSCRIPTION_QUERIES.BASE_SELECT} ORDER BY subscriptions.id ASC`;
    const response = await this.DB.prepare(query).all();

    if (response.success && response.results.length) {
      return processSubscriptionResults(response.results);
    }
    return [];
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
    const { name, description, price, features } = subscriptionData;

    const subscriptionResponse = await this.DB.prepare(
      SUBSCRIPTION_QUERIES.INSERT_SUBSCRIPTION,
    )
      .bind(name, description, price)
      .run();

    if (!subscriptionResponse.success) {
      throw new Error("Failed to create subscription");
    }

    const subscriptionId = subscriptionResponse.meta.last_row_id;

    if (features?.length && subscriptionId) {
      for (const feature of features) {
        await this.DB.prepare(SUBSCRIPTION_QUERIES.INSERT_FEATURE)
          .bind(feature.name, feature.description || null)
          .run();

        const featureIdResponse = await this.DB.prepare(
          SUBSCRIPTION_QUERIES.SELECT_FEATURE_ID,
        )
          .bind(feature.name)
          .all<{ id: number }>();

        if (!featureIdResponse.success || !featureIdResponse.results.length) {
          throw new Error(`Could not get ID for feature: ${feature.name}`);
        }

        const featureId = featureIdResponse.results[0].id;
        const relationshipResponse = await this.DB.prepare(
          SUBSCRIPTION_QUERIES.INSERT_SUBSCRIPTION_FEATURE,
        )
          .bind(subscriptionId, featureId)
          .run();

        if (!relationshipResponse.success) {
          throw new Error(
            `Failed to link feature ${feature.name} to subscription`,
          );
        }
      }
    }

    return { success: true, subscriptionId: subscriptionId ?? undefined };
  }
}
