import { z } from "zod";
export const inventoryLevelInputSchema = z.object({
    availableQuantity: z.number(),
    locationId: z.string()
});
export const inventorySetQuantitiesInputSchema = z.object({
    name: z.string(),
    reason: z.string(),
    ignoreCompareQuantity: z.boolean(),
    quantities: z.object({
        inventoryItemId: z.string(),
        locationId: z.string(),
        quantity: z.number()
    })
});
export const variantOptionValueInputSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    optionId: z.string().optional(),
    optionName: z.string()
});
export const metafieldInputSchema = z.object({
    description: z.string(),
    id: z.string(),
    key: z.string(),
    namespace: z.string(),
    type: z.string(),
    value: z.string()
});
export const productVariantSetInputSchema = z.object({
    barcode: z.string(),
    compareAtPrice: z.string(),
    id: z.string(),
    inventoryPolicy: z.string().optional(),
    mediaId: z.string().optional(),
    metafields: z.array(metafieldInputSchema),
    optionValues: z.array(variantOptionValueInputSchema),
    position: z.number(),
    price: z.number(),
    requiresComponents: z.boolean(),
    sku: z.string(),
    taxCode: z.string(),
    taxable: z.boolean()
});
export const optionValueSetInputSchema = z.object({
    id: z.string().optional(),
    name: z.string()
});
export const productOptionsInputSchema = z.object({
    id: z.string().optional(),
    name: z.string(),
    position: z.number().optional(),
    values: z.array(optionValueSetInputSchema)
});
export const productSetInputSchema = z.object({
    category: z.string().optional(),
    claimOwnership: z.object({
        bundles: z.boolean().optional()
    }).optional(),
    collections: z.array(z.string()).optional(),
    combinedListingRole: z.string().optional(),
    customProductType: z.string().optional(),
    descriptionHtml: z.string().optional(),
    giftCard: z.boolean().optional(),
    giftCardTemplateSuffix: z.string().optional(),
    handle: z.string().optional(),
    id: z.string().optional(),
    metafields: z.array(metafieldInputSchema).optional(),
    productOptions: z.array(productOptionsInputSchema).optional(),
    productType: z.string().optional(),
    redirectNewHandle: z.boolean().optional(),
    requiresSellingPlan: z.boolean().optional(),
    seo: z.object({
        description: z.string().optional(),
        title: z.string().optional()
    }).optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    templateSuffix: z.string().optional(),
    title: z.string().optional(),
    variants: z.array(productVariantSetInputSchema).optional(),
    vendor: z.string().optional()
});
export const productUpdateInputSchema = z.object({
    claimOwnership: z.object({
        bundles: z.boolean().optional()
    }).optional(),
    collections: z.array(z.string()).optional(),
    combinedListingRole: z.string().optional(),
    customProductType: z.string().optional(),
    descriptionHtml: z.string().optional(),
    giftCard: z.boolean().optional(),
    giftCardTemplateSuffix: z.string().optional(),
    handle: z.string().optional(),
    id: z.string(),
    metafields: z.array(metafieldInputSchema).optional(),
    productOptions: z.array(productOptionsInputSchema).optional(),
    productType: z.string().optional(),
    redirectNewHandle: z.boolean().optional(),
    requiresSellingPlan: z.boolean().optional(),
    seo: z.object({
        description: z.string().optional(),
        title: z.string().optional()
    }).optional(),
    status: z.string().optional(),
    tags: z.array(z.string()).optional(),
    templateSuffix: z.string().optional(),
    title: z.string().optional(),
    variants: z.array(productVariantSetInputSchema).optional(),
    vendor: z.string().optional()
});
export const updateMediaInputSchema = z.object({
    alt: z.string(),
    id: z.string(),
    previewImageSource: z.string()
});
export const productVariantInputPriceSchema = z.object({
    id: z.string().optional(),
    price: z.number().optional()
});
export const productStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]);
export const productEdgeIndexReturnSchema = z.object({
    node: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        totalInventory: z.number(),
        status: productStatusSchema,
        variants: z.object({
            nodes: z.array(z.object({
                id: z.string(),
                title: z.string(),
                barcode: z.string().nullable(),
                sku: z.string().nullable(),
                price: z.string(),
                inventoryQuantity: z.number(),
                inventoryItem: z.object({
                    id: z.string(),
                    sku: z.string().nullable(),
                    unitCost: z.object({
                        amount: z.string()
                    }).nullable()
                }),
                weight: z.number(),
                weightUnit: z.enum(["POUNDS", "KILOGRAMS", "OUNCES", "GRAMS"])
            }))
        })
    })
});
export const productIndexReturnSchema = z.object({
    edges: z.array(productEdgeIndexReturnSchema),
    pageInfo: z.object({
        startCursor: z.string(),
        endCursor: z.string(),
        hasNextPage: z.boolean(),
        hasPreviousPage: z.boolean()
    })
});
export const weightInputSchema = z.object({
    unit: z.enum(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"]),
    value: z.number(),
});
export const inventoryItemMeasurementInputSchema = z.object({
    weight: weightInputSchema,
});
export const inventoryItemInputSchema = z.object({
    cost: z.string().optional(),
    tracked: z.boolean().optional(),
    measurement: inventoryItemMeasurementInputSchema.optional(),
});
export const inventoryItemSchema = z.object({
    cost: z.string(),
    tracked: z.boolean(),
});
export const variantSchema = z.object({
    price: z.string(),
    options: z.array(z.string()),
    inventoryPolicy: z.string(),
    weight: z.number(),
    weightUnit: z.string(),
    inventoryItem: inventoryItemSchema,
});
export const productVariantInputSchema = z.object({
    barcode: z.string().optional(),
    compareAtPrice: z.string().optional(),
    id: z.string().optional(),
    inventoryItem: inventoryItemInputSchema.optional(),
    inventoryPolicy: z.string().optional(),
    mediaId: z.string().optional(),
    metafields: z.array(metafieldInputSchema).optional(),
    position: z.number().optional(),
    price: z.number().optional(),
    requiresComponents: z.boolean().optional(),
    sku: z.string().optional(),
    taxCode: z.string().optional(),
    taxable: z.boolean().optional(),
    weight: z.number().optional(),
    weightUnit: z.string().optional(),
    options: z.array(z.string()),
});
export const productVariantsBulkInputSchema = z.object({
    barcode: z.string().optional(),
    compareAtPrice: z.string().optional(),
    id: z.string().optional(),
    inventoryPolicy: z.enum(["DENY", "CONTINUE"]).optional(),
    inventoryItem: inventoryItemInputSchema.optional(),
    inventoryQuantities: z.array(inventoryLevelInputSchema).optional(),
    optionValues: z.array(variantOptionValueInputSchema).optional(),
    price: z.number().optional()
});
export const mediaInputSchema = z.object({
    alt: z.string(),
    mediaContentType: z.string(),
    originalSource: z.string(),
});
export const itemCreationVariablesSchema = z.object({
    title: z.string(),
    descriptionHtml: z.string(),
    productType: z.string(),
    vendor: z.string(),
    tags: z.array(z.string()),
    variants: z.array(variantSchema),
    status: z.string(),
    options: z.array(z.string()),
});
export const productCreateInputSchema = z.object({
    category: z.string().optional(),
    collectionsToJoin: z.array(z.string()).optional(),
    claimOwnership: z.object({
        bundles: z.boolean().optional(),
    }).optional(),
    descriptionHtml: z.string().optional(),
    giftCard: z.boolean().optional(),
    giftCardTemplateSuffix: z.string().optional(),
    handle: z.string().optional(),
    id: z.string().optional(),
    metafields: z.array(metafieldInputSchema).optional(),
    productOptions: z.array(productOptionsInputSchema).optional(),
    productType: z.string().optional(),
    redirectNewHandle: z.boolean().optional(),
    requiresSellingPlan: z.boolean().optional(),
    seo: z.object({
        description: z.string().optional(),
        title: z.string().optional(),
    }).optional(),
    status: z.enum(["ACTIVE", "DRAFT"]).optional(),
    tags: z.array(z.string()).optional(),
    templateSuffix: z.string().optional(),
    title: z.string(),
    vendor: z.string().optional(),
});
export async function createProductWMedia(admin, input_variables, images) {
    const query = await admin.graphql(`#graphql
      mutation CreateProductWithNewMedia($input: ProductCreateInput!, $media: [CreateMediaInput!]!) {
        productCreate(product: $input, media: $media) {
          userErrors {
            field
            message
          }
          product {
            id
            title
            description
            totalInventory
            status
            options {
            id
            name
            position
            values
          }
        }
      }
    }`, {
        variables: {
            input: input_variables,
            media: images,
        },
    });
    const response = await query.json();
    return response;
}
export async function createBulkVariants(admin, productId, variants, strategy = "DEFAULT") {
    const query = await admin.graphql(`#graphql
		mutation ProductVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
  productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
    userErrors {
      field
      message
    }
    productVariants {
      id
      title
      barcode
      sku
      price
	  selectedOptions{
        name
        value
      }
      inventoryQuantity
      inventoryItem {
        id
        sku
        inventoryLevels(first: 1) {
          nodes {
            id
            location {
              id
            }
            quantities(names: ["available"]) {
              quantity
            }
          }
        }
      }
    }
  }
}
`, { variables: { productId, variants, strategy } });
    const response = await query.json();
    return response;
}
export async function adjustInventory(admin, invItemId, locationId, quantity) {
    const query = await admin.graphql(`#graphql
    mutation AdjustInventoryQuantity($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        changes{
          name
		  quantityAfterChange
          item{
            id
          }
          delta
        }
      }
    }
  }
  `, {
        variables: {
            input: {
                name: "available",
                reason: "other",
                ignoreCompareQuantity: true,
                quantities: {
                    inventoryItemId: invItemId,
                    locationId: locationId,
                    quantity: quantity,
                },
            },
        },
    });
    const response = await query.json();
    return response;
}
export async function productSet(admin, input, synchronous) {
    const response = await admin.graphql(`#graphql
        mutation setProduct($productSet: ProductSetInput!, $synchronous: Boolean!) {
          productSet(synchronous: $synchronous, input: $productSet) {
            product {
              id
              variants(first: 10){
                nodes{
                  id
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`, {
        variables: {
            synchronous: synchronous,
            productSet: input,
        },
    });
    const data = await response.json();
    return data;
}
export async function productUpdateMedia(admin, productID, input) {
    const response = await admin.graphql(`#graphql
    mutation productUpdateMedia($media: [UpdateMediaInput!]!, $productId: ID!) {
  productUpdateMedia(media: $media, productId: $productId) {
    mediaUserErrors {
      code
      field
      message
    }
  }
}
`, {
        variables: {
            media: input,
            productId: productID,
        },
    });
    const data = await response.json();
    return data;
}
export async function getFirst100Items(admin, locationID) {
    const query = await admin.graphql(`#graphql
      query getLowProducts($locationID: ID!){
    inventoryItems(first: 100){
      edges{
        node{
          id,
          variant{
            price
            product{
              id
              status
            }
          }
          tracked,
          inventoryLevel(locationId: $locationID) {
            id
            quantities(names: ["available"]){
              quantity
            }
          }
        }
      }
      pageInfo{
        startCursor
        endCursor
        hasNextPage
        hasPreviousPage
      }
    }
  }
  `, { variables: { locationID: locationID } });
    const resp = await query.json();
    return resp;
}
export async function getNext100Items(admin, locationID, startCursor) {
    const query = await admin.graphql(`#graphql
  query getLowProducts($start: String, $locationID: ID!){
  inventoryItems(first: 100, after: $start){
    edges{
      node{
        id,
        variant{
          price
          product{
            id
            status
          }
        }

        tracked,
        inventoryLevel(locationId: $locationID) {
          id
          quantities(names: ["available"]){
            quantity
          }
        }
      }
    }
    pageInfo{
      startCursor
      endCursor
      hasNextPage
      hasPreviousPage
    }
  }
}
`, { variables: { start: startCursor, locationID: locationID } });
    const resp = await query.json();
    return resp;
}
export async function setDraft(admin, id) {
    const resp = await admin.graphql(`#graphql
    mutation setDraft($id: ID!){
      productUpdate(product: {id: $id, status: DRAFT}){
        product{
          id
        }
      }
    }
    `, { variables: { id: id } });
    const data = await resp.json();
    return data;
}
export async function getNext100LowItems(admin, locationID, startCursor) {
    const query = await admin.graphql(`#graphql
      query getLowProducts($start: String, $locationID: ID!){
        inventoryItems(first: 100, after: $start){
        edges{
          node{
            id,
            variant{
              price
              product{
                id
              }
            }
            tracked,
            inventoryLevel(locationId: $locationID) {
              id
              quantities(names: ["available"]){
                quantity
              }
            }
          }
        }
        pageInfo{
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
      }
    }
    `, { variables: { start: startCursor, locationID: locationID } });
    const resp = await query.json();
    return resp;
}
export async function getFirst100LowItems(admin, locationID) {
    const query = await admin.graphql(`#graphql
    query getLowProducts($locationID: ID!){
  inventoryItems(first: 100){
    edges{
      node{
        id,
        variant{
          price
          product{
            id
          }
        }
        tracked,
        inventoryLevel(locationId: $locationID) {
          id
          quantities(names: ["available"]){
            quantity
          }
        }
      }
    }
    pageInfo{
      startCursor
      endCursor
      hasNextPage
      hasPreviousPage
    }
  }
}
`, { variables: { locationID: locationID } });
    const respStart = await query.json();
    return respStart;
}
export async function getShopLocation(admin) {
    const query = await admin.graphql(`#graphql
        query shopInfo {
            location	{
                id
            }
        }`);
    const response = await query.json();
    return response;
}
export async function getPrimaryLocationId(admin) {
    const resp = await admin.graphql(`#graphql
    query PrimaryLocation { locations(first: 1) { nodes { id name } } }
  `);
    const data = await resp.json();
    const id = data?.data?.locations?.nodes?.[0]?.id;
    return id ?? null;
}
export async function productVariantUpdatePrice(admin, variants, productId, allowPartialUpdates) {
    const response = await admin.graphql(`#graphql
		mutation productVariantUpdate($variants: [ProductVariantsBulkInput!]!, $productId: ID!, $allowPartialUpdates: Boolean){
  productVariantsBulkUpdate(variants: $variants, productId: $productId, allowPartialUpdates: $allowPartialUpdates){
    productVariants{
      price
      id
    }
  }
}`, {
        variables: {
            variants,
            productId,
            allowPartialUpdates,
        },
    });
    const data = await response.json();
    return data;
}
export async function getProducts(admin, cursor) {
    const response = await admin.graphql(`#graphql
   query getProducts($cursor: String) {
      products(first: 100, after: $cursor) {
        edges {
          node {
            id
            title
            description
            totalInventory
            status
            variants(first: 100) {
              nodes {
                id
                title
                barcode
                sku
                price
                inventoryQuantity
                inventoryItem {
                  id
                  sku
                  unitCost{
                    amount
                  }
                }
              }
            }
          }
        }
    pageInfo{
      endCursor
      hasNextPage
      hasPreviousPage
      startCursor
    }

  }

    }
  `, { variables: { cursor: cursor } });
    const data = await response.json();
    return data;
}
export async function getProductExists(admin, id) {
    const query = await admin.graphql(`#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        description
        totalInventory
        status

        variants(first: 10) {
        	nodes {
        	  id
        	  price

              selectedOptions{
            	name
            	value
              }
        	  inventoryItem{
        	    id,
        	    inventoryLevels(first:1){
        	      nodes{
        	        id
					location{
					  id
					}
        	        quantities(names: ["available"]){
        	          quantity
        	        }
        	      }
        	    }
        	  }
        	}
        }
      }
    }`, { variables: { id: id } });
    const response = await query.json();
    return response;
}
export async function getCollectionProductIds(admin, collectionId) {
    const productIds = [];
    let hasNextPage = true;
    let endCursor = null;
    while (hasNextPage) {
        let query;
        if (endCursor === null) {
            query = await admin.graphql(`#graphql
		  query getCollection($id: ID!) {
			collection(id: $id) {
			  id
			  title
			  handle
			  products(first: 100) {
				edges {
				  node {
					id
				  }
				}
				pageInfo {
				  hasNextPage
				  endCursor
				}
			  }
			}
		  }`, {
                variables: {
                    id: collectionId
                }
            });
        }
        else {
            query = await admin.graphql(`#graphql
		  query getCollection($id: ID!, $productCursor: String) {
			collection(id: $id) {
			  id
			  title
			  handle
			  products(first: 100, after: $productCursor) {
				edges {
				  node {
					id
				  }
				}
				pageInfo {
				  hasNextPage
				  endCursor
				}
			  }
			}
		  }`, {
                variables: {
                    id: collectionId,
                    productCursor: endCursor
                }
            });
        }
        const response = await query.json();
        if (response.data.errors) {
            throw new Error(`Error getting collection products ${JSON.stringify(response.data.errors)}`);
        }
        productIds.push(...response.data.collection.products.edges.map((edge) => edge.node.id));
        hasNextPage = response.data.collection.products.pageInfo.hasNextPage;
        endCursor = response.data.collection.products.pageInfo.endCursor;
    }
    return productIds;
}
export async function setCollectionProductOrder(admin, productId, collectionId, position) {
    const response = await admin.graphql(`#graphql
			mutation collectionReorderProducts($id: ID!, $moves: [MoveInput!]!) {
			  collectionReorderProducts(id: $id, moves: $moves) {
				job {
				  id
				}
				userErrors {
				  field
				  message
				}
			  }
			}`, {
        variables: {
            "id": collectionId,
            "moves": {
                "id": productId,
                "newPosition": position.toString()
            }
        },
    });
    const data = await response.json();
    return data;
}
export async function waitUntilJobDone(admin, jobId) {
    let done = false;
    while (!done) {
        const response = await admin.graphql(`#graphql
  query jobQuery($jobId: ID!) {
    job(id: $jobId) {
      id
      done
    }
  }`, {
            variables: {
                jobId
            }
        });
        const data = await response.json();
        done = data.data.job.done;
    }
}
export async function collectionAddProducts(admin, collectionId, productIds) {
    const response = await admin.graphql(`#graphql
		mutation collectionAddProductsV2($id: ID!, $productIds: [ID!]!) {
		  collectionAddProductsV2(id: $id, productIds: $productIds) {
			job {
			  done
			  id
			}
			userErrors {
			  field
			  message
			}
		  }
		}`, {
        variables: {
            "id": collectionId,
            "productIds": productIds
        },
    });
    const data = await response.json();
    return data;
}
export async function setProductTracksInventory(admin, productId, tracksInventory) {
    const response = await admin.graphql(`#graphql
    mutation setTracksInventory($id: ID!, $tracks: Boolean!) {
      productUpdate(product: { id: $id, tracksInventory: $tracks }) {
        product { id tracksInventory }
        userErrors { field message }
      }
    }
  `, {
        variables: {
            id: productId,
            tracks: tracksInventory,
        },
    });
    const data = await response.json();
    return data;
}
