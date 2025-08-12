import express from "express";
import { chromium } from "playwright";

const app = express();

app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
	if (req.method === "OPTIONS") return res.status(204).send("");
	next();
});

let browserPromise;
async function getBrowser() {
	if (!browserPromise) {
		browserPromise = chromium.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-dev-shm-usage"],
		});
	}
	return browserPromise;
}

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("/", async (req, res) => {
	const target = (req.query.url || "").toString().trim();
	if (!target) return res.status(400).send('Missing "url" query param');

	// Tunables
	const opTimeoutMs = Math.min(parseInt(req.query.to || "15000", 10), 120000);
	const waitUntil = req.query.nav === "networkidle" ? "networkidle" : "domcontentloaded";
	const extraWait = Math.min(parseInt(req.query.extraWait || "6000", 10), 30000);
	const assetsMode = req.query.assets === "all" ? "all" : "lite";

	let done = false,
		timer;
	const timeoutKill = () => {
		if (!done) {
			done = true;
			res.status(504).send("Browser proxy timeout");
		}
	};
	timer = setTimeout(timeoutKill, opTimeoutMs);

	let ctx, page;
	try {
		const browser = await getBrowser();
		ctx = await browser.newContext({
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			locale: "en-US",
			viewport: { width: 1280, height: 1800 },
			extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
		});
		page = await ctx.newPage();

		// Intercept (lite blocks heavy assets)
		await page.route("**/*", async (route) => {
			const req2 = route.request();
			const headers = { ...req2.headers(), referer: "https://www.google.com/" };
			if (assetsMode === "lite") {
				const rt = req2.resourceType();
				if (rt === "image" || rt === "media" || rt === "font") return route.abort();
			}
			route.continue({ headers });
		});

		// Navigation with its own cap (smaller than opTimeoutMs)
		const navTimeout = Math.max(8000, Math.min(opTimeoutMs - 2000, 45000));
		const resp = await page.goto(target, { waitUntil, timeout: navTimeout });

		if (waitUntil !== "networkidle") {
			// Try to settle a bit if we didn't wait for network idle
			await page.waitForLoadState("networkidle", { timeout: Math.min(20000, opTimeoutMs / 2) }).catch(() => {});
		}

		// Extra grace for WAF token/cookie churn
		if (extraWait > 0) {
			await page.waitForTimeout(Math.min(extraWait, Math.max(0, opTimeoutMs - 2000))).catch(() => {});
		}

		const html = await page.content();
		const status = resp?.status?.() || 200;

		if (!done) {
			done = true;
			clearTimeout(timer);
			res.status(status).set("Content-Type", "text/html; charset=utf-8").send(html);
		}
	} catch (e) {
		if (!done) {
			done = true;
			clearTimeout(timer);
			console.error("Proxy error:", e);
			res.status(502).send(`Browser proxy error: ${e.message}`);
		}
	} finally {
		try {
			await page?.close();
		} catch {}
		try {
			await ctx?.close();
		} catch {}
	}
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Browser proxy listening on", port));
