import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Banner,
  FormLayout,
  Box,
  DataTable,
  Badge,
  EmptyState,
  Modal,
  Divider,
  ButtonGroup,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { LotService } from "~/modules/lot.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  
  const lotId = params.id!;
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get("search");
  
  try {
    // Load lot and existing Shopify products in parallel
    const [lot, existingProducts] = await Promise.all([
      LotService.getLotById(lotId),
      LotService.searchExistingProducts(searchTerm || undefined),
    ]);
    
    if (!lot) {
      throw new Response("Lot not found", { status: 404 });
    }
    
    return json({ lot, existingProducts });
  } catch (error) {
    console.error("Error loading lot products:", error);
    throw new Response("Error loading lot", { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  await authenticate.admin(request);
  
  const lotId = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  
  try {
    switch (intent) {
      case "add-product": {
        const productName = formData.get("productName") as string;
        const sku = formData.get("sku") as string;
        const description = formData.get("description") as string;
        const estimatedQuantity = formData.get("estimatedQuantity") as string;
                 const shopifyProductId = formData.get("shopifyProductId") as string;
         const shopifyVariantId = formData.get("shopifyVariantId") as string;

        if (!productName) {
          return json({ 
            success: false, 
            error: "Product name is required",
            type: "add-product"
          });
        }

                 await LotService.addProductToLotWithShopifyLink(lotId, {
           productName,
           sku: sku || undefined,
           description: description || undefined,
           estimatedQuantity: estimatedQuantity ? Number(estimatedQuantity) : 1,
           shopifyProductId: shopifyProductId || undefined,
           shopifyVariantId: shopifyVariantId || undefined,
         });

        const message = shopifyProductId 
          ? "Product added and linked to existing Shopify product!"
          : "Product added successfully!";

        return json({ 
          success: true,
          message,
          type: "add-product"
        });
      }

      case "add-variant": {
        const productId = formData.get("productId") as string;
        const variantName = formData.get("variantName") as string;
        const condition = formData.get("condition") as string;
        const rarity = formData.get("rarity") as string;
        const quantity = formData.get("quantity") as string;
        const estimatedValue = formData.get("estimatedValue") as string;

        if (!productId || !variantName) {
          return json({ 
            success: false, 
            error: "Product and variant name are required",
            type: "add-variant"
          });
        }

        await LotService.addVariantToProduct(productId, {
          variantName,
          condition: condition || undefined,
          rarity: rarity || undefined,
          quantity: quantity ? Number(quantity) : 1,
          estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        });

        return json({ 
          success: true,
          message: "Variant added successfully!",
          type: "add-variant"
        });
      }

      case "delete-product": {
        const productId = formData.get("productId") as string;
        
        if (!productId) {
          return json({ 
            success: false, 
            error: "Product ID is required",
            type: "delete-product"
          });
        }

        await LotService.deleteLotProduct(productId);

        return json({ 
          success: true,
          message: "Product deleted successfully!",
          type: "delete-product"
        });
      }

      case "delete-variant": {
        const variantId = formData.get("variantId") as string;
        
        if (!variantId) {
          return json({ 
            success: false, 
            error: "Variant ID is required",
            type: "delete-variant"
          });
        }

        await LotService.deleteLotProductVariant(variantId);

        return json({ 
          success: true,
          message: "Variant deleted successfully!",
          type: "delete-variant"
        });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    return json({ 
      success: false, 
      error: "Action failed. Please try again.",
      type: intent
    }, { status: 500 });
  }
}

export default function LotProducts() {
  const { lot, existingProducts } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isSubmitting = navigation.state === "submitting";
  
  // Modal states
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddVariant, setShowAddVariant] = useState<string | null>(null);
  
  // Product search and selection states
  const [productSearch, setProductSearch] = useState("");
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState<any>(null);
  const [searchResults, setSearchResults] = useState(existingProducts || []);
  
  // Form states
     const [productForm, setProductForm] = useState({
     productName: "",
     sku: "",
     description: "",
     estimatedQuantity: "1",
     shopifyProductId: "",
     shopifyVariantId: "",
   });

  const [variantForm, setVariantForm] = useState({
    variantName: "",
    condition: "",
    rarity: "",
    quantity: "1",
    estimatedValue: "",
  });

  // Reset forms and close modals on successful actions
  if (actionData?.success) {
    if (actionData.type === "add-product" && showAddProduct) {
      setShowAddProduct(false);
             setProductForm({
         productName: "",
         sku: "",
         description: "",
         estimatedQuantity: "1",
         shopifyProductId: "",
         shopifyVariantId: "",
       });
      setSelectedShopifyProduct(null);
      setProductSearch("");
    }
    if (actionData.type === "add-variant" && showAddVariant) {
      setShowAddVariant(null);
      setVariantForm({
        variantName: "",
        condition: "",
        rarity: "",
        quantity: "1",
        estimatedValue: "",
      });
    }
  }

  const handleAddProduct = () => {
    const form = new FormData();
    form.append("intent", "add-product");
    Object.entries(productForm).forEach(([key, value]) => {
      form.append(key, value);
    });
    submit(form, { method: "POST" });
  };

  const handleProductSearch = (searchTerm: string) => {
    setProductSearch(searchTerm);
    
    if (searchTerm.trim().length < 2) {
      setSearchResults(existingProducts || []);
      return;
    }

    // Filter existing products based on search term
    const filtered = existingProducts?.filter((product: any) =>
      product.title.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];
    
    setSearchResults(filtered);
  };

     const handleSelectShopifyProduct = async (product: any) => {
     // Fetch full product details with all variants
     try {
       const res = await fetch(`/api/product/${product.id}`);
       const full = await res.json();
       setSelectedShopifyProduct(full);
       setProductForm(prev => ({
         ...prev,
         productName: full.title,
         description: full.description,
         shopifyProductId: full.id,
         shopifyVariantId: "",
       }));
       setProductSearch(full.title);
     } catch (e) {
       // Fallback to provided product if fetch fails
       setSelectedShopifyProduct(product);
       setProductForm(prev => ({
         ...prev,
         productName: product.title,
         description: product.description,
         shopifyProductId: product.id,
         shopifyVariantId: "",
       }));
       setProductSearch(product.title);
     }
   };

  const handleClearSelection = () => {
         setSelectedShopifyProduct(null);
     setProductForm(prev => ({
       ...prev,
       shopifyProductId: "",
       shopifyVariantId: "",
     }));
  };

  const handleAddVariant = (productId: string) => {
    const form = new FormData();
    form.append("intent", "add-variant");
    form.append("productId", productId);
    Object.entries(variantForm).forEach(([key, value]) => {
      form.append(key, value);
    });
    submit(form, { method: "POST" });
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm("Delete this product and all its variants? This action cannot be undone.")) {
      const form = new FormData();
      form.append("intent", "delete-product");
      form.append("productId", productId);
      submit(form, { method: "POST" });
    }
  };

  const handleDeleteVariant = (variantId: string) => {
    if (window.confirm("Delete this variant? This action cannot be undone.")) {
      const form = new FormData();
      form.append("intent", "delete-variant");
      form.append("variantId", variantId);
      submit(form, { method: "POST" });
    }
  };

     // --- New state for per-product conversion loading and feedback ---
   const [convertingProductId, setConvertingProductId] = useState<string | null>(null);
   const [conversionStatus, setConversionStatus] = useState<Record<string, { success: boolean; message: string }>>({});
   const [showConversionSetupFor, setShowConversionSetupFor] = useState<string | null>(null);
   const [showNoVariantConfirmFor, setShowNoVariantConfirmFor] = useState<string | null>(null);
   const [noVariantPrice, setNoVariantPrice] = useState<string>("");
   const [conversionLoading, setConversionLoading] = useState(false);

  // --- Handler for converting a product to Shopify ---
  async function handleConvertToShopify(productId: string) {
    setConvertingProductId(productId);
    setConversionStatus((prev) => ({ ...prev, [productId]: { success: false, message: "" } }));
    try {
      const res = await fetch("/api/lotProduct/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ lotProductId: productId }),
      });
      const data = await res.json();
      setConversionStatus((prev) => ({ ...prev, [productId]: { success: data.success, message: data.message } }));
      if (data.success) {
        window.location.reload();
      }
    } catch (err) {
      setConversionStatus((prev) => ({ ...prev, [productId]: { success: false, message: "Error converting product. Please try again." } }));
    } finally {
      setConvertingProductId(null);
    }
  }

  // If product has no variants and not already linked, prompt to create one before converting
  function handlePreConvert(product: any) {
    if (!product.shopifyProductId && (!product.variants || product.variants.length === 0)) {
      // Ask user if they want to proceed without variants or create one first
      setShowNoVariantConfirmFor(product.id);
      return;
    }
    handleConvertToShopify(product.id);
  }

  async function createVariantAndConvert(productId: string) {
    try {
      setConversionLoading(true);
      // First create a variant via the same route action
      const form = new FormData();
      form.append("intent", "add-variant");
      form.append("productId", productId);
      Object.entries(variantForm).forEach(([k, v]) => form.append(k, v));
      const res = await fetch(window.location.pathname, { method: "POST", body: form });
      const data = await res.json();
      if (!data?.success) {
        setConversionStatus((prev) => ({ ...prev, [productId]: { success: false, message: data?.error || "Failed to create variant" } }));
        return;
      }
      // Then convert
      await handleConvertToShopify(productId);
    } catch (e) {
      setConversionStatus((prev) => ({ ...prev, [productId]: { success: false, message: "Error during conversion setup" } }));
    } finally {
      setConversionLoading(false);
      setShowConversionSetupFor(null);
    }
  }

  // Condition options for cards and sealed products
  const conditionOptions = [
    { label: "Select condition...", value: "" },
    { label: "Mint (M)", value: "mint" },
    { label: "Near Mint (NM)", value: "near_mint" },
    { label: "Excellent (EX)", value: "excellent" },
    { label: "Very Good (VG)", value: "very_good" },
    { label: "Good (G)", value: "good" },
    { label: "Poor (P)", value: "poor" },
    { label: "Damaged", value: "damaged" },
    { label: "Sealed", value: "sealed" }, // For sealed products
  ];

  // Rarity options for collectibles
  const rarityOptions = [
    { label: "Select rarity...", value: "" },
    { label: "Common", value: "common" },
    { label: "Uncommon", value: "uncommon" },
    { label: "Rare", value: "rare" },
    { label: "Holo Rare", value: "holo_rare" },
    { label: "Ultra Rare", value: "ultra_rare" },
    { label: "Secret Rare", value: "secret_rare" },
    { label: "Promo", value: "promo" },
    { label: "First Edition", value: "first_edition" },
    { label: "Shadowless", value: "shadowless" },
    { label: "Base Set", value: "base_set" },
    { label: "N/A", value: "na" }, // For sealed products
  ];

  return (
    <Page 
      title={`Products - Lot #${lot.id.slice(-8)}`}
      backAction={{
        content: 'Back to Lot',
        url: `/app/lots/${lot.id}`,
      }}
      primaryAction={{
        content: 'Add Product',
        onAction: () => setShowAddProduct(true),
      }}
    >
      <BlockStack gap="500">
        {/* Action Results */}
        {actionData?.success && (
          <Banner tone="success">
            <Text as="p">{actionData.message}</Text>
          </Banner>
        )}
        
        {actionData?.error && (
          <Banner tone="critical">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}
        {/* --- Show per-product conversion feedback --- */}
        {Object.entries(conversionStatus).map(([productId, status]) =>
          status.message ? (
            <Banner key={productId} tone={status.success ? "success" : "critical"}>
              <Text as="p">{status.message}</Text>
            </Banner>
          ) : null
        )}

        {/* Lot Summary */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Lot Overview</Text>
            <Layout>
              <Layout.Section variant="oneThird">
                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Purchase Date</Text>
                  <Text as="dd" variant="bodyMd">{new Date(lot.purchaseDate).toLocaleDateString()}</Text>
                </Box>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Seller</Text>
                  <Text as="dd" variant="bodyMd">{lot.vendor || "Not specified"}</Text>
                </Box>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Total Products</Text>
                  <Text as="dd" variant="bodyMd">{lot.lotProducts?.length || 0}</Text>
                </Box>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Card>

        {/* Products List */}
        {lot.lotProducts && lot.lotProducts.length > 0 ? (
          <BlockStack gap="400">
            {lot.lotProducts.map((product: any) => (
              <Card key={product.id}>
                <BlockStack gap="400">
                  {/* Product Header */}
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <InlineStack gap="200">
                        <Text as="h3" variant="headingMd">{product.productName}</Text>
                        {product.shopifyProductId && (
                          <Badge tone="success">🔗 Linked to Shopify</Badge>
                        )}
                        {product.isConverted && (
                          <Badge tone="success">✅ Converted</Badge>
                        )}
                      </InlineStack>
                      {product.sku && (
                        <Text as="p" variant="bodySm" tone="subdued">SKU: {product.sku}</Text>
                      )}
                      {product.shopifyProductId && (
                        <Text as="p" variant="bodySm" tone="subdued">
                          Shopify Product ID: {product.shopifyProductId}
                        </Text>
                      )}
                      {product.description && (
                        <Text as="p" variant="bodyMd">{product.description}</Text>
                      )}
                      <Text as="p" variant="bodySm" tone="subdued">
                        Estimated Quantity: {product.estimatedQuantity}
                      </Text>
                    </BlockStack>
                    
                    <ButtonGroup>
                      <Button 
                        size="micro"
                        onClick={() => setShowAddVariant(product.id)}
                      >
                        Add Variant
                      </Button>
                      <Button 
                        size="micro" 
                        variant="secondary"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        Delete Product
                      </Button>
                      {/* --- Convert to Shopify Button --- */}
                                             {!product.isConverted && (
                         <Button
                           size="micro"
                           variant="primary"
                           loading={convertingProductId === product.id}
                           onClick={() => handlePreConvert(product)}
                           disabled={convertingProductId === product.id}
                         >
                           Convert to Shopify
                         </Button>
                       )}
                    </ButtonGroup>
                  </InlineStack>

                  <Divider />

                  {/* Product Variants */}
                  <BlockStack gap="300">
                    <Text as="h4" variant="headingSm">Variants</Text>
                    
                    {product.variants && product.variants.length > 0 ? (
                      <DataTable
                        columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'text']}
                        headings={['Variant Name', 'Condition', 'Rarity', 'Quantity', 'Est. Value', 'Actions']}
                        rows={product.variants.map((variant: any) => [
                          variant.variantName,
                          variant.condition ? (
                            <Badge key={`condition-${variant.id}`} tone="info">
                              {variant.condition.replace('_', ' ').toUpperCase()}
                            </Badge>
                          ) : "N/A",
                          variant.rarity ? (
                            <Badge key={`rarity-${variant.id}`} tone="attention">
                              {variant.rarity.replace('_', ' ').toUpperCase()}
                            </Badge>
                          ) : "N/A",
                          variant.quantity,
                          variant.estimatedValue ? `$${variant.estimatedValue.toFixed(2)}` : "-",
                          <Button 
                            key={`delete-${variant.id}`}
                            size="micro" 
                            variant="secondary"
                            onClick={() => handleDeleteVariant(variant.id)}
                          >
                            Delete
                          </Button>,
                        ])}
                      />
                    ) : (
                      <Box padding="300">
                        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                          No variants added yet. Click "Add Variant" to get started.
                        </Text>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            ))}
          </BlockStack>
        ) : (
          <Card>
            <EmptyState
              heading="No products added yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: 'Add First Product',
                onAction: () => setShowAddProduct(true),
              }}
            >
              <p>Start adding individual products that are included in this lot. You can add both individual cards and sealed products.</p>
              <p><strong>💡 Tip:</strong> Link to existing Shopify products for instant conversion, or create new products manually.</p>
            </EmptyState>
          </Card>
        )}

        {/* Add Product Modal */}
        <Modal
          open={showAddProduct}
          onClose={() => setShowAddProduct(false)}
          title="Add Product to Lot"
          primaryAction={{
            content: selectedShopifyProduct ? 'Link Existing Product' : 'Add New Product',
            onAction: handleAddProduct,
            loading: isSubmitting,
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setShowAddProduct(false),
          }]}
        >
          <Modal.Section>
            <FormLayout>
              {/* Existing Product Search */}
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">🔍 Search Existing Shopify Products</Text>
                <TextField
                  label="Search for existing product"
                  value={productSearch}
                  onChange={handleProductSearch}
                  placeholder="Type to search your Shopify products..."
                  helpText="Link to an existing product to speed up conversion"
                  autoComplete="off"
                />

                {/* Selected Product Display */}
                                 {selectedShopifyProduct && (
                   <Card>
                     <BlockStack gap="200">
                       <InlineStack align="space-between">
                         <Text as="h4" variant="headingSm">✅ Selected Product</Text>
                         <Button size="micro" onClick={handleClearSelection}>Clear</Button>
                       </InlineStack>
                       <Text as="p" variant="bodyMd">{selectedShopifyProduct.title}</Text>
                       <Text as="p" variant="bodySm" tone="subdued">
                         Status: {selectedShopifyProduct.status} | 
                         Inventory: {selectedShopifyProduct.totalInventory} | 
                         Variants: {selectedShopifyProduct.variants?.length || 0}
                       </Text>

                       {selectedShopifyProduct.variants?.length > 0 && (
                         <Select
                           label="Link to specific variant (optional)"
                           options={[{ label: "Select a variant...", value: "" }, ...selectedShopifyProduct.variants.map((v: any) => ({
                             label: `${v.title} - $${v.price}${v.sku ? ` (SKU: ${v.sku})` : ""}`,
                             value: v.id,
                           }))]}
                           value={productForm.shopifyVariantId}
                           onChange={(value) => setProductForm(prev => ({ ...prev, shopifyVariantId: value }))}
                           helpText="Choose a variant if this lot product specifically corresponds to one."
                         />
                       )}
                     </BlockStack>
                   </Card>
                 )}

                {/* Search Results */}
                {!selectedShopifyProduct && searchResults.length > 0 && productSearch.length >= 2 && (
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h4" variant="headingSm">Search Results</Text>
                      <Box>
                        <BlockStack gap="100">
                          {searchResults.slice(0, 5).map((product: any) => (
                            <Button
                              key={product.id}
                              onClick={() => handleSelectShopifyProduct(product)}
                              variant="secondary"
                              textAlign="left"
                              fullWidth
                            >
                              {`${product.title} (${product.status} | ${product.variants?.length || 0} variants)`}
                            </Button>
                          ))}
                        </BlockStack>
                      </Box>
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>

              <Divider />

              {/* Manual Product Entry */}
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  {selectedShopifyProduct ? "📝 Product Details (from Shopify)" : "📝 Manual Product Entry"}
                </Text>
                
                <TextField
                  label="Product Name"
                  value={productForm.productName}
                  onChange={(value) => setProductForm(prev => ({ ...prev, productName: value }))}
                  placeholder="e.g., Charizard Base Set, Booster Box - Evolving Skies"
                  helpText={selectedShopifyProduct ? "Populated from selected Shopify product" : "Enter the name of the card or sealed product"}
                  autoComplete="off"
                  disabled={!!selectedShopifyProduct}
                />
                
                <FormLayout.Group>
                  <TextField
                    label="SKU (Optional)"
                    value={productForm.sku}
                    onChange={(value) => setProductForm(prev => ({ ...prev, sku: value }))}
                    placeholder="e.g., BS-004, EVO-BB-001"
                    helpText="Internal SKU or reference number"
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Estimated Quantity"
                    type="number"
                    value={productForm.estimatedQuantity}
                    onChange={(value) => setProductForm(prev => ({ ...prev, estimatedQuantity: value }))}
                    helpText="How many of this product"
                    autoComplete="off"
                  />
                </FormLayout.Group>

                <TextField
                  label="Description (Optional)"
                  multiline={3}
                  value={productForm.description}
                  onChange={(value) => setProductForm(prev => ({ ...prev, description: value }))}
                  placeholder="Additional details about this product..."
                  helpText={selectedShopifyProduct ? "Populated from selected Shopify product" : "Any special notes or details"}
                  autoComplete="off"
                  disabled={!!selectedShopifyProduct}
                />
              </BlockStack>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Add Variant Modal */}
        <Modal
          open={showAddVariant !== null}
          onClose={() => setShowAddVariant(null)}
          title="Add Variant"
          primaryAction={{
            content: 'Add Variant',
            onAction: () => showAddVariant && handleAddVariant(showAddVariant),
            loading: isSubmitting,
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setShowAddVariant(null),
          }]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Variant Name"
                value={variantForm.variantName}
                onChange={(value) => setVariantForm(prev => ({ ...prev, variantName: value }))}
                placeholder="e.g., Holo, 1st Edition, Japanese"
                helpText="Specific variant or version"
                autoComplete="off"
              />
              
              <FormLayout.Group>
                <Select
                  label="Condition"
                  options={conditionOptions}
                  value={variantForm.condition}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, condition: value }))}
                  helpText="Physical condition"
                />
                
                <Select
                  label="Rarity"
                  options={rarityOptions}
                  value={variantForm.rarity}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, rarity: value }))}
                  helpText="Rarity or edition"
                />
              </FormLayout.Group>

              <FormLayout.Group>
                <TextField
                  label="Quantity"
                  type="number"
                  value={variantForm.quantity}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, quantity: value }))}
                  helpText="Number of this variant"
                  autoComplete="off"
                />
                
                <TextField
                  label="Estimated Value (Optional)"
                  type="number"
                  prefix="$"
                  value={variantForm.estimatedValue}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, estimatedValue: value }))}
                  helpText="Individual estimated value"
                  autoComplete="off"
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Confirm convert without variants modal */}
        <Modal
          open={showNoVariantConfirmFor !== null}
          onClose={() => setShowNoVariantConfirmFor(null)}
          title="Create product without a variant?"
          primaryAction={{
            content: 'Yes',
            onAction: async () => {
              if (!showNoVariantConfirmFor) return;
              const id = showNoVariantConfirmFor;
              setShowNoVariantConfirmFor(null);
              setConvertingProductId(id);
              setConversionStatus((prev) => ({ ...prev, [id]: { success: false, message: '' } }));
              try {
                const payload: any = { lotProductId: id };
                if (noVariantPrice && !Number.isNaN(Number(noVariantPrice))) {
                  payload.defaultPrice = Number(noVariantPrice);
                }
                const res = await fetch('/api/lotProduct/convert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                setConversionStatus((prev) => ({ ...prev, [id]: { success: data.success, message: data.message } }));
                if (data.success) window.location.reload();
              } catch (e) {
                setConversionStatus((prev) => ({ ...prev, [id]: { success: false, message: 'Error converting product.' } }));
              } finally {
                setConvertingProductId(null);
                setNoVariantPrice('');
              }
            },
            loading: convertingProductId === showNoVariantConfirmFor,
          }}
          secondaryActions={[
            {
              content: 'Create Variants',
              onAction: () => {
                if (!showNoVariantConfirmFor) return;
                const id = showNoVariantConfirmFor;
                setShowNoVariantConfirmFor(null);
                setShowConversionSetupFor(id);
                setVariantForm({ variantName: 'Default', condition: '', rarity: '', quantity: '1', estimatedValue: '' });
              },
            },
            {
              content: 'Cancel',
              onAction: () => setShowNoVariantConfirmFor(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                You're about to create a Shopify product without any variants. This is okay for simple items.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Optionally set a price for the default variant now, or create variants next.
              </Text>
              <TextField
                label="Default Variant Price (optional)"
                type="number"
                prefix="$"
                value={noVariantPrice}
                onChange={(value) => setNoVariantPrice(value)}
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* Add Variant Modal for conversion setup */}
        <Modal
          open={showConversionSetupFor !== null}
          onClose={() => setShowConversionSetupFor(null)}
          title="Create a variant before converting"
          primaryAction={{
            content: 'Create Variant and Convert',
            onAction: () => showConversionSetupFor && createVariantAndConvert(showConversionSetupFor),
            loading: conversionLoading,
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setShowConversionSetupFor(null),
          }]}
        >
          <Modal.Section>
            <FormLayout>
              <Text as="p" variant="bodySm" tone="subdued">This product has no variants. Create at least one to set price and quantity.</Text>
              <TextField
                label="Variant Name"
                value={variantForm.variantName}
                onChange={(value) => setVariantForm(prev => ({ ...prev, variantName: value }))}
                autoComplete="off"
              />
              <FormLayout.Group>
                <Select
                  label="Condition"
                  options={conditionOptions}
                  value={variantForm.condition}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, condition: value }))}
                />
                <Select
                  label="Rarity"
                  options={rarityOptions}
                  value={variantForm.rarity}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, rarity: value }))}
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField
                  label="Quantity"
                  type="number"
                  value={variantForm.quantity}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, quantity: value }))}
                  autoComplete="off"
                />
                <TextField
                  label="Price"
                  type="number"
                  prefix="$"
                  value={variantForm.estimatedValue}
                  onChange={(value) => setVariantForm(prev => ({ ...prev, estimatedValue: value }))}
                  autoComplete="off"
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Page>
  );
} 