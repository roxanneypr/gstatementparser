// Site-wide constants and UI strings. Keep user-facing text here so Filipino/Taglish can be added later.

export const SITE_NAME = "GCash Statement to Excel";
// Set PUBLIC_CONTACT_EMAIL at build time (see astro.config.mjs; production deploys require it).
export const CONTACT_EMAIL: string = import.meta.env.PUBLIC_CONTACT_EMAIL ?? "hello@example.com";

export const strings = {
  en: {
    skipToContent: "Skip to content",
    nav: { converter: "Converter", guides: "Guides" },
    footer: {
      disclaimer:
        "Independent tool. Not affiliated with, endorsed by, or sponsored by GCash, G-Xchange, Inc., or Mynt.",
      privacy: "Privacy",
      about: "About",
      guides: "Guides",
      contact: "Contact",
    },
    converter: {
      heading: "Convert your statement",
      chooseFile: "Choose your GCash PDF",
      orDrag: "or drag and drop it here",
      selected: "Selected: {name}",
      password: "PDF password",
      showPassword: "Show",
      hidePassword: "Hide",
      passwordHint: "The password for this PDF. It stays on your device and is never saved.",
      convert: "Convert",
      converting: "Reading your statement…",
      privacyNote: "Processed entirely on your device. Nothing is uploaded.",
      errors: {
        noFile: "Choose your GCash statement PDF first.",
        notPdf: "That file isn't a PDF. Choose the PDF statement from GCash.",
        tooLarge: "That file is too large (over 25 MB). GCash statements are usually much smaller.",
        passwordRequired: "This PDF is password-protected. Enter its password, then press Convert.",
        wrongPassword: "Wrong password, try again.",
        invalidPdf: "This file couldn't be opened as a PDF. It may be damaged or incomplete.",
        noText:
          "This PDF has no readable text (it may be a scanned image or a screenshot). Use the original PDF statement from GCash.",
        unsupported:
          "This doesn't look like a GCash Transaction History PDF. Only GCash statements are supported for now.",
        generic: "Something went wrong while reading this file. Please try again.",
      },
      results: {
        heading: "Your statement",
        period: "{start} to {end}",
        count: "Transactions",
        moneyIn: "Money in",
        moneyOut: "Money out",
        net: "Net",
        downloadXlsx: "Download Excel (.xlsx)",
        downloadCsv: "Download CSV",
        sheetsTip:
          "Using Google Sheets? Open sheets.google.com, then File → Import → Upload, and choose the downloaded file.",
        convertAnother: "Convert another statement",
        checksHeading: "Accuracy checks",
        checks: {
          totalsOk: "All rows read: totals match the statement's Total Debit and Total Credit.",
          totalsBad:
            "Our totals don't match the statement's own totals, so some rows may have been misread. Please compare with your PDF.",
          totalsNone: "The statement doesn't show totals to compare against.",
          runningOk: "Every row's balance follows from the row before it.",
          runningBad: {
            one: "1 row has a balance gap in the statement itself. Your data is kept exactly as GCash printed it.",
            other:
              "{n} rows have balance gaps in the statement itself. Your data is kept exactly as GCash printed it.",
          },
          runningNone: "No running balance to check.",
          endsOk: "Starting balance + money in − money out = ending balance.",
          endsBad:
            "Starting balance + money in − money out doesn't equal the ending balance shown (difference {amount}).",
          endsNone: "The starting or ending balance isn't shown.",
        },
        warningsHeading: "Rows to review",
        unchangedTitle: {
          one: "The balance didn't change after 1 transaction",
          other: "The balance didn't change after {n} transactions",
        },
        unchangedBody:
          "GCash lists these transactions, but the balance stayed the same as the row before. We kept them exactly as printed. You may want to check them in your GCash app.",
        differentTitle: {
          one: "The balance moved by a different amount on 1 row",
          other: "The balance moved by a different amount on {n} rows",
        },
        differentBody:
          "On these rows the balance changed by a different amount than the transaction. We kept GCash's figures as printed.",
        readProblemsTitle: {
          one: "1 row couldn't be read confidently",
          other: "{n} rows couldn't be read confidently",
        },
        readProblemsBody: "Please compare these rows with your PDF.",
        otherTitle: "Other notes",
        offBy: "off by {amount}",
        previewHeading: "Preview",
        previewNote:
          "Showing the first {shown} of {total} transactions. Download to get all of them.",
        previewAll: "Showing all {total} transactions.",
        columns: {
          row: "#",
          date: "Date",
          description: "Description",
          debit: "Debit",
          credit: "Credit",
          balance: "Balance",
          check: "Check",
        },
        checkOk: "OK",
        checkUnchanged: "Balance didn't change",
        checkDifferent: "Off by {amount}",
        checkReadProblem: "Review",
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
