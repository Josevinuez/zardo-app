import path from "node:path";
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import { shopify } from "./shopify.js";
import { createPublicApiRouter, createProtectedApiRouter } from "./routes/api.js";
import { webhookHandlers } from "./webhooks.js";
const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 3000);
const STATIC_DIR = path.resolve(process.cwd(), "dist", "client");
const allowAuthBypass = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
const validateAuthenticatedSession = shopify.validateAuthenticatedSession();
const ensureInstalledOnShop = shopify.ensureInstalledOnShop();
console.log("🚀 Starting Express server...");
console.log("📁 Static dir:", STATIC_DIR);
console.log("🔑 API Key:", process.env.SHOPIFY_API_KEY ? "SET" : "MISSING");
console.log("🔐 Secret:", process.env.SHOPIFY_API_SECRET ? "SET" : "MISSING");
console.log(`🔧 Auth bypass: ${allowAuthBypass ? "ENABLED (ALLOW_DEV_AUTH_BYPASS=true)" : "DISABLED"}`);
const app = express();
app.use(cookieParser(process.env.SHOPIFY_API_SECRET));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.use(shopify.cspHeaders());
// Auth routes with better logging
app.get("/auth", (req, res, next) => {
    console.log("🔐 Auth begin requested");
    console.log("Shop param from query:", req.query.shop);
    // Extract shop from referer if not in query (shopify redirects lose the param)
    let shop = req.query.shop;
    if ((!shop || shop === 'undefined') && req.get('referer')) {
        try {
            const referer = req.get('referer');
            const refererUrl = new URL(referer);
            shop = refererUrl.searchParams.get('shop') || undefined;
            if (shop) {
                console.log("🔧 Extracted shop from referer:", shop);
                req.query.shop = shop;
            }
        }
        catch (e) {
            console.log("Could not parse referer");
        }
    }
    if (!shop || shop === 'undefined') {
        console.error("❌ No shop parameter found");
        return res.status(400).send(`<html><body>
      <h1>Missing Shop Parameter</h1>
      <p>Go to: <a href="https://zardotest.myshopify.com/admin/apps/zardo-app-v2">https://zardotest.myshopify.com/admin/apps/zardo-app-v2</a></p>
    </body></html>`);
    }
    console.log("✅ Using shop:", shop);
    shopify.auth.begin()(req, res, next);
});
app.get("/auth/callback", (req, res, next) => {
    console.log("🔙 Auth callback");
    console.log("Query params:", req.query);
    shopify.auth.callback()(req, res, next);
}, shopify.redirectToShopifyOrAppRoot());
app.get("/auth/logout", (_req, res) => {
    res.send(`<script>window.top.location.href="${process.env.SHOPIFY_APP_URL}";</script>`);
});
// Add login route for compatibility
app.post("/auth/login", (_req, res) => {
    res.redirect("/auth");
});
// Webhooks are handled via Shopify's built-in processing
if (Object.keys(webhookHandlers).length > 0) {
    app.post(shopify.config.webhooks.path, ...shopify.processWebhooks({ webhookHandlers }));
}
app.use("/api", createPublicApiRouter(shopify));
// Protected API routes - supports explicit bypass via env flag
app.use("/api", (req, res, next) => {
    if (allowAuthBypass) {
        console.log("🔓 Explicit auth bypass enabled for API access");
        return next();
    }
    return validateAuthenticatedSession(req, res, next);
}, createProtectedApiRouter(shopify));
app.use("/assets", express.static(path.join(STATIC_DIR, "assets"), {
    immutable: true,
    maxAge: "1y",
}));
app.use(express.static(STATIC_DIR, { index: false }));
app.get("/exit-iframe", (_req, res) => {
    res.send(`<script>window.top.location.href="${process.env.SHOPIFY_APP_URL}";</script>`);
});
// Middleware to capture shop parameter before auth check
app.use((req, res, next) => {
    // If we have shop in query but it gets lost, store it
    if (req.query.shop && !req.session) {
        req.session = {};
    }
    if (req.query.shop) {
        req._shop = req.query.shop;
    }
    next();
});
// App UI entry point - ensure the app is installed unless bypass is explicitly enabled
app.get("*", (req, res, next) => {
    if (allowAuthBypass) {
        console.log("🔓 Explicit auth bypass enabled for app install check");
        return next();
    }
    return ensureInstalledOnShop(req, res, next);
}, (req, res, next) => {
    const indexPath = path.join(STATIC_DIR, "index.html");
    res.sendFile(indexPath, (error) => {
        if (error) {
            if (error.code === "ENOENT") {
                res.status(200).send("<html><body><h1>Client build missing</h1><p>Run <code>npm run build:client</code> before starting the server.</p></body></html>");
                return;
            }
            next(error);
        }
    });
});
app.use((error, _req, res, _next) => {
    console.error("❌ Unhandled server error:", error);
    console.error("Stack:", error.stack);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
});
const server = app.listen(PORT, () => {
    console.log(`🚀 Server ready on port ${PORT}`);
});
// Handle errors
server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Try a different port.`);
    }
    else {
        console.error("❌ Server error:", error);
    }
    process.exit(1);
});
