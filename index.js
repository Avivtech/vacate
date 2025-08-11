  // Helpers
  const fetchViaAllOriginsGet = async (url) => {
    const ep = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&nocache=${Date.now()}`;
    const r = await fetch(ep);
    if (!r.ok) throw new Error('allorigins/get ' + r.status);
    const data = await r.json();
    if (!data?.contents) throw new Error('missing contents');
    return data.contents;
  };

  const fetchViaAllOriginsRaw = async (url) => {
			const ep = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&nocache=${Date.now()}`;
			const r = await fetch(ep, { cache: "no-store" });
			if (!r.ok) throw new Error("allorigins/raw " + r.status);
			return r.text();
		};

		const fetchHTML = async (url) => {
			try {
				return await fetchViaAllOriginsGet(url);
			} catch {
				return await fetchViaAllOriginsRaw(url);
			}
		};
  
  const outerTextOnly = (el) =>
    el ? [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent.trim()).join(' ').trim() : 'Not found';

  document.getElementById("getHotelDataBtn").addEventListener("click", async () => {
    const input   = document.getElementById("urlInput");
    const statusEl = document.getElementById("status");
    const listEl   = document.getElementById("list");

    const origUrl = input.value.trim();
    let url = origUrl;

    // Basic validation
    if (!url || !/^https?:\/\//i.test(url)) {
      alert("Enter a valid URL that starts with http or https");
      return;
    }

    // Preserve user input; only clean the URL we fetch
    const htmlIdx = url.indexOf(".html");
    if (htmlIdx !== -1) url = url.substring(0, htmlIdx + 5);

    // Params from original URL
    let checkIn, checkOut, rooms, adults, children;
    try {
      const u = new URL(origUrl);
      const p = u.searchParams;
      checkIn  = p.get("checkin");
      checkOut = p.get("checkout");
      rooms    = p.get("no_rooms");
      adults   = p.get("group_adults")   || p.get("no_adults");
      children = p.get("group_children") || p.get("no_children");
    } catch {}

    statusEl.textContent = "Loading...";

    try {
      // Fetch + parse
      const html = await fetchHTML(url);
      const doc  = new DOMParser().parseFromString(html, "text/html");

      // --- Extract text info
      const name   = doc.querySelector("h2.pp-header__title")?.innerText.trim() || "Not found";
      const rating = doc.querySelector("[data-review-score]")?.getAttribute("data-review-score") || "Not found";
      const mapEl  = doc.querySelector("[data-atlas-latlng]");
      const latlng = mapEl?.getAttribute("data-atlas-latlng") || "";
      const mapLink = latlng ? `https://www.google.com/maps?q=${latlng}` : "Not found";
      const address = outerTextOnly(mapEl?.parentElement?.querySelector("button > div")) || "Not found";

      // --- Build DOM nodes
      const accItem = document.createElement("div");
      accItem.classList.add("acc-item");

      const accInfo = document.createElement("div");
      accInfo.classList.add("acc-info");
      accInfo.innerHTML = `
        <div class="result-line"><strong>Name:</strong> <a href="${origUrl}" target="_blank" rel="noopener">${name}</a></div>
        <div class="result-line"><strong>Rating:</strong> ${rating}</div>
        <div class="result-line"><strong>Address:</strong> ${address}</div>
        <div class="result-line"><strong>Map Link:</strong> ${mapLink !== "Not found" ? `<a href="${mapLink}" target="_blank" rel="noopener">${mapLink}</a>` : "Not found"}</div>
        <div class="result-line"><strong>Check-in:</strong> ${checkIn || "Not specified"}</div>
        <div class="result-line"><strong>Check-out:</strong> ${checkOut || "Not specified"}</div>
        <div class="result-line"><strong>Rooms:</strong> ${rooms || "Not specified"}</div>
        <div class="result-line"><strong>Adults:</strong> ${adults || "Not specified"}</div>
        <div class="result-line"><strong>Children:</strong> ${children || "Not specified"}</div>
        <div class="result-line"><strong>URL:</strong> <a href="${url}" target="_blank" rel="noopener">${url}</a></div>
      `;

      // Swiper container (unique per item)
      const swiperEl = document.createElement("div");
      swiperEl.classList.add("swiper");
      const wrapperEl = document.createElement("div");
      wrapperEl.classList.add("swiper-wrapper");
      const paginationEl = document.createElement("div");
      paginationEl.classList.add("swiper-pagination");
      swiperEl.appendChild(wrapperEl);
      swiperEl.appendChild(paginationEl);

      accItem.appendChild(accInfo);
      accItem.appendChild(swiperEl);
      listEl.appendChild(accItem);

      // --- Extract images (gallery-first, with a fallback)
      let images = [];
      let galleryDiv = doc.querySelector('div[aria-label^="Photo gallery"]') || doc.querySelector('div[aria-label*="Photo gallery"]');
      if (galleryDiv) images = [...galleryDiv.querySelectorAll("img")].filter(i => i.alt?.trim());

      // Load images with timeout; add slides if >= 300px
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
            }
            resolve();
          };
          t.onerror = () => { clearTimeout(to); resolve(); };
        });
      }

      // Init Swiper only if we actually added slides
      if (wrapperEl.children.length) {
        new Swiper(swiperEl, {
          loop: true,
          pagination: { el: paginationEl }
        });
      } else {
        // If no images, you can hide the slider element if you want:
        // swiperEl.remove();
      }

      statusEl.textContent = "";
    } catch (err) {
      console.error(err);
      statusEl.classList.add("error");
      statusEl.textContent = "Failed to load the information. Please check the URL and try again.";
    }
  });