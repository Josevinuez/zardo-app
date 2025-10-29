import { ActionFunctionArgs } from "@remix-run/node";
import { useSubmit, useNavigation, json } from "@remix-run/react";
import { Page, Card, Button, BlockStack, Link } from "@shopify/polaris";
import { deleteIndexProducts, syncShopifyProductsToSupabase } from "~/modules/store.server";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const formData = await request.formData();
    const { admin } = await authenticate.admin(request);

    const type = formData.get("type");
    switch (type) {
        case "DeleteIndexedProducts": {
            Promise.all([deleteIndexProducts()]);
            return json({ storeValue: null, resp: null, error: null });
        }
        case "SyncShopifyProductsToSupabase": {
            Promise.all([syncShopifyProductsToSupabase(admin)]);
            return json({ storeValue: null, resp: null, error: null });
        }
        default: {
            return json({
                error: "Invalid action type",
                resp: null,
                storeValue: null,
            });
        }
    }
};

export default function InternalSettings() {
    const nav = useNavigation();

    const submit = useSubmit();
    const syncProducts = () => {
        const formData = new FormData();
        formData.append("type", "SyncShopifyProductsToSupabase");
        submit(formData, { method: "POST" });
    };
    const deleteIndexedProducts = () => {
        const formData = new FormData();
        formData.append("type", "DeleteIndexProducts");
        submit(formData, { method: "POST" });
    };

    const isLoading =
        ["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";
    return (
        <Page title="Internal Settings (DEV ONLY)">
            <BlockStack gap="400">
                <Card>
                    <Link url="/app">Back to Settings</Link>
                    <Button loading={isLoading} onClick={syncProducts}>
                        Sync Shopify Products to Supabase
                    </Button>
                    <Button loading={isLoading} onClick={deleteIndexedProducts}>
                        Delete Indexed Products
                    </Button>
                </Card>
            </BlockStack>
        </Page>
    );
}
