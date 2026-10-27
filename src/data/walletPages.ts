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
];
