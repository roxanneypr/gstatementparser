---
title: How to Open Your GCash Statement in Google Sheets
description: "Convert your GCash transaction history PDF and import it into Google Sheets with dates and peso amounts that sort, filter and add up correctly."
publishedDate: 2026-10-29
draft: false
related:
  - gcash-statement-to-excel-guide
  - track-gcash-income-freelancers-online-sellers
---

<!-- Search intent: "gcash pdf to google sheets", "gcash statement google sheets". -->

Google Sheets can't read a password-protected PDF directly, but it imports Excel and CSV files
perfectly. Here's the quickest way to get your GCash transactions into a sheet.

## Step 1: Convert the PDF

1. Open the [GCash statement converter](/).
2. Press **Choose your statement**, pick your Transaction History PDF, and type its password
   when asked.
3. Check the summary, then press **Download Excel** or **Download CSV**.

The conversion happens on your device. Your PDF is never uploaded.

## Step 2: Import into Google Sheets (computer)

1. Go to [sheets.google.com](https://sheets.google.com) and open a blank spreadsheet.
2. Choose **File → Import → Upload** and select the file you downloaded.
3. Choose whether to create a new spreadsheet or insert new sheets into the current one, then
   select **Import data**.

If you upload the Excel file, you get both the **Transactions** and **Summary** sheets.

## On a phone

The **File → Import** menu above is part of Google Sheets on a computer. If you converted your
statement on your phone, the downloaded Excel file is in your phone's downloads. You can open it
there with a spreadsheet app, or import it into Google Sheets later from a computer using the steps
above.

## Excel or CSV: which should I use?

- **Excel (.xlsx):** keeps peso formatting, real dates, the frozen header row, filters and the
  Summary sheet. Best for most people.
- **CSV:** plain text with one transaction per line. Good for importing into accounting tools or
  combining with other data.

## Make sure dates and amounts work

- Dates are real dates, so you can sort and filter by month.
- Debit, Credit and Balance are numbers, so `SUM` works. For example, `=SUM(E:E)` adds up all
  debits (money out) on the Transactions sheet.
- If amounts show as text after importing a CSV, check your spreadsheet locale in
  **File → Settings** and import again.

## Useful next steps

- Use the **Category** column (Food, Transport, Bills, Money received…) that the converter fills in,
  and a pivot table to total each category per month. The
  [budget guide](/blog/gcash-spending-tracker-excel) shows how.
- See [how freelancers and online sellers track GCash income](/blog/track-gcash-income-freelancers-online-sellers)
  for a ready-made layout.
