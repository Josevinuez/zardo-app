export async function removeBg(imageURL: string) {
	if (!process.env.REMOVE_BG_API_KEY) throw new Error("No API key found");
	const formData = new FormData();
	formData.append("size", "auto");
	formData.append("image_url", imageURL);

	const response = await fetch("https://api.remove.bg/v1.0/removebg", {
		method: "POST",
		headers: { "X-Api-Key": process.env.REMOVE_BG_API_KEY },
		body: formData,
	});

	if (response.ok) {
		return await response.arrayBuffer();
	}
	const json = await response.json()
	if (json) {
		if (json.errors[0].code === "unknown_foreground") {
			const image = await fetch(imageURL)
			return await image.arrayBuffer()
		}
		throw new Error(`REMOVEBG ERROR: ${json}`)
	}
	throw new Error(`REMOVEBG: Error code ${response.status}: ${response.statusText}`);
}

export async function removeBgFromImageBase64(file: File) {
	if (!process.env.REMOVE_BG_API_KEY) throw new Error("No API key found");
	const formData = new FormData();
	const imageData = await file.arrayBuffer();
	formData.append("size", "auto");
	formData.append("image_file", new Blob([imageData]));

	const response = await fetch("https://api.remove.bg/v1.0/removebg", {
		method: "POST",
		headers: { "X-Api-Key": process.env.REMOVE_BG_API_KEY },
		body: formData,
	});

	if (response.ok) {
		return await response.arrayBuffer();
	}
	const json = await response.json()
	if (json) {
		throw new Error(`REMOVEBG ERROR: ${json}`)
	}
	throw new Error(`REMOVEBG: Error code ${response.status}: ${response.statusText}`);
}
