import { useMemo } from "react";
import { useLoaderData } from "react-router-dom";
import { Page, Layout, Card, Text, Button, BlockStack, InlineStack, DataTable, Spinner } from "@shopify/polaris";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

interface StoreValuePoint {
  id: number;
  value: number;
  date: string;
  createdAt: string;
}

interface StoreValueResponse {
  count: number;
  values: StoreValuePoint[];
}

export async function dashboardLoader() {
  const response = await fetch("/api/analytics/store-value", {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Response("Failed to load analytics", { status: response.status });
  }

  return (await response.json()) as StoreValueResponse;
}

export function DashboardPage() {
  const data = useLoaderData() as StoreValueResponse;

  const latestValue = data.values[0]?.value ?? 0;
  
  console.log("🎨 Rendering DashboardPage component");
  console.log("📊 Dashboard data:", { 
    valuesCount: data.values.length, 
    latestValue,
    hasChart: data.values.length > 0 
  });
  
  const formattedRows = useMemo(() => {
    return data.values.map((point) => [
      new Date(point.createdAt).toLocaleString(),
      `$${point.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
    ]);
  }, [data.values]);

  // Chart configuration
  const chartOptions = useMemo<ApexOptions>(() => {
    const reversedValues = [...data.values].reverse(); // Show oldest to newest
    
    return {
      chart: {
        type: "line",
        height: 350,
        toolbar: { show: true },
        zoom: { enabled: true },
      },
      dataLabels: { enabled: false },
      stroke: {
        curve: "smooth",
        width: 2,
      },
      xaxis: {
        categories: reversedValues.map((point) => 
          new Date(point.createdAt).toLocaleDateString()
        ),
      },
      yaxis: {
        labels: {
          formatter: (value) => `$${value.toLocaleString(undefined, { 
            maximumFractionDigits: 0 
          })}`,
        },
      },
      tooltip: {
        y: {
          formatter: (value) => `$${value.toLocaleString(undefined, { 
            maximumFractionDigits: 2 
          })}`,
        },
      },
      colors: ["#008060"],
      grid: {
        borderColor: "#e1e3e5",
        strokeDashArray: 4,
      },
    };
  }, [data.values]);

  const chartSeries = useMemo(() => [
    {
      name: "Store Value",
      data: [...data.values].reverse().map((point) => point.value),
    },
  ], [data.values]);

  console.log("📈 Chart options:", chartOptions);
  console.log("📊 Chart series:", chartSeries);

  return (
    <Page title="Automation Overview" subtitle="Monitor inventory health and trigger automation workflows.">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Quick Actions
              </Text>
              <InlineStack gap="300">
                <Button variant="primary" url="/api/automation/manual-draft">
                  Run Draft Automation Test
                </Button>
                <Button url="/api/test-webhook-status">Check Webhook Status</Button>
                <Button url="/api/auth-health">Validate Session</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Store Inventory Value Trend
              </Text>
              <Text variant="bodyMd">
                {latestValue > 0
                  ? `Latest recorded total: $${latestValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : "No analytics recorded yet."}
              </Text>
              <InlineStack gap="300" align="space-between">
                <Text as="p" variant="bodyMd" tone="subdued">
                  {data.values.length} data points tracked over time
                </Text>
                <Button
                  variant="primary"
                  loading={false}
                  onClick={async () => {
                    try {
                      alert("Starting bulk inventory calculation. This may take a few minutes...");
                      const response = await fetch("/api/inventory/calculate-and-save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                      });
                      const data = await response.json();
                      if (response.ok) {
                        alert(`Inventory calculated successfully!\nTotal Value: $${data.totalValue?.toLocaleString() || "N/A"}`);
                        window.location.reload();
                      } else {
                        alert(`Failed to calculate inventory: ${data.error || "Unknown error"}`);
                      }
                    } catch (error) {
                      console.error("Error calculating inventory:", error);
                      alert("Error calculating inventory");
                    }
                  }}
                >
                  Calculate & Save Inventory Value
                </Button>
              </InlineStack>
              <div style={{ marginTop: "16px" }}>
                <Chart
                  options={chartOptions}
                  series={chartSeries}
                  type="line"
                  height={350}
                />
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Snapshots
              </Text>
              <DataTable
                columnContentTypes={["text", "text"]}
                headings={["Captured", "Store Value"]}
                rows={formattedRows}
                footerContent={`Showing ${formattedRows.length} data points`}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
