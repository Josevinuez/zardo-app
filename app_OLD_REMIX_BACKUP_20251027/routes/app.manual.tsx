import {
	Banner,
	Text,
	Card,
	DropZone,
	Form,
	Layout,
	LegacyStack,
	List,
	Page,
	FormLayout,
	Thumbnail,
	TextField,
	ChoiceList,
	Select,
	BlockStack,
	InlineStack,
	Checkbox,
	Button,
	Divider,
	Spinner,
} from "@shopify/polaris";
import { useCallback, useEffect, useState } from "react";
import { DeleteIcon, SaveIcon } from "@shopify/polaris-icons";
import { type ActionFunctionArgs, data, json, unstable_createFileUploadHandler } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
	unstable_createMemoryUploadHandler,
	unstable_parseMultipartFormData,
} from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { uploadImageBuffer, uploadImageFile } from "~/modules/supabase.server";
import { useEventFetcher } from "~/utils/use-shop-notifications";
import type {
	ProductCreateInput,
	ProductVariantsBulkInput,
} from "~/modules/queries.server";
import { makeProductManual } from "trigger/manual.tasks";
import { findProducts } from "~/modules/prisma.queries.server";
import { z } from "zod";

const SHOW_CARD_TYPE_SELECTOR = true;
const SHOW_DUPLICATES_SELECTOR = true;

export async function loader() {
	return {
		env: {
			SUPABASE_URL: process.env.SUPABASE_URL,
			SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
		},
	};
}
const RawVariantSchema = z.enum([
	"standard",
	"mint",
	"near-mint",
	"low-played",
	"moderately-played",
	"heavily-played",
	"damaged",
]);

const CardTypeSchema = z.enum(["standard", "raw"]);
const ManualProductActionSchema = z.object({
	title: z.string().min(1, "Title is required"),
	description: z.string().min(1, "Description is required"),
	price: z.string().transform(Number),
	shipweight: z.string().transform(Number),
	quantity: z.string().transform(Number),
	images: z.array(z.union([z.instanceof(File), z.instanceof(Blob)])),
	cardType: CardTypeSchema.default("standard"),
	rawVariant: RawVariantSchema,
	specific_product: z.string().nullable().default(null),
});


export async function action({ request }: ActionFunctionArgs) {
	console.log("--- Manual Product Action Start ---", );

	const uploadHandler = unstable_createMemoryUploadHandler({
		filter: (part) => {
			console.log("part", part)
			return true
		},
		maxPartSize: 100_000_000,
	});


	const formData = await unstable_parseMultipartFormData(
		request,
		uploadHandler,
	);
	console.log("✔️ Form data received on server.");
	for (const [key, value] of formData.entries()) {
		if (typeof value === "object" && value !== null && "size" in value && "type" in value) {
			const name = "name" in value ? value.name : 'N/A';
			console.log(`formData[${key}] => File/Blob: name=${name}, size=${value.size}, type=${value.type}`);
		} else {
			console.log(`formData[${key}] =>`, value);
		}
	}
	try {
		const dataToParse = {
			title: formData.get("title")?.toString() || "",
			description: formData.get("description")?.toString() ?? "",
			price: formData.get("price")?.toString() ?? "0.0",
			shipweight: formData.get("shipweight")?.toString() ?? "0.04",
			quantity: formData.get("quantity")?.toString() ?? "1",
			images: formData.getAll("images") as File[],
			cardType: formData.get("cardType")?.toString() ?? "standard",
			rawVariant: formData.get("rawVariant")?.toString() ?? "mint",
			specific_product: formData.get("specific_product")?.toString() ?? null,
		};

		console.log("Parsing data with Zod:", dataToParse, "images", formData.get("images"));
		for (const img of dataToParse.images) {
			console.log(`Image details: name=${img.name}, size=${img.size}, type=${img.type}`);
			console.log(`what is the is the img and instanceof file?`, img instanceof File)
			const buffer = Buffer.from(await img.arrayBuffer())
			console.log(`buffer the image?`, buffer)
		}
		const {
			success,
			data,
			error
		} = await ManualProductActionSchema.safeParseAsync({
			title: formData.get("title")?.toString() || "",
			description: formData.get("description")?.toString() ?? "",
			price: formData.get("price")?.toString() ?? "0.0",
			shipweight: formData.get("shipweight")?.toString() ?? "0.04",
			quantity: formData.get("quantity")?.toString() ?? "1",
			images: formData.getAll("images") as File[],
			cardType: formData.get("cardType")?.toString() ?? "standard",
			rawVariant: formData.get("rawVariant")?.toString() ?? "mint",
			specific_product: formData.get("specific_product")?.toString() ?? null,
		});

		if (!success) {
			console.error("❌ Zod validation failed:", error.flatten());
			return { success: false, duplicates: null, error: error.flatten() }
		};
		console.log("✔️ Zod validation successful. Parsed data:", data);
		const { cardType, description, images, price, quantity, rawVariant, shipweight, specific_product, title } = data
		const { session } = await authenticate.admin(request);
		console.log(`Authenticated session: ${session}`);
		
		if (SHOW_DUPLICATES_SELECTOR && !specific_product && title) {
			console.log(`Searching for duplicate products with title containing: "${title.trim()}"`);
			const foundProducts = await findProducts({
				where: {
					title: {
						contains: title.trim(),
					},
				},
			});
			console.log(`Found ${foundProducts.length} potential duplicates.`);

			if (foundProducts.length > 0) {
				console.log("Returning duplicates for user selection.");
				return {
					error: null,
					duplicates: foundProducts,
					formData: {
						title,
						description,
						price,
						shipweight,
						quantity,
						cardType,
						rawVariant,
					},
				};
			}
		}

		console.log("Uploading images to cloud storage...");
		const imagesData = await Promise.all(
			images.map(async (image, idx) => {
				// If image is a Blob but not a File, convert it to a File with a default name
				let fileToUpload: File;
				if (typeof (image as File).name === "string") {
					fileToUpload = image as File;
				} else {
					// Convert Blob to File with a default name
					fileToUpload = new File([image], `upload_${idx}.bin`, { type: image.type });
				}
				const imageUpload = await uploadImageFile(fileToUpload);

				console.log("imageUpload after supabase upload before we return the supabase string", JSON.stringify(imageUpload))
				return `${process.env.SUPABASE_URL}/storage/v1/object/public/zardocards/${imageUpload?.data?.path}`;
			})
		);
		console.log("✔️ Images uploaded. URLs:", imagesData);
	const itemIn: ProductCreateInput = {
		title: title,
		descriptionHtml: description,
		vendor: "",
		status: "ACTIVE",
			productOptions: [{
				name: "Condition",
				values: [
					{
						name: "Mint",
					},
					{
						name: "Near Mint",
					},
					{
						name: "Low Played",
					},
					{
						name: "Moderately Played",
					},
					{
						name: "Heavily Played",
					},
					{
						name: "Damaged",
					},
				],
			}]
		};

		const variants: ProductVariantsBulkInput[] = [];

		switch (rawVariant) {
			case "mint": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Mint",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}

			case "near-mint": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Near Mint",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}
			case "low-played": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Low Played",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}
			case "moderately-played": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Moderately Played",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}
			case "heavily-played": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Heavily Played",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}
			case "damaged": {
				variants.push({
					price: price,
					optionValues: [
						{
							optionName: "Condition",
							name: "Damaged",
						},
					],
					inventoryPolicy: "DENY",
					inventoryItem: {
						cost: "0.0",
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
				break;
			}
			case "standard":
				itemIn.productOptions = [
					{
						name: "Title",
						values: [
							{
								name: "Default Title",
							},
						],
					},
				];
				variants.push({
					price: price,
					inventoryPolicy: "DENY",
					optionValues: [
						{
							optionName: "Title",
							name: "Default Title",
						},
					],
					inventoryItem: {
						cost: price.toString(),
						tracked: true,
						measurement: {
							weight: {
								unit: "POUNDS",
								value: shipweight,
							},
						},
					},
				});
			default:
				break;
		}
		const triggerPayload = {
			shop: session.shop,
			images: imagesData,
			itemIn,
			variants,
			quantity: quantity,
			rawVariant: rawVariant,
			price: price.toString(),
			existingProductId: specific_product === 'NULL' ? null : specific_product,
		};


		console.log("Triggering background task with payload:", triggerPayload);
		await makeProductManual.trigger(triggerPayload)
		console.log("✔️ Background task triggered successfully.");
		return { success: true, duplicates: null };
	} catch (error) {
		console.error("❌ Unhandled error in manual product action:", error);
		if (error instanceof z.ZodError) {
			return { error: error.flatten(), duplicates: null, success: false };
		}
		throw error;
	}
}

export default function Manual() {
	const fetcher = useFetcher<typeof action>();
	const { env } = useLoaderData<typeof loader>();
	const [savable, setSavable] = useState(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [price, setPrice] = useState("");
	const [shipweight, setShipweight] = useState("");
	const [quantity, setQuantity] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [rejectedFiles, setRejectedFiles] = useState<File[]>([]);
	const { error, events } = useEventFetcher("MANUAL");

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
	const [formCache, setFormCache] = useState<any>(null);

	const [cardType, setCardType] = useState<("standard" | "raw")[]>(["standard"]);
	const [rawVariant, setRawVariant] = useState<
		| "mint"
		| "near-mint"
		| "low-played"
		| "moderately-played"
		| "heavily-played"
		| "damaged"
	>("mint");

	useEffect(() => {
		console.log("--- Fetcher Data Changed ---", fetcher.data);
		if (fetcher.data?.duplicates) {
			console.log("Found duplicates, updating state:", fetcher.data.duplicates);
			setDuplicates(fetcher.data.duplicates);
			if (fetcher.data.formData) {
				console.log("Caching form data:", fetcher.data.formData);
				setFormCache(fetcher.data.formData);
			}
		} else if (fetcher.data?.success) {
			console.log("✔️ Action was successful. Clearing form.");
			clearForm();
		} else if (fetcher.data && 'error' in fetcher.data && fetcher.data.error) {
			console.error("❌ Action returned an error:", fetcher.data.error);
		}
	}, [fetcher.data]);

	const hasError = rejectedFiles.length > 0;

	const dragAndDropErrorMessage = hasError && (
		<Banner title="The following images couldn't be uploaded:" tone="critical">
			<List type="bullet">
				{rejectedFiles.map((file, index) => (
					<List.Item key={index}>
						{`"${file.name}" is not supported. File type must be .gif, .jpg, .png or .svg.`}
					</List.Item>
				))}
			</List>
		</Banner>
	);
	const handleDrop = useCallback(
		(_droppedFiles: File[], acceptedFiles: File[], rejectedFiles: File[]) => {
			console.log("Files dropped. Accepted:", acceptedFiles, "Rejected:", rejectedFiles);
			setFiles((files) => [...files, ...acceptedFiles]);
			setRejectedFiles(rejectedFiles);
		},
		[],
	);

	const fileUpload = !files.length && <DropZone.FileUpload />;
	const uploadedFiles = files.length > 0 && (
		<LegacyStack vertical>
			{files.map((file, index) => (
				<LegacyStack alignment="center" key={index}>
					<Thumbnail
						size="small"
						alt={file.name}
						source={window.URL.createObjectURL(file)}
					/>
					<div>
						{file.name}{" "}
						<Text variant="bodySm" as="p">
							{file.size} bytes
						</Text>
					</div>
				</LegacyStack>
			))}
		</LegacyStack>
	);

	const handleCardTypeChange = useCallback((value: string[]) => {
		setCardType(value as ("standard" | "raw")[]);
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

	const onSubmit = useCallback(
		(e?: React.FormEvent<HTMLFormElement>) => {
			e?.preventDefault();
			console.log("--- Submitting New Product Form ---");
			const formData = new FormData();
			formData.set("title", title);
			formData.set("description", description);
			formData.set("price", price);
			formData.set("shipweight", shipweight);
			formData.set("quantity", quantity);

			formData.set("cardType", cardType[0]);
			if (cardType[0] !== "standard") {
				formData.set("rawVariant", rawVariant);
			} else {
				formData.set("rawVariant", "standard")
			}

			for (let i = 0; i < files.length; i++) {
				formData.append(
					"images",
					new Blob([files[i]], { type: files[i].type }),
				);
			}

			setDuplicates(null);

			console.log("Submitting FormData. Entries:", Object.fromEntries(formData.entries()));
			console.log("Submitting FormData. Images:", formData.getAll('images'));
			fetcher.submit(formData, {
				method: "POST",
				encType: "multipart/form-data",
			});
		},
		[title, description, price, shipweight, quantity, files, cardType, rawVariant, fetcher.submit],
	);

	const clearForm = (e?: React.FormEvent<HTMLFormElement>) => {
		e?.preventDefault();
		setTitle("");
		setDescription("");
		setPrice("");
		setShipweight("");
		setQuantity("");
		setFiles([]);
		setRejectedFiles([]);
		setCardType(["standard"]);
		setRawVariant("mint");
		setDuplicates(null);
		setFormCache(null);
	};

	const handleSubmitWithProduct = useCallback(
		(specificProduct: string | null) => {
			console.log(`--- Submitting With Existing Product (${specificProduct}) ---`);
			const formData = new FormData();

			const data = formCache || {
				title,
				description,
				price,
				shipweight,
				quantity,
				cardType: cardType[0],
				rawVariant
			};

			console.log("Using form data:", data);
			formData.set("title", data.title);
			formData.set("description", data.description);
			formData.set("price", data.price.toString());
			formData.set("shipweight", data.shipweight.toString());
			formData.set("quantity", data.quantity.toString());
			formData.set("cardType", data.cardType);
			if (data.cardType !== "standard") {
				formData.set("rawVariant", data.rawVariant);
			}

			formData.set("specific_product", specificProduct || "NULL");

			for (let i = 0; i < files.length; i++) {
				// formData.append(
				// 	"images",
				// 	new Blob([files[i]], { type: files[i].type }),
				// );
				formData.append("images", files[i]);
			}

			console.log("Submitting FormData. Entries:", Object.fromEntries(formData.entries()));
			console.log("Submitting FormData. Images:", formData.getAll('images'));
			fetcher.submit(formData, {
				method: "POST",
				encType: "multipart/form-data",
			});
		},
		[formCache, title, description, price, shipweight, quantity, cardType, rawVariant, files, fetcher],
	);

	useEffect(() => {
		setSavable(
			title !== "" &&
			description !== "" &&
			price !== "" &&
			shipweight !== "" &&
			quantity !== ""
		);
	}, [title, description, price, shipweight, quantity]);

	return (
		<Page
			title="Manual Product Creation V2"
			backAction={{ content: "Back", url: "/app" }}
			primaryAction={{
				content: "Save",
				disabled: !savable || duplicates !== null,
				onAction: onSubmit,
				icon: SaveIcon,
			}}
			secondaryActions={[
				{
					content: "Delete",
					destructive: true,
					icon: DeleteIcon,
					onAction: clearForm,
					disabled: duplicates !== null
				},
			]}
			fullWidth
		>
			<div style={{ position: "relative" }}>
				{fetcher.state === "submitting" && (
					<div
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							backgroundColor: "rgba(255, 255, 255, 0.7)",
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							zIndex: 10,
						}}
					>
						<BlockStack gap="400" align="center">
							<Spinner accessibilityLabel="Processing..." size="large" />
							<Text as="p" variant="bodyMd">Uploading... please wait.</Text>
						</BlockStack>
					</div>
				)}
				<Layout>
					{duplicates && (
						<Layout.Section>
							<Card>
								<BlockStack gap="300">
									<Text as="h3" variant="headingMd">
										Duplicate Products - Link to existing product?
									</Text>
									<Text as="p" variant="bodyMd">
										We found similar products in your store. Would you like to update an existing product or create a new one?
									</Text>
									<List type="number">
										{duplicates.map((item, i, arr) => (
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
														loading={fetcher.state === "submitting"}
														variant="primary"
														onClick={() => handleSubmitWithProduct(item.id)}
													>
														Update existing product
													</Button>
												</BlockStack>
												{i < arr.length - 1 && <Divider />}
											</List.Item>
										))}
									</List>
									<Button
										loading={fetcher.state === "submitting"}
										variant="secondary"
										onClick={() => handleSubmitWithProduct(null)}
									>
										Create new product
									</Button>
								</BlockStack>
							</Card>
						</Layout.Section>
					)}

					{!duplicates && (
						<>
							<Layout.Section>
								<Form onSubmit={onSubmit} encType="multipart/form-data">
									<Card roundedAbove="sm">
										<FormLayout>
											<TextField
												label="Title"
												value={title}
												onChange={setTitle}
												autoComplete="off"
												requiredIndicator
											/>
											<TextField
												label="Description"
												multiline={7}
												value={description}
												onChange={setDescription}
												autoComplete="off"
												requiredIndicator
											/>
											<FormLayout.Group condensed>
												<TextField
													label="Price"
													placeholder="0.00"
													value={price}
													onChange={setPrice}
													autoComplete="off"
													type="number"
													requiredIndicator
												/>
												<TextField
													label="Shipping Weight (lbs)"
													placeholder="0.04"
													value={shipweight}
													onChange={setShipweight}
													autoComplete="off"
													type="number"
													requiredIndicator
												/>
												<TextField
													label="Quantity"
													placeholder="1"
													value={quantity}
													onChange={setQuantity}
													autoComplete="off"
													type="number"
													requiredIndicator
												/>
											</FormLayout.Group>

											{SHOW_CARD_TYPE_SELECTOR && (
												<Card>
													<BlockStack gap="300">
														<Text as="h3" variant="headingMd">
															Card Type & Condition
														</Text>
														<InlineStack gap="400" blockAlign="center">
															<ChoiceList
																title="Type"
																choices={[
																	{ label: "Standard", value: "standard" },
																	{ label: "Raw", value: "raw" },
																]}
																selected={cardType}
																onChange={handleCardTypeChange}
															/>
															<Select
																label="RAW Variant"
																value={rawVariant}
																onChange={handleRawVariantChange}
																disabled={cardType[0] === "standard"}
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
													</BlockStack>
												</Card>
											)}
										</FormLayout>
									</Card>
								</Form>
							</Layout.Section>

							<Layout.Section variant="oneThird">
								<Card roundedAbove="sm">
									<LegacyStack vertical>
										{dragAndDropErrorMessage}
										<DropZone accept="image/*" type="image" onDrop={handleDrop}>
											{uploadedFiles}
											{fileUpload}
										</DropZone>
									</LegacyStack>
								</Card>
							</Layout.Section>
						</>
					)}
				</Layout>
			</div>
		</Page>
	);
}