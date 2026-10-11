# Contractor Profit Toolkit 1.2

## Release folder
- `deliverables/Contractor_Profit_Toolkit_Package.zip`: customer download; blank + fictional example XLSX, PDF guide, internal-use license.
- `listing/`: three PNG listing illustrations, editable description and FAQ. Images show fictional figures, not customer results or spreadsheet UI screenshots.
- `source/`: original supplied workbook preserved, editable build/test/package Python and guide Markdown.
- `qa/`: complete formula inventory and recalculated scenario results.

## Rebuild (maintainers only)
Python with openpyxl, reportlab and Pillow; LibreOffice for recalculation.
Run `python source/build.py`, `python source/test_workbook.py`, then `python source/package.py` from this folder. Customers need none of those developer tools: only a local XLSX editor. No service startup or environment configuration is required.

## Formula audit
All 521 formula cells in each release workbook are inventoried in `qa/formula_inventory.json`. Formula families: 100 direct-cost extensions, 100 marked-up selling prices, 200 actual-cost extensions, 100 approved change contributions, 20 dashboard calculations and 1 incomplete-field warning. Repeated formulas were inspected across the full fixed ranges, including final rows.

Changes from the supplied candidate:
- Monetary line extensions, selling prices, change contributions and contingency round to cents.
- Zero-revenue margins are blank, not a misleading 0%.
- Job contribution labels distinguish attributable overhead from full company net profit.
- Receipts minus incurred costs explicitly is NOT cash flow; no expense-paid ledger exists.
- Approved changes with missing revenue/cost display blank contribution; dashboard warns on missing numeric fields.
- Blank production copy removes all fictional transactions; separate demo retains obvious fictional labels.
- Blue inputs, protected formulas (no password), dropdowns, numeric/date validation, filter headers, print setup and dashboard warnings.
- Negative payments permit refunds; negative changes permit contract deductions. No supplier-credit ledger added.

Arithmetic intentionally preserved: markup is cost-based; only approved changes affect contract/budget; actual change costs belong once in actual costs; budget overhead is not added again to actual costs; contingency does not increase quote or cost budget; sales-tax allowance remains informational. Reporting date does not filter transactions.

Limitations: fixed row capacities; paste can bypass validation; missing descriptions and arbitrary pasted values are not exhaustively validated; overhead requires user judgment; no completion forecast, accounting ledger, payroll/tax calculations or guaranteed business outcomes. No actual customers, sales or demand claims.

## Pricing recommendation
$19 USD one-time as an initial price experiment. Not a validated market price. No subscription or developer-operated delivery service is necessary once a digital-download marketplace is configured.

## Shortest launch process — not executed
A hosted digital-download listing is shorter than building a website. Gumroad is a candidate for uploading the existing ZIP, images and listing copy; this is not a verified recommendation for this operator. Official pricing/product/payout pages were attempted on 2026-10-11 but the environment returned proxy 403, so current fees, Moroccan operator eligibility and payout support remain unverified:
- https://gumroad.com/pricing
- https://gumroad.com/help/article/149-adding-a-product
- https://gumroad.com/help/article/260-your-payout-settings-page

Before choosing any marketplace, verify official operator eligibility, supported bank/payout method, identity requirements, current fees, tax handling and refund rules. Do not create an account solely on this unverified suggestion. Existing Lemon Squeezy merchant eligibility/live approval also remains unconfirmed; it is not a cleared sales channel.

Once a legitimate eligible channel is approved: supply real seller/support details and sales terms, upload the ZIP and three images, paste description/FAQ, set approved price, review a private draft, test automatic download fulfillment, and obtain publication approval. No accounts, checkout activation, listings or spending were performed in this task. A marketplace listing alone does not guarantee discoverability or sales.

## Release checklist
Completed assets are listed above; test results record the actual calculation engine and scenarios. Launch blockers: marketplace eligibility/payout verification; seller identity/support/refund terms; seller approval of price/license/listing/publication; final private marketplace upload/download check. Excel-specific UI verification remains unperformed and must not be advertised as certified compatibility.
