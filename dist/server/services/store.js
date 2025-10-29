import { collectionAddProducts, getCollectionProductIds, getFirst100Items, getFirst100LowItems, getNext100Items, getNext100LowItems, getProductExists, getProducts, setCollectionProductOrder, setDraft, waitUntilJobDone, } from "./queries.js";
import { countProducts, deleteProducts, findEmailSent, findManyKeywordsWithEmail, findProducts, upsertProduct, } from "./prisma-queries.js";
import { Prisma } from "@prisma/client";
import { setTimeout } from "node:timers/promises";
import fs from "node:fs/promises";
export async function checkAllProducts(admin, locationID) {
    console.log("🔍 Starting manual inventory check for location:", locationID);
    const itemsLow = [];
    const itemPriceArray = [];
    const respStart = await getFirst100LowItems(admin, locationID);
    let hasNextPage = respStart.data.inventoryItems.pageInfo.hasNextPage;
    let startCursor = respStart.data.inventoryItems.pageInfo.endCursor;
    console.log("📊 Found", respStart.data.inventoryItems.edges.length, "inventory items in first batch");
    for (let i = 0; i < respStart.data.inventoryItems.edges.length; i++) {
        itemPriceArray.push(respStart.data.inventoryItems.edges[i].node.variant.price);
        if (respStart.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
            .quantity === 0) {
            itemsLow.push(respStart.data.inventoryItems.edges[i].node.variant.product.id);
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
            if (resp.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
                .quantity === 0) {
                itemsLow.push(resp.data.inventoryItems.edges[i].node.variant.product.id);
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
        }
        catch (error) {
            console.error("❌ Error setting product to DRAFT:", error);
        }
    }
    console.log("🎉 Manual inventory check completed");
    return { status: "SUCCESS", itemsProcessed: itemsLow.length };
}
// Bulk operations for efficient large-scale inventory calculation
async function calculateStoreValueViaBulkOperation(admin, session, locationID) {
    console.log("🚀 Starting BULK OPERATIONS inventory calculation");
    const query = `
		query bulkInventoryValue {
			inventoryItems {
				edges {
					node {
						id
						inventoryLevels(first: 10, locationIds: ["gid://shopify/Location/${locationID}"]) {
							edges {
								node {
									quantities(names: ["available"]) {
										name
										quantity
									}
								}
							}
						}
						variant {
							id
							price
						}
					}
				}
			}
		}
	`;
    try {
        // Step 1: Create bulk operation
        const bulkOperationMutation = `
			mutation bulkOperationRunQuery($query: String!) {
				bulkOperationRunQuery(query: $query) {
					bulkOperation {
						id
						status
					}
					userErrors {
						field
						message
					}
				}
			}
		`;
        console.log("📤 Creating bulk operation...");
        const bulkResponse = await admin.graphql(bulkOperationMutation, {
            variables: { query },
        });
        const bulkData = await bulkResponse.json();
        if (bulkData.errors || bulkData.data?.bulkOperationRunQuery?.userErrors?.length > 0) {
            throw new Error(JSON.stringify(bulkData.errors || bulkData.data?.bulkOperationRunQuery?.userErrors));
        }
        const bulkOperationId = bulkData.data?.bulkOperationRunQuery?.bulkOperation?.id;
        if (!bulkOperationId) {
            throw new Error("Failed to create bulk operation");
        }
        console.log("✅ Bulk operation created:", bulkOperationId);
        // Step 2: Poll for completion
        const pollBulkOperation = `
			query pollBulkOperation($id: ID!) {
				node(id: $id) {
					... on BulkOperation {
						id
						status
						errorCode
						objectCount
						url
					}
				}
			}
		`;
        let isComplete = false;
        let bulkOpUrl = null;
        const maxAttempts = 60; // 5 minutes max wait
        let attempts = 0;
        while (!isComplete && attempts < maxAttempts) {
            await setTimeout(5000); // Wait 5 seconds between polls
            attempts++;
            const pollResponse = await admin.graphql(pollBulkOperation, {
                variables: { id: bulkOperationId },
            });
            const pollData = await pollResponse.json();
            const bulkOp = pollData.data?.node;
            const status = bulkOp?.status;
            console.log(`📊 Poll ${attempts}: Status = ${status}`);
            if (status === "COMPLETED") {
                isComplete = true;
                bulkOpUrl = bulkOp?.url;
                console.log("✅ Bulk operation completed! Results available at:", bulkOpUrl);
            }
            else if (status === "FAILED" || status === "CANCELED") {
                throw new Error(`Bulk operation failed: ${bulkOp?.errorCode || status}`);
            }
        }
        if (!isComplete) {
            throw new Error("Bulk operation timeout - taking too long to complete");
        }
        // Step 3: Download and process results
        console.log("📥 Downloading bulk operation results...");
        const downloadResponse = await fetch(bulkOpUrl, {
            headers: {
                "X-Shopify-Access-Token": session.accessToken || "",
            },
        });
        if (!downloadResponse.ok) {
            throw new Error(`Failed to download bulk results: ${downloadResponse.statusText}`);
        }
        const text = await downloadResponse.text();
        const lines = text.trim().split("\n");
        console.log(`📊 Processing ${lines.length} items from bulk operation...`);
        let totalValue = 0;
        let processedCount = 0;
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const item = JSON.parse(line);
                const price = parseFloat(item.variant?.price || "0");
                const quantity = parseInt(item.inventoryLevels?.[0]?.quantities?.[0]?.quantity || "0", 10);
                if (price > 0 && quantity > 0) {
                    totalValue += price * quantity;
                    processedCount++;
                }
            }
            catch (e) {
                console.error("Error parsing line:", e);
            }
        }
        console.log(`✅ Processed ${processedCount} items. Total value: $${totalValue.toFixed(2)}`);
        return totalValue;
    }
    catch (error) {
        console.error("❌ Bulk operation failed:", error);
        throw error;
    }
}
export async function getTotalStoreValue(admin, session, locationID) {
    // Try bulk operations first, fall back to pagination if it fails
    try {
        const totalPrice = await calculateStoreValueViaBulkOperation(admin, session, locationID);
        return { totalPrice };
    }
    catch (error) {
        console.log("⚠️ Bulk operation failed, falling back to cursor pagination:", error);
        // Fallback to the old pagination method
        const itemPriceArray = [];
        const respStart = await getFirst100Items(admin, locationID);
        let hasNextPage = respStart.data.inventoryItems.pageInfo.hasNextPage;
        let startCursor = respStart.data.inventoryItems.pageInfo.endCursor;
        for (let i = 0; i < respStart.data.inventoryItems.edges.length; i++) {
            const temp = Number.parseFloat(respStart.data.inventoryItems.edges[i].node.variant.price) *
                Number.parseFloat(respStart.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
                    .quantity);
            itemPriceArray.push(temp);
        }
        while (hasNextPage) {
            const resp = await getNext100Items(admin, locationID, startCursor);
            startCursor = resp.data.inventoryItems.pageInfo.endCursor;
            hasNextPage = resp.data.inventoryItems.pageInfo.hasNextPage;
            for (let i = 0; i < resp.data.inventoryItems.edges.length; i++) {
                const temp = Number.parseFloat(resp.data.inventoryItems.edges[i].node.variant.price) *
                    Number.parseFloat(resp.data.inventoryItems.edges[i].node.inventoryLevel.quantities[0]
                        .quantity);
                itemPriceArray.push(temp);
            }
        }
        let totalPrice = itemPriceArray.reduce((a, b) => a + b, 0);
        totalPrice = Number.parseFloat(totalPrice.toFixed(2));
        return { totalPrice: totalPrice };
    }
}
export async function emailRepeatedCheck({ product_id }) {
    const oneDayAgo = new Date().getTime() - (1 * 24 * 60 * 60 * 1000);
    const email = await findEmailSent({
        where: {
            id: product_id
        }
    });
    if (!email)
        return false;
    return email.lastSent.getTime() > oneDayAgo;
}
export async function checkMatchWishlists({ productName }) {
    const allKeywordsWithEmail = (await findManyKeywordsWithEmail({}));
    const lowerName = productName.toLowerCase();
    return allKeywordsWithEmail
        .filter((keywordWithEmail) => lowerName.includes(keywordWithEmail.value.toLowerCase()))
        .flatMap((matched) => matched.Wishlists
        .map((wishlist) => wishlist.email)
        .filter((email) => email !== null));
}
export async function addToCollectionFront(admin, productId, collectionId) {
    try {
        const existingProductIds = await getCollectionProductIds(admin, collectionId);
        const productExists = existingProductIds.includes(productId);
        const shopifyProduct = await getProductExists(admin, productId);
        const isRawCard = shopifyProduct.data.product.variants.nodes.some((variant) => {
            return variant.selectedOptions.some((option) => {
                return option.name === "Condition";
            });
        });
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
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
// Sync Shopify Products to Supabase
export async function syncShopifyProductsToSupabase(admin) {
    let cursor = null;
    const products = [];
    let hasNextPage = true;
    do {
        const products_query = await getProducts(admin, cursor);
        const data = products_query.data?.products;
        cursor = data.pageInfo.endCursor;
        hasNextPage = data.pageInfo.hasNextPage;
        products.push(...data.edges);
        console.log(cursor);
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
                            };
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
                            };
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
                            };
                        }),
                    },
                },
            });
        }
        catch (error) {
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
