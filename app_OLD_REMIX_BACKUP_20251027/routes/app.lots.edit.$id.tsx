import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSubmit, useLoaderData } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { LotService } from "~/modules/lot.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  
  const lotId = params.id!;
  
  try {
    const lot = await LotService.getLotById(lotId);
    
    if (!lot) {
      throw new Response("Lot not found", { status: 404 });
    }
    
    return json({ lot });
  } catch (error) {
    console.error("Error loading lot for edit:", error);
    throw new Response("Error loading lot", { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  await authenticate.admin(request);
  
  const lotId = params.id!;
  const formData = await request.formData();
  
  // Extract form data
  const purchaseDate = formData.get("purchaseDate") as string;
  const totalCost = formData.get("totalCost") as string;
  const lotValue = formData.get("lotValue") as string;
  const initialDebt = formData.get("initialDebt") as string;
  const upsTrackingNumber = formData.get("upsTrackingNumber") as string;
  const shippingStatus = formData.get("shippingStatus") as string;
  const estimatedDeliveryDate = formData.get("estimatedDeliveryDate") as string;
  const vendor = formData.get("vendor") as string;
  const lotType = formData.get("lotType") as string;
  const notes = formData.get("notes") as string;
  const googleSheetsLink = formData.get("googleSheetsLink") as string;
  const collectorLink = formData.get("collectorLink") as string;

  // Validation
  const errors: Record<string, string> = {};
  
  if (!purchaseDate) {
    errors.purchaseDate = "Purchase date is required";
  }
  
  if (!totalCost || isNaN(Number(totalCost)) || Number(totalCost) <= 0) {
    errors.totalCost = "Valid lot price is required";
  }
  
  if (lotValue && isNaN(Number(lotValue))) {
    errors.lotValue = "Lot value must be a valid number";
  }
  
  if (initialDebt && isNaN(Number(initialDebt))) {
    errors.initialDebt = "Initial debt must be a valid number";
  }

  if (Object.keys(errors).length > 0) {
    return json({ 
      success: false, 
      errors,
      formData: Object.fromEntries(formData),
    });
  }

  try {
    // Update the lot
    const updatedLot = await LotService.updateLot(lotId, {
      totalCost: Number(totalCost),
      lotValue: lotValue ? Number(lotValue) : undefined,
      initialDebt: initialDebt ? Number(initialDebt) : 0,
      upsTrackingNumber: upsTrackingNumber || undefined,
      shippingStatus: shippingStatus || "pending_shipment",
      estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : undefined,
      vendor: vendor || undefined,
      lotType: lotType || undefined,
      notes: notes || undefined,
      googleSheetsLink: googleSheetsLink || undefined,
      collectorLink: collectorLink || undefined,
    });

    // Note: Purchase date is intentionally excluded from updates for data integrity

    // Redirect back to the lot detail page
    return redirect(`/app/lots/${lotId}?updated=true`);
    
  } catch (error) {
    console.error("Error updating lot:", error);
    return json({ 
      success: false, 
      error: "Failed to update lot. Please try again.",
      formData: Object.fromEntries(formData),
    });
  }
}

export default function EditLot() {
  const { lot } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isSubmitting = navigation.state === "submitting";
  
  // Helper function to format date for input
  const formatDateForInput = (dateString: string) => {
    return new Date(dateString).toISOString().split('T')[0];
  };
  
  // Form state - Pre-populated with existing lot data
  const [formData, setFormData] = useState({
    purchaseDate: formatDateForInput(lot.purchaseDate),
    totalCost: actionData?.formData?.totalCost || lot.totalCost.toString(),
    lotValue: actionData?.formData?.lotValue || (lot.lotValue?.toString() || ""),
    initialDebt: actionData?.formData?.initialDebt || lot.initialDebt.toString(),
    upsTrackingNumber: actionData?.formData?.upsTrackingNumber || (lot.upsTrackingNumber || ""),
    shippingStatus: actionData?.formData?.shippingStatus || lot.shippingStatus,
    estimatedDeliveryDate: actionData?.formData?.estimatedDeliveryDate || 
      (lot.estimatedDeliveryDate ? formatDateForInput(lot.estimatedDeliveryDate) : ""),
    vendor: actionData?.formData?.vendor || (lot.vendor || ""),
    lotType: actionData?.formData?.lotType || (lot.lotType || ""),
    notes: actionData?.formData?.notes || (lot.notes || ""),
    googleSheetsLink: actionData?.formData?.googleSheetsLink || (lot.googleSheetsLink || ""),
    collectorLink: actionData?.formData?.collectorLink || (lot.collectorLink || ""),
  });

  const handleSubmit = () => {
    const form = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      form.append(key, value);
    });
    submit(form, { method: "POST" });
  };

  const lotTypeOptions = [
    { label: "Select type...", value: "" },
    { label: "Booster Box", value: "booster_box" },
    { label: "Single Cards", value: "single_cards" },
    { label: "Sealed Product", value: "sealed_product" },
    { label: "Mixed Lot", value: "mixed_lot" },
    { label: "Graded Cards", value: "graded_cards" },
    { label: "Vintage Collection", value: "vintage_collection" },
  ];

  const shippingStatusOptions = [
    { label: "Pending Shipment", value: "pending_shipment" },
    { label: "Shipped", value: "shipped" },
    { label: "In Transit", value: "in_transit" },
    { label: "Out for Delivery", value: "out_for_delivery" },
    { label: "Delivered", value: "delivered" },
    { label: "Exception", value: "exception" },
  ];

  return (
    <Page 
      title={`Edit Lot #${lot.id.slice(-8)}`}
      backAction={{
        content: 'Back to Lot',
        url: `/app/lots/${lot.id}`,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {/* Error Banner */}
              {actionData?.error && (
                <Banner tone="critical">
                  <Text as="p">{actionData.error}</Text>
                </Banner>
              )}

              <Text as="h2" variant="headingMd">
                Edit Lot Information
              </Text>
              
              <Text as="p" variant="bodyMd" tone="subdued">
                Update the details of your Pokemon card lot. Note that the purchase date cannot 
                be changed to maintain data integrity.
              </Text>

              <FormLayout>
                {/* Purchase Date - Read-only to maintain data integrity */}
                <TextField
                  label="Purchase Date"
                  type="date"
                  value={formData.purchaseDate}
                  onChange={() => {}} // No-op - read only
                  disabled
                  helpText="Purchase date cannot be changed to maintain data integrity"
                  autoComplete="off"
                />

                {/* Financial Information */}
                <FormLayout.Group>
                  <TextField
                    label="Lot Price"
                    type="number"
                    prefix="$"
                    value={formData.totalCost}
                    onChange={(value) => setFormData(prev => ({ ...prev, totalCost: value }))}
                    error={actionData?.errors?.totalCost}
                    helpText="Amount paid for this lot"
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Lot Value (Optional)"
                    type="number"
                    prefix="$"
                    value={formData.lotValue}
                    onChange={(value) => setFormData(prev => ({ ...prev, lotValue: value }))}
                    error={actionData?.errors?.lotValue}
                    helpText="Estimated market value of this lot"
                    autoComplete="off"
                  />
                </FormLayout.Group>

                <TextField
                  label="Outstanding Debt"
                  type="number"
                  prefix="$"
                  value={formData.initialDebt}
                  onChange={(value) => setFormData(prev => ({ ...prev, initialDebt: value }))}
                  error={actionData?.errors?.initialDebt}
                  helpText="Amount still owed (use Pay Off Debt button to record payments)"
                  autoComplete="off"
                />

                {/* Shipping Information */}
                <FormLayout.Group>
                  <Select
                    label="Shipping Status"
                    options={shippingStatusOptions}
                    value={formData.shippingStatus}
                    onChange={(value) => setFormData(prev => ({ ...prev, shippingStatus: value }))}
                    helpText="Current status of the shipment"
                  />
                  
                  <TextField
                    label="UPS Tracking Number (Optional)"
                    value={formData.upsTrackingNumber}
                    onChange={(value) => setFormData(prev => ({ ...prev, upsTrackingNumber: value }))}
                    helpText="Enter for automatic tracking updates"
                    autoComplete="off"
                  />
                </FormLayout.Group>

                {/* ETA Date - Show when tracking number is entered */}
                {formData.upsTrackingNumber && (
                  <TextField
                    label="Estimated Delivery Date (Optional)"
                    type="date"
                    value={formData.estimatedDeliveryDate}
                    onChange={(value) => setFormData(prev => ({ ...prev, estimatedDeliveryDate: value }))}
                    helpText="Expected delivery date from UPS"
                    autoComplete="off"
                  />
                )}

                {/* Lot Details */}
                <FormLayout.Group>
                  <TextField
                    label="Seller Name (Optional)"
                    value={formData.vendor}
                    onChange={(value) => setFormData(prev => ({ ...prev, vendor: value }))}
                    helpText="Who did you purchase this from?"
                    autoComplete="off"
                  />
                  
                  <Select
                    label="Lot Type"
                    options={lotTypeOptions}
                    value={formData.lotType}
                    onChange={(value) => setFormData(prev => ({ ...prev, lotType: value }))}
                    helpText="What type of Pokemon cards?"
                  />
                </FormLayout.Group>

                {/* Notes */}
                <TextField
                  label="Notes (Optional)"
                  multiline={4}
                  value={formData.notes}
                  onChange={(value) => setFormData(prev => ({ ...prev, notes: value }))}
                  helpText="Any additional details about this lot"
                  autoComplete="off"
                />

                {/* External Links */}
                <FormLayout.Group>
                  <TextField
                    label="Google Sheets Link (Optional)"
                    type="url"
                    value={formData.googleSheetsLink}
                    onChange={(value) => setFormData(prev => ({ ...prev, googleSheetsLink: value }))}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    helpText="Link to Google Sheets for lot tracking"
                    autoComplete="off"
                  />
                  
                  <TextField
                    label="Collector Link (Optional)"
                    type="url"
                    value={formData.collectorLink}
                    onChange={(value) => setFormData(prev => ({ ...prev, collectorLink: value }))}
                    placeholder="https://collectr.com/..."
                    helpText="Link to Collectr database or pricing site"
                    autoComplete="off"
                  />
                </FormLayout.Group>
              </FormLayout>

              {/* Action Buttons */}
              <InlineStack align="end" gap="300">
                <Button
                  url={`/app/lots/${lot.id}`}
                  variant="secondary"
                >
                  Cancel
                </Button>
                
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Updating Lot..." : "Update Lot"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Helper Information */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">✏️ Editing Tips</Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>Data Integrity:</strong> Purchase date is locked to maintain 
                  accurate historical records.
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Debt Management:</strong> Use the "Pay Off Debt" button on the 
                  detail page to record payments rather than manually changing the debt amount.
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Tracking Updates:</strong> If you add or change the UPS tracking 
                  number, automatic updates will begin with the next tracking refresh.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">📊 Current Stats</Text>
              
              <BlockStack gap="200">
                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Original Purchase</Text>
                  <Text as="dd" variant="bodyMd">{new Date(lot.purchaseDate).toLocaleDateString()}</Text>
                </Box>

                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Last Updated</Text>
                  <Text as="dd" variant="bodyMd">{new Date(lot.updatedAt).toLocaleDateString()}</Text>
                </Box>

                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Products</Text>
                  <Text as="dd" variant="bodyMd">{lot.lotProducts?.length || 0} added</Text>
                </Box>

                <Box>
                  <Text as="dt" variant="bodyMd" tone="subdued">Debt Payments</Text>
                  <Text as="dd" variant="bodyMd">{lot.debtPayments?.length || 0} recorded</Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 