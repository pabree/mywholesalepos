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
    name: sanitizeText(
      source.product_name
        || source.name
        || source.description
        || source.item?.product_name
        || source.item?.name
        || source.item?.description
        || source.item?.product?.name
        || source.item?.product?.product_name
        || source.product?.name
        || source.product?.product_name
        || "Item"
    ),
    qty: toNumber(source.qty, 1),
    unitPrice: toNumber(source.unitPrice, 0),
    lineTotal: toNumber(source.lineTotal ?? source.total, 0),
  };
}

function normalizeReceiptPayload(input) {
  const source = input && typeof input === "object" ? input : {};
  const items = Array.isArray(source.items) ? source.items.map(normalizeReceiptItem) : [];
  const payments = Array.isArray(source.payments)
    ? source.payments.map((payment) => ({
        method: sanitizeText(payment.method || payment.paymentMethod || payment.payment_method || payment.type || ""),
        amount: payment.amount === null || payment.amount === undefined || payment.amount === "" ? null : toNumber(payment.amount, 0),
        status: sanitizeText(payment.status || payment.payment_status || ""),
        reference: sanitizeText(payment.reference || payment.payment_reference || payment.code || ""),
        date: sanitizeText(payment.date || payment.created_at || payment.createdAt || ""),
        note: sanitizeText(payment.note || payment.notes || ""),
      }))
    : [];
  const receiptNo = sanitizeText(
    source.receiptNo
      || source.receipt_no
      || source.invoice_no
      || source.invoiceNo
      || String(source.sale_id || source.id || "").slice(-8)
  );
  const customer = sanitizeText(source.customer || source.customerName || source.customer_name || "");
  const cashier = sanitizeText(source.cashier || source.cashierName || source.served_by || source.servedBy || "");
  const vat = source.vat === null || source.vat === undefined || source.vat === "" ? (source.tax === null || source.tax === undefined || source.tax === "" ? null : toNumber(source.tax, 0)) : toNumber(source.vat, 0);
  const balance = source.balance === null || source.balance === undefined || source.balance === "" ? (source.balance_due === null || source.balance_due === undefined || source.balance_due === "" ? null : toNumber(source.balance_due, 0)) : toNumber(source.balance, 0);
  const paymentStatus = sanitizeText(source.paymentStatus || source.payment_status || "");
  const saleType = sanitizeText(source.saleType || source.sale_type || "");
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.map((entry) => sanitizeText(entry)).filter(Boolean)
    : [];

  return {
    storeName: sanitizeText(source.storeName || "STERY WHOLESALERS"),
    branch: sanitizeText(source.branch || ""),
    receiptNo,
    cashier,
    cashierName: cashier,
    customer,
    customerName: customer,
    date: sanitizeText(source.date || ""),
    items,
    subtotal: source.subtotal === null || source.subtotal === undefined || source.subtotal === "" ? null : toNumber(source.subtotal, 0),
    discount: source.discount === null || source.discount === undefined || source.discount === "" ? null : toNumber(source.discount, 0),
    tax: vat,
    vat,
    netAmount: source.netAmount === null || source.netAmount === undefined || source.netAmount === "" ? null : toNumber(source.netAmount, 0),
    total: source.total === null || source.total === undefined || source.total === "" ? null : toNumber(source.total, 0),
    paid: source.paid === null || source.paid === undefined || source.paid === "" ? null : toNumber(source.paid, 0),
    change: source.change === null || source.change === undefined || source.change === "" ? null : toNumber(source.change, 0),
    balance,
    paymentMethod: sanitizeText(source.paymentMethod || ""),
    paymentStatus,
    saleType,
    isCredit: Boolean(source.isCredit ?? source.is_credit ?? source.is_credit_sale ?? String(paymentStatus).toLowerCase().includes("credit")),
    footer: sanitizeText(source.footer || "Thank you for shopping with us"),
    printLogo: Boolean(source.printLogo),
    duplicateLabel: sanitizeText(source.duplicateLabel || ""),
    note: sanitizeText(source.note || ""),
    payments,
    deliveryPerson: sanitizeText(source.deliveryPerson || source.delivery_person || source.assigned_to || source.deliveryPersonName || ""),
    deliveryPersonName: sanitizeText(source.deliveryPersonName || source.deliveryPerson || source.delivery_person || source.assigned_to || ""),
    conditions: conditions.length ? conditions : defaultReceiptConditions({ saleType, isCredit: Boolean(source.isCredit ?? source.is_credit ?? source.is_credit_sale ?? String(paymentStatus).toLowerCase().includes("credit")) }),
  };
}

function defaultReceiptConditions({ saleType = "", isCredit = false } = {}) {
  const base = [
    "Goods remain property of Stery's Wholesalers Limited until fully paid.",
    "Goods once sold cannot be returned.",
  ];
  if (String(saleType).toLowerCase() === "wholesale") {
    base.push("Wholesale discounts apply only to qualifying quantities.");
  }
  if (isCredit) {
    base.push("Accounts are due on demand and overdue accounts attract interest at 3% per week.");
  }
  return base;
}

module.exports = {
  normalizeReceiptPayload,
  sanitizeText,
  toNumber,
};
