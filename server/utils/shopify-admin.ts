import type { Response } from "express";
import type { Session } from "@shopify/shopify-api";
import type { ShopifyApp } from "../shopify.js";
import { USING_API_VERSION, sessionStorage as prismaSessionStorage } from "../shopify.js";

type GraphqlVariables = Record<string, unknown> | undefined;

export interface GraphqlResponse {
  json: () => Promise<any>;
}

export interface AdminApiContext {
  graphql: (
    query: string,
    options?: {
      variables?: GraphqlVariables;
    }
  ) => Promise<GraphqlResponse>;
}

export interface AdminContextResult {
  admin: AdminApiContext;
  session: Session;
}

function resolveSessionStorage(_: ShopifyApp) {
  return prismaSessionStorage;
}

export function createAdminContext(shopify: ShopifyApp, session: Session): AdminApiContext {
  const apiVersion = ((shopify as any).config?.api?.apiVersion as string | undefined) ?? USING_API_VERSION;
  const accessToken = session.accessToken;
  if (!accessToken) {
    throw new Error(`Missing access token for shop ${session.shop}`);
  }

  return {
    async graphql(query: string, options?: { variables?: GraphqlVariables }) {
      const response = await fetch(`https://${session.shop}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shopify GraphQL request failed: ${response.status} ${response.statusText} - ${text}`);
      }

      return {
        json: () => response.json(),
      };
    },
  };
}

export function assertShopifySession(res: Response): Session {
  const session = res.locals?.shopify?.session as Session | undefined;
  if (!session) {
    throw new Error("Missing Shopify session on response locals");
  }
  return session;
}

export function getAuthenticatedAdminContext(shopify: ShopifyApp, res: Response): AdminContextResult {
  const session = assertShopifySession(res);
  return {
    session,
    admin: createAdminContext(shopify, session),
  };
}

export async function getOfflineAdminContext(shopify: ShopifyApp, shop: string): Promise<AdminContextResult | null> {
  const storage = resolveSessionStorage(shopify);
  if (!storage) {
    return null;
  }
  const sessionId = `offline_${shop}`;
  const session = (await storage.loadSession(sessionId)) as Session | null | undefined;
  if (!session) {
    return null;
  }
  return {
    session,
    admin: createAdminContext(shopify, session),
  };
}
