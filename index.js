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

	const statusEl = document.getElementById("status");
	statusEl.textContent = "Loading...";

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

		const accItem = document.createElement("div");
		const accInfo = document.createElement("div");
		accItem.classList.add("acc-item");
		accInfo.classList.add("acc-info");
		accItem.appendChild(accInfo);
		const imagesSlider = document.createElement("div");
		imagesSlider.classList.add("swiper");
		accItem.appendChild(imagesSlider);
		const swiperWrapper = document.createElement("div");
		swiperWrapper.classList.add("swiper-wrapper");
		imagesSlider.appendChild(swiperWrapper);
		const swiperPagination = document.createElement("div");
		swiperPagination.classList.add("swiper-pagination");
		imagesSlider.appendChild(swiperPagination);

		accInfo.innerHTML = `
      <div class="result-line"><strong>Name:</strong> <a href="${origUrl}" target="_blank">${name}</a><div><strong>Rating:</strong> ${rating}</div></div>
      <div class="result-line"><strong>Address:</strong> ${address}</div>
      <div class="result-line"><strong>Map Link:</strong> <a href="${mapLink}" target="_blank">${mapLink}</a></div>
      <div class="result-line"><strong>Check-in:</strong> ${checkIn || "Not specified"}</div>
      <div class="result-line"><strong>Check-out:</strong> ${checkOut || "Not specified"}</div>
      <div class="result-line"><strong>Rooms:</strong> ${rooms || "Not specified"}</div>
      <div class="result-line"><strong>Adults:</strong> ${adults || "Not specified"}</div>
      <div class="result-line"><strong>Children:</strong> ${children || "Not specified"}</div>
      <div class="result-line"><strong>URL:</strong> <a href="${url}" target="_blank">${url}</a></div>
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
						const slide = document.createElement("div");
						slide.classList.add("swiper-slide");
						slide.innerHTML = `<img src="${src}" alt="${alt}" class="slide-img">`;
						swiperWrapper.appendChild(slide);
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

		const swiper = new Swiper(".swiper", {
			pagination: {
				el: ".swiper-pagination",
			},
		});
	} catch (err) {
		console.error(err);
		statusEl.classList.add("error");
		statusEl.textContent = "Failed to load the information. Please check the URL and try again.";
	}
});
