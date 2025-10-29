import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { useCallback, useEffect, useState } from "react";
import {
    Page,
    Layout,
    LegacyCard,
    DataTable,
    Button,
    Modal,
    TextField,
    Banner,
    Text,
    EmptyState,
    ButtonGroup,
    InlineStack,
    Spinner,
    BlockStack,
    ContextualSaveBar,
    Link,
    Frame
} from "@shopify/polaris";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const suggestedKeywords = await prisma.suggestedKeyword.findMany({
        orderBy: {
            createdAt: "desc"
        }
    });

    return { suggestedKeywords };
}

export async function action({ request }: ActionFunctionArgs) {
    const data = await request.formData();
    const action = data.get("action") as string;

    try {
        if (action === "add") {
            const keywordValue = data.get("keyword") as string;

            if (!keywordValue || keywordValue.trim() === "") {
                return { error: "Keyword cannot be empty", success: false };
            }

            const trimmedValue = keywordValue.trim().toLowerCase();

            const existing = await prisma.suggestedKeyword.findFirst({
                where: {
                    value: trimmedValue
                }
            });

            if (existing) {
                return { error: "This keyword already exists", success: false };
            }

            await prisma.suggestedKeyword.create({
                data: {
                    value: trimmedValue,
                    source: "admin"
                }
            });

            return { success: true, message: "Keyword added successfully" };
        }

        else if (action === "delete") {
            const id = data.get("id") as string;

            await prisma.suggestedKeyword.delete({
                where: {
                    id
                }
            });

            return { success: true, message: "Keyword deleted successfully" };
        }

        else if (action === "bulk-delete") {
            const ids = JSON.parse(data.get("ids") as string) as string[];

            await prisma.suggestedKeyword.deleteMany({
                where: {
                    id: {
                        in: ids
                    }
                }
            });

            return { success: true, message: `${ids.length} keywords deleted successfully` };
        }

        return { error: "Invalid action", success: false };
    } catch (error) {
        return { error: "An error occurred", success: false };
    }
}

export default function KeywordManagePage() {
    const { suggestedKeywords } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newKeyword, setNewKeyword] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedKeywordIds, setSelectedKeywordIds] = useState<string[]>([]);
    const [statusMessage, setStatusMessage] = useState<{
        content: string;
        error?: boolean;
    } | null>(null);

    useEffect(() => {
        if (actionData) {
            if ('error' in actionData) {
                setStatusMessage({ content: actionData.error, error: true });
            } else if (actionData.message) {
                setStatusMessage({ content: actionData.message });

                if (actionData.success && selectedKeywordIds.length > 0) {
                    setSelectedKeywordIds([]);
                }
            }

            const timer = setTimeout(() => {
                setStatusMessage(null);
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [actionData, selectedKeywordIds.length]);

    const handleAddKeyword = useCallback(() => {
        const formData = new FormData();
        formData.append("action", "add");
        formData.append("keyword", newKeyword);

        submit(formData, { method: "post" });
        setNewKeyword("");
        setIsAddModalOpen(false);
    }, [newKeyword, submit]);

    const handleDelete = useCallback((id: string) => {
        setIsDeleting(true);

        const formData = new FormData();
        formData.append("action", "delete");
        formData.append("id", id);

        submit(formData, { method: "post" });

        setTimeout(() => {
            setIsDeleting(false);
        }, 500);
    }, [submit]);

    const handleBulkDelete = useCallback(() => {
        if (selectedKeywordIds.length === 0) return;

        setIsDeleting(true);

        const formData = new FormData();
        formData.append("action", "bulk-delete");
        formData.append("ids", JSON.stringify(selectedKeywordIds));

        submit(formData, { method: "post" });

        setTimeout(() => {
            setIsDeleting(false);
        }, 500);
    }, [selectedKeywordIds, submit]);

    const toggleKeywordSelection = useCallback((id: string) => {
        setSelectedKeywordIds(prev =>
            prev.includes(id)
                ? prev.filter(keywordId => keywordId !== id)
                : [...prev, id]
        );
    }, []);

    const allSelected = suggestedKeywords.length > 0 &&
        selectedKeywordIds.length === suggestedKeywords.length;

    const toggleSelectAll = useCallback(() => {
        if (allSelected) {
            setSelectedKeywordIds([]);
        } else {
            setSelectedKeywordIds(suggestedKeywords.map(kw => kw.id));
        }
    }, [allSelected, suggestedKeywords]);

    const rows = suggestedKeywords.map((keyword) => {
        const isSelected = selectedKeywordIds.includes(keyword.id);

        return [
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleKeywordSelection(keyword.id)}
                aria-label={`Select ${keyword.value}`}
            />,
            keyword.value,
            keyword.source || "Not specified",
            new Date(keyword.createdAt).toLocaleDateString(),
            <ButtonGroup>
                <Button
                    variant="primary"
                    tone="critical"
                    onClick={() => handleDelete(keyword.id)}
                    disabled={isDeleting}
                >
                    Remove
                </Button>
            </ButtonGroup>
        ];
    });

    return (
        <Frame>
            <Page
                title="Manage Suggested Keywords"
                subtitle="Add or remove preset keywords that will be used as suggestions"
                primaryAction={{
                    content: "Add new keyword",
                    onAction: () => setIsAddModalOpen(true)
                }}
                secondaryActions={[
                    {
                        content: "View keyword stats",
                        url: "/app/keyword/stats"
                    }
                ]}
            >
                {statusMessage && (
                    <Layout.Section>
                        <Banner
                            title={statusMessage.error ? "Error" : "Success"}
                            tone={statusMessage.error ? "critical" : "success"}
                            onDismiss={() => setStatusMessage(null)}
                        >
                            <p>{statusMessage.content}</p>
                        </Banner>
                    </Layout.Section>
                )}

                {selectedKeywordIds.length > 0 && (
                    <ContextualSaveBar
                        message={`${selectedKeywordIds.length} keyword${selectedKeywordIds.length > 1 ? 's' : ''} selected`}
                        saveAction={{
                            content: "Delete selected",
                            onAction: handleBulkDelete,
                            loading: isDeleting,
                            disabled: isDeleting
                        }}
                        discardAction={{
                            content: "Cancel",
                            onAction: () => setSelectedKeywordIds([])
                        }}
                    />
                )}

                <Layout>
                    <Layout.Section>
                        <LegacyCard>
                            {suggestedKeywords.length > 0 ? (
                                <>
                                    <DataTable
                                        columnContentTypes={[
                                            'text',
                                            'text',
                                            'text',
                                            'text',
                                            'text'
                                        ]}
                                        headings={[
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={toggleSelectAll}
                                                aria-label="Select all keywords"
                                            />,
                                            'Keyword',
                                            'Source',
                                            'Created',
                                            'Actions'
                                        ]}
                                        rows={rows}
                                        footerContent={`Showing ${suggestedKeywords.length} suggested keyword${suggestedKeywords.length > 1 ? 's' : ''}`}
                                    />
                                </>
                            ) : (
                                <EmptyState
                                    heading="No suggested keywords yet"
                                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                >
                                    <p>Add some keywords to help customers discover your products.</p>
                                    <Button onClick={() => setIsAddModalOpen(true)}>Add keyword</Button>
                                </EmptyState>
                            )}
                        </LegacyCard>

                        <BlockStack gap="400" >
                            <Text as="h2">About Suggested Keywords</Text>
                            <Text as="p">
                                Suggested keywords are preset keywords that will be shown as suggestions when customers are adding items to their wishlist.
                                Adding relevant keywords here can help customers find and track products they're interested in.
                            </Text>
                            <Link url="/app/keyword/stats">View keyword statistics</Link>
                        </BlockStack>
                    </Layout.Section>
                </Layout>

                <Modal
                    open={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    title="Add new suggested keyword"
                    primaryAction={{
                        content: "Add keyword",
                        onAction: handleAddKeyword,
                        disabled: !newKeyword.trim()
                    }}
                    secondaryActions={[
                        {
                            content: "Cancel",
                            onAction: () => setIsAddModalOpen(false)
                        }
                    ]}
                >
                    <Modal.Section>
                        <BlockStack gap="400">
                            <Text as="dt">
                                Add a new keyword that will be suggested to customers when they're creating wishlists.
                            </Text>
                            <TextField
                                label="Keyword"
                                value={newKeyword}
                                onChange={setNewKeyword}
                                autoComplete="off"
                                placeholder="Enter keyword (e.g., 'vintage', 'limited edition')"
                                helpText="Keywords should be specific and relevant to your products."
                                autoFocus
                            />
                        </BlockStack>
                    </Modal.Section>
                </Modal>
            </Page>
        </Frame>
    );
}