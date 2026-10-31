---
title: "Combine Several GCash Statements into One Excel File"
description: "Put months of GCash, Maya or bank statements into one Excel file: duplicates left out, spending by category and by month, and files for accounting apps."
publishedDate: 2026-10-31
draft: false
related:
  - gcash-spending-tracker-excel
  - why-track-your-money
---

<!-- Search intent: "combine gcash statements excel", "merge bank statements into one excel", "gcash transaction history multiple months". -->
<!-- Describes the converter's own features only: no GCash menu paths, passwords, fees or tax rules. -->

One month of transactions tells you what happened. Several months tell you what's normal: which
bills come back every month, whether food deliveries are creeping up, and how your income moves
over a quarter or a year.

Until now that meant converting each statement separately and copying the rows into one sheet by
hand. The free [statement converter](/) can now do it in one go. Here's how, plus a few other
things it does that you might have missed.

## Combine several statements in one go

**1. Get your statements as PDFs.** If you're not sure how, our guide shows
[how to download your GCash transaction history](/blog/how-to-download-gcash-transaction-history).

**2. Choose them all at once.** On the [converter](/), tap **Choose your statement** and select
several PDFs instead of one (on a computer you can also drag them all onto the box). You can
combine up to 24 statements at a time.

**3. Enter the password once.** If your statements are password-protected, type the password for
the first one. The converter tries the same password on the next file, so statements that share a
password open without asking again. The password is only kept in your browser's memory while the
files are read, then forgotten. If a file won't open, you can skip it and keep the rest.

**4. Check the list of statements.** The results show every statement in the file, with its
period. Forgot one? Use **Add another statement**. Added the wrong one? Remove it from the list.
Everything else updates straight away.

Like single statements, all of this happens on your device. Your PDFs aren't uploaded anywhere.

## Overlapping statements: duplicates are left out

If you downloaded March 1–31 and then March 15 to April 15, the second half of March is in both
files. Counted twice, it would make your spending look bigger than it was.

The converter spots rows that appear in two overlapping statements of the same account and counts
them once. It only does this when every detail of the row matches (date, description, reference
number, amount and balance), so two identical payments inside the same statement, like two rides
on the same day, are kept.

You're always told how many rows were left out, and the **Leave out duplicates** switch above the
transactions lets you include them again if you prefer.

The converter also tells you when something doesn't line up between statements: a gap in the
dates (for example, no statement covers April), or a month whose starting balance doesn't match
the previous month's ending balance. That usually means a statement is missing.

## Mix GCash, Maya and bank statements

You can combine statements from different accounts too, such as GCash, Maya and your BPI or BDO
account. Each row keeps the statement it came from, and a **Statement** filter in the results
shows one account at a time.

One thing to keep in mind: money you move between your own accounts shows up twice, once going
out of one account and once coming into the other. The converter reminds you of this when you mix
accounts, so you can leave those transfers out of your spending totals.

Statements from other banks are read too, as long as they're PDFs with a clear table of dates and
amounts. That reader is still in beta, so compare the totals with your PDF before relying on them.

## Your spending, sorted into categories

Every transaction gets a category automatically: Food, Transport, Bills, Shopping, Load, Money
sent, Salary and so on. When nothing fits, it says **Other** rather than guessing.

The results show money in and money out per category. Tap a category to see just those
transactions. If one is wrong, change it in the table: every row with the same description changes
with it, so fixing your landlord's transfer once fixes it for the whole year. Your changes stay on
your device and are not saved anywhere.

## What's in the Excel file

When you download the Excel file of several statements, you get:

- **Transactions:** every row in date order, with a **Category** column and a **Statement** column
  showing which file each row came from.
- **Summary:** totals for the whole period, money in and out per category, and a table with each
  statement's period, starting and ending balance, totals and whether its checks passed.
- **Spending by month:** money out per category for each month side by side, so you can see at a
  glance which categories are growing.

From there you can filter, sort or build a pivot table. Our
[Excel budget guide](/blog/gcash-spending-tracker-excel) shows how to total each category with a
formula.

## For bookkeeping: Xero, QuickBooks and OFX files

If you keep your books in accounting software, open **More formats** under the download buttons.
It makes files laid out for importing bank transactions:

- **Xero (.csv)**
- **QuickBooks Online (.csv)**
- **OFX bank file (.ofx)**, a standard format that many finance and accounting apps accept

Pick the date format your software uses (MM/DD/YYYY or DD/MM/YYYY). Accounting software imports
one bank account at a time, so if you combined several accounts, you choose which one to export.

As with any import, check the first few rows after importing (dates and money in or out) before
you reconcile. WalletToExcel isn't affiliated with Xero or Intuit.

## Try it with your last three months

Download your last three statements, choose them all on the [converter](/), and open the
**Spending by month** sheet. Three months side by side is usually enough to see where your money
really goes, and what's worth changing next month.
