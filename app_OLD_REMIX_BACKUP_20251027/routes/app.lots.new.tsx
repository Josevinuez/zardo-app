import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSubmit } from "@remix-run/react";
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

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate.admin(request);
  
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
    // Create the lot
    const lot = await LotService.createLot({
      purchaseDate: new Date(purchaseDate),
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

    // Redirect to the created lot's detail page
    return redirect(`/app/lots/${lot.id}?created=true`);
    
  } catch (error) {
    console.error("Error creating lot:", error);
    return json({ 
      success: false, 
      error: "Failed to create lot. Please try again.",
      formData: Object.fromEntries(formData),
    });
  }
}

export default function NewLot() {
  const actionData = useActionData<typeof action>() as any;
  const navigation = useNavigation();
  const submit = useSubmit();
  
  const isSubmitting = navigation.state === "submitting";
  
  // Form state
  const [formData, setFormData] = useState({
    purchaseDate: actionData?.formData?.purchaseDate || "",
    totalCost: actionData?.formData?.totalCost || "",
    lotValue: actionData?.formData?.lotValue || "",
    initialDebt: actionData?.formData?.initialDebt || "",
    upsTrackingNumber: actionData?.formData?.upsTrackingNumber || "",
    shippingStatus: actionData?.formData?.shippingStatus || "pending_shipment",
    estimatedDeliveryDate: actionData?.formData?.estimatedDeliveryDate || "",
    vendor: actionData?.formData?.vendor || "",
    lotType: actionData?.formData?.lotType || "",
    notes: actionData?.formData?.notes || "",
    googleSheetsLink: actionData?.formData?.googleSheetsLink || "",
    collectorLink: actionData?.formData?.collectorLink || "",
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
      title="Create New Lot"
      backAction={{
        content: 'Lots',
        url: '/app/lots',
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
                Lot Information
              </Text>
              
              <Text as="p" variant="bodyMd" tone="subdued">
                Enter the details of your new Pokemon card lot purchase. This will help you 
                track costs, shipping, and eventual conversion to individual products.
              </Text>

              <FormLayout>
                {/* Purchase Date */}
                <TextField
                  label="Purchase Date"
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(value) => setFormData(prev => ({ ...prev, purchaseDate: value }))}
                  error={actionData?.errors?.purchaseDate}
                  helpText="When did you purchase this lot?"
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
                  label="Initial Debt (Optional)"
                  type="number"
                  prefix="$"
                  value={formData.initialDebt}
                  onChange={(value) => setFormData(prev => ({ ...prev, initialDebt: value }))}
                  error={actionData?.errors?.initialDebt}
                  helpText="Amount still owed if partially paid"
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
                    helpText="Link to Collectr portfolio or similar"
                    autoComplete="off"
                  />
                </FormLayout.Group>
              </FormLayout>

              {/* Action Buttons */}
              <InlineStack align="end" gap="300">
                <Button
                  url="/app/lots"
                  variant="secondary"
                >
                  Cancel
                </Button>
                
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Creating Lot..." : "Create Lot"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Helper Information */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">💡 Tips</Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>UPS Tracking:</strong> If you provide a UPS tracking number, 
                  we'll automatically update the shipping status daily.
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Lot Types:</strong> Choose the category that best describes 
                  your purchase to help with organization and reporting.
                </Text>
                
                <Text as="p" variant="bodyMd">
                  <strong>Debt Tracking:</strong> Use the initial debt field if you've 
                  made a partial payment and still owe money.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">📋 Next Steps</Text>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  After creating this lot, you can:
                </Text>
                
                <ul style={{ paddingLeft: '20px' }}>
                  <li>Add individual products and variants</li>
                  <li>Track shipping progress</li>
                  <li>Convert to Shopify products when ready</li>
                  <li>Monitor profitability</li>
                </ul>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 