import express from "express";
import { chromium } from "playwright";

const app = express();

// Simple CORS (tighten in prod)
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*"); // replace with your domain
	res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key");
	if (req.method === "OPTIONS") return res.status(204).send("");
	next();
});

app.get("/", async (req, res) => {
	const target = (req.query.url || "").toString().trim();
	if (!target) return res.status(400).send('Missing "url" query param');

	try {
		const browser = await chromium.launch({
			args: ["--no-sandbox", "--disable-dev-shm-usage"],
			headless: true,
		});
		const ctx = await browser.newContext({
			userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			locale: "en-US",
		});
		const page = await ctx.newPage();

		// Optional: send a referer; some WAFs like it
		await page.route("**/*", async (route) => {
			const headers = {
				...route.request().headers(),
				referer: "https://www.google.com/",
			};
			route.continue({ headers });
		});

		// Go and wait for network to settle (JS challenge completes)
		const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45000 });

		// Give the challenge a moment to set cookies/tokens and redirect
		await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
		// Safety: max 8s extra for challenge loops
		await page.waitForTimeout(8000);

		const html = await page.content();
		await browser.close();

		// Proxy original status if available
		const status = resp?.status() || 200;
		res.status(status).set("Content-Type", "text/html; charset=utf-8").send(html);
	} catch (e) {
		res.status(502).send(`Browser proxy error: ${e.message}`);
	}
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Browser proxy listening on", port));
