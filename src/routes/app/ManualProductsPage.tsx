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
} from "@shopify/polaris";
import { useCallback, useState } from "react";

export default function ManualProductsPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<File[]>([]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    if (!title || !price || !quantity) {
      setError("Title, price, and quantity are required");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      // Convert images to base64
      const imageDataUrls: string[] = [];
      for (const file of images) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        imageDataUrls.push(base64);
      }

      const response = await fetch("/api/products/create-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          price: parseFloat(price),
          quantity: parseInt(quantity, 10),
          tags: tags.split(",").map(t => t.trim()).filter(Boolean),
          images: imageDataUrls,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to create product");
      }

      setResult(data);
      
      // Clear form
      setTitle("");
      setDescription("");
      setPrice("");
      setQuantity("");
      setTags("");
      setImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [title, description, price, quantity, tags, images]);

  const handleImageChange = useCallback((files: FileList | null) => {
    if (files) {
      setImages(Array.from(files));
    }
  }, []);

  return (
    <Page title="Manual Product Creation">
      <Layout>
        <Layout.Section>
          <Card>
            <form onSubmit={handleSubmit}>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Create Product Manually
                </Text>
                <Text as="p" variant="bodyMd">
                  Create a Shopify product without PSA or Troll & Toad integration.
                </Text>

                <FormLayout>
                  <TextField
                    label="Product Title"
                    value={title}
                    onChange={setTitle}
                    autoComplete="off"
                    requiredIndicator
                    helpText="The name of your product"
                  />
                  <TextField
                    label="Description"
                    value={description}
                    onChange={setDescription}
                    multiline={4}
                    autoComplete="off"
                    helpText="Product description (supports HTML)"
                  />
                  <Box padding="300" borderColor="border" borderRadius="200" borderWidth="025">
                    <BlockStack gap="300">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Product Images
                      </Text>
                      
                      <InlineStack gap="200" align="start">
                        <label>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => handleImageChange(e.target.files)}
                            style={{ display: 'none' }}
                          />
                          <Button onClick={() => document.querySelector('input[type="file"]')?.click()}>
                            Upload Images
                          </Button>
                        </label>
                        {images.length > 0 && (
                          <Button variant="secondary" onClick={() => setImages([])}>
                            Clear All
                          </Button>
                        )}
                      </InlineStack>
                      
                      {images.length > 0 && (
                        <Box padding="200">
                          <InlineStack gap="200" wrap>
                            {images.map((file, index) => (
                              <Box
                                key={index}
                                position="relative"
                                borderColor="border"
                                borderRadius="200"
                                borderWidth="025"
                                padding="100"
                                style={{ width: "120px", height: "120px" }}
                              >
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={`Preview ${index + 1}`}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "8px",
                                  }}
                                />
                                <button
                                  onClick={() => setImages(images.filter((_, i) => i !== index))}
                                  style={{
                                    position: "absolute",
                                    top: "-8px",
                                    right: "-8px",
                                    background: "#c53030",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "50%",
                                    width: "24px",
                                    height: "24px",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                  }}
                                >
                                  ×
                                </button>
                              </Box>
                            ))}
                          </InlineStack>
                        </Box>
                      )}
                    </BlockStack>
                  </Box>
                  <FormLayout.Group>
                    <TextField
                      label="Price"
                      type="number"
                      value={price}
                      onChange={setPrice}
                      prefix="$"
                      autoComplete="off"
                      requiredIndicator
                      helpText="Product price"
                    />
                    <TextField
                      label="Quantity"
                      type="number"
                      value={quantity}
                      onChange={setQuantity}
                      autoComplete="off"
                      requiredIndicator
                      helpText="Starting inventory quantity"
                    />
                  </FormLayout.Group>
                  <TextField
                    label="Tags"
                    value={tags}
                    onChange={setTags}
                    autoComplete="off"
                    placeholder="vintage, rare, sports"
                    helpText="Comma-separated tags"
                  />
                </FormLayout>

                <Button
                  submit
                  variant="primary"
                  loading={isSubmitting}
                  disabled={!title || !price || !quantity}
                >
                  Create Product
                </Button>

                {error && (
                  <Banner tone="critical">
                    <Text as="p" variant="bodyMd">
                      {error}
                    </Text>
                  </Banner>
                )}

                {result && result.success && (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="bold">
                        Product created successfully!
                      </Text>
                      {result.productUrl && (
                        <Button url={result.productUrl} external>
                          View Product
                        </Button>
                      )}
                    </BlockStack>
                  </Banner>
                )}
              </BlockStack>
            </form>
          </Card>
        </Layout.Section>

        <Layout.Section secondary>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">
                Manual Product Tips
              </Text>
              <List>
                <List.Item>Use clear, descriptive product titles</List.Item>
                <List.Item>Include important details in the description</List.Item>
                <List.Item>Tags help customers find your products</List.Item>
                <List.Item>Set accurate quantities for inventory tracking</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

