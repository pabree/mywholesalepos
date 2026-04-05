const API_BASE = "/api";
const TOKEN_KEY = "customer_api_token";
const USER_KEY = "customer_user";
const CART_KEY = "customer_cart";
const BRANCH_KEY = "customer_branch";
const INSTALL_DISMISS_KEY = "customer_install_dismissed";

let apiToken = localStorage.getItem(TOKEN_KEY) || "";
let currentUser = JSON.parse(localStorage.getItem(USER_KEY) || "null");
let branches = [];
let catalog = [];
let orders = [];
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
let selectedBranch = localStorage.getItem(BRANCH_KEY) || "";
let selectedUnits = {};
let orderDetailPoll = null;
let currentOrderId = null;
let ordersLoadFailed = false;
let deferredInstallPrompt = null;
let ordersOffset = 0;
let ordersPage = { count: 0, next: null, previous: null, results: [] };
let approvalPending = false;
let authMode = "login";

const ORDERS_LIMIT = 20;
const BULK_FETCH_LIMIT = 100;

const ORDER_STATUS_STEPS = [
    "pending",
    "pending_credit_approval",
    "confirmed",
    "processing",
    "out_for_delivery",
    "delivered",
];

const ORDER_STATUS_META = {
    pending: { label: "Pending", badge: "badge-muted" },
    pending_credit_approval: { label: "Pending credit approval", badge: "badge-blue" },
    confirmed: { label: "Confirmed", badge: "badge-blue" },
    processing: { label: "Processing", badge: "badge-orange" },
    out_for_delivery: { label: "Out for delivery", badge: "badge-purple" },
    delivered: { label: "Delivered", badge: "badge-green" },
    cancelled: { label: "Cancelled", badge: "badge-red" },
};

const els = {
    screens: document.querySelectorAll("[data-screen]"),
    navButtons: document.querySelectorAll(".nav-btn"),
    loginUsername: document.getElementById("login-username"),
    loginPassword: document.getElementById("login-password"),
    loginBtn: document.getElementById("login-btn"),
    loginStatus: document.getElementById("login-status"),
    approvalStatus: document.getElementById("approval-status"),
    checkApprovalBtn: document.getElementById("check-approval-btn"),
    authTabLogin: document.getElementById("auth-tab-login"),
    authTabSignup: document.getElementById("auth-tab-signup"),
    loginPanel: document.getElementById("login-panel"),
    signupPanel: document.getElementById("signup-panel"),
    signupName: document.getElementById("signup-name"),
    signupEmail: document.getElementById("signup-email"),
    signupPhone: document.getElementById("signup-phone"),
    signupUsername: document.getElementById("signup-username"),
    signupPassword: document.getElementById("signup-password"),
    signupBtn: document.getElementById("signup-btn"),
    signupStatus: document.getElementById("signup-status"),
    logoutBtn: document.getElementById("logout-btn"),
    branchSelect: document.getElementById("branch-select"),
    branchPill: document.getElementById("branch-pill"),
    catalogSearch: document.getElementById("catalog-search"),
    catalogGrid: document.getElementById("catalog-grid"),
    catalogEmpty: document.getElementById("catalog-empty"),
    catalogLoading: document.getElementById("catalog-loading"),
    cartItems: document.getElementById("cart-items"),
    cartEmpty: document.getElementById("cart-empty"),
    cartTotal: document.getElementById("cart-total"),
    cartCount: document.getElementById("cart-count"),
    clearCart: document.getElementById("clear-cart"),
    placeOrder: document.getElementById("place-order"),
    cartStatus: document.getElementById("cart-status"),
    creditRequest: document.getElementById("credit-request"),
    ordersList: document.getElementById("orders-list"),
    ordersEmpty: document.getElementById("orders-empty"),
    ordersLoading: document.getElementById("orders-loading"),
    ordersError: document.getElementById("orders-error"),
    refreshOrders: document.getElementById("refresh-orders"),
    ordersPrev: document.getElementById("orders-prev"),
    ordersNext: document.getElementById("orders-next"),
    ordersPage: document.getElementById("orders-page"),
    orderDetail: document.getElementById("order-detail"),
    orderDetailEmpty: document.getElementById("order-detail-empty"),
    backToOrders: document.getElementById("back-to-orders"),
    toastContainer: document.getElementById("toast-container"),
    balanceCard: document.getElementById("balance-card"),
    accountInfo: document.getElementById("account-info"),
    accountName: document.getElementById("account-name"),
    accountRole: document.getElementById("account-role"),
    switchAccount: document.getElementById("switch-account"),
    installBanner: document.getElementById("install-banner"),
    installBtn: document.getElementById("install-btn"),
    installDismiss: document.getElementById("install-dismiss"),
    installTitle: document.getElementById("install-title"),
    installSubtitle: document.getElementById("install-subtitle"),
};

function init() {
    bindEvents();
    renderCart();
    updateCartCount();
    route();
    window.addEventListener("hashchange", route);
    bootstrapAuth();
    registerServiceWorker();
    setupInstallPrompt();
    setupNetworkEvents();
}

function bindEvents() {
    els.loginBtn.addEventListener("click", login);
    els.signupBtn?.addEventListener("click", signup);
    els.authTabLogin?.addEventListener("click", () => setAuthMode("login"));
    els.authTabSignup?.addEventListener("click", () => setAuthMode("signup"));
    els.checkApprovalBtn?.addEventListener("click", () => checkApprovalStatus({ notify: true }));
    els.logoutBtn.addEventListener("click", logout);
    els.switchAccount?.addEventListener("click", switchAccount);
    els.branchSelect.addEventListener("change", handleBranchChange);
    els.catalogSearch.addEventListener("input", renderCatalog);
    els.clearCart.addEventListener("click", clearCart);
    els.placeOrder.addEventListener("click", placeOrder);
    els.refreshOrders.addEventListener("click", () => {
        ordersOffset = 0;
        loadOrders();
    });
    if (els.ordersPrev) {
        els.ordersPrev.addEventListener("click", () => {
            if (ordersOffset <= 0) return;
            ordersOffset = Math.max(0, ordersOffset - ORDERS_LIMIT);
            loadOrders();
        });
    }
    if (els.ordersNext) {
        els.ordersNext.addEventListener("click", () => {
            if (ordersOffset + ORDERS_LIMIT >= ordersPage.count) return;
            ordersOffset += ORDERS_LIMIT;
            loadOrders();
        });
    }
    els.backToOrders.addEventListener("click", () => navigate("orders"));
    els.navButtons.forEach(btn => btn.addEventListener("click", () => {
        const target = btn.dataset.nav;
        if (target === "account") {
            navigate("login");
            return;
        }
        navigate(target);
    }));
}

function setAuthMode(mode) {
    authMode = mode;
    if (els.authTabLogin) els.authTabLogin.classList.toggle("active", mode === "login");
    if (els.authTabSignup) els.authTabSignup.classList.toggle("active", mode === "signup");
    if (els.loginPanel) els.loginPanel.classList.toggle("hidden", mode !== "login");
    if (els.signupPanel) els.signupPanel.classList.toggle("hidden", mode !== "signup");
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    navigator.serviceWorker.register("/customer/sw.js", { scope: "/customer/" }).catch(() => {
        // Silent fail: app still works without offline shell cache.
    });
}

function setupInstallPrompt() {
    if (!els.installBanner) return;
    const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
    if (dismissed || isStandaloneMode()) return;

    if (els.installDismiss) {
        els.installDismiss.addEventListener("click", () => {
            localStorage.setItem(INSTALL_DISMISS_KEY, "1");
            hideInstallBanner();
        });
    }

    if (els.installBtn) {
        els.installBtn.addEventListener("click", async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            try {
                const choice = await deferredInstallPrompt.userChoice;
                if (choice) {
                    localStorage.setItem(INSTALL_DISMISS_KEY, "1");
                }
            } finally {
                deferredInstallPrompt = null;
                hideInstallBanner();
            }
        });
    }

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        showInstallBanner("prompt");
    });

    window.addEventListener("appinstalled", () => {
        localStorage.setItem(INSTALL_DISMISS_KEY, "1");
        hideInstallBanner();
    });

    if (isIos() && !deferredInstallPrompt) {
        showInstallBanner("ios");
    }
}

function setupNetworkEvents() {
    window.addEventListener("offline", () => {
        toast("You're offline. Some features may be unavailable.", "error");
    });
    window.addEventListener("online", () => {
        toast("Back online.", "success");
    });
}

function showInstallBanner(mode = "prompt") {
    if (!els.installBanner) return;
    els.installBanner.classList.remove("hidden");
    if (mode === "ios") {
        if (els.installTitle) els.installTitle.textContent = "Add to Home Screen";
        if (els.installSubtitle) {
            els.installSubtitle.textContent = "Tap Share and choose \"Add to Home Screen\".";
        }
        if (els.installBtn) els.installBtn.classList.add("hidden");
        return;
    }
    if (els.installTitle) els.installTitle.textContent = "Install WholesalePOS";
    if (els.installSubtitle) {
        els.installSubtitle.textContent = "Add to your home screen for faster ordering.";
    }
    if (els.installBtn) els.installBtn.classList.remove("hidden");
}

function hideInstallBanner() {
    if (!els.installBanner) return;
    els.installBanner.classList.add("hidden");
}

function isStandaloneMode() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIos() {
    const ua = navigator.userAgent || "";
    return /iphone|ipad|ipod/i.test(ua);
}

function route() {
    if (!isAuthenticated()) {
        stopOrderDetailPolling();
        showScreen("login");
        setNavActive("account");
        return;
    }
    const hash = location.hash.replace("#", "");
    if (hash.startsWith("order/")) {
        const orderId = hash.split("/")[1];
        showScreen("order-detail");
        setNavActive("orders");
        if (orderId) loadOrderDetail(orderId, { startPolling: true });
        return;
    }
    stopOrderDetailPolling();
    const target = hash || "catalog";
    showScreen(target);
    setNavActive(target);
}

function navigate(screen) {
    if (screen === "order-detail") return;
    stopOrderDetailPolling();
    location.hash = screen === "catalog" ? "" : `#${screen}`;
}

function showScreen(name) {
    els.screens.forEach(screen => {
        const id = screen.id.replace("screen-", "");
        screen.classList.toggle("active", id === name);
    });
}

function setNavActive(name) {
    els.navButtons.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.nav === name);
    });
}

function isAuthenticated() {
    return Boolean(apiToken && currentUser && currentUser.role === "customer" && !approvalPending);
}

function formatApiError(error, fallback = "Request failed.") {
    if (!error) return fallback;
    const message = error.message || "";
    if (message) {
        try {
            const parsed = JSON.parse(message);
            if (parsed && typeof parsed === "object") {
                const key = Object.keys(parsed)[0];
                const value = parsed[key];
                if (Array.isArray(value)) return value[0] || fallback;
                if (typeof value === "string") return value;
                return `${key}: ${String(value)}`;
            }
        } catch (_) {
            // not JSON
        }
        return message;
    }
    return fallback;
}

async function apiRequest(endpoint, { method = "GET", body = null, auth = true } = {}) {
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (auth && apiToken) headers["Authorization"] = `Token ${apiToken}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers,
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : null,
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
        const message = typeof data === "object" ? JSON.stringify(data) : data;
        const error = new Error(message || `HTTP ${res.status}`);
        error.status = res.status;
        throw error;
    }
    return data;
}

function normalizePaginated(data) {
    if (!data) {
        return { count: 0, next: null, previous: null, results: [] };
    }
    if (Array.isArray(data)) {
        return { count: data.length, next: null, previous: null, results: data };
    }
    if (Array.isArray(data.results)) {
        const count = Number.isFinite(data.count) ? data.count : data.results.length;
        return {
            count,
            next: data.next || null,
            previous: data.previous || null,
            results: data.results,
        };
    }
    return { count: 0, next: null, previous: null, results: [] };
}

function withParams(endpoint, paramsObj) {
    const [path, query = ""] = endpoint.split("?");
    const params = new URLSearchParams(query);
    Object.entries(paramsObj || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, value);
    });
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

function normalizeApiEndpoint(urlOrEndpoint) {
    if (!urlOrEndpoint) return "";
    try {
        const url = new URL(urlOrEndpoint, window.location.origin);
        let path = `${url.pathname}${url.search}`;
        if (path.startsWith(`${API_BASE}/`)) {
            path = path.slice(API_BASE.length);
        }
        return path;
    } catch (err) {
        return urlOrEndpoint;
    }
}

async function apiRequestAll(endpoint, { limit = BULK_FETCH_LIMIT } = {}) {
    let results = [];
    let nextEndpoint = withParams(endpoint, { limit, offset: 0 });
    while (nextEndpoint) {
        const data = await apiRequest(nextEndpoint);
        if (Array.isArray(data)) return data;
        const page = normalizePaginated(data);
        results = results.concat(page.results);
        if (page.next) {
            nextEndpoint = normalizeApiEndpoint(page.next);
            continue;
        }
        if (page.results.length === 0 || results.length >= page.count) break;
        nextEndpoint = withParams(endpoint, { limit, offset: results.length });
    }
    return results;
}

function updatePager({ prevEl, nextEl, pageEl, offset, limit, pageData }) {
    if (!prevEl && !nextEl && !pageEl) return;
    const count = pageData?.count || 0;
    const totalPages = count ? Math.ceil(count / limit) : 1;
    const currentPage = count ? Math.floor(offset / limit) + 1 : 1;
    if (pageEl) {
        pageEl.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (prevEl) {
        prevEl.disabled = offset <= 0;
    }
    if (nextEl) {
        nextEl.disabled = offset + limit >= count;
    }
}

async function bootstrapAuth() {
    if (!apiToken) {
        renderAccount();
        return;
    }
    try {
        const user = await apiRequest("/auth/me/");
        if (user.role !== "customer") {
            throw new Error("Not a customer account");
        }
        setCurrentUser(user);
        const approved = await checkApprovalStatus();
        if (approved) {
            await loadInitialData();
        }
    } catch (err) {
        clearAuth();
    } finally {
        renderAccount();
        route();
    }
}

async function login() {
    const username = els.loginUsername.value.trim();
    const password = els.loginPassword.value;
    if (!username || !password) {
        toast("Username and password required", "error");
        return;
    }

    if (els.loginBtn) {
        els.loginBtn.disabled = true;
        els.loginBtn.textContent = "Signing in...";
    }
    els.loginStatus.textContent = "Signing in...";
    try {
        const data = await apiRequest("/auth/token/", {
            method: "POST",
            body: { username, password },
            auth: false,
        });
        if (!data.token) {
            throw new Error("Login failed");
        }
        if (data.role !== "customer") {
            throw new Error("This account is not a customer account.");
        }
        setToken(data.token);
        setCurrentUser({
            user_id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role,
            display_name: data.display_name,
        });
        const approved = await checkApprovalStatus();
        if (approved) {
            await loadInitialData();
            toast("Signed in", "success");
            navigate("catalog");
        } else {
            toast("Account pending approval", "info");
            navigate("login");
        }
    } catch (err) {
        toast(formatApiError(err, "Login failed"), "error");
    } finally {
        if (els.loginBtn) {
            els.loginBtn.disabled = false;
            els.loginBtn.textContent = "Sign in";
        }
        renderAccount();
    }
}

function logout() {
    clearAuth();
    toast("Signed out", "success");
    navigate("login");
}

function switchAccount() {
    clearAuth();
    navigate("login");
}

function setToken(token) {
    apiToken = token;
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(USER_KEY);
    }
}

function clearAuth() {
    setToken("");
    setCurrentUser(null);
    renderAccount();
}

function renderAccount() {
    if (currentUser && currentUser.role === "customer") {
        els.accountInfo.classList.remove("hidden");
        els.accountName.textContent = currentUser.display_name || currentUser.username || "Customer";
        els.accountRole.textContent = `Role: ${currentUser.role}`;
        els.loginUsername.closest("label").classList.add("hidden");
        els.loginPassword.closest("label").classList.add("hidden");
        els.loginBtn.classList.add("hidden");
        els.loginStatus.textContent = approvalPending ? "Pending approval" : "Signed in";
        els.logoutBtn.classList.remove("hidden");
        els.branchPill.classList.remove("hidden");
        if (els.approvalStatus) {
            els.approvalStatus.classList.toggle("hidden", !approvalPending);
            if (approvalPending) {
                els.approvalStatus.textContent = "Your account is pending approval by the business.";
            }
        }
        if (els.checkApprovalBtn) {
            els.checkApprovalBtn.classList.toggle("hidden", !approvalPending);
        }
    } else {
        els.accountInfo.classList.add("hidden");
        els.loginUsername.closest("label").classList.remove("hidden");
        els.loginPassword.closest("label").classList.remove("hidden");
        els.loginBtn.classList.remove("hidden");
        els.loginStatus.textContent = "Not signed in";
        if (els.approvalStatus) {
            els.approvalStatus.classList.add("hidden");
        }
        if (els.checkApprovalBtn) {
            els.checkApprovalBtn.classList.add("hidden");
        }
        els.logoutBtn.classList.add("hidden");
        els.branchPill.classList.add("hidden");
    }
}

async function checkApprovalStatus({ notify = false } = {}) {
    if (!apiToken) return false;
    const wasPending = approvalPending;
    try {
        const profile = await apiRequest("/customer/profile/");
        if (!profile.linked) {
            approvalPending = true;
            if (notify) toast("Account not linked to a customer profile.", "error");
            return false;
        }
        approvalPending = !profile.approved;
        if (approvalPending && notify) {
            toast("Account pending approval", "info");
        }
        if (!approvalPending && wasPending) {
            await loadInitialData();
            if (notify) toast("Account approved. Welcome!", "success");
        }
        return profile.approved;
    } catch (err) {
        approvalPending = true;
        if (notify) toast("Unable to verify approval status.", "error");
        return false;
    } finally {
        renderAccount();
        route();
    }
}

async function signup() {
    const name = els.signupName?.value.trim() || "";
    const email = els.signupEmail?.value.trim() || "";
    const phone = els.signupPhone?.value.trim() || "";
    const username = els.signupUsername?.value.trim() || "";
    const password = els.signupPassword?.value || "";
    if (!name || !email || !password) {
        if (els.signupStatus) els.signupStatus.textContent = "Name, email, and password are required.";
        toast("Name, email, and password are required.", "error");
        return;
    }

    if (els.signupStatus) els.signupStatus.textContent = "Creating account...";
    if (els.signupBtn) {
        els.signupBtn.disabled = true;
        els.signupBtn.textContent = "Creating...";
    }
    try {
        const data = await apiRequest("/customer/signup/", {
            method: "POST",
            body: { name, email, phone, username, password },
            auth: false,
        });
        if (els.signupStatus) {
            els.signupStatus.textContent = data.message || "Account created. Pending approval.";
        }
        toast("Account created. Pending approval.", "success");
        if (els.loginUsername) {
            els.loginUsername.value = username || (email ? email.split("@")[0] : "");
        }
        setAuthMode("login");
    } catch (err) {
        const message = formatApiError(err, "Signup failed.");
        if (els.signupStatus) {
            els.signupStatus.textContent = message;
        }
        toast(message, "error");
    } finally {
        if (els.signupBtn) {
            els.signupBtn.disabled = false;
            els.signupBtn.textContent = "Create account";
        }
    }
}

async function loadInitialData() {
    ordersOffset = 0;
    await Promise.all([
        loadBranches(),
        loadCatalog(),
        loadOrders(),
        loadBalance(),
    ]);
}

async function loadBranches() {
    try {
        branches = await apiRequest("/business/branches/");
    } catch (err) {
        branches = [];
        toast("Branch list unavailable", "error");
    }

    if (!branches.length) {
        els.branchSelect.innerHTML = `<option value="">No branches</option>`;
        els.branchSelect.disabled = true;
        updateBranchPill();
        return;
    }

    els.branchSelect.disabled = false;
    els.branchSelect.innerHTML = branches
        .map(branch => `<option value="${branch.id}">${branch.name} - ${branch.location}</option>`)
        .join("");

    if (!selectedBranch || !branches.find(b => b.id === selectedBranch)) {
        selectedBranch = branches[0].id;
        localStorage.setItem(BRANCH_KEY, selectedBranch);
    }
    els.branchSelect.value = selectedBranch;
    updateBranchPill();
}

function updateBranchPill() {
    const branch = branches.find(b => b.id === selectedBranch);
    els.branchPill.textContent = branch ? `Branch: ${branch.name}` : "Branch: -";
}

function handleBranchChange() {
    selectedBranch = els.branchSelect.value || "";
    localStorage.setItem(BRANCH_KEY, selectedBranch);
    updateBranchPill();
    loadCatalog();
}

async function loadCatalog() {
    els.catalogLoading.classList.remove("hidden");
    els.catalogGrid.innerHTML = "";
    els.catalogEmpty.classList.add("hidden");
    try {
        const endpoint = selectedBranch ? `/customer/catalog/?branch=${selectedBranch}` : "/customer/catalog/";
        catalog = await apiRequestAll(endpoint);
    } catch (err) {
        catalog = [];
        toast("Failed to load catalog", "error");
    } finally {
        els.catalogLoading.classList.add("hidden");
    }
    renderCatalog();
}

function renderCatalog() {
    const query = els.catalogSearch.value.toLowerCase().trim();
    const filtered = catalog.filter(product => {
        if (!query) return true;
        return (
            product.name.toLowerCase().includes(query) ||
            product.sku.toLowerCase().includes(query)
        );
    });

    if (!filtered.length) {
        els.catalogEmpty.classList.remove("hidden");
        els.catalogGrid.innerHTML = "";
        return;
    }

    els.catalogEmpty.classList.add("hidden");
    els.catalogGrid.innerHTML = filtered.map(product => {
        const units = product.units || [];
        const selectedUnitId = selectedUnits[product.id] || (units[0] ? units[0].id : "");
        const unitOptions = units.map(unit => {
            const label = `${unit.unit_name} (${unit.unit_code})`;
            return `<option value="${unit.id}" ${unit.id === selectedUnitId ? "selected" : ""}>${label}</option>`;
        }).join("");
        const unit = units.find(u => u.id === selectedUnitId) || units[0];
        const price = unit ? unit.display_price : null;
        const priceLabel = price ? `Wholesale: ${formatMoney(price)}` : "Wholesale price unavailable";
        const canAdd = Boolean(unit && price);
        const stockLabel = product.stock !== null && product.stock !== undefined ? `Stock: ${product.stock}` : "";
        return `
            <div class="product-card">
                <h3>${escapeHtml(product.name)}</h3>
                <div class="sku">SKU ${escapeHtml(product.sku)}</div>
                <div class="price">${priceLabel}</div>
                <div class="stock">${stockLabel}</div>
                <select data-unit-select="${product.id}">${unitOptions}</select>
                <button class="btn ${canAdd ? "primary" : "ghost"}" data-add="${product.id}" ${canAdd ? "" : "disabled"}>Add to cart</button>
            </div>
        `;
    }).join("");

    els.catalogGrid.querySelectorAll("select[data-unit-select]").forEach(select => {
        select.addEventListener("change", (e) => {
            selectedUnits[e.target.dataset.unitSelect] = e.target.value;
            renderCatalog();
        });
    });

    els.catalogGrid.querySelectorAll("button[data-add]").forEach(btn => {
        btn.addEventListener("click", () => addToCart(btn.dataset.add));
    });
}

function addToCart(productId) {
    const product = catalog.find(p => p.id === productId);
    if (!product) return;
    const unitId = selectedUnits[productId] || (product.units[0] ? product.units[0].id : "");
    const unit = (product.units || []).find(u => u.id === unitId);
    if (!unit || !unit.display_price) {
        toast("This item is not available", "error");
        return;
    }
    const key = `${productId}:${unitId}`;
    const existing = cart.find(item => item.key === key);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            key,
            product_id: productId,
            product_name: product.name,
            unit_id: unitId,
            unit_name: unit.unit_name,
            unit_code: unit.unit_code,
            display_price: unit.display_price,
            quantity: 1,
        });
    }
    persistCart();
    renderCart();
    toast("Added to cart", "success");
}

function renderCart() {
    if (!cart.length) {
        els.cartItems.innerHTML = "";
        els.cartEmpty.classList.remove("hidden");
        els.cartTotal.textContent = formatMoney(0);
        return;
    }
    els.cartEmpty.classList.add("hidden");
    els.cartItems.innerHTML = cart.map(item => `
        <div class="list-item">
            <div class="meta">
                <div class="title">${escapeHtml(item.product_name)}</div>
                <div class="sub">${escapeHtml(item.unit_name)} (${escapeHtml(item.unit_code)})</div>
                <div class="sub">${formatMoney(item.display_price)} each</div>
            </div>
            <div class="qty">
                <button data-qty="dec" data-key="${item.key}">-</button>
                <span>${item.quantity}</span>
                <button data-qty="inc" data-key="${item.key}">+</button>
            </div>
        </div>
    `).join("");

    els.cartItems.querySelectorAll("button[data-qty]").forEach(btn => {
        btn.addEventListener("click", () => updateQuantity(btn.dataset.key, btn.dataset.qty));
    });
    els.cartTotal.textContent = formatMoney(estimateTotal());
    updateCartCount();
}

function updateQuantity(key, action) {
    const item = cart.find(i => i.key === key);
    if (!item) return;
    if (action === "inc") item.quantity += 1;
    if (action === "dec") item.quantity -= 1;
    if (item.quantity <= 0) {
        cart = cart.filter(i => i.key !== key);
    }
    persistCart();
    renderCart();
}

function clearCart() {
    cart = [];
    persistCart();
    renderCart();
    if (els.creditRequest) {
        els.creditRequest.checked = false;
    }
    toast("Cart cleared", "success");
}

function persistCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    els.cartCount.textContent = count;
}

function estimateTotal() {
    return cart.reduce((sum, item) => sum + (parseFloat(item.display_price) || 0) * item.quantity, 0);
}

async function placeOrder() {
    if (!selectedBranch) {
        toast("Select a branch before ordering", "error");
        return;
    }
    if (!cart.length) {
        toast("Cart is empty", "error");
        return;
    }
    els.cartStatus.textContent = "Submitting order...";
    try {
        const payload = {
            branch: selectedBranch,
            items: cart.map(item => ({
                product: item.product_id,
                product_unit: item.unit_id,
                quantity: item.quantity,
            })),
            credit_requested: Boolean(els.creditRequest && els.creditRequest.checked),
        };
        const order = await apiRequest("/customer/orders/", { method: "POST", body: payload });
        clearCart();
        ordersOffset = 0;
        await loadOrders();
        toast("Order placed", "success");
        location.hash = `order/${order.id}`;
    } catch (err) {
        toast(`Order failed: ${err.message}`, "error");
    } finally {
        els.cartStatus.textContent = "";
    }
}

async function loadOrders() {
    els.ordersLoading.classList.remove("hidden");
    els.ordersError.classList.add("hidden");
    ordersLoadFailed = false;
    try {
        const endpoint = withParams("/customer/orders/", {
            limit: ORDERS_LIMIT,
            offset: ordersOffset,
        });
        const data = await apiRequest(endpoint);
        const page = normalizePaginated(data);
        orders = page.results;
        ordersPage = page;
    } catch (err) {
        orders = [];
        ordersLoadFailed = true;
        ordersPage = { count: 0, next: null, previous: null, results: [] };
        els.ordersError.textContent = "Orders are unavailable right now. Please try again.";
        els.ordersError.classList.remove("hidden");
        toast("Failed to load orders", "error");
    } finally {
        els.ordersLoading.classList.add("hidden");
    }
    renderOrders();
    updatePager({
        prevEl: els.ordersPrev,
        nextEl: els.ordersNext,
        pageEl: els.ordersPage,
        offset: ordersOffset,
        limit: ORDERS_LIMIT,
        pageData: ordersPage,
    });
}

function renderOrders() {
    if (ordersLoadFailed) {
        els.ordersEmpty.classList.add("hidden");
        els.ordersList.innerHTML = "";
        return;
    }
    if (!orders.length) {
        els.ordersEmpty.classList.remove("hidden");
        els.ordersList.innerHTML = "";
        return;
    }
    els.ordersEmpty.classList.add("hidden");
    els.ordersList.innerHTML = orders.map(order => {
        const total = order.sale ? order.sale.grand_total : "0.00";
        const date = order.created_at ? formatDate(order.created_at) : "";
        const statusBadge = renderStatusBadge(order.status);
        const creditBadge = renderCreditBadge(order.credit_approval_status);
        const preview = (order.items || []).slice(0, 2).map(item => item.product_name || "Item").join(", ");
        const previewMore = (order.items || []).length > 2 ? ` +${(order.items || []).length - 2} more` : "";
        return `
            <div class="list-item order-card" data-order="${order.id}">
                <div class="meta">
                    <div class="title">Order ${shortId(order.id)}</div>
                    <div class="sub">${date}</div>
                    ${statusBadge}
                    ${creditBadge}
                </div>
                <div class="meta align-end">
                    <div class="title">${formatMoney(total)}</div>
                    <div class="sub">${order.items ? order.items.length : 0} items</div>
                    ${preview ? `<div class="preview">${escapeHtml(preview)}${previewMore}</div>` : ""}
                </div>
            </div>
        `;
    }).join("");

    els.ordersList.querySelectorAll(".list-item[data-order]").forEach(item => {
        item.addEventListener("click", () => {
            location.hash = `order/${item.dataset.order}`;
        });
    });
}

async function loadOrderDetail(orderId, { startPolling = false } = {}) {
    currentOrderId = orderId;
    try {
        const order = await apiRequest(`/customer/orders/${orderId}/`);
        renderOrderDetail(order);
        if (startPolling) startOrderDetailPolling();
    } catch (err) {
        els.orderDetailEmpty.classList.remove("hidden");
        els.orderDetail.innerHTML = "";
        toast("Failed to load order", "error");
    }
}

function renderOrderDetail(order) {
    if (!order) return;
    els.orderDetailEmpty.classList.add("hidden");
    const statusBadge = renderStatusBadge(order.status);
    const creditBadge = renderCreditBadge(order.credit_approval_status);
    const statusTimeline = renderStatusTimeline(order.status);
    const items = (order.items || []).map(item => `
        <div class="list-row">
            <div class="item-main">
                <div class="item-title">${escapeHtml(item.product_name || "Item")}</div>
                <div class="item-sub">${escapeHtml(item.unit_name || "Unit")} (${escapeHtml(item.unit_code || "-")})</div>
            </div>
            <div class="item-qty">${item.quantity}x</div>
            <div class="item-price">
                <div class="item-line">${formatMoney(item.total_price)}</div>
                <div class="item-sub">${formatMoney(item.unit_price)} each</div>
            </div>
        </div>
    `).join("");

    const sale = order.sale || {};
    const creditNote = order.credit_approval_status === "rejected"
        ? `
            <div class="detail-card">
                <div class="muted small">Credit request rejected</div>
                <div>${escapeHtml(order.credit_rejection_reason || "No reason provided.")}</div>
            </div>
        `
        : "";
    const totals = `
        <div class="detail-card">
            <div class="detail-grid">
                <div>
                    <div class="muted small">Subtotal</div>
                    <div>${formatMoney(sale.total_amount || 0)}</div>
                </div>
                <div>
                    <div class="muted small">Tax</div>
                    <div>${formatMoney(sale.tax || 0)}</div>
                </div>
                <div>
                    <div class="muted small">Total</div>
                    <div class="total-strong">${formatMoney(sale.grand_total || 0)}</div>
                </div>
            </div>
        </div>
    `;

    const cancelAllowed = ["pending", "confirmed", "pending_credit_approval"].includes(order.status);
    const cancelBtn = cancelAllowed ? `<button class="btn danger" id="cancel-order">Cancel Order</button>` : "";

    els.orderDetail.innerHTML = `
        <div class="detail-card order-header">
            <div>
                <div class="muted small">Order</div>
                <div class="order-id">#${shortId(order.id)}</div>
                <div class="subtle">${formatDate(order.created_at)}</div>
            </div>
            <div class="header-meta">
                ${statusBadge}
                ${creditBadge}
                <div class="subtle">${escapeHtml(order.branch?.name || "-")}</div>
            </div>
        </div>
        <div class="detail-card">
            ${statusTimeline}
        </div>
        <div class="detail-card">
            <h3>Items</h3>
            <div class="list list-compact">${items}</div>
        </div>
        ${creditNote}
        ${totals}
        ${cancelBtn ? `<div class="detail-card actions">${cancelBtn}</div>` : ""}
    `;

    if (cancelAllowed) {
        const btn = document.getElementById("cancel-order");
        btn.addEventListener("click", () => cancelOrder(order.id));
    }
}

function renderStatusBadge(status) {
    const meta = ORDER_STATUS_META[status] || { label: formatStatus(status), badge: "badge-muted" };
    return `<span class="status-badge ${meta.badge}">${meta.label}</span>`;
}

function renderCreditBadge(status) {
    if (!status || status === "not_requested") return "";
    const meta = {
        pending: { label: "Credit pending", badge: "badge-orange" },
        approved: { label: "Credit approved", badge: "badge-green" },
        rejected: { label: "Credit rejected", badge: "badge-red" },
    }[status] || { label: "Credit", badge: "badge-muted" };
    return `<span class="status-badge ${meta.badge}">${meta.label}</span>`;
}

function renderStatusTimeline(status) {
    const isCancelled = status === "cancelled";
    const currentIndex = ORDER_STATUS_STEPS.indexOf(status);
    const steps = ORDER_STATUS_STEPS.map((step, idx) => {
        let stateClass = "future";
        if (idx < currentIndex) stateClass = "done";
        if (idx === currentIndex) stateClass = "current";
        if (isCancelled) stateClass = "future";
        return `
            <div class="timeline-step ${stateClass}">
                <div class="dot"></div>
                <div class="label">${ORDER_STATUS_META[step].label}</div>
            </div>
        `;
    }).join("");

    if (isCancelled) {
        return `
            <div class="timeline cancelled">
                <div class="cancelled-state">
                    <span class="status-badge badge-red">Cancelled</span>
                    <span class="muted small">This order was cancelled.</span>
                </div>
            </div>
        `;
    }

    return `<div class="timeline">${steps}</div>`;
}

function startOrderDetailPolling() {
    if (!currentOrderId) return;
    stopOrderDetailPolling();
    orderDetailPoll = setInterval(() => {
        if (currentOrderId) loadOrderDetail(currentOrderId);
    }, 12000);
}

function stopOrderDetailPolling() {
    if (orderDetailPoll) {
        clearInterval(orderDetailPoll);
        orderDetailPoll = null;
    }
    currentOrderId = null;
}

async function cancelOrder(orderId) {
    try {
        await apiRequest(`/customer/orders/${orderId}/cancel/`, { method: "POST" });
        toast("Order cancelled", "success");
        await loadOrders();
        await loadOrderDetail(orderId);
    } catch (err) {
        toast(`Cancel failed: ${err.message}`, "error");
    }
}

async function loadBalance() {
    try {
        const summary = await apiRequest("/customer/balance/");
        renderBalance(summary);
    } catch (err) {
        if (err.status === 403) {
            els.balanceCard.classList.add("hidden");
        }
    }
}

function renderBalance(summary) {
    if (!summary) return;
    els.balanceCard.classList.remove("hidden");
    els.balanceCard.innerHTML = `
        <div><strong>Outstanding</strong>: ${formatMoney(summary.total_outstanding || 0)}</div>
        <div><strong>Overdue</strong>: ${formatMoney(summary.overdue_balance || 0)}</div>
        <div><strong>Open invoices</strong>: ${summary.open_count || 0}</div>
    `;
}

function formatMoney(value) {
    const number = parseFloat(value) || 0;
    return `KSh ${number.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

function shortId(id) {
    if (!id) return "-";
    return id.toString().split("-")[0].toUpperCase();
}

function formatStatus(status) {
    if (!status) return "-";
    return status.replace(/_/g, " ").replace(/\b\w/g, s => s.toUpperCase());
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : value.toString();
    return div.innerHTML;
}

function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    els.toastContainer.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 3000);
}

init();
