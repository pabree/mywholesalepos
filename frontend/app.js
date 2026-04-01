/* =========================================
   RetailPOS — Application Logic
   ========================================= */

const API_BASE = "/api";
const APP_BUILD = "2026-03-31.3";
const CUSTOMER_ORDERS_DEBUG = new URLSearchParams(window.location.search).has("customerOrdersDebug")
    || localStorage.getItem("customer_orders_debug") === "1";
const customerOrdersLog = (...args) => {
    if (CUSTOMER_ORDERS_DEBUG) console.debug(...args);
};
customerOrdersLog("[customer-orders] app.js loaded", { build: APP_BUILD });
window.__APP_BUILD__ = APP_BUILD;
const POS_DEBUG = new URLSearchParams(window.location.search).has("posDebug")
    || localStorage.getItem("pos_debug") === "1";
const posLog = (...args) => {
    if (POS_DEBUG) console.debug(...args);
};
posLog("[pos] app.js loaded", { build: APP_BUILD });
let API_TOKEN = localStorage.getItem("pos_api_token") || "";
let currentUserRole = localStorage.getItem("pos_user_role") || "";
let currentUser = null;
let firstProtectedFailure = null;

// ——— State ———
let allProducts = [];
let cart = [];
let customers = [];
let branches = [];
let activeCategory = "all";
let currentSaleId = null;
let heldSalesCache = [];
let currentSaleType = "retail";
let assignableUsers = [];
let currentSaleMeta = null;
let customerOrders = [];
let selectedCustomerOrder = null;
let customerOrdersFilter = "all";
let customerOrdersQuery = "";
let customerOrdersFailed = false;
let amountPaidDirty = false;
let staffInstallPrompt = null;
let ledgerEntries = [];
let ledgerSummary = null;
let ledgerFailed = false;
let expensesList = [];
let expensesFailed = false;

const EXPENSE_CATEGORIES = [
    { value: "transport", label: "Transport" },
    { value: "rent", label: "Rent" },
    { value: "utilities", label: "Utilities" },
    { value: "wages", label: "Wages" },
    { value: "fuel", label: "Fuel" },
    { value: "packaging", label: "Packaging" },
    { value: "maintenance", label: "Maintenance" },
    { value: "miscellaneous", label: "Miscellaneous" },
];

// ——— DOM References ———
const els = {
    branchSelect:    document.getElementById("branch-select"),
    customerSelect:  document.getElementById("customer-select"),
    saleTypeSelect:  document.getElementById("sale-type-select"),
    clock:           document.getElementById("clock"),
    productSearch:   document.getElementById("product-search"),
    categoryFilters: document.getElementById("category-filters"),
    productsGrid:    document.getElementById("products-grid"),
    cartItems:       document.getElementById("cart-items"),
    subtotal:        document.getElementById("subtotal"),
    taxAmount:       document.getElementById("tax-amount"),
    discountInput:   document.getElementById("discount-input"),
    grandTotal:      document.getElementById("grand-total"),
    amountPaid:      document.getElementById("amount-paid-input"),
    amountPaidLabel: document.getElementById("amount-paid-label"),
    changeAmount:    document.getElementById("change-amount"),
    changeRow:       document.getElementById("change-row"),
    creditToggle:    document.getElementById("credit-toggle"),
    creditFields:    document.getElementById("credit-fields"),
    creditHint:      document.getElementById("credit-hint"),
    assignedTo:      document.getElementById("assigned-to-select"),
    dueDate:         document.getElementById("due-date-input"),
    paymentStatus:   document.getElementById("payment-status"),
    balanceDue:      document.getElementById("balance-due"),
    checkoutBtn:     document.getElementById("checkout-btn"),
    holdSaleBtn:     document.getElementById("hold-sale-btn"),
    clearCartBtn:    document.getElementById("clear-cart-btn"),
    receiptModal:    document.getElementById("receipt-modal"),
    receiptContent:  document.getElementById("receipt-content"),
    printReceiptBtn: document.getElementById("print-receipt-btn"),
    newSaleBtn:      document.getElementById("new-sale-btn"),
    toastContainer:  document.getElementById("toast-container"),
    authBtn:         document.getElementById("auth-btn"),
    logoutBtn:       document.getElementById("logout-btn"),
    creditBtn:       document.getElementById("credit-btn"),
    customerOrdersBtn: document.getElementById("customer-orders-btn"),
    ledgerBtn:       document.getElementById("ledger-btn"),
    installPosBtn:   document.getElementById("install-pos-btn"),
    authModal:       document.getElementById("auth-modal"),
    authCloseBtn:    document.getElementById("auth-close-btn"),
    authUsername:    document.getElementById("auth-username"),
    authPassword:    document.getElementById("auth-password"),
    authLoginBtn:    document.getElementById("auth-login-btn"),
    authStatus:      document.getElementById("auth-status"),
    heldSalesList:   document.getElementById("held-sales-list"),
    refreshHeldBtn:  document.getElementById("refresh-held-btn"),
    creditModal:     document.getElementById("credit-modal"),
    creditCloseBtn:  document.getElementById("credit-close-btn"),
    creditTabs:      document.querySelectorAll(".credit-tab"),
    creditPayments:  document.getElementById("credit-payments-panel"),
    creditCustomer:  document.getElementById("credit-customer-panel"),
    creditAssigned:  document.getElementById("credit-assigned-panel"),
    creditSalesList: document.getElementById("credit-sales-list"),
    creditSearch:    document.getElementById("credit-search"),
    creditSaleDetail: document.getElementById("credit-sale-detail"),
    refreshCreditSales: document.getElementById("refresh-credit-sales"),
    paymentAmount:   document.getElementById("payment-amount"),
    paymentMethod:   document.getElementById("payment-method"),
    paymentReference: document.getElementById("payment-reference"),
    paymentNote:     document.getElementById("payment-note"),
    submitPaymentBtn: document.getElementById("submit-payment-btn"),
    payFullBtn:      document.getElementById("pay-full-btn"),
    paymentError:    document.getElementById("payment-error"),
    creditCustomerSelect: document.getElementById("credit-customer-select"),
    customerSummary: document.getElementById("customer-summary"),
    customerCreditList: document.getElementById("customer-credit-list"),
    creditAssignedSelect: document.getElementById("credit-assigned-select"),
    assignedSummary: document.getElementById("assigned-summary"),
    assignedCreditList: document.getElementById("assigned-credit-list"),
    customerOrdersModal: document.getElementById("customer-orders-modal"),
    customerOrdersCloseBtn: document.getElementById("customer-orders-close-btn"),
    refreshCustomerOrders: document.getElementById("refresh-customer-orders"),
    customerOrdersFilters: document.getElementById("customer-orders-filters"),
    customerOrdersSearch: document.getElementById("customer-orders-search"),
    customerOrdersList: document.getElementById("customer-orders-list"),
    customerOrdersLoading: document.getElementById("customer-orders-loading"),
    customerOrdersError: document.getElementById("customer-orders-error"),
    customerOrdersEmpty: document.getElementById("customer-orders-empty"),
    customerOrderDetail: document.getElementById("customer-order-detail"),
    ledgerModal: document.getElementById("ledger-modal"),
    ledgerCloseBtn: document.getElementById("ledger-close-btn"),
    ledgerRefreshBtn: document.getElementById("ledger-refresh-btn"),
    ledgerStart: document.getElementById("ledger-start"),
    ledgerEnd: document.getElementById("ledger-end"),
    ledgerType: document.getElementById("ledger-type"),
    ledgerCustomer: document.getElementById("ledger-customer"),
    ledgerBranch: document.getElementById("ledger-branch"),
    financeExportBtn: document.getElementById("finance-export-btn"),
    financeExportInclude: document.getElementById("finance-export-include"),
    ledgerSummary: document.getElementById("ledger-summary"),
    ledgerList: document.getElementById("ledger-list"),
    ledgerLoading: document.getElementById("ledger-loading"),
    ledgerError: document.getElementById("ledger-error"),
    ledgerEmpty: document.getElementById("ledger-empty"),
    ledgerTabs: document.querySelectorAll(".ledger-tab"),
    ledgerOverviewPanel: document.getElementById("ledger-overview-panel"),
    ledgerExpensesPanel: document.getElementById("ledger-expenses-panel"),
    expenseStart: document.getElementById("expense-start"),
    expenseEnd: document.getElementById("expense-end"),
    expenseCategoryFilter: document.getElementById("expense-category-filter"),
    expenseBranchFilter: document.getElementById("expense-branch-filter"),
    expensesExportBtn: document.getElementById("expenses-export-btn"),
    expenseDate: document.getElementById("expense-date"),
    expenseAmount: document.getElementById("expense-amount"),
    expenseCategory: document.getElementById("expense-category"),
    expenseBranch: document.getElementById("expense-branch"),
    expenseReference: document.getElementById("expense-reference"),
    expenseDescription: document.getElementById("expense-description"),
    expenseSaveBtn: document.getElementById("expense-save-btn"),
    expenseFormError: document.getElementById("expense-form-error"),
    expenseLoading: document.getElementById("expense-loading"),
    expenseError: document.getElementById("expense-error"),
    expenseList: document.getElementById("expense-list"),
    expenseEmpty: document.getElementById("expense-empty"),
};

customerOrdersLog("[customer-orders] button element", { found: Boolean(els.customerOrdersBtn) });
customerOrdersLog("[customer-orders] modal element", { found: Boolean(els.customerOrdersModal) });

document.addEventListener("click", (e) => {
    const customerBtn = e.target.closest("#customer-orders-btn");
    if (customerBtn) {
        customerOrdersLog("[customer-orders] button click", { target: e.target?.tagName });
        e.preventDefault();
        openCustomerOrdersModal();
        return;
    }
    const ledgerBtn = e.target.closest("#ledger-btn");
    if (ledgerBtn) {
        e.preventDefault();
        openLedgerModal();
    }
});
customerOrdersLog("[customer-orders] delegated listener attached");

function registerStaffServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // silent failure; POS still works without SW
    });
}

function setupStaffInstallPrompt() {
    if (!els.installPosBtn) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    els.installPosBtn.addEventListener("click", async () => {
        if (!staffInstallPrompt) return;
        staffInstallPrompt.prompt();
        try {
            await staffInstallPrompt.userChoice;
        } finally {
            staffInstallPrompt = null;
            els.installPosBtn.classList.add("hidden");
        }
    });

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        staffInstallPrompt = event;
        els.installPosBtn.classList.remove("hidden");
    });

    window.addEventListener("appinstalled", () => {
        staffInstallPrompt = null;
        els.installPosBtn.classList.add("hidden");
    });
}

// ——— Init ———
document.addEventListener("DOMContentLoaded", () => {
    startClock();
    bootstrapAuth();
    registerStaffServiceWorker();
    setupStaffInstallPrompt();
    renderExpenseCategoryOptions();

    els.productSearch.addEventListener("input", renderProducts);
    els.saleTypeSelect.addEventListener("change", () => {
        currentSaleType = els.saleTypeSelect.value || "retail";
        if (isCreditSaleSelected() && currentSaleType !== "wholesale") {
            currentSaleType = "wholesale";
            els.saleTypeSelect.value = "wholesale";
            toast("Credit sales must be wholesale. Sale type switched to wholesale.", "warning");
        }
        scheduleReprice();
    });
    els.customerSelect.addEventListener("change", scheduleReprice);
    els.branchSelect.addEventListener("change", scheduleReprice);
    els.discountInput.addEventListener("input", () => {
        updateTotals();
        scheduleReprice();
    });
    els.amountPaid.addEventListener("input", () => {
        amountPaidDirty = true;
        updateTotals();
    });
    if (els.creditToggle) {
        els.creditToggle.addEventListener("change", () => {
            handleCreditToggle();
            scheduleReprice();
        });
    }
    if (els.assignedTo) {
        els.assignedTo.addEventListener("change", scheduleReprice);
    }
    if (els.dueDate) {
        els.dueDate.addEventListener("change", scheduleReprice);
    }
    els.clearCartBtn.addEventListener("click", clearCart);
    els.holdSaleBtn.addEventListener("click", holdSale);
    els.checkoutBtn.addEventListener("click", checkout);
    posLog("[pos] checkout button bound", { found: Boolean(els.checkoutBtn) });
    els.printReceiptBtn.addEventListener("click", () => window.print());
    els.newSaleBtn.addEventListener("click", newSale);
    els.authBtn.addEventListener("click", openAuthModal);
    els.logoutBtn.addEventListener("click", logout);
    if (els.creditBtn) els.creditBtn.addEventListener("click", openCreditModal);
    // customer orders button handled by global delegated listener
    if (els.creditCloseBtn) els.creditCloseBtn.addEventListener("click", closeCreditModal);
    if (els.ledgerCloseBtn) els.ledgerCloseBtn.addEventListener("click", closeLedgerModal);
    if (els.ledgerRefreshBtn) els.ledgerRefreshBtn.addEventListener("click", loadLedger);
    if (els.ledgerStart) els.ledgerStart.addEventListener("change", loadLedger);
    if (els.ledgerEnd) els.ledgerEnd.addEventListener("change", loadLedger);
    if (els.ledgerType) els.ledgerType.addEventListener("change", loadLedger);
    if (els.ledgerCustomer) els.ledgerCustomer.addEventListener("change", loadLedger);
    if (els.ledgerBranch) els.ledgerBranch.addEventListener("change", loadLedger);
    if (els.financeExportBtn) els.financeExportBtn.addEventListener("click", exportFinanceCsv);
    if (els.ledgerTabs) {
        els.ledgerTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                setLedgerTab(tab.dataset.ledgerTab);
            });
        });
    }
    if (els.expenseStart) els.expenseStart.addEventListener("change", loadExpenses);
    if (els.expenseEnd) els.expenseEnd.addEventListener("change", loadExpenses);
    if (els.expenseCategoryFilter) els.expenseCategoryFilter.addEventListener("change", loadExpenses);
    if (els.expenseBranchFilter) els.expenseBranchFilter.addEventListener("change", loadExpenses);
    if (els.expenseSaveBtn) els.expenseSaveBtn.addEventListener("click", createExpense);
    if (els.expensesExportBtn) els.expensesExportBtn.addEventListener("click", exportExpensesCsv);
    if (els.customerOrdersCloseBtn) els.customerOrdersCloseBtn.addEventListener("click", closeCustomerOrdersModal);
    if (els.creditTabs) {
        els.creditTabs.forEach(tab => tab.addEventListener("click", () => setCreditTab(tab.dataset.tab)));
    }
    if (els.refreshCreditSales) els.refreshCreditSales.addEventListener("click", loadCreditSales);
    if (els.refreshCustomerOrders) els.refreshCustomerOrders.addEventListener("click", loadCustomerOrders);
    if (els.creditSearch) els.creditSearch.addEventListener("input", renderCreditSales);
    if (els.customerOrdersSearch) {
        els.customerOrdersSearch.addEventListener("input", () => {
            customerOrdersQuery = els.customerOrdersSearch.value || "";
            loadCustomerOrders();
        });
    }
    if (els.customerOrdersFilters) {
        els.customerOrdersFilters.querySelectorAll(".order-filter").forEach(btn => {
            btn.addEventListener("click", () => setCustomerOrdersFilter(btn.dataset.status));
        });
    }
    if (els.submitPaymentBtn) els.submitPaymentBtn.addEventListener("click", submitPayment);
    if (els.payFullBtn) els.payFullBtn.addEventListener("click", fillFullBalance);
    if (els.paymentAmount) els.paymentAmount.addEventListener("input", validatePaymentInput);
    if (els.creditCustomerSelect) els.creditCustomerSelect.addEventListener("change", loadCustomerCredit);
    if (els.creditAssignedSelect) els.creditAssignedSelect.addEventListener("change", loadAssignedCredit);
    els.authCloseBtn.addEventListener("click", closeAuthModal);
    els.authLoginBtn.addEventListener("click", loginForToken);
    els.refreshHeldBtn.addEventListener("click", loadHeldSales);
    updateAuthStatus();
    applyRoleUI();
    handleCreditToggle(true);
});

// ——— Clock ———
function startClock() {
    const update = () => {
        const now = new Date();
        els.clock.textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };
    update();
    setInterval(update, 1000);
}

// ——— Data Loading ———
async function apiRequest(endpoint, { method = "GET", body = null, auth = true } = {}) {
    const headers = {};
    if (body !== null) {
        headers["Content-Type"] = "application/json";
    }
    if (auth && API_TOKEN) {
        headers["Authorization"] = `Token ${API_TOKEN}`;
    }
    if (auth && method !== "GET") {
        const csrfToken = getCSRFToken();
        if (csrfToken) headers["X-CSRFToken"] = csrfToken;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        credentials: "same-origin",
        body: body !== null ? JSON.stringify(body) : null,
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();

    if (res.status === 401) {
        handleUnauthorized();
        throw new Error("Unauthorized");
    }
    if (res.status === 403) {
        if (!firstProtectedFailure) {
            firstProtectedFailure = { endpoint, status: 403 };
            console.warn("First protected endpoint denied:", endpoint, 403);
        }
        toast("Permission denied", "error");
        throw new Error("Forbidden");
    }
    if (!res.ok) {
        const errMsg = typeof data === "object" ? JSON.stringify(data) : data;
        throw new Error(errMsg || `HTTP ${res.status}`);
    }

    return data;
}

async function apiFetch(endpoint) {
    try {
        return await apiRequest(endpoint);
    } catch (err) {
        console.error(`API error (${endpoint}):`, err);
        return null;
    }
}

async function loadBranches() {
    branches = await apiFetch("/business/branches/") || [];
    els.branchSelect.innerHTML = branches.length
        ? branches.map(b => `<option value="${b.id}">${b.name} — ${b.location}</option>`).join("")
        : `<option value="">No branches found</option>`;
    if (heldSalesCache.length) renderHeldSales(heldSalesCache);
    renderExpenseBranchOptions();
}

async function loadCustomers() {
    customers = await apiFetch("/customers/") || [];
    els.customerSelect.innerHTML = customers.length
        ? customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
        : `<option value="">No customers found</option>`;
    if (heldSalesCache.length) renderHeldSales(heldSalesCache);
    renderLedgerCustomerOptions();
}

function renderExpenseBranchOptions() {
    if (!branches.length) return;
    if (els.ledgerBranch) {
        const options = [`<option value="">All branches</option>`]
            .concat(branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`));
        els.ledgerBranch.innerHTML = options.join("");
    }
    if (els.expenseBranchFilter) {
        const options = [`<option value="">All branches</option>`]
            .concat(branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`));
        els.expenseBranchFilter.innerHTML = options.join("");
    }
    if (els.expenseBranch) {
        const options = [`<option value="">All branches</option>`]
            .concat(branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`));
        els.expenseBranch.innerHTML = options.join("");
    }
}

function renderExpenseCategoryOptions() {
    if (els.expenseCategoryFilter) {
        const options = [`<option value="">All categories</option>`]
            .concat(EXPENSE_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`));
        els.expenseCategoryFilter.innerHTML = options.join("");
    }
    if (els.expenseCategory) {
        const options = [`<option value="">Select category</option>`]
            .concat(EXPENSE_CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`));
        els.expenseCategory.innerHTML = options.join("");
    }
}

async function loadAssignableUsers() {
    if (!els.assignedTo) return;
    assignableUsers = await apiFetch("/accounts/assignable/") || [];
    if (!assignableUsers.length) {
        els.assignedTo.innerHTML = `<option value="">No delivery/sales users found</option>`;
        return;
    }
    els.assignedTo.innerHTML = [
        `<option value="">Select delivery/salesperson</option>`,
        ...assignableUsers.map(u => {
            const label = `${u.display_name || u.username || "User"} (${u.role})`;
            return `<option value="${u.id}">${label}</option>`;
        }),
    ].join("");
    if (currentSaleMeta?.assigned_to) {
        els.assignedTo.value = currentSaleMeta.assigned_to;
    }
}

async function loadProducts() {
    els.productsGrid.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading products...</p>
        </div>`;

    allProducts = await apiFetch("/inventory/products/") || [];
    buildCategoryFilters();
    renderProducts();
}

// ——— Categories ———
function buildCategoryFilters() {
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    activeCategory = "all";
    els.categoryFilters.innerHTML = `
        <button class="cat-btn active" data-category="all">All</button>
        ${categories.map(c => `<button class="cat-btn" data-category="${c}">${c}</button>`).join("")}
    `;
    els.categoryFilters.querySelectorAll(".cat-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            els.categoryFilters.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCategory = btn.dataset.category;
            renderProducts();
        });
    });
}

// ——— Render Products ———
function renderProducts() {
    const query = els.productSearch.value.toLowerCase().trim();
    let filtered = allProducts;

    if (activeCategory !== "all") {
        filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (query) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        els.productsGrid.innerHTML = `<div class="no-results">No products found</div>`;
        return;
    }

    els.productsGrid.innerHTML = filtered.map(p => {
        const stockClass = p.stock <= 0 ? "stock-out" : p.stock <= 10 ? "stock-low" : "stock-ok";
        const stockLabel = p.stock <= 0 ? "Out of stock" : `${p.stock} in stock`;
        return `
            <div class="product-card" data-id="${p.id}" onclick="addToCart('${p.id}')">
                <span class="product-stock ${stockClass}">${stockLabel}</span>
                <span class="product-name">${esc(p.name)}</span>
                <span class="product-sku">SKU: ${esc(p.sku)}</span>
                <span class="product-price">${fmtPrice(p.selling_price)}</span>
            </div>`;
    }).join("");
}

// ——— Cart ———
function addToCart(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    const baseUnit = getBaseUnit(product);
    if (!baseUnit) {
        toast("No base unit configured for this product", "error");
        return;
    }

    if (product.stock <= 0) {
        toast("This product is out of stock", "error");
        return;
    }

    const existing = cart.find(item => item.product.id === productId);
    if (existing) {
        if (existing.qty >= product.stock) {
            toast("Maximum stock reached", "warning");
            return;
        }
        existing.qty++;
    } else {
        cart.push({ product, unit: baseUnit, qty: 1 });
    }

    renderCart();
    updateTotals();
    scheduleReprice();
    toast(`${product.name} added`, "success");
}

function updateQty(productId, delta) {
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.product.id !== productId);
    } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
        toast("Maximum stock reached", "warning");
    }

    renderCart();
    updateTotals();
    scheduleReprice();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.product.id !== productId);
    renderCart();
    updateTotals();
    scheduleReprice();
}

async function clearCart() {
    if (currentSaleId) {
        try {
            await cancelSale(currentSaleId);
        } catch (err) {
            toast(`Clear failed: ${err.message}`, "error");
            return;
        }
    }
    cart = [];
    currentSaleId = null;
    currentSaleMeta = null;
    renderCart();
    updateTotals();
    els.discountInput.value = 0;
    els.amountPaid.value = 0;
    amountPaidDirty = false;
    if (els.creditToggle) {
        els.creditToggle.checked = false;
    }
    handleCreditToggle(true);
    loadHeldSales();
}

function renderCart() {
    if (cart.length === 0) {
        els.cartItems.innerHTML = `
            <div class="empty-cart">
                <span class="empty-icon">🛒</span>
                <p>No items yet</p>
                <p class="hint">Click a product to add it</p>
            </div>`;
        return;
    }

    els.cartItems.innerHTML = cart.map(item => {
        const unitPrice = getItemUnitPrice(item);
        const total = getItemLineTotal(item, unitPrice);
        const priceType = item.price_type_used ? item.price_type_used : "";
        const priceReason = item.pricing_reason ? item.pricing_reason : "";
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${esc(item.product.name)}</div>
                    <div class="cart-item-price">${fmtPrice(unitPrice)} each</div>
                    <div class="cart-item-unit">
                        ${renderUnitSelect(item)}
                        ${priceType ? `<span class="price-badge ${priceType}" title="${esc(priceReason)}">${priceType}</span>` : ""}
                    </div>
                </div>
                <div class="cart-item-qty">
                    <button class="qty-btn" onclick="updateQty('${item.product.id}', -1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="updateQty('${item.product.id}', 1)">+</button>
                </div>
                <span class="cart-item-total">${fmtPrice(total)}</span>
                <button class="cart-item-remove" onclick="removeFromCart('${item.product.id}')" title="Remove">✕</button>
            </div>`;
    }).join("");
}

function isCreditSaleSelected() {
    return !!(els.creditToggle && els.creditToggle.checked);
}

function handleCreditToggle(skipToast = false) {
    const isCredit = isCreditSaleSelected();

    if (isCredit) {
        if (els.saleTypeSelect.value !== "wholesale") {
            els.saleTypeSelect.value = "wholesale";
            currentSaleType = "wholesale";
            if (!skipToast) {
                toast("Credit sales require wholesale sale type.", "info");
            }
        }
    } else {
        if (els.assignedTo) els.assignedTo.value = "";
        if (els.dueDate) els.dueDate.value = "";
    }

    setAmountPaidLabel(isCredit);
    updateCreditSummary();
}

function setAmountPaidLabel(isCredit) {
    if (!els.amountPaidLabel) return;
    els.amountPaidLabel.textContent = isCredit ? "Amount Paid Now" : "Amount Paid";
}

function updateCreditSummary() {
    if (!els.creditFields) return;
    const isCredit = isCreditSaleSelected();

    els.creditFields.classList.toggle("hidden", !isCredit);
    if (els.changeRow) {
        els.changeRow.classList.toggle("hidden", isCredit);
    }

    if (!isCredit) {
        if (els.paymentStatus) els.paymentStatus.textContent = "—";
        if (els.balanceDue) els.balanceDue.textContent = "0.00";
        return;
    }

    const status = currentSaleMeta?.payment_status || "unpaid";
    if (els.paymentStatus) {
        els.paymentStatus.textContent = formatStatus(status);
    }

    const balanceValue = currentSaleMeta?.balance_due ?? currentSaleMeta?.balance;
    if (els.balanceDue) {
        els.balanceDue.textContent = balanceValue !== undefined ? fmtPrice(balanceValue) : "—";
    }

    if (els.dueDate) {
        els.dueDate.value = currentSaleMeta?.due_date || els.dueDate.value || "";
    }
}

// ——— Totals ———
function updateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + parseFloat(getItemLineTotal(item, getItemUnitPrice(item))), 0);
    const tax = subtotal * 0.16;
    const discount = parseFloat(els.discountInput.value) || 0;
    const grandTotal = Math.max(0, subtotal + tax - discount);
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const change = amountPaid - grandTotal;

    els.subtotal.textContent = fmtPrice(subtotal);
    els.taxAmount.textContent = fmtPrice(tax);
    els.grandTotal.textContent = fmtPrice(grandTotal);
    els.changeAmount.textContent = fmtPrice(Math.max(0, change));

    const empty = cart.length === 0;
    const canSell = canPerformSales();
    const completion = getCompletionValidation();
    els.checkoutBtn.disabled = empty || !canSell || !completion.valid;
    els.holdSaleBtn.disabled = empty || !canSell;
    els.clearCartBtn.disabled = !canSell;

    if (POS_DEBUG) {
        posLog("[pos] totals", {
            subtotal,
            tax,
            discount,
            grandTotal,
            amountPaid,
            completion,
            canSell,
            empty,
            checkoutDisabled: els.checkoutBtn.disabled,
            branch: els.branchSelect?.value,
            customer: els.customerSelect?.value,
            saleType: currentSaleType,
            isCredit: isCreditSaleSelected(),
            assignee: els.assignedTo?.value || null,
            saleId: currentSaleId,
        });
    }

    updateCreditSummary();
}

function buildPayload({ status } = {}) {
    const branch = els.branchSelect.value;
    const customer = els.customerSelect.value;
    const discount = parseFloat(els.discountInput.value) || 0;
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const isCredit = isCreditSaleSelected();

    const payload = {
        branch,
        customer,
        sale_type: currentSaleType || "retail",
        ...(status ? { status } : {}),
        discount: discount.toFixed(2),
        amount_paid: amountPaid.toFixed(2),
        items: cart.map(item => ({
            product: item.product.id,
            product_unit: item.unit ? item.unit.id : null,
            quantity: item.qty,
        })),
    };

    if (isCredit) {
        payload.is_credit_sale = true;
        payload.payment_mode = "credit";
        payload.assigned_to = els.assignedTo ? els.assignedTo.value || null : null;
        if (els.dueDate && els.dueDate.value) {
            payload.due_date = els.dueDate.value;
        }
    } else {
        payload.is_credit_sale = false;
    }

    return payload;
}

function validateSaleInputs({ requirePayment = false, debug = false } = {}) {
    const branch = els.branchSelect.value;
    const customer = els.customerSelect.value;
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const grandTotal = parseCurrency(els.grandTotal.textContent);
    if (!branch) {
        toast("Please select a branch", "error");
        if (debug) posLog("[pos] validation failed: missing branch");
        return false;
    }
    if (!customer) {
        toast("Please select a customer", "error");
        if (debug) posLog("[pos] validation failed: missing customer");
        return false;
    }
    if (cart.length === 0) {
        toast("Cart is empty", "error");
        if (debug) posLog("[pos] validation failed: empty cart");
        return false;
    }
    if (isCreditSaleSelected()) {
        if ((currentSaleType || "retail") !== "wholesale") {
            toast("Credit sales must be wholesale", "error");
            if (debug) posLog("[pos] validation failed: credit sale not wholesale");
            return false;
        }
        if (!els.assignedTo || !els.assignedTo.value) {
            toast("Credit sale requires an assigned delivery/salesperson", "error");
            if (debug) posLog("[pos] validation failed: missing assignee");
            return false;
        }
    }
    if (requirePayment) {
        const completion = getCompletionValidation();
        if (!completion.valid) {
            toast(completion.message || "Payment validation failed", "error");
            if (debug) posLog("[pos] validation failed: payment", completion);
            return false;
        }
    }
    return true;
}

function getCompletionValidation() {
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const grandTotal = parseCurrency(els.grandTotal.textContent);
    if (amountPaid < 0) {
        return { valid: false, message: "Amount paid cannot be negative." };
    }
    if (isCreditSaleSelected()) {
        if ((currentSaleType || "retail") !== "wholesale") {
            return { valid: false, message: "Credit sales must be wholesale." };
        }
        if (!els.assignedTo || !els.assignedTo.value) {
            return { valid: false, message: "Credit sale requires an assigned delivery/salesperson." };
        }
    } else {
        if (amountPaid + 0.01 < grandTotal) {
            return { valid: false, message: "Non-credit sales require full payment." };
        }
    }
    return { valid: true };
}

let repriceTimer = null;
function scheduleReprice() {
    if (cart.length === 0) return;
    if (repriceTimer) clearTimeout(repriceTimer);
    repriceTimer = setTimeout(syncDraftPricing, 300);
}

// ——— Credit Center ———
let creditSalesCache = [];
let selectedCreditSale = null;

function openCreditModal() {
    if (!canPerformSales()) {
        toast("You do not have access to credit workflows", "error");
        return;
    }
    if (!els.creditModal) return;
    els.creditModal.classList.remove("hidden");
    setCreditTab("payments");
    loadCreditSales();
    hydrateCreditSelectors();
}

function closeCreditModal() {
    if (!els.creditModal) return;
    els.creditModal.classList.add("hidden");
}

function setCreditTab(tab) {
    if (!els.creditTabs) return;
    els.creditTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    if (els.creditPayments) els.creditPayments.classList.toggle("hidden", tab !== "payments");
    if (els.creditCustomer) els.creditCustomer.classList.toggle("hidden", tab !== "customer");
    if (els.creditAssigned) els.creditAssigned.classList.toggle("hidden", tab !== "assigned");
}

function hydrateCreditSelectors() {
    if (els.creditCustomerSelect) {
        els.creditCustomerSelect.innerHTML = customers.length
            ? `<option value="">Select customer</option>` + customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
            : `<option value="">No customers</option>`;
    }
    if (els.creditAssignedSelect) {
        els.creditAssignedSelect.innerHTML = assignableUsers.length
            ? `<option value="">Select delivery/salesperson</option>` + assignableUsers.map(u => {
                const label = `${u.display_name || u.username} (${u.role})`;
                return `<option value="${u.id}">${label}</option>`;
            }).join("")
            : `<option value="">No delivery/sales users</option>`;
    }
}

async function loadCreditSales() {
    creditSalesCache = await apiFetch("/sales/credit/open/") || [];
    renderCreditSales();
}

function renderCreditSales() {
    if (!els.creditSalesList) return;
    const query = (els.creditSearch?.value || "").toLowerCase().trim();
    let list = creditSalesCache;
    if (query) {
        list = list.filter(sale => {
            const customerName = getCustomerName(sale.customer).toLowerCase();
            return customerName.includes(query) || String(sale.id).includes(query);
        });
    }
    if (!list.length) {
        els.creditSalesList.innerHTML = `<div class="credit-empty">No open credit sales</div>`;
        return;
    }
    els.creditSalesList.innerHTML = list.map(sale => {
        const active = selectedCreditSale && selectedCreditSale.id === sale.id;
        return `
            <div class="credit-sale-item ${active ? "active" : ""}" onclick="selectCreditSale('${sale.id}')">
                <div>
                    <div>${esc(getCustomerName(sale.customer))}</div>
                    <div class="muted">${sale.id}</div>
                    <div class="muted">Due ${sale.due_date || "—"}</div>
                </div>
                <div>
                    <div>${fmtPrice(sale.balance_due ?? sale.balance ?? 0)}</div>
                    <div>${renderStatusBadge(sale.payment_status)}</div>
                </div>
            </div>`;
    }).join("");
}

async function selectCreditSale(saleId) {
    const sale = await apiFetch(`/sales/${saleId}/`);
    if (!sale) return;
    selectedCreditSale = sale;
    renderCreditSales();
    renderCreditSaleDetail(sale);
}

function renderCreditSaleDetail(sale) {
    if (!els.creditSaleDetail) return;
    if (!sale) {
        els.creditSaleDetail.innerHTML = `<div class="credit-empty">Select a sale to view details</div>`;
        return;
    }
    const payments = sale.payments || [];
    const paymentsHtml = payments.length ? payments.map(p => `
        <div class="payment-history-item">
            <span>${fmtPrice(p.amount)} • ${p.payment_method || "cash"}</span>
            <span>${new Date(p.payment_date).toLocaleDateString()}</span>
        </div>
    `).join("") : `<div class="credit-empty">No payments yet</div>`;

    els.creditSaleDetail.innerHTML = `
        <div class="credit-detail-row"><span>Customer</span><strong>${esc(getCustomerName(sale.customer))}</strong></div>
        <div class="credit-detail-row"><span>Total</span><strong>${fmtPrice(sale.grand_total)}</strong></div>
        <div class="credit-detail-row"><span>Amount Paid</span><strong>${fmtPrice(sale.amount_paid)}</strong></div>
        <div class="credit-detail-row"><span>Balance Due</span><strong>${fmtPrice(sale.balance_due ?? sale.balance ?? 0)}</strong></div>
        <div class="credit-detail-row"><span>Due Date</span><strong>${sale.due_date || "—"}</strong></div>
        <div class="credit-detail-row"><span>Status</span><strong>${renderStatusBadge(sale.payment_status)}</strong></div>
        <div class="payment-history">
            <div class="credit-detail-row"><span>Payment History</span></div>
            ${paymentsHtml}
        </div>
    `;
    if (els.paymentAmount) {
        els.paymentAmount.value = "";
    }
    clearPaymentError();
}

function validatePaymentInput() {
    if (!selectedCreditSale) {
        clearPaymentError();
        return;
    }
    const amount = parseFloat(els.paymentAmount?.value || "0");
    const balance = parseFloat(selectedCreditSale.balance_due ?? selectedCreditSale.balance ?? 0);
    if (amount > balance) {
        setPaymentError("Payment cannot exceed balance due.");
    } else if (amount < 0) {
        setPaymentError("Payment must be positive.");
    } else {
        clearPaymentError();
    }
}

async function submitPayment() {
    if (!selectedCreditSale) {
        setPaymentError("Select a credit sale first.");
        toast("Select a credit sale first", "error");
        return;
    }
    const amount = parseFloat(els.paymentAmount?.value || "0");
    if (!amount || amount <= 0) {
        setPaymentError("Payment amount must be positive.");
        toast("Payment amount must be positive", "error");
        return;
    }
    const balance = parseFloat(selectedCreditSale.balance_due ?? selectedCreditSale.balance ?? 0);
    if (amount > balance) {
        setPaymentError("Payment cannot exceed balance due.");
        toast("Payment cannot exceed balance due", "error");
        return;
    }
    clearPaymentError();
    const payload = {
        amount: amount.toFixed(2),
        payment_method: els.paymentMethod?.value || "cash",
        reference: els.paymentReference?.value || "",
        note: els.paymentNote?.value || "",
    };
    try {
        await apiRequest(`/sales/${selectedCreditSale.id}/payments/`, { method: "POST", body: payload });
        toast("Payment recorded", "success");
        if (els.paymentReference) els.paymentReference.value = "";
        if (els.paymentNote) els.paymentNote.value = "";
        await loadCreditSales();
        await selectCreditSale(selectedCreditSale.id);
        await loadCustomerCredit();
        await loadAssignedCredit();
    } catch (err) {
        toast(`Payment failed: ${err.message}`, "error");
    }
}

function fillFullBalance() {
    if (!selectedCreditSale || !els.paymentAmount) {
        toast("Select a credit sale first", "error");
        return;
    }
    const balance = selectedCreditSale.balance_due ?? selectedCreditSale.balance ?? 0;
    els.paymentAmount.value = balance;
    clearPaymentError();
}

function setPaymentError(message) {
    if (els.paymentError) {
        els.paymentError.textContent = message || "";
    }
}

function clearPaymentError() {
    if (els.paymentError) {
        els.paymentError.textContent = "";
    }
}

async function loadCustomerCredit() {
    if (!els.creditCustomerSelect) return;
    const customerId = els.creditCustomerSelect.value;
    if (!customerId) {
        if (els.customerSummary) els.customerSummary.innerHTML = "";
        if (els.customerCreditList) els.customerCreditList.innerHTML = `<div class="credit-empty">Select a customer</div>`;
        return;
    }
    const [summary, list] = await Promise.all([
        apiFetch(`/sales/credit/customer/${customerId}/summary/`),
        apiFetch(`/sales/credit/open/?customer=${customerId}`),
    ]);
    renderCreditSummary(summary, els.customerSummary);
    renderCreditSalesList(list || [], els.customerCreditList);
}

async function loadAssignedCredit() {
    if (!els.creditAssignedSelect) return;
    const userId = els.creditAssignedSelect.value;
    if (!userId) {
        if (els.assignedSummary) els.assignedSummary.innerHTML = "";
        if (els.assignedCreditList) els.assignedCreditList.innerHTML = `<div class="credit-empty">Select a delivery/salesperson</div>`;
        return;
    }
    const [summary, list] = await Promise.all([
        apiFetch(`/sales/credit/assigned/${userId}/summary/`),
        apiFetch(`/sales/credit/open/?assigned_to=${userId}`),
    ]);
    renderCreditSummary(summary, els.assignedSummary);
    renderCreditSalesList(list || [], els.assignedCreditList);
}

function renderCreditSummary(summary, target) {
    if (!target) return;
    if (!summary) {
        target.innerHTML = "";
        return;
    }
    target.innerHTML = `
        <div class="credit-summary-card"><span>Total Outstanding</span><strong>${fmtPrice(summary.total_outstanding || 0)}</strong></div>
        <div class="credit-summary-card"><span>Overdue Balance</span><strong>${fmtPrice(summary.overdue_balance || 0)}</strong></div>
        <div class="credit-summary-card"><span>Open Sales</span><strong>${summary.open_count || 0}</strong></div>
        <div class="credit-summary-card"><span>Overdue Sales</span><strong>${summary.overdue_count || 0}</strong></div>
        <div class="credit-summary-card"><span>Unpaid Sales</span><strong>${summary.unpaid_count || 0}</strong></div>
        <div class="credit-summary-card"><span>Partial Sales</span><strong>${summary.partial_count || 0}</strong></div>
    `;
}

function renderCreditSalesList(list, target) {
    if (!target) return;
    if (!list.length) {
        target.innerHTML = `<div class="credit-empty">No open credit sales</div>`;
        return;
    }
    target.innerHTML = list.map(sale => `
        <div class="credit-sale-item">
            <div>
                <div>${esc(getCustomerName(sale.customer))}</div>
                <div class="muted">${new Date(sale.sale_date).toLocaleDateString()}</div>
                <div class="muted">Due ${sale.due_date || "—"}</div>
            </div>
            <div>
                <div>${fmtPrice(sale.balance_due ?? sale.balance ?? 0)}</div>
                <div>${renderStatusBadge(sale.payment_status)}</div>
            </div>
        </div>
    `).join("");
}


async function syncDraftPricing() {
    if (!validateSaleInputs()) return;
    if (cart.length === 0) return;

    try {
        let saleData;
        if (currentSaleId) {
            saleData = await updateSale(currentSaleId, buildPayload());
        } else {
            saleData = await createSale(buildPayload({ status: "draft" }));
            currentSaleId = saleData.id;
        }

        applySaleDetailToCart(saleData);
        applySaleMeta(saleData, { preserveAmountPaid: true });
        updateTotals();
    } catch (err) {
        console.error("Reprice failed:", err);
    }
}

async function createSale(payload) {
    return apiRequest("/sales/", { method: "POST", body: payload });
}

async function updateSale(saleId, payload) {
    return apiRequest(`/sales/${saleId}/`, { method: "PUT", body: payload });
}

async function completeSale(saleId, payload) {
    return apiRequest(`/sales/${saleId}/complete/`, {
        method: "POST",
        body: {
            discount: payload.discount,
            amount_paid: payload.amount_paid,
        },
    });
}

async function resumeSale(saleId) {
    return apiRequest(`/sales/${saleId}/resume/`, { method: "POST" });
}

async function cancelSale(saleId) {
    return apiRequest(`/sales/${saleId}/cancel/`, { method: "POST" });
}

// ——— Checkout ———
async function checkout() {
    posLog("[pos] checkout click", {
        saleId: currentSaleId,
        branch: els.branchSelect.value,
        customer: els.customerSelect.value,
        amountPaid: els.amountPaid.value,
        cartCount: cart.length,
        saleType: currentSaleType,
        isCredit: isCreditSaleSelected(),
    });
    if (!validateSaleInputs({ requirePayment: true, debug: POS_DEBUG })) {
        posLog("[pos] checkout aborted: validation failed");
        return;
    }

    const payload = buildPayload();

    els.checkoutBtn.disabled = true;
    els.checkoutBtn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Processing...`;

    try {
        let saleId = currentSaleId;
        if (saleId) {
            posLog("[pos] updateSale", saleId);
            await updateSale(saleId, payload);
        } else {
            posLog("[pos] createSale");
            const sale = await createSale(payload);
            saleId = sale.id;
        }

        posLog("[pos] completeSale", saleId);
        await completeSale(saleId, payload);

        posLog("[pos] completeSale success", saleId);
        toast("Sale completed successfully!", "success");
        currentSaleId = null;
        currentSaleMeta = null;
        currentSaleType = "retail";
        showReceipt(saleId);
        loadProducts();
        loadHeldSales();
        await refreshCustomerOrdersAfterSaleComplete(saleId);
    } catch (err) {
        posLog("[pos] checkout error", err?.message || err);
        toast(`Sale failed: ${err.message}`, "error");
    } finally {
        els.checkoutBtn.disabled = false;
        els.checkoutBtn.innerHTML = `<span class="btn-icon">💳</span> Complete Sale`;
    }
}

// ——— Hold Sale ———
async function holdSale() {
    if (!validateSaleInputs()) return;

    const payload = buildPayload({ status: "held" });
    const csrfToken = getCSRFToken();

    try {
        let saleId = currentSaleId;
        if (saleId) {
            await updateSale(saleId, buildPayload());
            const res = await fetch(`${API_BASE}/sales/${saleId}/hold/`, {
                method: "POST",
                headers: {
                    ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
                    ...(API_TOKEN ? { Authorization: `Token ${API_TOKEN}` } : {}),
                },
                credentials: "same-origin",
            });
            const data = await res.json();
            if (!res.ok) {
                const errMsg = typeof data === "object" ? JSON.stringify(data) : data;
                throw new Error(errMsg);
            }
        } else {
            const sale = await createSale(payload);
            saleId = sale.id;
        }

        toast("Sale held", "success");
        currentSaleId = null;
        currentSaleType = "retail";
        clearCart();
        loadHeldSales();
    } catch (err) {
        toast(`Hold failed: ${err.message}`, "error");
    }
}

// ——— Receipt ———
async function showReceipt(saleId) {
    const [receipt, saleDetail] = await Promise.all([
        apiFetch(`/sales/${saleId}/receipt/`),
        apiFetch(`/sales/${saleId}/`),
    ]);
    if (!receipt) {
        toast("Could not load receipt", "error");
        return;
    }

    const itemsHtml = receipt.items.map(item => `
        <div class="receipt-item">
            <span class="receipt-item-name">${esc(item.product)} × ${item.quantity}</span>
            <span class="receipt-item-total">${fmtPrice(item.total)}</span>
        </div>
    `).join("");

    const creditMeta = saleDetail && saleDetail.is_credit_sale ? `
        <div class="receipt-total-row receipt-balance">
            <span>Payment Status</span>
            <span>${formatStatus(saleDetail.payment_status || "unpaid")}</span>
        </div>
        <div class="receipt-total-row receipt-balance">
            <span>Balance Due</span>
            <span>${fmtPrice(saleDetail.balance_due ?? saleDetail.balance ?? 0)}</span>
        </div>
        <div class="receipt-total-row receipt-balance">
            <span>Due Date</span>
            <span>${saleDetail.due_date || "Default (+3 days)"}</span>
        </div>
    ` : "";

    els.receiptContent.innerHTML = `
        <div class="receipt-success">✅</div>
        <div class="receipt-header">
            <h3>Sale Complete</h3>
            <div class="receipt-id">Sale #${receipt.sale_id}</div>
            <div class="receipt-date">${new Date(receipt.date).toLocaleString()}</div>
        </div>
        <hr class="receipt-divider">
        <div class="receipt-items">${itemsHtml}</div>
        <hr class="receipt-divider">
        <div class="receipt-totals">
            <div class="receipt-total-row receipt-grand">
                <span>Total</span>
                <span>${fmtPrice(receipt.total)}</span>
            </div>
            <div class="receipt-total-row receipt-paid">
                <span>Paid</span>
                <span>${fmtPrice(receipt.paid)}</span>
            </div>
            <div class="receipt-total-row receipt-balance">
                <span>Balance</span>
                <span>${fmtPrice(receipt.balance)}</span>
            </div>
            ${creditMeta}
        </div>
    `;

    els.receiptModal.classList.remove("hidden");
}

function newSale() {
    els.receiptModal.classList.add("hidden");
    clearCart();
    currentSaleId = null;
    currentSaleType = "retail";
    els.saleTypeSelect.value = "retail";
    if (els.creditToggle) {
        els.creditToggle.checked = false;
    }
    handleCreditToggle(true);
    repriceTimer && clearTimeout(repriceTimer);
    loadProducts(); // refresh stock counts
    loadHeldSales();
}

// ——— Customer Orders (Staff) ———
function canManageCustomerOrders() {
    return ["cashier", "salesperson", "supervisor", "admin", "deliver_person"].includes(normalizeRole(currentUserRole));
}

function canUpdateCustomerOrders() {
    return ["salesperson", "supervisor", "admin", "deliver_person"].includes(normalizeRole(currentUserRole));
}

function canAssignCustomerOrders() {
    return ["salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canApproveCustomerCredit() {
    return ["salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function openCustomerOrdersModal() {
    customerOrdersLog("[customer-orders] open modal click");
    customerOrdersLog("[customer-orders] auth", { hasToken: Boolean(API_TOKEN), hasUser: Boolean(currentUser), role: currentUserRole });
    if (!API_TOKEN || !currentUser) {
        toast("Please log in to access customer orders", "error");
        openAuthModal();
        return;
    }
    if (!canManageCustomerOrders()) {
        toast("You do not have access to customer orders", "error");
        return;
    }
    if (!els.customerOrdersModal) return;
    els.customerOrdersModal.classList.remove("hidden");
    customerOrdersLog("[customer-orders] modal opened");
    loadCustomerOrders();
    ensureAssignableUsers();
}

function closeCustomerOrdersModal() {
    if (!els.customerOrdersModal) return;
    els.customerOrdersModal.classList.add("hidden");
}

async function ensureAssignableUsers() {
    if (assignableUsers.length) return;
    const users = await apiFetch("/accounts/assignable/");
    assignableUsers = Array.isArray(users) ? users : [];
}

function setCustomerOrdersFilter(status) {
    customerOrdersFilter = status || "all";
    if (els.customerOrdersFilters) {
        els.customerOrdersFilters.querySelectorAll(".order-filter").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.status === customerOrdersFilter);
        });
    }
    loadCustomerOrders();
}

async function loadCustomerOrders() {
    if (!els.customerOrdersList) return;
    customerOrdersFailed = false;
    els.customerOrdersLoading.classList.remove("hidden");
    els.customerOrdersError.classList.add("hidden");
    els.customerOrdersEmpty.classList.add("hidden");

    const params = new URLSearchParams();
    if (customerOrdersFilter && customerOrdersFilter !== "all") {
        params.set("status", customerOrdersFilter);
    }
    if (customerOrdersQuery) {
        params.set("q", customerOrdersQuery);
    }

    const endpoint = `/sales/customer-orders/${params.toString() ? `?${params}` : ""}`;
    customerOrdersLog("[customer-orders] fetch", endpoint);
    const data = await apiFetch(endpoint);
    customerOrdersLog("[customer-orders] response", Array.isArray(data) ? data.length : data);
    if (!data) {
        customerOrdersFailed = true;
        customerOrders = [];
        els.customerOrdersError.textContent = "Unable to load customer orders. Please try again.";
        els.customerOrdersError.classList.remove("hidden");
    } else {
        customerOrders = data;
    }
    els.customerOrdersLoading.classList.add("hidden");
    renderCustomerOrders();
}

function renderCustomerOrders() {
    if (!els.customerOrdersList) return;
    if (customerOrdersFailed) {
        els.customerOrdersList.innerHTML = "";
        return;
    }
    if (!customerOrders.length) {
        els.customerOrdersList.innerHTML = "";
        els.customerOrdersEmpty.classList.remove("hidden");
        return;
    }
    els.customerOrdersEmpty.classList.add("hidden");
    els.customerOrdersList.innerHTML = customerOrders.map(order => {
        const active = selectedCustomerOrder && selectedCustomerOrder.id === order.id;
        const customerName = order.customer?.name || "Customer";
        const branchName = order.branch?.name || "Branch";
        const total = order.sale?.grand_total ?? "0.00";
        const assigned = order.assigned_to?.display_name || "Unassigned";
        const preview = (order.items_preview || []).map(i => `${i.product_name} ×${i.quantity}`).join(", ");
        const creditBadge = renderCreditApprovalBadge(order.credit_approval_status);
        return `
            <div class="order-row ${active ? "active" : ""}" data-order="${order.id}">
                <div class="order-main">
                    <div class="order-top">
                        <div class="order-id">#${shortOrderId(order.id)}</div>
                        ${renderOrderStatusBadge(order.status)}
                    </div>
                    <div class="order-meta">${esc(customerName)} • ${esc(branchName)}</div>
                    <div class="order-meta small">${formatDateTime(order.created_at)}</div>
                    <div class="order-meta small">Assigned: ${esc(assigned)}</div>
                    ${creditBadge}
                    ${preview ? `<div class="order-preview">${esc(preview)}</div>` : ""}
                </div>
                <div class="order-amount">${fmtPrice(total)}</div>
            </div>
        `;
    }).join("");

    els.customerOrdersList.querySelectorAll(".order-row").forEach(row => {
        row.addEventListener("click", () => loadCustomerOrderDetail(row.dataset.order));
    });
}

async function loadCustomerOrderDetail(orderId) {
    if (!orderId) return;
    const order = await apiFetch(`/sales/customer-orders/${orderId}/`);
    if (!order) {
        toast("Failed to load customer order", "error");
        return;
    }
    selectedCustomerOrder = order;
    renderCustomerOrders();
    renderCustomerOrderDetail(order);
}

function renderCustomerOrderDetail(order) {
    if (!els.customerOrderDetail) return;
    if (!order) {
        els.customerOrderDetail.innerHTML = `<div class="orders-detail-empty">Select an order to view details.</div>`;
        return;
    }

    const sale = order.sale || {};
    const saleStatus = sale.status || "";
    const saleCompleted = saleStatus === "completed";
    const customerName = order.customer?.name || "Customer";
    const branchName = order.branch?.name || "Branch";
    const assignedId = order.assigned_to?.id || "";
    const assignedLabel = order.assigned_to?.display_name || "Unassigned";
    const creditStatus = order.credit_approval_status || "not_requested";
    const assigneeOptions = assignableUsers.length
        ? `<option value="">Unassigned</option>` + assignableUsers.map(u => {
            const label = `${u.display_name || u.username} (${u.role})`;
            return `<option value="${u.id}" ${u.id === assignedId ? "selected" : ""}>${label}</option>`;
        }).join("")
        : `<option value="">No delivery/sales users</option>`;

    const itemsHtml = (order.items || []).map(item => `
        <div class="order-item-row">
            <div>
                <div class="item-name">${esc(item.product_name || "Item")}</div>
                <div class="item-meta">${esc(item.unit_name || "Unit")} (${esc(item.unit_code || "-")})</div>
            </div>
            <div class="item-qty">${item.quantity}x</div>
            <div class="item-total">${fmtPrice(item.total_price)}</div>
        </div>
    `).join("");

    const deliveryBlocked = !saleCompleted;
    const actions = renderOrderActions(order.status, { saleCompleted });
    const saleAction = sale.id
        ? saleCompleted
            ? `<div class="sale-completed-note">Linked sale completed.</div>`
            : `
                <button class="btn-secondary" data-open-sale="${sale.id}" ${canPerformSales() ? "" : "disabled"}>
                    Open Linked Sale
                </button>
            `
        : "";
    const creditBadge = renderCreditApprovalBadge(creditStatus);
    const creditActions = renderCreditApprovalActions(order);

    els.customerOrderDetail.innerHTML = `
        <div class="order-detail-card">
            <div class="order-detail-header">
                <div>
                    <div class="order-detail-id">Order #${shortOrderId(order.id)}</div>
                    <div class="order-detail-date">Created ${formatDateTime(order.created_at)}</div>
                </div>
                <div>${renderOrderStatusBadge(order.status)}</div>
            </div>
            <div class="order-detail-grid">
                <div>
                    <div class="label">Customer</div>
                    <div>${esc(customerName)}</div>
                </div>
                <div>
                    <div class="label">Branch</div>
                    <div>${esc(branchName)}</div>
                </div>
                <div>
                    <div class="label">Sale</div>
                    <div>${sale.id ? `#${shortOrderId(sale.id)}` : "—"}</div>
                </div>
                <div>
                    <div class="label">Updated</div>
                    <div>${formatDateTime(order.updated_at)}</div>
                </div>
                <div>
                    <div class="label">Sale Status</div>
                    <div>${sale.id ? renderSaleStatusBadge(saleStatus || "unknown") : "—"}</div>
                </div>
                <div>
                    <div class="label">Sale Completion</div>
                    <div class="sale-completion ${saleCompleted ? "ok" : "blocked"}">
                        ${saleCompleted ? "Completed" : "Not completed"}
                    </div>
                </div>
                <div>
                    <div class="label">Credit</div>
                    <div>${creditBadge || "Not requested"}</div>
                </div>
            </div>
            ${sale.id ? `
                <div class="sale-actions">
                    ${saleAction || ""}
                    ${deliveryBlocked ? `<div class="sale-blocked-note">Complete the linked sale before marking this order delivered.</div>` : ""}
                </div>
            ` : ""}
        </div>
        ${creditActions ? `
            <div class="order-detail-card">
                <div class="credit-approval">
                    <div class="label">Credit Approval</div>
                    ${creditActions}
                </div>
            </div>
        ` : ""}
        <div class="order-detail-card">
            <div class="order-detail-row">
                <div>
                    <div class="label">Assigned To</div>
                    <div class="assigned-current">${esc(assignedLabel)}</div>
                </div>
                <select id="customer-order-assign" class="summary-select" ${canAssignCustomerOrders() ? "" : "disabled"}>
                    ${assigneeOptions}
                </select>
            </div>
        </div>
        <div class="order-detail-card">
            <h4>Items</h4>
            <div class="order-items">${itemsHtml || "<div class='orders-detail-empty'>No items found.</div>"}</div>
        </div>
        <div class="order-detail-card">
            <div class="order-totals">
                <div><span>Subtotal</span><strong>${fmtPrice(sale.total_amount ?? 0)}</strong></div>
                <div><span>Tax</span><strong>${fmtPrice(sale.tax ?? 0)}</strong></div>
                <div class="grand"><span>Total</span><strong>${fmtPrice(sale.grand_total ?? 0)}</strong></div>
                <div><span>Payment</span><strong>${formatStatus(sale.payment_status || "unpaid")}</strong></div>
                <div><span>Balance</span><strong>${fmtPrice(sale.balance_due ?? 0)}</strong></div>
            </div>
        </div>
        <div class="order-detail-card actions">
            ${actions}
        </div>
    `;

    const openSaleBtn = els.customerOrderDetail.querySelector("button[data-open-sale]");
    if (openSaleBtn) {
        openSaleBtn.addEventListener("click", () => openLinkedSale(openSaleBtn.dataset.openSale));
    }

    const assignSelect = document.getElementById("customer-order-assign");
    if (assignSelect && canAssignCustomerOrders()) {
        assignSelect.addEventListener("change", () => {
            updateCustomerOrderAssignee(order.id, assignSelect.value || null);
        });
    }

    els.customerOrderDetail.querySelectorAll("button[data-order-status]").forEach(btn => {
        btn.addEventListener("click", () => updateCustomerOrderStatus(order.id, btn.dataset.orderStatus));
    });

    const approveBtn = els.customerOrderDetail.querySelector("button[data-credit-approve]");
    if (approveBtn) {
        approveBtn.addEventListener("click", () => approveCustomerOrderCredit(order.id));
    }
    const rejectBtn = els.customerOrderDetail.querySelector("button[data-credit-reject]");
    if (rejectBtn) {
        rejectBtn.addEventListener("click", () => {
            const reason = prompt("Reason for rejection (optional):") || "";
            rejectCustomerOrderCredit(order.id, reason);
        });
    }
}

function renderOrderActions(status, { saleCompleted = true } = {}) {
    const actionsMap = {
        pending: [
            { status: "confirmed", label: "Confirm", cls: "btn-primary" },
            { status: "cancelled", label: "Cancel", cls: "btn-danger" },
        ],
        pending_credit_approval: [
            { status: "cancelled", label: "Cancel", cls: "btn-danger" },
        ],
        confirmed: [
            { status: "processing", label: "Mark Processing", cls: "btn-primary" },
            { status: "cancelled", label: "Cancel", cls: "btn-danger" },
        ],
        processing: [
            { status: "out_for_delivery", label: "Out for Delivery", cls: "btn-primary" },
            { status: "cancelled", label: "Cancel", cls: "btn-danger" },
        ],
        out_for_delivery: [
            { status: "delivered", label: "Mark Delivered", cls: "btn-primary" },
            { status: "cancelled", label: "Cancel", cls: "btn-danger" },
        ],
        delivered: [],
        cancelled: [],
    };
    const actions = actionsMap[status] || [];
    if (!actions.length) {
        return `<div class="orders-detail-empty">No actions available.</div>`;
    }
    return actions.map(action => {
        const blockedBySale = action.status === "delivered" && !saleCompleted;
        const disabled = !canUpdateCustomerOrders() || blockedBySale ? "disabled" : "";
        const cls = blockedBySale ? `${action.cls} btn-disabled` : action.cls;
        const title = blockedBySale ? "Complete the linked sale before marking delivered." : "";
        return `
            <button class="${cls}" data-order-status="${action.status}" ${disabled} ${title ? `title="${title}"` : ""}>
                ${action.label}
            </button>
        `;
    }).join("");
}

function renderCreditApprovalActions(order) {
    if (!order) return "";
    const status = order.credit_approval_status || "not_requested";
    if (!order.credit_requested && status === "not_requested") return "";

    if (status === "pending") {
        const disabled = canApproveCustomerCredit() ? "" : "disabled";
        return `
            <div class="credit-approval-note">Customer requested credit approval.</div>
            <div class="credit-approval-buttons">
                <button class="btn-primary" data-credit-approve="${order.id}" ${disabled}>Approve Credit</button>
                <button class="btn-danger" data-credit-reject="${order.id}" ${disabled}>Reject</button>
            </div>
        `;
    }

    if (status === "approved") {
        const approver = order.credit_approved_by?.display_name || "Staff";
        const date = order.credit_approved_at ? formatDateTime(order.credit_approved_at) : "—";
        return `<div class="credit-approval-note success">Approved by ${esc(approver)} on ${esc(date)}.</div>`;
    }

    if (status === "rejected") {
        const reason = order.credit_rejection_reason ? esc(order.credit_rejection_reason) : "No reason provided.";
        return `<div class="credit-approval-note warning">Rejected: ${reason}</div>`;
    }

    return "";
}

async function updateCustomerOrderStatus(orderId, status) {
    if (!canUpdateCustomerOrders()) {
        toast("You do not have permission to update orders", "error");
        return;
    }
    try {
        await apiRequest(`/sales/customer-orders/${orderId}/status/`, {
            method: "PATCH",
            body: { status },
        });
        toast("Order updated", "success");
        await loadCustomerOrders();
        await loadCustomerOrderDetail(orderId);
    } catch (err) {
        toast(`Update failed: ${err.message}`, "error");
    }
}

async function approveCustomerOrderCredit(orderId) {
    if (!canApproveCustomerCredit()) {
        toast("You do not have permission to approve credit", "error");
        return;
    }
    try {
        await apiRequest(`/sales/customer-orders/${orderId}/credit-approve/`, { method: "POST" });
        toast("Credit approved", "success");
        await loadCustomerOrders();
        await loadCustomerOrderDetail(orderId);
    } catch (err) {
        toast(`Credit approval failed: ${err.message}`, "error");
    }
}

async function rejectCustomerOrderCredit(orderId, reason = "") {
    if (!canApproveCustomerCredit()) {
        toast("You do not have permission to reject credit", "error");
        return;
    }
    try {
        await apiRequest(`/sales/customer-orders/${orderId}/credit-reject/`, {
            method: "POST",
            body: { reason },
        });
        toast("Credit rejected", "success");
        await loadCustomerOrders();
        await loadCustomerOrderDetail(orderId);
    } catch (err) {
        toast(`Credit rejection failed: ${err.message}`, "error");
    }
}

async function openLinkedSale(saleId) {
    if (!saleId) return;
    if (!canPerformSales()) {
        toast("You do not have permission to open sales", "error");
        return;
    }
    const sale = await apiFetch(`/sales/${saleId}/`);
    if (!sale) {
        toast("Failed to open linked sale", "error");
        return;
    }
    if (sale.status === "completed") {
        toast("Linked sale is already completed", "info");
        return;
    }
    posLog("[pos] open linked sale", { saleId: sale.id, branch: sale.branch, customer: sale.customer, status: sale.status });
    if (sale.branch && els.branchSelect) {
        const branchOption = Array.from(els.branchSelect.options || []).some(opt => opt.value === sale.branch);
        if (!branchOption) await loadBranches();
        els.branchSelect.value = sale.branch;
    }
    if (sale.customer && els.customerSelect) {
        const customerOption = Array.from(els.customerSelect.options || []).some(opt => opt.value === sale.customer);
        if (!customerOption) await loadCustomers();
        els.customerSelect.value = sale.customer;
    }
    applySaleDetailToCart(sale);
    if (sale.is_credit_sale && !assignableUsers.length) {
        await loadAssignableUsers();
    }
    updateTotals();
    maybeAutofillLinkedSaleAmountPaid(sale);
    closeCustomerOrdersModal();
    toast("Linked sale loaded. Complete the sale to unlock delivery.", "info");
}

function maybeAutofillLinkedSaleAmountPaid(sale) {
    if (!sale || sale.is_credit_sale) return;
    if (!els.amountPaid) return;
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const grandTotal = parseCurrency(els.grandTotal?.textContent || "0");
    if (grandTotal <= 0) return;
    if (amountPaid === 0) {
        els.amountPaid.value = grandTotal.toFixed(2);
        amountPaidDirty = false;
        updateTotals();
        posLog("[pos] autofilled amount paid for linked sale", { grandTotal });
    }
}

async function refreshCustomerOrdersAfterSaleComplete(saleId) {
    if (!saleId) return;
    if (!canManageCustomerOrders()) return;
    if (!els.customerOrdersList) return;
    const activeOrder = selectedCustomerOrder;
    await loadCustomerOrders();
    if (activeOrder && activeOrder.sale?.id === saleId) {
        await loadCustomerOrderDetail(activeOrder.id);
    }
}

async function updateCustomerOrderAssignee(orderId, assignedTo) {
    if (!canAssignCustomerOrders()) {
        toast("You do not have permission to assign orders", "error");
        return;
    }
    try {
        await apiRequest(`/sales/customer-orders/${orderId}/assigned-to/`, {
            method: "PATCH",
            body: { assigned_to: assignedTo },
        });
        toast("Assignment updated", "success");
        await loadCustomerOrders();
        await loadCustomerOrderDetail(orderId);
    } catch (err) {
        toast(`Assignment failed: ${err.message}`, "error");
    }
}

// ——— Ledger (Admin) ———
function canViewLedger() {
    return normalizeRole(currentUserRole) === "admin";
}

function renderLedgerCustomerOptions() {
    if (!els.ledgerCustomer) return;
    const options = [`<option value="">All customers</option>`];
    if (customers.length) {
        options.push(
            ...customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`)
        );
    }
    els.ledgerCustomer.innerHTML = options.join("");
}

function setLedgerTab(tab) {
    const activeTab = tab || "overview";
    if (els.ledgerTabs) {
        els.ledgerTabs.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.ledgerTab === activeTab);
        });
    }
    if (els.ledgerOverviewPanel) {
        els.ledgerOverviewPanel.classList.toggle("hidden", activeTab !== "overview");
    }
    if (els.ledgerExpensesPanel) {
        els.ledgerExpensesPanel.classList.toggle("hidden", activeTab !== "expenses");
    }
    if (activeTab === "expenses") {
        loadExpenses();
    }
}

function buildLedgerParams() {
    const params = new URLSearchParams();
    const start = els.ledgerStart?.value;
    const end = els.ledgerEnd?.value;
    const entryType = els.ledgerType?.value;
    const customerId = els.ledgerCustomer?.value;
    const branchId = els.ledgerBranch?.value;

    if (start) params.set("date_from", start);
    if (end) params.set("date_to", end);
    if (entryType) params.set("entry_type", entryType);
    if (customerId) params.set("customer", customerId);
    if (branchId) params.set("branch", branchId);

    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

function openLedgerModal() {
    if (!API_TOKEN || !currentUser) {
        toast("Please log in to access the ledger", "error");
        openAuthModal();
        return;
    }
    if (!canViewLedger()) {
        toast("You do not have access to the ledger", "error");
        return;
    }
    if (!els.ledgerModal) return;
    renderLedgerCustomerOptions();
    renderExpenseBranchOptions();
    if (els.expenseDate && !els.expenseDate.value) {
        const today = new Date().toISOString().slice(0, 10);
        els.expenseDate.value = today;
    }
    setLedgerTab("overview");
    els.ledgerModal.classList.remove("hidden");
    loadLedger();
}

function closeLedgerModal() {
    if (!els.ledgerModal) return;
    els.ledgerModal.classList.add("hidden");
}

async function loadLedger() {
    if (!els.ledgerList) return;
    ledgerFailed = false;
    if (els.ledgerLoading) els.ledgerLoading.classList.remove("hidden");
    if (els.ledgerError) els.ledgerError.classList.add("hidden");
    if (els.ledgerEmpty) els.ledgerEmpty.classList.add("hidden");

    const params = buildLedgerParams();
    const [entries, summary] = await Promise.all([
        apiFetch(`/ledger/${params}`),
        apiFetch(`/ledger/summary/${params}`),
    ]);

    if (!entries) {
        ledgerFailed = true;
        ledgerEntries = [];
        if (els.ledgerError) {
            els.ledgerError.textContent = "Unable to load ledger entries. Please try again.";
            els.ledgerError.classList.remove("hidden");
        }
    } else {
        ledgerEntries = entries;
    }

    ledgerSummary = summary || null;

    if (els.ledgerLoading) els.ledgerLoading.classList.add("hidden");
    renderLedgerSummary();
    renderLedgerEntries();
}

async function exportFinanceCsv() {
    const params = new URLSearchParams(buildLedgerParams().replace("?", ""));
    if (els.financeExportInclude?.checked) {
        params.set("include_entries", "1");
    }
    const qs = params.toString();
    await downloadCsv(`/finance/export/${qs ? `?${qs}` : ""}`, "finance_export.csv");
}

async function exportExpensesCsv() {
    const params = buildExpenseParams();
    await downloadCsv(`/expenses/export/${params}`, "expenses_export.csv");
}

async function downloadCsv(endpoint, filename) {
    if (!API_TOKEN) {
        toast("Please log in to export", "error");
        return;
    }
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                Authorization: `Token ${API_TOKEN}`,
            },
            credentials: "same-origin",
        });
        if (!res.ok) {
            throw new Error(`Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        toast(err.message || "Export failed", "error");
    }
}

function buildExpenseParams() {
    const params = new URLSearchParams();
    const start = els.expenseStart?.value;
    const end = els.expenseEnd?.value;
    const category = els.expenseCategoryFilter?.value?.trim();
    const branchId = els.expenseBranchFilter?.value;
    if (start) params.set("date_from", start);
    if (end) params.set("date_to", end);
    if (category) params.set("category", category);
    if (branchId) params.set("branch", branchId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

async function loadExpenses() {
    if (!els.expenseList) return;
    expensesFailed = false;
    if (els.expenseLoading) els.expenseLoading.classList.remove("hidden");
    if (els.expenseError) els.expenseError.classList.add("hidden");
    if (els.expenseEmpty) els.expenseEmpty.classList.add("hidden");

    const params = buildExpenseParams();
    const data = await apiFetch(`/expenses/${params}`);
    if (!data) {
        expensesFailed = true;
        expensesList = [];
        if (els.expenseError) {
            els.expenseError.textContent = "Unable to load expenses. Please try again.";
            els.expenseError.classList.remove("hidden");
        }
    } else {
        expensesList = data;
    }
    if (els.expenseLoading) els.expenseLoading.classList.add("hidden");
    renderExpenses();
}

function renderExpenses() {
    if (!els.expenseList) return;
    if (expensesFailed) {
        els.expenseList.innerHTML = "";
        if (els.expenseEmpty) els.expenseEmpty.classList.add("hidden");
        return;
    }
    if (!expensesList.length) {
        els.expenseList.innerHTML = "";
        if (els.expenseEmpty) els.expenseEmpty.classList.remove("hidden");
        return;
    }
    if (els.expenseEmpty) els.expenseEmpty.classList.add("hidden");
    els.expenseList.innerHTML = expensesList.map(exp => {
        const branch = branches.find(b => b.id === exp.branch);
        const branchName = branch ? branch.name : (exp.branch ? "Branch" : "All");
        const categoryKey = (exp.category || "").toString().trim().toLowerCase();
        const categoryLabel = EXPENSE_CATEGORIES.find(c => c.value === categoryKey)?.label || exp.category || "Miscellaneous";
        const categoryClass = categoryKey ? `expense-cat-${categoryKey}` : "expense-cat-miscellaneous";
        return `
            <div class="ledger-row">
                <div class="ledger-main">
                    <div class="ledger-top">
                        <span class="ledger-type-badge expense-badge ${categoryClass}">${categoryLabel}</span>
                        <span class="ledger-meta">${formatDateTime(exp.date || exp.created_at)}</span>
                    </div>
                    <div class="ledger-meta">${esc(categoryLabel)} • ${esc(branchName)}</div>
                    ${exp.reference ? `<div class="ledger-ref">${esc(exp.reference)}</div>` : ""}
                    ${exp.description ? `<div class="ledger-ref">${esc(exp.description)}</div>` : ""}
                </div>
                <div class="ledger-amount out">-${fmtPrice(exp.amount || 0)}</div>
            </div>
        `;
    }).join("");
}

async function createExpense() {
    if (!canViewLedger()) {
        toast("You do not have access to create expenses", "error");
        return;
    }
    if (!els.expenseAmount || !els.expenseCategory) return;
    const payload = {
        date: els.expenseDate?.value || undefined,
        amount: els.expenseAmount.value,
        category: els.expenseCategory.value,
        description: els.expenseDescription?.value?.trim() || "",
        reference: els.expenseReference?.value?.trim() || "",
        branch: els.expenseBranch?.value || null,
    };
    if (!payload.category) {
        if (els.expenseFormError) {
            els.expenseFormError.textContent = "Category is required.";
            els.expenseFormError.classList.remove("hidden");
        }
        return;
    }
    try {
        if (els.expenseFormError) els.expenseFormError.classList.add("hidden");
        await apiRequest("/expenses/", { method: "POST", body: payload });
        toast("Expense added", "success");
        if (els.expenseAmount) els.expenseAmount.value = "";
        if (els.expenseCategory) els.expenseCategory.value = "";
        if (els.expenseDescription) els.expenseDescription.value = "";
        if (els.expenseReference) els.expenseReference.value = "";
        loadExpenses();
        loadLedger();
    } catch (err) {
        if (els.expenseFormError) {
            els.expenseFormError.textContent = err.message || "Unable to add expense.";
            els.expenseFormError.classList.remove("hidden");
        }
    }
}

function renderLedgerSummary() {
    if (!els.ledgerSummary) return;
    if (!ledgerSummary) {
        els.ledgerSummary.innerHTML = `<div class="orders-error">Summary unavailable.</div>`;
        return;
    }

    const summary = ledgerSummary;
    els.ledgerSummary.innerHTML = `
        <div class="ledger-section">
            <div class="ledger-section-title">Sales</div>
            <div class="ledger-summary-grid">
                <div class="ledger-summary-card">
                    <span>Sales Today</span>
                    <strong>${fmtPrice(summary.sales_today || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Sales This Week</span>
                    <strong>${fmtPrice(summary.sales_week || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Sales This Month</span>
                    <strong>${fmtPrice(summary.sales_month || 0)}</strong>
                </div>
            </div>
        </div>
        <div class="ledger-section">
            <div class="ledger-section-title">Collections / Inflow</div>
            <div class="ledger-summary-grid">
                <div class="ledger-summary-card">
                    <span>Collected Today</span>
                    <strong>${fmtPrice(summary.collected_today || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Credit Collected</span>
                    <strong>${fmtPrice(summary.credit_collected_total || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Total Collected This Month</span>
                    <strong>${fmtPrice(summary.collected_month || 0)}</strong>
                </div>
            </div>
        </div>
        <div class="ledger-section">
            <div class="ledger-section-title">Credit Position</div>
            <div class="ledger-summary-grid">
                <div class="ledger-summary-card">
                    <span>Outstanding Credit</span>
                    <strong>${fmtPrice(summary.outstanding_credit || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Overdue Credit</span>
                    <strong>${fmtPrice(summary.overdue_credit || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Credit Issued This Month</span>
                    <strong>${fmtPrice(summary.credit_issued_month || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Credit Recovered This Month</span>
                    <strong>${fmtPrice(summary.credit_recovered_month || 0)}</strong>
                </div>
            </div>
        </div>
        <div class="ledger-section">
            <div class="ledger-section-title">Expenses</div>
            <div class="ledger-summary-grid">
                <div class="ledger-summary-card">
                    <span>Expenses Today</span>
                    <strong>${fmtPrice(summary.expenses_today || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Expenses This Month</span>
                    <strong>${fmtPrice(summary.expenses_month || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Net Position (Collected − Expenses)</span>
                    <strong>${fmtPrice(summary.net_position || 0)}</strong>
                </div>
            </div>
        </div>
    `;
}

function formatLedgerType(type) {
    const normalized = (type || "").toString().toLowerCase();
    const map = {
        sale_payment: "Sale Payment",
        credit_payment: "Credit Payment",
        manual_adjustment: "Manual Adjustment",
        refund: "Refund",
    };
    return map[normalized] || formatStatus(normalized).replace(/_/g, " ");
}

function renderLedgerEntries() {
    if (!els.ledgerList) return;
    if (ledgerFailed) {
        els.ledgerList.innerHTML = "";
        if (els.ledgerEmpty) els.ledgerEmpty.classList.add("hidden");
        return;
    }

    if (!ledgerEntries.length) {
        els.ledgerList.innerHTML = "";
        if (els.ledgerEmpty) els.ledgerEmpty.classList.remove("hidden");
        return;
    }

    if (els.ledgerEmpty) els.ledgerEmpty.classList.add("hidden");

    els.ledgerList.innerHTML = ledgerEntries.map(entry => {
        const direction = (entry.direction || "in").toString().toLowerCase();
        const sign = direction === "out" ? "-" : "+";
        const customer = entry.customer_name || "—";
        const actor = entry.actor_name || "—";
        const refs = [
            entry.sale_id ? `Sale #${shortOrderId(entry.sale_id)}` : "",
            entry.payment_id ? `Payment #${shortOrderId(entry.payment_id)}` : "",
        ].filter(Boolean).join(" • ");
        const description = entry.description ? esc(entry.description) : "";

        return `
            <div class="ledger-row">
                <div class="ledger-main">
                    <div class="ledger-top">
                        <span class="ledger-type-badge">${formatLedgerType(entry.entry_type)}</span>
                        <span class="ledger-meta">${formatDateTime(entry.created_at)}</span>
                    </div>
                    <div class="ledger-meta">${esc(customer)} • ${esc(actor)}</div>
                    ${refs ? `<div class="ledger-ref">${esc(refs)}</div>` : ""}
                    ${description ? `<div class="ledger-ref">${description}</div>` : ""}
                </div>
                <div class="ledger-amount ${direction}">${sign}${fmtPrice(entry.amount)}</div>
            </div>
        `;
    }).join("");
}

// ——— Held Sales ———
async function loadHeldSales() {
    if (!canPerformSales()) {
        heldSalesCache = [];
        renderHeldSales([]);
        return;
    }
    const held = await apiFetch("/sales/held/");
    if (!held) {
        heldSalesCache = [];
        renderHeldSales([]);
        return;
    }
    heldSalesCache = held;
    renderHeldSales(heldSalesCache);
}

function renderHeldSales(heldSales) {
    if (!els.heldSalesList) return;
    if (!heldSales.length) {
        els.heldSalesList.innerHTML = `<div class="held-empty">No held sales</div>`;
        return;
    }

    const customerName = (id) => {
        const c = customers.find(x => x.id === id);
        return c ? c.name : "Customer";
    };

    const branchName = (id) => {
        const b = branches.find(x => x.id === id);
        return b ? b.name : "Branch";
    };

    els.heldSalesList.innerHTML = heldSales.map(sale => {
        const total = sale.grand_total || "0.00";
        return `
            <div class="held-item" onclick="resumeHeldSale('${sale.id}')">
                <div class="held-info">
                    <div class="held-title">${customerName(sale.customer)}</div>
                    <div class="held-meta">${branchName(sale.branch)} • ${sale.sale_type || "retail"} • ${new Date(sale.updated_at || sale.sale_date).toLocaleString()}</div>
                </div>
                <div class="held-total">${fmtPrice(total)}</div>
            </div>
        `;
    }).join("");
}

async function resumeHeldSale(saleId) {
    let sale;
    try {
        sale = await resumeSale(saleId);
    } catch (err) {
        toast(`Unable to resume sale: ${err.message}`, "error");
        return;
    }

    if (!allProducts.length) {
        await loadProducts();
    }

    const items = sale.items || [];
    cart = items.map(item => {
        const product = allProducts.find(p => p.id === item.product) || {
            id: item.product,
            name: "Unknown Product",
            selling_price: item.unit_price,
            sku: "",
            stock: 0,
            units: [],
        };
        const unit = (product.units || []).find(u => u.id === item.product_unit) || {
            id: item.product_unit,
            unit_code: "unit",
            retail_price: item.unit_price,
            conversion_to_base_unit: item.conversion_snapshot || 1,
            is_base_unit: true,
        };
        return {
            product,
            unit,
            qty: item.quantity,
            unit_price_snapshot: item.unit_price,
            total_price_snapshot: item.total_price,
            price_type_used: item.price_type_used,
            pricing_reason: item.pricing_reason,
            conversion_snapshot: item.conversion_snapshot,
            base_quantity: item.base_quantity,
        };
    });

    els.branchSelect.value = sale.branch;
    els.customerSelect.value = sale.customer;
    els.saleTypeSelect.value = sale.sale_type || "retail";
    els.discountInput.value = sale.discount || 0;
    els.amountPaid.value = sale.amount_paid || 0;
    amountPaidDirty = false;

    currentSaleId = sale.id;
    currentSaleType = sale.sale_type || "retail";
    applySaleMeta(sale);
    handleCreditToggle(true);
    renderCart();
    updateTotals();
    toast("Held sale resumed", "info");
    loadHeldSales();
}

// ——— Utilities ———
function fmtPrice(value) {
    return `KSh ${parseFloat(value).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortOrderId(id) {
    if (!id) return "—";
    return id.toString().split("-")[0].toUpperCase();
}

function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-KE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatStatus(status) {
    if (!status) return "—";
    const text = status.toString().toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderStatusBadge(status) {
    const normalized = (status || "unpaid").toString().toLowerCase();
    const label = formatStatus(normalized);
    return `<span class="status-badge status-${normalized}">${label}</span>`;
}

function renderOrderStatusBadge(status) {
    const normalized = (status || "pending").toString().toLowerCase();
    const label = formatStatus(normalized).replace(/_/g, " ");
    return `<span class="status-badge status-order status-order-${normalized}">${label}</span>`;
}

function renderSaleStatusBadge(status) {
    const normalized = (status || "unknown").toString().toLowerCase();
    const label = formatStatus(normalized).replace(/_/g, " ");
    return `<span class="status-badge status-sale status-sale-${normalized}">${label}</span>`;
}

function renderCreditApprovalBadge(status) {
    if (!status || status === "not_requested") return "";
    const normalized = status.toString().toLowerCase();
    const labelMap = {
        pending: "Credit pending",
        approved: "Credit approved",
        rejected: "Credit rejected",
    };
    const label = labelMap[normalized] || "Credit";
    return `<span class="status-badge status-credit status-credit-${normalized}">${label}</span>`;
}

function parseCurrency(text) {
    if (!text) return 0;
    const cleaned = text.toString().replace(/[^\d.-]/g, "");
    const value = parseFloat(cleaned);
    return Number.isNaN(value) ? 0 : value;
}

function debounce(fn, delay = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function esc(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    els.toastContainer.appendChild(el);

    setTimeout(() => {
        el.classList.add("toast-exit");
        el.addEventListener("animationend", () => el.remove());
    }, 3000);
}

function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content && meta.content !== "NOTPROVIDED") {
        return meta.content;
    }
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
}

function getBaseUnit(product) {
    if (!product || !Array.isArray(product.units)) return null;
    return product.units.find(u => u.is_base_unit) || product.units[0] || null;
}

function getCustomerName(customerId) {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : "Customer";
}

function getItemUnitPrice(item) {
    if (item.unit_price_snapshot) return item.unit_price_snapshot;
    if (item.unit_price_override) return item.unit_price_override;
    if (item.unit && item.unit.retail_price) return item.unit.retail_price;
    return item.product.selling_price;
}

function getItemLineTotal(item, unitPrice) {
    if (item.total_price_snapshot) return item.total_price_snapshot;
    return (parseFloat(unitPrice) * item.qty).toFixed(2);
}

function renderUnitSelect(item) {
    const units = item.product.units || [];
    if (!units.length) {
        return `<span class="cart-unit-label">unit</span>`;
    }
    const options = units.map(u => {
        const selected = item.unit && item.unit.id === u.id ? "selected" : "";
        return `<option value="${u.id}" ${selected}>${u.unit_code}</option>`;
    }).join("");
    return `<select class="unit-select" onchange="setItemUnit('${item.product.id}', this.value)">${options}</select>`;
}

function setItemUnit(productId, unitId) {
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;
    const unit = (item.product.units || []).find(u => u.id === unitId);
    if (!unit) return;
    item.unit = unit;
    item.unit_price_snapshot = null;
    item.total_price_snapshot = null;
    item.price_type_used = null;
    renderCart();
    updateTotals();
    scheduleReprice();
}

function applySaleDetailToCart(sale) {
    if (!sale || !Array.isArray(sale.items)) return;
    currentSaleId = sale.id;
    currentSaleType = sale.sale_type || currentSaleType;
    els.saleTypeSelect.value = currentSaleType;

    const updated = sale.items.map(si => {
        const product = allProducts.find(p => p.id === si.product) || {
            id: si.product,
            name: "Unknown Product",
            selling_price: si.unit_price,
            sku: "",
            stock: 0,
            units: [],
        };
        const unit = (product.units || []).find(u => u.id === si.product_unit) || {
            id: si.product_unit,
            unit_code: "unit",
            retail_price: si.unit_price,
            conversion_to_base_unit: si.conversion_snapshot || 1,
            is_base_unit: true,
        };

        return {
            product,
            unit,
            qty: si.quantity,
            unit_price_snapshot: si.unit_price,
            total_price_snapshot: si.total_price,
            price_type_used: si.price_type_used,
            pricing_reason: si.pricing_reason,
            conversion_snapshot: si.conversion_snapshot,
            base_quantity: si.base_quantity,
        };
    });

    cart = updated;
    renderCart();
    applySaleMeta(sale);
}

function applySaleMeta(sale, { preserveAmountPaid = false } = {}) {
    if (!sale) return;
    currentSaleMeta = sale;
    if (els.amountPaid && sale.amount_paid !== undefined && sale.amount_paid !== null) {
        if (!preserveAmountPaid || !amountPaidDirty) {
            els.amountPaid.value = sale.amount_paid;
            amountPaidDirty = false;
        }
    }
    if (els.discountInput && sale.discount !== undefined && sale.discount !== null) {
        els.discountInput.value = sale.discount;
    }
    if (els.creditToggle) {
        els.creditToggle.checked = !!sale.is_credit_sale;
    }
    if (els.assignedTo && sale.assigned_to) {
        els.assignedTo.value = sale.assigned_to;
    }
    if (els.dueDate) {
        els.dueDate.value = sale.due_date || "";
    }
    handleCreditToggle(true);
}

function setApiToken(token) {
    API_TOKEN = token || "";
    if (API_TOKEN) {
        localStorage.setItem("pos_api_token", API_TOKEN);
    } else {
        localStorage.removeItem("pos_api_token");
    }
    updateAuthStatus();
}

function setUserRole(role) {
    currentUserRole = normalizeRole(role);
    if (currentUserRole) {
        localStorage.setItem("pos_user_role", currentUserRole);
    } else {
        localStorage.removeItem("pos_user_role");
    }
    updateAuthStatus();
    applyRoleUI();
}

function setCurrentUser(user) {
    currentUser = user || null;
    setUserRole(currentUser ? currentUser.role : "");
    updateAuthStatus();
}

function updateAuthStatus() {
    if (!els.authStatus) return;
    if (currentUser) {
        const name = currentUser.display_name || currentUser.username || currentUser.email || "User";
        const roleText = currentUserRole ? ` • ${currentUserRole}` : "";
        els.authStatus.textContent = `Logged in as ${name}${roleText}`;
        els.authStatus.style.color = "var(--success)";
    } else if (API_TOKEN) {
        const masked = `${API_TOKEN.slice(0, 6)}...${API_TOKEN.slice(-4)}`;
        els.authStatus.textContent = `Token saved (${masked})`;
        els.authStatus.style.color = "var(--success)";
    } else {
        els.authStatus.textContent = "Not logged in";
        els.authStatus.style.color = "var(--text-secondary)";
    }
}

function openAuthModal() {
    if (!els.authModal) return;
    els.authModal.classList.remove("hidden");
}

function closeAuthModal() {
    if (!els.authModal) return;
    els.authModal.classList.add("hidden");
}

async function bootstrapAuth() {
    if (!API_TOKEN) {
        clearAuth();
        openAuthModal();
        return;
    }
    try {
        const user = await apiRequest("/auth/me/");
        console.debug("auth.me response:", user);
        setCurrentUser(user);
        await loadInitialData();
    } catch (err) {
        clearAuth();
        openAuthModal();
    }
}

async function loadInitialData() {
    if (!canPerformSales()) {
        if (!canManageCustomerOrders()) {
            toast("Logged in successfully, but your role does not have POS access.", "error");
            applyRoleUI();
            return;
        }
        applyRoleUI();
        return;
    }
    await Promise.all([
        loadBranches(),
        loadCustomers(),
        loadAssignableUsers(),
        loadProducts(),
        loadHeldSales(),
    ]);
}

function handleUnauthorized() {
    clearAuth();
    toast("Session expired. Please log in again.", "error");
    openAuthModal();
}

async function loginForToken() {
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    if (!username || !password) {
        toast("Username and password required", "error");
        return;
    }

    try {
        const data = await apiRequest("/auth/token/", {
            method: "POST",
            body: { username, password },
            auth: false,
        });
        if (!data.token) {
            throw new Error("Login failed");
        }
        console.debug("auth.token success:", { user_id: data.user_id, username: data.username, role: data.role });
        setApiToken(data.token);
        setCurrentUser({
            user_id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role,
            display_name: data.display_name,
        });
        toast("Logged in", "success");
        closeAuthModal();
        await loadInitialData();
        hydrateCreditSelectors();
    } catch (err) {
        toast(`Auth failed: ${err.message}`, "error");
    }
}

function clearAuth() {
    setApiToken("");
    setUserRole("");
    currentUser = null;
    firstProtectedFailure = null;
    updateAuthStatus();
    applyRoleUI();
    if (els.creditModal) els.creditModal.classList.add("hidden");
    if (els.customerOrdersModal) els.customerOrdersModal.classList.add("hidden");
    if (els.ledgerModal) els.ledgerModal.classList.add("hidden");
}

function logout() {
    clearAuth();
    toast("Logged out", "info");
    openAuthModal();
}

function canPerformSales() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function applyRoleUI() {
    const canSell = canPerformSales();
    if (els.checkoutBtn) els.checkoutBtn.disabled = !canSell;
    if (els.holdSaleBtn) els.holdSaleBtn.disabled = !canSell;
    if (els.clearCartBtn) els.clearCartBtn.disabled = !canSell;
    if (els.newSaleBtn) els.newSaleBtn.disabled = !canSell;
    if (els.creditToggle) els.creditToggle.disabled = !canSell;
    if (els.assignedTo) els.assignedTo.disabled = !canSell;
    if (els.dueDate) els.dueDate.disabled = !canSell;
    if (els.heldSalesList) {
        els.heldSalesList.closest(".held-sales")?.classList.toggle("hidden", !canSell);
    }
    if (els.refreshHeldBtn) {
        els.refreshHeldBtn.disabled = !canSell;
    }
    if (els.creditBtn) {
        els.creditBtn.disabled = !canSell;
    }
    if (els.customerOrdersBtn) {
        const canManage = canManageCustomerOrders();
        els.customerOrdersBtn.classList.toggle("btn-disabled", !canManage);
        els.customerOrdersBtn.setAttribute("aria-disabled", canManage ? "false" : "true");
    }
    if (els.ledgerBtn) {
        const canView = canViewLedger();
        els.ledgerBtn.classList.toggle("hidden", !canView);
        els.ledgerBtn.setAttribute("aria-disabled", canView ? "false" : "true");
    }
}

function normalizeRole(role) {
    return (role || "").toString().trim().toLowerCase();
}
