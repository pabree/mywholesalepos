function sanitizeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const cleaned = String(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReceiptItem(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    name: sanitizeText(source.name || "Item"),
    qty: toNumber(source.qty, 1),
    unitPrice: toNumber(source.unitPrice, 0),
    lineTotal: toNumber(source.lineTotal ?? source.total, 0),
  };
}

function normalizeReceiptPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeReceiptItem) : [];

  return {
    storeName: sanitizeText(source.storeName || "STERY WHOLESALERS"),
    branch: sanitizeText(source.branch || ""),
    receiptNo: sanitizeText(source.receiptNo || ""),
    cashier: sanitizeText(source.cashier || ""),
    customer: sanitizeText(source.customer || ""),
    date: sanitizeText(source.date || ""),
    items,
    subtotal: source.subtotal === null || source.subtotal === undefined || source.subtotal === "" ? null : toNumber(source.subtotal, 0),
    discount: source.discount === null || source.discount === undefined || source.discount === "" ? null : toNumber(source.discount, 0),
    tax: source.tax === null || source.tax === undefined || source.tax === "" ? null : toNumber(source.tax, 0),
    total: source.total === null || source.total === undefined || source.total === "" ? null : toNumber(source.total, 0),
    paid: source.paid === null || source.paid === undefined || source.paid === "" ? null : toNumber(source.paid, 0),
    change: source.change === null || source.change === undefined || source.change === "" ? null : toNumber(source.change, 0),
    paymentMethod: sanitizeText(source.paymentMethod || ""),
    footer: sanitizeText(source.footer || "Thank you for shopping with us"),
    printLogo: Boolean(source.printLogo),
    duplicateLabel: sanitizeText(source.duplicateLabel || ""),
    note: sanitizeText(source.note || ""),
  };
}

module.exports = {
  normalizeReceiptPayload,
  sanitizeText,
  toNumber,
};
