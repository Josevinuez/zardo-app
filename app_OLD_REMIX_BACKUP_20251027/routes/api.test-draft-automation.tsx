import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { checkAllProducts } from "~/modules/store.server";
import { getShopLocation } from "~/modules/queries.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("🧪 TESTING DRAFT AUTOMATION:", new Date().toISOString());
  
  const { admin } = await authenticate.admin(request);
  
  if (!admin) {
    console.error("❌ No admin context for draft automation test");
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    console.log("🔍 Getting shop location...");
    const locations = await getShopLocation(admin);
    const locationID = locations.data?.location.id;
    
    if (!locationID) {
      console.error("❌ No location found for draft automation test");
      return json({ error: "No location found" }, { status: 400 });
    }
    
    console.log("📍 Location ID:", locationID);
    console.log("🚀 Starting draft automation test...");
    
    // Run the inventory check
    const result = await checkAllProducts(admin, locationID);
    
    console.log("✅ Draft automation test completed:", result);
    
    return json({ 
      success: true, 
      result,
      message: `Draft automation test completed. Processed ${result.itemsProcessed || 0} items.`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Draft automation test failed:", error);
    return json({ 
      error: "Test failed", 
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};
