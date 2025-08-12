// ===== Config =====
const PROXY_URL = "https://html-proxy-18268740473.europe-west1.run.app";
const MAX_IMAGES = 8;
const FETCH_TIMEOUT_MS = 10000;
const IMG_TIMEOUT_MS = 3000;

// ===== Fetch helpers (with timeout) =====
const fetchWithTimeout = async (url, ms = FETCH_TIMEOUT_MS) => {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), ms);
	try {
		return await fetch(url, { signal: controller.signal, cache: "no-store" });
	} catch (err) {
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

const fetchViaProxy = async (targetUrl) => {
	const ep = `${PROXY_URL}?url=${encodeURIComponent(targetUrl)}&t=${Date.now()}`;
	const r = await fetchWithTimeout(ep);
	if (!r.ok) throw new Error("proxy " + r.status);
	return r.text();
};

const fetchHTML = async (targetUrl) => {
	// proxy only
	return fetchViaProxy(targetUrl);
};

// ===== Utils =====
const outerTextOnly = (el) =>
	el
		? [...el.childNodes]
				.filter((n) => n.nodeType === Node.TEXT_NODE)
				.map((n) => n.textContent.trim())
				.join(" ")
				.trim()
		: "Not found";

const getParams = (urlStr) => {
	try {
		const u = new URL(urlStr);
		const p = u.searchParams;
		return {
			checkIn: p.get("checkin"),
			checkOut: p.get("checkout"),
			rooms: p.get("no_rooms"),
			adults: p.get("group_adults") || p.get("no_adults"),
			children: p.get("group_children") || p.get("no_children"),
		};
	} catch {
		return {};
	}
};

// ===== DOM builders =====
const buildInfoBlock = ({ origUrl, name, rating, address, mapLink, params }) => {
	const div = document.createElement("div");
	div.classList.add("acc-info");
	div.innerHTML = `
    <div class="acc-line"><strong>Name:</strong> <a href="${origUrl}" target="_blank" rel="noopener">${name}</a></div>
    <div class="acc-line"><strong>Rating:</strong> ${rating}</div>
    <div class="acc-line"><strong>Address:</strong> ${address}</div>
    <div class="acc-line"><strong>Map Link:</strong> ${mapLink !== "Not found" ? `<a href="${mapLink}" target="_blank" rel="noopener">${mapLink}</a>` : "Not found"}</div>
    <div class="acc-line"><strong>Check-in:</strong> ${params.checkIn || "Not specified"}</div>
    <div class="acc-line"><strong>Check-out:</strong> ${params.checkOut || "Not specified"}</div>
    <div class="acc-line"><strong>Rooms:</strong> ${params.rooms || "Not specified"}</div>
    <div class="acc-line"><strong>Adults:</strong> ${params.adults || "Not specified"}</div>
    <div class="acc-line"><strong>Children:</strong> ${params.children || "Not specified"}</div>
  `;
	return div;
};

const buildSliderBlock = () => {
	const wrap = document.createElement("div");
	wrap.classList.add("images-slider-wrap");

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
	wrap.appendChild(swiperEl);
	wrap.appendChild(loadingEl);

	return { wrap, swiperEl, wrapperEl, paginationEl, loadingEl };
};

// ===== Main click =====
document.getElementById("getHotelDataBtn").addEventListener("click", async () => {
	const btn = document.getElementById("getHotelDataBtn");
	const input = document.getElementById("urlInput");
	const statusEl = document.getElementById("status");
	const listEl = document.getElementById("list");

	if (btn.disabled) return;
	btn.disabled = true;
	statusEl.textContent = "Loading...";

	const inputUrl = input.value.trim();
	if (!inputUrl || !/^https?:\/\//i.test(inputUrl)) {
		alert("Enter a valid URL that starts with http or https");
		btn.disabled = false;
		return;
	}

	const params = getParams(inputUrl);

	try {
		// 1) Fetch & parse HTML
		const cleanUrl = inputUrl.replace(/(\.html).*/i, "$1"); // keep only .../xxx.html
		const html = await fetchHTML(cleanUrl);
		const doc = new DOMParser().parseFromString(html, "text/html");

		// 2) Extract info
		const name = doc.querySelector("h2.pp-header__title")?.innerText.trim() || "Not found";
		const rating = doc.querySelector("[data-review-score]")?.getAttribute("data-review-score") || "Not found";
		const mapEl = doc.querySelector("[data-atlas-latlng]");
		const latlng = mapEl?.getAttribute("data-atlas-latlng") || "";
		const mapLink = latlng ? `https://www.google.com/maps?q=${latlng}` : "Not found";
		const address = outerTextOnly(mapEl?.parentElement?.querySelector("button > div")) || "Not found";

		// 3) Build container + show info immediately
		const accItem = document.createElement("div");
		accItem.classList.add("acc-item");

		const info = buildInfoBlock({ origUrl: inputUrl, name, rating, address, mapLink, params });
		const { wrap, swiperEl, wrapperEl, paginationEl, loadingEl } = buildSliderBlock();

		accItem.appendChild(info);
		accItem.appendChild(wrap);
		listEl.appendChild(accItem);

		statusEl.textContent = "";

		// 4) Collect first MAX_IMAGES images from gallery
		let images = [];
		const galleryDiv = doc.querySelector('div[aria-label^="Photo gallery"]') || doc.querySelector('div[aria-label*="Photo gallery"]');
		if (galleryDiv) {
			images = [...galleryDiv.querySelectorAll("img")].filter((i) => i.alt?.trim()).slice(0, MAX_IMAGES);
		}

		// 5) Lazy-init Swiper when first slide is added
		let swiperInstance = null;
		const ensureSwiper = () => {
			if (!swiperInstance) {
				swiperInstance = new Swiper(swiperEl, {
					loop: true,
					pagination: { el: paginationEl },
				});
			}
		};

		// 6) Load images sequentially (timeout per image)
		for (const img of images) {
			const src = img.src;
			const alt = img.alt?.trim();
			if (!alt) continue;

			// eslint-disable-next-line no-await-in-loop
			await new Promise((resolve) => {
				const t = new Image();
				t.crossOrigin = "anonymous";
				t.src = src;

				const to = setTimeout(() => resolve(), IMG_TIMEOUT_MS);

				t.onload = () => {
					clearTimeout(to);
					if (t.naturalWidth >= 300) {
						const slide = document.createElement("div");
						slide.classList.add("swiper-slide");
						slide.innerHTML = `<img src="${src}" alt="${alt}" class="slide-img">`;
						wrapperEl.appendChild(slide);

						if (wrapperEl.children.length === 1) {
							loadingEl.remove();
							ensureSwiper();
						}
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

		// 7) If none loaded, say so
		if (!wrapperEl.children.length) {
			loadingEl.textContent = "No images.";
		}
	} catch (err) {
		console.error(err);
		statusEl.classList.add("error");
		statusEl.textContent = err.code === "ETIMEDOUT" ? "Request timed out after 10 seconds. Try again." : "Failed to load the information. Please check the URL and try again";
	} finally {
		btn.disabled = false;
	}
});
