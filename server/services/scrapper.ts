import type { RequestInfo, RequestInit, Response } from "node-fetch";
import jsdom from "jsdom";
import { z } from "zod";

const { JSDOM } = jsdom;

const fetch = (url: RequestInfo, init?: RequestInit) =>
	import("node-fetch").then(({ default: fetch }) => fetch(url, init));

const delay = (ms: number) =>
	new Promise((resolve) => setTimeout(() => resolve(void 0), ms));

const retryFetch = (
	url: string,
	timeout: number,
	fetchOptions = {},
	retries = 3,
	retryDelay = 1000,
): Promise<Response> => {
	return new Promise((resolve, reject) => {
		if (timeout) setTimeout(() => reject("error: timeout"), timeout);

		const wrapper = (n: number) => {
			fetch(url, fetchOptions)
				.then((res) => resolve(res))
				.catch(async (err) => {
					if (n > 0) {
						await delay(retryDelay);
						wrapper(n - 1);
					} else {
						reject(err);
					}
				});
		};

		wrapper(retries);
	});
};

export const ItemToadSchema = z.object({
	link: z.string(),
	name: z.string(),
	price: z.string(),
	image: z.string(),
	collection: z.string(),
	variant: z.string(),
	quantity: z.string(),
	cardType: z.string(),
	shipWeight: z.string(),
	description: z.string(),
	barcode: z.string(),
});

export type ItemToad = z.infer<typeof ItemToadSchema>;

export async function getItemToad(
	url: string,
	shop: string,
	entered_quantity = 1,
	entered_price = 0.0,
	type = "standard",
): Promise<ItemToad> {
	const response = await retryFetch(url, 10000, {}, 3, 1000,);

	const data = await response.text();
	const dom = new JSDOM(data);
	const productName =
		dom.window.document.querySelector(".product-name")?.textContent;
	const productPrice =
		dom.window.document.querySelector("#sale-price")?.textContent;
	const productImage =
		dom.window.document
			.querySelector("#main-prod-img")
			?.children[0].getAttribute("src") || "";
	const productCollection =
		dom.window.document.querySelector(".font-small.font-md-default")
			?.children[0].children[0].textContent || "";

	const rows = Array.from(dom.window.document.querySelectorAll("tbody tr"));
	const mappedItems: { key: string; value: string }[] =
		rows.map((row) => {
			const key = row?.querySelector("td")?.textContent ?? "";
			const value = row?.querySelector("td:nth-child(2)")?.textContent ?? "";
			return { key, value };
		});
	const Item: ItemToad = {
		link: url,
		name: productName
			? productName.replace("(Pokemon)", "").trim()
			: "Could not find product name",
		price: entered_price.toString() ||
			Number.parseFloat(productPrice ?? "0.0").toString(),
		image: productImage.replace("/small/", "/pictures/") || "",
		collection: productCollection,
		variant: type,
		quantity: entered_quantity.toString(),
		cardType: mappedItems.find((item) => item.key === "Card Type")?.value || "",
		description: mappedItems.find((item) => item.key === "Description")?.value || "",
		shipWeight: mappedItems.find((item) => item.key === "Ship Weight")?.value || "",
		barcode: mappedItems.find((item) => item.key === "Barcode")?.value || ""
	};
	return Item as ItemToad;
}

export async function getCollectionItemsToad(url: string, shop: string) {
	const response = await fetch(url);
	const data = await response.text();
	const dom = new JSDOM(data);
	const pagination = dom.window.document.querySelector(".pagination");
	const lastPageHTML = pagination?.querySelector(".lastPage")?.outerHTML;
	const lastPageHTMLMatch = lastPageHTML?.match(/data-page=\"(\d+)\"/g)?.[0];
	const lastPageMatch = Number.parseInt(
		lastPageHTMLMatch?.match(/(\d+)/g)?.[0] || "1",
	);

	const cardInfo: Promise<ItemToad | null>[] = [];
	for (let i = 1; i <= lastPageMatch; i++) {
		const pageurl = `${url}?page-no=${i}`;
		const page = await retryFetch(pageurl, 10000, {}, 3, 1000);
		const pagedata = await page.text();
		const pagedom = new JSDOM(pagedata);
		const carditems = pagedom.window.document.querySelectorAll(".card-text");
		for (const item of carditems) {
			const itemlink = `https://www.trollandtoad.com${item.getAttribute("href")}`;
			const iteminfo = getItemToad(itemlink, shop, 0);
			if (iteminfo) cardInfo.push(iteminfo);
		}
	}

	return await Promise.all(cardInfo);
}
