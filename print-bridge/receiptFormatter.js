const { sanitizeText } = require("./receiptPayload");

const WIDTH = 32;

function center(text, width = WIDTH) {
  const value = sanitizeText(text);
  if (!value) return "";
  if (value.length >= width) return value.slice(0, width);
  const pad = Math.floor((width - value.length) / 2);
  return `${" ".repeat(Math.max(0, pad))}${value}`;
}

function leftRight(left, right, width = WIDTH) {
  const l = sanitizeText(left);
  const r = sanitizeText(right);
  const space = width - l.length - r.length;
  if (space >= 1) return `${l}${" ".repeat(space)}${r}`;
  const available = Math.max(1, width - r.length - 1);
  return `${l.slice(0, available)} ${r}`.trimEnd();
}

function divider(char = "-", width = WIDTH) {
  return String(char || "-").repeat(width).slice(0, width);
}

function wrapText(text, width = WIDTH) {
  const input = sanitizeText(text);
  if (!input) return [""];
  const words = input.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [input.slice(0, width)];
}

function money(value) {
  const num = Number.parseFloat(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) return "KES 0.00";
  return `KES ${num.toFixed(2)}`;
}

function formatQty(value) {
  const num = Number.parseFloat(String(value ?? 0).replace(/,/g, ""));
  if (!Number.isFinite(num)) return "1";
  return Number.isInteger(num) ? String(num) : String(num);
}

function formatItem(item, width = WIDTH) {
  const name = sanitizeText(item?.name || "Item");
  const qty = formatQty(item?.qty);
  const unit = money(item?.unitPrice ?? 0);
  const total = money(item?.lineTotal ?? item?.total ?? 0);
  const left = `${name} ${qty} x ${unit.replace(/^KES\s+/i, "")}`.trim();
  const right = total.replace(/^KES\s+/i, "");
  const nameWidth = Math.max(10, width - right.length - 1);
  const wrapped = wrapText(left, nameWidth);
  const lines = [leftRight(wrapped[0] || left, right, width)];
  wrapped.slice(1).forEach((part) => lines.push(`  ${part}`));
  return lines;
}

function formatReceiptText(receipt) {
  const payload = receipt && typeof receipt === "object" ? receipt : {};
  const lines = [];
  const storeName = sanitizeText(payload.storeName || "STERY WHOLESALERS");
  const branch = sanitizeText(payload.branch || "");
  const receiptNo = sanitizeText(payload.receiptNo || "");
  const date = sanitizeText(payload.date || "");
  const cashier = sanitizeText(payload.cashierName || payload.cashier || "");
  const customer = sanitizeText(payload.customerName || payload.customer || "");
  const note = sanitizeText(payload.note || "");
  const footer = sanitizeText(payload.footer || "Thank you for shopping with us");
  const duplicateLabel = sanitizeText(payload.duplicateLabel || "");
  const paymentMethod = sanitizeText(payload.paymentMethod || "");
  const paymentStatus = sanitizeText(payload.paymentStatus || "");
  const isCredit = Boolean(payload.isCredit || /credit/i.test(paymentStatus));
  const total = payload.total ?? 0;
  const paid = payload.paid;
  const balance = payload.balance ?? payload.balanceDue ?? (isCredit ? Math.max(0, Number(total || 0) - Number(paid || 0)) : null);
  const netAmount = payload.netAmount ?? null;
  const vat = payload.vat ?? payload.tax ?? null;
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const deliveryPerson = sanitizeText(payload.deliveryPersonName || payload.deliveryPerson || "");
  const conditions = Array.isArray(payload.conditions) ? payload.conditions.map((entry) => sanitizeText(entry)).filter(Boolean) : [];

  if (duplicateLabel) {
    lines.push(center(duplicateLabel));
  }
  lines.push(center(storeName));
  if (branch) lines.push(center(branch));
  lines.push(center("SALE RECEIPT"));
  lines.push(divider());
  if (receiptNo) lines.push(leftRight("Receipt", receiptNo));
  if (date) lines.push(leftRight("Date", date));
  if (cashier) lines.push(leftRight("Cashier", cashier));
  if (customer) lines.push(leftRight("Customer", customer));
  if (deliveryPerson && isCredit) lines.push(leftRight("Delivery Person", deliveryPerson));
  if (payload.saleType) lines.push(leftRight("Sale Type", sanitizeText(payload.saleType)));
  if (isCredit) {
    lines.push(center("CREDIT SALE"));
    if (paymentStatus && !/^(paid|cash|mpesa|card|split payment)$/i.test(paymentStatus)) {
      lines.push(leftRight("Status", paymentStatus));
    }
  } else if (paymentStatus && !/^(paid|cash|mpesa|card|split payment)$/i.test(paymentStatus)) {
    lines.push(leftRight("Status", paymentStatus));
  }
  if (note) {
    lines.push(divider());
    lines.push(...wrapText(note));
  }
  lines.push(divider());
  lines.push(leftRight("Item / Price x Qty", "Amt"));
  lines.push(divider());

  const items = Array.isArray(payload.items) ? payload.items : [];
  items.forEach((item) => {
    lines.push(...formatItem(item));
  });

  lines.push(divider());
  if (payload.subtotal !== null && payload.subtotal !== undefined) lines.push(leftRight("Subtotal", money(payload.subtotal)));
  if (Number(payload.discount || 0) > 0) {
    lines.push(leftRight("Discount", money(payload.discount)));
  }
  if (Number(vat || 0) > 0) lines.push(leftRight("VAT", money(vat)));
  if (netAmount !== null && netAmount !== undefined) lines.push(leftRight("Net", money(netAmount)));
  lines.push(leftRight("TOTAL", money(total)));
  if (paymentMethod) lines.push(leftRight("Payment Method", paymentMethod));
  if (payments.length) {
    lines.push(divider());
    lines.push(center("PAYMENTS"));
    payments.forEach((payment) => {
      const method = sanitizeText(payment.method || payment.paymentMethod || payment.type || "");
      const amount = payment.amount !== null && payment.amount !== undefined ? money(payment.amount) : "";
      const ref = sanitizeText(payment.reference || "");
      const status = sanitizeText(payment.status || "");
      const row = method || ref || status ? leftRight(method || status || "Payment", amount || ref || status) : "";
      if (row) lines.push(row);
      if (ref && method) lines.push(`  Ref: ${ref}`);
      if (status && status.toLowerCase() !== "paid") lines.push(`  Status: ${status}`);
    });
  }
  if (paid !== null && paid !== undefined && Number(paid) > 0) lines.push(leftRight("Paid", money(paid)));
  if (!isCredit && payload.change !== null && payload.change !== undefined && Number(payload.change) > 0 && /cash/i.test(paymentMethod)) {
    lines.push(leftRight("Change", money(payload.change)));
  }
  if (!isCredit && balance !== null && balance !== undefined && Number(balance) > 0) {
    lines.push(leftRight("Balance", money(balance)));
  }
  if (conditions.length) {
    lines.push(divider());
    lines.push(center("CONDITIONS"));
    conditions.forEach((condition, index) => {
      const parts = wrapText(condition);
      parts.forEach((part, partIndex) => {
        lines.push(partIndex === 0 ? `${index + 1}. ${part}` : `   ${part}`);
      });
    });
  }
  lines.push(divider());
  lines.push(center(footer));

  return lines.filter((line) => line !== undefined && line !== null).join("\n");
}

module.exports = {
  formatReceiptText,
};
