---
title: "GCash Statement to Excel: Step-by-Step Guide"
description: "Convert your GCash transaction history PDF to an Excel file in under a minute, on your own device. What you get and how to read the accuracy checks."
publishedDate: 2026-10-26
draft: true
related:
  - how-to-download-gcash-transaction-history
  - open-gcash-statement-in-google-sheets
---

<!-- Search intent: "gcash statement to excel", "convert gcash pdf to excel". -->
<!-- Reviewer: screenshots must use the fake sample statement, never real data. -->

This guide shows how to turn your GCash Transaction History PDF into an Excel file with the free
[GCash statement converter](/). It works on phones and computers, and your statement is processed
on your device. Nothing is uploaded.

## What you need

- Your GCash Transaction History PDF. Don't have it yet? See
  [how to download your GCash transaction history](/guides/how-to-download-gcash-transaction-history).
- The PDF's password. See the [GCash statement password guide](/guides/gcash-statement-pdf-password).
- A modern browser such as Chrome, Safari, Edge or Firefox.

## Step 1: Choose your PDF

Open the [converter](/) and tap **Choose your GCash PDF**, or drag the file onto the box on a computer.

## Step 2: Enter the password and convert

Type the PDF password and press **Convert**. If the password is wrong, you'll be asked to try again.
The password is only used to open the file on your device, and it's cleared after converting.

## Step 3: Check the results

You'll see:

- **Totals:** number of transactions, money in, money out and net.
- **Accuracy checks:**
  - whether the totals match the statement's own Total Debit and Total Credit
  - whether every row's balance follows from the row before it
  - whether starting balance + money in − money out equals the ending balance
- **Rows to review:** transactions where the statement's running balance doesn't follow (for
  example, the balance didn't change after a payment). Your data is kept exactly as GCash printed
  it; these rows are pointed out so you can compare them with the GCash app.
- **Preview:** the first 50 transactions.

## Step 4: Download Excel or CSV

Press **Download Excel (.xlsx)**. The workbook has two sheets:

| Sheet        | What's in it                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Transactions | Date, time, description, reference no., debit, credit, balance, balance check, notes, with filters and a frozen header |
| Summary      | Period, starting and ending balance, totals, accuracy checks, and money in/out per month                               |

Prefer CSV? Press **Download CSV**. It opens in Excel, Google Sheets, Numbers and most accounting tools.

## Step 5: Open it

- **Excel:** open the downloaded file.
- **Google Sheets:** File → Import → Upload. See
  [opening your GCash statement in Google Sheets](/guides/open-gcash-statement-in-google-sheets).

## Troubleshooting

- **"This PDF is password-protected"**: type the password, then press Convert again.
- **"This PDF has no readable text"**: screenshots and scanned images can't be converted. Use the
  original PDF from GCash.
- **"This doesn't look like a GCash Transaction History PDF"**: only GCash statements are supported
  for now.
- **Some rows say "Balance didn't change"**: see Step 3. The figures come straight from your
  statement.

**TODO: verify** and add screenshots of each step, made with the fake sample statement only.
