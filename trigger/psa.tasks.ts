import { schemaTask, logger } from "@trigger.dev/sdk/v3";
import puppeteer from "puppeteer";
import { z } from "zod";
import { sendNotification } from "~/modules/notification.server";
import { adjustInventory, createBulkVariants, createProductWMedia, getShopLocation, type MediaInput, type ProductCreateInput, type ProductVariantsBulkInput } from "~/modules/queries.server";
import { unauthenticated } from "~/shopify.server";
import { type Browser, TimeoutError, type Page as PuppeteerPage } from "puppeteer";
import { uploadImageBuffer } from "~/modules/supabase.server";

type PSAImage = {
	IsFront: boolean;
	OriginalImageUrl: string;
};

async function getCertImagesPSA(
	page: PuppeteerPage,
) {
	const { fileTypeFromBuffer } = await import("file-type");

	page.setDefaultTimeout(10000);

	const element1 = await page.waitForSelector("#certImgFront > a:nth-child(1)");
	const element2 = await page.waitForSelector("#certImgBack > a:nth-child(1)");
	console.log(`getCertImagesPSA element1 front: ${element1}`);
	console.log(`getCertImagesPSA element2 back: ${element2}`);

	let img1 = null;
	let img2 = null;
	if (element1) {
		img1 = await element1.evaluate((el) => el.href);
	}
	if (element2) {
		img2 = await element2.evaluate((el) => el.href);
	}

	const imageArray: PSAImage[] = [];

	try {
		const frontResponse = img1 ? await fetch(img1) : null;
		const arrayBufferFront = frontResponse ? await frontResponse.arrayBuffer() : null;
		const bufferFront = arrayBufferFront ? Buffer.from(arrayBufferFront) : null;
		const fileType1 = bufferFront ? await fileTypeFromBuffer(bufferFront) : null;

		if (frontResponse && arrayBufferFront && bufferFront && fileType1) {
			const { data: front_image, error: error1 } = await uploadImageBuffer(
				bufferFront,
				fileType1.mime,
			);
			if (front_image) {
				imageArray.push({
					IsFront: true,
					OriginalImageUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${front_image.path}`,
				});
			} else {
				logger.error(`Could not upload front image: ${error1?.message}`);
			}
		}
	} catch (error) {
		logger.error(`Error processing front image: ${error}`);
	}

	try {
		const backResponse = img2 ? await fetch(img2) : null;
		const arrayBufferBack = backResponse ? await backResponse.arrayBuffer() : null;
		const bufferBack = arrayBufferBack ? Buffer.from(arrayBufferBack) : null;
		const fileType2 = bufferBack ? await fileTypeFromBuffer(bufferBack) : null;

		if (backResponse && arrayBufferBack && bufferBack && fileType2) {
			// Commenting out until I get things working
			// const { data: back_image, error: error2 } = await uploadImageBuffer(
			// 	bufferBack,
			// 	fileType2.mime,
			// );
			// if (back_image) {
			// 	imageArray.push({
			// 		IsFront: false,
			// 		OriginalImageUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${back_image.path}`,
			// 	});
			// } else {
			// 	logger.error(`Could not upload back image: ${error2?.message}`);
			// }
		}
	} catch (error) {
		logger.error(`Error processing back image: ${error}`);
	}

	return imageArray;
}

export const processPSA = schemaTask({
	id: "processPSA",
	schema: z.object({
		shop: z.string(),
		cardNo: z.string(),
		price: z.number(),
	}),
	queue: {
		concurrencyLimit: 1,
	},
	maxDuration: 300,
	run: async ({ cardNo, price, shop }, { ctx }) => {
		// If cardNo is less than 7 million, skip image scraping
		const skipImages = Number(cardNo) < 7000000;
		const url = `https://www.psacard.com/cert/${cardNo}/psa`;
		let browser: Browser | null = null;

		try {
			browser = await puppeteer.connect({
				browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}`,
			});

			// First create browser context and page before setting cookies
			// This ensures proper cookie handling in the browser session
			const context = await browser.createBrowserContext();
			const page = await context.newPage();

			// Set Cloudflare clearance cookie to bypass protection
			// This cookie is required to access PSA card pages
			await browser.setCookie({
				name: 'cf_clearance',
				value: 'WlWPG3z2Jja2nH5_36Igj_SoknWm7a1mQHEiYIEZXZ4-1750738026-1.2.1.1-FLT.hgj8HNJbnwpjiMULnR1prE.sT6ECf0VO5tgCWzWBUEjZatTuulkjmQgrv3_eFCRimuTnkX.CtRKZDBTQb51OGqqbauECKqAishmIlunhRqKLBvP3Ww.xnzYVjFM50R8Rq3t.38L6uoZZORUQpaYxF9YsqXHCx3ItkCARsjg5g4aFUNpGk7vw2iBl7t.fNgjJShMMDkSggbDiyq0YiKblKM1evY9DQKGYEHtDGfksQPbvFlPnLO43uldGhe5GLzk30qAS3PunCq423q1CIkid3Yzjc_zsW8XnMoPVuNnIgKuc1KrZRy52X20bw666iESYCMjGQXP3mu4ReHP81AKtizxflvonKaSr9wBgWqQ',
				domain: '.psacard.com',
				path: '/',
				expires: Date.now() + 1000 * 60 * 60 * 24 * 1, // 1 day from now,
				httpOnly: true,
				sameSite: 'None',
				secure: true,
				size: 438,
				session: true,
				partitionKey: 'https://psacard.com'
			});

			await page.goto(url, { waitUntil: 'networkidle0' });

			logger.info('Waiting for .text-subtitle1 (cert number) to appear to ensure page is loaded');
			try {
				await page.waitForSelector('.text-subtitle1', { timeout: 20000 });
				logger.info('.text-subtitle1 appeared, page is ready for scraping');
			} catch (error) {
				logger.error(`Timeout waiting for .text-subtitle1: ${error}`);
				const html = await page.content();
				logger.error(`Page HTML after .text-subtitle1 wait timeout: ${html.slice(0, 1000)}...`);
				throw error; // re-throw so the outer catch can handle it as well
			}

			// --- Scrape images if not skipping ---
			let images: PSAImage[] = [];
			if (!skipImages) {
				try {
					await page.waitForSelector('div.flex.w-full.justify-center.gap-6.align-middle', { timeout: 20000 });
					const imageSrcs = await page.$$eval('div.flex.w-full.justify-center.gap-6.align-middle img', imgs => imgs.map(img => img.getAttribute('src')));
					logger.info(`Found image sources: ${JSON.stringify(imageSrcs)}`);
					images = imageSrcs.map((src, idx) => ({
						IsFront: idx === 0, // Assume first is front, second is back
						OriginalImageUrl: src || ''
					}));
					logger.info(`Mapped images array: ${JSON.stringify(images)}`);
				} catch (error) {
					logger.error(`Error fetching images: ${error}`);
					// If it's a timeout, log the HTML for debugging
					const puppeteerModule = require('puppeteer');
					if ((puppeteerModule.errors && error instanceof puppeteerModule.errors.TimeoutError) || (error && (error as any).name === 'TimeoutError')) {
						const html = await page.content();
						logger.error(`Page HTML after image wait timeout: ${html.slice(0, 1000)}...`);
					}
				}
			} else {
				logger.info('Skipping image scraping due to cardNo < 7000000');
			}

			// --- Scrape item info using new structure ---
			let mappedItems: { key: string, value: string }[] = [];
			try {
				await page.waitForSelector('h3.mb-3.text-subtitle2', { timeout: 10000 });
				mappedItems = await page.$$eval('h3.mb-3.text-subtitle2 + dl > div', divs => {
					return divs.map(div => {
						const key = div.querySelector('dt')?.textContent?.trim() || 'UNKNOWN KEY';
						const value = div.querySelector('dd')?.textContent?.trim() || 'UNKNOWN VALUE';
						return { key, value };
					});
				});
				logger.info(`Mapped item info: ${JSON.stringify(mappedItems)}`);
			} catch (error) {
				logger.error(`Error fetching item info: ${error}`);
			}

			await browser.close();
			browser = null;

			let gradeItem = mappedItems.find((item) => item.key === "Item Grade" || item.key === "Grade");
			logger.info(`Grade item: ${JSON.stringify(gradeItem)}`);

			if (gradeItem?.value) {
				const gradeMatch = gradeItem.value.match(/\d*\.?\d+$/);
				if (gradeMatch) {
					gradeItem.value = gradeMatch[0];
					logger.info(`Extracted grade value: ${gradeItem.value}`);
				} else {
					gradeItem.value = "UNKNOWN";
					logger.info('Grade value not found, set to UNKNOWN');
				}
			} else {
				const autographGradeItem = mappedItems.find((item) => item.key === "Autograph Grade");
				if (autographGradeItem) {
					gradeItem = { key: "Grade", value: "AUTHENTIC" };
					logger.info('Autograph grade found, set grade to AUTHENTIC');
				} else {
					gradeItem = { key: "Grade", value: "UNKNOWN" };
					logger.info('No grade found, set to UNKNOWN');
				}
			}

			const Item = [gradeItem, ...mappedItems];
			logger.info(`Final Item array: ${JSON.stringify(Item)}`);

			logger.info("🚀 Starting session lookup for PSA automation");
			logger.info("🔍 About to import sessionStorage and prisma");
			
			try {
				// Get admin context from session storage (same as webhook automation)
				const { sessionStorage } = await import("../app/shopify.server");
				const prisma = (await import("../app/db.server")).default;
				
				logger.info("✅ Successfully imported sessionStorage and prisma");
			
			logger.info(`🔍 Looking for session for shop: ${shop}`);
			
			// Debug: Check what sessions exist
			const allSessions = await prisma.session.findMany({
				select: {
					id: true,
					shop: true,
					expires: true
				},
				orderBy: {
					expires: 'desc'
				}
			});
			
			logger.info("🔍 All sessions in database:", allSessions);
			
			// Find session by shop domain
			const sessionRecord = await prisma.session.findFirst({
				where: {
					shop: shop,
					OR: [
						{
							expires: {
								gt: new Date() // Non-expired sessions
							}
						},
						{
							expires: null // Sessions that never expire
						}
					]
				},
				orderBy: {
					expires: 'desc' // Get the most recent session
				}
			});
			
			logger.info("🔍 Session record found:", sessionRecord);
			
			if (!sessionRecord) {
				logger.error(`❌ No session found for shop: ${shop}`);
				logger.info("💡 Tip: Visit your app in Shopify admin to create a session");
				return { success: false, message: `No session found for shop: ${shop}` };
			}
			
			// Load the session using the session ID
			const session = await sessionStorage.loadSession(sessionRecord.id);
			
			if (!session) {
				logger.error("❌ Failed to load session from storage");
				return { success: false, message: "Failed to load session from storage" };
			}
			
			logger.info("✅ Session found for PSA automation");
			logger.info("🔑 Access token:", sessionRecord.accessToken);
			
			// Use the session's access token directly for GraphQL calls
			logger.info("✅ Using session access token for PSA automation");
			
			// Get shop location using direct GraphQL call
			const graphql_url = `https://${shop}/admin/api/2024-10/graphql.json`;
			
			const location_query = `
				query getShopLocation {
					locations(first: 1) {
						nodes {
							id
							name
						}
					}
				}
			`;
			
			const location_response = await fetch(graphql_url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Shopify-Access-Token': sessionRecord.accessToken,
				},
				body: JSON.stringify({
					query: location_query
				})
			});
			
			const location_data = await location_response.json();
			logger.info("🔍 Location query response:", location_data);
			
			const locationNode = location_data?.data?.locations?.nodes?.[0];

			if (!locationNode?.id) {
				logger.error("❌ Failed to get shop location");
				return { success: false, message: "Failed to get shop location" };
			}
			
			const locationId = locationNode.id;
			logger.info(`Shop locationId: ${locationId}`);

			} catch (error) {
				logger.error("❌ Error in session lookup:", error);
				return { success: false, message: `Session lookup failed: ${error}` };
			}

			const shipWeightLbs = 0.08;
			let cardtype = "";
			let variety = "";
			let grade = "";
			let card_no = "";
			let player = "";
			let cert_no = "";
			let year = "";
			let brand = "";

			for (const item of Item) {
				switch (item.key) {
					case "Variety/Pedigree":
						variety = item.value || "UNKNOWN";
						logger.info(`Variety: ${variety}`);
						break;
					case "Card Number":
						card_no = item.value || "UNKNOWN";
						logger.info(`Card Number: ${card_no}`);
						break;
					case "Grade":
					case "Item Grade":
						grade = item.value || "UNKNOWN";
						logger.info(`Grade: ${grade}`);
						break;
					case "Card Type":
						cardtype = item.value || "UNKNOWN";
						logger.info(`Card Type: ${cardtype}`);
						break;
					case "Certification Number":
					case "Cert Number":
						cert_no = item.value || "UNKNOWN";
						logger.info(`Cert Number: ${cert_no}`);
						break;
					case "Year":
						year = item.value || "UNKNOWN";
						logger.info(`Year: ${year}`);
						break;
					case "Player":
						player = item.value || "UNKNOWN";
						logger.info(`Player: ${player}`);
						break;
					case "Brand":
						brand = item.value || "UNKNOWN";
						logger.info(`Brand: ${brand}`);
						break;
				}
			}

			const media_array: MediaInput[] = [];
			const name = `PSA ${grade.trim()} ${player} ${variety}`;
			const image1 = images.find((image) => image.IsFront === true)?.OriginalImageUrl || null;
			const image2 = images.find((image) => image.IsFront === false)?.OriginalImageUrl || null;

			logger.info(`Product name: ${name}`);
			logger.info(`Image 1: ${image1}`);
			logger.info(`Image 2: ${image2}`);

			if (image1) {
				media_array.push({
					alt: name,
					mediaContentType: "IMAGE",
					originalSource: image1,
				});
				logger.info(`Added image1 to media_array`);
			}
			if (image2) {
				media_array.push({
					alt: name,
					mediaContentType: "IMAGE",
					originalSource: image2,
				});
				logger.info(`Added image2 to media_array`);
			}

			const description = `<meta charset="utf-8">
  <table height="236" class="table table-fixed table-header-right text-medium" width="578" data-mce-fragment="1" data-mce-selected="1">
  <tbody data-mce-fragment="1">
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th class="no-border" style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;">Certification Number</th>
  <td class="no-border" style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${cert_no}</td>
  </tr>
  <tr style="height: 7.66477px;" data-mce-fragment="1" data-mce-style="height: 7.66477px;">
  <th style="width: 190.625px; height: 7.66477px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 7.66477px;"><meta charset="utf-8"> <span>Year</span></th>
  <td style="width: 359.602px; height: 7.66477px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 7.66477px;"><meta charset="utf-8"> <span>${year}</span></td>
  </tr>
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;"><meta charset="utf-8"> <span>Brand</span></th>
  <td style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${brand}</td>
  </tr>
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;">Card Number<br></th>
  <td style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${card_no}</td>
  </tr>
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;">Player</th>
  <td style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${player}</td>
  </tr>
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;"><meta charset="utf-8"> <span>Variety/Pedigree</span></th>
  <td style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${variety}</td>
  </tr>
  <tr style="height: 19px;" data-mce-fragment="1" data-mce-style="height: 19px;">
  <th style="width: 190.625px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 190.625px; height: 19px;">Grade<br></th>
  <td style="width: 359.602px; height: 19px;" data-mce-fragment="1" data-mce-selected="1" data-mce-style="width: 359.602px; height: 19px;">${grade}</td>
  </tr>
  </tbody>
  </table>`;

			logger.info(`Product description: ${description}`);

			const item: ProductCreateInput = {
				title: name,
				descriptionHtml: description,
				productType: cardtype,
				vendor: "",
				tags: ["PSA"],
				status: "DRAFT",
			};
			logger.info(`ProductCreateInput: ${JSON.stringify(item)}`);

			// Create product using direct GraphQL call
			const product_create_mutation = `
				mutation productCreate($input: ProductInput!) {
					productCreate(input: $input) {
						product {
							id
							title
							status
							variants(first: 1) {
								nodes {
									id
									inventoryItem {
										id
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
			
			const product_create_response = await fetch(graphql_url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Shopify-Access-Token': sessionRecord.accessToken,
				},
				body: JSON.stringify({
					query: product_create_mutation,
					variables: { input: item }
				})
			});
			
			const product_create_data = await product_create_response.json();
			logger.info("🎉 Product create result:", product_create_data);
			
			if (product_create_data.data?.productCreate?.userErrors?.length > 0) {
				const errors = JSON.stringify(product_create_data.data.productCreate.userErrors);
				logger.error(`ProductCreate Errors: ${errors}`);
				return { success: false, message: errors };
			}
			
			const productId = product_create_data.data.productCreate.product.id;
			logger.info(`✅ Product created with ID: ${productId}`);

			const defaultVariant = product_create_data.data?.productCreate?.product?.variants?.nodes?.[0];
			const defaultVariantId = defaultVariant?.id;
			const defaultInventoryItemId = defaultVariant?.inventoryItem?.id;

			if (!defaultVariantId) {
				logger.error("No default variant found after product creation.");
				return { success: false, message: "No default variant found" };
			}

				const variantPrice = Number(price).toFixed(2);
				const variantNumericId = defaultVariantId.split("/").pop();
				const inventoryItemId = defaultInventoryItemId;

				if (!variantNumericId) {
					logger.error("Unable to derive numeric variant id");
					return { success: false, message: "Unable to derive numeric variant id" };
				}

				const variant_update_rest = await fetch(
					`https://${shop}/admin/api/2024-10/variants/${variantNumericId}.json`,
					{
						method: 'PUT',
						headers: {
							'Content-Type': 'application/json',
							'X-Shopify-Access-Token': sessionRecord.accessToken,
						},
						body: JSON.stringify({
							variant: {
								id: Number(variantNumericId),
								price: variantPrice,
								requires_shipping: true,
								weight: shipWeightLbs,
								weight_unit: 'lb',
								grams: Math.round(shipWeightLbs * 453.59237),
								inventory_policy: 'deny',
								inventory_management: 'shopify',
								barcode: cert_no,
							},
						}),
					},
				);

				const variant_update_body = await variant_update_rest.json();
				logger.info("🎯 REST variant update result:", variant_update_body);

				if (!variant_update_rest.ok) {
					logger.error(`Variant REST update failed with status ${variant_update_rest.status}`);
					return { success: false, message: `Variant update failed ${variant_update_rest.status}` };
				}

				if (!inventoryItemId) {
					logger.warn("Missing inventory item id after variant update; skipping inventory adjustment.");
				} else {
					const inventoryItemNumericId = inventoryItemId.split("/").pop();

					if (!inventoryItemNumericId) {
						logger.warn("Unable to derive numeric inventory item id");
					} else {
						const inventory_item_update_rest = await fetch(
							`https://${shop}/admin/api/2024-10/inventory_items/${inventoryItemNumericId}.json`,
							{
								method: 'PUT',
								headers: {
									'Content-Type': 'application/json',
									'X-Shopify-Access-Token': sessionRecord.accessToken,
								},
								body: JSON.stringify({
									inventory_item: {
										id: Number(inventoryItemNumericId),
										tracked: true,
									},
								}),
							},
						);

						const inventory_item_update_body = await inventory_item_update_rest.json();
						logger.info("🎯 REST inventory item update result:", inventory_item_update_body);

						if (!inventory_item_update_rest.ok) {
							logger.error(`Inventory item REST update failed with status ${inventory_item_update_rest.status}`);
						}
					}

					const inventory_adjust_mutation = `
						mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
							inventorySetQuantities(input: $input) {
							inventoryAdjustmentGroup {
								changes {
									item {
										id
									}
									delta
									quantityAfterChange
								}
							}
							userErrors {
								field
								message
							}
						}
					}
				`;

				const inventory_adjust_response = await fetch(graphql_url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-Shopify-Access-Token': sessionRecord.accessToken,
					},
					body: JSON.stringify({
						query: inventory_adjust_mutation,
						variables: {
							input: {
								name: "available",
								reason: "other",
								ignoreCompareQuantity: true,
								quantities: [
									{
										inventoryItemId,
										locationId,
										quantity: 1,
									},
								],
							},
						},
					}),
				});

				const inventory_adjust_data = await inventory_adjust_response.json();
				logger.info("🎉 Inventory adjust result:", inventory_adjust_data);

				const inventoryErrors = inventory_adjust_data.data?.inventorySetQuantities?.userErrors || [];
				if (inventoryErrors.length > 0) {
					logger.error(`Inventory adjust errors: ${JSON.stringify(inventoryErrors)}`);
				} else {
					logger.info("✅ Inventory adjusted successfully");
				}
			}

			await sendNotification({
				length: 3000,
				title: "Product has been created",
				type: "PSA",
			});

			return { success: true, message: "Product has been created" };

		} catch (error) {
			logger.error(`An unexpected error occurred: ${error}`);
			return { success: false, message: `An unexpected error occurred: ${error}` };
		} finally {
			if (browser) {
				await browser.close();
			}
		}
	},
});
