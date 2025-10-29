import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

// Completely separate webhook handler that bypasses Shopify framework
export const action = async ({ request }: ActionFunctionArgs) => {
	console.log("🚀 DEBUG WEBHOOK ACTION CALLED - NO SHOPIFY FRAMEWORK!");
	console.log("🔔 WEBHOOK RECEIVED:", new Date().toISOString());
	console.log("📋 Request headers:", Object.fromEntries(request.headers.entries()));
	console.log("📋 Request method:", request.method);
	console.log("📋 Request URL:", request.url);
	
	const body = await request.text();
	console.log("📦 Body length:", body.length);
	console.log("📦 Body preview:", body.substring(0, 500));
	
	// Parse the webhook payload
	let payload;
	try {
		payload = JSON.parse(body);
		console.log("📦 Webhook topic:", payload.topic || "UNKNOWN");
		console.log("🏪 Shop:", payload.shop || "UNKNOWN");
		console.log("📦 Full payload:", JSON.stringify(payload, null, 2));
	} catch (error) {
		console.error("❌ Failed to parse webhook payload:", error);
		return new Response("Bad Request", { status: 400 });
	}
	
	console.log("✅ DEBUG WEBHOOK PROCESSED SUCCESSFULLY");
	return new Response("OK", { status: 200 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	console.log("🔔 DEBUG WEBHOOK GET REQUEST:", new Date().toISOString());
	console.log("📋 Request URL:", request.url);
	console.log("📋 Request method:", request.method);
	
	return new Response("DEBUG WEBHOOK ROUTE IS WORKING! GET request received.", { status: 200 });
};
