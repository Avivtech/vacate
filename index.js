import express from "express";
import { chromium } from "playwright";

const app = express();

// CORS (tighten in prod)
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*"); // TODO: set your domain
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
	if (req.method === "OPTIONS") return res.status(204).send("");
	next();
});

// Reuse browser per instance
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

// Healthcheck
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("/", async (req, res) => {
	const target = (req.query.url || "").toString().trim();
	if (!target) return res.status(400).send('Missing "url" query param');

	let ctx, page;
	try {
		const browser = await getBrowser();
		ctx = await browser.newContext({
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			locale: "en-US",
			viewport: { width: 1280, height: 1800 },
		});
		page = await ctx.newPage();

		// Light request interception: keep HTML/JS/CSS, skip heavy assets
		await page.route("**/*", async (route) => {
			const req = route.request();
			const resourceType = req.resourceType();
			const headers = { ...req.headers(), referer: "https://www.google.com/" };

			if (["image", "media", "font"].includes(resourceType)) {
				return route.abort();
			}
			return route.continue({ headers });
		});

		const resp = await page.goto(target, {
			waitUntil: "domcontentloaded",
			timeout: 45000,
		});

		// Let WAF JS/token dance finish
		await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
		await page.waitForTimeout(6000);

		// If still on a challenge page, you’ll see that HTML here
		const html = await page.content();
		const status = resp?.status() || 200;

		res.status(status).set("Content-Type", "text/html; charset=utf-8").send(html);
	} catch (e) {
		console.error("Proxy error:", e);
		res.status(502).send(`Browser proxy error: ${e.message}`);
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
