import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { checkAllProducts } from "~/modules/store.server";
import { getShopLocation } from "~/modules/queries.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  if (!admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    // Get shop location
    const locations = await getShopLocation(admin);
    const locationID = locations.data?.location.id;
    
    if (!locationID) {
      return json({ error: "No location found" }, { status: 400 });
    }
    
    console.log("🧪 Testing inventory automation for location:", locationID);
    
    // Run the inventory check
    const result = await checkAllProducts(admin, locationID);
    
    return json({ 
      success: true, 
      result,
      message: "Inventory automation test completed successfully"
    });
    
  } catch (error) {
    console.error("❌ Inventory automation test failed:", error);
    return json({ 
      error: "Test failed", 
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
};
