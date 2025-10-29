import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	return new Response("Webhook test endpoint is ready!", { status: 200 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
	console.log("🧪 WEBHOOK TEST ENDPOINT CALLED:", new Date().toISOString());
	console.log("📋 Request method:", request.method);
	console.log("📋 Request URL:", request.url);
	console.log("📋 Request headers:", Object.fromEntries(request.headers.entries()));
	
	// Get webhook body and headers
	const hmac = request.headers.get("x-shopify-hmac-sha256");
	const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
	
	console.log("🔐 Webhook verification:");
	console.log("  - HMAC header:", hmac ? "PRESENT" : "MISSING");
	console.log("  - HMAC value:", hmac);
	console.log("  - Webhook secret:", webhookSecret ? "SET" : "MISSING");
	console.log("  - Webhook secret length:", webhookSecret ? webhookSecret.length : 0);
	console.log("  - Webhook secret first 10 chars:", webhookSecret ? webhookSecret.substring(0, 10) : "N/A");
	
	// Read body as raw buffer to avoid encoding issues
	const bodyBuffer = await request.arrayBuffer();
	const body = Buffer.from(bodyBuffer).toString('utf8');
	
	console.log("  - Body length:", body.length);
	console.log("  - Body preview:", body.substring(0, 200));
	
	// TEMPORARILY DISABLE HMAC VERIFICATION FOR TESTING
	console.log("⚠️ HMAC VERIFICATION TEMPORARILY DISABLED FOR TESTING");
	console.log("✅ Webhook verification skipped - processing webhook");
	
	// Parse the webhook payload
	let payload;
	try {
		payload = JSON.parse(body);
		console.log("📦 Webhook topic:", payload.topic || "UNKNOWN");
		console.log("🏪 Shop:", payload.shop || "UNKNOWN");
		console.log("📦 Webhook ID:", request.headers.get("x-shopify-webhook-id"));
		console.log("📦 Event ID:", request.headers.get("x-shopify-event-id"));
	} catch (error) {
		console.error("❌ Failed to parse webhook payload:", error);
		return new Response("Bad Request", { status: 400 });
	}
	
	console.log("✅ Webhook test processed successfully");
	
	return new Response("Webhook test received successfully!", { 
		status: 200,
		headers: {
			"Content-Type": "text/plain"
		}
	});
};
