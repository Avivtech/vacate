// Helpers
const fetchWithTimeout = async (url, ms = 10000) => {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), ms);
	try {
		const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
		return res;
	} catch (err) {
		// Normalize AbortError -> our own code
		if (err.name === "AbortError") {
			const e = new Error("Request timed out");
			e.code = "ETIMEDOUT";
			throw e;
		}
		throw err;
	} finally {
		clearTimeout(id);
	}
};

const fetchViaAllOriginsGet = async (url) => {
	const ep = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&nocache=${Date.now()}`;
	const r = await fetchWithTimeout(ep, 10000);
	if (!r.ok) throw new Error("allorigins/get " + r.status);
	const data = await r.json();
	if (!data?.contents) throw new Error("missing contents");
	return data.contents;
};

const fetchViaAllOriginsRaw = async (url) => {
	const ep = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&nocache=${Date.now()}`;
	const r = await fetchWithTimeout(ep, 10000);
	if (!r.ok) throw new Error("allorigins/raw " + r.status);
	return r.text();
};

const fetchHTML = async (url) => {
	try {
		return await fetchViaAllOriginsGet(url);
	} catch (e1) {
		// If /get timed out, try /raw once; otherwise rethrow
		if (e1.code === "ETIMEDOUT") {
			try {
				return await fetchViaAllOriginsRaw(url);
			} catch (e2) {
				throw e2;
			}
		}
		// Non-timeout error on /get -> try /raw as fallback
		try {
			return await fetchViaAllOriginsRaw(url);
		} catch (e2) {
			throw e2;
		}
	}
};

const outerTextOnly = (el) =>
	el
		? [...el.childNodes]
				.filter((n) => n.nodeType === Node.TEXT_NODE)
				.map((n) => n.textContent.trim())
				.join(" ")
				.trim()
		: "Not found";

document.getElementById("getHotelDataBtn").addEventListener("click", async () => {
	console.log("Fetching hotel data...");
	const btn = document.getElementById("getHotelDataBtn");
	const input = document.getElementById("urlInput");
	const statusEl = document.getElementById("status");
	const listEl = document.getElementById("list");

	if (btn.disabled) return; // already running
	btn.disabled = true;
	statusEl.textContent = "Loading...";

	const origUrl = input.value.trim();
	let url = origUrl;

	// Basic validation
	if (!url || !/^https?:\/\//i.test(url)) {
		alert("Enter a valid URL that starts with http or https");
		btn.disabled = false;
		return;
	}

	// Params from original URL
	let checkIn, checkOut, rooms, adults, children;
	try {
		const u = new URL(origUrl);
		const p = u.searchParams;
		checkIn = p.get("checkin");
		checkOut = p.get("checkout");
		rooms = p.get("no_rooms");
		adults = p.get("group_adults") || p.get("no_adults");
		children = p.get("group_children") || p.get("no_children");
	} catch {}

	try {
		const html = await fetchHTML(url);
		const doc = new DOMParser().parseFromString(html, "text/html");

		// --- Extract text info
		const name = doc.querySelector("h2.pp-header__title")?.innerText.trim() || "Not found";
		const rating = doc.querySelector("[data-review-score]")?.getAttribute("data-review-score") || "Not found";
		const mapEl = doc.querySelector("[data-atlas-latlng]");
		const latlng = mapEl?.getAttribute("data-atlas-latlng") || "";
		const mapLink = latlng ? `https://www.google.com/maps?q=${latlng}` : "Not found";
		const address = outerTextOnly(mapEl?.parentElement?.querySelector("button > div")) || "Not found";

		// --- Build DOM nodes
		const accItem = document.createElement("div");
		accItem.classList.add("acc-item");
		const accInfo = document.createElement("div");
		accInfo.classList.add("acc-info");
		accInfo.innerHTML = `
        <div class="acc-line"><strong>Name:</strong> <a href="${origUrl}" target="_blank" rel="noopener">${name}</a></div>
        <div class="acc-line"><strong>Rating:</strong> ${rating}</div>
        <div class="acc-line"><strong>Address:</strong> ${address}</div>
        <div class="acc-line"><strong>Map Link:</strong> ${mapLink !== "Not found" ? `<a href="${mapLink}" target="_blank" rel="noopener">${mapLink}</a>` : "Not found"}</div>
        <div class="acc-line"><strong>Check-in:</strong> ${checkIn || "Not specified"}</div>
        <div class="acc-line"><strong>Check-out:</strong> ${checkOut || "Not specified"}</div>
        <div class="acc-line"><strong>Rooms:</strong> ${rooms || "Not specified"}</div>
        <div class="acc-line"><strong>Adults:</strong> ${adults || "Not specified"}</div>
        <div class="acc-line"><strong>Children:</strong> ${children || "Not specified"}</div>
        <div class="acc-line"><strong>URL:</strong> <a href="${url}" target="_blank" rel="noopener">${url}</a></div>
    `;

		// Swiper container (unique per item)
		const sliderWrap = document.createElement("div");
		sliderWrap.classList.add("images-slider-wrap");

		const swiperEl = document.createElement("div");
		swiperEl.classList.add("swiper");

		const wrapperEl = document.createElement("div");
		wrapperEl.classList.add("swiper-wrapper");

		const paginationEl = document.createElement("div");
		paginationEl.classList.add("swiper-pagination");

		const loadingEl = document.createElement("div");
		loadingEl.classList.add("images-loading");
		loadingEl.textContent = "Loading images…";

		swiperEl.appendChild(wrapperEl);
		swiperEl.appendChild(paginationEl);
		sliderWrap.appendChild(swiperEl);
		sliderWrap.appendChild(loadingEl);

		accItem.appendChild(accInfo);
		accItem.appendChild(sliderWrap);
		listEl.appendChild(accItem);

		statusEl.textContent = "";

		// Extract images
		let images = [];
		let galleryDiv = doc.querySelector('div[aria-label^="Photo gallery"]') || doc.querySelector('div[aria-label*="Photo gallery"]');
		if (galleryDiv) {
			images = [...galleryDiv.querySelectorAll("img")].filter((i) => i.alt?.trim()).slice(0, 6); // limit to first 6
		}

		// Lazy-init Swiper on first slide
		let swiperInstance = null;
		const ensureSwiper = () => {
			if (!swiperInstance) {
				swiperInstance = new Swiper(swiperEl, {
					loop: true,
					pagination: { el: paginationEl },
				});
			}
		};

		// Load images sequentially with timeout
		for (const img of images) {
			const src = img.src;
			const alt = img.alt?.trim();
			if (!alt) continue;

			// eslint-disable-next-line no-await-in-loop
			await new Promise((resolve) => {
				const t = new Image();
				t.crossOrigin = "anonymous";
				t.src = src;

				const to = setTimeout(() => resolve(), 3000);

				t.onload = () => {
					clearTimeout(to);
					if (t.naturalWidth >= 300) {
						const slide = document.createElement("div");
						slide.classList.add("swiper-slide");
						slide.innerHTML = `<img src="${src}" alt="${alt}" class="slide-img">`;
						wrapperEl.appendChild(slide);

						// First valid image -> init swiper & hide loading text
						if (wrapperEl.children.length === 1) {
							loadingEl.remove();
							ensureSwiper();
						}
						// Update swiper when new slides come in
						if (swiperInstance) swiperInstance.update();
					}
					resolve();
				};
				t.onerror = () => {
					clearTimeout(to);
					resolve();
				};
			});
		}

		// If none loaded, remove slider / loading placeholder
		if (!wrapperEl.children.length) {
			loadingEl.textContent = "No images.";
			// or: swiperEl.remove(); loadingEl.remove();
		}

		statusEl.textContent = "";
	} catch (err) {
		console.error(err);
		statusEl.classList.add("error");
		statusEl.textContent = err.code === "ETIMEDOUT" ? "Request timed out after 10 seconds. Try again." : "Failed to load the information. Please check the URL and try again";
	} finally {
		btn.disabled = false;
	}
});
