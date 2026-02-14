# Shop Agent

Minimal frontend + API for an agent that **finds items via WebShop** (search) and returns recommendations with **links to each product on WebShop**. Items are not chosen from the local inventory CSV; the agent uses the **WebShop search API** to find products and optionally **Grok AI** to select/rank them.

## Quick start

1. **Start WebShop** (required for recommendations):

   ```bash
   # From WebShop-master/ (e.g. web_agent_site or repo root)
   # If you have the full WebShop data/indexes, run the Flask app (e.g. port 3000).
   # Otherwise the shop-agent will still call WebShop; the /api/search fallback uses data/tech_products.json.
   ```

2. **Start shop-agent**:

   ```bash
   # From shop-agent/
   npm install
   cd frontend && npm install && cd ..
   npm run dev
   ```

Open **http://localhost:5174**. Set your search prompt and click **Get agent recommendation**. Results come from WebShop search; each item includes a **View on WebShop** link.

## Features

- **Search bar** – Your prompt is sent to WebShop as the search query.
- **Add funds** – Card or Crypto; shown as “Converted to crypto — agent controls this balance.”
- **Live inventory** – Still loaded from `../data/synthetic_inventory_daily.csv` for the table; **recommendations do not use inventory**.
- **Get recommendation** – Backend calls **WebShop** `GET /api/search?q=<prompt>`, then optionally uses **Grok** to select/rank and add reasons. Returns:
  - `items`: `[{ asin, product_name, quantity, unit_price, reason, link }]`
  - `reasoning`: short explanation
- **Links** – Each item has a `link` to the product page on WebShop; the UI shows **View on WebShop**.

## API

- `GET /api/inventory` – Latest snapshot from CSV (for the inventory table).
- `POST /api/recommend` – Body: `{ prompt?, fundsCrypto? }`. Calls WebShop search, then returns `{ recommendation: { items, reasoning }, source, webshopQuery }`. Each `item` includes `link`.

## Config

- **`WEBSHOP_BASE_URL`** – WebShop base URL (default `http://localhost:3000`). The backend calls `${WEBSHOP_BASE_URL}/api/search?q=...`.
- **`GROK_API_KEY`** or **`XAI_API_KEY`** – If set, Grok selects from WebShop results and adds per-item reasons. Otherwise, top WebShop results are returned with a generic reason.
- **`GROK_MODEL`** – Default `grok-3-mini`.

## WebShop

WebShop must expose **`GET /api/search?q=<query>`** returning `{ results: [{ asin, product_name, price, category, link }], query }`. The WebShop Flask app in this repo has that route; it uses the main product index when available, or a fallback over `data/tech_products.json`.
