import { type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
	BlockStack,
	Card,
	Layout,
	Page,
	IndexTable,
	useIndexResourceState,
	Text,
	InlineStack,
	Badge,
} from "@shopify/polaris";
import { runs } from "@trigger.dev/sdk/v3";

export async function loader({ request }: LoaderFunctionArgs) {
	const { data: runs_list } = await runs.list({
		taskIdentifier: "processPSA",
		from: (Date.now() - 1000 * 60 * 60 * 24 * 7),
		to: Date.now(),
	});

	const results = await Promise.all(runs_list.map((run) => {
		return runs.retrieve(run.id)
	}));
	return { results };
}

export default function PSAHistory() {
	const { results } = useLoaderData<typeof loader>();
	const imports = results.map((result) => {
		let status: JSX.Element;
		switch (result.status) {

			case "COMPLETED":
				status = <Badge tone="success">{result.status}</Badge>;
				break;
			case "INTERRUPTED":
			case "FAILED":
			case "SYSTEM_FAILURE":
			case "TIMED_OUT":
			case "CRASHED":
				status = <Badge tone="critical">{result.status}</Badge>;
				break;
			case "EXECUTING":
			case "QUEUED":
			case "WAITING_FOR_DEPLOY":
				status = <Badge tone="info">{result.status}</Badge>;
				break;
			case "DELAYED":
			case "REATTEMPTING":
				status = <Badge tone="warning">{result.status}</Badge>;
				break;
			case "CANCELED":
			case "EXPIRED":
			case "FROZEN":
				status = <Badge tone="attention-strong">Failed</Badge>;
				break;
			default:
				status = <Badge tone="attention">{result.status}</Badge>;
				break;
		}
		return {
			id: result.id,
			card_no: result.payload.cardNo,
			job_id: result.id,
			status,
			message: (result.output !== undefined) ? result.output.message : "No message",
			createdAt: new Date(result.createdAt),
		};
	});

	const resourceName = {
		singular: "Import",
		plural: "Imports",
	};
	const { selectedResources, allResourcesSelected, handleSelectionChange } =
		useIndexResourceState(results);

	const rowMarkup = imports.map(
		({ id, job_id, card_no, status, message, createdAt }, index) => (
			<IndexTable.Row
				id={id.toString()}
				key={id}
				selected={selectedResources.includes(id.toString())}
				position={index}
			>
				<IndexTable.Cell>{id}</IndexTable.Cell>
				<IndexTable.Cell>{job_id}</IndexTable.Cell>
				<IndexTable.Cell>{card_no}</IndexTable.Cell>
				<IndexTable.Cell>{createdAt.toLocaleString()}</IndexTable.Cell>
				<IndexTable.Cell>{status}</IndexTable.Cell>
				<IndexTable.Cell>
					<Text as="span" variant="bodySm" tone="subdued">
						{message}
					</Text>
				</IndexTable.Cell>
			</IndexTable.Row>
		),
	);
	return (
		<Page title="PSA Card Import History">
			<Layout>
				<Layout.Section>
					<Card>
						<BlockStack gap="300">
							<IndexTable
								resourceName={resourceName}
								itemCount={imports.length}
								selectedItemsCount={
									allResourcesSelected ? "All" : selectedResources.length
								}
								onSelectionChange={handleSelectionChange}
								headings={[
									{ title: "ID" },
									{ title: "Job ID" },
									{ title: "Card Number" },
									{ title: "Date Added" },
									{ title: "Status" },
									{ title: "Message" },
								]}
							>
								{rowMarkup}
							</IndexTable>
						</BlockStack>
					</Card>
				</Layout.Section>
			</Layout>
		</Page>
	);
}
