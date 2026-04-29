const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const cheerio = require("cheerio");
const { printer: thermalPrinter, types: printerTypes } = require("node-thermal-printer");
const { formatReceiptText } = require("./receiptFormatter");
const { normalizeReceiptPayload, sanitizeText } = require("./receiptPayload");

const app = express();
const BRIDGE_INSTALL_ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const BRIDGE_CONFIG_PATH = process.env.BRIDGE_CONFIG_PATH || path.join(BRIDGE_INSTALL_ROOT, "bridge.config.json");
const BRIDGE_LOG_DIR = process.env.BRIDGE_LOG_DIR || path.join(BRIDGE_INSTALL_ROOT, "logs");
const BRIDGE_LOG_FILE = path.join(BRIDGE_LOG_DIR, "bridge.log");
let fileLogReady = false;

function appendBridgeLog(level, message, extra) {
  const ts = new Date().toISOString();
  const suffix = extra === undefined ? "" : ` ${typeof extra === "string" ? extra : JSON.stringify(extra)}`;
  const line = `[${ts}] [${level}] ${message}${suffix}\n`;
  try {
    if (!fileLogReady) {
      fileLogReady = true;
      fsSync.mkdirSync(BRIDGE_LOG_DIR, { recursive: true });
    }
    fs.appendFile(BRIDGE_LOG_FILE, line).catch(() => {});
  } catch {
    // ignore logging failures
  }
  const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  console[method](`[bridge] ${message}`, extra ?? "");
}

function loadBridgeConfig() {
  try {
    const raw = require("fs").existsSync(BRIDGE_CONFIG_PATH) ? require("fs").readFileSync(BRIDGE_CONFIG_PATH, "utf8") : "";
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    appendBridgeLog("warn", "failed to load bridge config", err.message || err);
    return {};
  }
}

const bridgeConfig = loadBridgeConfig();
function toCamelCase(value) {
  return String(value || "").replace(/_([a-z])/g, (_m, chr) => chr.toUpperCase());
}
const envOrConfig = (key, fallback) => {
  if (process.env[key] !== undefined && process.env[key] !== "") return process.env[key];
  const normalized = key
    .replace(/^PRINT_BRIDGE_/, "")
    .replace(/^BRIDGE_/, "")
    .toLowerCase();
  const camel = toCamelCase(normalized);
  if (bridgeConfig[camel] !== undefined && bridgeConfig[camel] !== "") return bridgeConfig[camel];
  if (bridgeConfig[normalized] !== undefined && bridgeConfig[normalized] !== "") return bridgeConfig[normalized];
  if (bridgeConfig[key.toLowerCase()] !== undefined && bridgeConfig[key.toLowerCase()] !== "") return bridgeConfig[key.toLowerCase()];
  return fallback;
};

const PORT = Number(envOrConfig("PRINT_BRIDGE_PORT", bridgeConfig.port || 9777));
const DEFAULT_POS_ORIGIN = envOrConfig("POS_ORIGIN", bridgeConfig.posOrigin || "https://wholesale-pos.onrender.com");
const DEFAULT_PRINT_MODE = String(envOrConfig("BRIDGE_PRINT_MODE", bridgeConfig.printMode || "escpos")).toLowerCase();
const DEFAULT_PRINTER_NAME = String(envOrConfig("BRIDGE_PRINTER_NAME", bridgeConfig.printerName || "") || "");
const DEFAULT_PAPER_WIDTH = String(envOrConfig("BRIDGE_PAPER_WIDTH", bridgeConfig.paperWidth || "80"));
const DEFAULT_CHARACTER_SET = String(envOrConfig("BRIDGE_CHARACTER_SET", bridgeConfig.characterSet || "SLOVENIA"));

const allowedOrigins = new Set([
  "http://localhost",
  "http://127.0.0.1",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  DEFAULT_POS_ORIGIN,
]);

function originAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    return (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
      parsed.origin === DEFAULT_POS_ORIGIN
    );
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, cb) {
    if (originAllowed(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "stery-pos-print-bridge",
  });
});

appendBridgeLog("info", "bridge booting", {
  port: PORT,
  mode: DEFAULT_PRINT_MODE,
  printerName: DEFAULT_PRINTER_NAME || null,
  paperWidth: DEFAULT_PAPER_WIDTH,
  characterSet: DEFAULT_CHARACTER_SET,
  configPath: BRIDGE_CONFIG_PATH,
});
if (!DEFAULT_PRINTER_NAME) {
  appendBridgeLog("warn", "no printer name configured; bridge will use system default printer");
}

function wrapLine(line, width) {
  const text = String(line || "");
  if (!text) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      out.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out.length ? out : [text.slice(0, width)];
}

function formatMoney(value) {
  const num = Number.parseFloat(value ?? 0);
  if (Number.isNaN(num)) return String(value ?? "0.00");
  return num.toFixed(2);
}

function sanitizeReceiptText(value) {
  return sanitizeText(value).replace(/\s+/g, " ").trim();
}

function formatPlainNumber(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const num = Number.parseFloat(cleaned || "0");
  if (!Number.isFinite(num)) return "0";
  if (Number.isInteger(num)) return String(num);
  return String(num)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function fixLabelValueSpacing(text) {
  const cleaned = sanitizeReceiptText(text);
  return cleaned.replace(/^(Balance|Paid|Total|Subtotal|VAT|Net)\s*(\d)/, "$1                              $2");
}

function center(text, width = 48) {
  const value = sanitizeReceiptText(text);
  if (!value) return "";
  if (value.length >= width) return value.slice(0, width);
  const pad = Math.floor((width - value.length) / 2);
  return " ".repeat(Math.max(0, pad)) + value;
}

function leftRight(left, right, width = 48) {
  const l = sanitizeReceiptText(left);
  const r = sanitizeReceiptText(right);
  const space = Math.max(1, width - l.length - r.length);
  if (l.length + r.length + space <= width) return `${l}${" ".repeat(space)}${r}`;
  return `${l} ${r}`.trim().slice(0, width);
}

function divider(char = "-", width = 48) {
  return String(char || "-").repeat(width).slice(0, width);
}

function normalizePaperWidth(value) {
  return String(value || DEFAULT_PAPER_WIDTH || "80").trim() === "58" ? 58 : 80;
}

function getReceiptWidthChars(paperWidth) {
  return paperWidth === 58 ? 32 : 48;
}

function wrapText(text, width = 48) {
  const input = sanitizeReceiptText(text);
  if (!input) return [""];
  const words = input.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [input.slice(0, width)];
}

function money(amount) {
  const n = Number.parseFloat(String(amount ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return String(amount ?? "0.00");
  return formatMoney(n);
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleString("en-GB", { hour12: false });
}

function itemLine(name, qty, amount, width = 48) {
  const left = sanitizeReceiptText(name);
  const right = sanitizeReceiptText(`${qty} ${amount}`);
  return leftRight(left, right, width);
}

function sectionTitle(text, width = 48) {
  const title = sanitizeReceiptText(text).toUpperCase();
  const pad = Math.max(0, width - title.length);
  const leftPad = Math.floor(pad / 2);
  return `${" ".repeat(leftPad)}${title}`;
}

function pickText($, selector) {
  return $(selector).first().text().trim();
}

function getReceiptMeta($) {
  const metaEl = $("#receipt-meta");
  return {
    saleType: sanitizeReceiptText(metaEl.attr("data-sale-type") || ""),
    paymentMode: sanitizeReceiptText(metaEl.attr("data-payment-mode") || ""),
    isCreditSale: String(metaEl.attr("data-is-credit-sale") || "0") === "1",
    paymentStatus: sanitizeReceiptText(metaEl.attr("data-payment-status") || ""),
    dueDate: sanitizeReceiptText(metaEl.attr("data-due-date") || ""),
  };
}

function isReceiptJsonLike(body) {
  if (!body || typeof body !== "object") return false;
  if (body.receipt && typeof body.receipt === "object") return true;
  return Boolean(
    body.storeName ||
    body.receiptNo ||
    body.cashier ||
    body.customer ||
    Array.isArray(body.items) ||
    body.total !== undefined ||
    body.paid !== undefined ||
    body.change !== undefined ||
    body.paymentMethod !== undefined
  );
}

function normalizePrintBody(body) {
  if (!body || typeof body !== "object") return null;
  if (body.receipt && typeof body.receipt === "object") return normalizeReceiptPayload(body.receipt);
  if (isReceiptJsonLike(body)) return normalizeReceiptPayload(body);
  return null;
}

function printReceiptJson(receipt, printerName, mode, paperWidth) {
  const payload = normalizeReceiptPayload(receipt);
  const text = formatReceiptText(payload);
  const lines = text.split("\n");
  const width = normalizePaperWidth(paperWidth);
  const selectedPrinter = printerName || DEFAULT_PRINTER_NAME || "default";
  const printMode = (mode || DEFAULT_PRINT_MODE || "escpos").toLowerCase();
  console.info("[bridge] printer selected", selectedPrinter);
  console.info("[bridge] mode used", printMode);
  if (printMode === "text") {
    return printPlainText(lines.join(os.EOL), printerName || DEFAULT_PRINTER_NAME || "");
  }
  const bytes = buildEscposBuffer(lines, { width });
  return sendRawBytesToPrinter(bytes, printerName || DEFAULT_PRINTER_NAME || "");
}

function parseHtmlReceiptText(html) {
  return parseReceiptLines(html, { width: 48 }).join("\n");
}

function humanizeMode(meta, payments = []) {
  if (payments.length > 1) return "Split Payment";
  if (meta.isCreditSale || /credit/i.test(meta.paymentStatus)) return "Credit";
  if (meta.paymentMode) {
    const mode = meta.paymentMode.toLowerCase();
    if (mode === "mpesa") return "M-Pesa";
    if (mode === "mobile_money") return "Mobile Money";
    if (mode === "bank") return "Bank Transfer";
    if (mode === "card") return "Card";
    if (mode === "cash") return "Cash";
    return meta.paymentMode;
  }
  if (meta.saleType) return meta.saleType.charAt(0).toUpperCase() + meta.saleType.slice(1);
  return "";
}

function isWholesaleSale(meta) {
  return meta.saleType.toLowerCase() === "wholesale";
}

function itemReceiptLines(name, qty, unitPrice, total, width) {
  const cleanName = sanitizeReceiptText(name);
  const amount = money(total);
  const qtyText = formatPlainNumber(qty);
  const unitText = formatPlainNumber(unitPrice);
  const leftText = `${cleanName} ${unitText} x ${qtyText}`.trim();
  const nameWidth = Math.max(10, width - amount.length - 1);
  const wrappedLeft = wrapText(leftText, nameWidth);
  const firstLine = leftRight(wrappedLeft[0] || leftText, amount, width);
  const continuation = wrappedLeft.slice(1).map((part) => `  ${part}`);
  return [firstLine, ...continuation];
}

function parseReceiptLines(html, { width = 48 } = {}) {
  const $ = cheerio.load(html);
  const lines = [];
  const meta = getReceiptMeta($);
  const businessName = sanitizeReceiptText(pickText($, ".center .title") || "STERY WHOLESALERS LTD");
  const metaBlocks = $(".center .muted").toArray().map((el) => sanitizeReceiptText($(el).text())).filter(Boolean);
  const saleNo = sanitizeReceiptText(pickText($, ".center > div:nth-child(2)") || "");
  const date = metaBlocks[0] || "";
  const branch = metaBlocks[1] || "";
  const customer = metaBlocks[2] || "";
  const servedBy = metaBlocks[3] || "";

  lines.push(center(businessName, width));
  lines.push(center("SALE RECEIPT", width));
  if (branch) lines.push(center(branch, width));
  if (saleNo) lines.push(leftRight("Receipt", saleNo, width));
  if (date) lines.push(leftRight("Date", formatDate(date), width));
  if (servedBy) lines.push(leftRight("Cashier", servedBy.replace(/^Served by:\s*/i, ""), width));
  if (customer) lines.push(leftRight("Customer", customer.replace(/^Customer:\s*/i, ""), width));
  const payments = [];
  $(".payments .payment").each((_idx, el) => {
    const text = sanitizeReceiptText($(el).text());
    if (text) payments.push(text);
  });
  const modeText = humanizeMode(meta, payments);
  if (modeText) {
    lines.push(divider("-", width));
    lines.push(leftRight("Mode", modeText, width));
  }
  lines.push(divider("-", width));
  lines.push(leftRight("Item / Price x Qty", "Amt", width));
  lines.push(divider("-", width));

  const itemBlocks = [];
  $(".items .item").each((_idx, el) => {
    const name = sanitizeReceiptText($(el).find(".item-name").text());
    const unitMeta = sanitizeReceiptText($(el).find(".item-meta").text());
    const total = sanitizeReceiptText($(el).find(".item-total").text());
    const amountText = total ? money(total) : "";
    const qtyMatch = unitMeta.match(/([0-9]+(?:\.[0-9]+)?)\s*x\s*([0-9.,]+)/i);
    const qty = qtyMatch ? qtyMatch[1] : "1";
    const unitPrice = qtyMatch ? qtyMatch[2] : "";
    const linesForItem = itemReceiptLines(name, qty, unitPrice, amountText || 0, width);
    itemBlocks.push(...linesForItem);
  });
  lines.push(...itemBlocks);

  lines.push(divider("-", width));

  const totals = [];
  $(".totals .row").each((_idx, el) => {
    const left = $(el).find("span").first().text().trim();
    const right = $(el).find("span").last().text().trim();
    if (!left && !right) return;
    if (/^Subtotal$/i.test(left)) return;
    if (/^(VAT \(included\)|Net \(ex VAT\))$/i.test(left) && !right) return;
    totals.push(leftRight(left, right, width));
  });
  lines.push(...totals);

  if (payments.length) {
    lines.push(divider("-", width));
    lines.push(sectionTitle("Payments", width));
    payments.forEach((line) => lines.push(...wrapText(line, width)));
  }

  const balanceRow = sanitizeReceiptText($(".totals .balance").text());
  const paymentStatus = meta.paymentStatus || sanitizeReceiptText($(".totals .row").filter((_idx, el) => /Status/i.test($(el).text())).text());
  const dueDate = meta.dueDate || sanitizeReceiptText($(".totals .row").filter((_idx, el) => /Due Date/i.test($(el).text())).text());
  if (balanceRow || paymentStatus || dueDate) {
    lines.push(divider("-", width));
    lines.push(sectionTitle("Credit / Delivery Notes", width));
    if (paymentStatus) lines.push(...wrapText(fixLabelValueSpacing(paymentStatus), width));
    if (balanceRow) lines.push(...wrapText(fixLabelValueSpacing(balanceRow), width));
    if (dueDate) lines.push(...wrapText(fixLabelValueSpacing(dueDate), width));
  }

  lines.push(divider("-", width));
  lines.push("TERMS & CONDITIONS");
  lines.push("1. Goods remain property of Stery's Wholesalers until fully paid.");
  if (isWholesaleSale(meta)) {
    lines.push("2. Accounts are due on demand and overdue accounts may attract interest.");
    lines.push("3. Goods once sold cannot be returned unless approved.");
  } else {
    lines.push("2. Goods once sold cannot be returned unless approved.");
  }
  if (isWholesaleSale(meta)) {
    lines.push(divider("-", width));
    lines.push("PAYMENT DETAILS");
    lines.push("Pochi la Biashara: 0746370367");
    lines.push("Mpesa Deposit: 0746370367 I.D: 33922827");
    lines.push("MPESA NAME: JOSHUA WEKESA");
    lines.push("Send Money: 0746370367");
    lines.push(divider("-", width));
    lines.push("Signature: __________________");
    lines.push("Date Received: ______________");
  }
  lines.push(divider("-", width));
  lines.push(center("THANK YOU FOR YOUR BUSINESS", width));
  lines.push(center("Powered by Stery POS", width));

  return lines.filter((line) => line !== undefined && line !== null).map((line) => sanitizeReceiptText(line));
}

function buildEscposBuffer(lines, { width = 80 } = {}) {
  const cols = width === 58 ? 32 : 48;
  const lineCount = Array.isArray(lines) ? lines.length : 0;
  const printer = new thermalPrinter({
    type: printerTypes.EPSON,
    interface: "tmp",
    characterSet: DEFAULT_CHARACTER_SET,
  });
  if (typeof printer.setCharacterSet === "function") {
    printer.setCharacterSet(DEFAULT_CHARACTER_SET);
  }
  console.info("[bridge] selected character set", DEFAULT_CHARACTER_SET);
  if (typeof printer.alignLeft === "function") {
    printer.alignLeft();
  }
  let beforeSaleReceipt = true;
  const centeredHeadings = new Set([
    "SALE RECEIPT",
    "PAYMENTS",
    "PAYMENT DETAILS",
    "TERMS & CONDITIONS",
    "CREDIT / DELIVERY NOTES",
    "THANK YOU FOR YOUR BUSINESS",
    "POWERED BY STERY POS",
  ]);
  try {
    lines.forEach((line) => {
      const rawText = String(line ?? "");
      const text = sanitizeReceiptText(rawText);
      if (!text) {
        printer.newLine();
        return;
      }
      if (beforeSaleReceipt) {
        if (/^-{8,}$/.test(text)) {
          printer.println(text);
          return;
        }
        if (typeof printer.alignCenter === "function") printer.alignCenter();
        printer.bold(true);
        printer.println(text);
        printer.bold(false);
        if (typeof printer.alignLeft === "function") printer.alignLeft();
        if (text.toUpperCase() === "SALE RECEIPT") {
          beforeSaleReceipt = false;
        }
        return;
      }
      if (centeredHeadings.has(text.toUpperCase())) {
        if (typeof printer.alignCenter === "function") printer.alignCenter();
        printer.bold(true);
        printer.println(text);
        printer.bold(false);
        if (typeof printer.alignLeft === "function") printer.alignLeft();
        return;
      }
      if (/^(ITEM \/ PRICE X QTY)$/i.test(text)) {
        printer.bold(true);
        printer.println(text);
        printer.bold(false);
        return;
      }
      if (/^(Subtotal|VAT included|VAT \(included\)|Net excl VAT|Net \(ex VAT\)|Total|Paid|Balance|Status|Due Date|Receipt|Date|Cashier|Customer|Mode)$/i.test(text.split(":")[0])) {
        printer.bold(true);
        printer.println(text);
        printer.bold(false);
        return;
      }
      const wrapped = wrapText(text, cols);
      wrapped.forEach((part) => printer.println(sanitizeReceiptText(part)));
    });
    printer.newLine();
    printer.newLine();
    printer.cut();
    const buffer = Buffer.from(printer.getBuffer(), "binary");
    console.info("[bridge] generated line count", lineCount);
    console.info("[bridge] generated byte length", buffer.length);
    return buffer;
  } catch (err) {
    console.error("[bridge] escpos generation error", err);
    throw err;
  }
}

async function sendRawBytesToPrinter(bytes, printerName) {
  const rawFileName = `stery-escpos-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.bin`;
  const rawFilePath = path.join(os.tmpdir(), rawFileName);
  await fs.writeFile(rawFilePath, bytes);
  try {
    console.info("[bridge] bytes length", bytes.length);
    if (process.platform === "win32") {
      const target = printerName || DEFAULT_PRINTER_NAME;
      console.info("[bridge] command executed", target ? `raw-spool-to-windows-printer:${target}` : "windows-default-printer");
      const script = target
        ? `Get-Content -Encoding Byte -Path "${rawFilePath.replace(/"/g, '""')}" | Out-Printer -Name "${String(target).replace(/"/g, '""')}"`
        : `Get-Content -Encoding Byte -Path "${rawFilePath.replace(/"/g, '""')}" | Out-Printer`;
      await runCommand("powershell.exe", ["-NoProfile", "-Command", script]);
      return;
    }

    if (process.platform === "linux" || process.platform === "darwin") {
      const target = printerName || DEFAULT_PRINTER_NAME;
      const args = target
        ? ["-d", String(target), "-o", "raw", rawFilePath]
        : ["-o", "raw", rawFilePath];
      console.info("[bridge] command executed", `lp ${args.join(" ")}`);
      await runCommand("lp", args).catch(async () => {
        const lprArgs = target ? ["-P", String(target), rawFilePath] : [rawFilePath];
        console.info("[bridge] command executed", `lpr ${lprArgs.join(" ")}`);
        await runCommand("lpr", lprArgs);
      });
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  } finally {
    fs.unlink(rawFilePath).catch(() => {});
  }
}

function writeTempReceipt(text) {
  const fileName = `stery-receipt-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.txt`;
  const filePath = path.join(os.tmpdir(), fileName);
  return fs.writeFile(filePath, text, "utf8").then(() => filePath);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr}` : ""}`));
    });
  });
}

async function printPlainText(text, printerName) {
  const tempFile = await writeTempReceipt(text);
  try {
    if (process.platform === "win32") {
      const printerArg = printerName ? ` -Name "${String(printerName).replace(/"/g, '""')}"` : "";
      const script = `Get-Content -Raw -Encoding UTF8 -Path "${tempFile.replace(/"/g, '""')}" | Out-Printer${printerArg}`;
      await runCommand("powershell.exe", ["-NoProfile", "-Command", script]);
      return;
    }

    if (process.platform === "linux" || process.platform === "darwin") {
      const args = printerName ? ["-d", String(printerName), tempFile] : [tempFile];
      await runCommand("lp", args).catch(async () => {
        const lprArgs = printerName ? ["-P", String(printerName), tempFile] : [tempFile];
        await runCommand("lpr", lprArgs);
      });
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  } finally {
    fs.unlink(tempFile).catch(() => {});
  }
}

app.post("/print-receipt", async (req, res) => {
  const { receiptUrl, printerName, paperWidth, mode } = req.body || {};
  console.info("[bridge] received job", {
    receiptUrl,
    printerName: printerName || null,
    paperWidth: paperWidth || null,
    mode: mode || DEFAULT_PRINT_MODE,
  });

  if (!receiptUrl) {
    return res.status(400).json({ ok: false, error: "receiptUrl is required" });
  }

  try {
    const response = await fetch(receiptUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Receipt fetch failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    const width = normalizePaperWidth(paperWidth);
    const lines = parseReceiptLines(html, { width: width === 58 ? 32 : 48 });
    const selectedPrinter = printerName || DEFAULT_PRINTER_NAME || "default";
    const printMode = (mode || DEFAULT_PRINT_MODE || "escpos").toLowerCase();
    console.info("[bridge] printer selected", selectedPrinter);
    console.info("[bridge] mode used", printMode);
    if (printMode === "text") {
      const textReceipt = lines.join(os.EOL);
      await printPlainText(textReceipt, printerName || DEFAULT_PRINTER_NAME || "");
    } else {
      const bytes = buildEscposBuffer(lines, { width });
      await sendRawBytesToPrinter(bytes, printerName || DEFAULT_PRINTER_NAME || "");
    }
    console.info("[bridge] print success");
    return res.json({ ok: true });
  } catch (err) {
    console.error("[bridge] print failure", err);
    return res.status(500).json({ ok: false, error: err.message || "Print failed" });
  }
});

async function handlePrintBody(req, res, requireReceiptJson = false) {
  const body = req.body || {};
  const printerName = body.printerName || null;
  const mode = body.mode || DEFAULT_PRINT_MODE;
  const paperWidth = body.paperWidth || DEFAULT_PAPER_WIDTH;
  console.info("[bridge] received body print job", {
    printerName,
    paperWidth,
    mode,
    hasText: Boolean(body.text),
    hasHtml: Boolean(body.html),
    hasReceipt: isReceiptJsonLike(body),
  });

  try {
    if (body.text !== undefined && body.text !== null) {
      const text = sanitizeReceiptText(body.text);
      if (!text) throw new Error("text is empty");
      await printPlainText(text, printerName || DEFAULT_PRINTER_NAME || "");
      return res.json({ ok: true });
    }

    if (body.html !== undefined && body.html !== null) {
      const html = String(body.html);
      if (!html.trim()) throw new Error("html is empty");
      const text = parseHtmlReceiptText(html);
      await printPlainText(text, printerName || DEFAULT_PRINTER_NAME || "");
      return res.json({ ok: true });
    }

    if (body.receipt && typeof body.receipt === "object") {
      await printReceiptJson(body.receipt, printerName, mode, paperWidth);
      return res.json({ ok: true });
    }

    if (isReceiptJsonLike(body)) {
      await printReceiptJson(body, printerName, mode, paperWidth);
      return res.json({ ok: true });
    }

    if (requireReceiptJson) {
      throw new Error("receipt JSON is required");
    }
    throw new Error("No printable data provided");
  } catch (err) {
    console.error("[bridge] print body failure", err);
    return res.status(500).json({ ok: false, error: err.message || "Print failed" });
  }
}

app.post("/print", async (req, res) => {
  return handlePrintBody(req, res, false);
});

app.post("/print/receipt", async (req, res) => {
  return handlePrintBody(req, res, true);
});

app.post("/test-print", async (req, res) => {
  const { printerName, mode } = req.body || {};
  console.info("[bridge] received test job", { printerName: printerName || null, mode: mode || DEFAULT_PRINT_MODE });
  try {
    const lines = [
      center("STERY WHOLESALERS LTD", 48),
      center("SALE RECEIPT", 48),
      "Branch: MAIN BRANCH",
      "Receipt: TEST-001",
      "Date: 2026-04-25 12:00",
      "Cashier: TEST USER",
      "Customer: WALK-IN",
      divider("-", 48),
      leftRight("Item / Price x Qty", "Amt", 48),
      divider("-", 48),
      leftRight("TEST PRODUCT 24*1KG HOME BAKING FLOUR 2020 x 1", money(2020), 48),
      divider("-", 48),
      leftRight("Total", "2,020.00", 48),
      leftRight("Paid", "2,020.00", 48),
      leftRight("Balance", "0.00", 48),
      divider("-", 48),
      leftRight("Mode", "Wholesale", 48),
      divider("-", 48),
      "PAYMENT DETAILS",
      "Pochi la Biashara: 0746370367",
      "Mpesa Deposit: 0746370367 I.D: 33922827",
      "MPESA NAME: JOSHUA WEKESA",
      "Send Money: 0746370367",
      divider("-", 48),
      "TERMS & CONDITIONS",
      "1. Goods remain property of Stery's Wholesalers until fully paid.",
      "2. Accounts are due on demand and overdue accounts may attract interest.",
      "3. Goods once sold cannot be returned unless approved.",
      divider("-", 48),
      "Signature: __________________",
      "Date Received: ______________",
      divider("-", 48),
      "STERY POS TEST",
      "1234567890",
    ];
    const printMode = (mode || DEFAULT_PRINT_MODE || "escpos").toLowerCase();
    if (printMode === "text") {
      await printPlainText(lines.join(os.EOL), printerName || DEFAULT_PRINTER_NAME || "");
    } else {
      const bytes = buildEscposBuffer(lines, { width: normalizePaperWidth() });
      await sendRawBytesToPrinter(bytes, printerName || DEFAULT_PRINTER_NAME || "");
    }
    console.info("[bridge] test print success");
    return res.json({ ok: true });
  } catch (err) {
    console.error("[bridge] test print failure", err);
    return res.status(500).json({ ok: false, error: err.message || "Test print failed" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

const server = app.listen(PORT, () => {
  appendBridgeLog("info", `listening on http://127.0.0.1:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    appendBridgeLog("error", `port ${PORT} already in use`);
    process.exit(1);
  }
  appendBridgeLog("error", "bridge server error", err && err.message ? err.message : String(err));
});
