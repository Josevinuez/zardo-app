import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  if (!admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    // Test webhook configuration
    const webhookTest = await admin.graphql(`
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
    
    const webhookData = await webhookTest.json();
    
    // Check if INVENTORY_LEVELS_UPDATE webhook is registered
    const inventoryWebhook = webhookData.data?.webhookSubscriptions?.nodes?.find(
      (webhook: any) => webhook.topic === "INVENTORY_LEVELS_UPDATE"
    );
    
    return json({ 
      success: true,
      webhooks: webhookData.data?.webhookSubscriptions?.nodes || [],
      inventoryWebhook: inventoryWebhook,
      message: inventoryWebhook 
        ? "INVENTORY_LEVELS_UPDATE webhook is properly configured"
        : "INVENTORY_LEVELS_UPDATE webhook is NOT configured"
    });
    
  } catch (error) {
    console.error("❌ Webhook test failed:", error);
    return json({ 
      error: "Test failed", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};
