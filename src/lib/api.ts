const safeCompare = (a: string, b: string): boolean => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;

  let mismatch = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    mismatch |= aBuf[i] ^ bBuf[i];
  }
  return mismatch === 0;
};

export type RequestLike =
  | Request
  | {
      headers:
        | Headers
        | Record<string, string | string[] | undefined>;
    };

export const getHeaderValue = (
  req: RequestLike,
  name: string,
): string | null => {
  if (!req?.headers) return null;
  if (typeof (req.headers as Headers).get === "function") {
    return (req.headers as Headers).get(name);
  }
  const val = (req.headers as Record<string, string | string[] | undefined>)[
    name.toLowerCase()
  ];
  return Array.isArray(val) ? val[0] ?? null : val ?? null;
};

export const validateApiToken = async (
  request: RequestLike,
  apiToken?: string,
): Promise<boolean> => {
  try {
    if (!request?.headers) {
      console.error("Invalid request object");
      return false;
    }

    if (!apiToken) {
      console.error(
        "No API token provided. Set one as an environment variable.",
      );
      return false;
    }

    const authHeader = getHeaderValue(request, "authorization");
    const customTokenHeader = getHeaderValue(request, "x-api-token");

    let tokenToValidate = customTokenHeader || "";

    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        tokenToValidate = authHeader.substring(7);
      } else if (authHeader.startsWith("Token ")) {
        tokenToValidate = authHeader.substring(6);
      } else {
        tokenToValidate = authHeader;
      }
    }

    if (!tokenToValidate || tokenToValidate.length === 0) return false;

    return await safeCompare(apiToken.trim(), tokenToValidate.trim());
  } catch (error) {
    console.error("Error validating API token:", error);
    return false;
  }
};

export const validateApiTokenResponse = async (
  request: RequestLike,
  apiToken?: string,
): Promise<Response | undefined> => {
  const successful = await validateApiToken(request, apiToken);
  if (!successful) {
    return Response.json({ message: "Invalid API token" }, { status: 401 });
  }
  return undefined;
};

export interface CustomerInput {
  name: string;
  email: string;
  notes?: string;
  subscription?: {
    id: number;
    status: string;
  };
}

export interface SubscriptionInput {
  name: string;
  description: string;
  price: number;
  features?: Array<{
    name: string;
    description?: string;
  }>;
}

export const getCustomers = async (baseUrl: string, apiToken: string) => {
  const url = `${baseUrl}/api/customers`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  if (response.ok) {
    const data = (await response.json()) as { customers: unknown[] };
    return {
      customers: data.customers,
      success: true,
    };
  }
  console.error("Failed to fetch customers");
  return {
    customers: [],
    success: false,
  };
};

export const getCustomer = async (
  id: string | number,
  baseUrl: string,
  apiToken: string,
) => {
  const response = await fetch(`${baseUrl}/api/customers/${id}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  if (response.ok) {
    const data = (await response.json()) as { customer: unknown };
    return {
      customer: data.customer,
      success: true,
    };
  }
  console.error("Failed to fetch customer");
  return {
    customer: null,
    success: false,
  };
};

export const createCustomer = async (
  baseUrl: string,
  apiToken: string,
  customer: CustomerInput,
) => {
  const response = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(customer),
  });
  if (response.ok) {
    const data = (await response.json()) as { customer?: unknown };
    return {
      customer: data.customer ?? null,
      success: true,
    };
  }
  console.error("Failed to create customer");
  return {
    customer: null,
    success: false,
  };
};

export const createSubscription = async (
  baseUrl: string,
  apiToken: string,
  subscription: SubscriptionInput,
) => {
  const response = await fetch(`${baseUrl}/api/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription),
  });
  if (response.ok) {
    const data = (await response.json()) as { subscription?: unknown };
    return {
      subscription: data.subscription ?? null,
      success: true,
    };
  }
  console.error("Failed to create subscription");
  return {
    subscription: null,
    success: false,
  };
};

export const getSubscriptions = async (baseUrl: string, apiToken: string) => {
  const response = await fetch(`${baseUrl}/api/subscriptions`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  if (response.ok) {
    const data = (await response.json()) as { subscriptions: unknown[] };
    return {
      subscriptions: data.subscriptions,
      success: true,
    };
  }
  console.error("Failed to fetch subscriptions");
  return {
    subscriptions: [],
    success: false,
  };
};

export const getSubscription = async (
  id: string | number,
  baseUrl: string,
  apiToken: string,
) => {
  const response = await fetch(`${baseUrl}/api/subscriptions/${id}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  if (response.ok) {
    const data = (await response.json()) as { subscription: unknown };
    return {
      subscription: data.subscription,
      success: true,
    };
  }
  console.error("Failed to fetch subscription");
  return {
    subscription: null,
    success: false,
  };
};

export const getCustomerSubscriptions = async (
  baseUrl: string,
  apiToken: string,
) => {
  const response = await fetch(`${baseUrl}/api/customer_subscriptions`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
  if (response.ok) {
    const data = (await response.json()) as {
      customer_subscriptions: unknown[];
    };
    return {
      customer_subscriptions: data.customer_subscriptions,
      success: true,
    };
  }
  console.error("Failed to fetch customer subscriptions");
  return {
    customer_subscriptions: [],
    success: false,
  };
};

