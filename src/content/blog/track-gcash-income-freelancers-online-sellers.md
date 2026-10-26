---
title: Track GCash Income as a Freelancer or Online Seller
description: "Use your GCash transaction history to track client payments and sales in Excel or Google Sheets, with monthly totals you can actually use."
publishedDate: 2026-10-26
draft: true
related:
  - open-gcash-statement-in-google-sheets
  - gcash-statement-to-excel-guide
---

<!-- Search intent: "track gcash income", "gcash income freelancer", "online seller gcash records". -->
<!-- Reviewer: no tax or BIR rules may be stated without verification by a qualified source. -->

If clients and customers pay you through GCash, your transaction history is already a record of
your income. Turning it into a spreadsheet makes it easy to see what you earned each month and
which payments came from where.

## What you'll need

- Your GCash Transaction History PDF for the period (see
  [how to download it](/blog/how-to-download-gcash-transaction-history)).
- The [GCash statement converter](/) to turn it into Excel or CSV, on your device.
- Excel or Google Sheets.

## Step 1: Convert your statement

Convert the PDF and download the Excel file. The **Summary** sheet already shows money in and
money out per month.

## Step 2: Separate income from everything else

Not every incoming payment is income: transfers from your own bank, refunds and money from family
also show up as credits.

1. On the **Transactions** sheet, filter the **Credit** column to show non-empty values.
2. Add a column called **Type** and mark each credit: _Client payment_, _Sale_, _Own transfer_,
   _Refund_, _Personal_.
3. Add a **Client / Customer** column if you want totals per client.

## Step 3: Build monthly income totals

Create a pivot table:

- **Rows:** Date, grouped by month
- **Columns:** Type
- **Values:** SUM of Credit

Now you can see client income per month separately from transfers and refunds.

## Step 4: Track expenses the same way

Filter the **Debit** column and tag business costs (for example: supplies, shipping, ads,
internet, transport). Then subtract them from income to see a simple monthly profit.

## Step 5: Keep it going every month

- Convert each month's statement and paste the new rows below the old ones.
- Each statement has its own reference numbers, so you can spot duplicates by sorting on
  **Reference No.**
- Keep the original PDFs as your source records.

## Taxes and BIR

**TODO: verify** with a qualified source (BIR publications or a licensed accountant) before
writing anything about registration, bookkeeping requirements, or income tax for freelancers and
online sellers in the Philippines. Until then, recommend readers consult an accountant and avoid
stating any rules, rates or deadlines.

## Tips

- Check the **Balance check** column after converting. Rows marked "Balance didn't change" are
  worth comparing with your GCash app.
- Use a separate GCash account for business if you can. It makes your records much cleaner.
  **TODO: verify** whether GCash allows a separate business or merchant account for individuals.
