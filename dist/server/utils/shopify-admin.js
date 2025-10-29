import { USING_API_VERSION, sessionStorage as prismaSessionStorage } from "../shopify.js";
function resolveSessionStorage(_) {
    return prismaSessionStorage;
}
export function createAdminContext(shopify, session) {
    const apiVersion = shopify.config?.api?.apiVersion ?? USING_API_VERSION;
    const accessToken = session.accessToken;
    if (!accessToken) {
        throw new Error(`Missing access token for shop ${session.shop}`);
    }
    return {
        async graphql(query, options) {
            const response = await fetch(`https://${session.shop}/admin/api/${apiVersion}/graphql.json`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Shopify-Access-Token": accessToken,
                },
                body: JSON.stringify({
                    query,
                    variables: options?.variables,
                }),
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Shopify GraphQL request failed: ${response.status} ${response.statusText} - ${text}`);
            }
            return {
                json: () => response.json(),
            };
        },
    };
}
export function assertShopifySession(res) {
    const session = res.locals?.shopify?.session;
    if (!session) {
        throw new Error("Missing Shopify session on response locals");
    }
    return session;
}
export function getAuthenticatedAdminContext(shopify, res) {
    const session = assertShopifySession(res);
    return {
        session,
        admin: createAdminContext(shopify, session),
    };
}
export async function getOfflineAdminContext(shopify, shop) {
    const storage = resolveSessionStorage(shopify);
    if (!storage) {
        return null;
    }
    const sessionId = `offline_${shop}`;
    const session = (await storage.loadSession(sessionId));
    if (!session) {
        return null;
    }
    return {
        session,
        admin: createAdminContext(shopify, session),
    };
}
