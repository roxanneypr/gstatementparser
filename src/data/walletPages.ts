// Landing pages for each supported wallet/bank besides GCash (the home page is the GCash page).
// One entry per page, rendered by src/pages/[walletPage].astro. Every page needs its own copy:
// no duplicated boilerplate between pages. Don't state wallet-specific facts (app menu paths,
// password formats, fees) unless they've been verified; example rows use real statement wording
// with fake amounts.
import type { ExampleRow } from "../components/Converter.astro";
import type { FaqItem } from "./faq.ts";

export interface WalletPage {
  /** URL path segment, e.g. "maya-statement-to-excel". */
  slug: string;
  /** Wallet name as people search for it. */
  wallet: string;
  /** ≤ 60 characters. */
  title: string;
  /** ≤ 155 characters. */
  description: string;
  /** 1200x630 share image under public/ (scripts/make-og-image.mjs <wallet> <path>). */
  ogImage: string;
  /** Headline before the grey "in seconds." */
  heading: string;
  lead: string;
  features: { title: string; text: string }[];
  faq: FaqItem[];
  exampleRows: ExampleRow[];
  /** Ticks under the example; set when the statement can't be checked against balances. */
  exampleChecks?: string[];
  sampleUrl: string;
}

const PRIVACY_ANSWER =
  "The PDF is opened and converted inside your browser, on your phone or computer. Your file, its password and your transactions are never sent to a server, and nothing is saved after you close the page.";

export const walletPages: WalletPage[] = [
  {
    slug: "maya-statement-to-excel",
    wallet: "Maya",
    title: "Maya Statement to Excel – Free & Private | WalletToExcel",
    description:
      "Convert your Maya Wallet statement PDF to Excel or CSV in seconds. Free, and private: your statement is processed on your device and never uploaded.",
    ogImage: "/og-maya.png",
    heading: "Maya statement to Excel,",
    lead: "Turn your Maya Wallet statement PDF into a clean, checked spreadsheet for Excel, Google Sheets or CSV. Free to use, no sign-up.",
    features: [
      {
        title: "Built for Maya statements",
        text: "Reads the Maya Wallet Statement of Account as printed: transaction type and details, reference IDs, amounts and running balances.",
      },
      {
        title: "Checked against the summary",
        text: "Rows are added up and compared with the account summary's total incoming and outgoing, and every running balance is checked. Gaps are pointed out, never changed.",
      },
      {
        title: "Ready for Excel and Sheets",
        text: "Real dates, peso amounts, filters and a monthly summary in one workbook. Free to use, no sign-up.",
      },
    ],
    faq: [
      {
        question: "Is my Maya statement uploaded anywhere?",
        answer: `No. ${PRIVACY_ANSWER}`,
      },
      {
        question: "My Maya PDF asks for a password. Which one?",
        answer:
          "Use the password that came with your statement from Maya. WalletToExcel can't recover, guess or remove a PDF password. It only uses the one you type, to open the file on your device.",
      },
      {
        question: "How are Maya descriptions shown?",
        answer:
          "Maya prints a transaction type, such as “Sent to bank” or “Purchased”, with its details on the line below. Both are kept in the Description column, for example “Sent to bank · Instapay Sending”, so you can filter by either.",
      },
      {
        question: "Can I open the result in Google Sheets?",
        answer:
          "Yes. Download the Excel or CSV file, then in Google Sheets choose File → Import → Upload. The Excel file gives you both the Transactions and Summary sheets.",
      },
    ],
    // Real Maya wording, fake amounts; balances add up.
    exampleRows: [
      ["Sep 1", "Purchased · Pay with PayMaya Wallet QR On Us", "−₱145.00", "₱14,855.00"],
      ["Sep 2", "Sent to bank · Instapay Sending", "−₱2,000.00", "₱12,855.00"],
      ["Sep 3", "Purchased · PWM Authorization", "−₱89.00", "₱12,766.00"],
      ["Sep 5", "Paid bill · Pay with PayMaya Wallet Bills Pay", "−₱1,850.75", "₱10,915.25"],
    ],
    sampleUrl: "/sample/sample-maya-statement.pdf",
  },
  {
    slug: "bpi-statement-to-excel",
    wallet: "BPI",
    title: "BPI Statement to Excel – Free & Private | WalletToExcel",
    description:
      "Convert your BPI account statement PDF to Excel or CSV. Real dates, debit and credit columns, checked totals. Free, and processed on your device.",
    ogImage: "/og-bpi.png",
    heading: "BPI statement to Excel,",
    lead: "Turn your BPI account statement PDF into a clean, checked spreadsheet for Excel, Google Sheets or CSV. Free to use, no sign-up.",
    features: [
      {
        title: "Built for BPI statements",
        text: "Reads the description, REF, details, debit, credit and balance columns as printed, from the beginning balance to the balance this statement.",
      },
      {
        title: "Real dates, not just “May 15”",
        text: "BPI prints dates without a year. The year is taken from the statement's period covered, so sorting and monthly totals work, even across New Year.",
      },
      {
        title: "Checked against the statement",
        text: "Rows are compared with the statement's total debit and total credit, and every running balance is checked. Gaps are pointed out, never changed.",
      },
    ],
    faq: [
      {
        question: "Is my BPI statement uploaded anywhere?",
        answer: `No. ${PRIVACY_ANSWER}`,
      },
      {
        question: "Which BPI statements work?",
        answer:
          "BPI account statements in PDF with the columns Date, Description, Ref, Details, Debit Amount, Credit Amount and Balance (tested with a payroll account statement). BPI credit card statements aren't supported yet.",
      },
      {
        question: "BPI dates have no year. How does that work?",
        answer:
          "The statement prints dates like “May 15”. WalletToExcel reads the year from the period covered at the top of the statement, so a statement from December to February gets the right year on every row. A date outside that period is flagged for you to check.",
      },
      {
        question: "Can I open the result in Google Sheets?",
        answer:
          "Yes. Download the Excel or CSV file, then in Google Sheets choose File → Import → Upload. The Excel file gives you both the Transactions and Summary sheets.",
      },
    ],
    // Real BPI wording, fake amounts; balances add up (same rows as the sample statement).
    exampleRows: [
      ["May 15", "Bizlink Payroll · BIZLINK", "+₱28,500.00", "₱36,950.25"],
      ["May 16", "InstaPay Transfer · TRANSFER TO OTHER BANK", "−₱5,000.00", "₱31,950.25"],
      ["May 16", "InstaPay Transfer Fee · TRANSFER TO OTHER BANK", "−₱25.00", "₱31,925.25"],
      ["May 18", "Purchase-MC @SAMPLE STORE", "−₱1,249.50", "₱30,675.75"],
    ],
    sampleUrl: "/sample/sample-bpi-statement.pdf",
  },
  {
    slug: "bdo-statement-to-excel",
    wallet: "BDO",
    title: "BDO Statement to Excel – Free & Private | WalletToExcel",
    description:
      "Convert your BDO Account Activities PDF to Excel or CSV. Real dates, money in and out in separate columns, oldest first. Free, processed on your device.",
    ogImage: "/og-bdo.png",
    heading: "BDO statement to Excel,",
    lead: "Turn your BDO Account Activities PDF into a clean spreadsheet for Excel, Google Sheets or CSV. Free to use, no sign-up.",
    features: [
      {
        title: "Built for BDO Account Activities",
        text: "Reads the Date, Reference, Description and Amount columns as printed, including references and descriptions that wrap onto a second line.",
      },
      {
        title: "Money in and out, oldest first",
        text: "Signed amounts become separate Debit and Credit columns, and rows are listed oldest first so monthly totals read naturally.",
      },
      {
        title: "Ready for Excel and Sheets",
        text: "Real dates, peso amounts, filters and a monthly summary in one workbook. Anything that can't be read confidently is flagged, never guessed.",
      },
    ],
    faq: [
      {
        question: "Is my BDO statement uploaded anywhere?",
        answer: `No. ${PRIVACY_ANSWER}`,
      },
      {
        question: "Which BDO file works?",
        answer:
          "The Account Activities PDF: it starts with “Exported date range” and lists Date, Reference, Description and Amount. Other BDO statements, such as credit card statements, aren't supported yet.",
      },
      {
        question: "Why isn't it checked against balances?",
        answer:
          "The Account Activities PDF lists amounts only, with no running balance, beginning balance or totals, so there's nothing from BDO to compare the rows with. Every row is still read exactly as printed, and anything unclear is flagged for you to check.",
      },
      {
        question: "What order are the rows in?",
        answer:
          "BDO lists the newest transaction first. The spreadsheet lists them oldest first, like a bank statement. To see the newest first, sort the Date column in Excel or Google Sheets.",
      },
    ],
    // Real BDO wording, fake amounts and references. No balance column: BDO doesn't print one.
    exampleRows: [
      ["Sep 2", "POS W/D SV SAMPLE STORE SAMPLE CITY POS", "−₱1,899.00"],
      ["Sep 5", "Payment via QRPH", "−₱642.75"],
      ["Sep 7", "Received from BDO Account", "+₱1,200.00"],
      ["Sep 9", "Sent via Instapay GXI ****5678", "−₱3,500.00"],
    ],
    exampleChecks: ["Every row read as printed", "Unclear rows flagged"],
    sampleUrl: "/sample/sample-bdo-statement.pdf",
  },
];
