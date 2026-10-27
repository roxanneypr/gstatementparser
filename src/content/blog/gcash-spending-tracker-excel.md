---
title: "Track Your GCash Spending in Excel: A Simple Budget"
description: "Turn your GCash transaction history into a monthly budget in Excel or Google Sheets: add categories, then total them with SUMIFS or a pivot table."
publishedDate: 2026-10-27
draft: false
related:
  - gcash-statement-to-excel-guide
---

<!-- Search intent: "gcash expense tracker excel", "track gcash spending", "gcash budget spreadsheet". -->
<!-- No GCash-specific facts (menu paths, fees, limits) in this post; Excel/Sheets steps only. -->

If most of your money moves through GCash, your transaction history already shows where it went.
You just need it in a spreadsheet. This guide turns it into a simple monthly budget: what you spent
on food, bills, transport and everything else.

It takes about 15 minutes the first time and works in Excel or Google Sheets.

## Step 1: Get your transactions into a spreadsheet

Convert your GCash Transaction History PDF with the free [GCash statement converter](/). It runs
on your device, so nothing is uploaded. The [step-by-step guide](/blog/gcash-statement-to-excel-guide)
shows each screen.

Open the Excel file. The **Transactions** sheet has one row per transaction:

| Column | What it means                                   |
| ------ | ----------------------------------------------- |
| Date   | A real date, so you can sort and filter by it   |
| Debit  | Money **out** of your wallet (what you spent)   |
| Credit | Money **in** (cash in, payments you received)   |

The **Summary** sheet already shows money in and out per month. The steps below break the
"money out" part into categories.

## Step 2: Add a Category column

In the first empty column to the right of **Notes**, type the heading **Category**. Then give each
row a short label, for example:

- Food
- Bills
- Transport
- Shopping
- Family
- Transfer (moving money between your own accounts)

Keep the list short. Six to ten categories is enough to see where your money goes.

**Fill many rows at once.** Turn on the filter (the Transactions sheet already has one), open the
**Description** filter and search for a shop or a person's name. Type the category in the first
visible row, then copy it down to the other visible rows. Clear the filter and repeat for the next
name.

**Don't count transfers as spending.** Money you send to your own bank account or another wallet
of yours isn't an expense. Label it **Transfer** so you can leave it out of your totals.

## Step 3: Total each category with SUMIFS

Make a new sheet called **Budget** and list your categories in column A, starting in A2. In B2,
enter:

```
=SUMIFS(Transactions!E:E, Transactions!J:J, A2)
```

Then copy it down. Column E is **Debit** and column J is your new **Category** column. If you put
Category somewhere else, change `J:J` to match.

To see a single month, add a date range. This totals March 2026:

```
=SUMIFS(Transactions!E:E, Transactions!J:J, A2, Transactions!A:A, ">="&DATE(2026,3,1), Transactions!A:A, "<"&DATE(2026,4,1))
```

For another month, change the two dates: the first day of the month, and the first day of the
next month.

The same formulas work in Google Sheets.

## Or: use a pivot table

A pivot table does the same totals without formulas, and splits them by month.

1. Click any cell in the Transactions sheet.
2. **Excel:** Insert → PivotTable. **Google Sheets:** Insert → Pivot table.
3. Put **Category** in Rows and **Debit** in Values (as a sum).
4. To split by month, put **Date** in Columns. In Excel, right-click a date and choose **Group →
   Months**. In Google Sheets, right-click a date and choose **Create pivot date group → Month**.

## Step 4: Set a budget and compare

Next to each category total, add the amount you want to spend per month. A third column with
`=C2-B2` shows how much you have left (or how much you went over). That's your budget.

Each month, convert your new statement and paste its rows under the old ones (or into a new
Transactions sheet) to keep the history going.

## A note on rows with a ⚠ sign

If a row's **Balance check** column isn't empty, its running balance on the statement doesn't
follow from the row before. The figures are exactly as GCash printed them. Check those rows in the
GCash app before you count them, so your budget isn't off by a payment that didn't go through.

## Keep the file private

Your spreadsheet holds names, numbers and amounts from your wallet. Keep it on your own device or
in your own cloud storage, and think twice before sharing it in a group chat.
