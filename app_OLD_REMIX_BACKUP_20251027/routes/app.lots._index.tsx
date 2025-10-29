import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useActionData, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  DataTable,
  Box,
  SkeletonBodyText,
  Banner,
  Select,
  ProgressBar,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { LotService } from "~/modules/lot.server";
import { getLotPerformanceMetrics } from "~/modules/prisma.queries.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const selectedYear = parseInt(url.searchParams.get("year") || new Date().getFullYear().toString());

  try {
    // Load lots, performance metrics, debt payments, and analytics in parallel
    const [lots, metrics, debtPayments, debtSummary, monthlyAnalytics, yearlyAnalytics] = await Promise.all([
      LotService.getAllLots(),
      getLotPerformanceMetrics(),
      LotService.getAllDebtPayments(),
      LotService.getDebtPaymentSummary(),
      LotService.getMonthlyAnalytics(selectedYear),
      LotService.getYearlyAnalyticsSummary(selectedYear),
    ]);

    return json({ 
      lots, 
      metrics,
      debtPayments,
      debtSummary,
      monthlyAnalytics,
      yearlyAnalytics,
      selectedYear,
      success: true,
    });
  } catch (error) {
    console.error("Error loading lots data:", error);
    return json({ 
      lots: [], 
      metrics: {
        totalLots: 0,
        convertedLots: 0,
        deliveredLots: 0,
        pendingLots: 0,
        conversionRate: 0,
        deliveryRate: 0,
        totalInvestment: 0,
        totalDebt: 0,
      },
      debtPayments: [],
      debtSummary: {
        totalPayments: 0,
        totalAmountPaid: 0,
        averagePayment: 0,
      },
      monthlyAnalytics: [],
      yearlyAnalytics: {
        year: selectedYear,
        totalLots: 0,
        totalInvestment: 0,
        totalEstimatedValue: 0,
        totalDebt: 0,
        averageLotPrice: 0,
        averageEstimatedValue: 0,
        deliveredLots: 0,
        convertedLots: 0,
        deliveryRate: 0,
        conversionRate: 0,
        profitPotential: 0,
      },
      selectedYear,
      success: false,
      error: "Failed to load lots data",
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate.admin(request);
  
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const lotId = formData.get("lotId") as string;
  
  try {
    if (intent === "pay-off-debt" && lotId) {
      await LotService.payOffDebt(lotId);
      return json({ 
        success: true,
        message: "Debt paid off successfully!",
        lotId 
      });
    }
    
    return json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Action error:", error);
    return json({ error: "Action failed" }, { status: 500 });
  }
}

export default function LotsIndex() {
  const { lots, metrics, debtPayments, debtSummary, monthlyAnalytics, yearlyAnalytics, selectedYear, success, error } = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  const submit = useSubmit();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Year options for the picker
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const year = currentYear - i;
    return { label: year.toString(), value: year.toString() };
  });

  const handleYearChange = (year: string) => {
    navigate(`/app/lots?year=${year}`);
  };

  // Find the max value for scaling the chart
  const maxMonthlyValue = Math.max(...monthlyAnalytics.map((m: any) => m.totalValue));
  const maxLotCount = Math.max(...monthlyAnalytics.map((m: any) => m.lotCount));

  const handlePayOffDebt = (lotId: string) => {
    if (window.confirm("Mark this lot's debt as fully paid?")) {
      const formData = new FormData();
      formData.append("intent", "pay-off-debt");
      formData.append("lotId", lotId);
      submit(formData, { method: "POST" });
    }
  };

  // Format lots data for DataTable
  const lotRows = lots.map((lot: any) => [
    // Purchase Date
    new Date(lot.purchaseDate).toLocaleDateString(),
    
    // Seller Name
    lot.vendor || "N/A",
    
    // Lot Price
    `$${lot.totalCost.toFixed(2)}`,
    
    // Lot Value
    lot.lotValue ? `$${lot.lotValue.toFixed(2)}` : "-",
    
    // Debt
    lot.initialDebt > 0 ? `$${lot.initialDebt.toFixed(2)}` : "-",
    
    // Shipping Status
    <Badge 
      key={`${lot.id}-shipping`}
      tone={
        lot.shippingStatus === 'delivered' ? 'success' :
        lot.shippingStatus === 'shipped' || lot.shippingStatus === 'in_transit' ? 'attention' :
        lot.shippingStatus === 'exception' ? 'critical' :
        'info'
      }
    >
      {lot.shippingStatus.replace('_', ' ').toUpperCase()}
    </Badge>,
    
    // UPS Tracking Status
    lot.upsTrackingNumber ? (
      <Badge 
        key={lot.id}
        tone={
          lot.trackingStatus === 'delivered' ? 'success' :
          lot.trackingStatus === 'in_transit' ? 'attention' :
          lot.trackingStatus === 'exception' ? 'critical' :
          'info'
        }
      >
        {lot.trackingStatus.replace('_', ' ').toUpperCase()}
      </Badge>
    ) : (
      <Text key={`${lot.id}-no-tracking`} as="span" tone="subdued">No tracking</Text>
    ),
    
    // Conversion Status
    <Badge 
      key={`${lot.id}-conversion`}
      tone={lot.isConverted ? 'success' : 'warning'}
    >
      {lot.isConverted ? 'Converted' : 'Pending'}
    </Badge>,
    
    // Products Count
    lot.lotProducts?.length || 0,
    
    // Actions
    <InlineStack key={`${lot.id}-actions`} gap="200">
      <Link to={`/app/lots/${lot.id}`}>
        <Button size="micro" variant="primary">View</Button>
      </Link>
      {lot.initialDebt > 0 && (
        <Button 
          size="micro" 
          variant="secondary" 
          onClick={() => handlePayOffDebt(lot.id)}
        >
          Pay Off
        </Button>
      )}
    </InlineStack>,
  ]);

  const lotTableHeadings = [
    'Purchase Date',
    'Seller Name',
    'Lot Price',
    'Lot Value',
    'Debt',
    'Shipping',
    'UPS Tracking',
    'Status',
    'Products',
    'Actions',
  ];

  // Format debt payments data for DataTable
  const debtPaymentRows = debtPayments.map((payment: any) => [
    // Payment Date
    new Date(payment.paymentDate).toLocaleDateString(),
    
    // Seller Name
    payment.lot?.vendor || "N/A",
    
    // Lot Purchase Date
    new Date(payment.lot?.purchaseDate).toLocaleDateString(),
    
    // Lot Price
    payment.lot?.totalCost ? `$${payment.lot.totalCost.toFixed(2)}` : "-",
    
    // Payment Amount
    `$${payment.paymentAmount.toFixed(2)}`,
    
    // Payment Method
    payment.paymentMethod || "N/A",
    
    // Notes
    payment.notes || "-",
    
    // View Lot Link
    <Link key={`payment-${payment.id}`} to={`/app/lots/${payment.lotId}`}>
      <Button size="micro" variant="primary">View Lot</Button>
    </Link>,
  ]);

  const debtPaymentTableHeadings = [
    'Payment Date',
    'Seller Name',
    'Lot Purchase Date',
    'Lot Price',
    'Payment Amount',
    'Payment Method',
    'Notes',
    'Actions',
  ];

  if (!success) {
    return (
      <Page title="Lot Tracking">
        <Layout>
          <Layout.Section>
            <Card>
              <Box padding="400">
                <Text as="p" variant="bodyMd" tone="critical">
                  {error || "Failed to load lot tracking data"}
                </Text>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page 
      title="Lot Tracking"
      primaryAction={{
        content: 'New Lot',
        url: '/app/lots/new',
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

        {/* Year Picker */}
        <Card>
          <InlineStack align="space-between">
            <Text as="h2" variant="headingLg">📊 Lot Analytics Dashboard</Text>
            <Select
              label=""
              options={yearOptions}
              value={selectedYear.toString()}
              onChange={handleYearChange}
            />
          </InlineStack>
        </Card>

        {/* Yearly Summary Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">💰 Total Investment</Text>
                <Text as="p" variant="heading2xl" tone="success">
                  ${yearlyAnalytics.totalInvestment.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {yearlyAnalytics.totalLots} lots purchased in {selectedYear}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">📈 Profit Potential</Text>
                <Text as="p" variant="heading2xl" tone={yearlyAnalytics.profitPotential >= 0 ? "success" : "critical"}>
                  ${yearlyAnalytics.profitPotential.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Estimated value vs cost
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">🚚 Delivery Rate</Text>
                <Text as="p" variant="heading2xl">{yearlyAnalytics.deliveryRate.toFixed(1)}%</Text>
                <ProgressBar 
                  progress={yearlyAnalytics.deliveryRate} 
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {yearlyAnalytics.deliveredLots} of {yearlyAnalytics.totalLots} lots delivered
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Monthly Analytics Chart */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingLg">Monthly Restock Analytics</Text>
              <InlineStack gap="400">
                <InlineStack gap="200">
                  <Badge tone="warning">Restock Value ($)</Badge>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge tone="info">Lot Count</Badge>
                </InlineStack>
              </InlineStack>
            </InlineStack>
            
            {/* Compact Bar Chart */}
            <Box padding="300">
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Month', 'Restock Value', 'Lot Count', 'Total Debt', 'Avg Lot Price']}
                rows={monthlyAnalytics.map((month: any) => [
                  month.month.slice(0, 3),
                  <InlineStack key={`value-${month.month}`} gap="200">
                    <Text as="span" variant="bodySm">${month.totalValue.toFixed(0)}</Text>
                    <Box minWidth="120px">
                      <ProgressBar 
                        progress={maxMonthlyValue > 0 ? (month.totalValue / maxMonthlyValue) * 100 : 0}
                        size="small"
                      />
                    </Box>
                  </InlineStack>,
                  <InlineStack key={`count-${month.month}`} gap="200">
                    <Text as="span" variant="bodySm">{month.lotCount}</Text>
                    <Box minWidth="80px">
                      <ProgressBar 
                        progress={maxLotCount > 0 ? (month.lotCount / maxLotCount) * 100 : 0}
                        size="small"
                      />
                    </Box>
                  </InlineStack>,
                  month.totalDebt > 0 ? `$${month.totalDebt.toFixed(0)}` : '$0',
                  month.averageLotPrice > 0 ? `$${month.averageLotPrice.toFixed(0)}` : '-',
                ])}
              />
            </Box>
          </BlockStack>
        </Card>

        <Divider />

        {/* Performance Metrics Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Total Lots</Text>
                <Text as="p" variant="heading2xl">{metrics.totalLots}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  All purchased lots
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Delivered</Text>
                <Text as="p" variant="heading2xl">{metrics.deliveredLots}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {metrics.deliveryRate.toFixed(1)}% delivery rate
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Converted</Text>
                <Text as="p" variant="heading2xl">{metrics.convertedLots}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {metrics.conversionRate.toFixed(1)}% conversion rate
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Financial Summary */}
        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Total Investment</Text>
                <Text as="p" variant="heading2xl" tone="success">
                  ${metrics.totalInvestment.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Total cost of all lots
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Outstanding Debt</Text>
                <Text as="p" variant="heading2xl" tone="critical">
                  ${metrics.totalDebt.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Amount still owed
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Quick Actions */}
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">Quick Actions</Text>
            <InlineStack gap="300">
              <Link to="/app/lots/new">
                <Button variant="primary">Add New Lot</Button>
              </Link>
              <Button 
                variant="secondary"
                onClick={() => {
                  // TODO: Implement tracking refresh for all lots
                  setLoading(true);
                  // This would call a bulk refresh endpoint
                  setTimeout(() => setLoading(false), 2000);
                }}
                loading={loading}
              >
                Refresh All Tracking
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Lots Data Table */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingMd">All Lots</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {lots.length} lot{lots.length !== 1 ? 's' : ''} total
              </Text>
            </InlineStack>
            
            {lots.length === 0 ? (
              <Box padding="400">
                <BlockStack gap="300" align="center">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No lots found. Create your first lot to get started.
                  </Text>
                  <Link to="/app/lots/new">
                    <Button variant="primary">Create First Lot</Button>
                  </Link>
                </BlockStack>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={[
                  'text',      // Purchase Date
                  'text',      // Seller Name
                  'numeric',   // Lot Price
                  'numeric',   // Lot Value
                  'numeric',   // Debt
                  'text',      // Shipping Status
                  'text',      // UPS Tracking Status
                  'text',      // Conversion Status
                  'numeric',   // Products Count
                  'text',      // Actions
                ]}
                headings={lotTableHeadings}
                rows={lotRows}
                pagination={{
                  hasNext: false,
                  hasPrevious: false,
                  onNext: () => {},
                  onPrevious: () => {},
                }}
              />
            )}
          </BlockStack>
        </Card>

        {/* Debt Payments Summary */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Total Payments</Text>
                <Text as="p" variant="heading2xl">{debtSummary.totalPayments}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Payment transactions
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Amount Paid</Text>
                <Text as="p" variant="heading2xl" tone="success">
                  ${debtSummary.totalAmountPaid.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Total debt payments
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">Average Payment</Text>
                <Text as="p" variant="heading2xl">
                  ${debtSummary.averagePayment.toFixed(2)}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Per transaction
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* All Debt Payments Table */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h3" variant="headingMd">All Debt Payments</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {debtPayments.length} payment{debtPayments.length !== 1 ? 's' : ''} total
              </Text>
            </InlineStack>
            
            {debtPayments.length === 0 ? (
              <Box padding="400">
                <BlockStack gap="300" align="center">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    No debt payments recorded yet. Payments will appear here when lots have debt that gets paid off.
                  </Text>
                </BlockStack>
              </Box>
            ) : (
              <DataTable
                columnContentTypes={[
                  'text',      // Payment Date
                  'text',      // Seller Name
                  'text',      // Lot Purchase Date
                  'numeric',   // Lot Price
                  'numeric',   // Payment Amount
                  'text',      // Payment Method
                  'text',      // Notes
                  'text',      // Actions
                ]}
                headings={debtPaymentTableHeadings}
                rows={debtPaymentRows}
                pagination={{
                  hasNext: false,
                  hasPrevious: false,
                  onNext: () => {},
                  onPrevious: () => {},
                }}
              />
            )}
          </BlockStack>
        </Card>

        {/* Additional Info Card */}
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">About Lot Tracking</Text>
            <Text as="p" variant="bodyMd">
              Track your Pokemon card lot purchases from initial purchase through delivery 
              and conversion to individual products. Monitor costs, shipping status, and 
              manage the conversion process to Shopify products.
            </Text>
            
            <InlineStack gap="200">
              <Badge tone="info">UPS Tracking Supported</Badge>
              <Badge tone="success">Canadian Shipping</Badge>
              <Badge tone="attention">Auto-Conversion Ready</Badge>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
} 