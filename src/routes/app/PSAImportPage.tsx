import {
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
  TextField,
  Banner,
  Divider,
  ResourceList,
  Thumbnail,
  EmptyState,
  Spinner,
  ProgressBar,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UploadIcon } from "@shopify/polaris-icons";

type Row = {
  cert: string;
  price: string;
};

type ApiUsage = { key: string } | null;
type PsaJobResult = {
  certNo: string;
  price: number;
}[];

type PsaResponse = {
  error: string | null;
  jobsQueued: number;
  jobs: PsaJobResult;
  apiUsage: ApiUsage;
};

type PsaUsagePayload = {
  apiUsage: ApiUsage;
  allKeys: Array<{ key: string; callsLeftForToday: number }>;
};

function formatKeyLabel(key: { key: string; callsLeftForToday: number }) {
  return `${key.key} (${key.callsLeftForToday} calls left)`;
}

export default function PSAImportPage() {
  const [rows, setRows] = useState<Row[]>([{ cert: "", price: "" }]);
  const [apiUsage, setApiUsage] = useState<ApiUsage>(null);
  const [allKeys, setAllKeys] = useState<
    Array<{ key: string; callsLeftForToday: number }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PsaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isPasting, setIsPasting] = useState(false);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const response = await fetch("/api/psa/usage");
        if (!response.ok) {
          throw new Error(`Failed to load PSA usage (${response.status})`);
        }
        const payload = (await response.json()) as PsaUsagePayload;
        setApiUsage(payload.apiUsage);
        setAllKeys(payload.allKeys);
      } catch (err) {
        console.error(err);
      }
    };

    fetchUsage();
  }, []);

  const canSubmit = useMemo(
    () =>
      rows.length > 0 &&
      rows.every(
        (row) => row.cert.trim() && Number.parseFloat(row.price) > 0,
      ),
    [rows],
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { cert: "", price: "" }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }, []);

  const updateCert = useCallback((index: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, cert: value } : row)),
    );
  }, []);

  const updatePrice = useCallback((index: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, price: value } : row)),
    );
  }, []);

  // File upload and paste handling
  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parseFileContent(content);
    };
    reader.readAsText(file);
  }, []);

  const parseFileContent = useCallback((content: string) => {
    const lines = content.split("\n").filter(line => line.trim());
    const parsedRows: Row[] = [];
    
    for (const line of lines) {
      // Support CSV format: cert,price or cert\ttime (tab separated)
      const parts = line.split(/[,\t]/).map(p => p.trim());
      if (parts.length >= 2) {
        parsedRows.push({ cert: parts[0], price: parts[1] });
      } else if (parts.length === 1) {
        // Just cert number, allow user to set price
        parsedRows.push({ cert: parts[0], price: "" });
      }
    }
    
    if (parsedRows.length > 0) {
      setRows(parsedRows);
    }
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    setIsPasting(true);
    parseFileContent(pastedText);
    setTimeout(() => setIsPasting(false), 1000);
  }, [parseFileContent]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);
      setResult(null);

      try {
        const response = await fetch("/api/psa/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            certs: rows.map((row) => row.cert.trim()),
            prices: rows.map((row) => row.price.trim()),
          }),
        });

        if (!response.ok) {
          throw new Error(`Import failed (${response.status})`);
        }

        const payload = (await response.json()) as PsaResponse;
        if (payload.error) {
          setError(payload.error);
        }
        setResult(payload);
        setApiUsage(payload.apiUsage);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [canSubmit, isSubmitting, rows],
  );

  return (
    <Page title="PSA Batch Import">
      <Layout>
        <Layout.Section>
          <Card>
            {apiUsage && (
              <Box paddingBlockEnd="400">
                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    Using API key: <strong>{apiUsage.key}</strong>
                  </Text>
                </Banner>
              </Box>
            )}
            
            {isPasting && (
              <Box paddingBlockEnd="400">
                <Banner tone="success">
                  <Text as="p" variant="bodyMd">Content pasted successfully!</Text>
                </Banner>
              </Box>
            )}
            
            <form onSubmit={handleSubmit}>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Batch PSA Cert Import
                </Text>
                <Text as="p" variant="bodyMd">
                  Queue PSA certification numbers for automated product creation. You can paste CSV/TSV data or type manually.
                </Text>

                {/* File Upload Section */}
                <Box padding="400" borderColor="border" borderRadius="200" borderWidth="025">
                  <BlockStack gap="300">
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      Quick Import Options:
                    </Text>
                    <InlineStack gap="300" align="space-between">
                      <label>
                        <input
                          type="file"
                          accept=".csv,.txt"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file);
                          }}
                        />
                        <Button onClick={() => document.querySelector('input[type="file"]')?.click()} icon={UploadIcon}>
                          Upload CSV/Text File
                        </Button>
                      </label>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Or paste data below (cert,price format)
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>

                <Divider />

                <Text as="p" variant="bodyMd" fontWeight="bold">
                  Import Data ({rows.length} items)
                </Text>

                <div onPaste={handlePaste}>
                {rows.slice(0, 50).map((row, index) => (
                  <FormLayout key={`psa-row-${index}`}>
                    <FormLayout.Group>
                      <TextField
                        label={`Certification #${index + 1}`}
                        value={row.cert}
                        onChange={(value) => updateCert(index, value)}
                        autoComplete="off"
                        requiredIndicator
                      />
                      <TextField
                        label="Price"
                        type="number"
                        value={row.price}
                        onChange={(value) => updatePrice(index, value)}
                        suffix="$"
                        autoComplete="off"
                        requiredIndicator
                      />
                    </FormLayout.Group>
                    <Button
                      variant="tertiary"
                      tone="critical"
                      onClick={() => removeRow(index)}
                      disabled={rows.length === 1}
                    >
                      Remove row
                    </Button>
                  </FormLayout>
                ))}
                </div>

                {rows.length > 50 && (
                  <Banner tone="warning">
                    <Text as="p" variant="bodyMd">
                      Showing first 50 of {rows.length} items. All items will be processed when you submit.
                    </Text>
                  </Banner>
                )}

                <InlineStack gap="200">
                  <Button onClick={addRow} variant="secondary">
                    Add another cert
                  </Button>
                  <Button
                    submit
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!canSubmit}
                  >
                    Queue jobs
                  </Button>
                </InlineStack>

                {error && (
                  <Box paddingBlockStart="200">
                    <Text as="p" tone="critical">
                      {error}
                    </Text>
                  </Box>
                )}

                {result && (
                  <Box paddingBlockStart="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">
                        Jobs queued: {result.jobsQueued}
                      </Text>
                      {result.jobsQueued > 0 && (
                        <List type="number">
                          {result.jobs.map((job) => (
                            <List.Item key={job.certNo}>
                              <Text as="span" variant="bodyMd">
                                Cert {job.certNo} @ ${job.price.toFixed(2)}
                              </Text>
                            </List.Item>
                          ))}
                        </List>
                      )}
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </form>
          </Card>
        </Layout.Section>

        <Layout.Section secondary>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                PSA API Usage
              </Text>
              {apiUsage ? (
                <Text as="p" variant="bodyMd">
                  Active key: <strong>{apiUsage.key}</strong>
                </Text>
              ) : (
                <Text as="p" variant="bodyMd" tone="subdued">
                  No PSA keys currently available.
                </Text>
              )}

              {allKeys.length > 0 && (
                <Box>
                  <Text as="p" variant="bodyMd">
                    Keys:
                  </Text>
                  <List>
                    {allKeys.map((key) => (
                      <List.Item key={key.key}>
                        {formatKeyLabel(key)}
                      </List.Item>
                    ))}
                  </List>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
