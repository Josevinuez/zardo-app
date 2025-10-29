import { json, type ActionFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🧪 SIMPLE WEBHOOK TEST:", new Date().toISOString());
  console.log("📋 Request method:", request.method);
  console.log("📋 Request URL:", request.url);
  console.log("📋 Request headers:", Object.fromEntries(request.headers.entries()));
  
  try {
    const body = await request.text();
    console.log("📋 Request body:", body);
    
    return json({ 
      success: true, 
      message: "Webhook test received successfully",
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      body: body
    });
  } catch (error) {
    console.error("❌ Webhook test failed:", error);
    return json({ 
      error: "Test failed", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  console.log("🧪 SIMPLE WEBHOOK TEST (GET):", new Date().toISOString());
  return json({ 
    success: true, 
    message: "Webhook test endpoint is working",
    timestamp: new Date().toISOString()
  });
};
