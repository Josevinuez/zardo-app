import { Router } from "express";
import { Session } from "@shopify/shopify-api";
import { z } from "zod";
import prisma from "../db.js";
import { createAdminContext, getAuthenticatedAdminContext, getOfflineAdminContext, } from "../utils/shopify-admin.js";
import { checkAllProducts, getTotalStoreValue } from "../services/store.js";
import { createProductWMedia, createBulkVariants, adjustInventory } from "../services/queries.js";
import { getShopLocation, getPrimaryLocationId } from "../services/queries.js";
import { supabase, uploadImageBuffer } from "../services/supabase.js";
import { LotService } from "../services/lot.js";
import { queueParsePSA, getAvailablePSAKey, getAllPSAKeyUsage, } from "../services/psa.js";
import { queueParseTrollToad, } from "../services/troll.js";
import { getItemToad, getCollectionItemsToad, } from "../services/scrapper.js";
import { findProducts, } from "../services/prisma-queries.js";
const wishlistCorsHeaders = {
    "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    "Access-Control-Allow-Headers": "Content-Type, Access-Control-Allow-Headers, Authorization, access-control-allow-origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function sendWishlistResponse(res, status, payload) {
    res.status(status).set(wishlistCorsHeaders).json(payload);
}
async function resolvePrimaryLocationId(admin) {
    try {
        const response = await getShopLocation(admin);
        const locationId = response?.data?.location?.id ?? null;
        if (locationId) {
            return locationId;
        }
        return await getPrimaryLocationId(admin);
    }
    catch (error) {
        console.error("Failed to resolve primary location", error);
    }
    return null;
}
export function createPublicApiRouter(shopify) {
    const router = Router();
    router.get("/health", (_req, res) => {
        res.json({ ok: true, timestamp: new Date().toISOString() });
    });
    router.get("/auth-health", async (req, res, next) => {
        try {
            const shopParam = req.query.shop;
            const shop = typeof shopParam === "string" ? shopParam.trim() : null;
            if (!shop) {
                res.status(400).json({ ok: false, error: "Missing ?shop=your-shop.myshopify.com" });
                return;
            }
            const offline = await getOfflineAdminContext(shopify, shop);
            let offlineInfo = { present: false };
            if (offline) {
                const { session } = offline;
                offlineInfo = {
                    present: true,
                    isOnline: session.isOnline,
                    scope: session.scope,
                    expires: session.expires ?? null,
                    tokenLength: session.accessToken?.length ?? 0,
                };
            }
            let graphqlTest;
            if (offline) {
                try {
                    const response = await offline.admin.graphql(`query { shop { id name } }`);
                    const data = await response.json();
                    graphqlTest = { ok: true, data };
                }
                catch (error) {
                    graphqlTest = {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            }
            else if (process.env.SHOPIFY_API_ACCESS_TOKEN) {
                try {
                    const session = new Session({
                        id: `admin-token-${shop}`,
                        shop,
                        state: "admin-token",
                        isOnline: false,
                        scope: process.env.SCOPES,
                    });
                    session.accessToken = process.env.SHOPIFY_API_ACCESS_TOKEN;
                    const admin = createAdminContext(shopify, session);
                    const response = await admin.graphql(`query { shop { id name } }`);
                    const data = await response.json();
                    graphqlTest = { ok: true, data, usingAdminToken: true };
                }
                catch (error) {
                    graphqlTest = {
                        ok: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            }
            else {
                graphqlTest = { ok: false, error: "Offline session not available" };
            }
            res.json({ ok: true, shop, offlineInfo, graphqlTest });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/session-purge", async (req, res, next) => {
        try {
            const body = req.body || {};
            const shop = typeof body.shop === "string" ? body.shop.trim() : "";
            const secret = typeof body.secret === "string" ? body.secret.trim() : "";
            const expected = process.env.ADMIN_MAINTENANCE_SECRET;
            if (!expected) {
                res.status(500).json({ ok: false, error: "ADMIN_MAINTENANCE_SECRET not set on server" });
                return;
            }
            if (!shop) {
                res.status(400).json({ ok: false, error: "Missing 'shop' (e.g., my-shop.myshopify.com)" });
                return;
            }
            if (!secret || secret !== expected) {
                res.status(403).json({ ok: false, error: "Forbidden" });
                return;
            }
            const result = await prisma.session.deleteMany({ where: { shop } });
            res.json({ ok: true, shop, deleted: result.count });
        }
        catch (error) {
            next(error);
        }
    });
    router.options("/wishlist", (_req, res) => {
        res.set(wishlistCorsHeaders).sendStatus(204);
    });
    router.get("/wishlist", async (req, res, next) => {
        try {
            const idParam = req.query.id;
            const id = typeof idParam === "string" ? idParam.trim() : "";
            if (!id) {
                sendWishlistResponse(res, 400, { error: "No id provided" });
                return;
            }
            let wishlist = await prisma.wishlist.findUnique({
                where: { customerId: id },
                include: { Keywords: true },
            });
            if (!wishlist) {
                wishlist = await prisma.wishlist.create({
                    data: { customerId: id },
                    include: { Keywords: true },
                });
            }
            const suggestedKeywords = await prisma.suggestedKeyword.findMany({
                orderBy: { createdAt: "asc" },
            });
            sendWishlistResponse(res, 200, {
                keywords: wishlist.Keywords,
                email: wishlist.email,
                suggestedKeywords,
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/wishlist", async (req, res, next) => {
        try {
            const data = req.body ?? {};
            const id = typeof data.id === "string" ? data.id.trim() : "";
            const intent = typeof data.intent === "string" ? data.intent.trim() : "";
            if (!id) {
                sendWishlistResponse(res, 400, { error: "No id provided" });
                return;
            }
            if (!intent) {
                sendWishlistResponse(res, 400, { error: "No intent provided" });
                return;
            }
            const wishlist = await prisma.wishlist.findUnique({
                where: { customerId: id },
                include: { Keywords: true },
            });
            if (!wishlist) {
                sendWishlistResponse(res, 404, { error: "No Wishlist found on account." });
                return;
            }
            const keyword = typeof data.keyword === "string" ? data.keyword.trim().toLowerCase() : undefined;
            const email = typeof data.email === "string" ? data.email.trim() : undefined;
            switch (intent) {
                case "add_keyword":
                    if (!keyword) {
                        sendWishlistResponse(res, 400, { error: "No keyword provided" });
                        return;
                    }
                    await prisma.wishlist.update({
                        where: { customerId: id },
                        data: {
                            Keywords: {
                                connectOrCreate: {
                                    where: { value: keyword },
                                    create: { value: keyword },
                                },
                            },
                        },
                    });
                    break;
                case "remove_keyword":
                    if (!keyword) {
                        sendWishlistResponse(res, 400, { error: "No keyword provided" });
                        return;
                    }
                    await prisma.wishlist.update({
                        where: { customerId: id },
                        data: {
                            Keywords: {
                                disconnect: { value: keyword },
                            },
                        },
                    });
                    break;
                case "set_email":
                    if (!email) {
                        sendWishlistResponse(res, 400, { error: "No email provided" });
                        return;
                    }
                    await prisma.wishlist.update({
                        where: { customerId: id },
                        data: { email },
                    });
                    break;
                case "unsubscribe":
                    await prisma.wishlist.update({
                        where: { customerId: id },
                        data: { email: null },
                    });
                    break;
                default:
                    sendWishlistResponse(res, 400, { error: "Unknown intent..." });
                    return;
            }
            const refreshed = await prisma.wishlist.findUnique({
                where: { customerId: id },
                include: { Keywords: true },
            });
            if (!refreshed) {
                sendWishlistResponse(res, 404, { error: "No Wishlist found on account." });
                return;
            }
            const suggestedKeywords = await prisma.suggestedKeyword.findMany({
                orderBy: { createdAt: "asc" },
            });
            sendWishlistResponse(res, 200, {
                keywords: refreshed.Keywords,
                email: refreshed.email,
                suggestedKeywords,
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/test-webhook-simple", (_req, res) => {
        res.json({
            success: true,
            message: "Webhook test endpoint is working",
            timestamp: new Date().toISOString(),
        });
    });
    router.post("/test-webhook-simple", (req, res) => {
        console.log("🧪 SIMPLE WEBHOOK TEST:", new Date().toISOString());
        console.log("📋 Request method:", req.method);
        console.log("📋 Request URL:", req.originalUrl);
        console.log("📋 Request headers:", req.headers);
        console.log("📋 Request body:", req.body);
        res.json({
            success: true,
            message: "Webhook test received successfully",
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            body: req.body,
        });
    });
    // Wheel of Fortune endpoints
    router.get("/wheel/gifts", async (_req, res, next) => {
        try {
            // TODO: Get gift products from database
            // For now, return static gifts
            const gifts = [
                "Free Sticker Pack",
                "10% Off Next Order",
                "Free Shipping",
                "Try Again",
            ];
            res.json({ gifts });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/wheel/spin", async (req, res, next) => {
        try {
            const cartToken = req.headers['cart-token'];
            if (!cartToken) {
                return res.status(400).json({
                    success: false,
                    error: "Cart token required"
                });
            }
            // Simple wheel logic - 30% chance to win
            const gifts = [
                "Free Sticker Pack",
                "10% Off Next Order",
                "Free Shipping",
                "Try Again",
            ];
            const winChance = 0.3; // 30% chance
            const random = Math.random();
            if (random < winChance) {
                // Customer wins!
                const selectedGift = gifts[Math.floor(Math.random() * gifts.length)];
                // TODO: Track spin in database
                // TODO: Add product to cart if it's a physical gift
                res.json({
                    success: true,
                    gift: selectedGift,
                    // giftProductId: productId, // if it's a product
                });
            }
            else {
                // Better luck next time
                res.json({
                    success: true,
                    gift: "Better luck next time!",
                });
            }
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
export function createProtectedApiRouter(shopify) {
    const router = Router();
    router.get("/analytics/store-value", async (_req, res, next) => {
        try {
            // Return empty data in development mode to avoid auth issues
            const rows = await prisma.analytics.findMany({
                orderBy: { createdAt: "desc" },
                take: 30,
            });
            res.json({
                count: rows.length,
                values: rows.map((row) => ({
                    id: row.id,
                    value: Number(row.value),
                    date: row.date,
                    createdAt: row.createdAt,
                })),
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/psa/usage", async (_req, res, next) => {
        try {
            const apiUsageInfo = await getAvailablePSAKey();
            const allKeys = await getAllPSAKeyUsage();
            res.json({
                apiUsage: apiUsageInfo ? { key: apiUsageInfo.key } : null,
                allKeys,
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/psa/import", async (req, res, next) => {
        try {
            let shop;
            // In development mode, use a default shop or get from query params
            const isDevelopment = process.env.NODE_ENV === 'development' ||
                process.env.SHOPIFY_APP_URL?.includes('localhost') ||
                process.env.SHOPIFY_APP_URL?.includes('127.0.0.1') ||
                process.env.SHOPIFY_APP_URL?.includes('trycloudflare.com') ||
                process.env.SHOPIFY_APP_URL?.includes('loca.lt');
            if (isDevelopment) {
                shop = req.query.shop || process.env.DEV_SHOP || "zardotest.myshopify.com";
                console.log("🔧 Dev mode: Using shop:", shop);
            }
            else {
                const { session } = getAuthenticatedAdminContext(shopify, res);
                shop = session.shop;
            }
            const parseList = (input) => {
                if (Array.isArray(input)) {
                    return input
                        .flatMap((value) => String(value).split(/[,\n]/))
                        .map((value) => value.trim())
                        .filter(Boolean);
                }
                if (typeof input === "string") {
                    return input
                        .split(/[,\n]/)
                        .map((value) => value.trim())
                        .filter(Boolean);
                }
                return [];
            };
            const parseNumbers = (input) => parseList(input)
                .map((value) => Number.parseFloat(value))
                .filter((value) => Number.isFinite(value) && value > 0);
            const certs = parseList(req.body?.certs);
            const prices = parseNumbers(req.body?.prices);
            if (!certs.length || certs.length !== prices.length) {
                res.status(400).json({
                    error: "Certs and prices count do not match.",
                    jobsQueued: 0,
                    jobs: [],
                    apiUsage: null,
                });
                return;
            }
            const jobs = certs.map((certNo, index) => ({
                certNo,
                price: prices[index],
            }));
            const validJobs = jobs.filter((job) => job.price > 0 && job.certNo);
            if (!validJobs.length) {
                res.status(400).json({
                    error: "No valid cert/price pairs (prices must be > 0).",
                    jobsQueued: 0,
                    jobs: [],
                    apiUsage: null,
                });
                return;
            }
            const queueJobs = validJobs.map((job) => queueParsePSA
                .createJob({
                shop,
                certNo: job.certNo,
                price: job.price,
            })
                .retries(3)
                .backoff("exponential", 2000));
            const results = await queueParsePSA.saveAll(queueJobs);
            const failed = Array.from(results.values()).find((error) => error);
            if (failed) {
                throw failed;
            }
            const apiUsageInfo = await getAvailablePSAKey();
            res.json({
                error: null,
                jobsQueued: queueJobs.length,
                jobs: validJobs,
                apiUsage: apiUsageInfo ? { key: apiUsageInfo.key } : null,
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/troll/jobs", async (_req, res, next) => {
        try {
            const waitingJobs = await queueParseTrollToad.getJobs("waiting", { size: 500 });
            const failedJobs = await queueParseTrollToad.getJobs("failed", { size: 500 });
            res.json({
                waitingJobs: waitingJobs.map((job) => job.data),
                failedJobs: failedJobs.map((job) => {
                    const failedJob = job;
                    return {
                        data: job.data,
                        error: failedJob.failedReason ?? null,
                    };
                }),
                env: {
                    SUPABASE_URL: process.env.SUPABASE_URL ?? null,
                    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? null,
                },
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/troll/import", async (req, res, next) => {
        try {
            const { session } = getAuthenticatedAdminContext(shopify, res);
            const schema = z.object({
                url: z.string().url(),
                collection: z.coerce.boolean().optional().default(false),
                quantity: z.coerce.number().min(1).optional().default(1),
                price: z.coerce.number().min(0.01).optional().default(0.1),
                type: z
                    .enum([
                    "standard",
                    "mint",
                    "near-mint",
                    "low-played",
                    "moderately-played",
                    "heavily-played",
                    "damaged",
                ])
                    .optional()
                    .default("standard"),
                specific_product: z.string().optional(),
            });
            const parsed = schema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    error: "Invalid form data",
                    itemsReturn: null,
                    duplicates: null,
                });
                return;
            }
            const { url, collection, quantity, price, type, specific_product } = parsed.data;
            const rawItems = collection
                ? await getCollectionItemsToad(url, session.shop)
                : [await getItemToad(url, session.shop, quantity, price, type)];
            const items = rawItems.filter((item) => Boolean(item?.name));
            if (!items.length) {
                res.status(400).json({
                    error: "Unable to retrieve product details from Troll & Toad.",
                    itemsReturn: null,
                    duplicates: null,
                });
                return;
            }
            if (!specific_product) {
                const firstName = items[0].name.replace("(Pokemon)", "").trim();
                if (firstName) {
                    const duplicates = await findProducts({
                        where: {
                            title: {
                                contains: firstName,
                            },
                        },
                    });
                    if (duplicates.length > 0) {
                        res.json({
                            error: null,
                            itemsReturn: null,
                            duplicates,
                        });
                        return;
                    }
                }
            }
            const jobs = items
                .map((item) => queueParseTrollToad
                .createJob({
                shop: session.shop,
                itemIn: item,
                existingProductId: specific_product
                    ? specific_product === "NULL"
                        ? null
                        : specific_product
                    : null,
            })
                .retries(5)
                .backoff("exponential", 2000));
            const results = await queueParseTrollToad.saveAll(jobs);
            const failure = Array.from(results.values()).find((error) => error);
            if (failure) {
                throw failure;
            }
            res.json({
                error: null,
                itemsReturn: jobs.map((job) => job.id),
                duplicates: null,
            });
        }
        catch (error) {
            next(error);
        }
    });
    async function runDraftAutomation(res) {
        const { admin } = getAuthenticatedAdminContext(shopify, res);
        const locationID = await resolvePrimaryLocationId(admin);
        if (!locationID) {
            return { status: 400, body: { error: "No location found" } };
        }
        const result = await checkAllProducts(admin, locationID);
        return {
            status: 200,
            body: {
                success: true,
                result,
                message: `Draft automation completed. Processed ${result.itemsProcessed || 0} items.`,
                timestamp: new Date().toISOString(),
            },
        };
    }
    router.post("/automation/manual-draft", async (_req, res, next) => {
        try {
            const response = await runDraftAutomation(res);
            res.status(response.status).json(response.body);
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/products/create-manual", async (_req, res, next) => {
        try {
            let shop;
            // In development mode, use a default shop
            const isDevelopment = process.env.NODE_ENV === 'development' ||
                process.env.SHOPIFY_APP_URL?.includes('localhost') ||
                process.env.SHOPIFY_APP_URL?.includes('127.0.0.1') ||
                process.env.SHOPIFY_APP_URL?.includes('trycloudflare.com') ||
                process.env.SHOPIFY_APP_URL?.includes('loca.lt');
            let admin, session;
            if (isDevelopment) {
                shop = _req.query.shop || process.env.DEV_SHOP || "zardotest.myshopify.com";
                console.log("🔧 Dev mode: Using shop:", shop);
                // In dev mode, we need to get the offline admin context
                const offlineContext = await getOfflineAdminContext(shopify, shop);
                if (!offlineContext) {
                    return res.status(500).json({ success: false, error: "Could not get admin context" });
                }
                admin = offlineContext.admin;
                session = offlineContext.session;
            }
            else {
                const authContext = getAuthenticatedAdminContext(shopify, res);
                admin = authContext.admin;
                session = authContext.session;
                shop = session.shop;
            }
            // Handle JSON
            const { title, description, price, quantity, tags, images } = _req.body;
            if (!title || !price || !quantity) {
                return res.status(400).json({
                    success: false,
                    error: "Title, price, and quantity are required",
                });
            }
            console.log("📦 Creating manual product:", { title, price, quantity, imageCount: images?.length || 0 });
            // Get location ID
            const locationID = await resolvePrimaryLocationId(admin);
            if (!locationID) {
                return res.status(400).json({ success: false, error: "No location found" });
            }
            // Process images from base64 data URLs - upload to Supabase first
            const mediaInputs = [];
            if (images && Array.isArray(images) && images.length > 0) {
                console.log("📸 Processing", images.length, "images");
                for (let i = 0; i < images.length; i++) {
                    const imageDataUrl = images[i];
                    try {
                        // Extract base64 data and MIME type
                        const base64Data = imageDataUrl.split(',')[1];
                        const mimeMatch = imageDataUrl.match(/data:([^;]+);base64/);
                        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
                        // Convert base64 to buffer
                        const buffer = Buffer.from(base64Data, 'base64');
                        // Upload to Supabase
                        const uploadResult = await uploadImageBuffer(buffer, mimeType);
                        if (uploadResult.error || !uploadResult.data?.path) {
                            console.error("❌ Failed to upload image:", uploadResult.error);
                            continue; // Skip this image and continue with others
                        }
                        // Get public URL
                        const { data: urlData } = supabase.storage
                            .from('zardocards')
                            .getPublicUrl(uploadResult.data.path);
                        // Convert MIME type to Shopify enum
                        const contentType = mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO';
                        mediaInputs.push({
                            alt: `${title} - Image ${i + 1}`,
                            mediaContentType: contentType,
                            originalSource: urlData.publicUrl,
                        });
                        console.log("✅ Image uploaded:", urlData.publicUrl);
                    }
                    catch (error) {
                        console.error("❌ Error processing image:", error);
                        // Continue with other images
                    }
                }
                console.log(`📸 Successfully processed ${mediaInputs.length} out of ${images.length} images`);
            }
            // Create product - publish to all sales channels
            const parsedTags = Array.isArray(tags) ? tags : [];
            const productInput = {
                title,
                descriptionHtml: description || `<p>${title}</p>`,
                tags: parsedTags,
                status: "ACTIVE",
            };
            // Create the product with media
            const productResponse = await createProductWMedia(admin, productInput, mediaInputs);
            console.log("📦 Product creation response:", JSON.stringify(productResponse, null, 2));
            // Check for errors
            if (productResponse.data?.productCreate?.userErrors?.length > 0) {
                const errors = productResponse.data.productCreate.userErrors;
                console.error("❌ Product creation errors:", errors);
                return res.status(400).json({
                    success: false,
                    error: errors.map((e) => `${e.field}: ${e.message}`).join(", "),
                });
            }
            const product = productResponse.data?.productCreate?.product;
            if (!product) {
                console.error("❌ No product returned from Shopify");
                return res.status(500).json({
                    success: false,
                    error: "Product creation failed - no product returned",
                });
            }
            console.log("✅ Product created:", product.id);
            console.log("🔍 Product initial status from response:", product.status);
            // Extract numeric ID from GID (e.g., gid://shopify/Product/123 -> 123)
            const numericId = product.id.split('/').pop();
            // Add variant with inventory
            const targetQuantity = Number.parseInt(String(quantity), 10);
            if (!Number.isFinite(targetQuantity) || targetQuantity < 0) {
                return res.status(400).json({
                    success: false,
                    error: "Quantity must be a non-negative number",
                });
            }
            const variantInput = {
                price: Number.parseFloat(String(price)),
                inventoryQuantities: [{
                        locationId: locationID,
                        availableQuantity: targetQuantity,
                    }],
                inventoryPolicy: "DENY",
            };
            const variantsResponse = await createBulkVariants(admin, product.id, [variantInput], "REMOVE_STANDALONE_VARIANT");
            const variantCreateData = variantsResponse.data?.productVariantsBulkCreate;
            const variantErrors = variantCreateData?.userErrors ?? [];
            if (variantErrors.length > 0) {
                console.error("❌ Variant creation errors:", variantErrors);
                return res.status(400).json({
                    success: false,
                    error: variantErrors.map((e) => `${e.field}: ${e.message}`).join(", "),
                });
            }
            const createdVariants = variantCreateData?.productVariants ?? [];
            if (createdVariants.length === 0) {
                console.warn("⚠️ No variants returned from bulk create");
            }
            else {
                const createdVariant = createdVariants[0];
                const inventoryItemId = createdVariant?.inventoryItem?.id;
                const variantLocationId = createdVariant?.inventoryItem?.inventoryLevels?.nodes?.[0]?.location?.id ?? locationID;
                if (inventoryItemId && variantLocationId) {
                    try {
                        await adjustInventory(admin, inventoryItemId, variantLocationId, targetQuantity);
                        console.log("✅ Inventory adjusted for variant", { inventoryItemId, variantLocationId, targetQuantity });
                    }
                    catch (adjustError) {
                        console.error("⚠️ Failed to explicitly adjust inventory:", adjustError);
                    }
                }
                else {
                    console.warn("⚠️ Missing inventory item or location; skipping explicit inventory adjustment", {
                        inventoryItemId,
                        variantLocationId,
                    });
                }
            }
            console.log("✅ Variant created with inventory");
            // Publish product to all sales channels (using the same approach as PSA)
            try {
                console.log("📡 Getting all publications...");
                const pubsQuery = `
          query {
            publications(first: 50) {
              nodes {
                id
                name
              }
            }
          }
        `;
                const pubsResponse = await admin.graphql(pubsQuery);
                const pubsData = await pubsResponse.json();
                const publications = pubsData.data?.publications?.nodes || [];
                console.log(`📡 Found ${publications.length} publications:`, publications.map((p) => p.name));
                if (publications.length > 0) {
                    console.log(`📰 Publishing product to all ${publications.length} sales channels`);
                    // Use publishablePublish (same as PSA)
                    const publishMutation = `
            mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
              publishablePublish(id: $id, input: $input) {
                publishable {
                  ... on Product {
                    id
                    title
                    status
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;
                    const publishResponse = await admin.graphql(publishMutation, {
                        variables: {
                            id: product.id,
                            input: publications.map((publication) => ({
                                publicationId: publication.id
                            }))
                        },
                    });
                    const publishData = await publishResponse.json();
                    console.log("🔍 Publication result:", JSON.stringify(publishData, null, 2));
                    if (publishData.data?.publishablePublish?.userErrors?.length > 0) {
                        console.error("❌ Publication errors:", publishData.data.publishablePublish.userErrors);
                    }
                    else {
                        console.log("✅ Product published to all sales channels successfully");
                    }
                }
                else {
                    console.log("⚠️ No publications found - skipping publication step");
                }
            }
            catch (publishError) {
                console.error("⚠️ Error publishing product:", publishError);
                // Continue anyway - product is created
            }
            res.json({
                success: true,
                productId: product.id,
                productUrl: `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/products/${numericId}`,
                message: "Product created successfully",
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/inventory/calculate-and-save", async (_req, res, next) => {
        try {
            let admin, session;
            // In development mode, use a default shop
            const isDevelopment = process.env.NODE_ENV === 'development' ||
                process.env.SHOPIFY_APP_URL?.includes('localhost') ||
                process.env.SHOPIFY_APP_URL?.includes('127.0.0.1') ||
                process.env.SHOPIFY_APP_URL?.includes('trycloudflare.com') ||
                process.env.SHOPIFY_APP_URL?.includes('loca.lt');
            if (isDevelopment) {
                const shop = _req.query.shop || process.env.DEV_SHOP || "zardo-plus.myshopify.com";
                console.log("🔧 Dev mode: Using shop:", shop);
                // In dev mode, we need to get the offline admin context
                const offlineContext = await getOfflineAdminContext(shopify, shop);
                if (!offlineContext) {
                    // Fallback to SHOPIFY_API_ACCESS_TOKEN if available
                    if (process.env.SHOPIFY_API_ACCESS_TOKEN_SHARED_ONLY_ONCE) {
                        console.log("🔧 Using SHOPIFY_API_ACCESS_TOKEN as fallback");
                        const fallbackSession = new Session({
                            id: `admin-token-${shop}`,
                            shop,
                            state: "admin-token",
                            isOnline: false,
                            scope: process.env.SCOPES,
                        });
                        fallbackSession.accessToken = process.env.SHOPIFY_API_ACCESS_TOKEN_SHARED_ONLY_ONCE;
                        admin = createAdminContext(shopify, fallbackSession);
                        session = fallbackSession;
                    }
                    else {
                        return res.status(500).json({
                            error: "Could not get admin context",
                            message: "Please install the app on this store first. Go to: https://zardo-plus.myshopify.com/admin/apps and install 'zardo-app-v2'",
                            shop: shop
                        });
                    }
                }
                else {
                    admin = offlineContext.admin;
                    session = offlineContext.session;
                }
            }
            else {
                const authContext = getAuthenticatedAdminContext(shopify, res);
                admin = authContext.admin;
                session = authContext.session;
            }
            const locationID = await resolvePrimaryLocationId(admin);
            if (!locationID) {
                return res.status(400).json({ error: "No location found" });
            }
            console.log("💰 Starting inventory value calculation...");
            const result = await getTotalStoreValue(admin, session, locationID);
            // Save to analytics database
            await prisma.analytics.create({
                data: {
                    value: result.totalPrice,
                    date: new Date(),
                },
            });
            console.log("✅ Inventory value saved:", result.totalPrice);
            res.json({
                success: true,
                totalValue: result.totalPrice,
                message: "Inventory calculated and saved successfully",
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/test-draft-automation", async (_req, res, next) => {
        try {
            const { admin } = getAuthenticatedAdminContext(shopify, res);
            const locationID = await resolvePrimaryLocationId(admin);
            if (!locationID) {
                res.status(400).json({ error: "No location found" });
                return;
            }
            const result = await checkAllProducts(admin, locationID);
            res.json({
                success: true,
                result,
                message: `Draft automation test completed. Processed ${result.itemsProcessed || 0} items.`,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/test-inventory", async (_req, res, next) => {
        try {
            const { admin } = getAuthenticatedAdminContext(shopify, res);
            const locationID = await resolvePrimaryLocationId(admin);
            if (!locationID) {
                res.status(400).json({ error: "No location found" });
                return;
            }
            const result = await checkAllProducts(admin, locationID);
            res.json({
                success: true,
                result,
                message: "Inventory automation test completed successfully",
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/lotProduct/convert", async (req, res, next) => {
        try {
            const { admin } = getAuthenticatedAdminContext(shopify, res);
            const body = req.body || {};
            const lotProductIdRaw = body.lotProductId ?? body.lotproductid;
            const lotProductId = typeof lotProductIdRaw === "string" ? lotProductIdRaw.trim() : undefined;
            const defaultPriceValue = body.defaultPrice ?? body.defaultprice;
            const parsedPrice = typeof defaultPriceValue === "number" ? defaultPriceValue : Number(defaultPriceValue);
            const defaultPrice = Number.isFinite(parsedPrice) ? parsedPrice : undefined;
            if (!lotProductId) {
                res.status(400).json({ success: false, message: "Missing lotProductId" });
                return;
            }
            const result = await LotService.convertProductToShopify(lotProductId, admin, defaultPrice);
            res.json(result);
        }
        catch (error) {
            next(error);
        }
    });
    router.get("/product/:id", async (req, res, next) => {
        try {
            const id = req.params.id;
            if (!id) {
                res.status(400).json({ error: "Missing id" });
                return;
            }
            const product = await prisma.product.findUnique({
                where: { id },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    status: true,
                    totalInventory: true,
                    variants: {
                        select: {
                            id: true,
                            title: true,
                            price: true,
                            sku: true,
                            inventoryQuantity: true,
                        },
                        orderBy: { title: "asc" },
                    },
                },
            });
            if (!product) {
                res.status(404).json({ error: "Not found" });
                return;
            }
            res.json(product);
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/test-webhook", async (_req, res, next) => {
        try {
            const { admin } = getAuthenticatedAdminContext(shopify, res);
            const response = await admin.graphql(`
        query {
          webhookSubscriptions(first: 10) {
            nodes {
              id
              topic
              callbackUrl
              format
              createdAt
              updatedAt
            }
          }
        }
      `);
            const data = await response.json();
            const webhooks = data.data?.webhookSubscriptions?.nodes ?? [];
            const inventoryWebhook = webhooks.find((webhook) => webhook.topic === "INVENTORY_LEVELS_UPDATE");
            res.json({
                success: true,
                webhooks,
                inventoryWebhook,
                message: inventoryWebhook
                    ? "INVENTORY_LEVELS_UPDATE webhook is properly configured"
                    : "INVENTORY_LEVELS_UPDATE webhook is NOT configured",
            });
        }
        catch (error) {
            next(error);
        }
    });
    router.post("/webhook-status", async (_req, res, next) => {
        try {
            const { admin } = getAuthenticatedAdminContext(shopify, res);
            const response = await admin.graphql(`
        query {
          webhookSubscriptions(first: 20) {
            nodes {
              id
              topic
              callbackUrl
              format
              createdAt
              updatedAt
              apiVersion
            }
          }
        }
      `);
            const data = await response.json();
            const webhooks = data.data?.webhookSubscriptions?.nodes ?? [];
            const inventoryWebhook = webhooks.find((webhook) => webhook.topic === "INVENTORY_LEVELS_UPDATE");
            const correctUrl = `${process.env.SHOPIFY_APP_URL}/webhooks`;
            const urlMismatch = inventoryWebhook && inventoryWebhook.callbackUrl !== correctUrl;
            res.json({
                success: true,
                totalWebhooks: webhooks.length,
                webhooks,
                inventoryWebhook,
                inventoryWebhookActive: Boolean(inventoryWebhook),
                message: inventoryWebhook
                    ? urlMismatch
                        ? `⚠️ Webhook URL mismatch! Expected: ${correctUrl}, Got: ${inventoryWebhook.callbackUrl}`
                        : "INVENTORY_LEVELS_UPDATE webhook is properly configured"
                    : "INVENTORY_LEVELS_UPDATE webhook is NOT configured - automation will not run",
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    });
    return router;
}
