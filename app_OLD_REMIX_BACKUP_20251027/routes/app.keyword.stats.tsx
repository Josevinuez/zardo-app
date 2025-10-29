import { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node"
import { useLoaderData } from "@remix-run/react"

import {
    Page,
    Layout,
    LegacyCard,
    Text,
    BlockStack,
    DataTable,
    InlineGrid,
    EmptyState,
    List,
    InlineStack,
    Badge,
} from "@shopify/polaris";
import prisma from "~/db.server";
import { useMemo } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
    const keywords = await prisma.keyword.findMany({
        select: {
            id: true,
            value: true,
            _count: {
                select: {
                    Wishlists: {
                        where: {
                            email: {
                                not: null
                            }
                        }
                    }
                }
            },

        },
        orderBy: {
            Wishlists: {
                _count: "desc"
            }
        }
    });
    const suggestedKeywords = await prisma.suggestedKeyword.findMany({})
    const totalEmails = await prisma.wishlist.count({
        where: {
            email: {
                not: null
            }
        }
    });
    return {
        keywords,
        suggestedKeywords,
        totalEmails
    };
}

export default function KeywordStatsPage() {
    const { keywords, suggestedKeywords, totalEmails } = useLoaderData<typeof loader>();

    const totalKeywords = keywords.length;
    const suggestedKeywordValues = useMemo(() => {
        return new Set(suggestedKeywords.map(sk => sk.value));
    }, [suggestedKeywords]);

    const popularKeywords = useMemo(() => {
        return [...keywords]
            .sort((a, b) => b._count.Wishlists - a._count.Wishlists)
            .slice(0, 5);
    }, [keywords]);

    const keywordTableRows = useMemo(() => {
        return keywords.map((keyword) => {
            const isSuggested = suggestedKeywordValues.has(keyword.value);
            const keywordDisplay = (
                <InlineStack gap="100" blockAlign="center">
                    <span>{keyword.value || `ID: ${keyword.id}`}</span>
                    {isSuggested && <Badge tone="info">Preset</Badge>}
                </InlineStack>
            );

            return [
                keywordDisplay,
                keyword._count.Wishlists,
            ];
        }).sort().reverse();
    }, [keywords]);

    if (totalKeywords === 0) {
        return (
            <Page title="Keyword Statistics">
                <Layout>
                    <Layout.Section>
                        <LegacyCard sectioned>
                            <EmptyState
                                heading="No keywords found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>Add some keywords to start seeing statistics.</p>
                            </EmptyState>
                        </LegacyCard>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page title="Keyword Statistics">
            <BlockStack gap="400">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                    <LegacyCard title="Total Keywords" sectioned>
                        <BlockStack gap="200">
                            <Text variant="headingXl" as="h2">
                                {totalKeywords}
                            </Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                                Unique keywords tracked.
                            </Text>
                        </BlockStack>
                        <BlockStack gap="200">
                            <Text variant="headingXl" as="h2">
                                {totalEmails}
                            </Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                                Unique emails in wishlists.
                            </Text>
                        </BlockStack>
                    </LegacyCard>

                    <LegacyCard title="Most Popular Keywords" sectioned>
                        <BlockStack gap="200">
                            {popularKeywords.length > 0 ? (
                                <List type="number">
                                    {popularKeywords.map((kw) => (
                                        <List.Item key={kw.id}>
                                            {kw.value} ({kw._count.Wishlists}{" "}
                                            wishlists)
                                        </List.Item>
                                    ))}
                                </List>
                            ) : (
                                <Text variant="bodyMd" as="p" tone="subdued">
                                    Not enough data to show popular keywords.
                                </Text>
                            )}
                        </BlockStack>
                    </LegacyCard>
                </InlineGrid>

                <Layout>
                    <Layout.Section>
                        <LegacyCard>
                            <DataTable
                                columnContentTypes={[
                                    'text',
                                    'numeric',
                                ]}
                                headings={[
                                    'Keyword',
                                    'Number of Wishlists',
                                ]}
                                rows={keywordTableRows}
                                footerContent={`Showing ${totalKeywords} keyword${totalKeywords > 1 ? 's' : ''}.`}
                            />
                        </LegacyCard>
                    </Layout.Section>
                </Layout>
            </BlockStack>
        </Page>
    );
}

