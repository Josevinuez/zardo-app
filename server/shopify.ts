import "@shopify/shopify-api/adapters/node";
import {
  ApiVersion,
} from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import prisma from "./db.js";

const sessionStorage = new PrismaSessionStorage(prisma);

const rawAppUrl = process.env.SHOPIFY_APP_URL || "http://localhost:3000";
const normalizedUrl = rawAppUrl.startsWith("http")
  ? rawAppUrl
  : `https://${rawAppUrl}`;
const url = new URL(normalizedUrl);
const hostName = url.host;
const hostScheme = (url.protocol.replace(":", "") || "https") as "http" | "https";

const scopes = process.env.SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [];
const FORCE_CUSTOM_TOKEN = String(process.env.SHOPIFY_FORCE_CUSTOM_TOKEN || "").toLowerCase() === "true";
const USE_NEW_EMBEDDED_STRATEGY = String(process.env.SHOPIFY_USE_TOKEN_EXCHANGE || "").toLowerCase() === "true";
const ADMIN_TOKEN = process.env.SHOPIFY_API_ACCESS_TOKEN || process.env.SHOPIFY_API_ACCESS_TOKEN_SHARED_ONLY_ONCE;

export const USING_API_VERSION = ApiVersion.October24;

export const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    scopes,
    hostName,
    hostScheme,
    apiVersion: USING_API_VERSION,
    isEmbeddedApp: true,
    isCustomStoreApp: FORCE_CUSTOM_TOKEN,
    restResources,
    ...(FORCE_CUSTOM_TOKEN && ADMIN_TOKEN
      ? { adminApiAccessToken: ADMIN_TOKEN }
      : {}),
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  },
  auth: {
    path: "/auth",
    callbackPath: "/auth/callback",
  },
  webhooks: {
    path: "/webhooks",
  },
  sessionStorage,
  useOnlineTokens: USE_NEW_EMBEDDED_STRATEGY,
  exitIframePath: "/exit-iframe",
});

export type ShopifyApp = typeof shopify;

export { sessionStorage };
