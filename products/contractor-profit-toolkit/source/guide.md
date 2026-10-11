# Contractor Profit Toolkit | User Guide

## Start a job
Open Contractor_Profit_Toolkit.xlsx in a desktop spreadsheet editor. Enable editing if it opens in Protected View; never enable macros (there are none). Save a copy named for your project. The separate Example workbook contains entirely fictional numbers. Do not use it as a live job without clearing every input.

Edit blue cells only. Dark text identifies calculated values. Sheets are protected against accidental formula changes, without a password. Protection is not encryption. To customize, unprotect the sheet, but altered formulas are not covered by the supplied test results.

## Set up your project
Enter project/customer/ID and reporting date. Reporting date is a label, NOT a transaction cutoff: totals include ALL entered rows, including future-dated entries. To obtain an as-of report, remove later entries from a separate copy.

Budget overhead is project-attributable supervision, permits or allocated overhead not already included in the estimate. Actual overhead is incurred overhead not entered in the cost ledger. Never count a cost in both places. General company overhead, interest and income taxes are not automatically allocated. Labor unit cost should include applicable payroll burden if you want it included.

Customer sales tax is excluded from contract and payment figures; record amounts net of customer tax consistently. Include nonrecoverable purchase taxes in job costs. The setup sales-tax allowance is informational only and never affects totals. Contingency is a planning reserve, not an expense or revenue. Target margin is a contribution-margin benchmark after attributable overhead, not company net profit.

## Build the estimate
Enter description, category, quantity, unit cost and cost-based markup. Direct cost = quantity x unit cost, rounded to cents. Sell price = rounded direct cost x (1 + markup), rounded to cents. Blank markup means zero markup. For example: $1,000 cost with 25% markup produces $1,250 price and 20% margin. A desired 25% margin requires 33.3333% markup: markup = margin / (1 - margin).

Dashboard contract totals assume the base quote is accepted and enforceable. An unaccepted estimate is only a proposed price, not contracted revenue. Verify approvals separately.

Overhead and contingency are NOT automatically added to selling prices. Choose line markups sufficient to cover them and check the budgeted margin before quoting. No invoice or customer quote document is generated.

## Record actual costs
Enter each expense exactly once, with date, description, category, quantity, unit cost, reference and Base/Change classification. Amount is rounded quantity x unit cost. Use quantity 1 for a lump sum. Include approved AND unapproved change-work costs once incurred. Base/Change is a label and does not alter totals. This ledger records incurred costs, not payment dates. Enter positive costs; this release does not support supplier-credit entries directly. Net a supplier credit against its original cost and explain it in the reference, keeping a separate accounting audit trail.

## Track change orders
Select Pending, Approved or Rejected. Only Approved revenue and estimated costs affect contract/budget totals. Enter both figures, including zero when appropriate. Negative figures support deductive changes; document the adjustment. Contribution = revenue less estimated change cost, not actual profit. Record actual change expenses in Actual Costs only, never add estimated change expenses there again.

## Track payments
Enter cash actually received net of customer sales tax. Use a negative amount for a refund, with a reference. Do not enter unpaid invoices. Uncollected contract balance = contract revenue less net receipts. It includes unbilled work and retainage; it is not accounts receivable. Negative balance indicates an overpayment or contract-entry mismatch.

## Read the dashboard
Budgeted contribution = contract revenue - estimated base direct cost - approved estimated change cost - budget overhead. Budgeted margin divides that contribution by contract revenue.

Incurred-cost contribution = full contract revenue - actual direct cost - actual overhead. It is provisional: missing future costs can make an unfinished job look profitable. Zero revenue produces blank margins, not a 0% claim.

Receipts less incurred costs is NOT cash flow: costs might still be unpaid, and financing/taxes are excluded. Cost still available vs budget is not a forecast to complete. Contingency is calculated on estimated total cost and shown separately, not included in budget cost or contract revenue.

Entry warnings count missing numeric fields on described estimate/cost/payment rows and approved changes. Fix warnings before relying on totals. This does not detect every mistake: verify dates, duplicate entries, missing descriptions, classifications, negative adjustments and contract approval evidence yourself. Input validation can be bypassed by paste; paste values only into blue cells and recheck them.

## Capacity, compatibility and maintenance
Fixed capacities: 100 estimate lines, 200 actual-cost lines, 100 change orders and 100 payments per job. Do not insert extra rows; they may not be included in formulas. Duplicate the workbook for the next project. Keep backups and use encrypted storage for confidential information.

Standard XLSX formulas; no macros, subscriptions, Codex, internet, accounts or APIs are required for use. A local spreadsheet editor is required. Automated recalculation was tested in LibreOffice; Microsoft Excel and mobile interfaces have not been independently tested. Google Sheets conversion is not guaranteed. Desktop use is recommended.

If totals do not update, enable Automatic calculation in your editor and recalculate. If a formula is overwritten, recover a clean copy rather than guessing the formula. This is a management aid, not accounting, tax, legal, estimating or compliance advice. No outcomes or profits are guaranteed.
