import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { queueParsePSA, getAvailablePSAKey, getAllPSAKeyUsage } from "../modules/psa.server";
import {
  Box,
  Card,
  Layout,
  Button,
  FormLayout,
  Page,
  TextField,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";

// --- Remix Action Endpoint for Batch PSA Import ---
export const action = async ({ request }: ActionFunctionArgs) => {
  // Authenticate admin session
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  // Accept certs and prices as comma/line-separated strings
  const certsRaw = formData.get("certs")?.toString() || "";
  const pricesRaw = formData.get("prices")?.toString() || "";

  // Parse certs and prices
  const certs = certsRaw
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean);
  const prices = pricesRaw
    .split(/[,\n]/)
    .map((p) => parseFloat(p.trim()))
    .filter((p) => !isNaN(p));

  // Validate: must have same number of certs and prices
  if (certs.length !== prices.length) {
    return json({
      error: "Certs and prices count do not match.",
      jobsQueued: 0,
      jobs: [],
      apiUsage: null,
    });
  }

  // Validate: all prices > 0
  const validPairs = certs
    .map((cert, i) => ({ certNo: cert, price: prices[i] }))
    .filter((pair) => pair.price > 0 && pair.certNo);

  if (validPairs.length === 0) {
    return json({
      error: "No valid cert/price pairs (prices must be > 0).",
      jobsQueued: 0,
      jobs: [],
      apiUsage: null,
    });
  }

  // Queue jobs - create all jobs without duplicate checking
  const jobs = [];
  
  for (const pair of validPairs) {
    // Use the shop domain that has an active session - zardopokemon.myshopify.com
    const correctShop = "zardopokemon.myshopify.com";
    const job = queueParsePSA.createJob({
      shop: correctShop,
      certNo: pair.certNo,
      price: pair.price,
    });
    job.retries(3).backoff("exponential", 2000);
    jobs.push(job);
  }
  
  await queueParsePSA.saveAll(jobs);

  // Get current API usage (calls left)
  const keyInfo = await getAvailablePSAKey();
  let apiUsage = null;
  if (keyInfo) {
    apiUsage = { key: keyInfo.key };
  }

  return json({
    error: null,
    jobsQueued: jobs.length,
    jobs: validPairs,
    apiUsage,
  });
};

// --- Loader to fetch current PSA API usage ---
import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader({ request }: LoaderFunctionArgs) {
  // Get current available PSA API key and all key usage
  const keyInfo = await getAvailablePSAKey();
  const allKeys = await getAllPSAKeyUsage();
  return {
    apiUsage: keyInfo ? { key: keyInfo.key } : null,
    allKeys,
  };
}

// --- Batch PSA Import Form Component ---
function BatchPSAImportForm() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  // State: array of { cert: string, price: string }
  const [rows, setRows] = useState([{ cert: "", price: "" }]);
  // Initialize apiUsage from loader
  const [apiUsage, setApiUsage] = useState<any>(loaderData.apiUsage);
  // Track all key usage for progress display
  const [allKeys, setAllKeys] = useState(loaderData.allKeys);

  // Update API usage and allKeys after submit
  useEffect(() => {
    if (fetcher.data?.apiUsage) {
      setApiUsage(fetcher.data.apiUsage);
    }
    // Optionally, you could re-fetch allKeys after submit for real-time update
  }, [fetcher.data?.apiUsage]);

  // Add a new row
  const handleAddRow = useCallback(() => {
    setRows((old) => [...old, { cert: "", price: "" }]);
  }, []);

  // Remove a row
  const handleRemoveRow = useCallback((idx: number) => {
    setRows((old) => old.length === 1 ? old : old.filter((_, i) => i !== idx));
  }, []);

  // Handle cert/price change
  const handleCertChange = useCallback((idx: number, value: string) => {
    setRows((old) => old.map((row, i) => i === idx ? { ...row, cert: value } : row));
  }, []);
  const handlePriceChange = useCallback((idx: number, value: string) => {
    setRows((old) => old.map((row, i) => i === idx ? { ...row, price: value } : row));
  }, []);

  // Only allow submit if all certs are filled and all prices > 0
  const canSubmit = rows.length > 0 && rows.every((row) => row.cert.trim() && parseFloat(row.price) > 0);

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.set("certs", rows.map((row) => row.cert.trim()).join(","));
      formData.set("prices", rows.map((row) => row.price.trim()).join(","));
      fetcher.submit(formData, { method: "POST" });
    },
    [rows, fetcher]
  );

  return (
    <fetcher.Form method="POST" onSubmit={handleSubmit}>
      <FormLayout>
        {/* Dynamic cert/price rows */}
        {rows.map((row, i) => (
          <BlockStack key={i} gap="100">
            <FormLayout.Group>
              <TextField
                label="PSA Cert Number"
                value={row.cert}
                onChange={(val) => handleCertChange(i, val)}
                autoComplete="off"
              />
              <TextField
                label="Price"
                value={row.price}
                onChange={(val) => handlePriceChange(i, val)}
                type="number"
                min={0.01}
                step={0.01}
                autoComplete="off"
              />
              {rows.length > 1 && (
                <Button onClick={() => handleRemoveRow(i)} tone="critical" accessibilityLabel="Remove row">
                  Remove
                </Button>
              )}
            </FormLayout.Group>
          </BlockStack>
        ))}
        <Button onClick={handleAddRow} tone="success" accessibilityLabel="Add another row">
          Add another
        </Button>
        <Button submit loading={fetcher.state === "submitting"} disabled={!canSubmit}>
          Submit
        </Button>
        {/* Display progress for each API key */}
        <Box padding="200">
          <Text variant="bodyMd" as="span">API Key Usage Progress:</Text>
          <BlockStack gap="100">
            {allKeys.map((k: any) => (
              <Box key={k.key} padding="100">
                <Text as="span" variant="bodySm">
                  {k.key}: {k.callsLeftForToday} / 100 calls left
                </Text>
                {/* Progress bar container */}
                <Box background="bg-fill-tertiary" borderRadius="100" paddingBlockStart="100" paddingBlockEnd="100" width="100%">
                  {/* Progress bar fill - calculated percentage based on calls remaining */}
                  <Box
                    background={k.callsLeftForToday > 20 ? "bg-fill-success" : "bg-fill-critical"}
                    borderRadius="100"
                    minHeight="100"
                    width={`${(k.callsLeftForToday / 100) * 100}%`}
                  />
                </Box>
              </Box>
            ))}
          </BlockStack>
        </Box>
        {apiUsage && (
          <Box padding="200">
            <Text variant="bodyMd" as="span">API Key in use: {apiUsage.key}</Text>
          </Box>
        )}
        {fetcher.data?.error && (
          <Box padding="200" background="bg-surface-critical">
            <Text tone="critical" as="span">{fetcher.data.error}</Text>
          </Box>
        )}
        {fetcher.data && fetcher.data.jobsQueued && fetcher.data.jobsQueued > 0 && (
          <Box padding="200" background="bg-surface-success">
            <Text tone="success" as="span">Queued {fetcher.data.jobsQueued} jobs!</Text>
          </Box>
        )}
      </FormLayout>
    </fetcher.Form>
  );
}

// --- Default Page Export ---
export default function NewPSAPage() {
  return (
    <Page title="PSA Import">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BatchPSAImportForm />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}