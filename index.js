document.getElementById("getHotelDataBtn").addEventListener("click", async () => {
	const input = document.getElementById("urlInput");
	const origUrl = input.value.trim();
	let url = input.value.trim();
	const urlParams = new URLSearchParams(url);

	// URL Parameters
	const checkIn = urlParams.get("checkin");
	const checkOut = urlParams.get("checkout");
	const rooms = urlParams.get("no_rooms");
	const adults = urlParams.get("group_adults");
	const children = urlParams.get("group_children");

	// Basic validation
	if (!url || !url.startsWith("http")) {
		alert("Enter a valid URL that starts with http or https");
		return;
	}

	// Trim to .html
	const htmlIndex = url.indexOf(".html");
	if (htmlIndex !== -1) {
		url = url.substring(0, htmlIndex + 5);
	}

	input.value = url;

	const resultEl = document.getElementById("result");
	const imageList = document.getElementById("imageList");
	resultEl.textContent = "Loading...";
	imageList.innerHTML = "";

	try {
		// Fetch page content through AllOrigins
		const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
		const html = await response.text();
		const doc = new DOMParser().parseFromString(html, "text/html");

		// === Extract Text Info ===
		const name = doc.querySelector("h2.pp-header__title")?.innerText.trim() || "Not found";
		const rating = doc.querySelector("[data-review-score]")?.getAttribute("data-review-score") || "Not found";
		const mapEl = doc.querySelector("[data-atlas-latlng]");
		const latlng = mapEl?.getAttribute("data-atlas-latlng") || "";
		const mapLink = latlng ? `https://www.google.com/maps?q=${latlng}` : "Not found";

		// Clean address (strip inner div)
		let address = "Not found";
		const addressDiv = mapEl?.parentElement?.querySelector("button > div");
		if (addressDiv) {
			address = [...addressDiv.childNodes]
				.filter((n) => n.nodeType === Node.TEXT_NODE)
				.map((n) => n.textContent.trim())
				.join(" ")
				.trim();
		}

		resultEl.innerHTML = `
      <strong>Name:</strong> <a href="${origUrl}" target="_blank">${name}</a>
      <strong>Rating:</strong> ${rating}
      <strong>Address:</strong> ${address}
      <strong>Map Link:</strong> <a href="${mapLink}" target="_blank">${mapLink}</a>
      <strong>Check-in:</strong> ${checkIn || "Not specified"}
      <strong>Check-out:</strong> ${checkOut || "Not specified"}
      <strong>Rooms:</strong> ${rooms || "Not specified"}
      <strong>Adults:</strong> ${adults || "Not specified"}
      <strong>Children:</strong> ${children || "Not specified"}
      <strong>URL:</strong> <a href="${url}" target="_blank">${url}</a>
    `;

		// === Extract Images ===
		let images = [];
		const galleryDiv = doc.querySelector(`div[aria-label="Photo gallery for ${name}"]`);
		if (galleryDiv) {
			images = [...galleryDiv.querySelectorAll("img")].filter((img) => img.alt?.trim());
		}

		for (const img of images) {
			const src = img.src;
			const alt = img.alt?.trim();
			if (!alt) continue;

			await new Promise((resolve) => {
				const tempImg = new Image();
				tempImg.crossOrigin = "anonymous";
				tempImg.src = src;

				const timeout = setTimeout(() => {
					console.warn("Timeout loading:", src);
					resolve();
				}, 3000);

				tempImg.onload = () => {
					clearTimeout(timeout);
					if (tempImg.naturalWidth >= 300) {
						const li = document.createElement("li");
						li.classList.add("item");
						li.innerHTML = `<img src="${src}" class="item-img" alt="${alt}"><div class="item-text">${alt}</div>`;
						imageList.appendChild(li);
					}
					resolve();
				};

				tempImg.onerror = () => {
					clearTimeout(timeout);
					console.warn("Image failed:", src);
					resolve();
				};
			});
		}
	} catch (err) {
		console.error(err);
		resultEl.textContent = "Failed to load the information. Please check the URL and try again.";
	}
});