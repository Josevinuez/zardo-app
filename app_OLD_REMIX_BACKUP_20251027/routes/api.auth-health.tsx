import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { sessionStorage, unauthenticated } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ ok: false, error: "Missing ?shop=your-shop.myshopify.com" }, { status: 400 });
  }

  // Inspect offline session from Prisma
  let offlineInfo: any = null;
  try {
    const offlineId = `offline_${shop}`;
    const offline = await (sessionStorage as any).loadSession(offlineId);
    offlineInfo = offline
      ? {
          present: true,
          isOnline: offline.isOnline,
          scope: offline.scope,
          expires: offline.expires,
          tokenLength: offline.accessToken?.length ?? 0,
        }
      : { present: false };
  } catch (e: any) {
    offlineInfo = { present: false, error: String(e?.message || e) };
  }

  // Try a trivial Admin GraphQL query using unauthenticated.admin(shop)
  let graphqlTest: any = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    const resp = await admin.graphql(`query { shop { id name } }`);
    const data = await resp.json();
    graphqlTest = { ok: true, data };
  } catch (e: any) {
    graphqlTest = { ok: false, error: String(e?.message || e) };
  }

  return json({ ok: true, shop, offlineInfo, graphqlTest });
}

