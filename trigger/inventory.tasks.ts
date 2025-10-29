import { Queue } from "bee-queue";
import { shared_config } from "~/shared";
import { checkAllProducts } from "~/modules/store.server";
import { getShopLocation } from "~/modules/queries.server";
import { authenticate } from "~/shopify.server";

// Create inventory check queue
export const inventoryCheckQueue = new Queue("inventory-check", shared_config);

// Job data interface
export interface InventoryCheckJobInput {
  shop: string;
  locationID: string;
}

// Process inventory check jobs
inventoryCheckQueue.process(async (job) => {
  const { shop, locationID } = job.data as InventoryCheckJobInput;
  
  console.log("🔄 Starting scheduled inventory check for shop:", shop);
  
  try {
    // Get admin context for the shop
    const session = await authenticate.session.findSessionsByShop(shop);
    if (!session || session.length === 0) {
      throw new Error(`No session found for shop: ${shop}`);
    }
    
    const admin = await authenticate.admin(session[0]);
    if (!admin) {
      throw new Error(`Failed to get admin context for shop: ${shop}`);
    }
    
    // Run the inventory check
    const result = await checkAllProducts(admin, locationID);
    
    console.log("✅ Scheduled inventory check completed:", result);
    return result;
    
  } catch (error) {
    console.error("❌ Scheduled inventory check failed:", error);
    throw error;
  }
});

// Schedule inventory check every hour
export async function scheduleInventoryCheck() {
  console.log("⏰ Scheduling inventory check every hour");
  
  // Get all active shops
  const sessions = await authenticate.session.findSessionsByShop();
  
  for (const session of sessions) {
    try {
      const admin = await authenticate.admin(session);
      if (!admin) continue;
      
      // Get shop location
      const locations = await getShopLocation(admin);
      const locationID = locations.data?.location.id;
      
      if (!locationID) {
        console.warn(`⚠️ No location found for shop: ${session.shop}`);
        continue;
      }
      
      // Schedule the job
      await inventoryCheckQueue.createJob({
        shop: session.shop,
        locationID: locationID
      }).save();
      
      console.log(`📅 Scheduled inventory check for shop: ${session.shop}`);
      
    } catch (error) {
      console.error(`❌ Failed to schedule inventory check for shop ${session.shop}:`, error);
    }
  }
}

// Start the scheduler
setInterval(async () => {
  try {
    await scheduleInventoryCheck();
  } catch (error) {
    console.error("❌ Failed to schedule inventory checks:", error);
  }
}, 60 * 60 * 1000); // Run every hour (60 minutes * 60 seconds * 1000 milliseconds)

console.log("🚀 Inventory check scheduler started - running every hour");
