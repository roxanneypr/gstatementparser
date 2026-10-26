// Landing-page FAQ. Rendered as plain HTML and as FAQPage JSON-LD from the same data.
// Do not state GCash-specific facts (menu paths, password formats, fees) without verifying them.

export interface FaqItem {
  question: string;
  answer: string;
}

export const faq: FaqItem[] = [
  {
    question: "Is my GCash statement uploaded anywhere?",
    answer:
      "No. The PDF is opened and converted inside your browser on your own phone or computer. The file, its password and your transactions are never sent to a server, and nothing is saved after you close the page.",
  },
  {
    question: "Is the converter free?",
    answer: "Yes. Converting a GCash statement to Excel or CSV is free.",
  },
  {
    question: "What file do I need?",
    answer:
      "The Transaction History PDF from GCash. Screenshots and scanned images can't be converted because they don't contain readable text.",
  },
  {
    question: "What is the password for my GCash statement PDF?",
    answer:
      "Use the password that came with your statement from GCash. This tool can't recover, guess or remove a PDF password. It only uses the password you type to open the file on your device.",
  },
  {
    question: "Can I open the result in Google Sheets?",
    answer:
      "Yes. Download the Excel or CSV file, then in Google Sheets choose File → Import → Upload and select the file.",
  },
  {
    question: "Why are some rows marked “balance didn't change”?",
    answer:
      "Every row is checked against the running balance printed on your statement. Sometimes a statement lists a transaction while the balance stays the same. We keep GCash's figures exactly as printed and point those rows out so you can review them.",
  },
  {
    question: "Is this an official GCash tool?",
    answer:
      "No. This is an independent tool and is not affiliated with, endorsed by, or sponsored by GCash, G-Xchange, Inc., or Mynt.",
  },
];
