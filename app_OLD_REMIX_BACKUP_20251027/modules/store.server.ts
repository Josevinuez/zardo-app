import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import {
	collectionAddProducts,
	getCollectionProductIds,
	getFirst100LowItems,
	getInventoryValuePage,
	getNext100LowItems,
	getProductExists,
	getProducts,
	type ProductEdgeIndexReturn,
	type ProductIndexReturn,
	setCollectionProductOrder,
	setDraft,
	waitUntilJobDone,
} from "./queries.server";
import {
	countProducts,
	deleteProducts,
	findEmailSent,
	findManyKeywordsWithEmail,
	findProducts,
	upsertProduct,
} from "./prisma.queries.server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import fs from "node:fs/promises";
import db from "../db.server";
import { unauthenticated } from "../shopify.server";
import { loginDetails, sendBulkEmailWithSES } from "./mail.server";

export const STORE_VALUE_NOTIFICATION_EMAIL =
	process.env.STORE_VALUE_NOTIFY ?? "pepejosemiguel@hotmail.com";

function extractNumericIdFromGid(value: string | null | undefined) {
	if (typeof value !== "string") {
		return null;
	}
	const match = value.match(/(\d+)$/);
	return match ? match[1] ?? null : null;
}

function normalizeProductGid(raw: unknown): string | null {
	if (typeof raw === "number" && Number.isFinite(raw)) {
		return `gid://shopify/Product/${raw}`;
	}
	if (typeof raw !== "string") {
		return null;
	}
	const trimmed = raw.trim();
	if (trimmed === "") {
		return null;
	}
	if (trimmed.startsWith("gid://")) {
		return trimmed;
	}
	if (/^\d+$/.test(trimmed)) {
		return `gid://shopify/Product/${trimmed}`;
	}
	return trimmed;
}

const PRODUCT_STATUS_BYPASS_IDS = (() => {
	const raw = process.env.PRODUCT_STATUS_BYPASS_IDS ?? "";
	const entries = raw
		.split(",")
		.map((token) => token.trim())
		.filter(Boolean);
	const mapped = new Set<string>();
	for (const entry of entries) {
		mapped.add(entry);
		const normalized = normalizeProductGid(entry);
		if (normalized) {
			mapped.add(normalized);
			const numericId = extractNumericIdFromGid(normalized);
			if (numericId) {
				mapped.add(numericId);
			}
		}
	}
	return mapped;
})();

function normalizeCollectionId(raw: string | undefined | null) {
	if (!raw) {
		return null;
	}
	const trimmed = raw.trim();
	if (trimmed === "") {
		return null;
	}
	if (trimmed.startsWith("gid://")) {
		return trimmed;
	}
	if (/^\d+$/.test(trimmed)) {
		return `gid://shopify/Collection/${trimmed}`;
	}
	console.warn("normalizeCollectionId: unknown collection id format; using raw value", {
		raw,
	});
	return trimmed;
}

const NEW_ARRIVALS_COLLECTION_ID = normalizeCollectionId(process.env.NEW_ARRIVALS_COLLECTION_ID);
const NEW_ARRIVALS_COLLECTION_HANDLE = process.env.NEW_ARRIVALS_COLLECTION_HANDLE ?? "new-arrivals";
const newArrivalsCollectionCache = new Map<string, string | null>();
const STATIC_SHOP_COLLECTION_OVERRIDES: Record<string, string> = {};

const zardoOverride = normalizeCollectionId(
	process.env.ZARDO_NEW_ARRIVALS_COLLECTION_ID ?? "491004985656",
);
if (zardoOverride) {
	STATIC_SHOP_COLLECTION_OVERRIDES["zardopokemon.myshopify.com"] = zardoOverride;
}

type ComplianceInput = {
	shop: string;
	productId?: unknown;
	status?: unknown;
	available?: unknown;
	inventoryItemId?: unknown;
};

type StoreValueJobInput = {
	shop: string;
	locationID: string;
	notifyEmail?: string | null;
};


function extractAvailableQuantity(record: any): number {
	const quantities = record?.inventoryLevel?.quantities;
	if (!Array.isArray(quantities)) {
		return 0;
	}
	const availableEntry = quantities.find((entry) => entry?.name === "available");
	if (!availableEntry) {
		return 0;
	}
	const quantityValue = availableEntry.quantity;
	if (typeof quantityValue === "number") {
		return quantityValue;
	}
	if (typeof quantityValue === "string") {
		const parsed = Number.parseFloat(quantityValue);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function extractPrice(record: any): number {
	const priceValue = record?.variant?.price;
	if (typeof priceValue === "number") {
		return priceValue;
	}
	if (typeof priceValue === "string") {
		const parsed = Number.parseFloat(priceValue);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

export async function checkAllProducts(
	admin: AdminApiContext,
	locationID: string,
) {
	console.log("🔍 Starting manual inventory check for location:", locationID);
	const itemsLow = [];
	const itemPriceArray = [];
	const respStart = await getFirst100LowItems(admin, locationID);
	let hasNextPage = respStart.data.inventoryItems.pageInfo.hasNextPage;
	let startCursor = respStart.data.inventoryItems.pageInfo.endCursor;
	
	console.log("📊 Found", respStart.data.inventoryItems.edges.length, "inventory items in first batch");
	
	for (let i = 0; i < respStart.data.inventoryItems.edges.length; i++) {
		itemPriceArray.push(
			respStart.data.inventoryItems.edges[i].node.variant.price,
		);
		if (
			respStart.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
				.quantity === 0
		) {
			itemsLow.push(
				respStart.data.inventoryItems.edges[i].node.variant.product.id,
			);
			console.log("📝 Found 0-quantity product:", respStart.data.inventoryItems.edges[i].node.variant.product.id);
		}
	}
	while (hasNextPage) {
		const resp = await getNext100LowItems(admin, locationID, startCursor);
		startCursor = resp.data.inventoryItems.pageInfo.endCursor;
		hasNextPage = resp.data.inventoryItems.pageInfo.hasNextPage;
		console.log("📊 Processing next batch:", resp.data.inventoryItems.edges.length, "items");
		
		for (let i = 0; i < resp.data.inventoryItems.edges.length; i++) {
			itemPriceArray.push(resp.data.inventoryItems.edges[i].node.variant.price);
			if (
				resp.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
					.quantity === 0
			) {
				itemsLow.push(
					resp.data.inventoryItems.edges[i].node.variant.product.id,
				);
				console.log("📝 Found 0-quantity product:", resp.data.inventoryItems.edges[i].node.variant.product.id);
			}
		}
	}

	console.log("📋 Total products with 0 quantity:", itemsLow.length);
	
	for (let i = 0; i < itemsLow.length; i++) {
		console.log("📝 Setting product to DRAFT:", itemsLow[i]);
		try {
			const resp = await setDraft(admin, itemsLow[i]);
			console.log("✅ Successfully set product to DRAFT:", resp);
		} catch (error) {
			console.error("❌ Error setting product to DRAFT:", error);
		}
	}
	
	console.log("🎉 Manual inventory check completed");
	return { status: "SUCCESS", itemsProcessed: itemsLow.length };
}

async function calculateStoreValueViaCursorPagination(
	admin: AdminApiContext,
	locationID: string,
): Promise<number> {
	console.log("🔁 Falling back to paginated inventory calculation", { locationID });

	let runningTotal = 0;
	let processed = 0;

	const accumulateFromResponse = (response: any) => {
		const inventoryItems = response?.data?.inventoryItems;
		if (!inventoryItems && response?.errors) {
			const message = Array.isArray(response.errors)
				? response.errors.map((err: { message?: string; locations?: unknown; path?: unknown }) => {
					const base = err?.message ?? "Unknown error";
					if (err?.locations || err?.path) {
						return `${base} (locations: ${JSON.stringify(err.locations)}, path: ${JSON.stringify(err.path)})`;
					}
					return base;
				}).join("; ")
				: "Unknown error from inventory query";
			throw new Error(message);
		}
		if (!inventoryItems) {
			console.warn("Inventory value query returned no data", { response });
			return { hasNextPage: false, endCursor: null };
		}
		const edges = Array.isArray(inventoryItems.edges) ? inventoryItems.edges : [];
		for (const edge of edges) {
			const node = edge?.node;
			if (!node) {
				continue;
			}
			const price = extractPrice(node);
			if (price <= 0) {
				continue;
			}
			const quantity = extractAvailableQuantity(node);
			if (quantity <= 0) {
				continue;
			}
			runningTotal += price * quantity;
			processed += 1;
		}
		const pageInfo = inventoryItems.pageInfo ?? {};
		return {
			hasNextPage: Boolean(pageInfo?.hasNextPage),
			endCursor: pageInfo?.endCursor ?? null,
		};
	};

	const firstResp = await getInventoryValuePage(admin, locationID, null);
	let { hasNextPage, endCursor } = accumulateFromResponse(firstResp);

	while (hasNextPage && endCursor) {
		const nextResp = await getInventoryValuePage(admin, locationID, endCursor);
		const nextPage = accumulateFromResponse(nextResp);
		hasNextPage = nextPage.hasNextPage;
		endCursor = nextPage.endCursor;
		if (hasNextPage && !endCursor) {
			console.warn("⚠️ Missing endCursor while hasNextPage is true; stopping pagination to avoid infinite loop.");
			break;
		}
	}

	const totalPrice = Number.parseFloat(runningTotal.toFixed(2));
	console.log("📈 Store value calculated via fallback", { totalPrice, processed });
	return totalPrice;
}

export async function getTotalStoreValue(
	admin: AdminApiContext,
	locationID: string,
) {
	if (!locationID) {
		throw new Error("Location ID is required to calculate store value");
	}

	const totalPrice = await calculateStoreValueViaCursorPagination(admin, locationID);
	return { totalPrice };
}

export async function ensureProductCompliance(input: ComplianceInput) {
	console.log("🧩 ensureProductCompliance invoked", input);
	try {
		const { productId: rawProductId, inventoryItemId, shop } = input;
		console.log("ensureProductCompliance: context", { rawProductId, inventoryItemId, shop });
		if (!shop) {
			console.warn("ensureProductCompliance: missing shop; aborting", input);
			return;
		}
		const { admin } = await unauthenticated.admin(shop);
		let productId = normalizeProductGid(rawProductId);
		if (!productId && inventoryItemId) {
			productId = await lookupProductIdFromInventory(admin, inventoryItemId);
		}
		if (!productId) {
			console.warn("ensureProductCompliance: unable to resolve product id", input);
			return;
		}
		const current = await getProductExists(admin, productId);
		const product = current?.data?.product;
		if (!product) {
			console.warn("ensureProductCompliance: product not found", { productId });
			return;
		}
		const totalInventory = product.totalInventory ?? 0;
		const numericProductId = extractNumericIdFromGid(productId);
		const bypassed = PRODUCT_STATUS_BYPASS_IDS.size > 0 && (
			PRODUCT_STATUS_BYPASS_IDS.has(productId)
			|| (numericProductId ? PRODUCT_STATUS_BYPASS_IDS.has(numericProductId) : false)
		);
		const desiredStatus = totalInventory > 0 || bypassed ? "ACTIVE" : "DRAFT";
		console.log("ensureProductCompliance: inventory snapshot", { productId, totalInventory, currentStatus: product.status, desiredStatus, bypassed });
		if (product.status !== desiredStatus) {
			console.log("ensureProductCompliance: updating status", {
				productId,
				from: product.status,
				to: desiredStatus,
			});
			const statusMutation = `#graphql
				mutation UpdateProductStatus($id: ID!, $status: ProductStatus!) {
					productUpdate(product: { id: $id, status: $status }) {
						userErrors { field message }
						product { id status }
					}
				}
			`;
			const statusResponse = await admin.graphql(statusMutation, {
				variables: { id: productId, status: desiredStatus },
			});
			const statusJson = await statusResponse.json();
			const errors = statusJson?.data?.productUpdate?.userErrors ?? [];
			if (errors.length > 0) {
				console.error("ensureProductCompliance: status update errors", errors);
			}
		}
		if (desiredStatus === "ACTIVE") {
			await publishProductToAllChannels(admin, productId);
			if (totalInventory > 0) {
				const newArrivalsCollectionId = await resolveNewArrivalsCollectionId(
					admin,
					shop,
				);
				if (newArrivalsCollectionId) {
					console.log("ensureProductCompliance: adding to new arrivals", {
						productId,
						collectionId: newArrivalsCollectionId,
					});
					const collectionResult = await addToCollectionFront(
						admin,
						productId,
						newArrivalsCollectionId,
					);
					if (!collectionResult?.success) {
						console.error("ensureProductCompliance: failed to add to new arrivals", {
							productId,
							collectionId: newArrivalsCollectionId,
							error: collectionResult?.error,
						});
					}
				}
			}
		}
		console.log("ensureProductCompliance completed", { productId, desiredStatus, totalInventory });
	} catch (error) {
		console.error("ensureProductCompliance failed", { input, error });
	}
}

async function lookupProductIdFromInventory(admin: AdminApiContext, inventoryItemId: unknown) {
	if (!inventoryItemId) {
		return null;
	}
	const resolvedId = typeof inventoryItemId === "string"
		? inventoryItemId
		: typeof inventoryItemId === "number"
			? `gid://shopify/InventoryItem/${inventoryItemId}`
			: null;
	if (!resolvedId) {
		return null;
	}
	const query = `#graphql
		query FindProductFromInventoryItem($id: ID!) {
			inventoryItem(id: $id) {
				id
				variant {
					id
					product {
						id
					}
				}
			}
		}
	`;
	const response = await admin.graphql(query, { variables: { id: resolvedId } });
	const data = await response.json();
	return data?.data?.inventoryItem?.variant?.product?.id ?? null;
}

async function publishProductToAllChannels(admin: AdminApiContext, productId: string) {
	console.log("Publishing product to all channels", { productId });
	const publicationsQuery = `#graphql
		query {
			publications(first: 50) {
				nodes {
					id
					name
				}
			}
		}
	`;
	const publicationsResp = await admin.graphql(publicationsQuery);
	const publicationsJson = await publicationsResp.json();
	const publications = publicationsJson?.data?.publications?.nodes ?? [];
	if (publications.length === 0) {
		console.warn("No publications found; skip publishing", { productId });
		return;
	}
	const publishMutation = `#graphql
		mutation PublishProductEverywhere($id: ID!, $input: [PublicationInput!]!) {
			publishablePublish(id: $id, input: $input) {
				publishable {
					... on Product {
						id
						status
					}
				}
				userErrors {
					field
					message
				}
			}
		}
	`;
	const publishResp = await admin.graphql(publishMutation, {
		variables: {
			id: productId,
			input: publications.map((publication: { id: string }) => ({
				publicationId: publication.id,
			})),
		},
	});
	const publishJson = await publishResp.json();
	const userErrors = publishJson?.data?.publishablePublish?.userErrors ?? [];
	if (userErrors.length > 0) {
		console.error("Publishing returned userErrors", userErrors);
	} else {
		console.log("Product published to all channels", { productId });
	}
}
async function resolveNewArrivalsCollectionId(admin: AdminApiContext, shop: string) {
	if (NEW_ARRIVALS_COLLECTION_ID) {
		if (shop) {
			newArrivalsCollectionCache.set(shop, NEW_ARRIVALS_COLLECTION_ID);
		}
		console.log("resolveNewArrivalsCollectionId: using configured collection id", {
			collectionId: NEW_ARRIVALS_COLLECTION_ID,
			shop,
		});
		return NEW_ARRIVALS_COLLECTION_ID;
	}
	if (shop) {
		const shopOverride = STATIC_SHOP_COLLECTION_OVERRIDES[shop.toLowerCase()];
		if (shopOverride) {
			newArrivalsCollectionCache.set(shop, shopOverride);
			console.log("resolveNewArrivalsCollectionId: using shop override collection id", {
				collectionId: shopOverride,
				shop,
			});
			return shopOverride;
		}
	}
	if (!shop) {
		console.warn("resolveNewArrivalsCollectionId: missing shop context");
		return null;
	}
	if (newArrivalsCollectionCache.has(shop)) {
		return newArrivalsCollectionCache.get(shop) ?? null;
	}
	if (!NEW_ARRIVALS_COLLECTION_HANDLE) {
		console.warn("resolveNewArrivalsCollectionId: no handle configured; set NEW_ARRIVALS_COLLECTION_HANDLE or NEW_ARRIVALS_COLLECTION_ID");
		newArrivalsCollectionCache.set(shop, null);
		return null;
	}
	const query = `#graphql
		query CollectionByHandle($handle: String!) {
			collectionByHandle(handle: $handle) {
				id
				handle
				title
			}
		}
	`;
	try {
		const response = await admin.graphql(query, {
			variables: { handle: NEW_ARRIVALS_COLLECTION_HANDLE },
		});
		const data = await response.json();
		const collectionId = data?.data?.collectionByHandle?.id ?? null;
		if (!collectionId) {
			console.warn("resolveNewArrivalsCollectionId: collection not found", {
				handle: NEW_ARRIVALS_COLLECTION_HANDLE,
				shop,
			});
			newArrivalsCollectionCache.set(shop, null);
			return null;
		}
		newArrivalsCollectionCache.set(shop, collectionId);
		return collectionId;
	} catch (error) {
		console.error("resolveNewArrivalsCollectionId failed", {
			handle: NEW_ARRIVALS_COLLECTION_HANDLE,
			shop,
			error,
		});
		newArrivalsCollectionCache.set(shop, null);
		return null;
	}
}
async function runStoreValueJob(
	admin: AdminApiContext,
	{ shop, locationID, notifyEmail }: StoreValueJobInput,
) {
	console.log("🧮 [job] Starting store value job", { shop, locationID, notifyEmail });
	try {
		const { totalPrice } = await getTotalStoreValue(admin, locationID);
		await db.analytics.create({
			data: {
				value: totalPrice,
			},
		});
		console.log("🧮 [job] Store value persisted", { totalPrice });
		if (notifyEmail) {
			const htmlBody = `<p>Store value calculation for ${shop} completed.</p><p><strong>Total value:</strong> $${totalPrice.toFixed(2)}</p>`;
			const textBody = `Store value calculation for ${shop} completed. Total value: $${totalPrice.toFixed(2)}`;
			const emailResult = await sendBulkEmailWithSES({
				from: loginDetails.from,
				to: [notifyEmail],
				subject: `Store value ready for ${shop}`,
				htmlBody,
				textBody,
				attachments: [],
			});
			console.log("📧 [job] Notification email result", emailResult);
		}
		console.log("✅ [job] Store value job completed", { shop, locationID });
	} catch (error) {
		console.error("❌ [job] Store value job failed", error);
		throw error;
	}
}

export async function scheduleStoreValueCalculation({
	admin,
	shop,
	locationID,
	notifyEmail = STORE_VALUE_NOTIFICATION_EMAIL,
}: {
	admin: AdminApiContext;
	shop: string;
	locationID: string;
	notifyEmail?: string | null;
}) {
	const jobId = `store-value-${shop}-${Date.now()}-${randomUUID()}`;
	console.log("🗂️ Scheduling store value job", { jobId, shop, locationID, notifyEmail });
	void runStoreValueJob(admin, { shop, locationID, notifyEmail }).catch((error) => {
		console.error("❌ [job] Store value job crashed", { jobId, error });
	});
	return { jobId, status: "QUEUED" } as const;
}

export async function emailRepeatedCheck({ product_id }: { product_id: string }) {
	const oneDayAgo = new Date().getTime() - (1 * 24 * 60 * 60 * 1000)
	const email = await findEmailSent({
		where: {
			id: product_id
		}
	})
	if (!email) return false
	return email.lastSent.getTime() > oneDayAgo
}

export async function checkMatchWishlists({ productName }: { productName: string }): Promise<string[]> {
	const allKeywordsWithEmail = (await findManyKeywordsWithEmail({})) as Array<{
		value: string;
		Wishlists: Array<{ email: string | null }>;
	}>;

	const lowerName = productName.toLowerCase();

	return allKeywordsWithEmail
		.filter((keywordWithEmail) => lowerName.includes(keywordWithEmail.value.toLowerCase()))
		.flatMap((matched) =>
			matched.Wishlists
				.map((wishlist) => wishlist.email)
				.filter((email): email is string => email !== null),
		);
}

export async function addToCollectionFront(
	admin: AdminApiContext,
	productId: string,
	collectionId: string,
) {
	try {
		const existingProductIds = await getCollectionProductIds(admin, collectionId);

		const productExists = existingProductIds.includes(productId);

		const shopifyProduct = await getProductExists(admin, productId)
		const isRawCard = shopifyProduct.data.product.variants.nodes.some((variant: { selectedOptions: { name: string; value: string; }[]; }) => {
			return variant.selectedOptions.some((option: { name: string; value: string; }) => {
				return option.name === "Condition";
			});
		})
		if (isRawCard) {
			throw new Error(`Product ${productId} is a raw card`);
		}

		if (!productExists) {
			const addResult = await collectionAddProducts(admin, collectionId, [productId]);

			if (addResult.data.collectionAddProductsV2.userErrors &&
				addResult.data.collectionAddProductsV2.userErrors.length > 0) {
				throw new Error(`Error adding product to collection: ${JSON.stringify(addResult.data.collectionAddProductsV2.userErrors)}`);
			}

			if (addResult.data.collectionAddProductsV2.job) {
				await waitUntilJobDone(admin, addResult.data.collectionAddProductsV2.job.id);
			}
		}

		const reorderResult = await setCollectionProductOrder(admin, productId, collectionId, 0);

		if (reorderResult.data.collectionReorderProducts.userErrors &&
			reorderResult.data.collectionReorderProducts.userErrors.length > 0) {
			throw new Error(`Error reordering product: ${JSON.stringify(reorderResult.data.collectionReorderProducts.userErrors)}`);
		}

		if (reorderResult.data.collectionReorderProducts.job) {
			await waitUntilJobDone(admin, reorderResult.data.collectionReorderProducts.job.id);
		}

		return {
			success: true,
			productAdded: !productExists,
			productReordered: true
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}


// Sync Shopify Products to Supabase
export async function syncShopifyProductsToSupabase(admin: AdminApiContext) {
	let cursor: null | string = null;
	const products: ProductEdgeIndexReturn[] = [];
	let hasNextPage = true;
	do {
		const products_query = await getProducts(admin, cursor);
		const data = products_query.data?.products as ProductIndexReturn;
		cursor = data.pageInfo.endCursor;
		hasNextPage = data.pageInfo.hasNextPage;
		products.push(...data.edges);
		console.log(cursor)
		await setTimeout(2500);
	} while (cursor && hasNextPage);
	
	console.log(`Starting sync of ${products.length} products to Supabase database`);
	
	for (const product of products) {
		try {
			await upsertProduct({
				where: {
					id: product.node.id,
				},
				update: {
					description: product.node.description,
					totalInventory: product.node.totalInventory,
					status: product.node.status,
					title: product.node.title,
					variants: {
						connectOrCreate: product.node.variants.nodes.map((variant) => {
							return {
								where: {
									id: variant.id,
								},
								create: {
									id: variant.id,
									title: variant.title,
									barcode: variant.barcode !== "" ? variant.barcode : null,
									sku: variant.sku,
									price: Number.parseFloat(variant.price),
									inventoryQuantity: variant.inventoryQuantity,
								},
							} as Prisma.ProductVariantCreateOrConnectWithoutProductInput;
						}),
						updateMany: product.node.variants.nodes.map((variant) => {
							return {
								where: {
									id: variant.id,
								},
								data: {
									title: variant.title,
									barcode: variant.barcode !== "" ? variant.barcode : null,
									sku: variant.sku,
									price: Number.parseFloat(variant.price),
									inventoryQuantity: variant.inventoryQuantity,
								},
							} as Prisma.ProductVariantUpdateManyWithWhereWithoutProductInput;
						}),
					},
				},
				create: {
					id: product.node.id,
					title: product.node.title,
					description: product.node.description,
					totalInventory: product.node.totalInventory,
					status: product.node.status,
					variants: {
						connectOrCreate: product.node.variants.nodes.map((variant) => {
							return {
								where: {
									id: variant.id,
								},
								create: {
									id: variant.id,
									title: variant.title,
									barcode: variant.barcode !== "" ? variant.barcode : null,
									sku: variant.sku,
									price: Number.parseFloat(variant.price),
									inventoryQuantity: variant.inventoryQuantity,
								},
							} as Prisma.ProductVariantCreateOrConnectWithoutProductInput;
						}),
					},
				} as Prisma.ProductCreateInput,
			});
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError) {
				if (error.code === "P2002") {
					console.log("Product already exists");
					const content = `ID: ${product.node.id} Name: ${product.node.title}\n`;
					await fs.writeFile("duplicates.txt", content, { flag: "a+" });
					continue;
				}
			}
			console.log("Error upserting: ", error);
			// continue;
		}
	}
	console.log("Done upserting products");

}

export async function deleteIndexProducts() {
	const count = await countProducts({});
	// Delete products in batches of 100
	for (let i = 0; i < Math.ceil(count / 100); i++) {
		// Get the next 100 products
		const products = await findProducts({
			take: 100,
		});
		// Delete the products
		await deleteProducts({
			where: {
				id: {
					in: products.map((product) => product.id),
				},
			},
		});
	}
}
