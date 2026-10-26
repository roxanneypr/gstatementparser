// Compact home-page FAQ: rendered as plain HTML and as FAQPage JSON-LD from the same data.
// Do not state GCash-specific facts (menu paths, password formats, fees) without verifying them.

export interface FaqItem {
  question: string;
  answer: string;
  /** Optional "learn more" link, shown only if the target page exists in this build. */
  more?: { text: string; postSlug: string };
}

export const faq: FaqItem[] = [
  {
    question: "Is my statement uploaded anywhere?",
    answer:
      "No. The PDF is opened and converted inside your browser, on your phone or computer. Your file, its password and your transactions are never sent to a server, and nothing is saved after you close the page.",
  },
  {
    question: "What's the password for my GCash statement PDF?",
    answer:
      "Use the password that came with your statement from GCash. WalletToExcel can't recover, guess or remove a PDF password. It only uses the one you type, to open the file on your device.",
  },
  {
    question: "Can I open the result in Google Sheets?",
    answer:
      "Yes. Download the Excel or CSV file, then in Google Sheets choose File → Import → Upload. The Excel file gives you both the Transactions and Summary sheets.",
    more: { text: "Step-by-step guide", postSlug: "gcash-statement-to-excel-guide" },
  },
  {
    question: "Why do some rows say “Balance unchanged”?",
    answer:
      "Every row is checked against the running balance printed on your statement. Sometimes a statement lists a transaction while the balance stays the same. We keep GCash's figures exactly as printed and point those rows out so you can review them.",
  },
];
