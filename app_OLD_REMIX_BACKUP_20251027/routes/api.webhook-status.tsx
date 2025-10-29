import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🔍 CHECKING WEBHOOK STATUS:", new Date().toISOString());
  
  const { admin } = await authenticate.admin(request);
  
  if (!admin) {
    console.error("❌ No admin context for webhook status check");
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    console.log("📋 Fetching webhook subscriptions...");
    
    // Get all webhook subscriptions
    const webhookQuery = await admin.graphql(`
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
    
    const webhookData = await webhookQuery.json();
    console.log("📊 Webhook data:", JSON.stringify(webhookData, null, 2));
    
    const webhooks = webhookData.data?.webhookSubscriptions?.nodes || [];
    
    // Check for INVENTORY_LEVELS_UPDATE webhook
    const inventoryWebhook = webhooks.find(
      (webhook: any) => webhook.topic === "INVENTORY_LEVELS_UPDATE"
    );
    
    console.log("🎯 Inventory webhook found:", !!inventoryWebhook);
    if (inventoryWebhook) {
      console.log("📋 Inventory webhook details:", inventoryWebhook);
    }
    
    return json({ 
      success: true,
      totalWebhooks: webhooks.length,
      webhooks: webhooks,
      inventoryWebhook: inventoryWebhook,
      inventoryWebhookActive: !!inventoryWebhook,
      message: inventoryWebhook 
        ? "INVENTORY_LEVELS_UPDATE webhook is properly configured"
        : "INVENTORY_LEVELS_UPDATE webhook is NOT configured - this is why automation isn't working!",
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Webhook status check failed:", error);
    return json({ 
      error: "Check failed", 
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};
