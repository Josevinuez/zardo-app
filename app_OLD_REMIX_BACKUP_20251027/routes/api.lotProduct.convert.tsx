import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { LotService } from "~/modules/lot.server";

/**
 * API endpoint to convert a lot product to Shopify (create or update as needed)
 * POST only. Expects 'lotProductId' in the request body (form data or JSON).
 * Returns { success, message, shopifyProductId }
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  let lotProductId: string | undefined;
  let defaultPrice: number | undefined;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      lotProductId = body.lotProductId;
      if (typeof body.defaultPrice === 'number') defaultPrice = body.defaultPrice;
    } else {
      const formData = await request.formData();
      lotProductId = formData.get("lotProductId") as string;
      const priceString = formData.get("defaultPrice");
      if (priceString && typeof priceString === 'string') {
        const parsed = Number(priceString);
        if (!Number.isNaN(parsed)) defaultPrice = parsed;
      }
    }
  } catch (err) {
    return json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  if (!lotProductId) {
    return json({ success: false, message: "Missing lotProductId" }, { status: 400 });
  }

  // Call the conversion logic with admin context
  const result = await LotService.convertProductToShopify(lotProductId, admin, defaultPrice);
  return json(result);
}

// No loader needed for this API route
export const loader = () => json({ error: "Not Found" }, { status: 404 }); 