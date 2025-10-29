import Queue from "bee-queue";
import sharp from "sharp";
import https from "https";
import fetch from "node-fetch";
import { shopify, USING_API_VERSION } from "../shopify.js";
import { getOfflineAdminContext } from "../utils/shopify-admin.js";
import { supabase, uploadImageBuffer } from "./supabase.js";
import { sendNotification } from "./notification.js";
// SSL workaround for PSA API certificate issues
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
// --- PSA API Key Management Utility ---
// This utility manages which PSA API key to use and tracks usage in Supabase.
// In-memory cache to track active jobs and prevent duplicates
const activeJobs = new Set();
// Check if a job for a cert number is already active
export function isJobActive(certNo) {
    return activeJobs.has(certNo);
}
// Mark a job as active
export function markJobActive(certNo) {
    activeJobs.add(certNo);
}
// Mark a job as completed
export function markJobCompleted(certNo) {
    activeJobs.delete(certNo);
}
// Map of key name to .env variable name
const PSA_KEY_ENV_MAP = {
    dylan: "DYLAN_PSA_API_KEY",
    zardoCards: "ZARDO_CARDS_PSA_API_KEY",
    // Add more keys here as needed, e.g.:
    // another: "ANOTHER_PSA_API_KEY",
};
export async function getAvailablePSAKey() {
    // Fetch all keys from Supabase
    const { data, error } = await supabase
        .from("psa_limits")
        .select("key, callsLeftForToday")
        .order("callsLeftForToday", { ascending: false });
    if (error) {
        console.error("Error fetching PSA keys from Supabase", error);
        return null;
    }
    // Find the first key with calls left
    for (const row of data) {
        if (row.callsLeftForToday > 0) {
            const envVar = PSA_KEY_ENV_MAP[row.key];
            const apiKey = process.env[envVar];
            if (apiKey) {
                return { key: row.key, apiKey };
            }
        }
    }
    return null; // No keys left
}
// Decrement the call count for a key in Supabase
export async function decrementPSAKeyUsage(key) {
    // Get current value
    const { data, error: getError } = await supabase
        .from("psa_limits")
        .select("callsLeftForToday")
        .eq("key", key)
        .single();
    if (!getError && data) {
        const newValue = data.callsLeftForToday - 1;
        const { error: updateError } = await supabase
            .from("psa_limits")
            .update({ callsLeftForToday: newValue })
            .eq("key", key);
        if (updateError) {
            console.error(`Error decrementing PSA key usage for ${key}`, updateError);
        }
    }
}
// Fetch all PSA API keys and their usage for UI progress display
export async function getAllPSAKeyUsage() {
    const { data, error } = await supabase
        .from("psa_limits")
        .select("key, callsLeftForToday")
        .order("key", { ascending: true });
    if (error) {
        console.error("Error fetching all PSA key usage from Supabase", error);
        return [];
    }
    return data;
}
// --- PSA Bee-Queue Setup ---
export let queueParsePSA = new Queue("makeProductPSA");
queueParsePSA.destroy(() => {
    console.log("makeProductPSA Queue was destroyed");
});
// --- PSA Bee-Queue Processor ---
queueParsePSA.process(1, async (job, done) => {
    console.log("PSA Job | starting job for certNo", job.data.certNo);
    // Extract job data
    const { shop, certNo, price } = job.data;
    console.log("PSA Job | job data", job.data);
    // Mark job as active
    markJobActive(certNo);
    try {
        // 1. Get available PSA API key and immediately decrement to avoid race conditions
        const keyInfo = await getAvailablePSAKey();
        console.log(`PSA Job ${job.id} | keyInfo: ${keyInfo}`);
        if (!keyInfo) {
            console.log(`PSA Job ${job.id} | No PSA API keys available`);
            await sendNotification({
                length: 3000,
                title: "No PSA API keys available for today.",
                type: "PSA",
            });
            return done(new Error("No PSA API keys available for today."));
        }
        const { key, apiKey } = keyInfo;
        console.log(`PSA Job ${job.id} | key: ${key}`);
        console.log(`PSA Job ${job.id} | apiKey: ${apiKey}`);
        // Immediately decrement the key usage to prevent race conditions
        await decrementPSAKeyUsage(key);
        // 2. Fetch card info from PSA API
        console.log(`PSA Job ${job.id} | Fetching card info from PSA API...`);
        let cardInfoRes;
        try {
            // Use node-fetch with agent that doesn't verify SSL (PSA API has cert issues)
            const httpsAgent = new https.Agent({ rejectUnauthorized: false });
            const fetchOptions = {
                headers: { "Authorization": `Bearer ${apiKey}` },
                agent: httpsAgent,
            };
            cardInfoRes = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNo}`, fetchOptions);
            console.log(`PSA Job ${job.id} | Done Fetching Card Info. Status: ${cardInfoRes.status}`);
        }
        catch (fetchError) {
            console.error(`PSA Job ${job.id} | Fetch error:`, fetchError);
            await sendNotification({
                length: 3000,
                title: `Network error fetching PSA cert ${certNo}`,
                type: "PSA",
            });
            return done(new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`));
        }
        if (!cardInfoRes.ok) {
            const errorText = await cardInfoRes.text().catch(() => 'No error details');
            console.log(`PSA Job ${job.id} | API call failed with status ${cardInfoRes.status}: ${errorText}`);
            await sendNotification({
                length: 3000,
                title: `Failed to fetch PSA info for cert ${certNo} (Status: ${cardInfoRes.status})`,
                type: "PSA",
            });
            return done(new Error(`Failed to fetch PSA info for cert ${certNo}: ${cardInfoRes.status}`));
        }
        const cardInfo = await cardInfoRes.json();
        const psa = cardInfo.PSACert;
        console.log(`PSA Job ${job.id} | cardInfoFrom PSACardRequest: ${cardInfo}`);
        if (!psa) {
            console.log(`PSA Job ${job.id} | No PSA data found in response`);
            await sendNotification({
                length: 3000,
                title: `No PSA data found for cert ${certNo}`,
                type: "PSA",
            });
            return done(new Error(`No PSA data found for cert ${certNo}`));
        }
        console.log(`PSA Job ${job.id} | PSA data found, proceeding with product creation`);
        // 3. Fetch images from PSA image endpoint
        let images = [];
        let sortedImages = []; // Keep reference to sorted image objects for alt text
        try {
            const httpsAgent = new https.Agent({ rejectUnauthorized: false });
            const imgRes = await fetch(`https://api.psacard.com/publicapi/cert/GetImagesByCertNumber/${certNo}`, {
                headers: { "Authorization": `Bearer ${apiKey}` },
                agent: httpsAgent,
            });
            await decrementPSAKeyUsage(key); // Decrement for image call
            if (imgRes.ok) {
                const imgArr = await imgRes.json();
                // Filter images that have URLs and sort by IsFrontImage (front images first, so main product image is front)
                const filteredImages = imgArr.filter((img) => img.ImageURL);
                // Sort images to ensure front images come first in the array
                // Array order determines Shopify media position - first image = featured image
                sortedImages = filteredImages
                    .sort((a, b) => {
                    // Convert to boolean in case PSA API returns other truthy/falsy values
                    const aIsFront = Boolean(a.IsFrontImage);
                    const bIsFront = Boolean(b.IsFrontImage);
                    // If both have same IsFrontImage value, maintain original order
                    if (aIsFront === bIsFront)
                        return 0;
                    // Front images (true) should come before back images (false)
                    // Return -1 to put 'a' before 'b', return 1 to put 'b' before 'a'
                    return aIsFront ? -1 : 1;
                });
                // Extract URLs and keep reference to sorted image objects for alt text
                images = sortedImages.map((img) => img.ImageURL);
            }
        }
        catch (e) {
            // If image fetch fails, continue without images
            images = [];
            sortedImages = [];
        }
        // 4. Upload available images to Supabase and build media array in correct order
        let mediaArray = [];
        // Process images in the sorted order (front images should be first)
        for (let i = 0; i < images.length; i++) {
            const imgUrl = images[i];
            try {
                const imgRes = await fetch(imgUrl);
                if (!imgRes.ok)
                    continue;
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                // Optionally resize/convert
                const resized = await sharp(buffer).resize(500).png().toBuffer();
                const { data: storageData, error: storageError } = await uploadImageBuffer(resized, "image/png");
                if (!storageError && storageData?.path) {
                    // Find the corresponding sorted image object to get IsFrontImage property
                    const imageObj = sortedImages.find((img) => img.ImageURL === imgUrl);
                    const IsFrontImage = imageObj ? Boolean(imageObj.IsFrontImage) : false;
                    const altText = IsFrontImage ? "PSA Card Front" : "PSA Card Back";
                    console.log(`PSA Job ${job.id} | Image ${i + 1} IsFrontImage: ${IsFrontImage}`);
                    console.log(`PSA Job ${job.id} | Image ${i + 1} altText: ${altText}`);
                    mediaArray.push({
                        alt: altText,
                        mediaContentType: "IMAGE",
                        originalSource: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${storageData.path}`,
                    });
                }
            }
            catch (e) {
                // Skip failed image
                console.error(`Error uploading image for cert ${certNo}`, e);
                continue;
            }
        }
        // 5. Build Shopify product input
        // See app.newpsa.tsx for structure
        const createName = (psa) => {
            // psa.AutographGrade exists, we will know its a autographed card
            if (psa.AutographGrade) {
                // strip number only from AutographGrade
                const autographGrade = psa.AutographGrade.replace(/\d/g, '');
                return `PSA AUTO ${autographGrade} ${psa.PrimarySigners[0]} ${psa.Subject || ""} ${psa.Variety || ""}`;
            }
            // strip text only from GradeDescription
            const gradeDescription = psa.GradeDescription?.replace(/\D/g, '');
            const name = `PSA ${gradeDescription || ""} ${psa.Subject || ""} ${psa.Variety || ""}`;
            return name;
        };
        const name = createName(psa);
        const description = `<meta charset=\"utf-8\"><table height=\"236\" class=\"table table-fixed table-header-right text-medium\" width=\"578\"><tbody><tr><th class=\"no-border\">Certification Number</th><td class=\"no-border\">${psa.CertNumber}</td></tr><tr><th>Year</th><td>${psa.Year}</td></tr><tr><th>Brand</th><td>${psa.Brand}</td></tr><tr><th>Card Number</th><td>${psa.CardNumber}</td></tr><tr><th>Player</th><td>${psa.Subject}</td></tr><tr><th>Variety/Pedigree</th><td>${psa.Variety}</td></tr><tr><th>Grade</th><td>${psa.GradeDescription}</td></tr></tbody></table>`;
        const input_variables = {
            title: name,
            descriptionHtml: description,
            productType: psa.Category || "PSA Card",
            vendor: "",
            tags: ["PSA"],
            status: "ACTIVE",
        };
        console.log(`PSA Job ${job.id} | input_variables:`, input_variables);
        console.log(`PSA Job ${job.id} | mediaArray length:`, mediaArray.length);
        console.log(`PSA Job ${job.id} | mediaArray:`, mediaArray);
        console.log(`PSA Job ${job.id} | Looking for offline session for shop: ${shop}`);
        const offlineContext = await getOfflineAdminContext(shopify, shop);
        if (!offlineContext) {
            console.error(`PSA Job ${job.id} | No offline session found for shop: ${shop}`);
            console.log(`PSA Job ${job.id} | Tip: Visit your app in Shopify admin to create a session`);
            return done(new Error(`No session found for shop: ${shop}`));
        }
        const { session: offlineSession } = offlineContext;
        if (!offlineSession.accessToken) {
            console.error(`PSA Job ${job.id} | Offline session missing access token for ${shop}`);
            return done(new Error("Missing Shopify access token for offline session"));
        }
        const accessToken = offlineSession.accessToken;
        const graphql_url = `https://${shop}/admin/api/${USING_API_VERSION}/graphql.json`;
        console.log(`PSA Job ${job.id} | Verifying offline session access token`);
        const tokenCheckResponse = await fetch(graphql_url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": accessToken,
            },
            body: JSON.stringify({
                query: `query { shop { name } }`,
            }),
        });
        const tokenCheckData = await tokenCheckResponse.json();
        if (!tokenCheckResponse.ok || tokenCheckData.errors) {
            console.error(`PSA Job ${job.id} | Offline access token invalid for shop ${shop}`, tokenCheckData.errors ?? tokenCheckData);
            return done(new Error(`Invalid session detected for ${shop}. Please visit the app again to refresh access.`));
        }
        console.log(`PSA Job ${job.id} | Offline session verified successfully`);
        // Get shop location using direct GraphQL call
        const location_query = `
        query getShopLocation {
          location {
            id
            name
          }
        }
      `;
        const location_response = await fetch(graphql_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: location_query
            })
        });
        const location_data = await location_response.json();
        console.log(`PSA Job ${job.id} | Location query response:`, location_data);
        if (!location_data.data?.location?.id) {
            console.error(`PSA Job ${job.id} | Failed to get shop location`);
            return done(new Error("Failed to get shop location"));
        }
        const locationId = location_data.data.location.id;
        console.log(`PSA Job ${job.id} | Shop locationId: ${locationId}`);
        // 6. Build variant - simplified for single variant product
        const psa_variant = [
            {
                price: Number(price),
                inventoryPolicy: "DENY",
                inventoryQuantities: [
                    {
                        availableQuantity: 1,
                        locationId,
                    },
                ],
                inventoryItem: {
                    tracked: true, // Enable inventory tracking
                    cost: "0.0",
                },
                optionValues: [
                    {
                        optionName: "Title",
                        name: `PSA ${certNo}`, // Use PSA cert number as unique variant name
                    },
                ],
            },
        ];
        console.log(`PSA Job ${job.id} | psa_variant: ${psa_variant}`);
        // 7. Create product using direct GraphQL call
        console.log(`PSA Job ${job.id} | creating product with media to our shopify store`);
        const product_create_mutation = `
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              status
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
        const product_create_response = await fetch(graphql_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: product_create_mutation,
                variables: { input: input_variables }
            })
        });
        const product_create_data = await product_create_response.json();
        console.log(`PSA Job ${job.id} | Product create result:`, product_create_data);
        if (product_create_data.data?.productCreate?.userErrors?.length > 0) {
            const errors = JSON.stringify(product_create_data.data.productCreate.userErrors);
            console.error(`PSA Job ${job.id} | ProductCreate Errors: ${errors}`);
            await sendNotification({
                length: 3000,
                title: `Failed to create Shopify product for cert ${certNo}`,
                type: "PSA",
            });
            return done(new Error(`Failed to create Shopify product for cert ${certNo}`));
        }
        const productId = product_create_data.data.productCreate.product.id;
        console.log(`PSA Job ${job.id} | Product created with ID: ${productId}`);
        // 7.5. Add media to the product if we have images
        if (mediaArray.length > 0) {
            console.log(`PSA Job ${job.id} | Adding ${mediaArray.length} images to product`);
            for (let i = 0; i < mediaArray.length; i++) {
                const mediaItem = mediaArray[i];
                try {
                    const media_create_mutation = `
              mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                productCreateMedia(productId: $productId, media: $media) {
                  media {
                    id
                    alt
                    mediaContentType
                    status
                  }
                  mediaUserErrors {
                    field
                    message
                  }
                }
              }
            `;
                    const media_create_response = await fetch(graphql_url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Shopify-Access-Token': accessToken,
                        },
                        body: JSON.stringify({
                            query: media_create_mutation,
                            variables: {
                                productId: productId,
                                media: [mediaItem]
                            }
                        })
                    });
                    const media_create_data = await media_create_response.json();
                    console.log(`PSA Job ${job.id} | Media ${i + 1} create result:`, media_create_data);
                    if (media_create_data.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
                        const errors = JSON.stringify(media_create_data.data.productCreateMedia.mediaUserErrors);
                        console.error(`PSA Job ${job.id} | Media ${i + 1} Errors: ${errors}`);
                    }
                    else {
                        console.log(`PSA Job ${job.id} | Media ${i + 1} added successfully`);
                    }
                }
                catch (e) {
                    console.error(`PSA Job ${job.id} | Error adding media ${i + 1}:`, e);
                }
            }
        }
        // 8. Create variants using direct GraphQL call
        console.log(`PSA Job ${job.id} | creating bulk variants for our product on the shopify store`);
        const variants_create_mutation = `
        mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, variants: $variants) {
            productVariants {
              id
              inventoryItem {
                id
                inventoryLevels(first: 1) {
                  nodes {
                    id
                    location {
                      id
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;
        const variants_create_response = await fetch(graphql_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: variants_create_mutation,
                variables: {
                    productId: productId,
                    variants: psa_variant
                }
            })
        });
        const variants_create_data = await variants_create_response.json();
        console.log(`PSA Job ${job.id} | Variants create result:`, variants_create_data);
        const variantErrors = variants_create_data.data?.productVariantsBulkCreate?.userErrors || [];
        if (variantErrors.length > 0) {
            const errors = JSON.stringify(variantErrors);
            console.error(`PSA Job ${job.id} | Variants Errors: ${errors}`);
            await sendNotification({
                length: 3000,
                title: `Failed to create variants for cert ${certNo}`,
                type: "PSA",
            });
            return done(new Error(`Failed to create variants for cert ${certNo}`));
        }
        // 9. Product created in Shopify - webhook will handle Supabase syncing
        console.log(`PSA Job ${job.id} | Product ${productId} created in Shopify - webhook will sync to Supabase`);
        // 9.5. Get all available publications/sales channels and publish product to all of them
        console.log(`PSA Job ${job.id} | Getting all available publications/sales channels`);
        const publicationsQuery = `
        query {
          publications(first: 50) {
            nodes {
              id
              name
            }
          }
        }
      `;
        const publicationsResponse = await fetch(graphql_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
                query: publicationsQuery
            })
        });
        const publicationsData = await publicationsResponse.json();
        console.log(`PSA Job ${job.id} | Publications query result:`, publicationsData);
        const publications = publicationsData.data?.publications?.nodes || [];
        console.log(`PSA Job ${job.id} | Found ${publications.length} publications:`, publications.map((p) => p.name));
        if (publications.length > 0) {
            // Publish product to all available sales channels
            console.log(`PSA Job ${job.id} | Publishing product to all ${publications.length} sales channels`);
            const publishMutation = `
          mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
            publishablePublish(id: $id, input: $input) {
              publishable {
                ... on Product {
                  id
                  title
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
            const publishResponse = await fetch(graphql_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                    query: publishMutation,
                    variables: {
                        id: productId,
                        input: publications.map((publication) => ({
                            publicationId: publication.id
                        }))
                    }
                })
            });
            const publishData = await publishResponse.json();
            console.log(`PSA Job ${job.id} | Publication result:`, publishData);
            if (publishData.data?.publishablePublish?.userErrors?.length > 0) {
                console.error(`PSA Job ${job.id} | Publication errors:`, publishData.data.publishablePublish.userErrors);
            }
            else {
                console.log(`PSA Job ${job.id} | Product published to all sales channels successfully`);
            }
        }
        else {
            console.log(`PSA Job ${job.id} | No publications found - skipping publication step`);
        }
        // 10. Notify success
        await sendNotification({
            length: 3000,
            title: `Product has been created for cert ${certNo}`,
            type: "PSA",
        });
        // Mark job as completed
        markJobCompleted(certNo);
        return done(null);
    }
    catch (error) {
        // Mark job as completed even on error
        markJobCompleted(certNo);
        await sendNotification({
            length: 3000,
            title: `Error processing PSA cert: ${error.message}`,
            type: "PSA",
        });
        console.log(`PSA Job ${job.id} | error: ${error}`);
        return done(error);
    }
});
queueParsePSA.on("succeeded", async (job, result) => {
    console.log(`PSA Job ${job.id} succeeded with result: ${result}`);
});
queueParsePSA.on("failed", async (job, err) => {
    console.log(`PSA Job ${job.id} failed with error ${err.message}`);
});
queueParsePSA.on("retrying", async (job, err) => {
    console.log(`PSA Job ${job.id} retrying with error ${err.message}`);
    await sendNotification({
        length: 3000,
        title: "Failed to create product, retrying...",
        type: "PSA",
    });
});
queueParsePSA.on("stalled", async (jobId) => {
    console.log(`PSA Job ${jobId} stalled and will be reprocessed`);
    await sendNotification({
        length: 3000,
        title: "Product creation stalled and will be reprocessed",
        type: "PSA",
    });
});
queueParsePSA.on("ready", () => {
    console.log("PSA Bee-Queue: Redis connection is ready. Worker is listening for jobs.");
});
