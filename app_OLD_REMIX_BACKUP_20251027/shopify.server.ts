import { ApiVersion, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import prisma from "./db.server";

export const USING_API_VERSION = ApiVersion.October24;

// Debug webhook secret loading
console.log("🔐 WEBHOOK SECRET CHECK:");
console.log("  - SHOPIFY_WEBHOOK_SECRET:", process.env.SHOPIFY_WEBHOOK_SECRET ? "SET" : "MISSING");
console.log("  - SHOPIFY_API_SECRET:", process.env.SHOPIFY_API_SECRET ? "SET" : "MISSING");
console.log("  - SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY ? "SET" : "MISSING");

// Allow forcing "custom app token" mode via env for single-store deployments.
const FORCE_CUSTOM_TOKEN = String(process.env.SHOPIFY_FORCE_CUSTOM_TOKEN || "").toLowerCase() === "true";
const USE_NEW_EMBEDDED_STRATEGY = String(process.env.SHOPIFY_USE_TOKEN_EXCHANGE || "").toLowerCase() === "true";
const ADMIN_TOKEN = process.env.SHOPIFY_API_ACCESS_TOKEN || process.env.SHOPIFY_API_ACCESS_TOKEN_SHARED_ONLY_ONCE;

const shopify = shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    scopes: process.env.SCOPES?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
    appUrl: process.env.SHOPIFY_APP_URL || "",
    apiVersion: USING_API_VERSION,
    sessionStorage: new PrismaSessionStorage(prisma),
    useOnlineTokens: USE_NEW_EMBEDDED_STRATEGY,
    restResources,
    ...(FORCE_CUSTOM_TOKEN && ADMIN_TOKEN ? { adminApiAccessToken: ADMIN_TOKEN } : {}),
    ...(process.env.SHOP_CUSTOM_DOMAIN
        ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
        : {}),
});

export default shopify;
export const apiVersion = USING_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
