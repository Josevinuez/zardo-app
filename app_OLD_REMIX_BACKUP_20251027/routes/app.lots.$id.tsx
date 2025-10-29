import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Box,
  Divider,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { LotService } from "~/modules/lot.server";
import { UPSService } from "~/modules/ups.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  
  const lotId = params.id!;
  
  try {
    const lot = await LotService.getLotById(lotId);
    
    if (!lot) {
      throw new Response("Lot not found", { status: 404 });
    }
    
    return json({ lot, success: true });
  } catch (error) {
    console.error("Error loading lot:", error);
    throw new Response("Error loading lot", { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  await authenticate.admin(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const lotId = params.id!;
  
  try {
    switch (intent) {
      case "refresh-tracking": {
        if (!lotId) {
          return json({ error: "Lot ID required" }, { status: 400 });
        }
        
        const result = await UPSService.refreshLotTracking(lotId);
        
        return json({ 
          success: result.success,
          message: result.message,
          type: "tracking-refresh" 
        });
      }
      
      case "delete-lot": {
        await LotService.deleteLot(lotId);
        return redirect("/app/lots");
      }
      
      case "pay-off-debt": {
        await LotService.payOffDebt(lotId);
        return json({ 
          success: true,
          message: "Debt paid off successfully!",
          type: "debt-payoff" 
        });
      }
      
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: "Action failed" }, { status: 500 });
  }
}

export default function LotDetail() {
  const { lot } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  
  const isNewlyCreated = searchParams.get("created") === "true";
  const isNewlyUpdated = searchParams.get("updated") === "true";

  const handleRefreshTracking = () => {
    setRefreshing(true);
    const formData = new FormData();
    formData.append("intent", "refresh-tracking");
    submit(formData, { method: "POST" });
    setTimeout(() => setRefreshing(false), 2000);
  };

  const handleDeleteLot = () => {
    if (window.confirm("Are you sure you want to delete this lot? This action cannot be undone.")) {
      const formData = new FormData();
      formData.append("intent", "delete-lot");
      submit(formData, { method: "POST" });
    }
  };

  const handlePayOffDebt = () => {
    if (window.confirm("Mark this lot's debt as fully paid?")) {
      const formData = new FormData();
      formData.append("intent", "pay-off-debt");
      submit(formData, { method: "POST" });
    }
  };

  // Format tracking events for display
  const trackingRows = lot.trackingEvents?.map((event: any) => [
    new Date(event.eventDate || event.createdAt).toLocaleDateString(),
    event.eventType,
    event.eventDescription || "No description",
    event.location || "N/A",
  ]) || [];

  const trackingHeadings = ["Date", "Event Type", "Description", "Location"];

  // Format lot products for display
  const productRows = lot.lotProducts?.map((product: any) => [
    product.productName,
    product.sku || "N/A",
    product.estimatedQuantity,
    product.variants?.length || 0,
    <Badge 
      key={product.id}
      tone={product.isConverted ? 'success' : 'warning'}
    >
      {product.isConverted ? 'Converted' : 'Pending'}
    </Badge>,
  ]) || [];

  const productHeadings = ["Product Name", "SKU", "Quantity", "Variants", "Status"];

  return (
    <Page 
      title={`Lot #${lot.id.slice(-8)}`}
      backAction={{
        content: 'All Lots',
        url: '/app/lots',
      }}
      primaryAction={{
        content: 'Edit Lot',
        url: `/app/lots/edit/${lot.id}`,
      }}
      secondaryActions={[
        {
          content: 'Add Products',
          url: `/app/lots/products/${lot.id}`,
        },
        ...(lot.initialDebt > 0 ? [{
          content: 'Pay Off Debt',
          onAction: handlePayOffDebt,
        }] : []),
        {
          content: 'Delete Lot',
          destructive: true,
          onAction: handleDeleteLot,
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Success Banner for newly created lots */}
        {isNewlyCreated && (
          <Banner tone="success">
            <Text as="p">Lot created successfully! You can now add products and track shipping progress.</Text>
          </Banner>
        )}

        {/* Success Banner for newly updated lots */}
        {isNewlyUpdated && (
          <Banner tone="success">
            <Text as="p">Lot updated successfully! Your changes have been saved.</Text>
          </Banner>
        )}

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

        {/* Lot Overview */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Lot Details</Text>
                
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Purchase Date</Text>
                        <Text as="dd" variant="bodyMd">{new Date(lot.purchaseDate).toLocaleDateString()}</Text>
                      </Box>
                      
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Seller Name</Text>
                        <Text as="dd" variant="bodyMd">{lot.vendor || "Not specified"}</Text>
                      </Box>
                      
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Lot Type</Text>
                        <Text as="dd" variant="bodyMd">{lot.lotType?.replace('_', ' ').toUpperCase() || "Not specified"}</Text>
                      </Box>
                    </BlockStack>
                  </Layout.Section>
                  
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Lot Price</Text>
                        <Text as="dd" variant="headingMd">${lot.totalCost.toFixed(2)}</Text>
                      </Box>
                      
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Lot Value</Text>
                        <Text as="dd" variant="headingMd">
                          {lot.lotValue ? `$${lot.lotValue.toFixed(2)}` : "Not set"}
                        </Text>
                        {lot.lotValue && (
                          <Text as="p" variant="bodySm" tone={lot.lotValue > lot.totalCost ? "success" : "critical"}>
                            {lot.lotValue > lot.totalCost ? "+" : ""}${(lot.lotValue - lot.totalCost).toFixed(2)} potential
                          </Text>
                        )}
                      </Box>
                      
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">Outstanding Debt</Text>
                        <Text as="dd" variant="headingMd" tone={lot.initialDebt > 0 ? "critical" : "success"}>
                          ${lot.initialDebt.toFixed(2)}
                        </Text>
                        {lot.initialDebt > 0 && (
                          <Button 
                            variant="primary" 
                            size="micro"
                            onClick={handlePayOffDebt}
                          >
                            Pay Off
                          </Button>
                        )}
                      </Box>
                    </BlockStack>
                  </Layout.Section>
                </Layout>

                {lot.notes && (
                  <>
                    <Divider />
                    <Box>
                      <Text as="dt" variant="bodyMd" tone="subdued">Notes</Text>
                      <Text as="dd" variant="bodyMd">{lot.notes}</Text>
                    </Box>
                  </>
                )}

                {/* External Links */}
                {(lot.googleSheetsLink || lot.collectorLink) && (
                  <>
                    <Divider />
                    <Box>
                      <Text as="dt" variant="bodyMd" tone="subdued">External Links</Text>
                      <BlockStack gap="100">
                        {lot.googleSheetsLink && (
                          <InlineStack gap="200">
                            <Text as="span" variant="bodySm">📊 Google Sheets:</Text>
                            <Button
                              variant="plain"
                              size="micro"
                              url={lot.googleSheetsLink}
                              external
                            >
                              Open Spreadsheet
                            </Button>
                          </InlineStack>
                        )}
                        {lot.collectorLink && (
                          <InlineStack gap="200">
                            <Text as="span" variant="bodySm">🔍 Collectr:</Text>
                            <Button
                              variant="plain"
                              size="micro"
                              url={lot.collectorLink}
                              external
                            >
                              View on Collectr
                            </Button>
                          </InlineStack>
                        )}
                      </BlockStack>
                    </Box>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">Shipping & Tracking</Text>
                
                <BlockStack gap="300">
                  <Box>
                    <Text as="dt" variant="bodyMd" tone="subdued">Shipping Status</Text>
                    <Badge 
                      tone={
                        lot.shippingStatus === 'delivered' ? 'success' :
                        lot.shippingStatus === 'shipped' || lot.shippingStatus === 'in_transit' ? 'attention' :
                        lot.shippingStatus === 'exception' ? 'critical' :
                        'info'
                      }
                    >
                      {lot.shippingStatus?.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </Box>

                  {lot.upsTrackingNumber && (
                    <>
                      <Box>
                        <Text as="dt" variant="bodyMd" tone="subdued">UPS Tracking</Text>
                        <Text as="dd" variant="bodyMd">{lot.upsTrackingNumber}</Text>
                        <Badge 
                          tone={
                            lot.trackingStatus === 'delivered' ? 'success' :
                            lot.trackingStatus === 'in_transit' ? 'attention' :
                            lot.trackingStatus === 'exception' ? 'critical' :
                            'info'
                          }
                        >
                          {lot.trackingStatus?.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </Box>
                      
                      <Button 
                        variant="secondary" 
                        onClick={handleRefreshTracking}
                        loading={refreshing}
                        fullWidth
                      >
                        {refreshing ? "Refreshing..." : "Refresh Tracking"}
                      </Button>
                    </>
                  )}

                  {lot.estimatedDeliveryDate && (
                    <Box>
                      <Text as="dt" variant="bodyMd" tone="subdued">Estimated Delivery</Text>
                      <Text as="dd" variant="bodyMd">{new Date(lot.estimatedDeliveryDate).toLocaleDateString()}</Text>
                    </Box>
                  )}

                  <Box>
                    <Text as="dt" variant="bodyMd" tone="subdued">Conversion Status</Text>
                    <Badge tone={lot.isConverted ? 'success' : 'warning'}>
                      {lot.isConverted ? 'Converted' : 'Pending Conversion'}
                    </Badge>
                    {lot.convertedAt && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Converted on {new Date(lot.convertedAt).toLocaleDateString()}
                      </Text>
                    )}
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Tracking Events */}
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Tracking History</Text>
            
            {trackingRows.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={trackingHeadings}
                rows={trackingRows}
              />
            ) : (
              <EmptyState
                heading="No tracking events yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {lot.upsTrackingNumber 
                    ? "Tracking events will appear here once UPS provides updates."
                    : "Add a UPS tracking number to see tracking events."
                  }
                </p>
              </EmptyState>
            )}
          </BlockStack>
        </Card>

        {/* Lot Products */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingMd">Lot Products</Text>
              <Button 
                variant="primary" 
                url={`/app/lots/products/${lot.id}`}
              >
                Manage Products
              </Button>
            </InlineStack>
            
            {productRows.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
                headings={productHeadings}
                rows={productRows}
              />
            ) : (
              <EmptyState
                heading="No products added yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                action={{
                  content: 'Add Products',
                  url: `/app/lots/products/${lot.id}`,
                }}
              >
                <p>Start adding individual products and variants that are included in this lot.</p>
              </EmptyState>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
} 