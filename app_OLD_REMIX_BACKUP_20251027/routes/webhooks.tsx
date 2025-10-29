import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { ensureProductCompliance } from "@/modules/store.server";


const webhookIds: string[] = [];

const prodLink = process.env.PRODUCT_LINK;
const orginizationName = process.env.STORE_NAME;

if (!prodLink) throw Error("PRODUCT_LINK not found in .env file");
if (!orginizationName) throw Error("STORE_NAME not found in .env file");


export const action = async ({ request }: ActionFunctionArgs) => {
	let verification;
	try {
		verification = await authenticate.webhook(request);
	} catch (error) {
    console.error("Webhook verification failed", error);
		return new Response("Unauthorized", { status: 401 });
	}

	const { topic, shop, payload } = verification;
	const webhookId = (payload as any)?.id || request.headers.get("x-shopify-webhook-id");
	if (webhookId && webhookIds.includes(webhookId)) {
		return new Response("OK", { status: 200 });
	}
	if (webhookId) {
		webhookIds.push(webhookId);
		if (webhookIds.length > 100) {
			webhookIds.splice(0, webhookIds.length - 100);
		}
	}

	const normalizedTopic = typeof topic === "string" ? topic.toLowerCase() : "";
	if (!normalizedTopic || !shop) {
		console.error("Invalid webhook payload", { normalizedTopic, shop });
		return new Response("Bad Request", { status: 400 });
	}

	console.log("📬 Webhook received", {
		topic: normalizedTopic,
		shop,
	});

	try {
		const handlers: Record<
			string,
			(payload: unknown, shop: string) => Promise<void>
		> = {
			"products/create": handleProductCreate,
			"products/update": handleProductUpdate,
			"products/delete": handleProductDelete,
			"orders/create": handleOrderCreate,
			"orders/updated": handleOrderUpdate,
			"orders/paid": handleOrderPaid,
			"orders/cancelled": handleOrderCancelled,
			"orders/fulfilled": handleOrderFulfilled,
			"orders/partially_fulfilled": handleOrderPartiallyFulfilled,
			"inventory_levels/update": handleInventoryUpdate,
		};

		const matchedEntry = Object.entries(handlers).find(([key]) => {
			if (key === normalizedTopic) {
				return true;
			}
			const underscoreVariant = key.replace(/\//g, "_");
			return underscoreVariant === normalizedTopic;
		});

		if (!matchedEntry) {
			return new Response("OK", { status: 200 });
		}

		const [, handler] = matchedEntry;
		await handler(payload, shop);
		return new Response("OK", { status: 200 });
	} catch (error) {
		console.error("Error processing webhook", error);
		return new Response("Internal Server Error", { status: 500 });
	}
};

// Handle GET requests for webhook verification
export const loader = async ({ request }: LoaderFunctionArgs) => {
	console.log("🔔 WEBHOOK GET REQUEST:", new Date().toISOString());
	console.log("📋 Request URL:", request.url);
	console.log("📋 Request method:", request.method);
	console.log("📋 Request headers:", Object.fromEntries(request.headers.entries()));
	
	// Return 200 for webhook verification
	return new Response("WEBHOOK ROUTE IS WORKING! GET request received.", { status: 200 });
};

// Webhook handler functions
async function handleProductCreate(payload: any, shop: string) {
	console.log("🆕 Product created webhook", { shop, productId: payload?.id });
	await ensureProductCompliance({
		productId: payload?.id,
		shop,
		status: payload?.status,
	});
}

async function handleProductUpdate(payload: any, shop: string) {
	console.log("♻️ Product updated webhook", {
		shop,
		productId: payload?.id,
		status: payload?.status,
	});
	await ensureProductCompliance({
		productId: payload?.id,
		shop,
		status: payload?.status,
	});
}

async function handleProductDelete(payload: any, shop: string) {}

async function handleOrderCreate(payload: any, shop: string) {}

async function handleOrderUpdate(payload: any, shop: string) {}

async function handleOrderPaid(payload: any, shop: string) {}

async function handleOrderCancelled(payload: any, shop: string) {}

async function handleOrderFulfilled(payload: any, shop: string) {}

async function handleOrderPartiallyFulfilled(payload: any, shop: string) {}

async function handleInventoryUpdate(payload: any, shop: string) {
	console.log("📦 Inventory level update webhook", {
		shop,
		inventoryItemId: payload?.inventory_item_id,
		available: payload?.available,
	});
	await ensureProductCompliance({
		inventoryItemId: payload?.inventory_item_id,
		available: payload?.available,
		shop,
	});
}
