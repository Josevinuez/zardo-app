import { shopify } from "../shopify.js";
import Queue from "bee-queue";
import sharp from "sharp";
import { adjustInventory, createBulkVariants, createProductWMedia, getProductExists, productVariantUpdatePrice, } from "./queries.js";
import { removeBg } from "./removebg.js";
import { uploadImageBuffer, } from "./supabase.js";
import { sendNotification } from "./notification.js";
import { getOfflineAdminContext } from "../utils/shopify-admin.js";
export const apiKey = process.env.REMOVE_BG_API_KEY;
export let queueParseTrollToad;
try {
    queueParseTrollToad = new Queue("makeProductTroll");
    queueParseTrollToad.destroy(() => {
        console.log("makeProductTroll Queue was destroyed");
    });
    queueParseTrollToad.process(1, async (job, done) => {
        const { shop, itemIn: ItemFields, existingProductId, } = job.data;
        const name = ItemFields.name;
        const description = ItemFields.description;
        const price = ItemFields.price;
        let shipweight = ItemFields.shipWeight;
        const cardtype = ItemFields.cardType;
        const image = ItemFields.image;
        const variant = ItemFields.variant;
        const quantity = ItemFields.quantity;
        const barcode = ItemFields.barcode;
        shipweight = shipweight.replace(" pounds", "");
        const input_variables = {
            title: name,
            descriptionHtml: description.replace("(Pokemon)", ""),
            productType: cardtype,
            vendor: "",
            tags: [],
            productOptions: [
                {
                    name: "Condition",
                    values: [
                        {
                            name: "Mint",
                        },
                        {
                            name: "Near Mint",
                        },
                        {
                            name: "Low Played",
                        },
                        {
                            name: "Moderately Played",
                        },
                        {
                            name: "Heavily Played",
                        },
                        {
                            name: "Damaged",
                        },
                    ],
                },
            ],
            status: "DRAFT",
        };
        const variants = [];
        if (typeof shipweight === "string" &&
            Number.parseFloat(shipweight) === 0.004) {
            input_variables.productOptions = [
                {
                    name: "Condition",
                    values: [
                        {
                            name: "Mint",
                        },
                        {
                            name: "Near Mint",
                        },
                        {
                            name: "Low Played",
                        },
                        {
                            name: "Moderately Played",
                        },
                        {
                            name: "Heavily Played",
                        },
                        {
                            name: "Damaged",
                        },
                    ],
                },
            ];
            switch (variant) {
                case "mint": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Mint",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "near-mint": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Near Mint",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "low-played": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Low Played",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "moderately-played": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Moderately Played",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "heavily-played": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Heavily Played",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "damaged": {
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        optionValues: [
                            {
                                optionName: "Condition",
                                name: "Damaged",
                            },
                        ],
                        inventoryPolicy: "DENY",
                        inventoryItem: {
                            cost: "0.0",
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                case "standard": {
                    input_variables.productOptions = [
                        {
                            name: "Title",
                            values: [
                                {
                                    name: "Default Title",
                                },
                            ],
                        },
                    ];
                    variants.push({
                        barcode,
                        price: Number.parseFloat(price),
                        inventoryPolicy: "DENY",
                        optionValues: [
                            {
                                optionName: "Title",
                                name: "Default Title",
                            },
                        ],
                        inventoryItem: {
                            cost: price,
                            tracked: true,
                            measurement: {
                                weight: {
                                    unit: "POUNDS",
                                    value: Number.parseFloat(shipweight),
                                },
                            },
                        },
                    });
                    break;
                }
                default:
                    break;
            }
        }
        else {
            input_variables.productOptions = [
                {
                    name: "Title",
                    values: [
                        {
                            name: "Default Title",
                        },
                    ],
                },
            ];
            variants.push({
                barcode,
                price: Number.parseFloat(price),
                inventoryPolicy: "DENY",
                optionValues: [
                    {
                        optionName: "Title",
                        name: "Default Title",
                    },
                ],
                inventoryItem: {
                    cost: price,
                    tracked: true,
                    measurement: {
                        weight: {
                            unit: "POUNDS",
                            value: Number.parseFloat(shipweight),
                        },
                    },
                },
            });
        }
        if (!apiKey) {
            return done(new Error("No API key found for remove.bg"));
        }
        const image_clean = await removeBg(image);
        const resized = await sharp(image_clean)
            .resize(500)
            .png()
            .trim()
            .toBuffer();
        const { data: storageData, error: storageError } = await uploadImageBuffer(resized, "image/png");
        if (storageError) {
            console.error("Supabase storage error", storageError);
            await sendNotification({
                length: 3000,
                title: "Error uploading product: Supabase storage error",
                type: "TROLL",
            });
            return done(new Error("Supabase storage error"));
        }
        const offlineContext = await getOfflineAdminContext(shopify, shop);
        if (!offlineContext) {
            await sendNotification({
                length: 3000,
                title: "No Shopify session available for Troll job",
                type: "TROLL",
            });
            return done(new Error(`No Shopify session available for ${shop}`));
        }
        const { admin } = offlineContext;
        if (existingProductId) {
            const productExists = await getProductExists(admin, existingProductId);
            if (productExists.data.product) {
                const product = productExists.data.product;
                let foundVariant = false;
                for (let i = 0; i < product.variants.nodes.length; i++) {
                    const title = String(product.variants.nodes[i].selectedOptions.find((option) => option.name === "Title" || option.name === "Condition")?.value)
                        .toLowerCase()
                        .replace(" ", "-");
                    if (title === variant || title === "default-title") {
                        foundVariant = true;
                        const invItemId = product.variants.nodes[i].inventoryItem.id;
                        const locationId = product.variants.nodes[i].inventoryItem.inventoryLevels.nodes[0]
                            .location.id;
                        const newQuantity = product.variants.nodes[i].inventoryItem.inventoryLevels.nodes[0]
                            .quantities[0].quantity + Number.parseInt(quantity);
                        const inventory = await adjustInventory(admin, invItemId, locationId, newQuantity);
                        await productVariantUpdatePrice(admin, [
                            {
                                id: product.variants.nodes[i].id,
                                price: Number.parseFloat(price),
                            },
                        ], product.id, true);
                    }
                }
                if (!foundVariant) {
                    const variantsCreated = await createBulkVariants(admin, product.id, variants, "DEFAULT");
                    const variantsErrors = variantsCreated.data.productVariantsBulkCreate.userErrors;
                    if (variantsErrors.length > 0) {
                        console.error("variantsErrors: ", variantsErrors);
                        return done(new Error("Error creating variants"));
                    }
                    const variantsData = variantsCreated.data.productVariantsBulkCreate.productVariants;
                    console.log(`variantsData: ${JSON.stringify(variantsData)}`);
                    for (let i = 0; i < variantsData.length; i++) {
                        const title = String(variantsData[i].selectedOptions.find((option) => option.name === "Title" || option.name === "Condition")?.value)
                            .toLowerCase()
                            .replace(" ", "-");
                        if (title === variant) {
                            const invItemId = variantsData[i].inventoryItem.id;
                            const locationId = variantsData[i].inventoryItem.inventoryLevels.nodes[0].location
                                .id;
                            await adjustInventory(admin, invItemId, locationId, Number.parseInt(quantity));
                        }
                    }
                }
                await sendNotification({
                    length: 3000,
                    title: "Product has been updated",
                    type: "TROLL",
                });
                return done(null);
            }
        }
        // New Product Creation
        const productMedia = [
            {
                alt: "image",
                mediaContentType: "IMAGE",
                originalSource: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${storageData?.path}`,
            },
        ];
        // Create the Product With Media
        const product = await createProductWMedia(admin, input_variables, productMedia);
        if (product.data) {
            if (product.data.productCreate.userErrors &&
                product.data.productCreate.userErrors.length > 0) {
                console.log(product.data.productCreate.userErrors);
                await sendNotification({
                    length: 3000,
                    title: "Error creating product",
                    type: "TROLL",
                });
                return done(new Error("Error creating product"));
            }
            const productId = product.data.productCreate.product.id;
            const variantsCreated = await createBulkVariants(admin, productId, variants, "REMOVE_STANDALONE_VARIANT");
            console.log('variantsCreated: ', variantsCreated);
            const variantsErrors = variantsCreated.data.productVariantsBulkCreate.userErrors;
            if (variantsErrors.length > 0) {
                console.error("variantsErrors: ", variantsErrors);
                return done(new Error("Error creating variants"));
            }
            const variantsData = variantsCreated.data.productVariantsBulkCreate.productVariants;
            for (let i = 0; i < variantsData.length; i++) {
                console.log(`variantsData[i]: ${JSON.stringify(variantsData[i])}`);
                const title = String(variantsData[i].selectedOptions.find((option) => option.name === "Title" || option.name === "Condition")?.value)
                    .toLowerCase()
                    .replace(" ", "-");
                if (title === variant || title === "default-title") {
                    const invItemId = variantsData[i].inventoryItem.id;
                    const locationId = variantsData[i].inventoryItem.inventoryLevels.nodes[0].location.id;
                    console.log(`invItemId: ${invItemId}`);
                    console.log(`locationId: ${locationId}`);
                    console.log(`quantity: ${quantity}`);
                    await adjustInventory(admin, invItemId, locationId, Number.parseInt(quantity));
                }
            }
            await sendNotification({
                length: 3000,
                title: "Product had been created",
                type: "TROLL",
            });
            return done(null);
        }
        await sendNotification({
            length: 3000,
            title: "Error creating product",
            type: "TROLL",
        });
        return done(new Error("Unknown Error"));
    });
    queueParseTrollToad.on("succeeded", async (job, result) => {
        console.log(`Job ${job.id} succeeded with result: ${result}`);
    });
    queueParseTrollToad.on("failed", async (job, err) => {
        console.log(`Job ${job.id} failed with error ${err.message}`);
    });
    queueParseTrollToad.on("retrying", async (job, err) => {
        console.log(`Job ${job.id} retrying with error ${err.message}`);
        await sendNotification({
            length: 3000,
            title: "Failed to create product, retrying...",
            type: "TROLL",
        });
    });
    queueParseTrollToad.on("stalled", async (jobId) => {
        console.log(`Job ${jobId} stalled and will be reprocessed`);
        await sendNotification({
            length: 3000,
            title: "Product creation stalled and will be reprocessed",
            type: "TROLL",
        });
    });
    queueParseTrollToad.on("ready", () => {
        console.log("Toad Bee-Queue: Redis connection is ready. Worker is listening for jobs.");
    });
}
catch (error) {
    console.error("Error creating queue", error);
}
