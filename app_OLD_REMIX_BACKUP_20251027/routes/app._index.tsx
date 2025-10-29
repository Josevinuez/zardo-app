import { useState } from "react";
import {
	json,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from "@remix-run/node";
import {
	useActionData,
	useLoaderData,
	useNavigation,
	useSubmit,
} from "@remix-run/react";
import {
	Page,
	Layout,
	Text,
	Card,
	Button,
	BlockStack,
	Box,
	List,
	Link,
	InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
	checkAllProducts,
	scheduleStoreValueCalculation,
	STORE_VALUE_NOTIFICATION_EMAIL,
} from "@/modules/store.server";
import { getPrimaryLocationId } from "@/modules/queries.server";
import loadable from "@loadable/component";
import db from "../db.server";
import type { Props as ApexProps } from "react-apexcharts";
import { getShopLocation } from "~/modules/queries.server";

const Chart = loadable(() => import("react-apexcharts"), {
	ssr: false,
	resolveComponent: (components) => components.default,
});

export const loader = async ({ request }: LoaderFunctionArgs) => {

	// Get analytics from previous 10 days using prisma
	const rawValues = await db.analytics.findMany({
		orderBy: {
			createdAt: "desc",
		},
	});

	const deduped = rawValues
		.map((entry) => ({
			id: entry.id,
			value: Number.parseFloat(entry.value.toFixed(2)),
			createdAt: entry.createdAt,
			date: entry.date,
		}))
		.filter((entry, index, arr) => {
			if (entry.value !== 0) {
				return true;
			}
			const prev = arr[index - 1];
			const next = arr[index + 1];
			return Boolean((prev && prev.value !== 0) || (next && next.value !== 0));
		});

	const storeValue = deduped.length > 0
		? deduped
		: [{
			id: 0,
			value: 0,
			createdAt: new Date("1970-01-01T00:00:00Z"),
			date: new Date("1970-01-01T00:00:00Z"),
		}];

	return json({ storeValue });
};

export const action = async ({ request }: ActionFunctionArgs) => {
	const formData = await request.formData();
	const { admin, session } = await authenticate.admin(request);
	// check action data
	const locations = await getShopLocation(admin);
	let storelocation = locations.data?.location?.id;
	if (!storelocation) {
		storelocation = await getPrimaryLocationId(admin);
	}
	console.log("📍 Using location for store value calc:", storelocation);
	const type = formData.get("type");
	switch (type) {
		case "ItemLevelCheck": {
			console.log("🧪 MANUAL DRAFT AUTOMATION TEST TRIGGERED:", new Date().toISOString());
			console.log("📍 Location ID:", storelocation);
			console.log("🏪 Shop:", session?.shop);
			
			const resp = await checkAllProducts(admin, storelocation);
			console.log("✅ Manual draft automation test completed:", resp);
			
			return json({ 
				resp, 
				storeValue: null, 
				error: null,
				message: `Draft automation test completed. Processed ${resp.itemsProcessed || 0} items.`,
				timestamp: new Date().toISOString()
			});
		}
		case "CheckStoreValue": {
		const queued = await scheduleStoreValueCalculation({
			admin,
			locationID: storelocation,
			shop: session?.shop ?? "unknown-shop",
			notifyEmail: STORE_VALUE_NOTIFICATION_EMAIL,
		});
		return json({ storeValue: null, resp: null, error: null, job: queued });
		}
		case "TestWebhookStatus": {
			console.log("🔍 WEBHOOK STATUS CHECK TRIGGERED:", new Date().toISOString());
			
			try {
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
				const webhooks = webhookData.data?.webhookSubscriptions?.nodes || [];
				
				const inventoryWebhook = webhooks.find(
					(webhook: any) => webhook.topic === "INVENTORY_LEVELS_UPDATE"
				);
				
				console.log("📊 Webhook status check completed:", {
					totalWebhooks: webhooks.length,
					inventoryWebhookActive: !!inventoryWebhook,
					inventoryWebhook: inventoryWebhook
				});
				
				// Check if webhook URL is correct
				const correctUrl = process.env.SHOPIFY_APP_URL + "/webhooks";
				const urlMismatch = inventoryWebhook && inventoryWebhook.callbackUrl !== correctUrl;
				
				return json({
					resp: null,
					storeValue: null,
					error: null,
					webhookStatus: {
						totalWebhooks: webhooks.length,
						inventoryWebhookActive: !!inventoryWebhook,
						inventoryWebhook: inventoryWebhook,
						correctWebhookUrl: correctUrl,
						urlMismatch: urlMismatch,
						message: !inventoryWebhook 
							? "❌ INVENTORY_LEVELS_UPDATE webhook is NOT configured - this is why automation isn't working!"
							: urlMismatch
							? `⚠️ Webhook URL mismatch! Expected: ${correctUrl}, Got: ${inventoryWebhook.callbackUrl}`
							: "✅ INVENTORY_LEVELS_UPDATE webhook is properly configured"
					},
					timestamp: new Date().toISOString()
				});
			} catch (error) {
				console.error("❌ Webhook status check failed:", error);
				return json({
					resp: null,
					storeValue: null,
					error: "Webhook status check failed: " + (error instanceof Error ? error.message : "Unknown error"),
					timestamp: new Date().toISOString()
				});
			}
		}

	}
};

export default function Index() {
	const nav = useNavigation();
	const actionData = useActionData<typeof action>();
	const loaderData = useLoaderData<typeof loader>();
	const submit = useSubmit();
	const dates = Array.from({ length: 11 }, (_, i) => {
		const date = new Date();
		date.setDate(date.getDate() - i);
		return date.toISOString().split("T")[0];
	});
	const [state] = useState<ApexProps>({
		options: {
			chart: {
				height: 150,
				type: "line",
			},
			dataLabels: {
				enabled: false,
			},
			stroke: {
				curve: "straight",
			},
			title: {
				text: "Store Value",
				align: "left",
			},
			grid: {
				row: {
					colors: ["#f3f3f3", "transparent"], // takes an array which will be repeated on columns
					opacity: 0.5,
				},
			},
			xaxis: {
				categories: loaderData.storeValue.map((val) => val.date).reverse(),
			},
		},
		series: [
			{
				name: "Store Value",
				data: loaderData.storeValue.map((val) => val.value).reverse(),
			},
		],
	});
	// admin = authenticate.admin(request);

	const isLoading =
		["loading", "submitting"].includes(nav.state) && nav.formMethod === "POST";


	// Unused
	// const triggerLocation = () => {
	// 	const formData = new FormData();
	// 	formData.append("type", "ItemLevelCheck");
	// 	submit(formData, { method: "POST" });
	// };
	const checkStoreValue = () => {
		const formData = new FormData();
		formData.append("type", "CheckStoreValue");
		submit(formData, { method: "POST" });
	};

	return (
		<Page title="Master Control Panel">
			<BlockStack gap="500">
				<Layout>
					<Layout.Section>
						<Card>
							<BlockStack gap="500">
								<BlockStack gap="200">
									<Text as="h2" variant="headingMd">
										Import Products
									</Text>
									<Link url="/app/trolltoad" removeUnderline>
										Troll & Toad Import
									</Link>
								</BlockStack>
								<BlockStack gap="200">
									<Text as="h3" variant="headingMd">
										PSA Card Import
									</Text>
									<Link url="/app/psa" removeUnderline>
										PSA Card Import
									</Link>
								</BlockStack>
								<BlockStack gap="200">
									<Text as="h3" variant="headingMd">
										Manual Product Creation
									</Text>
									<Link url="/app/manual" removeUnderline>
										Manual Product Creation
									</Link>
								</BlockStack>
							</BlockStack>
							<BlockStack gap="200">
								<Text as="h3" variant="headingMd">
									💰 Analytics
								</Text>
								<Chart
									options={state.options}
									series={state.series}
									type="line"
									name="chart"
									width="900"
								/>
								<InlineStack gap="300">
									<Button loading={isLoading} onClick={checkStoreValue}>
										Calculate store value
									</Button>
									<Button 
										loading={isLoading} 
										onClick={() => {
											const formData = new FormData();
											formData.append("type", "ItemLevelCheck");
											submit(formData, { method: "POST" });
										}}
									>
										Test Draft Automation
									</Button>
									<Button 
										loading={isLoading} 
										onClick={() => {
											const formData = new FormData();
											formData.append("type", "TestWebhookStatus");
											submit(formData, { method: "POST" });
										}}
									>
										Check Webhook Status
									</Button>
								</InlineStack>
								{actionData?.storeValue && (
									<Box
										padding="400"
										background="bg-surface-active"
										borderWidth="025"
										borderRadius="200"
										borderColor="border"
										overflowX="scroll"
									>
										<pre style={{ margin: 0 }}>
											<code>
												Current Store Value:{" "}
												{JSON.stringify(actionData.storeValue, null, 2)}
											</code>
										</pre>
									</Box>
								)}
								
								{actionData?.message && (
									<Box
										padding="400"
										background="bg-surface-active"
										borderWidth="025"
										borderRadius="200"
										borderColor="border"
									>
										<Text as="h3" variant="headingMd">Draft Automation Test Results</Text>
										<Text>{actionData.message}</Text>
										<Text variant="bodySm">Timestamp: {actionData.timestamp}</Text>
									</Box>
								)}
								
								{actionData?.webhookStatus && (
									<Box
										padding="400"
										background="bg-surface-active"
										borderWidth="025"
										borderRadius="200"
										borderColor="border"
									>
										<Text as="h3" variant="headingMd">Webhook Status</Text>
										<Text>{actionData.webhookStatus.message}</Text>
										<Text variant="bodySm">Total Webhooks: {actionData.webhookStatus.totalWebhooks}</Text>
										<Text variant="bodySm">Inventory Webhook Active: {actionData.webhookStatus.inventoryWebhookActive ? "✅ Yes" : "❌ No"}</Text>
										<Text variant="bodySm">Timestamp: {actionData.timestamp}</Text>
									</Box>
								)}
								
								{actionData?.error && (
									<Box
										padding="400"
										background="bg-critical-subdued"
										borderWidth="025"
										borderRadius="200"
										borderColor="border-critical"
									>
										<Text as="h3" variant="headingMd" tone="critical">Error</Text>
										<Text tone="critical">{actionData.error}</Text>
										<Text variant="bodySm">Timestamp: {actionData.timestamp}</Text>
									</Box>
								)}
							</BlockStack>
						</Card>
					</Layout.Section>
				</Layout>
			</BlockStack>
		</Page>
	);
}
