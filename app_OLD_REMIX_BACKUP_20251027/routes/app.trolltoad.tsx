import {
	Box,
	Card,
	Layout,
	Page,
	TextField,
	BlockStack,
	Checkbox,
	Button,
	FormLayout,
	InlineStack,
	ChoiceList,
	Select,
	Text,
	Divider,
	List,
} from "@shopify/polaris";
import {
	queueParseTrollToad,
	type QueueParseTrollToadJobInput,
} from "../modules/troll.server";
import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
	getItemToad,
	getCollectionItemsToad,
	type ItemToad,
} from "../modules/scrapper.server";
import { json, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { useEventFetcher } from "~/utils/use-shop-notifications";
import { findProducts } from "~/modules/prisma.queries.server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Job } from "bee-queue";
import { type TypeOf, z } from "zod";

export async function loader({ request }: LoaderFunctionArgs) {
	const waitingJobs = queueParseTrollToad.getJobs("waiting", { size: 500 });
	const failedJobs = queueParseTrollToad.getJobs("failed", { size: 500 });
	return json({
		waitingJobs,
		failedJobs,
		env: {
			SUPABASE_URL: process.env.SUPABASE_URL,
			SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
		},
	});
}

const trollSchema = z.object({
	url: z.string().url(),
	collection: z.coerce.boolean().default(false),
	quantity: z.coerce.number().min(1).default(1),
	price: z.coerce.number().min(0.01).default(0.1),
	type: z
		.enum([
			"standard",
			"mint",
			"near-mint",
			"low-played",
			"moderately-played",
			"heavily-played",
			"damaged",
		])
		.default("standard"),
	specific_product: z.string().optional(),
});
export const action = async ({ request }: LoaderFunctionArgs) => {
	const { session } = await authenticate.admin(request);

	const formData = await request.formData();
	const { success, data, error } = await trollSchema.safeParseAsync(
		Object.fromEntries(formData),
	);
	if (!success) {
		return json({
			error: "Invalid form data",
			itemsReturn: null,
			duplicates: null,
		});
	}
	const url = data.url;
	const ismulti = data.collection;
	const quantity = data.quantity;
	const price = data.price;
	const type = data.type;
	const specific_product = data.specific_product;

	if (!url)
		return {
			error: "No URL provided",
			itemsReturn: null,
			duplicates: null,
		};

	let items: Array<ItemToad | null> = [];
	if (ismulti) {
		items = await getCollectionItemsToad(url, session.shop);
	} else {
		items = [await getItemToad(url, session.shop, quantity, price, type)];
	}
	const foundProducts = await findProducts({
		where: {
			title: {
				contains: items[0]?.name.replace("(Pokemon)", "").trim(),
			},
		},
	});
	if (foundProducts.length > 0 && !specific_product) {
		return { error: null, itemsReturn: null, duplicates: foundProducts };
	}
	const itemsReturn: number[] = [];
	const jobs: Array<Job<QueueParseTrollToadJobInput>> = [];
	for (let i = 0; i < items.length; i++) {
		const itemIn = items[i];
		try {
			if (!itemIn?.name) {
				continue;
			}
			const job: Job<QueueParseTrollToadJobInput> = queueParseTrollToad
				.createJob({
					shop: session.shop,
					itemIn,
					existingProductId: specific_product
						? specific_product === "NULL"
							? null
							: specific_product
						: null,
				} as QueueParseTrollToadJobInput)
				.retries(5)
				.backoff("exponential", 2000);
			jobs.push(job);
		} catch (error) {
			if (error instanceof PrismaClientKnownRequestError) {
				continue;
			}
		}
		const jobMap: Map<
			Job<QueueParseTrollToadJobInput>,
			Error
		> = await queueParseTrollToad.saveAll(jobs);
	}
	return { itemsReturn, error: null, duplicates: null };
};

export default function TrollAndToad() {
	const [duplicates, setDuplicates] = useState<
		| {
			id: string;
			title: string;
			description: string;
			totalInventory: number;
			importLink: string | null;
			status: string;
		}[]
		| null
	>(null);
	const [lastLink, setLastLink] = useState<string | null>(null);
	const [lastData, setLastData] = useState<TypeOf<typeof trollSchema> | null>(
		null,
	);

	return (
		<Page>
			<ui-title-bar title="Toad&Troll Import" />
			<Layout>
				<Layout.Section>
					<Card>
						<BlockStack gap="300">
							<URLInputForm
								setDuplicates={setDuplicates}
								setLastLink={setLastLink}
								setLastData={setLastData}
							/>
						</BlockStack>
					</Card>
				</Layout.Section>
				<Layout.Section>
					{duplicates && (
						<Duplicates
							data={duplicates}
							lastLink={lastLink}
							lastData={lastData}
						/>
					)}
				</Layout.Section>
			</Layout>
		</Page>
	);
}

function Duplicates({
	data,
	lastLink,
	lastData,
}: {
	data:
	| {
		id: string;
		title: string;
		description: string;
		totalInventory: number;
		importLink: string | null;
		status: string;
	}[]
	| null;
	lastLink: string | null;
	lastData: TypeOf<typeof trollSchema> | null;
}) {
	if (!data) return null;
	const fetcher = useFetcher<typeof action>({ key: "duplicates" });
	const isLoading = ["loading", "submitting"].includes(fetcher.state);

	const handleSubmit = useCallback(
		(specificProduct: string | null) => {
			if (lastData) {
				const formData = new FormData();
				formData.set("specific_product", specificProduct || "NULL");
				formData.set("url", lastData.url);
				formData.set("collection", lastData.collection ? "1" : "");
				formData.set("quantity", lastData.quantity.toString());
				formData.set("price", lastData.price.toString());
				formData.set("type", lastData.type);

				fetcher.submit(formData, { method: "POST" });
			}
		},
		[lastData, fetcher],
	);

	return (
		<Card>
			<BlockStack gap="300">
				<Text as="h3" variant="headingMd">
					Duplicate Products - Link to existing product?
				</Text>
				<Text as="h5" variant="headingMd">
					URL {lastLink}
				</Text>
				<List type="number">
					{data?.map((item, i, arr) => (
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
									loading={isLoading}
									variant="primary"
									onClick={() => {
										handleSubmit(item.id);
									}}
								>
									Update existing product
								</Button>
							</BlockStack>
							{i < arr.length - 1 && <Divider />}
						</List.Item>
					))}
				</List>
				<Button
					loading={isLoading}
					variant="secondary"
					onClick={() => {
						handleSubmit(null);
					}}
				>
					Create new product
				</Button>
			</BlockStack>
		</Card>
	);
}

function URLInputForm({
	setDuplicates,
	setLastLink,
	setLastData,
}: {
	setDuplicates: React.Dispatch<
		React.SetStateAction<
			| {
				id: string;
				title: string;
				description: string;
				totalInventory: number;
				importLink: string | null;
				status: string;
			}[]
			| null
		>
	>;
	setLastLink: React.Dispatch<React.SetStateAction<string | null>>;
	setLastData: React.Dispatch<
		React.SetStateAction<TypeOf<typeof trollSchema> | null>
	>;
}) {
	const fetcher = useFetcher<typeof action>({ key: "url-input-form" });
	const data = fetcher.data;
	useEffect(() => {
		if (data?.duplicates) {
			setDuplicates(data.duplicates);
		}
	}, [data?.duplicates, setDuplicates]);

	const isLoading = ["loading", "submitting"].includes(fetcher.state);

	const [collection, setCollection] = useState(false);
	const [url, setURL] = useState("");
	const [quantity, setQuantity] = useState(1);
	const [price, setPrice] = useState(0.01);
	const [type, setType] = useState<("standard" | "raw")[]>(["standard"]);
	const [rawVariant, setRawVariant] = useState<
		| "mint"
		| "near-mint"
		| "low-played"
		| "moderately-played"
		| "heavily-played"
		| "damaged"
	>("mint");
	const { error, events } = useEventFetcher("TROLL");
	const handleSubmit = useCallback(
		(event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const formData = new FormData();
			setDuplicates(null);
			setLastLink(url);
			setLastData({
				url,
				collection,
				quantity,
				price,
				type: type[0] === "standard" ? "standard" : rawVariant,
			});
			formData.set("url", url);
			formData.set("collection", collection ? "1" : "");
			formData.set("quantity", quantity.toString());
			formData.set("price", price.toString());
			if (type[0] !== "standard") {
				formData.set("type", rawVariant);
			} else {
				formData.set("type", type[0]);
			}

			fetcher.submit(formData, { method: "POST" });
		},
		[
			collection,
			quantity,
			price,
			type,
			rawVariant,
			url,
			fetcher,
			setLastLink,
			setDuplicates,
			setLastData,
		],
	);
	const handleMultipleItemChange = useCallback(
		(value: boolean) => setCollection(value),
		[],
	);

	const handleURLChange = useCallback((value: string) => setURL(value), []);
	const handleQuantityChange = useCallback(
		(value: string) =>
			Number.parseInt(value) >= 0 && setQuantity(Number.parseInt(value)),
		[],
	);
	const handlePriceChange = useCallback(
		(value: string) =>
			Number.parseFloat(value) >= 0 && setPrice(Number.parseFloat(value)),
		[],
	);
	const handleTypeChange = useCallback((value: string[]) => {
		setType(value as ("standard" | "raw")[]);
	}, []);
	const handleRawVariantChange = useCallback(
		(value: string) =>
			setRawVariant(
				value as
				| "mint"
				| "near-mint"
				| "low-played"
				| "moderately-played"
				| "heavily-played"
				| "damaged",
			),
		[],
	);

	return (
		<fetcher.Form onSubmit={handleSubmit}>
			<FormLayout>
				<TextField
					label="URL"
					value={url}
					onChange={handleURLChange}
					type="url"
					autoComplete="off"
				/>
				<InlineStack gap="200">
					<Checkbox
						label="Multiple Item Import"
						checked={collection}
						onChange={handleMultipleItemChange}
					/>
					<TextField
						label="Quantity"
						value={quantity.toString()}
						onChange={handleQuantityChange}
						type="number"
						disabled={collection}
						autoComplete="off"
					/>

					<TextField
						label="Price"
						value={price.toString()}
						onChange={handlePriceChange}
						type="number"
						disabled={collection}
						autoComplete="off"
					/>
					<ChoiceList
						title="Type"
						choices={[
							{ label: "Standard", value: "standard" },
							{ label: "Raw", value: "raw" },
						]}
						selected={type}
						onChange={handleTypeChange}
					/>
					<Select
						label="RAW Variant"
						value={rawVariant}
						onChange={handleRawVariantChange}
						disabled={type[0] === "standard"}
						options={[
							{ label: "Mint", value: "mint" },
							{ label: "Near Mint", value: "near-mint" },
							{ label: "Low Played", value: "low-played" },
							{ label: "Moderately Played", value: "moderately-played" },
							{ label: "Heavily Played", value: "heavily-played" },
							{ label: "Damaged", value: "damaged" },
						]}
					/>
				</InlineStack>
				<Button submit loading={isLoading}>
					Submit
				</Button>
				{fetcher.text === "error" ? <div>There was an error</div> : null}
				{fetcher.formAction && (
					<Box
						padding="400"
						background="bg-surface-active"
						borderWidth="025"
						borderRadius="200"
						borderColor="border"
						overflowX="scroll"
					>
						<pre style={{ margin: 0 }}>
							<code>Creating Product</code>
						</pre>
					</Box>
				)}
			</FormLayout>
		</fetcher.Form>
	);
}
