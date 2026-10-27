// Site-wide constants and UI strings. Keep user-facing text here so Filipino/Taglish can be added later.

export const SITE_NAME = "WalletToExcel";
/** What the product does, in the words people search for. Used in titles, schema and copy. */
export const SITE_TAGLINE = "GCash Statement to Excel";
// Defined in astro.config.mjs (default hello@wallettoexcel.com; PUBLIC_CONTACT_EMAIL overrides).
export const CONTACT_EMAIL: string =
  import.meta.env.PUBLIC_CONTACT_EMAIL ?? "hello@wallettoexcel.com";

export const strings = {
  en: {
    skipToContent: "Skip to content",
    nav: { convert: "Convert PDF" },
    footer: {
      disclaimer:
        "Independent tool. Not affiliated with, endorsed by, or sponsored by GCash, G-Xchange, Inc., or Mynt.",
      about: "About",
      blog: "Blog",
      privacy: "Privacy",
      contact: "Contact",
    },
    converter: {
      heading: "Convert your statement",
      chooseFile: "Choose your GCash PDF",
      orDrag: "or drag and drop it here",
      noPdf: "No PDF handy?",
      trySample: "Try a sample statement",
      example: {
        caption: "Example output",
        sample: "Sample data",
        date: "Date",
        description: "Description",
        amount: "Amount",
        balance: "Balance",
        totals: "Totals match your statement",
        balances: "Every balance checked",
      },
      privacyNote: "Processed on your device. Nothing is uploaded.",
      passwordPrompt: "This statement is password-protected.",
      password: "PDF password",
      showPassword: "Show",
      hidePassword: "Hide",
      passwordHint: "Used only to open the file on your device. Never sent or saved.",
      unlock: "Unlock and convert",
      chooseDifferent: "Choose a different file",
      converting: "Reading your statement…",
      converted: "Your spreadsheet is ready",
      doneSummary: "{source} · {period} · {n} transactions",
      doneSummaryOne: "{source} · {period} · 1 transaction",
      sources: { gcash: "GCash" },
      errors: {
        notPdf: "That file isn't a PDF. Choose the PDF statement from GCash.",
        tooLarge: "That file is too large (over 25 MB). GCash statements are usually much smaller.",
        passwordEmpty: "Enter the PDF password.",
        wrongPassword: "Wrong password, try again.",
        invalidPdf: "This file couldn't be opened as a PDF. It may be damaged or incomplete.",
        noText:
          "This PDF has no readable text (it may be a scanned image or a screenshot). Use the original PDF statement from GCash.",
        unsupported:
          "This doesn't look like a GCash Transaction History PDF. Only GCash statements are supported for now.",
        generic: "Something went wrong while reading this file. Please try again.",
        sampleFailed:
          "The sample statement couldn't be loaded. Check your connection and try again.",
        loadFailed:
          "The converter couldn't finish loading. Check your connection, refresh the page, and try again.",
      },
      results: {
        heading: "Statement details",
        period: "{start} to {end}",
        downloadXlsx: "Download Excel",
        downloadCsv: "Download CSV",
        viewAll: { one: "View 1 transaction", other: "View all {n} transactions" },
        privacyDone: "Processed on your device. Nothing was uploaded.",
        status: {
          ok: "Checked against your statement. Every running balance matches.",
          gaps: {
            one: "Checked against your statement. 1 row needs a look.",
            other: "Checked against your statement. {n} rows need a look.",
          },
          totalsOff: "Some totals don't match your statement. Please compare with your PDF.",
          none: "Your statement doesn't show balances to check against.",
        },
        convertAnother: "Convert another",
        overview: {
          net: "Net (money in − money out)",
          opening: "Starting balance",
          closing: "Ending balance",
          moneyIn: "Money in",
          moneyOut: "Money out",
          notShown: "Not shown",
          count: { one: "1 transaction", other: "{n} transactions" },
        },
        cleanup: {
          label: "Clean up",
          infoLabel: "What does clean up do?",
          info: "Removes transactions that didn't change your balance.",
        },
        review: {
          title: { one: "1 row needs a look", other: "{n} rows need a look" },
          gaps: "({details})",
          unchanged: "{n} unchanged",
          different: "{n} moved by a different amount",
          readProblems: {
            one: "1 couldn't be read confidently.",
            other: "{n} couldn't be read confidently.",
          },
          show: "Show them",
          notes: "Notes",
        },
        months: {
          heading: "By month",
          month: "Month",
          moneyIn: "Money in",
          moneyOut: "Money out",
          net: "Net",
          count: "Transactions",
          view: "View",
          viewLabel: "View {month} transactions",
        },
        table: {
          heading: "Transactions",
          filters: { all: "All", in: "Money in", out: "Money out", review: "Needs review" },
          filterLabel: "Filter transactions",
          month: "Month",
          allMonths: "All months",
          search: "Search transactions",
          searchPlaceholder: "Search description or reference no.",
          range: "{from}–{to} of {total}",
          empty: "No transactions match these filters.",
          previous: "Previous",
          next: "Next",
          page: "Page {n}",
          columns: {
            row: "#",
            date: "Date",
            description: "Description",
            amount: "Amount",
            balance: "Balance",
          },
          warnUnchanged: "Balance didn't change",
          warnDifferent: "Balance off by {amount}",
          warnRead: "Check this row against your PDF",
        },
      },
    },
  },
} as const;

/** Page languages. UI strings fall back to English until a translation exists. */
export type Lang = "en" | "fil";

export function uiStrings(lang: Lang) {
  return lang in strings ? strings[lang as keyof typeof strings] : strings.en;
}

/** Pick the singular/plural form for n, then fill {n} and other placeholders. */
export function plural(
  forms: { one: string; other: string },
  n: number,
  values: Record<string, string | number> = {},
): string {
  return fill(n === 1 ? forms.one : forms.other, { n, ...values });
}

/** Replace {placeholders} in a UI string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    key in values ? String(values[key]) : m,
  );
}
