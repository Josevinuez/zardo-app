import { schemaTask } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import { z } from "zod";
import { sendNotification } from "~/modules/notification.server";
import { adjustInventory, createBulkVariants, createProductWMedia, getProductExists, MediaInput, ProductCreateInput, productCreateInputSchema, ProductVariantsBulkInput, productVariantsBulkInputSchema, productVariantUpdatePrice } from "~/modules/queries.server";
import { ensureProductCompliance } from "~/modules/store.server";
import { removeBg } from "~/modules/removebg.server";
import { uploadImageBuffer } from "~/modules/supabase.server";
import { unauthenticated } from "~/shopify.server";

type ManualProductCreationInput = {
    shop: string;
    images: string[];
    itemIn: ProductCreateInput;
    variants: ProductVariantsBulkInput[];
    quantity: number;
};


export const makeProductManual = schemaTask({
    id: "makeProductManual",
    schema: z.object({
        shop: z.string(),
        images: z.array(z.string()),
        itemIn: productCreateInputSchema,
        variants: z.array(productVariantsBulkInputSchema),
        quantity: z.number(),
        rawVariant: z.enum(["standard", "mint", "near-mint", "low-played", "moderately-played", "heavily-played", "damaged"]),
        price: z.string(),
        existingProductId: z.string().nullable()
    }),
    queue: {
        concurrencyLimit: 1,
    },

    maxDuration: 300,
    run: async ({ shop, images: uncleanImages, itemIn, variants, quantity, existingProductId, rawVariant, price }, { ctx }) => {
        const { admin } = await unauthenticated.admin(shop);
        const ItemFields = itemIn;
        const uploadedImages: MediaInput[] = await Promise.all(
            uncleanImages.map(async (image: string, index) => {
                try {
                    const cleanedImage = await removeBg(image);
                    const normalizedBuffer = Buffer.from(cleanedImage);
                    const sharpImage = await sharp(normalizedBuffer)
                        .resize(500)
                        .png()
                        .toBuffer();
                    const {
                        data: storageData,
                        error: storageError,
                    } = await uploadImageBuffer(sharpImage, "image/png");
                    if (storageError || !storageData?.path) {
                        throw new Error(
                            storageError?.message ??
                            "Supabase storage upload failed",
                        );
                    }
                    return {
                        alt: `image-${index + 1}`,
                        mediaContentType: "IMAGE",
                        originalSource: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${storageData.path}`,
                    } as MediaInput;
                } catch (error) {
                    console.error(
                        "makeProductManual: failed to process image via remove.bg pipeline; attempting direct conversion",
                        { image, error },
                    );
                    try {
                        const fallbackResponse = await fetch(image);
                        if (!fallbackResponse.ok) {
                            throw new Error(
                                `Image fetch failed with status ${fallbackResponse.status}`,
                            );
                        }
                        const fallbackArrayBuffer = await fallbackResponse.arrayBuffer();
                        const fallbackBuffer = Buffer.from(fallbackArrayBuffer);
                        const fallbackPng = await sharp(fallbackBuffer)
                            .resize(500)
                            .png()
                            .toBuffer();
                        const {
                            data: fallbackStorageData,
                            error: fallbackStorageError,
                        } = await uploadImageBuffer(fallbackPng, "image/png");
                        if (fallbackStorageError || !fallbackStorageData?.path) {
                            throw new Error(
                                fallbackStorageError?.message ??
                                "Supabase storage upload failed during direct conversion",
                            );
                        }
                        return {
                            alt: `image-${index + 1}`,
                            mediaContentType: "IMAGE",
                            originalSource: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${fallbackStorageData.path}`,
                        } as MediaInput;
                    } catch (fallbackError) {
                        console.error(
                            "makeProductManual: direct conversion fallback failed; defaulting to original source",
                            { image, fallbackError },
                        );
                        return {
                            alt: `image-${index + 1}`,
                            mediaContentType: "IMAGE",
                            originalSource: image,
                        } as MediaInput;
                    }
                }
            }),
        );
        if (existingProductId) {
            const productExists = await getProductExists(admin, existingProductId);
            if (productExists.data.product) {
                const product = productExists.data.product;

                let foundVariant = false;
                for (let i = 0; i < product.variants.nodes.length; i++) {

                    const title = String(
                        product.variants.nodes[i].selectedOptions.find(
                            (option: { name: string; value: string }) =>
                                option.name === "Title" || option.name === "Condition",
                        )?.value,
                    )
                        .toLowerCase()
                        .replace(" ", "-");
                    if (title === rawVariant || title === "default-title") {
                        foundVariant = true;
                        const invItemId = product.variants.nodes[i].inventoryItem.id;
                        const locationId =
                            product.variants.nodes[i].inventoryItem.inventoryLevels.nodes[0]
                                .location.id;
                        const newQuantity =
                            product.variants.nodes[i].inventoryItem.inventoryLevels.nodes[0]
                                .quantities[0].quantity + quantity;

                        const inventory = await adjustInventory(
                            admin,
                            invItemId,
                            locationId,
                            newQuantity,
                        );
                        await productVariantUpdatePrice(
                            admin,
                            [
                                {
                                    id: product.variants.nodes[i].id,
                                    price: Number.parseFloat(price),
                                },
                            ],
                            product.id,
                            true,
                        );
                    }
                }
                if (!foundVariant) {
                    const variantsCreated = await createBulkVariants(
                        admin,
                        product.id,
                        variants,
                        "DEFAULT",
                    );
                    const variantsErrors =
                        variantsCreated.data.productVariantsBulkCreate.userErrors;
                    if (variantsErrors.length > 0) {
                        await sendNotification({
                            length: 3000,
                            title: "Error creating product variant",
                            type: "MANUAL",
                        });
                        return {
                            success: false,
                            error: JSON.stringify(variantsErrors)
                        }
                    }
                    const variantsData =
                        variantsCreated.data.productVariantsBulkCreate.productVariants;

                    for (let i = 0; i < variantsData.length; i++) {
                        const title = String(
                            variantsData[i].selectedOptions.find(
                                (option: { name: string; value: string }) =>
                                    option.name === "Title" || option.name === "Condition",
                            )?.value,
                        )
                            .toLowerCase()
                            .replace(" ", "-");
                        if (title === rawVariant) {
                            const invItemId = variantsData[i].inventoryItem.id;
                            const locationId =
                                variantsData[i].inventoryItem.inventoryLevels.nodes[0].location
                                    .id;

                            await adjustInventory(
                                admin,
                                invItemId,
                                locationId,
                                quantity,
                            );
                        }
                    }
                }
                await sendNotification({
                    length: 3000,
                    title: "Product has been updated",
                    type: "MANUAL",
                });
                await ensureProductCompliance({
                    productId: product.id,
                    shop,
                });
                return {
                    success: true,
                    error: null
                };
            }
        }

            const product = await createProductWMedia(admin, ItemFields, uploadedImages);
        if (product.data) {
            if (product.data.productCreate.userErrors &&
                product.data.productCreate.userErrors.length > 0) {
                console.error("makeProductManual: productCreate userErrors", {
                    errors: product.data.productCreate.userErrors,
                    input: ItemFields,
                });
                await sendNotification({
                    length: 3000,
                    title: "Could not add product, unknown error.",
                    type: "MANUAL",
                });
                return {
                    success: false,
                    error: JSON.stringify(product.data.productCreate.userErrors)
                }
            }
            const productId = product.data.productCreate.product.id;
            console.log("makeProductManual: product created", { productId });
            const variantsCreated = await createBulkVariants(
                admin,
                productId,
                variants,
                "REMOVE_STANDALONE_VARIANT",
            );
            const variantsErrors =
                variantsCreated.data.productVariantsBulkCreate.userErrors;
            if (variantsErrors.length > 0) {
                console.error("makeProductManual: productVariantsBulkCreate userErrors", {
                    errors: variantsErrors,
                    productId,
                    variants,
                });
                await sendNotification({
                    length: 3000,
                    title: "Error creating product variants",
                    type: "MANUAL",
                });
                return {
                    success: false,
                    error: JSON.stringify(variantsErrors)
                }
            }
            const variantsData =
                variantsCreated.data.productVariantsBulkCreate.productVariants;
            console.log("makeProductManual: variants created", {
                productId,
                variantCount: variantsData.length,
            });
            for (let i = 0; i < variantsData.length; i++) {
                const title = String(
                    variantsData[i].selectedOptions.find(
                        (option: { name: string; value: string }) =>
                            option.name === "Title" || option.name === "Condition",
                    )?.value,
                )
                    .toLowerCase()
                    .replace(" ", "-");
                if (title === rawVariant || title === "default-title") {
                    const invItemId = variantsData[i].inventoryItem.id;
                    const locationId =
                        variantsData[i].inventoryItem.inventoryLevels.nodes[0].location.id;

                    await adjustInventory(
                        admin,
                        invItemId,
                        locationId,
                        quantity,
                    );
                }
            }
            await sendNotification({
                length: 3000,
                title: "Product created",
                type: "MANUAL",
            });
            await ensureProductCompliance({
                productId,
                shop,
            });
            console.log("makeProductManual: ensureProductCompliance triggered", {
                productId,
                shop,
            });
            return {
                success: true,
                error: null
            }
        }
        console.error("makeProductManual: productCreate returned no data", {
            response: product,
        });
        await sendNotification({
            length: 3000,
            title: "Error creating product",
            type: "MANUAL",
        });
        return {
            success: false,
            error: "No data in response"
        }
    }
})
