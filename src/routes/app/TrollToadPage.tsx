import {
  BlockStack,
  Box,
  Button,
  Card,
  ChoiceList,
  Divider,
  FormLayout,
  Layout,
  List,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";

type DuplicateProduct = {
  id: string;
  title: string;
  description: string;
  totalInventory: number;
  importLink: string | null;
  status: string;
};

type TrollImportResponse = {
  error: string | null;
  itemsReturn: number[] | null;
  duplicates: DuplicateProduct[] | null;
};

type TrollJobsPayload = {
  waitingJobs: Array<{
    shop: string;
    itemIn: {
      name: string;
      price: string;
    };
  }>;
  failedJobs: Array<{
    data: {
      shop: string;
      itemIn: {
        name: string;
      };
    };
    error: string | null;
  }>;
  env: {
    SUPABASE_URL: string | null;
    SUPABASE_ANON_KEY: string | null;
  };
};

type RawCondition =
  | "mint"
  | "near-mint"
  | "low-played"
  | "moderately-played"
  | "heavily-played"
  | "damaged";

type TrollFormState = {
  url: string;
  collection: boolean;
  quantity: number;
  price: number;
  type: "standard" | "raw";
  rawVariant: RawCondition;
  specificProduct: string | null;
};

const rawChoiceOptions: { label: string; value: RawCondition }[] = [
  { label: "Mint", value: "mint" },
  { label: "Near Mint", value: "near-mint" },
  { label: "Low Played", value: "low-played" },
  { label: "Moderately Played", value: "moderately-played" },
  { label: "Heavily Played", value: "heavily-played" },
  { label: "Damaged", value: "damaged" },
];

const conditionChoices = [
  { label: "Standard (ready for variants)", value: "standard" },
  { label: "Raw card", value: "raw" },
];

function DuplicateList({
  duplicates,
  lastLink,
  onResolve,
  isSubmitting,
}: {
  duplicates: DuplicateProduct[];
  lastLink: string | null;
  onResolve: (productId: string | null) => void;
  isSubmitting: boolean;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Duplicate products detected
        </Text>
        {lastLink && (
          <Text as="p" variant="bodyMd">
            Source URL: {lastLink}
          </Text>
        )}
        <List type="number">
          {duplicates.map((item, index) => (
            <List.Item key={item.id}>
              <BlockStack gap="150">
                <Text as="h3" variant="headingMd">
                  {item.title}
                </Text>
                <Text as="p" variant="bodyMd">
                  ID: {item.id}
                </Text>
                <Text as="p" variant="bodyMd">
                  {item.description}
                </Text>
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  onClick={() => onResolve(item.id)}
                >
                  Update existing product
                </Button>
              </BlockStack>
              {index < duplicates.length - 1 && <Divider />}
            </List.Item>
          ))}
        </List>
        <Button
          variant="secondary"
          tone="critical"
          loading={isSubmitting}
          onClick={() => onResolve(null)}
        >
          Create new product instead
        </Button>
      </BlockStack>
    </Card>
  );
}

export default function TrollToadPage() {
  const [formState, setFormState] = useState<TrollFormState>({
    url: "",
    collection: false,
    quantity: 1,
    price: 0.01,
    type: "standard",
    rawVariant: "mint",
    specificProduct: null,
  });
  const [duplicates, setDuplicates] = useState<DuplicateProduct[] | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsReturn, setItemsReturn] = useState<number[] | null>(null);
  const [jobsInfo, setJobsInfo] = useState<TrollJobsPayload | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch("/api/troll/jobs");
        if (!response.ok) {
          throw new Error(`Failed to load Troll & Toad queue (${response.status})`);
        }
        const payload = (await response.json()) as TrollJobsPayload;
        setJobsInfo(payload);
      } catch (err) {
        console.error(err);
      }
    };

    fetchJobs();
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof TrollFormState>(key: K, value: TrollFormState[K]) => {
      setFormState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const formIsValid = useMemo(() => {
    if (!formState.url.trim()) return false;
    if (Number.isNaN(formState.price) || formState.price <= 0) return false;
    if (Number.isNaN(formState.quantity) || formState.quantity <= 0) return false;
    return true;
  }, [formState]);

  const submitImport = useCallback(
    async (overrideProduct: string | null = null) => {
      setIsSubmitting(true);
      setError(null);
      setItemsReturn(null);

      try {
        const response = await fetch("/api/troll/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: formState.url,
            collection: formState.collection,
            quantity: formState.quantity,
            price: formState.price,
            type:
              formState.type === "standard" ? "standard" : formState.rawVariant,
            specific_product: overrideProduct ?? formState.specificProduct ?? undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`Import failed (${response.status})`);
        }

        const payload = (await response.json()) as TrollImportResponse;
        if (payload.error) {
          setError(payload.error);
        }
        if (payload.duplicates) {
          setDuplicates(payload.duplicates);
        } else {
          setDuplicates(null);
        }
        setItemsReturn(payload.itemsReturn);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [formState],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formIsValid || isSubmitting) return;
      setLastLink(formState.url);
      submitImport();
    },
    [formIsValid, formState.url, isSubmitting, submitImport],
  );

  const handleDuplicateResolve = useCallback(
    (productId: string | null) => {
      submitImport(productId);
    },
    [submitImport],
  );

  return (
    <Page title="Troll & Toad Import">
      <Layout>
        <Layout.Section>
          <Card>
            <form onSubmit={handleSubmit}>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Import from Troll & Toad
                </Text>
                <FormLayout>
                  <TextField
                    label="Product or collection URL"
                    value={formState.url}
                    onChange={(value) => handleFieldChange("url", value)}
                    autoComplete="off"
                    requiredIndicator
                  />
                  <ChoiceList
                    title="Import type"
                    choices={conditionChoices}
                    selected={[formState.type]}
                    onChange={(value) =>
                      handleFieldChange(
                        "type",
                        value[0] === "raw" ? "raw" : "standard",
                      )
                    }
                  />
                  {formState.type === "raw" && (
                    <Select
                      label="Raw card condition"
                      options={rawChoiceOptions}
                      value={formState.rawVariant}
                      onChange={(value) =>
                        handleFieldChange("rawVariant", value as RawCondition)
                      }
                    />
                  )}
                  <FormLayout.Group>
                    <TextField
                      label="Quantity"
                      type="number"
                      min={1}
                      value={formState.quantity.toString()}
                      onChange={(value) =>
                        handleFieldChange("quantity", Number(value) || 1)
                      }
                    />
                    <TextField
                      label="Price"
                      type="number"
                      min={0.01}
                      value={formState.price.toString()}
                      onChange={(value) =>
                        handleFieldChange("price", Number(value) || 0.01)
                      }
                      suffix="$"
                    />
                  </FormLayout.Group>
                  <ChoiceList
                    title="Collection import"
                    choices={[
                      { label: "Import a single product", value: "single" },
                      { label: "Import entire collection", value: "collection" },
                    ]}
                    selected={[formState.collection ? "collection" : "single"]}
                    onChange={(value) =>
                      handleFieldChange("collection", value[0] === "collection")
                    }
                  />
                </FormLayout>
                <Button
                  submit
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!formIsValid}
                >
                  Queue import
                </Button>
                {error && (
                  <Box paddingBlockStart="200">
                    <Text tone="critical">{error}</Text>
                  </Box>
                )}
                {itemsReturn && (
                  <Box paddingBlockStart="200">
                    <Text as="p" variant="bodyMd">
                      Jobs queued: {itemsReturn.length}
                    </Text>
                  </Box>
                )}
              </BlockStack>
            </form>
          </Card>
        </Layout.Section>

        <Layout.Section secondary>
          <BlockStack gap="400">
            {duplicates && (
              <DuplicateList
                duplicates={duplicates}
                lastLink={lastLink}
                onResolve={handleDuplicateResolve}
                isSubmitting={isSubmitting}
              />
            )}
            {jobsInfo && (
              <Card title="Queue status">
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Waiting jobs ({jobsInfo.waitingJobs.length})
                  </Text>
                  <List>
                    {jobsInfo.waitingJobs.map((job, index) => (
                      <List.Item key={`${job.shop}-${index}`}>
                        {job.itemIn?.name ?? "Unknown item"}
                      </List.Item>
                    ))}
                  </List>
                  <Text as="h3" variant="headingMd">
                    Failed jobs ({jobsInfo.failedJobs.length})
                  </Text>
                  <List>
                    {jobsInfo.failedJobs.map((job, index) => (
                      <List.Item key={`${job.data.shop}-${index}`}>
                        {job.data.itemIn?.name ?? "Unknown"}{" "}
                        {job.error ? `- ${job.error}` : ""}
                      </List.Item>
                    ))}
                  </List>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
