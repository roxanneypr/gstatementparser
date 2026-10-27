// The FAKE Maya sample statement (Sep 2026) shown by "Try a sample statement" on the Maya page.
// All names, numbers and amounts are made up. Transaction types and details only use wording seen
// on real Maya Wallet statements (money in hasn't been seen yet, so the sample has none).
// Layout mirrors the real Maya Wallet Statement of Account (see src/parsers/maya.ts).

const rows = [
  // [day, time, type, details, reference, amount out (pesos)]
  [1, "08:12:40 AM", "Purchased", "Pay with PayMaya Wallet QR On Us", "4F2A81C07D3E", 145],
  [2, "12:40:05 PM", "Sent to bank", "Instapay Sending", "9C1B47E2A60D", 2000],
  [3, "07:55:31 PM", "Purchased", "PWM Authorization", "A73D0E5B1C98", 89],
  [5, "09:10:12 AM", "Paid bill", "Pay with PayMaya Wallet Bills Pay", "2E8F6A4D90B1", 1850.75],
  [6, "06:22:48 PM", "Sent to Maya user", "Transfer to 639170******1234", "ACC40DE51928", 500],
  [8, "11:05:09 AM", "Purchased", "Pay with PayMaya Wallet", "7B5C3E9A12F4", 320],
  [10, "03:30:27 PM", "Purchased", "PWM Authorization", "C0D81F6E3A27", 1299],
  [12, "08:45:50 PM", "Purchased", "Pay with PayMaya Wallet QR On Us", "5A9E2C7B40D6", 62.5],
  [14, "01:15:33 PM", "Sent to bank", "Instapay Sending", "E36B0A8F5C21", 1500],
  [17, "10:00:02 AM", "Paid bill", "Pay with PayMaya Wallet Bills Pay", "8D4F1B6E2A93", 1199],
  [19, "07:20:18 PM", "Purchased", "PWM Authorization", "1F7A9C3E5B08", 249],
  [21, "05:48:44 PM", "Sent to Maya user", "Transfer to 639180******5678", "ACC71BE30264", 300],
  [24, "09:30:56 AM", "Purchased", "Pay with PayMaya Wallet", "6C2E8A0D4F75", 455],
  [27, "02:40:11 PM", "Purchased", "Pay with PayMaya Wallet QR On Us", "B94D7F1A3C60", 118],
  [30, "08:15:39 PM", "Sent to bank", "Instapay Sending", "3E0C5A9B7D12", 1000],
];
const OPENING = 15000;

const W = (s) => Math.round(s.length * 4.3 * 100) / 100;
const item = (str, x, y, { h = 8, right } = {}) => {
  const width = W(str);
  return {
    str,
    x: right !== undefined ? Math.round((right - width) * 10) / 10 : x,
    y,
    width,
    height: h,
  };
};
const peso = (n) =>
  `PHP ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d) => `${d} Sep 2026`;
const PERIOD = "1 Sep 2026 - 30 Sep 2026";

function pageTop(n, total) {
  return [
    item(`${n} of ${total}`, 526.4, 79.3),
    item("Account number:", 340, 121.0),
    item("+639170000000", 433, 121.0),
    item("JUAN DELA CRUZ", 20, 123.3, { h: 10 }),
    item("Coverage period:", 340, 143.0),
    item(PERIOD, 433, 143.0),
  ];
}
const header = (y) => [
  item("Date & Time", 42.8, y),
  item("Transaction type & details", 149.5, y),
  item("Reference ID", 322, y),
  item("Amount", 423.5, y),
  item("Running balance", 497.3, y),
];

/** Fake Maya statement pages (PageText[]), ready for scripts/fake-pdf.mjs. */
export function sampleMayaStatementPages() {
  const totalOut = rows.reduce((s, r) => s + r[5], 0);
  const closing = Math.round((OPENING - totalOut) * 100) / 100;
  const ROW = 55;
  const firstPageRows = 7;
  const perPage = 10;
  const pageCount = 1 + Math.ceil((rows.length - firstPageRows) / perPage);
  const pages = [];
  let balance = OPENING;
  let r = 0;
  for (let n = 1; n <= pageCount; n++) {
    const items = pageTop(n, pageCount);
    let y;
    if (n === 1) {
      items.push(
        item("Account summary", 21, 174.4, { h: 10 }),
        item("Starting balance", 42.3, 209.2),
        item("+ Total incoming", 162.3, 209.2),
        item("- Total outgoing", 304, 209.2),
        item("Ending balance", 450.9, 209.2),
        item(peso(OPENING), 49.1, 244.2, { h: 10 }),
        item(peso(0), 184.7, 244.2, { h: 10 }),
        item(peso(totalOut), 309.1, 244.2, { h: 10 }),
        item(peso(closing), 457.6, 244.2, { h: 10 }),
        item("Transaction details", 21, 279.4, { h: 10 }),
        ...header(311.3),
        item("Beginning Balance", 109, 340.8),
        item(peso(OPENING), 0, 340.8, { right: 548 }),
      );
      y = 360.8;
    } else {
      items.push(item("Transaction details", 21, 176.4, { h: 10 }), ...header(208.3));
      y = 237.8;
    }
    const count = n === 1 ? firstPageRows : perPage;
    for (let k = 0; k < count && r < rows.length; k++, r++, y += ROW) {
      const [day, time, type, details, ref, out] = rows[r];
      balance = Math.round((balance - out) * 100) / 100;
      items.push(
        item(date(day), 29, y),
        item(type, 108, y),
        item(ref, 298, y),
        item(`-${peso(out)}`, 0, y, { right: 445 }),
        item(peso(balance), 0, y, { right: 548 }),
        item(time, 29, y + 15.2),
        item(details, 108, y + 15.2),
      );
    }
    if (r === rows.length) {
      items.push(
        item("Ending Balance", 109, y - 5.8),
        item(peso(closing), 0, y - 2, { right: 548 }),
        item("** Nothing follows **", 239.4, y + 21.6),
      );
    }
    pages.push({ pageNumber: n, width: 595, height: 842, items });
  }
  return pages;
}
