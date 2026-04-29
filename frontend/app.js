/* =========================================
   RetailPOS — Application Logic
   ========================================= */

const API_BASE = "/api";
const APP_BUILD = "2026-04-29.13";

function sanitizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}
const TAX_RATE = 0.16;
const CUSTOMER_ORDERS_DEBUG = new URLSearchParams(window.location.search).has("customerOrdersDebug")
    || localStorage.getItem("customer_orders_debug") === "1";
const customerOrdersLog = (...args) => {
    if (CUSTOMER_ORDERS_DEBUG) console.debug(...args);
};
customerOrdersLog("[customer-orders] app.js loaded", { build: APP_BUILD });
window.__APP_BUILD__ = APP_BUILD;
const POS_DEBUG = new URLSearchParams(window.location.search).has("posDebug")
    || localStorage.getItem("pos_debug") === "1";
const AUTO_PRINT_KEY = "pos_auto_print_receipt";
const PRINT_MODE_KEY = "stery_print_mode";
const PRINT_BRIDGE_URL_KEY = "stery_print_bridge_url";
const PRINT_BRIDGE_URL = "http://127.0.0.1:9777";
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
let customerOrdersStatusList = [];
let customerOrdersQuery = "";
let customerOrdersFailed = false;
let amountPaidDirty = false;
let staffInstallPrompt = null;
let ledgerEntries = [];
let ledgerSummary = null;
let ledgerFailed = false;
let backOfficeProducts = [];
let backOfficeActiveSection = "products";
let backOfficeQuery = "";
let editingProductId = null;
let backOfficeCategories = [];
let backOfficeSuppliers = [];
let backOfficeSupplierQuery = "";
let editingSupplierId = null;
let backOfficeSupplierOffset = 0;
let backOfficeSupplierLimit = 20;
let backOfficeSupplierPage = { count: 0, next: null, previous: null, results: [] };
let supplierOptions = [];
let productSupplierLinks = [];
let backOfficePurchases = [];
let backOfficePurchasesQuery = "";
let backOfficePurchasesOffset = 0;
let backOfficePurchasesLimit = 20;
let backOfficePurchasesPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeBills = [];
let backOfficeBillsQuery = "";
let backOfficeBillsOffset = 0;
let backOfficeBillsLimit = 20;
let backOfficeBillsPage = { count: 0, next: null, previous: null, results: [] };
let backOfficePurchasesTab = "orders";
let editingPurchaseId = null;
let currentPurchaseDetail = null;
let purchaseSupplierPrices = {};
let purchaseReceiveTarget = null;
let editingBillId = null;
let currentBillDetail = null;
let backOfficeCustomers = [];
let backOfficeCustomerQuery = "";
let editingCustomerId = null;
let backOfficeRoutes = [];
let backOfficeCustomerOffset = 0;
let backOfficeCustomerLimit = 20;
let backOfficeCustomerPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeStaff = [];
let backOfficeStaffQuery = "";
let editingStaffId = null;
let backOfficeStaffOffset = 0;
let backOfficeStaffLimit = 20;
let backOfficeStaffPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeSetupSection = "branches";
let backOfficeBranchesList = [];
let backOfficeRoutesSetup = [];
let backOfficeCategoriesSetup = [];
let backOfficeSetupBranchQuery = "";
let backOfficeSetupRouteQuery = "";
let backOfficeSetupCategoryQuery = "";
let backOfficeReportsRange = "7";
let backOfficeReportsSummary = null;
let backOfficeReportsSales = [];
let backOfficeReportsPayments = [];
let backOfficeReportsTopProducts = [];
let backOfficeReportsLowStock = [];
let editingBranchId = null;
let editingRouteId = null;
let editingCategoryId = null;
let inventoryAdjustments = [];
let inventoryAdjustProducts = [];
let inventoryAdjustOffset = 0;
let inventoryAdjustLimit = 20;
let inventoryAdjustPage = { count: 0, next: null, previous: null, results: [] };
let inventoryScanStream = null;
let inventoryScanDetector = null;
let inventoryScanActive = false;
let inventoryScanLoopTimer = null;
let posScanStream = null;
let posScanDetector = null;
let posScanActive = false;
let posScanLoopTimer = null;

const PENDING_ORDER_STATUSES = [
    "pending",
    "pending_credit_approval",
    "confirmed",
    "processing",
    "out_for_delivery",
];
let posScanLastValue = null;
let posScanLastAt = 0;
let mobileSearchTimer = null;
let mobileSearchToken = 0;
let mobileSearchResults = null;
let mobileSearchLoading = false;
let mobileSearchQuery = "";
let mobileReportsSummary = null;
let mobileReportsTopProducts = [];
let mobileStockLowOnly = false;
let mobileCustomerCreating = false;
let lastMobileSaleId = null;
let activeMobileTab = "home";
let mobileSalesFilter = "today";
let mobileSalesLoading = false;
let mobileSalesCache = new Map();
let currentMobileSaleDetailId = null;
let mobileStockTimer = null;
let mobileStockToken = 0;
let mobileStockQuery = "";
let mobileStockCategory = "all";
let mobileCategories = [];
let mobileActiveCategory = "all";
let mobileCustomers = [];
let mobileCustomersQuery = "";
let mobileCustomersToken = 0;
let mobileCustomersLoading = false;
let mobileCustomersTimer = null;
let currentMobileCustomerId = null;
let mobileCustomerPaymentSaving = false;
let mobileDeliveriesFilter = localStorage.getItem("mobile_deliveries_filter") || "active";
let mobileDeliveriesLoading = false;
let mobileDeliveriesError = "";
let mobileDeliveriesPage = { count: 0, next: null, previous: null, results: [] };
let mobileDeliveries = [];
let mobileDeliveryDashboardLoading = false;
const MOBILE_UI_STATE_KEY = "mobile_ui_state_v1";
let mobileUiState = loadMobileUiState();
let mobileStateRestoring = false;
let mobilePendingScrollRestore = null;
let backOfficeSales = [];
let backOfficeSalesQuery = "";
let backOfficeSalesOffset = 0;
let backOfficeSalesLimit = 20;
let backOfficeSalesPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeOrders = [];
let backOfficeOrdersQuery = "";
let backOfficeOrdersOffset = 0;
let backOfficeOrdersLimit = 20;
let backOfficeOrdersPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeDeliveryRuns = [];
let backOfficeDeliveryQueue = [];
let backOfficeDeliveryQueueIndex = new Map();
let backOfficeDeliveryQueueSaleIndex = new Map();
let backOfficeDeliveryQueueLoaded = false;
let backOfficeDeliveryQueueLoading = null;
let backOfficeDeliveryQueueHighlightSaleId = "";
let backOfficeDeliveryQuery = "";
let backOfficeDeliveryOffset = 0;
let backOfficeDeliveryQueueOffset = 0;
let backOfficeDeliveryLimit = 20;
let backOfficeDeliveryPage = { count: 0, next: null, previous: null, results: [] };
let backOfficeDeliveryQueuePage = { count: 0, next: null, previous: null, results: [] };
let backOfficeDeliveryScope = localStorage.getItem("backoffice_delivery_scope") || "active";
let backOfficeDeliveryMode = localStorage.getItem("backoffice_delivery_mode") || "queue";
let currentDeliveryRun = null;
let backOfficePayments = [];
let backOfficePaymentsQuery = "";
let backOfficePaymentsOffset = 0;
let backOfficePaymentsLimit = 20;
let backOfficePaymentsPage = { count: 0, next: null, previous: null, results: [] };
let backOfficePaymentsMode = localStorage.getItem("backoffice_payments_mode") || "all";
let currentBackOfficePaymentDetailId = null;
let backOfficePaymentsDeliveryPerson = "";
let backOfficePaymentsBulkSelection = new Set();
let backOfficePaymentsBulkNote = "";
let performanceData = {
    cashiers: [],
    salespeople: [],
    delivery: [],
    routes: [],
};
let performanceActiveTab = "cashiers";
let performanceUserSelections = {
    cashiers: "",
    salespeople: "",
    delivery: "",
};
let aiSummaryLoadedAt = 0;
let aiSummaryPending = false;
let aiSummaryContext = {
    hasOutOfStock: false,
    hasPendingOrders: false,
    hasOverdueCredit: false,
};
let performanceUsersCache = new Map();
let performanceRoutesCache = {
    branch: null,
    items: [],
};
let expensesList = [];
let expensesFailed = false;
let returnSale = null;
let returnItems = [];
let heldSalesOffset = 0;
let customerOrdersOffset = 0;
let ledgerOffset = 0;
let expensesOffset = 0;
let heldSalesPage = { count: 0, next: null, previous: null, results: [] };
let customerOrdersPage = { count: 0, next: null, previous: null, results: [] };
let ledgerPage = { count: 0, next: null, previous: null, results: [] };
let expensesPage = { count: 0, next: null, previous: null, results: [] };
let lastFilteredProducts = [];
let searchResults = [];
let searchResultsOpen = false;
let searchResultIndex = -1;
let activeSaleRowId = null;
let mpesaPendingPayment = null;
let mpesaPollTimer = null;
let mpesaPollAttempts = 0;
let autoPrintedSales = new Set();
let currentReceiptSaleId = null;
let currentReceiptPayload = null;
let lastCompletedSale = null;
let offlineMode = !navigator.onLine;
let offlineSyncing = false;
let currentOfflineDraftId = null;
let offlineDraftCount = 0;
let currentOfflineDraftCorrelationId = null;
let offlineSyncTimer = null;
let offlineSyncBackground = false;

const OFFLINE_DB_NAME = "pos_offline_v1";
const OFFLINE_DB_VERSION = 1;
const OFFLINE_CACHE_STORE = "cache";
const OFFLINE_DRAFT_STORE = "drafts";

const HELD_SALES_LIMIT = 20;
const CUSTOMER_ORDERS_LIMIT = 20;
const LEDGER_LIMIT = 20;
const EXPENSES_LIMIT = 20;
const BULK_FETCH_LIMIT = 100;
const MPESA_POLL_INTERVAL = 4000;
const MPESA_POLL_MAX = 30;

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

const STAFF_ROLE_OPTIONS = [
    { value: "cashier", label: "Cashier" },
    { value: "salesperson", label: "Salesperson" },
    { value: "supervisor", label: "Supervisor" },
    { value: "admin", label: "Admin" },
    { value: "deliver_person", label: "Delivery person" },
    { value: "customer", label: "Customer" },
];

// ——— DOM References ———
const els = {
    branchSelect:    document.getElementById("branch-select"),
    customerSelect:  document.getElementById("customer-select"),
    saleTypeSelect:  document.getElementById("sale-type-select"),
    clock:           document.getElementById("clock"),
    productSearch:   document.getElementById("product-search"),
    productSearchResults: document.getElementById("product-search-results"),
    offlineStatus: document.getElementById("offline-status"),
    offlineStatusText: document.getElementById("offline-status-text"),
    offlineSyncBtn: document.getElementById("offline-sync-btn"),
    offlineSyncCount: document.getElementById("offline-sync-count"),
    offlineDraftsBtn: document.getElementById("offline-drafts-btn"),
    offlineDraftsModal: document.getElementById("offline-drafts-modal"),
    offlineDraftsClose: document.getElementById("offline-drafts-close"),
    offlineDraftsList: document.getElementById("offline-drafts-list"),
    offlineDraftsSync: document.getElementById("offline-drafts-sync"),
    categoryFilters: document.getElementById("category-filters"),
    productImportTools: document.getElementById("product-import-tools"),
    productImportTemplate: document.getElementById("download-product-template"),
    productImportFile: document.getElementById("product-import-file"),
    productImportUpload: document.getElementById("upload-product-file"),
    productImportResult: document.getElementById("product-import-result"),
    cartItems:       document.getElementById("cart-items"),
    subtotal:        document.getElementById("subtotal"),
    taxAmount:       document.getElementById("tax-amount"),
    discountInput:   document.getElementById("discount-input"),
    grandTotal:      document.getElementById("grand-total"),
    amountPaid:      document.getElementById("amount-paid-input"),
    amountPaidLabel: document.getElementById("amount-paid-label"),
    paymentMethodSelect: document.getElementById("payment-method-select"),
    mpesaFields: document.getElementById("mpesa-fields"),
    mpesaPhone: document.getElementById("mpesa-phone"),
    mpesaReference: document.getElementById("mpesa-reference"),
    mpesaStatus: document.getElementById("mpesa-status"),
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
    printModeSelect: document.getElementById("print-mode-select"),
    printReceiptBtn: document.getElementById("print-receipt-btn"),
    forceAndroidPrintBtn: document.getElementById("force-android-print-btn"),
    receiptCloseBtn: document.getElementById("receipt-close-btn"),
    autoPrintToggle: document.getElementById("auto-print-toggle"),
    autoPrintToggleWrap: document.getElementById("auto-print-toggle-wrap"),
    receiptPrintDebug: document.getElementById("receipt-print-debug"),
    newSaleBtn:      document.getElementById("new-sale-btn"),
    toastContainer:  document.getElementById("toast-container"),
    authBtn:         document.getElementById("auth-btn"),
    logoutBtn:       document.getElementById("logout-btn"),
    creditBtn:       document.getElementById("credit-btn"),
    customerOrdersBtn: document.getElementById("customer-orders-btn"),
    deliveryRunBtn: document.getElementById("delivery-run-btn"),
    ledgerBtn:       document.getElementById("ledger-btn"),
    returnsBtn:      document.getElementById("returns-btn"),
    backofficeBtn:   document.getElementById("backoffice-btn"),
    installPosBtn:   document.getElementById("install-pos-btn"),
    authModal:       document.getElementById("auth-modal"),
    authCloseBtn:    document.getElementById("auth-close-btn"),
    authUsername:    document.getElementById("auth-username"),
    authPassword:    document.getElementById("auth-password"),
    authLoginBtn:    document.getElementById("auth-login-btn"),
    authStatus:      document.getElementById("auth-status"),
    heldSalesList:   document.getElementById("held-sales-list"),
    refreshHeldBtn:  document.getElementById("refresh-held-btn"),
    heldSalesPrev:   document.getElementById("held-sales-prev"),
    heldSalesNext:   document.getElementById("held-sales-next"),
    heldSalesPage:   document.getElementById("held-sales-page"),
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
    paymentPhoneRow: document.getElementById("payment-phone-row"),
    paymentPhone:    document.getElementById("payment-phone"),
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
    customerOrdersStatusNote: document.getElementById("customer-orders-status-note"),
    customerOrdersStatusClear: document.getElementById("customer-orders-status-clear"),
    customerOrdersSearch: document.getElementById("customer-orders-search"),
    customerOrdersList: document.getElementById("customer-orders-list"),
    customerOrdersLoading: document.getElementById("customer-orders-loading"),
    customerOrdersError: document.getElementById("customer-orders-error"),
    customerOrdersEmpty: document.getElementById("customer-orders-empty"),
    customerOrderDetail: document.getElementById("customer-order-detail"),
    customerOrdersPrev: document.getElementById("customer-orders-prev"),
    customerOrdersNext: document.getElementById("customer-orders-next"),
    customerOrdersPage: document.getElementById("customer-orders-page"),
    backofficeDeliveryDetailModal: document.getElementById("backoffice-delivery-detail-modal"),
    backofficeDeliveryDetailClose: document.getElementById("backoffice-delivery-detail-close"),
    backofficeDeliveryDetailBody: document.getElementById("backoffice-delivery-detail-body"),
    deliveryRunModal: document.getElementById("delivery-run-modal"),
    deliveryRunClose: document.getElementById("delivery-run-close"),
    deliveryRunMeta: document.getElementById("delivery-run-meta"),
    deliveryRunStart: document.getElementById("delivery-run-start"),
    deliveryRunLocation: document.getElementById("delivery-run-location"),
    deliveryRunStatus: document.getElementById("delivery-run-status"),
    deliveryRunStatusSubmit: document.getElementById("delivery-run-status-submit"),
    deliveryRunComplete: document.getElementById("delivery-run-complete"),
    deliveryRunFail: document.getElementById("delivery-run-fail"),
    deliveryRunLocationRefresh: document.getElementById("delivery-run-location-refresh"),
    deliveryRunLocationNote: document.getElementById("delivery-run-location-note"),
    deliveryRunLocationSummary: document.getElementById("delivery-run-location-summary"),
    deliveryRunLocationError: document.getElementById("delivery-run-location-error"),
    deliveryRunHistory: document.getElementById("delivery-run-history"),
    deliveryRunError: document.getElementById("delivery-run-error"),
    deliveryRunPod: document.getElementById("delivery-run-pod"),
    deliveryPodName: document.getElementById("delivery-pod-name"),
    deliveryPodPhone: document.getElementById("delivery-pod-phone"),
    deliveryPodNotes: document.getElementById("delivery-pod-notes"),
    deliveryPaymentCash: document.getElementById("delivery-payment-cash"),
    deliveryPaymentMpesa: document.getElementById("delivery-payment-mpesa"),
    deliveryPaymentReference: document.getElementById("delivery-payment-reference"),
    deliveryPaymentPhone: document.getElementById("delivery-payment-phone"),
    deliveryPaymentNotes: document.getElementById("delivery-payment-notes"),
    deliveryPaymentSummary: document.getElementById("delivery-payment-summary"),
    deliveryPodSubmit: document.getElementById("delivery-pod-submit"),
    deliveryPodCancel: document.getElementById("delivery-pod-cancel"),
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
    aiSummaryCard: document.getElementById("ai-summary-card"),
    aiSummaryStatus: document.getElementById("ai-summary-status"),
    aiSummaryUpdated: document.getElementById("ai-summary-updated"),
    aiSummaryLoading: document.getElementById("ai-summary-loading"),
    aiSummaryText: document.getElementById("ai-summary-text"),
    aiSummaryFinancial: document.getElementById("ai-summary-financial"),
    aiSummaryOps: document.getElementById("ai-summary-ops"),
    aiSummaryAlerts: document.getElementById("ai-summary-alerts"),
    aiSummaryActions: document.getElementById("ai-summary-actions"),
    aiSummaryFinanceAction: document.getElementById("ai-summary-finance-action"),
    aiSummaryOpsAction: document.getElementById("ai-summary-ops-action"),
    aiSummaryAlertsAction: document.getElementById("ai-summary-alerts-action"),
    aiPromptInput: document.getElementById("ai-prompt-input"),
    aiPromptSubmit: document.getElementById("ai-prompt-submit"),
    aiResponse: document.getElementById("ai-response"),
    aiError: document.getElementById("ai-error"),
    ledgerList: document.getElementById("ledger-list"),
    ledgerLoading: document.getElementById("ledger-loading"),
    backofficeModal: document.getElementById("backoffice-modal"),
    backofficeCloseBtn: document.getElementById("backoffice-close-btn"),
    backofficeTabs: document.querySelectorAll(".backoffice-tab"),
    backofficeLedgerTab: document.getElementById("backoffice-ledger-tab"),
    backofficeProductSection: document.getElementById("backoffice-products"),
    backofficeSupplierSection: document.getElementById("backoffice-suppliers"),
    backofficePurchaseSection: document.getElementById("backoffice-purchases"),
    backofficeCustomerSection: document.getElementById("backoffice-customers"),
    backofficeStaffSection: document.getElementById("backoffice-staff"),
    backofficeInventorySection: document.getElementById("backoffice-inventory"),
    backofficeSalesSection: document.getElementById("backoffice-sales"),
    backofficeOrdersSection: document.getElementById("backoffice-orders"),
    backofficeDeliverySection: document.getElementById("backoffice-delivery"),
    backofficePaymentsSection: document.getElementById("backoffice-payments"),
    backofficeSetupSection: document.getElementById("backoffice-setup"),
    backofficeReportsSection: document.getElementById("backoffice-reports"),
    backofficeSetupTabs: document.querySelectorAll(".backoffice-subtab"),
    setupBranchesSection: document.getElementById("setup-branches"),
    setupRoutesSection: document.getElementById("setup-routes"),
    setupCategoriesSection: document.getElementById("setup-categories"),
    setupBranchSearch: document.getElementById("setup-branch-search"),
    setupRouteSearch: document.getElementById("setup-route-search"),
    setupCategorySearch: document.getElementById("setup-category-search"),
    setupBranchAdd: document.getElementById("setup-branch-add"),
    setupRouteAdd: document.getElementById("setup-route-add"),
    setupCategoryAdd: document.getElementById("setup-category-add"),
    setupBranchTable: document.getElementById("setup-branch-table"),
    setupRouteTable: document.getElementById("setup-route-table"),
    setupCategoryTable: document.getElementById("setup-category-table"),
    inventoryAdjustSearch: document.getElementById("inventory-adjust-search"),
    inventoryAdjustBranch: document.getElementById("inventory-adjust-branch"),
    inventoryAdjustProduct: document.getElementById("inventory-adjust-product"),
    inventoryAdjustStock: document.getElementById("inventory-adjust-stock"),
    inventoryAdjustType: document.getElementById("inventory-adjust-type"),
    inventoryAdjustQty: document.getElementById("inventory-adjust-qty"),
    inventoryAdjustReason: document.getElementById("inventory-adjust-reason"),
    inventoryAdjustNote: document.getElementById("inventory-adjust-note"),
    inventoryAdjustError: document.getElementById("inventory-adjust-error"),
    inventoryAdjustSubmit: document.getElementById("inventory-adjust-submit"),
    inventoryAdjustTable: document.getElementById("inventory-adjust-history"),
    inventoryAdjustPrev: document.getElementById("inventory-adjust-prev"),
    inventoryAdjustNext: document.getElementById("inventory-adjust-next"),
    inventoryAdjustPage: document.getElementById("inventory-adjust-page"),
    inventoryAdjustMode: document.querySelectorAll("input[name='inventory-adjust-mode']"),
    inventoryCountedFields: document.getElementById("inventory-counted-fields"),
    inventoryCountedQty: document.getElementById("inventory-counted-qty"),
    inventoryVariance: document.getElementById("inventory-variance"),
    inventoryAdjustPreview: document.getElementById("inventory-adjust-preview"),
    inventoryScanBtn: document.getElementById("inventory-scan-btn"),
    inventoryScanModal: document.getElementById("inventory-scan-modal"),
    inventoryScanClose: document.getElementById("inventory-scan-close"),
    inventoryScanVideo: document.getElementById("inventory-scan-video"),
    inventoryScanStatus: document.getElementById("inventory-scan-status"),
    posScanBtn: document.getElementById("mobile-pos-scan-btn"),
    posScanModal: document.getElementById("pos-scan-modal"),
    posScanClose: document.getElementById("pos-scan-close"),
    posScanVideo: document.getElementById("pos-scan-video"),
    posScanStatus: document.getElementById("pos-scan-status"),
    posScanCode: document.getElementById("pos-scan-code"),
    backofficeSalesSearch: document.getElementById("backoffice-sales-search"),
    backofficeSalesBranch: document.getElementById("backoffice-sales-branch"),
    backofficeSalesStatus: document.getElementById("backoffice-sales-status"),
    backofficeSalesFrom: document.getElementById("backoffice-sales-from"),
    backofficeSalesTo: document.getElementById("backoffice-sales-to"),
    backofficeSalesTable: document.getElementById("backoffice-sales-table"),
    backofficeSalesPrev: document.getElementById("backoffice-sales-prev"),
    backofficeSalesNext: document.getElementById("backoffice-sales-next"),
    backofficeSalesPage: document.getElementById("backoffice-sales-page"),
    backofficeSalesExport: document.getElementById("backoffice-sales-export"),
    backofficeOrdersSearch: document.getElementById("backoffice-orders-search"),
    backofficeOrdersBranch: document.getElementById("backoffice-orders-branch"),
    backofficeOrdersRoute: document.getElementById("backoffice-orders-route"),
    backofficeOrdersStatus: document.getElementById("backoffice-orders-status"),
    backofficeOrdersTable: document.getElementById("backoffice-orders-table"),
    backofficeOrdersPrev: document.getElementById("backoffice-orders-prev"),
    backofficeOrdersNext: document.getElementById("backoffice-orders-next"),
    backofficeOrdersPage: document.getElementById("backoffice-orders-page"),
    backofficeOrdersExport: document.getElementById("backoffice-orders-export"),
    backofficeDeliverySearch: document.getElementById("backoffice-delivery-search"),
    backofficeDeliveryModeQueue: document.getElementById("backoffice-delivery-mode-queue"),
    backofficeDeliveryModeRuns: document.getElementById("backoffice-delivery-mode-runs"),
    backofficeDeliveryQueuePanel: document.getElementById("backoffice-delivery-queue-panel"),
    backofficeDeliveryRunsPanel: document.getElementById("backoffice-delivery-runs-panel"),
    backofficeDeliveryScopeActive: document.getElementById("backoffice-delivery-scope-active"),
    backofficeDeliveryScopeAll: document.getElementById("backoffice-delivery-scope-all"),
    backofficeDeliveryQueueBranch: document.getElementById("backoffice-delivery-queue-branch"),
    backofficeDeliveryQueueTable: document.getElementById("backoffice-delivery-queue-table"),
    backofficeDeliveryQueuePrev: document.getElementById("backoffice-delivery-queue-prev"),
    backofficeDeliveryQueueNext: document.getElementById("backoffice-delivery-queue-next"),
    backofficeDeliveryQueuePage: document.getElementById("backoffice-delivery-queue-page"),
    backofficeDeliveryStatus: document.getElementById("backoffice-delivery-status"),
    backofficeDeliveryPerson: document.getElementById("backoffice-delivery-person"),
    backofficeDeliveryBranch: document.getElementById("backoffice-delivery-branch"),
    backofficeDeliveryTable: document.getElementById("backoffice-delivery-table"),
    backofficeDeliveryPrev: document.getElementById("backoffice-delivery-prev"),
    backofficeDeliveryNext: document.getElementById("backoffice-delivery-next"),
    backofficeDeliveryPage: document.getElementById("backoffice-delivery-page"),
    backofficePaymentsSearch: document.getElementById("backoffice-payments-search"),
    backofficePaymentsModeAll: document.getElementById("backoffice-payments-mode-all"),
    backofficePaymentsModeDelivery: document.getElementById("backoffice-payments-mode-delivery"),
    backofficePaymentsBulkBar: document.getElementById("backoffice-payments-bulk-bar"),
    backofficePaymentsBulkCount: document.getElementById("backoffice-payments-bulk-count"),
    backofficePaymentsBulkNote: document.getElementById("backoffice-payments-bulk-note"),
    backofficePaymentsBulkSubmit: document.getElementById("backoffice-payments-bulk-submit"),
    backofficePaymentsBulkClear: document.getElementById("backoffice-payments-bulk-clear"),
    backofficePaymentsSelectAll: document.getElementById("backoffice-payments-select-all"),
    backofficePaymentsSelectAllCell: document.getElementById("backoffice-payments-select-all-cell"),
    backofficePaymentsBranch: document.getElementById("backoffice-payments-branch"),
    backofficePaymentsDeliveryPerson: document.getElementById("backoffice-payments-delivery-person"),
    backofficePaymentsMethod: document.getElementById("backoffice-payments-method"),
    backofficePaymentsStatus: document.getElementById("backoffice-payments-status"),
    backofficePaymentsCollectionStage: document.getElementById("backoffice-payments-collection-stage"),
    backofficePaymentsRemittance: document.getElementById("backoffice-payments-remittance"),
    backofficePaymentsFrom: document.getElementById("backoffice-payments-from"),
    backofficePaymentsTo: document.getElementById("backoffice-payments-to"),
    backofficePaymentsTable: document.getElementById("backoffice-payments-table"),
    backofficePaymentsPrev: document.getElementById("backoffice-payments-prev"),
    backofficePaymentsNext: document.getElementById("backoffice-payments-next"),
    backofficePaymentsPage: document.getElementById("backoffice-payments-page"),
    backofficePaymentsExport: document.getElementById("backoffice-payments-export"),
    backofficeReportsRange: document.getElementById("backoffice-reports-range"),
    backofficeReportsRefresh: document.getElementById("backoffice-reports-refresh"),
    reportsTodaySales: document.getElementById("reports-today-sales"),
    reportsWeekSales: document.getElementById("reports-week-sales"),
    reportsPendingOrders: document.getElementById("reports-pending-orders"),
    reportsLowStock: document.getElementById("reports-low-stock"),
    reportsSalesNote: document.getElementById("reports-sales-note"),
    reportsSalesTable: document.getElementById("reports-sales-table"),
    reportsPaymentList: document.getElementById("reports-payment-list"),
    reportsTopProductsTable: document.getElementById("reports-top-products-table"),
    reportsLowStockTable: document.getElementById("reports-low-stock-table"),
    backofficeSupplierSearch: document.getElementById("backoffice-supplier-search"),
    backofficeSupplierTable: document.getElementById("backoffice-supplier-table"),
    backofficeSupplierAdd: document.getElementById("backoffice-supplier-add"),
    backofficeSupplierPrev: document.getElementById("backoffice-supplier-prev"),
    backofficeSupplierNext: document.getElementById("backoffice-supplier-next"),
    backofficeSupplierPage: document.getElementById("backoffice-supplier-page"),
    backofficePurchasesSearch: document.getElementById("backoffice-purchases-search"),
    backofficePurchasesStatus: document.getElementById("backoffice-purchases-status"),
    backofficePurchasesSupplier: document.getElementById("backoffice-purchases-supplier"),
    backofficePurchasesBranch: document.getElementById("backoffice-purchases-branch"),
    backofficePurchasesTable: document.getElementById("backoffice-purchases-table"),
    backofficePurchasesPrev: document.getElementById("backoffice-purchases-prev"),
    backofficePurchasesNext: document.getElementById("backoffice-purchases-next"),
    backofficePurchasesPage: document.getElementById("backoffice-purchases-page"),
    backofficePurchaseAdd: document.getElementById("backoffice-purchase-add"),
    backofficePurchasesTabs: document.querySelectorAll("[data-purchases-tab]"),
    backofficePurchasesOrders: document.getElementById("backoffice-purchases-orders"),
    backofficePurchasesBills: document.getElementById("backoffice-purchases-bills"),
    backofficeBillsSearch: document.getElementById("backoffice-bills-search"),
    backofficeBillsStatus: document.getElementById("backoffice-bills-status"),
    backofficeBillsSupplier: document.getElementById("backoffice-bills-supplier"),
    backofficeBillsBranch: document.getElementById("backoffice-bills-branch"),
    backofficeBillsTable: document.getElementById("backoffice-bills-table"),
    backofficeBillsPrev: document.getElementById("backoffice-bills-prev"),
    backofficeBillsNext: document.getElementById("backoffice-bills-next"),
    backofficeBillsPage: document.getElementById("backoffice-bills-page"),
    backofficeCustomerSearch: document.getElementById("backoffice-customer-search"),
    backofficeCustomerTable: document.getElementById("backoffice-customer-table"),
    backofficeCustomerAdd: document.getElementById("backoffice-customer-add"),
    backofficeCustomerBranch: document.getElementById("backoffice-customer-branch"),
    backofficeCustomerRoute: document.getElementById("backoffice-customer-route"),
    backofficeCustomerPrev: document.getElementById("backoffice-customer-prev"),
    backofficeCustomerNext: document.getElementById("backoffice-customer-next"),
    backofficeCustomerPage: document.getElementById("backoffice-customer-page"),
    backofficeStaffSearch: document.getElementById("backoffice-staff-search"),
    backofficeStaffTable: document.getElementById("backoffice-staff-table"),
    backofficeStaffAdd: document.getElementById("backoffice-staff-add"),
    backofficeStaffPrev: document.getElementById("backoffice-staff-prev"),
    backofficeStaffNext: document.getElementById("backoffice-staff-next"),
    backofficeStaffPage: document.getElementById("backoffice-staff-page"),
    backofficeProductSearch: document.getElementById("backoffice-product-search"),
    backofficeProductTable: document.getElementById("backoffice-product-table"),
    backofficeProductAdd: document.getElementById("backoffice-product-add"),
    backofficeProductTemplate: document.getElementById("backoffice-product-template"),
    backofficeProductExport: document.getElementById("backoffice-product-export"),
    backofficeProductImport: document.getElementById("backoffice-product-import"),
    backofficeProductFile: document.getElementById("backoffice-product-file"),
    backofficeProductResult: document.getElementById("backoffice-product-result"),
    productFormModal: document.getElementById("product-form-modal"),
    productForm: document.getElementById("product-form"),
    productFormTitle: document.getElementById("product-form-title"),
    productFormClose: document.getElementById("product-form-close"),
    productFormCancel: document.getElementById("product-form-cancel"),
    productFormError: document.getElementById("product-form-error"),
    productFormSave: document.getElementById("product-form-save"),
    productSku: document.getElementById("product-sku"),
    productName: document.getElementById("product-name"),
    productCategory: document.getElementById("product-category"),
    productUnitName: document.getElementById("product-unit-name"),
    productUnitCode: document.getElementById("product-unit-code"),
    productUnitsList: document.getElementById("product-units-list"),
    productUnitAdd: document.getElementById("product-unit-add"),
    productSupplierSelect: document.getElementById("product-supplier-select"),
    productSupplierAdd: document.getElementById("product-supplier-add"),
    productSuppliersList: document.getElementById("product-suppliers-list"),
    productCost: document.getElementById("product-cost"),
    productSelling: document.getElementById("product-selling"),
    productRetail: document.getElementById("product-retail"),
    productWholesale: document.getElementById("product-wholesale"),
    productThreshold: document.getElementById("product-threshold"),
    productBranch: document.getElementById("product-branch"),
    productStock: document.getElementById("product-stock"),
    productActive: document.getElementById("product-active"),
    customerFormModal: document.getElementById("customer-form-modal"),
    customerForm: document.getElementById("customer-form"),
    customerFormTitle: document.getElementById("customer-form-title"),
    customerFormClose: document.getElementById("customer-form-close"),
    customerFormCancel: document.getElementById("customer-form-cancel"),
    customerFormSave: document.getElementById("customer-form-save"),
    customerFormError: document.getElementById("customer-form-error"),
    supplierFormModal: document.getElementById("supplier-form-modal"),
    supplierForm: document.getElementById("supplier-form"),
    supplierFormTitle: document.getElementById("supplier-form-title"),
    supplierFormClose: document.getElementById("supplier-form-close"),
    supplierFormCancel: document.getElementById("supplier-form-cancel"),
    supplierFormSave: document.getElementById("supplier-form-save"),
    supplierFormError: document.getElementById("supplier-form-error"),
    supplierName: document.getElementById("supplier-name"),
    supplierContact: document.getElementById("supplier-contact"),
    supplierPhone: document.getElementById("supplier-phone"),
    supplierEmail: document.getElementById("supplier-email"),
    supplierAddress: document.getElementById("supplier-address"),
    supplierNotes: document.getElementById("supplier-notes"),
    supplierActive: document.getElementById("supplier-active"),
    supplierLinkedProducts: document.getElementById("supplier-linked-products"),
    supplierBalance: document.getElementById("supplier-balance"),
    supplierBillsList: document.getElementById("supplier-bills-list"),
    supplierLedgerList: document.getElementById("supplier-ledger-list"),
    purchaseFormModal: document.getElementById("purchase-form-modal"),
    purchaseForm: document.getElementById("purchase-form"),
    purchaseFormTitle: document.getElementById("purchase-form-title"),
    purchaseFormClose: document.getElementById("purchase-form-close"),
    purchaseFormCancel: document.getElementById("purchase-form-cancel"),
    purchaseFormSave: document.getElementById("purchase-form-save"),
    purchaseFormError: document.getElementById("purchase-form-error"),
    purchaseCancelPo: document.getElementById("purchase-cancel-po"),
    purchaseSupplier: document.getElementById("purchase-supplier"),
    purchaseBranch: document.getElementById("purchase-branch"),
    purchaseExpectedDate: document.getElementById("purchase-expected-date"),
    purchaseNotes: document.getElementById("purchase-notes"),
    purchaseStatusPill: document.getElementById("purchase-status-pill"),
    purchaseLineProduct: document.getElementById("purchase-line-product"),
    purchaseLineQty: document.getElementById("purchase-line-qty"),
    purchaseLineCost: document.getElementById("purchase-line-cost"),
    purchaseLineNotes: document.getElementById("purchase-line-notes"),
    purchaseLineAdd: document.getElementById("purchase-line-add"),
    purchaseLinesList: document.getElementById("purchase-lines-list"),
    purchaseMarkOrdered: document.getElementById("purchase-mark-ordered"),
    purchaseReceiveOpen: document.getElementById("purchase-receive-open"),
    purchaseReceiveModal: document.getElementById("purchase-receive-modal"),
    purchaseReceiveClose: document.getElementById("purchase-receive-close"),
    purchaseReceiveCancel: document.getElementById("purchase-receive-cancel"),
    purchaseReceiveSubmit: document.getElementById("purchase-receive-submit"),
    purchaseReceiveList: document.getElementById("purchase-receive-list"),
    purchaseReceiveError: document.getElementById("purchase-receive-error"),
    purchaseReceiveMeta: document.getElementById("purchase-receive-meta"),
    purchaseReceiptsList: document.getElementById("purchase-receipts-list"),
    purchaseCreateBill: document.getElementById("purchase-create-bill"),
    purchaseViewBill: document.getElementById("purchase-view-bill"),
    purchaseBillMeta: document.getElementById("purchase-bill-meta"),
    billDetailModal: document.getElementById("bill-detail-modal"),
    billDetailClose: document.getElementById("bill-detail-close"),
    billDetailCloseBtn: document.getElementById("bill-detail-close-btn"),
    billDetailTitle: document.getElementById("bill-detail-title"),
    billDetailStatus: document.getElementById("bill-detail-status"),
    billDetailMeta: document.getElementById("bill-detail-meta"),
    billDetailLines: document.getElementById("bill-detail-lines"),
    billDetailTotals: document.getElementById("bill-detail-totals"),
    billDetailNotes: document.getElementById("bill-detail-notes"),
    billDetailError: document.getElementById("bill-detail-error"),
    billDetailCancel: document.getElementById("bill-detail-cancel"),
    customerName: document.getElementById("customer-name"),
    customerRoute: document.getElementById("customer-route"),
    customerWholesale: document.getElementById("customer-wholesale"),
    customerActive: document.getElementById("customer-active"),
    customerBalance: document.getElementById("customer-balance"),
    staffFormModal: document.getElementById("staff-form-modal"),
    staffForm: document.getElementById("staff-form"),
    staffFormTitle: document.getElementById("staff-form-title"),
    staffFormClose: document.getElementById("staff-form-close"),
    staffFormCancel: document.getElementById("staff-form-cancel"),
    staffFormSave: document.getElementById("staff-form-save"),
    staffFormError: document.getElementById("staff-form-error"),
    staffUsername: document.getElementById("staff-username"),
    staffEmail: document.getElementById("staff-email"),
    staffFirst: document.getElementById("staff-first"),
    staffMiddle: document.getElementById("staff-middle"),
    staffLast: document.getElementById("staff-last"),
    staffPhone: document.getElementById("staff-phone"),
    staffRole: document.getElementById("staff-role"),
    staffBranch: document.getElementById("staff-branch"),
    staffPassword: document.getElementById("staff-password"),
    staffPasswordRequired: document.getElementById("staff-password-required"),
    staffPasswordHint: document.getElementById("staff-password-hint"),
    staffActive: document.getElementById("staff-active"),
    branchFormModal: document.getElementById("branch-form-modal"),
    branchForm: document.getElementById("branch-form"),
    branchFormTitle: document.getElementById("branch-form-title"),
    branchFormClose: document.getElementById("branch-form-close"),
    branchFormCancel: document.getElementById("branch-form-cancel"),
    branchFormSave: document.getElementById("branch-form-save"),
    branchFormError: document.getElementById("branch-form-error"),
    branchName: document.getElementById("branch-name"),
    branchLocation: document.getElementById("branch-location"),
    branchActive: document.getElementById("branch-active"),
    routeFormModal: document.getElementById("route-form-modal"),
    routeForm: document.getElementById("route-form"),
    routeFormTitle: document.getElementById("route-form-title"),
    routeFormClose: document.getElementById("route-form-close"),
    routeFormCancel: document.getElementById("route-form-cancel"),
    routeFormSave: document.getElementById("route-form-save"),
    routeFormError: document.getElementById("route-form-error"),
    routeName: document.getElementById("route-name"),
    routeCode: document.getElementById("route-code"),
    routeBranch: document.getElementById("route-branch"),
    routeActive: document.getElementById("route-active"),
    categoryFormModal: document.getElementById("category-form-modal"),
    categoryForm: document.getElementById("category-form"),
    categoryFormTitle: document.getElementById("category-form-title"),
    categoryFormClose: document.getElementById("category-form-close"),
    categoryFormCancel: document.getElementById("category-form-cancel"),
    categoryFormSave: document.getElementById("category-form-save"),
    categoryFormError: document.getElementById("category-form-error"),
    categoryName: document.getElementById("category-name"),
    categoryActive: document.getElementById("category-active"),
    backofficeSaleDetailModal: document.getElementById("backoffice-sale-detail-modal"),
    backofficeSaleDetailClose: document.getElementById("backoffice-sale-detail-close"),
    backofficeSaleDetailBody: document.getElementById("backoffice-sale-detail-body"),
    backofficeOrderDetailModal: document.getElementById("backoffice-order-detail-modal"),
    backofficeOrderDetailClose: document.getElementById("backoffice-order-detail-close"),
    backofficeOrderDetailBody: document.getElementById("backoffice-order-detail-body"),
    backofficePaymentDetailModal: document.getElementById("backoffice-payment-detail-modal"),
    backofficePaymentDetailClose: document.getElementById("backoffice-payment-detail-close"),
    backofficePaymentDetailBody: document.getElementById("backoffice-payment-detail-body"),
    ledgerError: document.getElementById("ledger-error"),
    ledgerEmpty: document.getElementById("ledger-empty"),
    ledgerPrev: document.getElementById("ledger-prev"),
    ledgerNext: document.getElementById("ledger-next"),
    ledgerPage: document.getElementById("ledger-page"),
    ledgerTabs: document.querySelectorAll(".ledger-tab"),
    ledgerOverviewPanel: document.getElementById("ledger-overview-panel"),
    ledgerExpensesPanel: document.getElementById("ledger-expenses-panel"),
    ledgerPerformancePanel: document.getElementById("ledger-performance-panel"),
    performanceStart: document.getElementById("performance-start"),
    performanceEnd: document.getElementById("performance-end"),
    performanceBranch: document.getElementById("performance-branch"),
    performanceUser: document.getElementById("performance-user"),
    performanceUserFilter: document.getElementById("performance-user-filter"),
    performanceRouteFilter: document.getElementById("performance-route-filter"),
    performanceRoute: document.getElementById("performance-route"),
    performanceExportBtn: document.getElementById("performance-export-btn"),
    performanceTabs: document.querySelectorAll(".perf-tab"),
    performanceLoading: document.getElementById("performance-loading"),
    performanceError: document.getElementById("performance-error"),
    performanceCashiersPanel: document.getElementById("performance-cashiers-panel"),
    performanceSalesPanel: document.getElementById("performance-salespeople-panel"),
    performanceDeliveryPanel: document.getElementById("performance-delivery-panel"),
    performanceRoutesPanel: document.getElementById("performance-routes-panel"),
    performanceCashiersList: document.getElementById("performance-cashiers-list"),
    performanceSalesList: document.getElementById("performance-salespeople-list"),
    performanceDeliveryList: document.getElementById("performance-delivery-list"),
    performanceRoutesList: document.getElementById("performance-routes-list"),
    performanceCashiersEmpty: document.getElementById("performance-cashiers-empty"),
    performanceSalesEmpty: document.getElementById("performance-salespeople-empty"),
    performanceDeliveryEmpty: document.getElementById("performance-delivery-empty"),
    performanceRoutesEmpty: document.getElementById("performance-routes-empty"),
    performanceCashiersSummary: document.getElementById("performance-cashiers-summary"),
    performanceSalesSummary: document.getElementById("performance-salespeople-summary"),
    performanceDeliverySummary: document.getElementById("performance-delivery-summary"),
    performanceRoutesSummary: document.getElementById("performance-routes-summary"),
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
    expensePrev: document.getElementById("expense-prev"),
    expenseNext: document.getElementById("expense-next"),
    expensePage: document.getElementById("expense-page"),
    returnsModal: document.getElementById("returns-modal"),
    returnsCloseBtn: document.getElementById("returns-close-btn"),
    returnsSaleId: document.getElementById("returns-sale-id"),
    returnsLoadBtn: document.getElementById("returns-load-btn"),
    returnsSaleMeta: document.getElementById("returns-sale-meta"),
    returnsItems: document.getElementById("returns-items"),
    returnsCalcBtn: document.getElementById("returns-calc-btn"),
    returnsSubmitBtn: document.getElementById("returns-submit-btn"),
    returnsTotal: document.getElementById("returns-total"),
    returnsError: document.getElementById("returns-error"),
    mobileRoleBanner: document.getElementById("mobile-role-banner"),
    mobileProductsList: document.getElementById("mobile-products-list"),
    mobileCategoryChips: document.getElementById("mobile-category-chips"),
    mobileCartPanel: document.getElementById("mobile-cart-panel"),
    mobileCartList: document.getElementById("mobile-cart-list"),
    mobileCartCheckout: document.getElementById("mobile-cart-checkout"),
    mobileSubtotal: document.getElementById("mobile-subtotal"),
    mobileGrandTotal: document.getElementById("mobile-grand-total"),
    mobileItemsCount: document.getElementById("mobile-items-count"),
    mobileHeldPanel: document.getElementById("mobile-held-panel"),
    mobileHeldList: document.getElementById("mobile-held-list"),
    mobileHeldRefresh: document.getElementById("mobile-held-refresh"),
    mobileNav: document.getElementById("mobile-pos-nav"),
    mobileNavButtons: document.querySelectorAll("#mobile-pos-nav .mobile-nav-btn"),
    mobileCustomerAdd: document.getElementById("mobile-customer-add"),
    mobileCustomerCurrent: document.getElementById("mobile-customer-current"),
    mobileCustomerSelect: document.getElementById("mobile-customer-select"),
    mobileCustomerModal: document.getElementById("mobile-customer-modal"),
    mobileCustomerName: document.getElementById("mobile-customer-name"),
    mobileCustomerSubmit: document.getElementById("mobile-customer-submit"),
    mobileCustomerCancel: document.getElementById("mobile-customer-cancel"),
    mobileCustomerError: document.getElementById("mobile-customer-error"),
    mobileSuccessModal: document.getElementById("mobile-success-modal"),
    mobileSuccessClose: document.getElementById("mobile-success-close"),
    mobileSuccessBody: document.getElementById("mobile-success-body"),
    mobileSuccessReceipt: document.getElementById("mobile-success-receipt"),
    mobileSuccessPrint: document.getElementById("mobile-success-print"),
    mobileSuccessNewSale: document.getElementById("mobile-success-new-sale"),
    mobileSuccessProducts: document.getElementById("mobile-success-products"),
    mobileSuccessDebug: document.getElementById("mobile-success-debug"),
    mobileDashboardPanel: document.getElementById("mobile-dashboard-panel"),
    mobileSummarySalesValue: document.getElementById("mobile-summary-sales-value"),
    mobileSummarySalesSub: document.getElementById("mobile-summary-sales-sub"),
    mobileSummaryExpensesValue: document.getElementById("mobile-summary-expenses-value"),
    mobileSummaryExpensesSub: document.getElementById("mobile-summary-expenses-sub"),
    mobileDeliveryDashboard: document.getElementById("mobile-delivery-dashboard"),
    mobileDeliveryAssignedOrdersValue: document.getElementById("mobile-delivery-assigned-orders-value"),
    mobileDeliveryAssignedOrdersSub: document.getElementById("mobile-delivery-assigned-orders-sub"),
    mobileDeliveryActiveRunsValue: document.getElementById("mobile-delivery-active-runs-value"),
    mobileDeliveryActiveRunsSub: document.getElementById("mobile-delivery-active-runs-sub"),
    mobileDeliveryCompletedTodayValue: document.getElementById("mobile-delivery-completed-today-value"),
    mobileDeliveryCompletedTodaySub: document.getElementById("mobile-delivery-completed-today-sub"),
    mobileDeliveryAssignedOrdersBtn: document.getElementById("mobile-delivery-assigned-orders"),
    mobileDeliveryActiveRunsBtn: document.getElementById("mobile-delivery-active-runs"),
    mobileDeliveryCompletedTodayBtn: document.getElementById("mobile-delivery-completed-today"),
    mobileTileSell: document.getElementById("mobile-tile-sell"),
    mobileTileSales: document.getElementById("mobile-tile-sales"),
    mobileTileStock: document.getElementById("mobile-tile-stock"),
    mobileTileCustomers: document.getElementById("mobile-tile-customers"),
    mobileTileCustomerOrders: document.getElementById("mobile-tile-customer-orders"),
    mobileTileReports: document.getElementById("mobile-tile-reports"),
    mobileTileDelivery: document.getElementById("mobile-tile-delivery"),
    mobileSalesPanel: document.getElementById("mobile-sales-panel"),
    mobileSalesBack: document.getElementById("mobile-sales-back"),
    mobileSalesFilter: document.getElementById("mobile-sales-filter"),
    mobileSalesList: document.getElementById("mobile-sales-list"),
    mobileSalesSummary: document.getElementById("mobile-sales-summary"),
    mobileSalesScope: document.getElementById("mobile-sales-scope"),
    mobileStockPanel: document.getElementById("mobile-stock-panel"),
    mobileStockBack: document.getElementById("mobile-stock-back"),
    mobileStockSearch: document.getElementById("mobile-stock-search"),
    mobileStockCategoryChips: document.getElementById("mobile-stock-category-chips"),
    mobileStockList: document.getElementById("mobile-stock-list"),
    mobileStockFilterNote: document.getElementById("mobile-stock-filter-note"),
    mobileStockFilterClear: document.getElementById("mobile-stock-filter-clear"),
    mobileCustomersPanel: document.getElementById("mobile-customers-panel"),
    mobileCustomersBack: document.getElementById("mobile-customers-back"),
    mobileCustomersSearch: document.getElementById("mobile-customers-search"),
    mobileCustomersList: document.getElementById("mobile-customers-list"),
    mobileReportsPanel: document.getElementById("mobile-reports-panel"),
    mobileReportsBack: document.getElementById("mobile-reports-back"),
    mobileReportsRetry: document.getElementById("mobile-reports-retry"),
    mobileReportsError: document.getElementById("mobile-reports-error"),
    mobileReportsContent: document.getElementById("mobile-reports-content"),
    mobileReportsTodaySales: document.getElementById("mobile-reports-today-sales"),
    mobileReportsWeekSales: document.getElementById("mobile-reports-week-sales"),
    mobileReportsPendingOrders: document.getElementById("mobile-reports-pending-orders"),
    mobileReportsLowStock: document.getElementById("mobile-reports-low-stock"),
    mobileReportsTopProducts: document.getElementById("mobile-reports-top-products"),
    mobileReportsEmpty: document.getElementById("mobile-reports-empty"),
    deliveryRunQuickActions: document.getElementById("delivery-run-quick-actions"),
    deliveryRunStatusActions: document.getElementById("delivery-run-status-actions"),
    mobileDeliveriesPanel: document.getElementById("mobile-deliveries-panel"),
    mobileDeliveriesBack: document.getElementById("mobile-deliveries-back"),
    mobileDeliveriesFilter: document.getElementById("mobile-deliveries-filter"),
    mobileDeliveriesScope: document.getElementById("mobile-deliveries-scope"),
    mobileDeliveriesLoading: document.getElementById("mobile-deliveries-loading"),
    mobileDeliveriesError: document.getElementById("mobile-deliveries-error"),
    mobileDeliveriesList: document.getElementById("mobile-deliveries-list"),
    mobileDeliveriesEmpty: document.getElementById("mobile-deliveries-empty"),
    mobileCustomerDetailModal: document.getElementById("mobile-customer-detail-modal"),
    mobileCustomerDetailClose: document.getElementById("mobile-customer-detail-close"),
    mobileCustomerDetailBody: document.getElementById("mobile-customer-detail-body"),
    mobileCustomerCall: document.getElementById("mobile-customer-call"),
    mobileCustomerWhatsapp: document.getElementById("mobile-customer-whatsapp"),
    mobileCustomerPaymentBtn: document.getElementById("mobile-customer-payment-btn"),
    mobileCustomerPaymentModal: document.getElementById("mobile-customer-payment-modal"),
    mobileCustomerPaymentClose: document.getElementById("mobile-customer-payment-close"),
    mobileCustomerPaymentAmount: document.getElementById("mobile-customer-payment-amount"),
    mobileCustomerPaymentMethod: document.getElementById("mobile-customer-payment-method"),
    mobileCustomerPaymentReference: document.getElementById("mobile-customer-payment-reference"),
    mobileCustomerPaymentNote: document.getElementById("mobile-customer-payment-note"),
    mobileCustomerPaymentError: document.getElementById("mobile-customer-payment-error"),
    mobileCustomerPaymentSubmit: document.getElementById("mobile-customer-payment-submit"),
    mobileSaleDetailModal: document.getElementById("mobile-sale-detail-modal"),
    mobileSaleDetailClose: document.getElementById("mobile-sale-detail-close"),
    mobileSaleDetailBody: document.getElementById("mobile-sale-detail-body"),
    mobileSaleDetailReceipt: document.getElementById("mobile-sale-detail-receipt"),
    mobileSaleDetailPrint: document.getElementById("mobile-sale-detail-print"),
};

// ——— Overlay / Modal Helpers ———
const overlayStack = [];

function getOverlayCloseHandler(id) {
    switch (id) {
        case "auth-modal":
            return closeAuthModal;
        case "credit-modal":
            return closeCreditModal;
        case "customer-orders-modal":
            return closeCustomerOrdersModal;
        case "ledger-modal":
            return closeLedgerModal;
        case "returns-modal":
            return closeReturnsModal;
        case "receipt-modal":
            return closeReceiptModal;
        case "inventory-scan-modal":
            return closeInventoryScanModal;
        case "delivery-run-modal":
            return closeDeliveryRunModal;
        case "backoffice-delivery-detail-modal":
            return closeBackOfficeDeliveryDetail;
        default:
            return null;
    }
}

function getOpenOverlays() {
    return Array.from(document.querySelectorAll(".modal-overlay"))
        .filter(overlay => !overlay.classList.contains("hidden"));
}

function updateOverlayState() {
    const hasOpenOverlay = getOpenOverlays().length > 0;
    document.body.classList.toggle("overlay-open", hasOpenOverlay);
}

function isMobileHistoryOverlay(id) {
    return MOBILE_HISTORY_OVERLAYS.has(id);
}

function getTopMobileHistoryOverlayId() {
    for (let i = overlayStack.length - 1; i >= 0; i -= 1) {
        const id = overlayStack[i];
        if (isMobileHistoryOverlay(id)) {
            const overlay = document.getElementById(id);
            if (overlay && !overlay.classList.contains("hidden")) return id;
        }
    }
    for (const id of MOBILE_HISTORY_OVERLAYS) {
        const overlay = document.getElementById(id);
        if (overlay && !overlay.classList.contains("hidden")) return id;
    }
    return null;
}

function getMobileOverlayHistoryState(overlayId = getTopMobileHistoryOverlayId()) {
    if (!overlayId) return null;
    const state = { id: overlayId };
    switch (overlayId) {
        case "mobile-sale-detail-modal":
            state.saleId = currentMobileSaleDetailId || null;
            break;
        case "mobile-customer-detail-modal":
        case "mobile-customer-payment-modal":
            state.customerId = currentMobileCustomerId || null;
            break;
        case "mobile-success-modal":
            state.saleId = lastMobileSaleId || null;
            break;
        case "receipt-modal":
            state.saleId = currentMobileSaleDetailId || lastMobileSaleId || null;
            break;
        case "customer-orders-modal":
            if (Array.isArray(customerOrdersStatusList) && customerOrdersStatusList.length) {
                state.statusList = [...customerOrdersStatusList];
            }
            break;
        default:
            break;
    }
    return state;
}

function getMobileHistoryStateFromUI() {
    return {
        mobileNav: true,
        tab: normalizeMobileTab(activeMobileTab),
        branchId: els.branchSelect?.value || "",
        screenState: captureMobileScreenState(activeMobileTab),
        overlay: getMobileOverlayHistoryState(),
    };
}

function sameMobileHistoryState(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function getEmptyMobileUiState() {
    return {
        version: 1,
        role: "",
        activeTab: "home",
        branchId: "",
        tabs: {},
    };
}

function loadMobileUiState() {
    try {
        const raw = sessionStorage.getItem(MOBILE_UI_STATE_KEY);
        if (!raw) return getEmptyMobileUiState();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1 || typeof parsed !== "object") {
            return getEmptyMobileUiState();
        }
        return {
            ...getEmptyMobileUiState(),
            ...parsed,
            tabs: parsed.tabs && typeof parsed.tabs === "object" ? parsed.tabs : {},
        };
    } catch (err) {
        return getEmptyMobileUiState();
    }
}

function persistMobileUiState() {
    try {
        sessionStorage.setItem(MOBILE_UI_STATE_KEY, JSON.stringify(mobileUiState));
    } catch (err) {
        // Ignore storage failures; state persistence is best-effort.
    }
}

function clearMobileUiState() {
    mobileUiState = getEmptyMobileUiState();
    mobilePendingScrollRestore = null;
    try {
        sessionStorage.removeItem(MOBILE_UI_STATE_KEY);
    } catch (err) {
        // Ignore storage failures.
    }
}

function getMobileSavedTabState(tab = activeMobileTab) {
    const normalized = normalizeMobileTab(tab);
    if (!mobileUiState || mobileUiState.role && mobileUiState.role !== getResolvedUserRole()) {
        return null;
    }
    if (!canAccessMobileTab(normalized)) return null;
    const state = mobileUiState.tabs?.[normalized];
    if (!state || typeof state !== "object") return null;
    return state;
}

function getMobilePersistedActiveTab() {
    if (!mobileUiState || mobileUiState.role && mobileUiState.role !== getResolvedUserRole()) {
        return "home";
    }
    const tab = normalizeMobileTab(mobileUiState.activeTab || "home");
    return canAccessMobileTab(tab) ? tab : "home";
}

function getMobilePersistedBranchId() {
    if (!mobileUiState || mobileUiState.role && mobileUiState.role !== getResolvedUserRole()) {
        return "";
    }
    return mobileUiState.branchId || "";
}

function captureMobileScreenState(tab = activeMobileTab) {
    const normalized = normalizeMobileTab(tab);
    const scrollY = Math.max(0, window.scrollY || window.pageYOffset || 0);
    switch (normalized) {
        case "products":
            return {
                query: (els.productSearch?.value || "").trim(),
                category: mobileActiveCategory || "all",
                scrollY,
            };
        case "cart":
            return { scrollY };
        case "sales":
            return {
                filter: mobileSalesFilter || "today",
                scrollY,
            };
        case "stock":
            return {
                query: mobileStockQuery || "",
                category: mobileStockCategory || "all",
                lowOnly: Boolean(mobileStockLowOnly),
                scrollY,
            };
        case "customers":
            return {
                query: mobileCustomersQuery || "",
                scrollY,
            };
        case "reports":
        case "checkout":
        case "home":
        default:
            return { scrollY };
    }
}

function upsertMobileTabState(tab, snapshot = {}, { preserveScroll = true } = {}) {
    if (!isMobileLayout()) return;
    const normalized = normalizeMobileTab(tab);
    if (!canAccessMobileTab(normalized)) return;
    const existing = mobileUiState.tabs?.[normalized] || {};
    const nextState = {
        ...existing,
        ...snapshot,
    };
    if (preserveScroll && existing.scrollY !== undefined && snapshot.scrollY === undefined) {
        nextState.scrollY = existing.scrollY;
    }
    mobileUiState.role = getResolvedUserRole();
    mobileUiState.activeTab = normalized;
    mobileUiState.branchId = els.branchSelect?.value || "";
    mobileUiState.tabs[normalized] = nextState;
    persistMobileUiState();
}

function persistMobileScreenState(tab = activeMobileTab) {
    if (!isMobileLayout() || mobileStateRestoring) return;
    upsertMobileTabState(tab, captureMobileScreenState(tab), { preserveScroll: false });
}

function restoreMobileBranchSelection(branchId = getMobilePersistedBranchId()) {
    if (!branchId || !els.branchSelect) return false;
    const hasOption = Array.from(els.branchSelect.options || []).some((opt) => opt.value === branchId);
    if (!hasOption) return false;
    els.branchSelect.value = branchId;
    return true;
}

function queueMobileScrollRestore(tab, scrollY) {
    if (scrollY === null || scrollY === undefined) return;
    const normalized = normalizeMobileTab(tab);
    const nextToken = (mobilePendingScrollRestore?.token || 0) + 1;
    mobilePendingScrollRestore = {
        tab: normalized,
        scrollY: Math.max(0, Number(scrollY) || 0),
        token: nextToken,
    };
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!mobilePendingScrollRestore || mobilePendingScrollRestore.token !== nextToken) return;
            if (normalizeMobileTab(activeMobileTab) !== normalized) return;
            window.scrollTo({ top: mobilePendingScrollRestore.scrollY, behavior: "auto" });
            mobilePendingScrollRestore = null;
        });
    });
}

function applyMobileScreenState(tab, state) {
    if (!state || typeof state !== "object") return false;
    const normalized = normalizeMobileTab(tab);
    switch (normalized) {
        case "products": {
            const query = (state.query || "").trim();
            mobileActiveCategory = state.category || "all";
            if (els.productSearch) {
                els.productSearch.value = query;
            }
            if (els.mobileCategoryChips) {
                renderMobileCategoryChips();
            }
            if (query) {
                mobileSearchQuery = query.toLowerCase();
                updateSearchResults({ keepOpen: true });
            } else {
                resetMobileSearch();
                renderMobileProducts();
            }
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        }
        case "cart":
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        case "sales":
            mobileSalesFilter = state.filter || "today";
            if (els.mobileSalesFilter) {
                els.mobileSalesFilter.value = mobileSalesFilter;
            }
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        case "stock":
            mobileStockQuery = state.query || "";
            mobileStockCategory = state.category || "all";
            mobileStockLowOnly = Boolean(state.lowOnly);
            if (els.mobileStockSearch) {
                els.mobileStockSearch.value = mobileStockQuery;
            }
            if (els.mobileStockCategoryChips) {
                renderMobileStockCategoryChips();
            }
            updateMobileStockFilterNote();
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        case "customers":
            mobileCustomersQuery = state.query || "";
            if (els.mobileCustomersSearch) {
                els.mobileCustomersSearch.value = mobileCustomersQuery;
            }
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        case "home":
        case "reports":
        case "checkout":
            if (state.scrollY !== undefined) {
                queueMobileScrollRestore(normalized, state.scrollY);
            }
            return true;
        default:
            return false;
    }
}

function restoreMobileScreenState(tab, snapshot = null) {
    if (!isMobileLayout()) return false;
    const normalized = normalizeMobileTab(tab);
    const state = snapshot || getMobileSavedTabState(normalized);
    if (!state) return false;
    mobileStateRestoring = true;
    try {
        const restored = applyMobileScreenState(normalized, state);
        if (restored) {
            mobileUiState.role = getResolvedUserRole();
            mobileUiState.activeTab = normalized;
            mobileUiState.branchId = els.branchSelect?.value || mobileUiState.branchId || "";
            mobileUiState.tabs[normalized] = state;
            persistMobileUiState();
        }
        return restored;
    } finally {
        mobileStateRestoring = false;
    }
}

function restoreMobileScrollIfNeeded(tab) {
    if (!mobilePendingScrollRestore) return;
    const normalized = normalizeMobileTab(tab);
    if (mobilePendingScrollRestore.tab !== normalized) return;
    const { scrollY, token } = mobilePendingScrollRestore;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!mobilePendingScrollRestore || mobilePendingScrollRestore.token !== token) return;
            if (normalizeMobileTab(activeMobileTab) !== normalized) return;
            window.scrollTo({ top: scrollY, behavior: "auto" });
            mobilePendingScrollRestore = null;
        });
    });
}

function syncMobileHistoryState(mode = "push") {
    if (!isMobileLayout() || mobileHistorySyncSuspended) return;
    const state = getMobileHistoryStateFromUI();
    const current = window.history.state;
    if (mode === "replace" || !current || !current.mobileNav || sameMobileHistoryState(current, state)) {
        window.history.replaceState(state, "", window.location.href);
        return;
    }
    window.history.pushState(state, "", window.location.href);
}

function closeOpenMobileHistoryOverlays() {
    Array.from(MOBILE_HISTORY_OVERLAYS).forEach((id) => {
        const overlay = document.getElementById(id);
        if (overlay && !overlay.classList.contains("hidden")) {
            closeOverlay(overlay, { syncHistory: false });
        }
    });
}

function openOverlay(overlayEl, { closeOthers = true, syncHistory = true } = {}) {
    if (!overlayEl) return;
    const trackHistory = syncHistory && isMobileLayout() && isMobileHistoryOverlay(overlayEl.id) && !mobileHistorySyncSuspended;
    if (trackHistory) {
        persistMobileScreenState(activeMobileTab);
        mobileHistorySyncSuspended = true;
    }
    if (closeOthers) closeAllOverlays({ except: overlayEl });
    if (trackHistory) {
        mobileHistorySyncSuspended = false;
    }
    overlayEl.classList.remove("hidden");
    const existingIndex = overlayStack.indexOf(overlayEl.id);
    if (existingIndex !== -1) overlayStack.splice(existingIndex, 1);
    overlayStack.push(overlayEl.id);
    updateOverlayState();
    if (syncHistory && isMobileLayout() && isMobileHistoryOverlay(overlayEl.id)) {
        syncMobileHistoryState("push");
    }
}

function closeOverlay(overlayEl, { syncHistory = true } = {}) {
    if (!overlayEl) return;
    overlayEl.classList.add("hidden");
    const index = overlayStack.indexOf(overlayEl.id);
    if (index !== -1) overlayStack.splice(index, 1);
    updateOverlayState();
    if (syncHistory && isMobileLayout() && isMobileHistoryOverlay(overlayEl.id)) {
        syncMobileHistoryState("replace");
    }
}

function closeOverlayById(id) {
    if (!id) return;
    const handler = getOverlayCloseHandler(id);
    if (handler) {
        handler();
        return;
    }
    closeOverlay(document.getElementById(id));
}

function closeAllOverlays({ except } = {}) {
    getOpenOverlays().forEach(overlay => {
        if (except && overlay === except) return;
        closeOverlayById(overlay.id);
    });
    updateOverlayState();
}

function getTopOverlay() {
    if (overlayStack.length) {
        const id = overlayStack[overlayStack.length - 1];
        const overlay = document.getElementById(id);
        if (overlay && !overlay.classList.contains("hidden")) {
            return overlay;
        }
    }
    const open = getOpenOverlays();
    return open.length ? open[open.length - 1] : null;
}

function setupOverlayInteractions() {
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const overlay = getTopOverlay();
        if (!overlay) return;
        closeOverlayById(overlay.id);
    });

    document.querySelectorAll(".modal-overlay").forEach(overlay => {
        overlay.addEventListener("click", (event) => {
            if (event.target !== overlay) return;
            if (overlay.dataset.backdropClose !== "true") return;
            closeOverlayById(overlay.id);
        });
    });
}

customerOrdersLog("[customer-orders] button element", { found: Boolean(els.customerOrdersBtn) });
customerOrdersLog("[customer-orders] modal element", { found: Boolean(els.customerOrdersModal) });

document.addEventListener("click", (e) => {
    const backofficeBtn = e.target.closest("#backoffice-btn");
    if (backofficeBtn) {
        e.preventDefault();
        openBackOffice();
        return;
    }
    const customerBtn = e.target.closest("#customer-orders-btn");
    if (customerBtn) {
        customerOrdersLog("[customer-orders] button click", { target: e.target?.tagName });
        e.preventDefault();
        openCustomerOrdersModal();
        return;
    }
    const deliveryRunBtn = e.target.closest("#delivery-run-btn");
    if (deliveryRunBtn) {
        e.preventDefault();
        openDeliveryRunModal();
        return;
    }
    const ledgerBtn = e.target.closest("#ledger-btn");
    if (ledgerBtn) {
        e.preventDefault();
        openLedgerModal();
    }
});
customerOrdersLog("[customer-orders] delegated listener attached");

document.addEventListener("click", (e) => {
    const openDraft = e.target.closest("[data-offline-draft-open]");
    if (openDraft) {
        e.preventDefault();
        reopenOfflineDraft(openDraft.dataset.offlineDraftOpen);
        return;
    }
    const syncDraft = e.target.closest("[data-offline-draft-sync]");
    if (syncDraft) {
        e.preventDefault();
        syncSingleDraft(syncDraft.dataset.offlineDraftSync);
        return;
    }
    const deleteDraft = e.target.closest("[data-offline-draft-delete]");
    if (deleteDraft) {
        e.preventDefault();
        deleteOfflineDraft(deleteDraft.dataset.offlineDraftDelete);
    }
    const saleCard = e.target.closest("[data-mobile-sale-id]");
    if (saleCard) {
        e.preventDefault();
        openMobileSaleDetail(saleCard.dataset.mobileSaleId);
    }
    const customerCard = e.target.closest("[data-mobile-customer-id]");
    if (customerCard) {
        e.preventDefault();
        openMobileCustomerDetail(customerCard.dataset.mobileCustomerId);
    }
});

function registerStaffServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // silent failure; POS still works without SW
    });
    navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
            try {
                registration.update();
            } catch (_err) {
                // ignore update failures; the app still works
            }
        });
    }).catch(() => {
        // ignore update check failures
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
    setupOverlayInteractions();
    initOfflineSupport();
    initMobileNav();
    initMobileDashboard();
    bindPurchaseLineActions();

    els.productSearch.addEventListener("input", () => {
        searchResultIndex = -1;
        updateSearchResults();
        persistMobileScreenState("products");
    });
    els.productSearch.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
            if (!searchResultsOpen) {
                updateSearchResults({ forceOpen: true });
            }
            if (!searchResults.length) return;
            event.preventDefault();
            searchResultIndex = Math.min(searchResults.length - 1, searchResultIndex + 1);
            updateSearchResults({ keepOpen: true });
            return;
        }
        if (event.key === "ArrowUp") {
            if (!searchResultsOpen) return;
            event.preventDefault();
            searchResultIndex = Math.max(0, searchResultIndex - 1);
            updateSearchResults({ keepOpen: true });
            return;
        }
        if (event.key === "Escape") {
            hideSearchResults();
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        const query = (els.productSearch.value || "").trim();
        if (!query) return;
        const exact = findExactSkuMatch(query);
        if (exact) {
            addToCart(exact.id);
            clearSearchInput();
            hideSearchResults();
            return;
        }
        if (searchResults.length) {
            const selected = searchResultIndex >= 0 ? searchResults[searchResultIndex] : searchResults[0];
            if (selected) {
                addToCart(selected.id);
                clearSearchInput();
                hideSearchResults();
            }
            return;
        }
        updateSearchResults({ forceOpen: true });
    });
    document.addEventListener("click", (event) => {
        if (!els.productSearchResults || !els.productSearch) return;
        const wrapper = els.productSearchResults.closest(".search-wrapper");
        if (wrapper && !wrapper.contains(event.target)) {
            hideSearchResults();
        }
    });
    if (els.aiPromptSubmit) {
        els.aiPromptSubmit.addEventListener("click", submitAiPrompt);
    }
    if (els.aiPromptInput) {
        els.aiPromptInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submitAiPrompt();
        });
    }
    if (els.aiSummaryFinanceAction) {
        els.aiSummaryFinanceAction.addEventListener("click", (event) => {
            event.preventDefault();
            focusLedgerDetails();
        });
    }
    if (els.aiSummaryOpsAction) {
        els.aiSummaryOpsAction.addEventListener("click", (event) => {
            event.preventDefault();
            focusOperationsDetails();
        });
    }
    if (els.aiSummaryAlertsAction) {
        els.aiSummaryAlertsAction.addEventListener("click", (event) => {
            event.preventDefault();
            focusAlertsDetails();
        });
    }
    if (els.offlineDraftsBtn) {
        els.offlineDraftsBtn.addEventListener("click", (event) => {
            event.preventDefault();
            openOfflineDraftsModal();
        });
    }
    if (els.offlineDraftsClose) {
        els.offlineDraftsClose.addEventListener("click", () => closeOfflineDraftsModal());
    }
    if (els.offlineDraftsSync) {
        els.offlineDraftsSync.addEventListener("click", () => syncOfflineDrafts({ manual: true }));
    }
    focusSearchInput();
    if (els.backofficeCloseBtn) {
        els.backofficeCloseBtn.addEventListener("click", closeBackOffice);
    }
    if (els.backofficeTabs) {
        els.backofficeTabs.forEach(btn => {
            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                if (btn.dataset.section === "ledger") {
                    openLedgerModal();
                    return;
                }
                setBackOfficeSection(btn.dataset.section);
            });
        });
    }
    if (els.backofficeSetupTabs) {
        els.backofficeSetupTabs.forEach(btn => {
            btn.addEventListener("click", () => {
                setBackOfficeSetupSection(btn.dataset.setup);
            });
        });
    }
    if (els.inventoryAdjustSearch) {
        els.inventoryAdjustSearch.addEventListener("input", () => {
            loadInventoryAdjustProducts(els.inventoryAdjustSearch.value || "");
        });
    }
    if (els.inventoryAdjustMode) {
        els.inventoryAdjustMode.forEach(input => {
            input.addEventListener("change", () => {
                updateInventoryAdjustMode();
            });
        });
    }
    if (els.inventoryCountedQty) {
        els.inventoryCountedQty.addEventListener("input", () => {
            updateInventoryCountedPreview();
        });
    }
    if (els.inventoryScanBtn) {
        els.inventoryScanBtn.addEventListener("click", () => {
            openInventoryScanModal();
        });
    }
    if (els.inventoryScanClose) {
        els.inventoryScanClose.addEventListener("click", closeInventoryScanModal);
    }
    if (els.posScanBtn) {
        els.posScanBtn.addEventListener("click", () => {
            if (!canPerformSales()) {
                toast("Sales are not available for your role.", "error");
                return;
            }
            openPosScanModal();
        });
    }
    if (els.posScanClose) {
        els.posScanClose.addEventListener("click", closePosScanModal);
    }
    if (els.mobileCustomerAdd) {
        els.mobileCustomerAdd.addEventListener("click", openMobileCustomerModal);
    }
    if (els.mobileCustomerCancel) {
        els.mobileCustomerCancel.addEventListener("click", closeMobileCustomerModal);
    }
    if (els.mobileCustomerSubmit) {
        els.mobileCustomerSubmit.addEventListener("click", submitMobileCustomer);
    }
    if (els.mobileCustomerSelect) {
        els.mobileCustomerSelect.addEventListener("change", () => {
            if (els.customerSelect) {
                els.customerSelect.value = els.mobileCustomerSelect.value;
            }
            scheduleReprice();
            updateMobileCustomerLabel();
        });
    }
    if (els.mobileSuccessClose) {
        els.mobileSuccessClose.addEventListener("click", closeMobileSuccessModal);
    }
    if (els.mobileSuccessReceipt) {
        els.mobileSuccessReceipt.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.info("[receipt] view receipt clicked", {
                lastMobileSaleId,
                hasLastCompletedSale: Boolean(lastCompletedSale),
            });
            if (!lastMobileSaleId) return;
            closeMobileSuccessModal();
            showReceipt(lastCompletedSale || lastMobileSaleId, { autoPrint: false }).catch((err) => {
                console.warn("[receipt] historical view receipt failed", err);
                toast(`Receipt preview failed: ${err.message}`, "warning");
            });
        });
    }
    if (els.mobileSuccessPrint) {
        els.mobileSuccessPrint.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const mode = getPrintMode();
            const receipt = currentReceiptPayload || (lastCompletedSale ? buildReceiptPayload(lastCompletedSale) : null);
            console.info("[receipt] success modal Bluetooth print clicked", {
                mode,
                hasReceiptPayload: Boolean(receipt),
            });
            if (!receipt) return;
            if (mode === "android") {
                printReceiptAndroid(receipt);
                return;
            }
            toast("Bluetooth printing is only available in Android mode.", "info");
        });
    }
    if (els.mobileSuccessNewSale) {
        els.mobileSuccessNewSale.addEventListener("click", mobileNewSale);
    }
    if (els.mobileSuccessProducts) {
        els.mobileSuccessProducts.addEventListener("click", () => {
            closeMobileSuccessModal();
            setMobileTab("products");
        });
    }
    if (els.mobileSaleDetailReceipt) {
        els.mobileSaleDetailReceipt.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.info("[receipt] view receipt clicked", {
                currentMobileSaleDetailId,
                source: "sale-detail",
            });
            if (!currentMobileSaleDetailId) return;
            showReceipt(currentMobileSaleDetailId, { autoPrint: false }).catch((err) => {
                console.warn("[receipt] historical sale detail view receipt failed", err);
                toast(`Receipt preview failed: ${err.message}`, "warning");
            });
        });
    }
    if (els.mobileSaleDetailPrint) {
        els.mobileSaleDetailPrint.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void printHistoricalReceipt(currentMobileSaleDetailId, { source: "sale-detail" });
        });
    }
    if (els.mobileSaleDetailPrint) {
        els.mobileSaleDetailPrint.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const mode = getPrintMode();
            const payload = currentReceiptPayload || (lastCompletedSale ? buildReceiptPayload(lastCompletedSale) : null);
            console.info("[receipt] historical receipt print clicked", {
                mode,
                saleId: currentMobileSaleDetailId,
                hasPayload: Boolean(payload),
            });
            if (!payload) {
                toast("Receipt data is unavailable.", "warning");
                return;
            }
            if (mode === "pc") {
                void printReceiptPc(payload).catch((err) => {
                    console.warn("[receipt] historical PC print failed", err);
                    toast(`PC print failed: ${err.message}`, "warning");
                });
                return;
            }
            if (mode === "android") {
                printReceiptAndroid(payload);
                return;
            }
            toast("Printing disabled", "info");
        });
    }
    if (els.inventoryAdjustBranch) {
        els.inventoryAdjustBranch.addEventListener("change", () => {
            updateInventoryAdjustStock();
            loadInventoryAdjustments();
        });
    }
    if (els.inventoryAdjustProduct) {
        els.inventoryAdjustProduct.addEventListener("change", () => {
            updateInventoryAdjustStock();
            loadInventoryAdjustments();
        });
    }
    if (els.inventoryAdjustSubmit) {
        els.inventoryAdjustSubmit.addEventListener("click", (event) => {
            event.preventDefault();
            submitInventoryAdjustment();
        });
    }
    if (els.inventoryAdjustPrev) {
        els.inventoryAdjustPrev.addEventListener("click", () => {
            if (inventoryAdjustOffset <= 0) return;
            inventoryAdjustOffset = Math.max(0, inventoryAdjustOffset - inventoryAdjustLimit);
            loadInventoryAdjustments();
        });
    }
    if (els.inventoryAdjustNext) {
        els.inventoryAdjustNext.addEventListener("click", () => {
            if (inventoryAdjustOffset + inventoryAdjustLimit >= (inventoryAdjustPage?.count || 0)) return;
            inventoryAdjustOffset += inventoryAdjustLimit;
            loadInventoryAdjustments();
        });
    }
    if (els.backofficeCustomerSearch) {
        els.backofficeCustomerSearch.addEventListener("input", () => {
            backOfficeCustomerQuery = els.backofficeCustomerSearch.value || "";
            backOfficeCustomerOffset = 0;
            loadBackOfficeCustomers();
        });
    }
    if (els.backofficeSupplierSearch) {
        els.backofficeSupplierSearch.addEventListener("input", () => {
            backOfficeSupplierQuery = els.backofficeSupplierSearch.value || "";
            backOfficeSupplierOffset = 0;
            loadBackOfficeSuppliers();
        });
    }
    if (els.backofficeSupplierPrev) {
        els.backofficeSupplierPrev.addEventListener("click", () => {
            if (backOfficeSupplierOffset <= 0) return;
            backOfficeSupplierOffset = Math.max(0, backOfficeSupplierOffset - backOfficeSupplierLimit);
            loadBackOfficeSuppliers();
        });
    }
    if (els.backofficeSupplierNext) {
        els.backofficeSupplierNext.addEventListener("click", () => {
            if (backOfficeSupplierOffset + backOfficeSupplierLimit >= (backOfficeSupplierPage?.count || 0)) return;
            backOfficeSupplierOffset += backOfficeSupplierLimit;
            loadBackOfficeSuppliers();
        });
    }
    if (els.backofficePurchaseAdd) {
        els.backofficePurchaseAdd.addEventListener("click", () => openPurchaseForm());
    }
    if (els.backofficePurchasesTabs) {
        els.backofficePurchasesTabs.forEach(btn => {
            btn.addEventListener("click", () => {
                setBackOfficePurchasesTab(btn.dataset.purchasesTab || "orders");
            });
        });
    }
    if (els.backofficePurchasesSearch) {
        els.backofficePurchasesSearch.addEventListener("input", () => {
            backOfficePurchasesQuery = els.backofficePurchasesSearch.value || "";
            backOfficePurchasesOffset = 0;
            loadBackOfficePurchases();
        });
    }
    if (els.backofficePurchasesStatus) {
        els.backofficePurchasesStatus.addEventListener("change", () => {
            backOfficePurchasesOffset = 0;
            loadBackOfficePurchases();
        });
    }
    if (els.backofficePurchasesSupplier) {
        els.backofficePurchasesSupplier.addEventListener("change", () => {
            backOfficePurchasesOffset = 0;
            loadBackOfficePurchases();
        });
    }
    if (els.backofficePurchasesBranch) {
        els.backofficePurchasesBranch.addEventListener("change", () => {
            backOfficePurchasesOffset = 0;
            loadBackOfficePurchases();
        });
    }
    if (els.backofficePurchasesPrev) {
        els.backofficePurchasesPrev.addEventListener("click", () => {
            if (backOfficePurchasesOffset <= 0) return;
            backOfficePurchasesOffset = Math.max(0, backOfficePurchasesOffset - backOfficePurchasesLimit);
            loadBackOfficePurchases();
        });
    }
    if (els.backofficePurchasesNext) {
        els.backofficePurchasesNext.addEventListener("click", () => {
            if (backOfficePurchasesOffset + backOfficePurchasesLimit >= (backOfficePurchasesPage?.count || 0)) return;
            backOfficePurchasesOffset += backOfficePurchasesLimit;
            loadBackOfficePurchases();
        });
    }
    if (els.backofficeBillsSearch) {
        els.backofficeBillsSearch.addEventListener("input", () => {
            backOfficeBillsQuery = els.backofficeBillsSearch.value || "";
            backOfficeBillsOffset = 0;
            loadBackOfficeBills();
        });
    }
    if (els.backofficeBillsStatus) {
        els.backofficeBillsStatus.addEventListener("change", () => {
            backOfficeBillsOffset = 0;
            loadBackOfficeBills();
        });
    }
    if (els.backofficeBillsSupplier) {
        els.backofficeBillsSupplier.addEventListener("change", () => {
            backOfficeBillsOffset = 0;
            loadBackOfficeBills();
        });
    }
    if (els.backofficeBillsBranch) {
        els.backofficeBillsBranch.addEventListener("change", () => {
            backOfficeBillsOffset = 0;
            loadBackOfficeBills();
        });
    }
    if (els.backofficeBillsPrev) {
        els.backofficeBillsPrev.addEventListener("click", () => {
            if (backOfficeBillsOffset <= 0) return;
            backOfficeBillsOffset = Math.max(0, backOfficeBillsOffset - backOfficeBillsLimit);
            loadBackOfficeBills();
        });
    }
    if (els.backofficeBillsNext) {
        els.backofficeBillsNext.addEventListener("click", () => {
            if (backOfficeBillsOffset + backOfficeBillsLimit >= (backOfficeBillsPage?.count || 0)) return;
            backOfficeBillsOffset += backOfficeBillsLimit;
            loadBackOfficeBills();
        });
    }
    if (els.backofficeCustomerBranch) {
        els.backofficeCustomerBranch.addEventListener("change", () => {
            backOfficeCustomerOffset = 0;
            loadBackOfficeRoutes();
            loadBackOfficeCustomers();
        });
    }
    if (els.backofficeCustomerRoute) {
        els.backofficeCustomerRoute.addEventListener("change", () => {
            backOfficeCustomerOffset = 0;
            loadBackOfficeCustomers();
        });
    }
    if (els.backofficeCustomerPrev) {
        els.backofficeCustomerPrev.addEventListener("click", () => {
            if (backOfficeCustomerOffset <= 0) return;
            backOfficeCustomerOffset = Math.max(0, backOfficeCustomerOffset - backOfficeCustomerLimit);
            loadBackOfficeCustomers();
        });
    }
    if (els.backofficeCustomerNext) {
        els.backofficeCustomerNext.addEventListener("click", () => {
            if (backOfficeCustomerOffset + backOfficeCustomerLimit >= (backOfficeCustomerPage?.count || 0)) return;
            backOfficeCustomerOffset += backOfficeCustomerLimit;
            loadBackOfficeCustomers();
        });
    }
    if (els.setupBranchSearch) {
        els.setupBranchSearch.addEventListener("input", () => {
            backOfficeSetupBranchQuery = els.setupBranchSearch.value || "";
            loadBackOfficeBranchesSetup();
        });
    }
    if (els.setupRouteSearch) {
        els.setupRouteSearch.addEventListener("input", () => {
            backOfficeSetupRouteQuery = els.setupRouteSearch.value || "";
            loadBackOfficeRoutesSetup();
        });
    }
    if (els.setupCategorySearch) {
        els.setupCategorySearch.addEventListener("input", () => {
            backOfficeSetupCategoryQuery = els.setupCategorySearch.value || "";
            loadBackOfficeCategoriesSetup();
        });
    }
    if (els.setupBranchAdd) {
        els.setupBranchAdd.addEventListener("click", () => openBranchForm());
    }
    if (els.setupRouteAdd) {
        els.setupRouteAdd.addEventListener("click", () => openRouteForm());
    }
    if (els.setupCategoryAdd) {
        els.setupCategoryAdd.addEventListener("click", () => openCategoryForm());
    }
    if (els.branchFormClose) {
        els.branchFormClose.addEventListener("click", closeBranchForm);
    }
    if (els.branchFormCancel) {
        els.branchFormCancel.addEventListener("click", closeBranchForm);
    }
    if (els.branchForm) {
        els.branchForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveBranchForm();
        });
    }
    if (els.routeFormClose) {
        els.routeFormClose.addEventListener("click", closeRouteForm);
    }
    if (els.routeFormCancel) {
        els.routeFormCancel.addEventListener("click", closeRouteForm);
    }
    if (els.routeForm) {
        els.routeForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveRouteForm();
        });
    }
    if (els.categoryFormClose) {
        els.categoryFormClose.addEventListener("click", closeCategoryForm);
    }
    if (els.categoryFormCancel) {
        els.categoryFormCancel.addEventListener("click", closeCategoryForm);
    }
    if (els.categoryForm) {
        els.categoryForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveCategoryForm();
        });
    }
    if (els.backofficeStaffSearch) {
        els.backofficeStaffSearch.addEventListener("input", () => {
            backOfficeStaffQuery = els.backofficeStaffSearch.value || "";
            backOfficeStaffOffset = 0;
            loadBackOfficeStaff();
        });
    }
    if (els.backofficeSalesSearch) {
        els.backofficeSalesSearch.addEventListener("input", () => {
            backOfficeSalesQuery = els.backofficeSalesSearch.value || "";
            backOfficeSalesOffset = 0;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesBranch) {
        els.backofficeSalesBranch.addEventListener("change", () => {
            backOfficeSalesOffset = 0;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesStatus) {
        els.backofficeSalesStatus.addEventListener("change", () => {
            backOfficeSalesOffset = 0;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesFrom) {
        els.backofficeSalesFrom.addEventListener("change", () => {
            backOfficeSalesOffset = 0;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesTo) {
        els.backofficeSalesTo.addEventListener("change", () => {
            backOfficeSalesOffset = 0;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesPrev) {
        els.backofficeSalesPrev.addEventListener("click", () => {
            if (backOfficeSalesOffset <= 0) return;
            backOfficeSalesOffset = Math.max(0, backOfficeSalesOffset - backOfficeSalesLimit);
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesNext) {
        els.backofficeSalesNext.addEventListener("click", () => {
            if (backOfficeSalesOffset + backOfficeSalesLimit >= (backOfficeSalesPage?.count || 0)) return;
            backOfficeSalesOffset += backOfficeSalesLimit;
            loadBackOfficeSales();
        });
    }
    if (els.backofficeSalesExport) {
        els.backofficeSalesExport.addEventListener("click", () => {
            exportBackOfficeSales();
        });
    }
    if (els.backofficeOrdersSearch) {
        els.backofficeOrdersSearch.addEventListener("input", () => {
            backOfficeOrdersQuery = els.backofficeOrdersSearch.value || "";
            backOfficeOrdersOffset = 0;
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeOrdersBranch) {
        els.backofficeOrdersBranch.addEventListener("change", () => {
            backOfficeOrdersOffset = 0;
            loadBackOfficeRoutes();
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeOrdersRoute) {
        els.backofficeOrdersRoute.addEventListener("change", () => {
            backOfficeOrdersOffset = 0;
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeOrdersStatus) {
        els.backofficeOrdersStatus.addEventListener("change", () => {
            backOfficeOrdersOffset = 0;
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeDeliverySearch) {
        els.backofficeDeliverySearch.addEventListener("input", () => {
            backOfficeDeliveryQuery = els.backofficeDeliverySearch.value || "";
            backOfficeDeliveryOffset = 0;
            backOfficeDeliveryQueueOffset = 0;
            loadBackOfficeDeliveryPanel();
        });
    }
    if (els.backofficeDeliveryModeQueue) {
        els.backofficeDeliveryModeQueue.addEventListener("click", () => {
            if (!canViewDeliveryTracking()) return;
            setBackOfficeDeliveryMode("queue");
        });
    }
    if (els.backofficeDeliveryModeRuns) {
        els.backofficeDeliveryModeRuns.addEventListener("click", () => {
            if (!canViewDeliveryTracking()) return;
            setBackOfficeDeliveryMode("runs");
        });
    }
    if (els.backofficeDeliveryScopeActive) {
        els.backofficeDeliveryScopeActive.addEventListener("click", () => {
            if (!canViewDeliveryTracking()) return;
            setBackOfficeDeliveryScope("active");
        });
    }
    if (els.backofficeDeliveryScopeAll) {
        els.backofficeDeliveryScopeAll.addEventListener("click", () => {
            if (!canViewDeliveryTracking()) return;
            setBackOfficeDeliveryScope("all");
        });
    }
    if (els.backofficeDeliveryStatus) {
        els.backofficeDeliveryStatus.addEventListener("change", () => {
            backOfficeDeliveryOffset = 0;
            loadBackOfficeDeliveryRuns();
        });
    }
    if (els.backofficeDeliveryPerson) {
        els.backofficeDeliveryPerson.addEventListener("change", () => {
            backOfficeDeliveryOffset = 0;
            loadBackOfficeDeliveryRuns();
        });
    }
    if (els.backofficeDeliveryBranch) {
        els.backofficeDeliveryBranch.addEventListener("change", () => {
            backOfficeDeliveryOffset = 0;
            loadBackOfficeDeliveryRuns();
        });
    }
    if (els.backofficeDeliveryQueueBranch) {
        els.backofficeDeliveryQueueBranch.addEventListener("change", () => {
            backOfficeDeliveryQueueOffset = 0;
            loadBackOfficeDeliveryQueue();
        });
    }
    if (els.backofficeDeliveryPrev) {
        els.backofficeDeliveryPrev.addEventListener("click", () => {
            if (backOfficeDeliveryOffset <= 0) return;
            backOfficeDeliveryOffset = Math.max(0, backOfficeDeliveryOffset - backOfficeDeliveryLimit);
            loadBackOfficeDeliveryRuns();
        });
    }
    if (els.backofficeDeliveryNext) {
        els.backofficeDeliveryNext.addEventListener("click", () => {
            if (backOfficeDeliveryOffset + backOfficeDeliveryLimit >= (backOfficeDeliveryPage?.count || 0)) return;
            backOfficeDeliveryOffset += backOfficeDeliveryLimit;
            loadBackOfficeDeliveryRuns();
        });
    }
    if (els.backofficeDeliveryQueuePrev) {
        els.backofficeDeliveryQueuePrev.addEventListener("click", () => {
            if (backOfficeDeliveryQueueOffset <= 0) return;
            backOfficeDeliveryQueueOffset = Math.max(0, backOfficeDeliveryQueueOffset - backOfficeDeliveryLimit);
            loadBackOfficeDeliveryQueue();
        });
    }
    if (els.backofficeDeliveryQueueNext) {
        els.backofficeDeliveryQueueNext.addEventListener("click", () => {
            if (backOfficeDeliveryQueueOffset + backOfficeDeliveryLimit >= (backOfficeDeliveryQueuePage?.count || 0)) return;
            backOfficeDeliveryQueueOffset += backOfficeDeliveryLimit;
            loadBackOfficeDeliveryQueue();
        });
    }
    if (els.backofficePaymentsSearch) {
        els.backofficePaymentsSearch.addEventListener("input", () => {
            backOfficePaymentsQuery = els.backofficePaymentsSearch.value || "";
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsModeAll) {
        els.backofficePaymentsModeAll.addEventListener("click", () => {
            clearBackOfficePaymentsSelection();
            setBackOfficePaymentsMode("all");
        });
    }
    if (els.backofficePaymentsModeDelivery) {
        els.backofficePaymentsModeDelivery.addEventListener("click", () => {
            clearBackOfficePaymentsSelection();
            setBackOfficePaymentsMode("delivery");
        });
    }
    if (els.backofficePaymentsBranch) {
        els.backofficePaymentsBranch.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsDeliveryPerson) {
        els.backofficePaymentsDeliveryPerson.addEventListener("change", () => {
            backOfficePaymentsDeliveryPerson = els.backofficePaymentsDeliveryPerson.value || "";
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsMethod) {
        els.backofficePaymentsMethod.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsStatus) {
        els.backofficePaymentsStatus.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsCollectionStage) {
        els.backofficePaymentsCollectionStage.addEventListener("change", () => {
            if (backOfficePaymentsMode === "delivery") return;
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsRemittance) {
        els.backofficePaymentsRemittance.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsFrom) {
        els.backofficePaymentsFrom.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsTo) {
        els.backofficePaymentsTo.addEventListener("change", () => {
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsBulkSubmit) {
        els.backofficePaymentsBulkSubmit.addEventListener("click", submitBackOfficeDeliveryRemittanceBulk);
    }
    if (els.backofficePaymentsBulkClear) {
        els.backofficePaymentsBulkClear.addEventListener("click", clearBackOfficePaymentsSelection);
    }
    if (els.backofficePaymentsBulkNote) {
        els.backofficePaymentsBulkNote.addEventListener("input", () => {
            backOfficePaymentsBulkNote = els.backofficePaymentsBulkNote.value || "";
        });
    }
    if (els.backofficePaymentsSelectAll) {
        els.backofficePaymentsSelectAll.addEventListener("change", () => {
            if (backOfficePaymentsMode !== "delivery") return;
            const visibleSelectable = getVisibleSelectableBackOfficePaymentIds();
            if (els.backofficePaymentsSelectAll.checked) {
                setBackOfficePaymentsSelection(Array.from(new Set([...backOfficePaymentsBulkSelection, ...visibleSelectable])));
            } else {
                const next = new Set(backOfficePaymentsBulkSelection);
                visibleSelectable.forEach(id => next.delete(id));
                setBackOfficePaymentsSelection(Array.from(next));
            }
        });
    }
    if (els.backofficeOrdersPrev) {
        els.backofficeOrdersPrev.addEventListener("click", () => {
            if (backOfficeOrdersOffset <= 0) return;
            backOfficeOrdersOffset = Math.max(0, backOfficeOrdersOffset - backOfficeOrdersLimit);
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeOrdersNext) {
        els.backofficeOrdersNext.addEventListener("click", () => {
            if (backOfficeOrdersOffset + backOfficeOrdersLimit >= (backOfficeOrdersPage?.count || 0)) return;
            backOfficeOrdersOffset += backOfficeOrdersLimit;
            loadBackOfficeOrders();
        });
    }
    if (els.backofficeOrdersExport) {
        els.backofficeOrdersExport.addEventListener("click", () => {
            exportBackOfficeOrders();
        });
    }
    if (els.backofficeReportsRange) {
        els.backofficeReportsRange.addEventListener("change", () => {
            backOfficeReportsRange = els.backofficeReportsRange.value || "7";
            loadBackOfficeReports();
        });
    }
    if (els.backofficeReportsRefresh) {
        els.backofficeReportsRefresh.addEventListener("click", () => {
            loadBackOfficeReports();
        });
    }
    if (els.backofficePaymentsPrev) {
        els.backofficePaymentsPrev.addEventListener("click", () => {
            if (backOfficePaymentsOffset <= 0) return;
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset = Math.max(0, backOfficePaymentsOffset - backOfficePaymentsLimit);
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsNext) {
        els.backofficePaymentsNext.addEventListener("click", () => {
            if (backOfficePaymentsOffset + backOfficePaymentsLimit >= (backOfficePaymentsPage?.count || 0)) return;
            clearBackOfficePaymentsSelection();
            backOfficePaymentsOffset += backOfficePaymentsLimit;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsExport) {
        els.backofficePaymentsExport.addEventListener("click", () => {
            exportBackOfficePayments();
        });
    }
    if (els.backofficeSaleDetailClose) {
        els.backofficeSaleDetailClose.addEventListener("click", closeBackOfficeSaleDetail);
    }
    if (els.backofficeOrderDetailClose) {
        els.backofficeOrderDetailClose.addEventListener("click", closeBackOfficeOrderDetail);
    }
    if (els.backofficePaymentDetailClose) {
        els.backofficePaymentDetailClose.addEventListener("click", closeBackOfficePaymentDetail);
    }
    if (els.backofficeStaffPrev) {
        els.backofficeStaffPrev.addEventListener("click", () => {
            if (backOfficeStaffOffset <= 0) return;
            backOfficeStaffOffset = Math.max(0, backOfficeStaffOffset - backOfficeStaffLimit);
            loadBackOfficeStaff();
        });
    }
    if (els.backofficeStaffNext) {
        els.backofficeStaffNext.addEventListener("click", () => {
            if (backOfficeStaffOffset + backOfficeStaffLimit >= (backOfficeStaffPage?.count || 0)) return;
            backOfficeStaffOffset += backOfficeStaffLimit;
            loadBackOfficeStaff();
        });
    }
    if (els.backofficeStaffAdd) {
        els.backofficeStaffAdd.addEventListener("click", () => openStaffForm());
    }
    if (els.staffFormClose) {
        els.staffFormClose.addEventListener("click", closeStaffForm);
    }
    if (els.staffFormCancel) {
        els.staffFormCancel.addEventListener("click", closeStaffForm);
    }
    if (els.staffForm) {
        els.staffForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveStaffForm();
        });
    }
    if (els.backofficeCustomerAdd) {
        els.backofficeCustomerAdd.addEventListener("click", () => openCustomerForm());
    }
    if (els.customerFormClose) {
        els.customerFormClose.addEventListener("click", closeCustomerForm);
    }
    if (els.customerFormCancel) {
        els.customerFormCancel.addEventListener("click", closeCustomerForm);
    }
    if (els.customerForm) {
        els.customerForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveCustomerForm();
        });
    }
    if (els.backofficeSupplierAdd) {
        els.backofficeSupplierAdd.addEventListener("click", () => openSupplierForm());
    }
    if (els.supplierFormClose) {
        els.supplierFormClose.addEventListener("click", closeSupplierForm);
    }
    if (els.supplierFormCancel) {
        els.supplierFormCancel.addEventListener("click", closeSupplierForm);
    }
    if (els.supplierForm) {
        els.supplierForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveSupplierForm();
        });
    }
    if (els.purchaseFormClose) {
        els.purchaseFormClose.addEventListener("click", closePurchaseForm);
    }
    if (els.purchaseFormCancel) {
        els.purchaseFormCancel.addEventListener("click", closePurchaseForm);
    }
    if (els.purchaseCancelPo) {
        els.purchaseCancelPo.addEventListener("click", () => {
            cancelPurchaseOrder(editingPurchaseId);
        });
    }
    if (els.purchaseForm) {
        els.purchaseForm.addEventListener("submit", (event) => {
            event.preventDefault();
            savePurchaseForm();
        });
    }
    if (els.purchaseSupplier) {
        els.purchaseSupplier.addEventListener("change", () => {
            loadPurchaseSupplierPricing(els.purchaseSupplier.value || "");
        });
    }
    if (els.purchaseLineProduct) {
        els.purchaseLineProduct.addEventListener("change", () => {
            prefillPurchaseLineCost();
        });
    }
    if (els.purchaseLineAdd) {
        els.purchaseLineAdd.addEventListener("click", () => {
            addPurchaseLine();
        });
    }
    if (els.purchaseMarkOrdered) {
        els.purchaseMarkOrdered.addEventListener("click", () => {
            markPurchaseOrdered();
        });
    }
    if (els.purchaseReceiveOpen) {
        els.purchaseReceiveOpen.addEventListener("click", () => {
            if (editingPurchaseId) openPurchaseReceiveModal(editingPurchaseId);
        });
    }
    if (els.purchaseReceiveClose) {
        els.purchaseReceiveClose.addEventListener("click", closePurchaseReceiveModal);
    }
    if (els.purchaseReceiveCancel) {
        els.purchaseReceiveCancel.addEventListener("click", closePurchaseReceiveModal);
    }
    if (els.purchaseReceiveSubmit) {
        els.purchaseReceiveSubmit.addEventListener("click", () => {
            submitPurchaseReceive();
        });
    }
    if (els.purchaseCreateBill) {
        els.purchaseCreateBill.addEventListener("click", () => {
            if (editingPurchaseId) createBillForPurchase(editingPurchaseId);
        });
    }
    if (els.purchaseViewBill) {
        els.purchaseViewBill.addEventListener("click", () => {
            if (currentPurchaseDetail?.bill_id) openBillDetail(currentPurchaseDetail.bill_id);
        });
    }
    if (els.billDetailClose) {
        els.billDetailClose.addEventListener("click", closeBillDetail);
    }
    if (els.billDetailCloseBtn) {
        els.billDetailCloseBtn.addEventListener("click", closeBillDetail);
    }
    if (els.billDetailCancel) {
        els.billDetailCancel.addEventListener("click", () => {
            if (editingBillId) cancelSupplierBill(editingBillId);
        });
    }
    if (els.backofficeDeliveryDetailClose) {
        els.backofficeDeliveryDetailClose.addEventListener("click", closeBackOfficeDeliveryDetail);
    }
    if (els.deliveryRunClose) {
        els.deliveryRunClose.addEventListener("click", closeDeliveryRunModal);
    }
    if (els.deliveryRunStart) {
        els.deliveryRunStart.addEventListener("click", () => {
            if (currentDeliveryRun?.id) startDeliveryRun(currentDeliveryRun.id);
        });
    }
    if (els.deliveryRunLocation) {
        els.deliveryRunLocation.addEventListener("click", () => {
            if (currentDeliveryRun?.id) sendDeliveryRunLocation(currentDeliveryRun.id);
        });
    }
    if (els.deliveryRunStatusSubmit) {
        els.deliveryRunStatusSubmit.addEventListener("click", () => {
            if (currentDeliveryRun?.id) updateDeliveryRunStatus(currentDeliveryRun.id);
        });
    }
    if (els.deliveryRunComplete) {
        els.deliveryRunComplete.addEventListener("click", () => {
            if (currentDeliveryRun?.id) openDeliveryProofForm();
        });
    }
    if (els.deliveryRunFail) {
        els.deliveryRunFail.addEventListener("click", () => {
            if (currentDeliveryRun?.id) failDeliveryRun(currentDeliveryRun.id);
        });
    }
    if (els.deliveryPodSubmit) {
        els.deliveryPodSubmit.addEventListener("click", () => {
            if (currentDeliveryRun?.id) submitDeliveryProof(currentDeliveryRun.id);
        });
    }
    if (els.deliveryPodCancel) {
        els.deliveryPodCancel.addEventListener("click", () => {
            closeDeliveryProofForm();
        });
    }
    [els.deliveryPaymentCash, els.deliveryPaymentMpesa, els.deliveryPaymentReference, els.deliveryPaymentPhone, els.deliveryPaymentNotes].forEach(input => {
        if (input) {
            input.addEventListener("input", updateDeliveryPaymentSummary);
            input.addEventListener("change", updateDeliveryPaymentSummary);
        }
    });
    if (els.deliveryRunLocationRefresh) {
        els.deliveryRunLocationRefresh.addEventListener("click", () => {
            if (currentDeliveryRun?.id) {
                loadDeliveryRunLocationHistory(currentDeliveryRun);
            }
        });
    }
    if (els.backofficeProductSearch) {
        els.backofficeProductSearch.addEventListener("input", () => {
            backOfficeQuery = els.backofficeProductSearch.value || "";
            renderBackOfficeProducts();
        });
    }
    if (els.backofficeProductAdd) {
        els.backofficeProductAdd.addEventListener("click", () => openProductForm());
    }
    if (els.backofficeProductTemplate) {
        els.backofficeProductTemplate.addEventListener("click", (event) => {
            event.preventDefault();
            downloadProductTemplate();
        });
    }
    if (els.backofficeProductExport) {
        els.backofficeProductExport.addEventListener("click", (event) => {
            event.preventDefault();
            exportBackOfficeProductsExcel();
        });
    }
    if (els.backofficeProductImport) {
        els.backofficeProductImport.addEventListener("click", () => {
            if (els.backofficeProductFile) els.backofficeProductFile.click();
        });
    }
    if (els.backofficeProductFile) {
        els.backofficeProductFile.addEventListener("change", () => {
            const file = els.backofficeProductFile.files?.[0];
            if (file) uploadProductImport(file, { target: "backoffice" });
        });
    }
    if (els.productFormClose) {
        els.productFormClose.addEventListener("click", closeProductForm);
    }
    if (els.productFormCancel) {
        els.productFormCancel.addEventListener("click", closeProductForm);
    }
    if (els.productForm) {
        els.productForm.addEventListener("submit", (event) => {
            event.preventDefault();
            saveProductForm();
        });
    }
    if (els.productUnitAdd) {
        els.productUnitAdd.addEventListener("click", () => addProductUnitRow());
    }
    if (els.productUnitsList) {
        els.productUnitsList.addEventListener("click", (event) => {
            const btn = event.target?.closest?.(".unit-remove");
            if (!btn) return;
            const row = btn.closest(".unit-row");
            if (row) row.remove();
        });
    }
    if (els.productSupplierAdd) {
        els.productSupplierAdd.addEventListener("click", () => {
            linkSupplierToProduct();
        });
    }
    if (els.productSuppliersList) {
        els.productSuppliersList.addEventListener("click", (event) => {
            const row = event.target.closest(".supplier-link-row");
            if (!row) return;
            const linkId = row.dataset.linkId;
            const action = event.target?.closest("[data-link-action]")?.dataset?.linkAction;
            if (!action) return;
            if (action === "save") {
                saveProductSupplierLink(linkId, row);
            } else if (action === "remove") {
                removeProductSupplierLink(linkId);
            }
        });
    }
    if (els.productImportTemplate) {
        els.productImportTemplate.addEventListener("click", (event) => {
            event.preventDefault();
            downloadProductTemplate();
        });
    }
    if (els.productImportUpload) {
        els.productImportUpload.addEventListener("click", () => {
            if (els.productImportFile) els.productImportFile.click();
        });
    }
    if (els.productImportFile) {
        els.productImportFile.addEventListener("change", () => {
            const file = els.productImportFile.files?.[0];
            if (file) {
                uploadProductImport(file);
            }
        });
    }
    els.saleTypeSelect.addEventListener("change", () => {
        currentSaleType = els.saleTypeSelect.value || "retail";
        if (isCreditSaleSelected() && currentSaleType !== "wholesale") {
            currentSaleType = "wholesale";
            els.saleTypeSelect.value = "wholesale";
            toast("Credit sales must be wholesale. Sale type switched to wholesale.", "warning");
        }
        scheduleReprice();
    });
    els.customerSelect.addEventListener("change", () => {
        scheduleReprice();
        if (els.mobileCustomerSelect) {
            els.mobileCustomerSelect.value = els.customerSelect.value;
        }
        updateMobileCustomerLabel();
    });
    els.branchSelect.addEventListener("change", () => {
        scheduleReprice();
        loadProducts();
        if (isMobileLayout()) {
            loadMobileDashboardSummary();
            if (activeMobileTab === "sales") {
                loadMobileSales();
            }
            if (activeMobileTab === "stock") {
                loadMobileStock({ query: mobileStockQuery });
            }
            if (activeMobileTab === "customers") {
                loadMobileCustomers({ query: mobileCustomersQuery });
            }
            if (mobileSearchQuery) {
                fetchMobileSearch(mobileSearchQuery);
            } else {
                renderMobileProducts();
            }
            persistMobileScreenState(activeMobileTab);
        }
    });
    els.discountInput.addEventListener("input", () => {
        updateTotals();
        scheduleReprice();
    });
    els.amountPaid.addEventListener("input", () => {
        amountPaidDirty = true;
        updateTotals();
    });
    if (els.paymentMethodSelect) {
        els.paymentMethodSelect.addEventListener("change", () => {
            updateMpesaFields();
        });
        updateMpesaFields();
    }
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
    if (els.printReceiptBtn) {
        els.printReceiptBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.info("[receipt] receipt modal Bluetooth print clicked", {
                mode: getSelectedPrintMode(),
                androidActive: getSelectedPrintMode() === "android",
            });
            if (getSelectedPrintMode() === "android" && currentReceiptPayload) {
                console.info("[receipt] android button click handler firing", true);
                printReceiptAndroid(currentReceiptPayload);
                return;
            }
            void printReceipt({ allowBrowserFallback: true, userTriggered: true });
        });
    }
    if (els.printModeSelect) {
        syncPrintModeControl();
        syncReceiptActionUi();
        els.printModeSelect.addEventListener("change", () => {
            setSelectedPrintMode(els.printModeSelect.value);
            syncPrintModeControl();
            syncReceiptActionUi();
            if (window.debugReceiptDom) window.debugReceiptDom();
        });
    }
    if (els.autoPrintToggle) {
        els.autoPrintToggle.checked = isAutoPrintEnabled();
        els.autoPrintToggle.addEventListener("change", () => {
            setAutoPrintEnabled(els.autoPrintToggle.checked);
        });
    }
    if (els.forceAndroidPrintBtn) {
        els.forceAndroidPrintBtn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedPrintMode("android");
            syncPrintModeControl();
            syncMobileSuccessActionUi();
            syncReceiptActionUi();
            console.info("[receipt] force android print mode", {
                stored: localStorage.getItem(PRINT_MODE_KEY),
                computed: getPrintMode(),
                isMobile: isMobileLayout(),
            });
            if (window.debugReceiptDom) window.debugReceiptDom();
        });
    }
    els.newSaleBtn.addEventListener("click", newSale);
    if (els.receiptCloseBtn) els.receiptCloseBtn.addEventListener("click", closeReceiptModal);
    els.authBtn.addEventListener("click", openAuthModal);
    els.logoutBtn.addEventListener("click", logout);
    if (els.creditBtn) els.creditBtn.addEventListener("click", openCreditModal);
    if (els.returnsBtn) els.returnsBtn.addEventListener("click", openReturnsModal);
    // customer orders button handled by global delegated listener
    if (els.creditCloseBtn) els.creditCloseBtn.addEventListener("click", closeCreditModal);
    if (els.returnsCloseBtn) els.returnsCloseBtn.addEventListener("click", closeReturnsModal);
    if (els.returnsLoadBtn) els.returnsLoadBtn.addEventListener("click", loadReturnableSale);
    if (els.returnsCalcBtn) els.returnsCalcBtn.addEventListener("click", () => submitReturn(true));
    if (els.returnsSubmitBtn) els.returnsSubmitBtn.addEventListener("click", () => submitReturn(false));
    if (els.ledgerCloseBtn) els.ledgerCloseBtn.addEventListener("click", closeLedgerModal);
    if (els.ledgerRefreshBtn) els.ledgerRefreshBtn.addEventListener("click", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.ledgerStart) els.ledgerStart.addEventListener("change", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.ledgerEnd) els.ledgerEnd.addEventListener("change", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.ledgerType) els.ledgerType.addEventListener("change", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.ledgerCustomer) els.ledgerCustomer.addEventListener("change", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.ledgerBranch) els.ledgerBranch.addEventListener("change", () => {
        ledgerOffset = 0;
        loadLedger();
    });
    if (els.financeExportBtn) els.financeExportBtn.addEventListener("click", exportFinanceCsv);
    if (els.ledgerTabs) {
        els.ledgerTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                setLedgerTab(tab.dataset.ledgerTab);
            });
        });
    }
    if (els.performanceStart) els.performanceStart.addEventListener("change", loadPerformance);
    if (els.performanceEnd) els.performanceEnd.addEventListener("change", loadPerformance);
    if (els.performanceBranch) els.performanceBranch.addEventListener("change", () => {
        performanceUsersCache.clear();
        performanceRoutesCache = { branch: null, items: [] };
        loadPerformanceUsers();
        loadRoutes();
        loadPerformance();
    });
    if (els.performanceUser) els.performanceUser.addEventListener("change", () => {
        performanceUserSelections[performanceActiveTab] = els.performanceUser.value || "";
        loadPerformance();
    });
    if (els.performanceRoute) els.performanceRoute.addEventListener("change", loadPerformance);
    if (els.performanceExportBtn) els.performanceExportBtn.addEventListener("click", exportPerformanceCsv);
    if (els.performanceTabs) {
        els.performanceTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                setPerformanceTab(tab.dataset.perfTab);
            });
        });
    }
    if (els.expenseStart) els.expenseStart.addEventListener("change", () => {
        expensesOffset = 0;
        loadExpenses();
    });
    if (els.expenseEnd) els.expenseEnd.addEventListener("change", () => {
        expensesOffset = 0;
        loadExpenses();
    });
    if (els.expenseCategoryFilter) els.expenseCategoryFilter.addEventListener("change", () => {
        expensesOffset = 0;
        loadExpenses();
    });
    if (els.expenseBranchFilter) els.expenseBranchFilter.addEventListener("change", () => {
        expensesOffset = 0;
        loadExpenses();
    });
    if (els.expenseSaveBtn) els.expenseSaveBtn.addEventListener("click", createExpense);
    if (els.expensesExportBtn) els.expensesExportBtn.addEventListener("click", exportExpensesCsv);
    if (els.customerOrdersCloseBtn) els.customerOrdersCloseBtn.addEventListener("click", closeCustomerOrdersModal);
    if (els.creditTabs) {
        els.creditTabs.forEach(tab => tab.addEventListener("click", () => setCreditTab(tab.dataset.tab)));
    }
    if (els.refreshCreditSales) els.refreshCreditSales.addEventListener("click", loadCreditSales);
    if (els.refreshCustomerOrders) els.refreshCustomerOrders.addEventListener("click", () => {
        customerOrdersOffset = 0;
        loadCustomerOrders();
    });
    if (els.creditSearch) els.creditSearch.addEventListener("input", renderCreditSales);
    if (els.customerOrdersSearch) {
        els.customerOrdersSearch.addEventListener("input", () => {
            customerOrdersQuery = els.customerOrdersSearch.value || "";
            customerOrdersOffset = 0;
            loadCustomerOrders();
        });
    }
    if (els.customerOrdersFilters) {
        els.customerOrdersFilters.querySelectorAll(".order-filter").forEach(btn => {
            btn.addEventListener("click", () => setCustomerOrdersFilter(btn.dataset.status));
        });
    }
    if (els.customerOrdersStatusClear) {
        els.customerOrdersStatusClear.addEventListener("click", () => {
            clearCustomerOrdersStatusList();
            toast("Showing all customer orders.", "info");
        });
    }
    if (els.submitPaymentBtn) els.submitPaymentBtn.addEventListener("click", submitPayment);
    if (els.payFullBtn) els.payFullBtn.addEventListener("click", fillFullBalance);
    if (els.paymentAmount) els.paymentAmount.addEventListener("input", validatePaymentInput);
    if (els.paymentMethod) {
        els.paymentMethod.addEventListener("change", () => {
            updateCreditPaymentMethodFields();
        });
        updateCreditPaymentMethodFields();
    }
    if (els.creditCustomerSelect) els.creditCustomerSelect.addEventListener("change", loadCustomerCredit);
    if (els.creditAssignedSelect) els.creditAssignedSelect.addEventListener("change", loadAssignedCredit);
    els.authCloseBtn.addEventListener("click", closeAuthModal);
    els.authLoginBtn.addEventListener("click", loginForToken);
    els.refreshHeldBtn.addEventListener("click", () => {
        heldSalesOffset = 0;
        loadHeldSales();
    });
    if (els.heldSalesPrev) {
        els.heldSalesPrev.addEventListener("click", () => {
            if (heldSalesOffset <= 0) return;
            heldSalesOffset = Math.max(0, heldSalesOffset - HELD_SALES_LIMIT);
            loadHeldSales();
        });
    }
    if (els.heldSalesNext) {
        els.heldSalesNext.addEventListener("click", () => {
            if (heldSalesOffset + HELD_SALES_LIMIT >= heldSalesPage.count) return;
            heldSalesOffset += HELD_SALES_LIMIT;
            loadHeldSales();
        });
    }
    if (els.customerOrdersPrev) {
        els.customerOrdersPrev.addEventListener("click", () => {
            if (customerOrdersOffset <= 0) return;
            customerOrdersOffset = Math.max(0, customerOrdersOffset - CUSTOMER_ORDERS_LIMIT);
            loadCustomerOrders();
        });
    }
    if (els.customerOrdersNext) {
        els.customerOrdersNext.addEventListener("click", () => {
            if (customerOrdersOffset + CUSTOMER_ORDERS_LIMIT >= customerOrdersPage.count) return;
            customerOrdersOffset += CUSTOMER_ORDERS_LIMIT;
            loadCustomerOrders();
        });
    }
    if (els.ledgerPrev) {
        els.ledgerPrev.addEventListener("click", () => {
            if (ledgerOffset <= 0) return;
            ledgerOffset = Math.max(0, ledgerOffset - LEDGER_LIMIT);
            loadLedger();
        });
    }
    if (els.ledgerNext) {
        els.ledgerNext.addEventListener("click", () => {
            if (ledgerOffset + LEDGER_LIMIT >= ledgerPage.count) return;
            ledgerOffset += LEDGER_LIMIT;
            loadLedger();
        });
    }
    if (els.expensePrev) {
        els.expensePrev.addEventListener("click", () => {
            if (expensesOffset <= 0) return;
            expensesOffset = Math.max(0, expensesOffset - EXPENSES_LIMIT);
            loadExpenses();
        });
    }
    if (els.expenseNext) {
        els.expenseNext.addEventListener("click", () => {
            if (expensesOffset + EXPENSES_LIMIT >= expensesPage.count) return;
            expensesOffset += EXPENSES_LIMIT;
            loadExpenses();
        });
    }
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

// ——— Mobile POS Nav ———
function isMobileLayout() {
    return window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
}

const MOBILE_HISTORY_TABS = new Set(["home", "products", "cart", "sales", "stock", "customers", "reports", "checkout", "deliveries"]);
const MOBILE_HISTORY_OVERLAYS = new Set([
    "mobile-sale-detail-modal",
    "mobile-customer-detail-modal",
    "mobile-customer-payment-modal",
    "mobile-customer-modal",
    "mobile-success-modal",
    "receipt-modal",
    "customer-orders-modal",
    "credit-modal",
    "ledger-modal",
    "returns-modal",
    "inventory-scan-modal",
    "pos-scan-modal",
    "delivery-run-modal",
]);
let mobileHistorySyncSuspended = false;

function canAccessMobileTab(tab) {
    const role = getResolvedUserRole();
    switch (tab) {
        case "cart":
        case "products":
        case "checkout":
            return ["cashier", "salesperson", "supervisor", "admin"].includes(role);
        case "sales":
            return canViewMobileSales();
        case "stock":
            return canViewStock();
        case "customers":
            return canViewCustomers();
        case "reports":
            return canViewReports();
        case "deliveries":
            return isDeliveryRole();
        case "home":
        default:
            return true;
    }
}

function normalizeMobileTab(tab) {
    const value = (tab || "home").toString();
    if (!MOBILE_HISTORY_TABS.has(value)) return "home";
    return canAccessMobileTab(value) ? value : "home";
}

function restoreMobileHistoryState(state) {
    if (!isMobileLayout()) return;
    const nextTab = normalizeMobileTab(state?.tab || "home");
    const overlayState = state?.overlay && isMobileHistoryOverlay(state.overlay.id) ? state.overlay : null;
    if (state?.branchId) {
        restoreMobileBranchSelection(state.branchId);
    }
    mobileHistorySyncSuspended = true;
    setMobileTab(nextTab, {
        syncHistory: false,
        preserveScroll: true,
        restoreSnapshot: state?.screenState || null,
    });
    closeOpenMobileHistoryOverlays();

    if (overlayState) {
        switch (overlayState.id) {
            case "mobile-sale-detail-modal":
                if (overlayState.saleId && canViewMobileSales()) openMobileSaleDetail(overlayState.saleId);
                break;
            case "mobile-customer-detail-modal":
                if (overlayState.customerId && canViewCustomers()) openMobileCustomerDetail(overlayState.customerId);
                break;
            case "mobile-customer-payment-modal":
                if (overlayState.customerId && canViewCustomers() && canRecordCustomerPayment()) {
                    currentMobileCustomerId = overlayState.customerId;
                    openMobileCustomerPaymentModal();
                }
                break;
            case "mobile-success-modal":
                if (overlayState.saleId && canPerformSales()) {
                    lastMobileSaleId = overlayState.saleId;
                }
                if (canPerformSales()) openMobileSuccessModal();
                break;
            case "receipt-modal":
                if (overlayState.saleId && canViewMobileSales()) {
                    lastMobileSaleId = overlayState.saleId;
                    showReceipt(overlayState.saleId);
                }
                break;
            case "mobile-customer-modal":
                if (canCreateCustomer()) openMobileCustomerModal();
                break;
            case "delivery-run-modal":
                if (canAccessDeliveryRun()) openDeliveryRunModal();
                break;
            case "customer-orders-modal":
                if (canManageCustomerOrders()) openCustomerOrdersModal({ statusList: overlayState.statusList || [] });
                break;
            case "credit-modal":
                if (canPerformSales()) openCreditModal();
                break;
            case "ledger-modal":
                if (canViewLedger()) openLedgerModal();
                break;
            case "returns-modal":
                if (canProcessReturns()) openReturnsModal();
                break;
            case "inventory-scan-modal":
                if (canPerformSales()) openInventoryScanModal();
                break;
            case "pos-scan-modal":
                if (canPerformSales()) openPosScanModal();
                break;
            default:
                break;
        }
    }

    mobileHistorySyncSuspended = false;
    syncMobileHistoryState("replace");
}

function setMobileTab(tab, { syncHistory = true, historyMode = "push", preserveScroll = false, restoreSnapshot = null } = {}) {
    if (!tab) return;
    const nextTab = normalizeMobileTab(tab);
    if (!mobileStateRestoring) {
        persistMobileScreenState(activeMobileTab);
    }
    activeMobileTab = nextTab;
    if (isMobileLayout()) {
        document.body.dataset.mobileTab = nextTab;
    }
    if (!mobileStateRestoring) {
        mobileUiState.role = getResolvedUserRole();
        mobileUiState.activeTab = nextTab;
        mobileUiState.branchId = els.branchSelect?.value || "";
        persistMobileUiState();
    }
    let effectiveHistoryMode = historyMode;
    if (syncHistory && !mobileHistorySyncSuspended) {
        const hasOpenMobileOverlay = Boolean(getTopMobileHistoryOverlayId());
        if (hasOpenMobileOverlay) {
            mobileHistorySyncSuspended = true;
            closeOpenMobileHistoryOverlays();
            mobileHistorySyncSuspended = false;
            effectiveHistoryMode = "replace";
        }
    }
    if (els.mobileNavButtons && els.mobileNavButtons.length) {
        const navTab = ["sales", "stock", "customers", "reports"].includes(nextTab) ? "home" : nextTab;
        els.mobileNavButtons.forEach(btn => {
            const active = btn.dataset.tab === navTab;
            btn.classList.toggle("active", active);
        });
    }
    if (!mobileStateRestoring) {
        const restored = restoreMobileScreenState(nextTab, restoreSnapshot);
        if (!restored) {
            mobilePendingScrollRestore = null;
        }
    }
    refreshMobileTab(nextTab);
    if (syncHistory && !mobileHistorySyncSuspended) {
        syncMobileHistoryState(effectiveHistoryMode);
    }
    if (!preserveScroll && !mobilePendingScrollRestore) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function initMobileNav() {
    if (els.mobileNavButtons && els.mobileNavButtons.length) {
        els.mobileNavButtons.forEach(btn => {
            btn.addEventListener("click", () => setMobileTab(btn.dataset.tab));
        });
    }
    if (els.mobileCartCheckout) {
        els.mobileCartCheckout.addEventListener("click", () => setMobileTab("checkout"));
    }
    if (els.mobileHeldRefresh) {
        els.mobileHeldRefresh.addEventListener("click", () => loadHeldSales());
    }

    const apply = () => {
        if (isMobileLayout()) {
            if (!window.history.state || !window.history.state.mobileNav) {
                mobileStateRestoring = true;
                setMobileTab(activeMobileTab, { syncHistory: false, preserveScroll: true });
                mobileStateRestoring = false;
                syncMobileHistoryState("replace");
            }
        } else {
            document.body.removeAttribute("data-mobile-tab");
        }
        updateMobileRoleBanner();
    };
    apply();
    window.addEventListener("resize", () => {
        requestAnimationFrame(apply);
    });
}

window.addEventListener("popstate", (event) => {
    if (!isMobileLayout()) return;
    if (event.state && event.state.mobileNav) {
        restoreMobileHistoryState(event.state);
        return;
    }
    mobileHistorySyncSuspended = true;
    closeOpenMobileHistoryOverlays();
    setMobileTab("home", { syncHistory: false });
    mobileHistorySyncSuspended = false;
    syncMobileHistoryState("replace");
});

function updateMobileRoleBanner() {
    if (!els.mobileRoleBanner) return;
    const blocked = !canPerformSales();
    if (!isMobileLayout()) {
        els.mobileRoleBanner.classList.add("hidden");
        return;
    }
    if (blocked) {
        els.mobileRoleBanner.textContent = "Sales are not available for your role.";
        els.mobileRoleBanner.classList.remove("hidden");
    } else {
        els.mobileRoleBanner.classList.add("hidden");
    }
}

async function loadMobileCategories() {
    if (!els.mobileCategoryChips) return;
    const data = await apiFetch("/inventory/categories/");
    mobileCategories = ensureArray(data, "mobileCategories");
    renderMobileCategoryChips();
    renderMobileStockCategoryChips();
}

function renderMobileCategoryChips() {
    if (!els.mobileCategoryChips) return;
    if (!mobileCategories.length) {
        els.mobileCategoryChips.innerHTML = "";
        return;
    }
    const chips = [
        `<button class="mobile-category-chip ${mobileActiveCategory === "all" ? "active" : ""}" data-category="all">All</button>`,
        ...mobileCategories.map((c) => {
            const categoryId = c.id || "";
            const isActive = mobileActiveCategory === categoryId;
            return `<button class="mobile-category-chip ${isActive ? "active" : ""}" data-category="${esc(categoryId)}">${esc(c.name)}</button>`;
        }),
    ];
    els.mobileCategoryChips.innerHTML = chips.join("");
    els.mobileCategoryChips.querySelectorAll(".mobile-category-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const category = btn.dataset.category || "all";
            setMobileCategory(category);
        });
    });
}

function setMobileCategory(category) {
    mobileActiveCategory = category || "all";
    if (mobileStockLowOnly) {
        mobileStockLowOnly = false;
        updateMobileStockFilterNote();
    }
    if (els.mobileCategoryChips) {
        els.mobileCategoryChips.querySelectorAll(".mobile-category-chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.category === mobileActiveCategory);
        });
    }
    const query = (els.productSearch?.value || "").trim();
    if (query) {
        scheduleMobileSearch(query);
    } else {
        resetMobileSearch();
        renderMobileProducts();
    }
    persistMobileScreenState("products");
}

function renderMobileStockCategoryChips() {
    if (!els.mobileStockCategoryChips) return;
    if (!mobileCategories.length) {
        els.mobileStockCategoryChips.innerHTML = "";
        return;
    }
    const chips = [
        `<button class="mobile-category-chip ${mobileStockCategory === "all" ? "active" : ""}" data-category="all">All</button>`,
        ...mobileCategories.map((c) => {
            const categoryId = c.id || "";
            const isActive = mobileStockCategory === categoryId;
            return `<button class="mobile-category-chip ${isActive ? "active" : ""}" data-category="${esc(categoryId)}">${esc(c.name)}</button>`;
        }),
    ];
    els.mobileStockCategoryChips.innerHTML = chips.join("");
    els.mobileStockCategoryChips.querySelectorAll(".mobile-category-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const category = btn.dataset.category || "all";
            setMobileStockCategory(category);
        });
    });
}

function setMobileStockCategory(category) {
    mobileStockCategory = category || "all";
    if (mobileStockLowOnly) {
        mobileStockLowOnly = false;
        updateMobileStockFilterNote();
    }
    if (els.mobileStockCategoryChips) {
        els.mobileStockCategoryChips.querySelectorAll(".mobile-category-chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.category === mobileStockCategory);
        });
    }
    loadMobileStock({ query: mobileStockQuery });
    persistMobileScreenState("stock");
}

function updateMobileCallAction(phone) {
    if (!els.mobileCustomerCall) return;
    if (phone) {
        els.mobileCustomerCall.href = `tel:${phone}`;
        els.mobileCustomerCall.classList.remove("btn-disabled");
        els.mobileCustomerCall.setAttribute("aria-disabled", "false");
    } else {
        els.mobileCustomerCall.href = "#";
        els.mobileCustomerCall.classList.add("btn-disabled");
        els.mobileCustomerCall.setAttribute("aria-disabled", "true");
    }
}

function normalizePhoneForWhatsApp(raw) {
    if (!raw) return "";
    const digits = raw.toString().replace(/[^\d+]/g, "").replace(/\+/g, "");
    if (!digits) return "";
    if (digits.startsWith("254")) return digits;
    if (digits.startsWith("0") && digits.length === 10) {
        return `254${digits.slice(1)}`;
    }
    if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
        return `254${digits}`;
    }
    return digits;
}

function updateMobileWhatsappAction(phone) {
    if (!els.mobileCustomerWhatsapp) return;
    const normalized = normalizePhoneForWhatsApp(phone);
    if (normalized) {
        els.mobileCustomerWhatsapp.href = `https://wa.me/${normalized}`;
        els.mobileCustomerWhatsapp.classList.remove("btn-disabled");
        els.mobileCustomerWhatsapp.setAttribute("aria-disabled", "false");
    } else {
        els.mobileCustomerWhatsapp.href = "#";
        els.mobileCustomerWhatsapp.classList.add("btn-disabled");
        els.mobileCustomerWhatsapp.setAttribute("aria-disabled", "true");
    }
}

function canRecordCustomerPayment() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function openMobileCustomerPaymentModal() {
    if (!els.mobileCustomerPaymentModal) return;
    if (!currentMobileCustomerId) {
        toast("Select a customer first.", "error");
        return;
    }
    if (!canRecordCustomerPayment()) {
        toast("You do not have permission to record payments.", "error");
        return;
    }
    if (els.mobileCustomerPaymentError) els.mobileCustomerPaymentError.textContent = "";
    if (els.mobileCustomerPaymentAmount) els.mobileCustomerPaymentAmount.value = "";
    if (els.mobileCustomerPaymentReference) els.mobileCustomerPaymentReference.value = "";
    if (els.mobileCustomerPaymentNote) els.mobileCustomerPaymentNote.value = "";
    if (els.mobileCustomerPaymentMethod) els.mobileCustomerPaymentMethod.value = "cash";
    openOverlay(els.mobileCustomerPaymentModal, { closeOthers: false });
    requestAnimationFrame(() => {
        els.mobileCustomerPaymentAmount?.focus();
    });
}

async function submitMobileCustomerPayment() {
    if (mobileCustomerPaymentSaving) return;
    if (!currentMobileCustomerId) {
        toast("Select a customer first.", "error");
        return;
    }
    if (!canRecordCustomerPayment()) {
        toast("You do not have permission to record payments.", "error");
        return;
    }

    const amountRaw = els.mobileCustomerPaymentAmount?.value || "";
    const method = els.mobileCustomerPaymentMethod?.value || "cash";
    const reference = els.mobileCustomerPaymentReference?.value || "";
    const note = els.mobileCustomerPaymentNote?.value || "";

    if (!amountRaw || Number(amountRaw) <= 0) {
        const message = "Enter a valid amount.";
        if (els.mobileCustomerPaymentError) els.mobileCustomerPaymentError.textContent = message;
        toast(message, "error");
        return;
    }

    const payload = {
        amount: amountRaw,
        payment_method: method,
        reference: reference,
        note: note,
    };

    mobileCustomerPaymentSaving = true;
    if (els.mobileCustomerPaymentSubmit) {
        els.mobileCustomerPaymentSubmit.disabled = true;
        els.mobileCustomerPaymentSubmit.textContent = "Saving...";
    }
    try {
        await apiRequest(`/sales/credit/customer/${currentMobileCustomerId}/payments/`, {
            method: "POST",
            body: payload,
        });
        toast("Payment recorded", "success");
        closeOverlay(els.mobileCustomerPaymentModal);
        await openMobileCustomerDetail(currentMobileCustomerId);
    } catch (err) {
        const message = err.message || "Payment failed.";
        if (els.mobileCustomerPaymentError) els.mobileCustomerPaymentError.textContent = message;
        toast(`Payment failed: ${message}`, "error");
    } finally {
        mobileCustomerPaymentSaving = false;
        if (els.mobileCustomerPaymentSubmit) {
            els.mobileCustomerPaymentSubmit.disabled = false;
            els.mobileCustomerPaymentSubmit.textContent = "Save Payment";
        }
    }
}

function refreshMobileTab(tab) {
    if (!isMobileLayout()) return;
    if (tab === "home") {
        loadMobileDashboardSummary();
    }
    if (tab === "cart") {
        renderMobileCart();
    }
    if (tab === "sales") {
        loadMobileSales();
    }
    if (tab === "stock") {
        loadMobileStock({ query: mobileStockQuery });
    }
    if (tab === "customers") {
        loadMobileCustomers({ query: mobileCustomersQuery });
    }
    if (tab === "reports") {
        loadMobileReports();
    }
    if (tab === "deliveries") {
        loadMobileDeliveries();
    }
}

function initMobileDashboard() {
    if (els.mobileTileSell) {
        els.mobileTileSell.addEventListener("click", () => {
            if (!canPerformSales()) {
                toast("Sales are not available for your role.", "error");
                return;
            }
            setMobileTab("products");
            focusSearchInput();
        });
    }
    if (els.mobileTileSales) {
        els.mobileTileSales.addEventListener("click", () => {
            if (!canViewMobileSales()) {
                toast("Sales are not available for your role.", "error");
                return;
            }
            setMobileTab("sales");
        });
    }
    if (els.mobileTileStock) {
        els.mobileTileStock.addEventListener("click", () => {
            if (!canViewStock()) {
                toast("Stock is not available for your role.", "error");
                return;
            }
            setMobileTab("stock");
        });
    }
    if (els.mobileTileCustomers) {
        els.mobileTileCustomers.addEventListener("click", () => {
            if (!canViewCustomers()) {
                toast("Customers are not available for your role.", "error");
                return;
            }
            setMobileTab("customers");
        });
    }
    if (els.mobileTileCustomerOrders) {
        els.mobileTileCustomerOrders.addEventListener("click", () => {
            if (!canManageCustomerOrders()) {
                toast("Orders are not available for your role.", "error");
                return;
            }
            openCustomerOrdersModal();
        });
    }
    if (els.mobileTileReports) {
        els.mobileTileReports.addEventListener("click", () => {
            if (!canViewReports()) {
                toast("Reports are not available for your role.", "error");
                return;
            }
            setMobileTab("reports");
        });
    }
    if (els.mobileTileDelivery) {
        els.mobileTileDelivery.addEventListener("click", () => {
            if (!canAccessDeliveryRun()) {
                toast("Delivery run access is not available for your role.", "error");
                return;
            }
            openDeliveryRunModal();
        });
    }
    if (els.mobileDeliveryAssignedOrdersBtn) {
        els.mobileDeliveryAssignedOrdersBtn.addEventListener("click", openDeliveryDashboardOrders);
    }
    if (els.mobileDeliveryActiveRunsBtn) {
        els.mobileDeliveryActiveRunsBtn.addEventListener("click", () => openDeliveryDashboardDeliveries("active"));
    }
    if (els.mobileDeliveryCompletedTodayBtn) {
        els.mobileDeliveryCompletedTodayBtn.addEventListener("click", () => openDeliveryDashboardDeliveries("completed_today"));
    }
    if (els.mobileSalesBack) {
        els.mobileSalesBack.addEventListener("click", () => setMobileTab("home"));
    }
    if (els.mobileStockBack) {
        els.mobileStockBack.addEventListener("click", () => setMobileTab("home"));
    }
    if (els.mobileCustomersBack) {
        els.mobileCustomersBack.addEventListener("click", () => setMobileTab("home"));
    }
    if (els.mobileReportsBack) {
        els.mobileReportsBack.addEventListener("click", () => setMobileTab("home"));
    }
    if (els.mobileReportsRetry) {
        els.mobileReportsRetry.addEventListener("click", () => loadMobileReports());
    }
    if (els.mobileDeliveriesBack) {
        els.mobileDeliveriesBack.addEventListener("click", () => setMobileTab("home"));
    }
    if (els.mobileDeliveriesFilter) {
        els.mobileDeliveriesFilter.addEventListener("change", () => {
            setMobileDeliveriesFilter(els.mobileDeliveriesFilter.value);
        });
    }
    if (els.mobileReportsPanel) {
        els.mobileReportsPanel.addEventListener("click", (event) => {
            const card = event.target.closest("[data-report-action]");
            if (card) {
                const action = card.dataset.reportAction || "";
                if (action === "today-sales") {
                    openTodaySalesFromReports();
                } else if (action === "week-sales") {
                    openWeekSalesFromReports();
                } else if (action === "pending-orders") {
                    openPendingOrdersFromReports();
                } else if (action === "low-stock") {
                    openLowStockFromReports();
                }
                return;
            }
            const row = event.target.closest("[data-report-product]");
            if (row) {
                const productId = row.dataset.reportProduct;
                const product = mobileReportsTopProducts.find((p) => p.product_id === productId) || null;
                openTopProductFromReports(product);
            }
        });
    }
    if (els.mobileSalesFilter) {
        els.mobileSalesFilter.value = mobileSalesFilter;
        els.mobileSalesFilter.addEventListener("change", () => {
            mobileSalesFilter = els.mobileSalesFilter.value || "today";
            loadMobileSales();
            persistMobileScreenState("sales");
        });
    }
    if (els.mobileStockSearch) {
        els.mobileStockSearch.addEventListener("input", () => {
            mobileStockQuery = (els.mobileStockSearch.value || "").trim();
            if (mobileStockLowOnly) {
                mobileStockLowOnly = false;
                updateMobileStockFilterNote();
            }
            if (mobileStockTimer) clearTimeout(mobileStockTimer);
            mobileStockTimer = setTimeout(() => {
                loadMobileStock({ query: mobileStockQuery });
            }, 300);
            persistMobileScreenState("stock");
        });
    }
    if (els.mobileStockFilterClear) {
        els.mobileStockFilterClear.addEventListener("click", () => {
            if (!mobileStockLowOnly) return;
            mobileStockLowOnly = false;
            updateMobileStockFilterNote();
            const query = (els.mobileStockSearch?.value || "").trim();
            mobileStockQuery = query;
            loadMobileStock({ query });
            persistMobileScreenState("stock");
        });
    }
    if (els.mobileCustomersSearch) {
        els.mobileCustomersSearch.addEventListener("input", () => {
            mobileCustomersQuery = (els.mobileCustomersSearch.value || "").trim();
            if (mobileCustomersLoading) {
                mobileCustomersToken += 1;
            }
            if (mobileCustomersTimer) clearTimeout(mobileCustomersTimer);
            mobileCustomersTimer = setTimeout(() => {
                loadMobileCustomers({ query: mobileCustomersQuery });
            }, 320);
            persistMobileScreenState("customers");
        });
    }
    if (els.mobileSaleDetailClose) {
        els.mobileSaleDetailClose.addEventListener("click", () => closeOverlay(els.mobileSaleDetailModal));
    }
    if (els.mobileSaleDetailReceipt) {
        els.mobileSaleDetailReceipt.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (currentMobileSaleDetailId) {
                showReceipt(currentMobileSaleDetailId);
            }
        });
    }
    if (els.mobileCustomerDetailClose) {
        els.mobileCustomerDetailClose.addEventListener("click", () => closeOverlay(els.mobileCustomerDetailModal));
    }
    if (els.mobileCustomerPaymentBtn) {
        els.mobileCustomerPaymentBtn.addEventListener("click", () => openMobileCustomerPaymentModal());
    }
    if (els.mobileCustomerPaymentClose) {
        els.mobileCustomerPaymentClose.addEventListener("click", () => closeOverlay(els.mobileCustomerPaymentModal));
    }
    if (els.mobileCustomerPaymentSubmit) {
        els.mobileCustomerPaymentSubmit.addEventListener("click", submitMobileCustomerPayment);
    }
}

function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getMobileDateRange(filter) {
    const end = new Date();
    const start = new Date(end);
    if (filter === "7d") {
        start.setDate(end.getDate() - 6);
    } else if (filter === "30d") {
        start.setDate(end.getDate() - 29);
    }
    return {
        date_from: toISODate(start),
        date_to: toISODate(end),
    };
}

function updateMobileDashboardTiles() {
    const canSell = canPerformSales();
    const canSales = canViewMobileSales();
    const canStock = canViewStock();
    const canCustomers = canViewCustomers();
    const canCustomerOrders = canManageCustomerOrders();
    const canReports = canViewReports();
    const canDelivery = canAccessDeliveryRun();
    const isDelivery = isDeliveryRole();
    const setTileVisible = (tile, visible) => {
        if (!tile) return;
        tile.classList.toggle("hidden", !visible);
        tile.disabled = !visible;
        tile.classList.toggle("disabled", !visible);
    };

    setTileVisible(els.mobileTileSell, canSell && !isDelivery);
    setTileVisible(els.mobileTileSales, canSales && !isDelivery);
    setTileVisible(els.mobileTileStock, canStock && !isDelivery);
    setTileVisible(els.mobileTileCustomers, canCustomers && !isDelivery);
    setTileVisible(els.mobileTileCustomerOrders, canCustomerOrders);
    setTileVisible(els.mobileTileReports, canReports && !isDelivery);
    setTileVisible(els.mobileTileDelivery, canDelivery);
    if (els.mobileDeliveryDashboard) {
        els.mobileDeliveryDashboard.classList.toggle("hidden", !isDelivery);
    }
}

async function loadMobileDashboardSummary() {
    if (!els.mobileSummarySalesValue || !els.mobileSummaryExpensesValue || !isMobileLayout()) return;
    if (!API_TOKEN || !currentUser) {
        els.mobileSummarySalesValue.textContent = "—";
        els.mobileSummarySalesSub.textContent = "Log in to view";
        els.mobileSummaryExpensesValue.textContent = "—";
        els.mobileSummaryExpensesSub.textContent = "Log in to view";
        if (els.mobileDeliveryDashboard) {
            els.mobileDeliveryDashboard.classList.add("hidden");
        }
        restoreMobileScrollIfNeeded("home");
        return;
    }
    const branchId = els.branchSelect?.value || "";
    const today = toISODate(new Date());
    const params = { date_from: today, date_to: today };
    if (branchId) params.branch = branchId;

    if (canViewMobileSales()) {
        els.mobileSummarySalesValue.textContent = "Loading...";
        els.mobileSummarySalesSub.textContent = "—";
        try {
            const summary = await apiFetch(withParams("/sales/mobile/summary/", params));
            const total = fmtPrice(summary?.total || 0);
            const count = summary?.count || 0;
            els.mobileSummarySalesValue.textContent = total;
            els.mobileSummarySalesSub.textContent = `${count} sale${count === 1 ? "" : "s"}`;
        } catch (err) {
            els.mobileSummarySalesValue.textContent = "—";
            els.mobileSummarySalesSub.textContent = "Unable to load";
        }
    } else {
        els.mobileSummarySalesValue.textContent = "—";
        els.mobileSummarySalesSub.textContent = "Not available";
    }
    await loadMobileDeliveryDashboardSummary();

    if (!canViewLedger()) {
        els.mobileSummaryExpensesValue.textContent = "—";
        els.mobileSummaryExpensesSub.textContent = "Admin only";
        restoreMobileScrollIfNeeded("home");
        return;
    }
    els.mobileSummaryExpensesValue.textContent = "Loading...";
    els.mobileSummaryExpensesSub.textContent = "—";
    try {
        const summary = await apiFetch(withParams("/expenses/summary/", params));
        const total = fmtPrice(summary?.total || 0);
        const count = summary?.count || 0;
        els.mobileSummaryExpensesValue.textContent = total;
        els.mobileSummaryExpensesSub.textContent = `${count} expense${count === 1 ? "" : "s"}`;
    } catch (err) {
        els.mobileSummaryExpensesValue.textContent = "—";
        els.mobileSummaryExpensesSub.textContent = "Unable to load";
    }
    restoreMobileScrollIfNeeded("home");
}

async function loadMobileDeliveryDashboardSummary() {
    if (!isMobileLayout() || !els.mobileDeliveryDashboard) return;
    const deliveryRole = isDeliveryRole();
    els.mobileDeliveryDashboard.classList.toggle("hidden", !deliveryRole);
    if (!deliveryRole) return;
    if (mobileDeliveryDashboardLoading) return;
    if (!API_TOKEN || !currentUser) {
        setMobileDeliveryDashboardState(null, "Log in to view", null, "—", null, "—");
        return;
    }
    mobileDeliveryDashboardLoading = true;
    setMobileDeliveryDashboardState("Loading...", "—", "Loading...", "—", "Loading...", "—");
    try {
        const summary = await apiFetch("/delivery/dashboard/");
        setMobileDeliveryDashboardState(
            String(summary?.assigned_orders_count ?? 0),
            "Assigned to you",
            String(summary?.active_deliveries_count ?? 0),
            "In progress",
            String(summary?.completed_today_count ?? 0),
            "Delivered today",
        );
    } catch (err) {
        setMobileDeliveryDashboardState("—", "Unable to load", "—", "Unable to load", "—", "Unable to load");
    } finally {
        mobileDeliveryDashboardLoading = false;
    }
}

function setMobileDeliveryDashboardState(ordersValue, ordersSub, activeValue, activeSub, completedValue, completedSub) {
    if (els.mobileDeliveryAssignedOrdersValue) els.mobileDeliveryAssignedOrdersValue.textContent = ordersValue ?? "—";
    if (els.mobileDeliveryAssignedOrdersSub) els.mobileDeliveryAssignedOrdersSub.textContent = ordersSub ?? "—";
    if (els.mobileDeliveryActiveRunsValue) els.mobileDeliveryActiveRunsValue.textContent = activeValue ?? "—";
    if (els.mobileDeliveryActiveRunsSub) els.mobileDeliveryActiveRunsSub.textContent = activeSub ?? "—";
    if (els.mobileDeliveryCompletedTodayValue) els.mobileDeliveryCompletedTodayValue.textContent = completedValue ?? "—";
    if (els.mobileDeliveryCompletedTodaySub) els.mobileDeliveryCompletedTodaySub.textContent = completedSub ?? "—";
}

async function loadMobileSales() {
    if (!els.mobileSalesList || !isMobileLayout()) return;
    if (!API_TOKEN || !currentUser) {
        els.mobileSalesList.innerHTML = `<div class="sale-entry-empty">Log in to view sales.</div>`;
        if (els.mobileSalesSummary) {
            els.mobileSalesSummary.textContent = "";
        }
        restoreMobileScrollIfNeeded("sales");
        return;
    }
    if (!canViewMobileSales()) {
        els.mobileSalesList.innerHTML = `<div class="sale-entry-empty">Sales are not available for your role.</div>`;
        if (els.mobileSalesSummary) {
            els.mobileSalesSummary.textContent = "";
        }
        restoreMobileScrollIfNeeded("sales");
        return;
    }

    if (els.mobileSalesFilter) {
        els.mobileSalesFilter.value = mobileSalesFilter;
    }
    const branchId = els.branchSelect?.value || "";
    const range = getMobileDateRange(mobileSalesFilter);
    const params = { ...range };
    if (branchId) params.branch = branchId;

    els.mobileSalesList.innerHTML = `<div class="sale-entry-empty">Loading sales…</div>`;
    if (els.mobileSalesSummary) {
        els.mobileSalesSummary.textContent = "Loading summary…";
    }
    mobileSalesLoading = true;
    try {
        const [summary, listData] = await Promise.all([
            apiFetch(withParams("/sales/mobile/summary/", params)),
            apiFetch(withParams("/sales/mobile/", params)),
        ]);
        const total = fmtPrice(summary?.total || 0);
        const count = summary?.count || 0;
        if (els.mobileSalesSummary) {
            els.mobileSalesSummary.textContent = `${count} sale${count === 1 ? "" : "s"} • ${total}`;
        }

        const results = ensureArray(listData?.results ?? listData, "mobileSales");
        mobileSalesCache = new Map();
        results.forEach((sale) => {
            if (sale?.id) mobileSalesCache.set(sale.id, sale);
        });
        if (!results.length) {
            els.mobileSalesList.innerHTML = `<div class="sale-entry-empty">No sales found.</div>`;
        } else {
            const showCashier = isSupervisorOrAdmin();
            els.mobileSalesList.innerHTML = results.map((sale) => {
                const customerName = sale.customer?.name || "Walk-in";
                const saleTime = formatDateTime(sale.completed_at || sale.sale_date);
                const cashier = sale.completed_by?.display_name || "—";
                const paymentMode = formatLabel(sale.payment_mode || "cash");
                return `
                    <div class="mobile-sales-card" data-mobile-sale-id="${sale.id}">
                        <div class="mobile-sales-meta">
                            <span>#${shortOrderId(sale.id)}</span>
                            <span>${saleTime}</span>
                        </div>
                        <strong>${esc(customerName)}</strong>
                        <div class="mobile-sales-meta">
                            <span>${paymentMode}</span>
                            <span>${fmtPrice(sale.grand_total || 0)}</span>
                        </div>
                        ${showCashier ? `<div class="mobile-sales-meta"><span>Cashier</span><span>${esc(cashier)}</span></div>` : ""}
                    </div>
                `;
            }).join("");
        }
        if (els.mobileSalesScope) {
            els.mobileSalesScope.textContent = isSupervisorOrAdmin() ? "All sales" : "My sales";
        }
    } catch (err) {
        els.mobileSalesList.innerHTML = `<div class="sale-entry-empty">Failed to load sales.</div>`;
        if (els.mobileSalesSummary) {
            els.mobileSalesSummary.textContent = "";
        }
    } finally {
        mobileSalesLoading = false;
        restoreMobileScrollIfNeeded("sales");
    }
}

function setMobileDeliveriesFilter(filter) {
    const nextFilter = ["active", "completed_today", "all"].includes(filter) ? filter : "active";
    mobileDeliveriesFilter = nextFilter;
    localStorage.setItem("mobile_deliveries_filter", nextFilter);
    if (els.mobileDeliveriesFilter) {
        els.mobileDeliveriesFilter.value = nextFilter;
    }
    if (activeMobileTab === "deliveries") {
        loadMobileDeliveries();
    }
}

async function loadMobileDeliveries() {
    if (!els.mobileDeliveriesList || !isMobileLayout()) return;
    if (!API_TOKEN || !currentUser) {
        els.mobileDeliveriesList.innerHTML = `<div class="sale-entry-empty">Log in to view deliveries.</div>`;
        if (els.mobileDeliveriesScope) els.mobileDeliveriesScope.textContent = "Assigned runs";
        restoreMobileScrollIfNeeded("deliveries");
        return;
    }
    if (!isDeliveryRole()) {
        els.mobileDeliveriesList.innerHTML = `<div class="sale-entry-empty">Deliveries are not available for your role.</div>`;
        restoreMobileScrollIfNeeded("deliveries");
        return;
    }

    mobileDeliveriesLoading = true;
    mobileDeliveriesError = "";
    if (els.mobileDeliveriesLoading) els.mobileDeliveriesLoading.classList.remove("hidden");
    if (els.mobileDeliveriesError) els.mobileDeliveriesError.classList.add("hidden");
    if (els.mobileDeliveriesEmpty) els.mobileDeliveriesEmpty.classList.add("hidden");
    if (els.mobileDeliveriesFilter) {
        els.mobileDeliveriesFilter.value = mobileDeliveriesFilter;
    }

    const params = {};
    if (mobileDeliveriesFilter === "active") {
        params.active = 1;
    } else if (mobileDeliveriesFilter === "completed_today") {
        params.completed_today = 1;
    }

    try {
        const data = await apiFetchAll(withParams("/delivery/runs/", params));
        const rows = ensureArray(data, "mobileDeliveries");
        mobileDeliveriesPage = { count: rows.length, next: null, previous: null, results: rows };
        mobileDeliveries = rows;
        if (els.mobileDeliveriesScope) {
            els.mobileDeliveriesScope.textContent = mobileDeliveriesFilter === "active"
                ? "Active deliveries"
                : mobileDeliveriesFilter === "completed_today"
                    ? "Completed today"
                    : "All deliveries";
        }
        renderMobileDeliveries();
    } catch (err) {
        mobileDeliveriesError = err.message || "Failed to load deliveries.";
        if (els.mobileDeliveriesError) {
            els.mobileDeliveriesError.textContent = mobileDeliveriesError;
            els.mobileDeliveriesError.classList.remove("hidden");
        }
        if (els.mobileDeliveriesList) {
            els.mobileDeliveriesList.innerHTML = "";
        }
    } finally {
        mobileDeliveriesLoading = false;
        if (els.mobileDeliveriesLoading) els.mobileDeliveriesLoading.classList.add("hidden");
        if (!mobileDeliveries.length && !mobileDeliveriesError && els.mobileDeliveriesEmpty) {
            els.mobileDeliveriesEmpty.classList.remove("hidden");
        }
        restoreMobileScrollIfNeeded("deliveries");
    }
}

function renderMobileDeliveries() {
    if (!els.mobileDeliveriesList) return;
    if (mobileDeliveriesError) {
        els.mobileDeliveriesList.innerHTML = "";
        return;
    }
    if (!mobileDeliveries.length) {
        els.mobileDeliveriesList.innerHTML = "";
        if (els.mobileDeliveriesEmpty) els.mobileDeliveriesEmpty.classList.remove("hidden");
        return;
    }
    if (els.mobileDeliveriesEmpty) els.mobileDeliveriesEmpty.classList.add("hidden");
    els.mobileDeliveriesList.innerHTML = mobileDeliveries.map((run) => {
        const customerName = run.customer?.name || run.order?.customer_name || run.sale?.customer?.name || "Customer";
        const branchName = run.branch?.name || "Branch";
        const status = formatLabel(run.status || "unknown");
        const createdAt = formatDateTime(run.completed_at || run.assigned_at || run.created_at);
        const lastLocation = formatLocation(run.last_known_latitude, run.last_known_longitude);
        const orderId = run.order?.id ? `#${shortOrderId(run.order.id)}` : (run.sale?.id ? `#${shortOrderId(run.sale.id)}` : "—");
        return `
            <div class="order-row mobile-delivery-row" data-delivery-run="${run.id}">
                <div class="order-main">
                    <div class="order-top">
                        <div class="order-id">#${shortOrderId(run.id)}</div>
                        <span class="status-pill">${esc(status)}</span>
                    </div>
                    <div class="order-meta">${esc(customerName)} • ${esc(branchName)}</div>
                    <div class="order-meta small">Order/Sale: ${esc(orderId)}</div>
                    <div class="order-meta small">${createdAt}</div>
                    <div class="order-meta small">Last location: ${esc(lastLocation)}</div>
                </div>
                <div class="order-amount">
                    <button class="btn-secondary btn-inline" data-open-delivery-run="${run.id}">View</button>
                </div>
            </div>
        `;
    }).join("");
    els.mobileDeliveriesList.querySelectorAll("[data-open-delivery-run]").forEach((btn) => {
        btn.addEventListener("click", () => openBackOfficeDeliveryDetail(btn.dataset.openDeliveryRun));
    });
}

function openDeliveryDashboardOrders() {
    if (!isDeliveryRole()) return;
    openCustomerOrdersModal();
}

function openDeliveryDashboardDeliveries(filter) {
    if (!isDeliveryRole()) return;
    setMobileDeliveriesFilter(filter || "active");
    setMobileTab("deliveries");
}

async function openMobileSaleDetail(saleId) {
    if (!saleId) return;
    if (!canViewMobileSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    currentMobileSaleDetailId = saleId;
    if (els.mobileSaleDetailBody) {
        els.mobileSaleDetailBody.innerHTML = `<div class="sale-entry-empty">Loading sale details…</div>`;
    }
    openOverlay(els.mobileSaleDetailModal);
    const sale = mobileSalesCache.get(saleId) || {};
    const receipt = await apiFetch(`/sales/${saleId}/receipt/`);
    if (!receipt) {
        if (els.mobileSaleDetailBody) {
            els.mobileSaleDetailBody.innerHTML = `<div class="sale-entry-empty">Failed to load sale details.</div>`;
        }
        return;
    }
    const customerName = sale.customer?.name || "Walk-in";
    const branchName = sale.branch?.name || "—";
    const cashier = sale.completed_by?.display_name || "—";
    const saleTime = formatDateTime(receipt.date || sale.completed_at || sale.sale_date);
    const items = ensureArray(receipt.items || [], "receiptItems");
    const payments = ensureArray(receipt.payments || [], "receiptPayments");

    const paymentSummary = payments.length
        ? payments.map((p) => `${formatLabel(p.method || p.payment_method || "cash")} ${fmtPrice(p.amount || 0)}`).join(", ")
        : formatLabel(receipt.payment_status || sale.payment_status || "paid");

    if (els.mobileSaleDetailBody) {
        els.mobileSaleDetailBody.innerHTML = `
            <div class="mobile-sale-detail-header">
                <strong>Sale #${shortOrderId(saleId)}</strong>
                <div class="mobile-sale-detail-meta">
                    <div><span>Date</span> ${saleTime}</div>
                    <div><span>Customer</span> ${esc(customerName)}</div>
                    <div><span>Branch</span> ${esc(branchName)}</div>
                    ${isSupervisorOrAdmin() ? `<div><span>Cashier</span> ${esc(cashier)}</div>` : ""}
                </div>
            </div>
            <div class="mobile-sale-detail-section">
                <strong>Items</strong>
                <div class="mobile-sale-items">
                    ${items.length ? items.map((item) => `
                        <div class="mobile-sale-item">
                            <div>
                                <strong>${esc(item.product || "Item")}</strong>
                                <div class="item-meta">${item.quantity} × ${fmtPrice(item.unit_price || 0)}</div>
                            </div>
                            <div><strong>${fmtPrice(item.total || 0)}</strong></div>
                        </div>
                    `).join("") : `<div class="sale-entry-empty">No items found.</div>`}
                </div>
            </div>
            <div class="mobile-sale-detail-section">
                <strong>Payment</strong>
                <div class="mobile-sale-detail-meta">
                    <div><span>Status</span> ${formatLabel(receipt.payment_status || sale.payment_status || "paid")}</div>
                    <div><span>Summary</span> ${esc(paymentSummary)}</div>
                </div>
            </div>
            <div class="mobile-sale-detail-section">
                <strong>Totals</strong>
                <div class="mobile-sale-totals">
                    <div class="summary-row"><span>Subtotal</span><span>${fmtPrice(receipt.subtotal || 0)}</span></div>
                    <div class="summary-row"><span>Tax</span><span>${fmtPrice(receipt.tax || 0)}</span></div>
                    <div class="summary-row"><span>Total</span><span>${fmtPrice(receipt.total || 0)}</span></div>
                    <div class="summary-row"><span>Paid</span><span>${fmtPrice(receipt.paid || 0)}</span></div>
                    <div class="summary-row"><span>Balance</span><span>${fmtPrice(receipt.balance_due || 0)}</span></div>
                </div>
            </div>
        `;
    }
}

async function loadMobileStock({ query = "" } = {}) {
    if (!els.mobileStockList || !isMobileLayout()) return;
    if (!API_TOKEN || !currentUser) {
        els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Log in to view stock.</div>`;
        restoreMobileScrollIfNeeded("stock");
        return;
    }
    if (!canViewStock()) {
        els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Stock is not available for your role.</div>`;
        restoreMobileScrollIfNeeded("stock");
        return;
    }

    const branchId = els.branchSelect?.value || "";
    if (mobileStockLowOnly && !query && mobileStockCategory === "all") {
        updateMobileStockFilterNote();
        const params = {};
        if (branchId) params.branch = branchId;
        els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Loading low stock…</div>`;
        try {
            const data = await apiFetch(withParams("/reports/inventory-summary/", params));
            const lowStock = ensureArray(data?.low_stock_products, "mobileLowStock");
            if (!lowStock.length) {
                els.mobileStockList.innerHTML = `<div class="sale-entry-empty">No low stock items.</div>`;
                restoreMobileScrollIfNeeded("stock");
                return;
            }
            els.mobileStockList.innerHTML = lowStock.map((item) => `
                <div class="mobile-stock-card">
                    <strong>${esc(item.product_name || "—")}</strong>
                    <div class="mobile-stock-meta">
                        <span>${esc(item.sku || "—")}</span>
                        <span>Stock: ${item.quantity ?? 0}</span>
                    </div>
                </div>
            `).join("");
            restoreMobileScrollIfNeeded("stock");
            return;
        } catch (err) {
            els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Failed to load low stock.</div>`;
            restoreMobileScrollIfNeeded("stock");
            return;
        }
    }

    const params = { limit: 100 };
    if (branchId) params.branch = branchId;
    if (query) params.search = query;
    if (mobileStockCategory && mobileStockCategory !== "all") {
        params.category = mobileStockCategory;
    }

    const token = ++mobileStockToken;
    els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Loading stock…</div>`;
    try {
        const data = await apiFetchAll(withParams("/inventory/products/", params), { limit: 100 });
        if (token !== mobileStockToken) return;
        const results = ensureArray(data, "mobileStock");
        updateMobileStockFilterNote();
        if (!results.length) {
            els.mobileStockList.innerHTML = `<div class="sale-entry-empty">No matching stock.</div>`;
            restoreMobileScrollIfNeeded("stock");
            return;
        }
        els.mobileStockList.innerHTML = results.map((product) => `
            <div class="mobile-stock-card">
                <strong>${esc(product.name)}</strong>
                <div class="mobile-stock-meta">
                    <span>${esc(product.sku || "—")}</span>
                    <span>Stock: ${product.stock ?? 0}</span>
                </div>
            </div>
        `).join("");
    } catch (err) {
        if (token !== mobileStockToken) return;
        els.mobileStockList.innerHTML = `<div class="sale-entry-empty">Failed to load stock.</div>`;
    }
    restoreMobileScrollIfNeeded("stock");
}

async function loadMobileCustomers({ query = "" } = {}) {
    if (!els.mobileCustomersList || !isMobileLayout()) return;
    if (!API_TOKEN || !currentUser) {
        els.mobileCustomersList.innerHTML = `<div class="sale-entry-empty">Log in to view customers.</div>`;
        restoreMobileScrollIfNeeded("customers");
        return;
    }
    if (!canViewCustomers()) {
        els.mobileCustomersList.innerHTML = `<div class="sale-entry-empty">Customers are not available for your role.</div>`;
        restoreMobileScrollIfNeeded("customers");
        return;
    }

    const branchId = els.branchSelect?.value || "";
    const params = { limit: 20 };
    if (query) params.search = query;
    if (branchId) params.branch = branchId;

    const token = ++mobileCustomersToken;
    mobileCustomersLoading = true;
    els.mobileCustomersList.innerHTML = `<div class="sale-entry-empty">Loading customers…</div>`;
    try {
        let data = await apiFetch(withParams("/customers/", params));
        if (token !== mobileCustomersToken) return;
        let results = ensureArray(data?.results ?? data, "mobileCustomers");
        if (!results.length && branchId) {
            const fallbackParams = { limit: 20 };
            if (query) fallbackParams.search = query;
            data = await apiFetch(withParams("/customers/", fallbackParams));
            if (token !== mobileCustomersToken) return;
            results = ensureArray(data?.results ?? data, "mobileCustomersFallback");
        }
        mobileCustomers = results;
        if (!results.length) {
            els.mobileCustomersList.innerHTML = `<div class="sale-entry-empty">No customers found.</div>`;
            restoreMobileScrollIfNeeded("customers");
            return;
        }
        els.mobileCustomersList.innerHTML = results.map((c) => {
            const route = c.route_name || "—";
            const branch = c.branch_name || "—";
            return `
                <div class="mobile-customer-card" data-mobile-customer-id="${c.id}">
                    <strong>${esc(c.name || "—")}</strong>
                    <div class="customer-meta">
                        <span>${esc(route)}</span>
                        <span>${esc(branch)}</span>
                    </div>
                </div>
            `;
        }).join("");
        restoreMobileScrollIfNeeded("customers");
    } catch (err) {
        if (token !== mobileCustomersToken) return;
        els.mobileCustomersList.innerHTML = `<div class="sale-entry-empty">Failed to load customers.</div>`;
    } finally {
        if (token === mobileCustomersToken) {
            mobileCustomersLoading = false;
        }
        restoreMobileScrollIfNeeded("customers");
    }
}

function updateMobileStockFilterNote() {
    if (!els.mobileStockFilterNote) return;
    els.mobileStockFilterNote.classList.toggle("hidden", !mobileStockLowOnly);
    if (els.mobileStockFilterClear) {
        els.mobileStockFilterClear.disabled = !mobileStockLowOnly;
    }
}

function openTodaySalesFromReports() {
    if (!canViewMobileSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    mobileSalesFilter = "today";
    if (els.mobileSalesFilter) els.mobileSalesFilter.value = "today";
    upsertMobileTabState("sales", { filter: mobileSalesFilter }, { preserveScroll: true });
    setMobileTab("sales");
    loadMobileSales();
}

function openWeekSalesFromReports() {
    if (!canViewMobileSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    mobileSalesFilter = "7d";
    if (els.mobileSalesFilter) els.mobileSalesFilter.value = "7d";
    upsertMobileTabState("sales", { filter: mobileSalesFilter }, { preserveScroll: true });
    setMobileTab("sales");
    loadMobileSales();
}

function openPendingOrdersFromReports() {
    if (!canManageCustomerOrders()) {
        toast("Orders are not available for your role.", "error");
        return;
    }
    openCustomerOrdersModal({ statusList: PENDING_ORDER_STATUSES });
    toast("Showing pending orders across multiple statuses.", "info");
}

function openLowStockFromReports() {
    if (!canViewStock()) {
        toast("Stock is not available for your role.", "error");
        return;
    }
    mobileStockLowOnly = true;
    mobileStockQuery = "";
    if (els.mobileStockSearch) {
        els.mobileStockSearch.value = "";
    }
    if (els.mobileStockCategoryChips) {
        mobileStockCategory = "all";
        els.mobileStockCategoryChips.querySelectorAll(".mobile-category-chip").forEach((chip) => {
            chip.classList.toggle("active", chip.dataset.category === "all");
        });
    }
    upsertMobileTabState("stock", {
        query: mobileStockQuery,
        category: mobileStockCategory,
        lowOnly: mobileStockLowOnly,
    }, { preserveScroll: true });
    setMobileTab("stock");
    loadMobileStock({ query: "" });
}

function openTopProductFromReports(product) {
    if (!product) return;
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    const query = (product.product_name || "").trim();
    if (!query) return;
    if (els.productSearch) {
        els.productSearch.value = query;
    }
    upsertMobileTabState("products", {
        query,
        category: mobileActiveCategory || "all",
    }, { preserveScroll: true });
    setMobileTab("products");
    updateSearchResults({ forceOpen: true });
    focusSearchInput();
}

async function loadMobileReports() {
    if (!isMobileLayout()) return;
    if (!els.mobileReportsTopProducts) return;
    if (!API_TOKEN || !currentUser) {
        if (els.mobileReportsContent) els.mobileReportsContent.classList.add("hidden");
        if (els.mobileReportsError) {
            els.mobileReportsError.classList.remove("hidden");
            els.mobileReportsError.querySelector("div").textContent = "Log in to view reports.";
        }
        restoreMobileScrollIfNeeded("reports");
        return;
    }
    if (!canViewReports()) {
        if (els.mobileReportsContent) els.mobileReportsContent.classList.add("hidden");
        if (els.mobileReportsError) {
            els.mobileReportsError.classList.remove("hidden");
            els.mobileReportsError.querySelector("div").textContent = "Reports are not available for your role.";
        }
        restoreMobileScrollIfNeeded("reports");
        return;
    }
    if (els.mobileReportsError) {
        els.mobileReportsError.classList.add("hidden");
    }
    if (els.mobileReportsContent) {
        els.mobileReportsContent.classList.remove("hidden");
    }
    if (els.mobileReportsEmpty) {
        els.mobileReportsEmpty.classList.add("hidden");
    }
    if (els.mobileReportsTodaySales) els.mobileReportsTodaySales.textContent = "Loading...";
    if (els.mobileReportsWeekSales) els.mobileReportsWeekSales.textContent = "Loading...";
    if (els.mobileReportsPendingOrders) els.mobileReportsPendingOrders.textContent = "—";
    if (els.mobileReportsLowStock) els.mobileReportsLowStock.textContent = "—";
    if (els.mobileReportsTopProducts) {
        els.mobileReportsTopProducts.innerHTML = `<div class="sale-entry-empty">Loading top products...</div>`;
    }

    const endpoint = "/reports/dashboard/";
    let summary = null;
    try {
        const requestReports = async (authHeader = true) => {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "GET",
                headers: authHeader && API_TOKEN ? { Authorization: `Token ${API_TOKEN}` } : {},
                credentials: "same-origin",
            });
            const contentType = res.headers.get("content-type") || "";
            const rawBody = contentType.includes("application/json") ? await res.json() : await res.text();
            return { res, rawBody };
        };

        let { res, rawBody } = await requestReports(true);
        if (!res.ok && API_TOKEN && (res.status === 401 || res.status === 403)) {
            console.warn("[mobile-reports] retrying without token header", {
                endpoint,
                status: res.status,
            });
            ({ res, rawBody } = await requestReports(false));
        }

        if (!res.ok) {
            console.error("[mobile-reports] request failed", {
                endpoint,
                status: res.status,
                body: rawBody,
            });
            const message = res.status === 401
                ? "Log in to view reports."
                : res.status === 403
                    ? "Reports are not available for your role."
                    : "Unable to load reports.";
            if (els.mobileReportsContent) els.mobileReportsContent.classList.add("hidden");
            if (els.mobileReportsError) {
                els.mobileReportsError.classList.remove("hidden");
                els.mobileReportsError.querySelector("div").textContent = message;
            }
            restoreMobileScrollIfNeeded("reports");
            return;
        }
        summary = rawBody;
        console.debug("[mobile-reports] response ok", {
            endpoint,
            status: res.status,
            payload: summary,
        });
    } catch (err) {
        console.error("[mobile-reports] unexpected error", { endpoint, error: err });
        if (els.mobileReportsContent) els.mobileReportsContent.classList.add("hidden");
        if (els.mobileReportsError) {
            els.mobileReportsError.classList.remove("hidden");
            els.mobileReportsError.querySelector("div").textContent = "Unable to load reports.";
        }
        restoreMobileScrollIfNeeded("reports");
        return;
    }

    mobileReportsSummary = summary;
    mobileReportsTopProducts = ensureArray(summary.top_products, "mobileReportsTopProducts");

    if (els.mobileReportsTodaySales) {
        els.mobileReportsTodaySales.textContent = fmtPrice(summary.today_sales || 0);
    }
    if (els.mobileReportsWeekSales) {
        els.mobileReportsWeekSales.textContent = fmtPrice(summary.week_sales || 0);
    }
    if (els.mobileReportsPendingOrders) {
        const count = summary.pending_orders_count ?? 0;
        els.mobileReportsPendingOrders.textContent = count.toLocaleString("en-KE");
    }
    if (els.mobileReportsLowStock) {
        const count = summary.low_stock_count ?? 0;
        els.mobileReportsLowStock.textContent = count.toLocaleString("en-KE");
    }

    if (!mobileReportsTopProducts.length) {
        if (els.mobileReportsTopProducts) {
            els.mobileReportsTopProducts.innerHTML = `<div class="sale-entry-empty">No top products yet.</div>`;
        }
        if (els.mobileReportsEmpty) {
            els.mobileReportsEmpty.classList.remove("hidden");
        }
        restoreMobileScrollIfNeeded("reports");
        return;
    }

    if (els.mobileReportsTopProducts) {
        els.mobileReportsTopProducts.innerHTML = mobileReportsTopProducts.map(item => `
            <div class="mobile-report-item" data-report-product="${esc(item.product_id || "")}">
                <div class="report-meta">
                    <strong>${esc(item.product_name || "—")}</strong>
                    <span>${item.total_quantity || 0} sold</span>
                </div>
                <div class="report-value">${fmtPrice(item.total_revenue || 0)}</div>
            </div>
        `).join("");
    }
    restoreMobileScrollIfNeeded("reports");
}

async function openMobileCustomerDetail(customerId) {
    if (!customerId) return;
    if (!canViewCustomers()) {
        toast("Customers are not available for your role.", "error");
        return;
    }
    currentMobileCustomerId = customerId;
    updateMobileCallAction("");
    updateMobileWhatsappAction("");
    if (els.mobileCustomerDetailBody) {
        els.mobileCustomerDetailBody.innerHTML = `<div class="sale-entry-empty">Loading customer…</div>`;
    }
    openOverlay(els.mobileCustomerDetailModal);

    const customer = mobileCustomers.find(c => c.id === customerId) || {};
    const customerName = customer.name || "—";
    const routeName = customer.route_name || "—";
    const branchName = customer.branch_name || "—";
    const phone = customer.phone || customer.phone_number || customer.contact_phone || "";
    updateMobileCallAction(phone);
    updateMobileWhatsappAction(phone);
    if (els.mobileCustomerPaymentBtn) {
        els.mobileCustomerPaymentBtn.disabled = !canRecordCustomerPayment();
        els.mobileCustomerPaymentBtn.classList.toggle("btn-disabled", !canRecordCustomerPayment());
    }

    const creditSummary = await apiFetch(`/sales/credit/customer/${customerId}/summary/`);
    const outstanding = creditSummary ? fmtPrice(creditSummary.total_outstanding || 0) : "—";
    const openCount = creditSummary ? creditSummary.open_count || 0 : 0;

    const ordersData = await apiFetch(withParams("/sales/customer-orders/", { customer: customerId, limit: 5 }));
    const ordersPage = normalizePaginated(ordersData);
    const orders = ensureArray(ordersPage.results, "mobileCustomerOrders");

    const ordersHtml = orders.length ? orders.map((order) => {
        const sale = order.sale || {};
        const total = sale.grand_total ? fmtPrice(sale.grand_total) : "—";
        const status = formatLabel(order.status || "—");
        const date = formatDateTime(order.created_at);
        return `
            <div class="mobile-customer-order">
                <div class="order-meta">
                    <span>#${shortOrderId(order.id)}</span>
                    <span>${date}</span>
                </div>
                <div class="order-meta">
                    <span>${status}</span>
                    <span>${total}</span>
                </div>
            </div>
        `;
    }).join("") : `<div class="sale-entry-empty">No recent orders.</div>`;

    const statementData = await apiFetch(withParams(`/sales/credit/customer/${customerId}/statement/`, { limit: 8 }));
    const statementPage = normalizePaginated(statementData);
    const statementItems = ensureArray(statementPage.results, "mobileStatement");
    const statementHtml = statementItems.length ? statementItems.map((entry) => {
        const direction = entry.direction || "debit";
        const signed = direction === "credit" ? "-" : "+";
        const amount = `${signed}${fmtPrice(entry.amount || 0)}`;
        const label = entry.entry_type === "payment" ? "Payment" : "Credit Sale";
        const date = formatDateTime(entry.date);
        return `
            <div class="mobile-statement-item">
                <div class="mobile-statement-meta">
                    <span>${label}</span>
                    <span>${date}</span>
                </div>
                <div class="mobile-statement-meta">
                    <span>${entry.reference ? `Ref ${shortOrderId(entry.reference)}` : "—"}</span>
                    <span class="mobile-statement-amount ${direction}">${amount}</span>
                </div>
            </div>
        `;
    }).join("") : `<div class="sale-entry-empty">No statement entries.</div>`;

    if (els.mobileCustomerDetailBody) {
        els.mobileCustomerDetailBody.innerHTML = `
            <div class="mobile-customer-header">
                <strong>${esc(customerName)}</strong>
                <div class="mobile-customer-meta">
                    <div><span>Route</span> ${esc(routeName)}</div>
                    <div><span>Branch</span> ${esc(branchName)}</div>
                </div>
            </div>
            <div class="mobile-customer-section">
                <strong>Outstanding Credit</strong>
                <div class="mobile-customer-meta">
                    <div><span>Balance Due</span> ${outstanding}</div>
                    <div><span>Open Credit Sales</span> ${openCount}</div>
                </div>
            </div>
            <div class="mobile-customer-section">
                <strong>Recent Orders</strong>
                <div class="mobile-customer-orders">
                    ${ordersHtml}
                </div>
            </div>
            <div class="mobile-customer-section">
                <strong>Statement</strong>
                <div class="mobile-statement-list">
                    ${statementHtml}
                </div>
            </div>
        `;
    }
}

function openMobileCustomerModal() {
    if (!els.mobileCustomerModal) return;
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    if (!canCreateCustomer()) {
        toast("Only supervisors or admins can create customers.", "error");
        return;
    }
    if (els.mobileCustomerError) els.mobileCustomerError.textContent = "";
    if (els.mobileCustomerName) els.mobileCustomerName.value = "";
    openOverlay(els.mobileCustomerModal, { closeOthers: false });
    requestAnimationFrame(() => {
        els.mobileCustomerName?.focus();
    });
}

function closeMobileCustomerModal() {
    closeOverlay(els.mobileCustomerModal);
}

async function submitMobileCustomer() {
    if (mobileCustomerCreating) return;
    if (!canCreateCustomer()) {
        toast("Only supervisors or admins can create customers.", "error");
        return;
    }
    const name = (els.mobileCustomerName?.value || "").trim();
    if (!name) {
        if (els.mobileCustomerError) els.mobileCustomerError.textContent = "Name is required.";
        return;
    }
    mobileCustomerCreating = true;
    if (els.mobileCustomerError) els.mobileCustomerError.textContent = "";
    if (els.mobileCustomerSubmit) {
        els.mobileCustomerSubmit.disabled = true;
        els.mobileCustomerSubmit.textContent = "Creating...";
    }
    try {
        const res = await apiRequest("/customers/create/", {
            method: "POST",
            body: { name },
        });
        const id = res?.id;
        if (!id) throw new Error("Customer creation failed");
        const newCustomer = { id, name };
        customers = [newCustomer, ...customers];
        renderCustomerOptions();
        if (els.customerSelect) els.customerSelect.value = id;
        if (els.mobileCustomerSelect) els.mobileCustomerSelect.value = id;
        updateMobileCustomerLabel();
        toast("Customer created", "success");
        closeMobileCustomerModal();
    } catch (err) {
        const msg = err.message || "Unable to create customer.";
        if (els.mobileCustomerError) els.mobileCustomerError.textContent = msg;
        toast(msg, "error");
    } finally {
        mobileCustomerCreating = false;
        if (els.mobileCustomerSubmit) {
            els.mobileCustomerSubmit.disabled = false;
            els.mobileCustomerSubmit.textContent = "Create Customer";
        }
    }
}

function openMobileSuccessModal() {
    if (!els.mobileSuccessModal) return;
    openOverlay(els.mobileSuccessModal, { closeOthers: false });
}

function closeMobileSuccessModal() {
    closeOverlay(els.mobileSuccessModal);
}

async function showMobileSuccess(saleId) {
    if (!saleId || !els.mobileSuccessBody) return;
    lastMobileSaleId = saleId;
    let sale = null;
    let mode = getPrintMode();
    try {
        sale = await apiFetch(`/sales/${saleId}/`);
    } catch (err) {
        console.warn("[receipt] showMobileSuccess sale fetch failed", err);
        toast(`Could not load sale details: ${err.message}`, "warning");
    }
    try {
        if (sale) {
            lastCompletedSale = sale;
            currentReceiptSaleId = saleId;
            currentReceiptPayload = buildReceiptPayload(sale);
        }
    } catch (err) {
        console.warn("[receipt] buildReceiptPayload error", err);
        toast(`Receipt preview unavailable: ${err.message}`, "warning");
        currentReceiptPayload = null;
    }
    const customerName = sale?.customer ? getCustomerName(sale.customer) : "—";
    const method = sale?.payment_mode ? formatPaymentMode(sale.payment_mode) : "Cash";
    const total = sale?.grand_total ?? "0.00";
    const saleNumber = shortOrderId(saleId);
    mode = getPrintMode();
    els.mobileSuccessBody.innerHTML = `
        <div><strong>Sale #${saleNumber}</strong></div>
        <div>Customer: <strong>${esc(customerName)}</strong></div>
        <div>Total: <strong>${fmtPrice(total)}</strong></div>
        <div>Payment: <strong>${esc(method)}</strong></div>
        <div class="success-debug-marker">SUCCESS MODAL BUILD 2026-04-29.13</div>
        <div class="success-debug-meta">print mode: ${esc(mode)}</div>
    `;
    openMobileSuccessModal();
    syncPrintModeControl();
    syncMobileSuccessActionUi();
    syncReceiptActionUi();
    console.info("[receipt] success modal opened", {
        saleId,
        mode,
        hasReceiptPayload: Boolean(currentReceiptPayload),
        androidButtonRendered: mode === "android",
    });
    if (window.debugReceiptDom) window.debugReceiptDom();
}

function mobileNewSale() {
    closeMobileSuccessModal();
    resetMpesaPending();
    clearCart({ skipServer: true });
    currentSaleId = null;
    currentSaleType = "retail";
    if (els.saleTypeSelect) {
        els.saleTypeSelect.value = "retail";
    }
    if (els.creditToggle) {
        els.creditToggle.checked = false;
    }
    handleCreditToggle(true);
    repriceTimer && clearTimeout(repriceTimer);
    loadProducts();
    loadHeldSales();
    setMobileTab("products");
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

// ——— Offline Support ———
function canUseOfflineStore() {
    return typeof indexedDB !== "undefined";
}

function openOfflineDB() {
    if (!canUseOfflineStore()) return Promise.reject(new Error("IndexedDB unavailable"));
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(OFFLINE_CACHE_STORE)) {
                db.createObjectStore(OFFLINE_CACHE_STORE, { keyPath: "key" });
            }
            if (!db.objectStoreNames.contains(OFFLINE_DRAFT_STORE)) {
                const store = db.createObjectStore(OFFLINE_DRAFT_STORE, { keyPath: "local_id" });
                store.createIndex("status", "status", { unique: false });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(storeName, key) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function idbPut(storeName, value) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGetAll(storeName) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function idbDelete(storeName, key) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

async function cacheOfflineData(key, data) {
    if (!canUseOfflineStore()) return;
    try {
        await idbPut(OFFLINE_CACHE_STORE, {
            key,
            data,
            updated_at: new Date().toISOString(),
        });
    } catch (err) {
        console.warn("Offline cache write failed:", err);
    }
}

async function readOfflineCache(key) {
    if (!canUseOfflineStore()) return null;
    try {
        const entry = await idbGet(OFFLINE_CACHE_STORE, key);
        return entry?.data || null;
    } catch (err) {
        console.warn("Offline cache read failed:", err);
        return null;
    }
}

function setOfflineMode(value) {
    offlineMode = value;
    document.body.classList.toggle("offline", offlineMode);
    updateOfflineStatusUI();
}

async function updateOfflineStatusUI() {
    if (!els.offlineStatus) return;
    let pendingCount = 0;
    if (canUseOfflineStore()) {
        try {
            const drafts = await idbGetAll(OFFLINE_DRAFT_STORE);
            pendingCount = drafts.filter(d => d.status !== "synced").length;
        } catch (err) {
            console.warn("Unable to read offline drafts:", err);
        }
    }
    offlineDraftCount = pendingCount;
    const shouldShow = offlineMode || pendingCount > 0;
    els.offlineStatus.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;

    let message = "Offline mode: drafts saved locally.";
    if (!offlineMode && pendingCount > 0) {
        message = `Drafts pending sync.`;
    }
    if (offlineMode && pendingCount > 0) {
        message = `Offline: ${pendingCount} draft${pendingCount === 1 ? "" : "s"} saved locally.`;
    }
    if (offlineSyncing) {
        message = offlineSyncBackground ? "Syncing in background..." : "Syncing drafts...";
    }

    if (els.offlineStatusText) els.offlineStatusText.textContent = message;
    if (els.offlineSyncCount) {
        els.offlineSyncCount.textContent = pendingCount > 0 ? `${pendingCount} pending` : "";
    }
    if (els.offlineSyncBtn) {
        const canSync = navigator.onLine && pendingCount > 0 && !offlineSyncing;
        els.offlineSyncBtn.classList.toggle("hidden", !canSync);
    }
}

function renderOfflineDraftStatus(status) {
    const normalized = (status || "draft_offline").toLowerCase();
    const labelMap = {
        draft_offline: "Draft (offline)",
        queued: "Queued",
        syncing: "Syncing",
        failed: "Failed",
        synced: "Synced",
    };
    const label = labelMap[normalized] || "Draft";
    return `<span class="status-badge status-draft status-draft-${normalized}">${label}</span>`;
}

function buildSyncErrorMeta(err) {
    const raw = err?.message || err?.detail || err || "";
    let parsed = null;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            parsed = null;
        }
    } else if (typeof raw === "object") {
        parsed = raw;
    }
    const rawText = typeof raw === "string" ? raw : JSON.stringify(raw);
    const text = rawText.toLowerCase();

    const meta = {
        category: "unknown",
        message: "Sync failed. Review the draft and retry.",
        detail: rawText,
        product_ids: [],
        skus: [],
    };

    if (text.includes("unauthorized") || text.includes("forbidden") || text.includes("permission")) {
        meta.category = "auth";
        meta.message = "Session expired or permission denied. Log in and retry.";
        return meta;
    }
    if (text.includes("stock") || text.includes("insufficient") || text.includes("out of stock")) {
        meta.category = "stock";
        meta.message = "Stock changed while offline. Please review quantities.";
    } else if (text.includes("product") && (text.includes("not found") || text.includes("does not exist") || text.includes("missing"))) {
        meta.category = "product";
        meta.message = "Some products are missing or inactive. Review items.";
    } else if (text.includes("price") || text.includes("pricing") || text.includes("wholesale")) {
        meta.category = "price";
        meta.message = "Prices or pricing rules changed. Review line items.";
    }

    if (parsed && typeof parsed === "object") {
        const detail = parsed.detail || parsed.items || parsed.non_field_errors || parsed.error || null;
        if (detail) {
            meta.detail = typeof detail === "string" ? detail : JSON.stringify(detail);
        }
        if (parsed.items && Array.isArray(parsed.items)) {
            meta.product_ids = parsed.items.map(i => i.product || i.product_id).filter(Boolean);
            meta.skus = parsed.items.map(i => i.sku).filter(Boolean);
        }
    }

    return meta;
}

function renderDraftError(meta, fallback) {
    if (!meta && !fallback) return "";
    const message = meta?.message || fallback || "Sync failed.";
    const detail = meta?.detail && meta?.detail !== message ? meta.detail : "";
    const labelMap = {
        stock: "Stock",
        product: "Product",
        price: "Pricing",
        auth: "Auth",
        unknown: "Error",
    };
    const label = labelMap[meta?.category || "unknown"] || "Error";
    return `
        <div class="draft-error">
            <span class="error-label">${label}</span>
            <span class="error-text">${esc(message)}</span>
            ${detail ? `<div class="error-detail">${esc(detail)}</div>` : ""}
        </div>
    `;
}

async function renderOfflineDraftsList() {
    if (!els.offlineDraftsList) return;
    if (els.offlineDraftsSync) {
        els.offlineDraftsSync.disabled = !navigator.onLine || !API_TOKEN;
    }
    let drafts = [];
    try {
        drafts = await idbGetAll(OFFLINE_DRAFT_STORE);
    } catch (err) {
        els.offlineDraftsList.innerHTML = `<div class="muted">Offline drafts unavailable.</div>`;
        return;
    }
    drafts.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
    if (!drafts.length) {
        els.offlineDraftsList.innerHTML = `<div class="muted">No offline drafts saved.</div>`;
        return;
    }
    els.offlineDraftsList.innerHTML = drafts.map(draft => {
        const customer = customers.find(c => c.id === draft.customer_id);
        const customerName = customer ? customer.name : (draft.customer_id ? "Customer" : "Walk-in");
        const total = fmtPrice(draft.snapshot?.total || 0);
        const created = formatDateTime(draft.created_at);
        const status = renderOfflineDraftStatus(draft.status);
        const errorMeta = draft.error_meta || null;
        const error = draft.error ? renderDraftError(errorMeta, draft.error) : "";
        const canRetry = ["failed", "queued", "draft_offline"].includes(draft.status);
        const canReopen = draft.status !== "synced";
        const retryLabel = draft.status === "syncing" ? "Retrying…" : "Retry";
        const resolveLabel = draft.status === "failed" ? "Resolve" : "Reopen";
        const retryDisabled = !canRetry || draft.status === "syncing";
        return `
            <div class="draft-item">
                <div class="draft-meta">
                    <div class="draft-title">${esc(customerName)} • ${total}</div>
                    <div class="draft-sub">${created}</div>
                </div>
                <div class="draft-status">
                    ${status}
                    ${error}
                </div>
                <div class="draft-actions">
                    <button class="btn-secondary btn-xs" data-offline-draft-open="${draft.local_id}" ${canReopen ? "" : "disabled"}>${resolveLabel}</button>
                    <button class="btn-ghost btn-xs" data-offline-draft-sync="${draft.local_id}" ${retryDisabled ? "disabled" : ""}>${retryLabel}</button>
                    <button class="btn-ghost btn-xs" data-offline-draft-delete="${draft.local_id}">Delete</button>
                </div>
            </div>
        `;
    }).join("");
}

async function openOfflineDraftsModal() {
    if (!els.offlineDraftsModal) return;
    await renderOfflineDraftsList();
    openOverlay(els.offlineDraftsModal);
}

function closeOfflineDraftsModal() {
    if (!els.offlineDraftsModal) return;
    closeOverlay(els.offlineDraftsModal);
}

async function syncSingleDraft(localId) {
    if (!localId) return;
    if (offlineSyncing) {
        toast("Sync already in progress", "info");
        return;
    }
    if (!navigator.onLine) {
        toast("You are offline. Connect to sync.", "warning");
        setOfflineMode(true);
        return;
    }
    if (!API_TOKEN) {
        toast("Log in to sync drafts.", "warning");
        return;
    }
    let draft = null;
    try {
        draft = await idbGet(OFFLINE_DRAFT_STORE, localId);
    } catch (err) {
        toast("Unable to load draft", "error");
        return;
    }
    if (!draft) {
        toast("Draft not found", "error");
        return;
    }
    if (!draft.correlation_id || !isValidUuid(draft.correlation_id)) {
        const correlationId = generateUuid();
        draft = {
            ...draft,
            correlation_id: correlationId,
            payload: {
                ...(draft.payload || {}),
                correlation_id: correlationId,
            },
        };
        await idbPut(OFFLINE_DRAFT_STORE, draft);
    }
    const syncing = { ...draft, status: "syncing", updated_at: new Date().toISOString() };
    await idbPut(OFFLINE_DRAFT_STORE, syncing);
    offlineSyncing = true;
    offlineSyncBackground = false;
    await renderOfflineDraftsList();
    await updateOfflineStatusUI();
    try {
        const payload = {
            ...draft.payload,
            correlation_id: draft.correlation_id || draft.payload?.correlation_id || null,
        };
        let sale;
        if (draft.server_sale_id) {
            sale = await updateSale(draft.server_sale_id, payload);
        } else {
            sale = await createSale(payload);
        }
        const synced = {
            ...draft,
            status: "synced",
            updated_at: new Date().toISOString(),
            server_sale_id: sale?.id || draft.server_sale_id || null,
            error: "",
            error_meta: null,
        };
        await idbPut(OFFLINE_DRAFT_STORE, synced);
        toast("Draft synced", "success");
    } catch (err) {
        const meta = buildSyncErrorMeta(err);
        const failed = {
            ...draft,
            status: "failed",
            updated_at: new Date().toISOString(),
            error: meta.message || err?.message || "Sync failed",
            error_meta: meta,
        };
        await idbPut(OFFLINE_DRAFT_STORE, failed);
        toast(meta.message || "Draft sync failed", "error");
    }
    offlineSyncing = false;
    offlineSyncBackground = false;
    await renderOfflineDraftsList();
    await updateOfflineStatusUI();
}

async function ensureOfflineProductsLoaded() {
    if (allProducts.length) return true;
    const cached = await readOfflineCache("products");
    if (cached) {
        allProducts = cached;
        buildCategoryFilters();
        renderProducts();
        return true;
    }
    return false;
}

async function ensureOfflineCustomersLoaded() {
    if (customers.length) return true;
    const cached = await readOfflineCache("customers");
    if (cached) {
        customers = cached;
        els.customerSelect.innerHTML = customers.length
            ? customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
            : `<option value="">No customers found</option>`;
        return true;
    }
    return false;
}

async function ensureOfflineBranchesLoaded() {
    if (branches.length) return true;
    const cached = await readOfflineCache("branches");
    if (cached) {
        branches = cached;
        els.branchSelect.innerHTML = branches.length
            ? branches.map(b => `<option value="${b.id}">${b.name} — ${b.location}</option>`).join("")
            : `<option value="">No branches found</option>`;
        return true;
    }
    return false;
}

async function reopenOfflineDraft(localId) {
    if (!localId) return;
    let draft = null;
    try {
        draft = await idbGet(OFFLINE_DRAFT_STORE, localId);
    } catch (err) {
        toast("Unable to load draft", "error");
        return;
    }
    if (!draft) {
        toast("Draft not found", "error");
        return;
    }
    await ensureOfflineProductsLoaded();
    await ensureOfflineCustomersLoaded();
    await ensureOfflineBranchesLoaded();
    cart = [];
    let missingCount = 0;
    (draft.snapshot?.items || []).forEach(item => {
        const product = allProducts.find(p => p.id === item.product_id);
        if (!product) {
            missingCount += 1;
            return;
        }
        const unit = (product.units || []).find(u => u.id === item.unit_id) || getBaseUnit(product);
        const hasIssue = (draft.error_meta?.product_ids || []).includes(item.product_id)
            || (draft.error_meta?.skus || []).includes(item.sku);
        cart.push({
            product,
            unit,
            qty: item.quantity,
            unit_price_snapshot: item.unit_price,
            total_price_snapshot: item.line_total,
            offline_issue: hasIssue,
            offline_issue_reason: draft.error_meta?.message || "",
        });
    });
    if (missingCount) {
        toast(`${missingCount} items missing locally. Products list may be outdated.`, "warning");
    }
    currentSaleId = draft.server_sale_id || null;
    currentOfflineDraftId = draft.local_id;
    currentOfflineDraftCorrelationId = draft.correlation_id || draft.payload?.correlation_id || null;
    currentSaleType = draft.sale_type || "retail";
    if (els.saleTypeSelect) els.saleTypeSelect.value = currentSaleType;
    if (els.branchSelect && draft.branch_id) {
        els.branchSelect.value = draft.branch_id;
    }
    if (els.customerSelect && draft.customer_id) {
        els.customerSelect.value = draft.customer_id;
    }
    if (els.discountInput) els.discountInput.value = parseFloat(draft.payload?.discount || 0) || 0;
    if (els.amountPaid) els.amountPaid.value = parseFloat(draft.payload?.amount_paid || 0) || 0;
    amountPaidDirty = true;
    if (els.creditToggle) {
        els.creditToggle.checked = !!draft.is_credit_sale;
        handleCreditToggle(true);
    }
    if (els.assignedTo && draft.assigned_to) {
        els.assignedTo.value = draft.assigned_to;
    }
    if (els.dueDate && draft.due_date) {
        els.dueDate.value = draft.due_date;
    }
    renderCart();
    updateTotals();
    closeOfflineDraftsModal();
    toast("Draft loaded into sale entry", "success");
}

async function deleteOfflineDraft(localId) {
    if (!localId) return;
    const confirmed = confirm("Delete this local draft? This cannot be undone.");
    if (!confirmed) return;
    try {
        await idbDelete(OFFLINE_DRAFT_STORE, localId);
        if (currentOfflineDraftId === localId) {
            currentOfflineDraftId = null;
        }
        await renderOfflineDraftsList();
        await updateOfflineStatusUI();
    } catch (err) {
        toast("Unable to delete draft", "error");
    }
}

function isNetworkError(err) {
    if (!err) return false;
    if (!navigator.onLine) return true;
    const msg = (err.message || "").toLowerCase();
    return err.name === "TypeError" || msg.includes("failed to fetch") || msg.includes("network");
}

function generateUuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isValidUuid(value) {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildOfflineDraftSnapshot(payload) {
    const subtotal = parseCurrency(els.subtotal?.textContent || "0");
    const tax = parseCurrency(els.taxAmount?.textContent || "0");
    const discount = parseFloat(els.discountInput?.value || "0") || 0;
    const total = parseCurrency(els.grandTotal?.textContent || "0");
    const amountPaid = parseFloat(els.amountPaid?.value || "0") || 0;
    const items = cart.map(item => {
        const unitPrice = parseFloat(getItemUnitPrice(item)) || 0;
        const totalPrice = parseFloat(getItemLineTotal(item, unitPrice)) || 0;
        return {
            product_id: item.product.id,
            product_name: item.product.name,
            sku: item.product.sku || "",
            unit_id: item.unit?.id || null,
            unit_code: item.unit?.unit_code || item.unit?.unit_name || "",
            quantity: item.qty,
            unit_price: unitPrice,
            line_total: totalPrice,
        };
    });
    return {
        payload,
        snapshot: {
            subtotal,
            tax,
            discount,
            total,
            amount_paid: amountPaid,
            items,
        },
    };
}

async function saveOfflineDraft({ reason = "", forceNew = false } = {}) {
    if (!canUseOfflineStore()) {
        toast("Offline drafts not supported in this browser", "error");
        return null;
    }
    const payload = buildPayload({ status: "draft" });
    const snapshot = buildOfflineDraftSnapshot(payload);
    const now = new Date().toISOString();
    let localId = !forceNew && currentOfflineDraftId ? currentOfflineDraftId : null;
    let existing = null;
    if (localId) {
        try {
            existing = await idbGet(OFFLINE_DRAFT_STORE, localId);
        } catch (err) {
            existing = null;
        }
    }
    let correlationId = existing?.correlation_id || currentOfflineDraftCorrelationId || null;
    if (!correlationId) {
        if (!localId || !isValidUuid(localId)) {
            localId = generateUuid();
        }
        correlationId = localId;
    }
    if (!localId) {
        localId = correlationId;
    }
    const draft = {
        local_id: localId,
        correlation_id: correlationId,
        status: offlineMode ? "draft_offline" : "queued",
        created_at: now,
        updated_at: now,
        branch_id: payload.branch || null,
        customer_id: payload.customer || null,
        sale_type: payload.sale_type || "retail",
        is_credit_sale: !!payload.is_credit_sale,
        assigned_to: payload.assigned_to || null,
        due_date: payload.due_date || null,
        payload: {
            ...payload,
            correlation_id: correlationId,
        },
        snapshot: snapshot.snapshot,
        server_sale_id: currentSaleId || null,
        error: reason ? String(reason) : "",
    };
    await idbPut(OFFLINE_DRAFT_STORE, draft);
    currentOfflineDraftId = localId;
    currentOfflineDraftCorrelationId = correlationId;
    await updateOfflineStatusUI();
    return draft;
}

async function syncOfflineDrafts({ manual = false } = {}) {
    if (!canUseOfflineStore()) return;
    if (offlineSyncing) return;
    if (!API_TOKEN) {
        if (manual) toast("Log in to sync drafts.", "warning");
        return;
    }
    if (!navigator.onLine) {
        if (manual) toast("You are offline. Connect to sync drafts.", "warning");
        setOfflineMode(true);
        return;
    }
    offlineSyncing = true;
    offlineSyncBackground = !manual;
    await updateOfflineStatusUI();
    let drafts = [];
    try {
        drafts = await idbGetAll(OFFLINE_DRAFT_STORE);
    } catch (err) {
        console.warn("Unable to load offline drafts:", err);
    }
    let failedCount = 0;
    for (const draft of drafts) {
        if (draft.status === "synced") continue;
        if (!draft.correlation_id || !isValidUuid(draft.correlation_id)) {
            const correlationId = generateUuid();
            draft.correlation_id = correlationId;
            draft.payload = { ...(draft.payload || {}), correlation_id: correlationId };
            await idbPut(OFFLINE_DRAFT_STORE, draft);
        }
        const updating = { ...draft, status: "syncing", updated_at: new Date().toISOString() };
        await idbPut(OFFLINE_DRAFT_STORE, updating);
        try {
            const payload = {
                ...draft.payload,
                correlation_id: draft.correlation_id || draft.payload?.correlation_id || null,
            };
            let sale;
            if (draft.server_sale_id) {
                sale = await updateSale(draft.server_sale_id, payload);
            } else {
                sale = await createSale(payload);
            }
            const synced = {
                ...draft,
                status: "synced",
                updated_at: new Date().toISOString(),
                server_sale_id: sale?.id || draft.server_sale_id || null,
                error: "",
                error_meta: null,
            };
            await idbPut(OFFLINE_DRAFT_STORE, synced);
        } catch (err) {
            const meta = buildSyncErrorMeta(err);
            const failed = {
                ...draft,
                status: "failed",
                updated_at: new Date().toISOString(),
                error: meta.message || err?.message || "Sync failed",
                error_meta: meta,
            };
            await idbPut(OFFLINE_DRAFT_STORE, failed);
            failedCount += 1;
        }
    }
    offlineSyncing = false;
    offlineSyncBackground = false;
    await updateOfflineStatusUI();
    if (els.offlineDraftsModal && !els.offlineDraftsModal.classList.contains("hidden")) {
        await renderOfflineDraftsList();
    }
    if (manual) {
        toast("Draft sync complete", "success");
    } else if (failedCount > 0) {
        toast("Some drafts failed to sync. Review in Drafts.", "warning");
    }
}

function initOfflineSupport() {
    if (!canUseOfflineStore()) return;
    if (!navigator.onLine) {
        setOfflineMode(true);
    }
    window.addEventListener("online", () => {
        setOfflineMode(false);
        syncOfflineDrafts();
        startBackgroundDraftSync();
    });
    window.addEventListener("offline", () => {
        setOfflineMode(true);
        stopBackgroundDraftSync();
    });
    if (els.offlineSyncBtn) {
        els.offlineSyncBtn.addEventListener("click", () => {
            syncOfflineDrafts({ manual: true });
        });
    }
    updateOfflineStatusUI();
    if (navigator.onLine) {
        startBackgroundDraftSync();
    }
}

async function hasPendingOfflineDrafts() {
    if (!canUseOfflineStore()) return false;
    try {
        const drafts = await idbGetAll(OFFLINE_DRAFT_STORE);
        return drafts.some(d => d.status !== "synced");
    } catch (err) {
        return false;
    }
}

function startBackgroundDraftSync() {
    if (offlineSyncTimer) return;
    if (!navigator.onLine) return;
    if (!API_TOKEN) return;
    offlineSyncTimer = setInterval(async () => {
        if (!navigator.onLine) return;
        if (offlineSyncing) return;
        const hasPending = await hasPendingOfflineDrafts();
        if (!hasPending) {
            stopBackgroundDraftSync();
            return;
        }
        syncOfflineDrafts({ manual: false });
    }, 20000);
}

function stopBackgroundDraftSync() {
    if (!offlineSyncTimer) return;
    clearInterval(offlineSyncTimer);
    offlineSyncTimer = null;
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

function ensureArray(value, label = "list") {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.results)) return value.results;
    if (value !== null && value !== undefined) {
        console.warn(`[ensureArray] Unexpected ${label} shape`, value);
    }
    return [];
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

async function apiFetchAll(endpoint, { limit = BULK_FETCH_LIMIT } = {}) {
    let results = [];
    let nextEndpoint = withParams(endpoint, { limit, offset: 0 });
    while (nextEndpoint) {
        const data = await apiFetch(nextEndpoint);
        if (!data) return [];
        if (Array.isArray(data)) return data;
        const page = normalizePaginated(data);
        const pageResults = ensureArray(page, "paginated_results");
        results = results.concat(pageResults);
        if (page.next) {
            nextEndpoint = normalizeApiEndpoint(page.next);
            continue;
        }
        if (pageResults.length === 0 || results.length >= page.count) break;
        nextEndpoint = withParams(endpoint, { limit, offset: results.length });
    }
    return ensureArray(results, "apiFetchAll_results");
}

async function downloadCsv(endpoint, filename, params = {}) {
    try {
        const url = withParams(endpoint, params);
        const res = await fetch(`${API_BASE}${url}`, {
            method: "GET",
            headers: API_TOKEN ? { Authorization: `Token ${API_TOKEN}` } : {},
            credentials: "same-origin",
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(errText || `Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const link = document.createElement("a");
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    } catch (err) {
        console.error("CSV export failed", err);
        toast(`Export failed: ${err.message}`, "error");
    }
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

async function loadBranches() {
    const data = await apiFetch("/business/branches/");
    if (data && Array.isArray(data)) {
        branches = data;
        cacheOfflineData("branches", branches);
    } else if (!navigator.onLine) {
        const cached = await readOfflineCache("branches");
        if (cached) {
            branches = cached;
            setOfflineMode(true);
        } else {
            branches = [];
        }
    } else {
        branches = [];
    }
    els.branchSelect.innerHTML = branches.length
        ? branches.map(b => `<option value="${b.id}">${b.name} — ${b.location}</option>`).join("")
        : `<option value="">No branches found</option>`;
    if (heldSalesCache.length) renderHeldSales(heldSalesCache);
    renderExpenseBranchOptions();
}

async function loadCustomers() {
    const data = await apiFetchAll("/customers/");
    const list = ensureArray(data, "customers");
    if (list.length) {
        customers = list;
        cacheOfflineData("customers", customers);
    } else if (!navigator.onLine) {
        const cached = await readOfflineCache("customers");
        if (cached) {
            customers = cached;
            setOfflineMode(true);
        } else {
            customers = [];
        }
    } else {
        customers = list;
    }
    renderCustomerOptions();
    if (heldSalesCache.length) renderHeldSales(heldSalesCache);
    renderLedgerCustomerOptions();
}

function renderCustomerOptions() {
    if (!els.customerSelect) return;
    els.customerSelect.innerHTML = customers.length
        ? customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
        : `<option value="">No customers found</option>`;
    if (els.mobileCustomerSelect) {
        els.mobileCustomerSelect.innerHTML = customers.length
            ? customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")
            : `<option value="">No customers found</option>`;
    }
    updateMobileCustomerLabel();
}

function updateMobileCustomerLabel() {
    if (!els.mobileCustomerCurrent) return;
    const selectedId = els.mobileCustomerSelect?.value || els.customerSelect?.value;
    const selected = customers.find(c => c.id === selectedId);
    els.mobileCustomerCurrent.textContent = selected ? selected.name : "—";
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
    if (els.performanceBranch) {
        const options = [`<option value="">All branches</option>`]
            .concat(branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`));
        els.performanceBranch.innerHTML = options.join("");
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
    if (!els.assignedTo || !canAssignCustomerOrders()) return;
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
    const branchId = els.branchSelect?.value || "";
    const endpoint = withParams("/inventory/products/", { branch: branchId });
    const products = await apiFetchAll(endpoint);
    const list = ensureArray(products, "allProducts");
    if (list.length) {
        allProducts = list;
        cacheOfflineData("products", allProducts);
    } else if (!navigator.onLine) {
        const cached = await readOfflineCache("products");
        if (cached) {
            allProducts = cached;
            setOfflineMode(true);
        } else {
            allProducts = [];
        }
    } else {
        allProducts = list;
    }
    buildCategoryFilters();
    renderProducts();
    if (isMobileLayout()) {
        renderMobileProducts();
    }
}

async function downloadProductTemplate() {
    if (!API_TOKEN) {
        toast("Please log in to download the template", "error");
        openAuthModal();
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/inventory/products/import-template/`, {
            headers: {
                Authorization: `Token ${API_TOKEN}`,
            },
            credentials: "same-origin",
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text || "Template download failed");
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "product-import-template.xlsx";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        toast(`Template download failed: ${err.message}`, "error");
    }
}

async function exportBackOfficeProductsExcel() {
    if (!API_TOKEN) {
        toast("Please log in to export products", "error");
        openAuthModal();
        return;
    }
    const params = {};
    const query = (backOfficeQuery || "").trim();
    if (query) {
        params.search = query;
    }
    const qs = withParams("/inventory/products/export/", params);
    const filename = `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    try {
        const res = await fetch(`${API_BASE}${qs}`, {
            headers: {
                Authorization: `Token ${API_TOKEN}`,
            },
            credentials: "same-origin",
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `Export failed (${res.status})`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
    } catch (err) {
        console.error("Product Excel export failed", err);
        toast(`Export failed: ${err.message}`, "error");
    }
}

async function uploadProductImport(file, { target } = {}) {
    if (!API_TOKEN) {
        toast("Please log in to import products", "error");
        openAuthModal();
        return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
        toast("Only .xlsx files are supported", "error");
        return;
    }
    const resultTarget = target === "backoffice" ? els.backofficeProductResult : els.productImportResult;
    if (resultTarget) {
        resultTarget.classList.remove("hidden");
        resultTarget.textContent = "Importing...";
    }
    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_BASE}/inventory/products/import/`, {
            method: "POST",
            headers: {
                Authorization: `Token ${API_TOKEN}`,
            },
            body: formData,
            credentials: "same-origin",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const message = data?.detail || "Import failed";
            throw new Error(message);
        }
        renderImportResult(data, resultTarget);
        await loadProducts();
        toast("Product import completed", "success");
    } catch (err) {
        if (resultTarget) {
            resultTarget.textContent = `Import failed: ${err.message}`;
        }
        toast(`Import failed: ${err.message}`, "error");
    } finally {
        if (els.productImportFile) {
            els.productImportFile.value = "";
        }
        if (els.backofficeProductFile) {
            els.backofficeProductFile.value = "";
        }
    }
}

function renderImportResult(result, targetEl = els.productImportResult) {
    if (!targetEl) return;
    const created = result?.created_count ?? 0;
    const updated = result?.updated_count ?? 0;
    const failed = result?.failed_count ?? 0;
    const errors = ensureArray(result?.errors, "importErrors");

    const summary = `
        <div class="import-summary">
            <span>Created: ${created}</span>
            <span>Updated: ${updated}</span>
            <span>Failed: ${failed}</span>
        </div>
    `;

    let errorList = "";
    if (errors.length) {
        errorList = `
            <div class="import-errors">
                ${errors.map(err => `
                    <div class="import-error-item">Row ${err.row} • ${err.field}: ${esc(err.error)}</div>
                `).join("")}
            </div>
        `;
    }

    targetEl.innerHTML = `${summary}${errorList}`;
    targetEl.classList.remove("hidden");
}

// ——— Back Office ———
function canAccessBackOffice() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function openBackOffice() {
    if (!canAccessBackOffice()) {
        toast("You do not have access to the Back Office", "error");
        return;
    }
    if (!els.backofficeModal) return;
    openOverlay(els.backofficeModal);
    setBackOfficeSection(backOfficeActiveSection || "products");
    loadBackOfficeProducts();
}

function closeBackOffice() {
    if (!els.backofficeModal) return;
    closeOverlay(els.backofficeModal);
}

function setBackOfficeSection(section) {
    backOfficeActiveSection = section || "products";
    if (els.backofficeTabs) {
        els.backofficeTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.section === backOfficeActiveSection));
    }
    if (els.backofficeProductSection) {
        els.backofficeProductSection.classList.toggle("hidden", backOfficeActiveSection !== "products");
    }
    if (els.backofficeSupplierSection) {
        els.backofficeSupplierSection.classList.toggle("hidden", backOfficeActiveSection !== "suppliers");
    }
    if (els.backofficePurchaseSection) {
        els.backofficePurchaseSection.classList.toggle("hidden", backOfficeActiveSection !== "purchases");
    }
    if (els.backofficeCustomerSection) {
        els.backofficeCustomerSection.classList.toggle("hidden", backOfficeActiveSection !== "customers");
    }
    if (els.backofficeStaffSection) {
        els.backofficeStaffSection.classList.toggle("hidden", backOfficeActiveSection !== "staff");
    }
    if (els.backofficeInventorySection) {
        els.backofficeInventorySection.classList.toggle("hidden", backOfficeActiveSection !== "inventory");
    }
    if (els.backofficeSalesSection) {
        els.backofficeSalesSection.classList.toggle("hidden", backOfficeActiveSection !== "sales");
    }
    if (els.backofficeOrdersSection) {
        els.backofficeOrdersSection.classList.toggle("hidden", backOfficeActiveSection !== "orders");
    }
    if (els.backofficeDeliverySection) {
        els.backofficeDeliverySection.classList.toggle("hidden", backOfficeActiveSection !== "delivery");
    }
    if (els.backofficePaymentsSection) {
        els.backofficePaymentsSection.classList.toggle("hidden", backOfficeActiveSection !== "payments");
    }
    if (els.backofficeReportsSection) {
        els.backofficeReportsSection.classList.toggle("hidden", backOfficeActiveSection !== "reports");
    }
    if (els.backofficeSetupSection) {
        els.backofficeSetupSection.classList.toggle("hidden", backOfficeActiveSection !== "setup");
    }
    if (backOfficeActiveSection === "customers") {
        loadBackOfficeCustomers();
    }
    if (backOfficeActiveSection === "suppliers") {
        loadBackOfficeSuppliers();
    }
    if (backOfficeActiveSection === "purchases") {
        setBackOfficePurchasesTab(backOfficePurchasesTab || "orders");
    }
    if (backOfficeActiveSection === "staff") {
        loadBackOfficeStaff();
    }
    if (backOfficeActiveSection === "inventory") {
        initInventoryAdjustments();
    }
    if (backOfficeActiveSection === "sales") {
        loadBackOfficeSales();
    }
    if (backOfficeActiveSection === "orders") {
        loadBackOfficeOrders();
    }
    if (backOfficeActiveSection === "delivery") {
        syncBackOfficeDeliveryModeUI();
        syncBackOfficeDeliveryScopeUI();
        loadBackOfficeDeliveryPanel();
    }
    if (backOfficeActiveSection === "payments") {
        loadBackOfficePayments();
    }
    if (backOfficeActiveSection === "reports") {
        loadBackOfficeReports();
    }
    if (backOfficeActiveSection === "setup") {
        setBackOfficeSetupSection(backOfficeSetupSection || "branches");
    }
}

function setBackOfficeDeliveryScope(scope) {
    const nextScope = scope === "all" ? "all" : "active";
    backOfficeDeliveryScope = nextScope;
    localStorage.setItem("backoffice_delivery_scope", nextScope);
    syncBackOfficeDeliveryScopeUI();
    backOfficeDeliveryOffset = 0;
    if (backOfficeDeliveryMode === "runs") {
        loadBackOfficeDeliveryRuns();
    }
}

function setBackOfficeDeliveryMode(mode) {
    const nextMode = mode === "runs" ? "runs" : "queue";
    backOfficeDeliveryMode = nextMode;
    localStorage.setItem("backoffice_delivery_mode", nextMode);
    syncBackOfficeDeliveryModeUI();
    backOfficeDeliveryOffset = 0;
    backOfficeDeliveryQueueOffset = 0;
    loadBackOfficeDeliveryPanel();
}

function syncBackOfficeDeliveryScopeUI() {
    if (els.backofficeDeliveryScopeActive) {
        els.backofficeDeliveryScopeActive.classList.toggle("active", backOfficeDeliveryScope === "active");
    }
    if (els.backofficeDeliveryScopeAll) {
        els.backofficeDeliveryScopeAll.classList.toggle("active", backOfficeDeliveryScope === "all");
    }
}

function syncBackOfficeDeliveryModeUI() {
    if (els.backofficeDeliveryModeQueue) {
        els.backofficeDeliveryModeQueue.classList.toggle("active", backOfficeDeliveryMode !== "runs");
    }
    if (els.backofficeDeliveryModeRuns) {
        els.backofficeDeliveryModeRuns.classList.toggle("active", backOfficeDeliveryMode === "runs");
    }
    if (els.backofficeDeliveryQueuePanel) {
        els.backofficeDeliveryQueuePanel.classList.toggle("hidden", backOfficeDeliveryMode === "runs");
    }
    if (els.backofficeDeliveryRunsPanel) {
        els.backofficeDeliveryRunsPanel.classList.toggle("hidden", backOfficeDeliveryMode !== "runs");
    }
    const scopeWrapper = els.backofficeDeliveryScopeActive?.closest(".backoffice-delivery-scope");
    if (scopeWrapper) {
        scopeWrapper.classList.toggle("hidden", backOfficeDeliveryMode !== "runs");
    }
    if (els.backofficeDeliveryStatus || els.backofficeDeliveryPerson || els.backofficeDeliveryBranch || els.backofficeDeliveryTable) {
        const runsHidden = backOfficeDeliveryMode !== "runs";
        [els.backofficeDeliveryStatus, els.backofficeDeliveryPerson, els.backofficeDeliveryBranch, els.backofficeDeliveryTable, els.backofficeDeliveryPrev, els.backofficeDeliveryNext, els.backofficeDeliveryPage]
            .forEach(el => {
                if (el && el.closest) {
                    const wrapper = el.closest(".backoffice-filters, .backoffice-table-wrap, .pagination-controls");
                    if (wrapper) wrapper.classList.toggle("hidden", runsHidden);
                }
            });
    }
}

async function loadBackOfficeDeliveryPanel() {
    if (backOfficeDeliveryMode === "runs") {
        await loadBackOfficeDeliveryRuns();
        return;
    }
    await loadBackOfficeDeliveryQueue();
}

function setBackOfficePurchasesTab(tab) {
    backOfficePurchasesTab = tab || "orders";
    if (els.backofficePurchasesTabs) {
        els.backofficePurchasesTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.purchasesTab === backOfficePurchasesTab));
    }
    if (els.backofficePurchasesOrders) {
        els.backofficePurchasesOrders.classList.toggle("hidden", backOfficePurchasesTab !== "orders");
    }
    if (els.backofficePurchasesBills) {
        els.backofficePurchasesBills.classList.toggle("hidden", backOfficePurchasesTab !== "bills");
    }
    if (backOfficePurchasesTab === "orders") {
        loadBackOfficePurchases();
    }
    if (backOfficePurchasesTab === "bills") {
        loadBackOfficeBills();
    }
}

function setBackOfficeSetupSection(section) {
    backOfficeSetupSection = section || "branches";
    if (els.backofficeSetupTabs) {
        els.backofficeSetupTabs.forEach(btn => btn.classList.toggle("active", btn.dataset.setup === backOfficeSetupSection));
    }
    if (els.setupBranchesSection) {
        els.setupBranchesSection.classList.toggle("hidden", backOfficeSetupSection !== "branches");
    }
    if (els.setupRoutesSection) {
        els.setupRoutesSection.classList.toggle("hidden", backOfficeSetupSection !== "routes");
    }
    if (els.setupCategoriesSection) {
        els.setupCategoriesSection.classList.toggle("hidden", backOfficeSetupSection !== "categories");
    }
    if (backOfficeSetupSection === "branches") {
        loadBackOfficeBranchesSetup();
    }
    if (backOfficeSetupSection === "routes") {
        loadBackOfficeRoutesSetup();
    }
    if (backOfficeSetupSection === "categories") {
        loadBackOfficeCategoriesSetup();
    }
}

async function loadBackOfficeProducts() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeCategories(),
            loadBackOfficeBranches(),
        ]);
        const products = await apiFetchAll("/inventory/products/");
        backOfficeProducts = ensureArray(products, "backOfficeProducts");
        renderBackOfficeProducts();
    } catch (err) {
        if (els.backofficeProductTable) {
            const tbody = els.backofficeProductTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8">Failed to load products</td></tr>`;
            }
        }
    }
}

async function loadBackOfficeCustomers() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeBranches(),
            loadBackOfficeRoutes(),
        ]);
        const endpoint = withParams("/customers/", {
            limit: backOfficeCustomerLimit,
            offset: backOfficeCustomerOffset,
            search: backOfficeCustomerQuery,
            branch: els.backofficeCustomerBranch?.value || "",
            route: els.backofficeCustomerRoute?.value || "",
            include_inactive: "1",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeCustomerPage = page;
        backOfficeCustomers = ensureArray(page, "backOfficeCustomers");
        renderBackOfficeCustomers();
        updatePager({
            prevEl: els.backofficeCustomerPrev,
            nextEl: els.backofficeCustomerNext,
            pageEl: els.backofficeCustomerPage,
            offset: backOfficeCustomerOffset,
            limit: backOfficeCustomerLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeCustomerTable) {
            const tbody = els.backofficeCustomerTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8">Failed to load customers</td></tr>`;
            }
        }
    }
}

async function loadBackOfficeSuppliers() {
    if (!canAccessBackOffice()) return;
    try {
        const endpoint = withParams("/suppliers/", {
            limit: backOfficeSupplierLimit,
            offset: backOfficeSupplierOffset,
            search: backOfficeSupplierQuery,
            include_inactive: "1",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeSupplierPage = page;
        backOfficeSuppliers = ensureArray(page, "backOfficeSuppliers");
        renderBackOfficeSuppliers();
        updatePager({
            prevEl: els.backofficeSupplierPrev,
            nextEl: els.backofficeSupplierNext,
            pageEl: els.backofficeSupplierPage,
            offset: backOfficeSupplierOffset,
            limit: backOfficeSupplierLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeSupplierTable) {
            const tbody = els.backofficeSupplierTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6">Failed to load suppliers</td></tr>`;
            }
        }
    }
}

async function loadSupplierOptionsForProductForm() {
    if (!canAccessBackOffice()) return;
    try {
        const endpoint = withParams("/suppliers/", {
            limit: 200,
            offset: 0,
            search: "",
            include_inactive: "1",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        supplierOptions = ensureArray(page, "supplierOptions");
        renderSupplierOptions();
    } catch (err) {
        supplierOptions = [];
        renderSupplierOptions();
    }
}

function renderSupplierOptions() {
    if (!supplierOptions.length) {
        if (els.productSupplierSelect) {
            els.productSupplierSelect.innerHTML = `<option value="">No suppliers found</option>`;
        }
    }
    const currentPurchaseSupplier = els.backofficePurchasesSupplier?.value || "";
    const currentBillsSupplier = els.backofficeBillsSupplier?.value || "";
    const currentPurchaseFormSupplier = els.purchaseSupplier?.value || "";
    const options = [
        `<option value="">Select supplier</option>`,
        ...supplierOptions.map(s => {
            const inactive = s.is_active === false ? " (Inactive)" : "";
            return `<option value="${s.id}">${esc(s.name)}${inactive}</option>`;
        }),
    ];
    if (els.productSupplierSelect) {
        els.productSupplierSelect.innerHTML = supplierOptions.length
            ? options.join("")
            : `<option value="">No suppliers found</option>`;
    }
    if (els.purchaseSupplier) {
        els.purchaseSupplier.innerHTML = supplierOptions.length
            ? options.join("")
            : `<option value="">No suppliers found</option>`;
        if (currentPurchaseFormSupplier) {
            els.purchaseSupplier.value = currentPurchaseFormSupplier;
        }
    }
    if (els.backofficePurchasesSupplier) {
        const filterOptions = [
            `<option value="">All suppliers</option>`,
            ...supplierOptions.map(s => `<option value="${s.id}">${esc(s.name)}</option>`),
        ];
        els.backofficePurchasesSupplier.innerHTML = supplierOptions.length
            ? filterOptions.join("")
            : `<option value="">All suppliers</option>`;
        if (currentPurchaseSupplier) {
            els.backofficePurchasesSupplier.value = currentPurchaseSupplier;
        }
    }

    if (els.backofficeBillsSupplier) {
        const filterOptions = [
            `<option value="">All suppliers</option>`,
            ...supplierOptions.map(s => `<option value="${s.id}">${esc(s.name)}</option>`),
        ];
        els.backofficeBillsSupplier.innerHTML = supplierOptions.length
            ? filterOptions.join("")
            : `<option value="">All suppliers</option>`;
        if (currentBillsSupplier) {
            els.backofficeBillsSupplier.value = currentBillsSupplier;
        }
    }
}

async function loadProductSupplierLinks(productId) {
    if (!productId) {
        productSupplierLinks = [];
        renderProductSupplierLinks();
        return;
    }
    const data = await apiFetch(`/inventory/products/${productId}/suppliers/`);
    productSupplierLinks = ensureArray(data, "productSupplierLinks");
    renderProductSupplierLinks();
}

function renderProductSupplierLinks() {
    if (!els.productSuppliersList) return;
    if (!editingProductId) {
        els.productSuppliersList.innerHTML = `<div class="muted">Save the product before linking suppliers.</div>`;
        if (els.productSupplierAdd) els.productSupplierAdd.disabled = true;
        return;
    }
    if (els.productSupplierAdd) els.productSupplierAdd.disabled = false;
    if (!productSupplierLinks.length) {
        els.productSuppliersList.innerHTML = `<div class="muted">No suppliers linked.</div>`;
        return;
    }
    els.productSuppliersList.innerHTML = productSupplierLinks.map(link => {
        const supplierName = link.supplier?.name || "Supplier";
        return `
            <div class="supplier-link-row" data-link-id="${link.id}">
                <div>
                    <strong>${esc(supplierName)}</strong>
                    <div class="muted">${link.supplier?.email || "—"}</div>
                </div>
                <div class="supplier-link-fields">
                    <input class="summary-input link-sku" placeholder="Supplier SKU" value="${esc(link.supplier_sku || "")}">
                    <input class="summary-input link-price" type="number" step="0.01" placeholder="Supplier price" value="${link.supplier_price ?? ""}">
                    <label class="checkbox-row">
                        <input type="checkbox" class="link-primary" ${link.is_primary ? "checked" : ""}>
                        Primary
                    </label>
                    <input class="summary-input link-notes" placeholder="Notes" value="${esc(link.notes || "")}">
                </div>
                <div class="supplier-link-actions">
                    <button class="btn-secondary btn-xs" data-link-action="save">Save</button>
                    <button class="btn-ghost btn-xs" data-link-action="remove">Unlink</button>
                </div>
            </div>
        `;
    }).join("");
}

async function linkSupplierToProduct() {
    if (!editingProductId) {
        toast("Save the product before linking suppliers.", "info");
        return;
    }
    const supplierId = els.productSupplierSelect?.value || "";
    if (!supplierId) {
        toast("Select a supplier first.", "error");
        return;
    }
    try {
        const isPrimary = productSupplierLinks.length === 0;
        await apiRequest(`/inventory/products/${editingProductId}/suppliers/link/`, {
            method: "POST",
            body: { supplier_id: supplierId, is_primary: isPrimary },
        });
        toast("Supplier linked", "success");
        await loadProductSupplierLinks(editingProductId);
    } catch (err) {
        toast(`Link failed: ${err.message}`, "error");
    }
}

async function saveProductSupplierLink(linkId, rowEl) {
    if (!editingProductId || !linkId || !rowEl) return;
    const payload = {
        supplier_sku: rowEl.querySelector(".link-sku")?.value || "",
        supplier_price: rowEl.querySelector(".link-price")?.value || "",
        is_primary: rowEl.querySelector(".link-primary")?.checked || false,
        notes: rowEl.querySelector(".link-notes")?.value || "",
    };
    try {
        await apiRequest(`/inventory/products/${editingProductId}/suppliers/${linkId}/`, {
            method: "PUT",
            body: payload,
        });
        toast("Supplier link updated", "success");
        await loadProductSupplierLinks(editingProductId);
    } catch (err) {
        toast(`Update failed: ${err.message}`, "error");
    }
}

// ——— Back Office Purchases ———
async function loadBackOfficePurchases() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeBranches(),
            loadSupplierOptionsForProductForm(),
        ]);
        const endpoint = withParams("/purchases/", {
            limit: backOfficePurchasesLimit,
            offset: backOfficePurchasesOffset,
            search: backOfficePurchasesQuery,
            status: els.backofficePurchasesStatus?.value || "",
            supplier: els.backofficePurchasesSupplier?.value || "",
            branch: els.backofficePurchasesBranch?.value || "",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficePurchasesPage = page;
        backOfficePurchases = ensureArray(page, "backOfficePurchases");
        renderBackOfficePurchases();
        updatePager({
            prevEl: els.backofficePurchasesPrev,
            nextEl: els.backofficePurchasesNext,
            pageEl: els.backofficePurchasesPage,
            offset: backOfficePurchasesOffset,
            limit: backOfficePurchasesLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficePurchasesTable) {
            const tbody = els.backofficePurchasesTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9">Failed to load purchase orders</td></tr>`;
            }
        }
    }
}

function renderBackOfficePurchases() {
    if (!els.backofficePurchasesTable) return;
    const tbody = els.backofficePurchasesTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficePurchases;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="9">No purchase orders found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(po => {
        const statusBadge = renderStatusBadge(po.status);
        const ordered = po.ordered_quantity ?? 0;
        const received = po.received_quantity ?? 0;
        const expected = po.expected_date ? formatShortDate(po.expected_date) : "—";
        const updated = po.updated_at ? formatDateTime(po.updated_at) : "—";
        const canReceive = ["ordered", "partial"].includes((po.status || "").toLowerCase());
        const canCancel = ["draft", "ordered"].includes((po.status || "").toLowerCase()) && received <= 0;
        const canCreateBill = (po.status || "").toLowerCase() === "received" && !po.bill_id;
        const hasBill = !!po.bill_id;
        const actionLabel = po.status === "draft" ? "Edit" : "View";
        return `
            <tr>
                <td>${esc(po.po_number || "—")}</td>
                <td>${esc(po.supplier?.name || "—")}</td>
                <td>${esc(po.branch?.name || "—")}</td>
                <td>${statusBadge}</td>
                <td>${ordered}</td>
                <td>${received}</td>
                <td>${expected}</td>
                <td>${updated}</td>
                <td>
                    <button class="btn-ghost btn-xs" onclick="openPurchaseForm('${po.id}')">${actionLabel}</button>
                    ${canReceive ? `<button class="btn-secondary btn-xs" onclick="openPurchaseReceiveModal('${po.id}')">Receive</button>` : ""}
                    ${canCancel ? `<button class="btn-danger btn-xs" onclick="cancelPurchaseOrder('${po.id}')">Cancel</button>` : ""}
                    ${canCreateBill ? `<button class="btn-primary btn-xs" onclick="createBillForPurchase('${po.id}')">Create Bill</button>` : ""}
                    ${hasBill ? `<button class="btn-ghost btn-xs" onclick="openBillDetail('${po.bill_id}')">View Bill</button>` : ""}
                </td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeBills() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeBranches(),
            loadSupplierOptionsForProductForm(),
        ]);
        const endpoint = withParams("/purchases/bills/", {
            limit: backOfficeBillsLimit,
            offset: backOfficeBillsOffset,
            search: backOfficeBillsQuery,
            status: els.backofficeBillsStatus?.value || "",
            supplier: els.backofficeBillsSupplier?.value || "",
            branch: els.backofficeBillsBranch?.value || "",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeBillsPage = page;
        backOfficeBills = ensureArray(page, "backOfficeBills");
        renderBackOfficeBills();
        updatePager({
            prevEl: els.backofficeBillsPrev,
            nextEl: els.backofficeBillsNext,
            pageEl: els.backofficeBillsPage,
            offset: backOfficeBillsOffset,
            limit: backOfficeBillsLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeBillsTable) {
            const tbody = els.backofficeBillsTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9">Failed to load bills</td></tr>`;
            }
        }
    }
}

function renderBackOfficeBills() {
    if (!els.backofficeBillsTable) return;
    const tbody = els.backofficeBillsTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeBills;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="9">No bills found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(bill => {
        const statusBadge = renderStatusBadge(bill.status);
        const total = bill.total_amount !== null && bill.total_amount !== undefined ? fmtPrice(bill.total_amount) : "—";
        const balance = bill.balance_due !== null && bill.balance_due !== undefined ? fmtPrice(bill.balance_due) : "—";
        const billDate = bill.bill_date ? formatShortDate(bill.bill_date) : "—";
        const poNumber = bill.purchase_order?.po_number || "—";
        return `
            <tr>
                <td>${esc(bill.bill_number || "—")}</td>
                <td>${esc(bill.supplier?.name || "—")}</td>
                <td>${esc(bill.branch?.name || "—")}</td>
                <td>${statusBadge}</td>
                <td>${esc(poNumber)}</td>
                <td>${total}</td>
                <td>${balance}</td>
                <td>${billDate}</td>
                <td>
                    <button class="btn-ghost btn-xs" onclick="openBillDetail('${bill.id}')">View</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function ensurePurchaseProductsLoaded() {
    if (!backOfficeProducts.length) {
        await loadBackOfficeProducts();
    }
}

function renderPurchaseProductOptions(selected = "") {
    if (!els.purchaseLineProduct) return;
    const options = [
        `<option value="">Select product</option>`,
        ...backOfficeProducts.map(product => `<option value="${product.id}">${esc(product.name)} (${esc(product.sku)})</option>`),
    ];
    els.purchaseLineProduct.innerHTML = options.join("");
    if (selected) {
        els.purchaseLineProduct.value = selected;
    }
}

async function openPurchaseForm(purchaseId = null) {
    if (!els.purchaseFormModal) return;
    editingPurchaseId = purchaseId;
    currentPurchaseDetail = null;
    if (els.purchaseFormError) els.purchaseFormError.textContent = "";
    if (els.purchaseForm) els.purchaseForm.reset();

    await Promise.all([
        loadSupplierOptionsForProductForm(),
        loadBackOfficeBranches(),
        ensurePurchaseProductsLoaded(),
    ]);

    renderPurchaseProductOptions();
    resetPurchaseLineInputs();

    if (!purchaseId) {
        setPurchaseFormStatus("draft");
        if (els.purchaseFormTitle) els.purchaseFormTitle.textContent = "New Purchase Order";
        renderPurchaseLines([]);
        renderPurchaseReceipts([]);
        renderPurchaseBillSection(null);
        updatePurchaseFormActions();
        openOverlay(els.purchaseFormModal);
        return;
    }

    try {
        const detail = await apiFetch(`/purchases/${purchaseId}/`);
        if (!detail) {
            toast("Failed to load purchase order", "error");
            return;
        }
        currentPurchaseDetail = detail;
        if (els.purchaseFormTitle) els.purchaseFormTitle.textContent = `PO ${detail.po_number || ""}`.trim();
        if (els.purchaseSupplier) els.purchaseSupplier.value = detail.supplier?.id || "";
        if (els.purchaseBranch) els.purchaseBranch.value = detail.branch?.id || "";
        if (els.purchaseExpectedDate) els.purchaseExpectedDate.value = detail.expected_date || "";
        if (els.purchaseNotes) els.purchaseNotes.value = detail.notes || "";
        setPurchaseFormStatus(detail.status || "draft");
        await loadPurchaseSupplierPricing(detail.supplier?.id || "");
        renderPurchaseLines(detail.lines || []);
        await loadPurchaseReceipts(detail.id);
        renderPurchaseBillSection(detail);
        updatePurchaseFormActions();
        openOverlay(els.purchaseFormModal);
    } catch (err) {
        toast(`Failed to load PO: ${err.message}`, "error");
    }
}

function closePurchaseForm() {
    if (!els.purchaseFormModal) return;
    closeOverlay(els.purchaseFormModal);
    editingPurchaseId = null;
    currentPurchaseDetail = null;
    purchaseSupplierPrices = {};
}

function setPurchaseFormStatus(status) {
    const normalized = (status || "draft").toString().toLowerCase();
    if (!els.purchaseStatusPill) return;
    els.purchaseStatusPill.className = `status-badge status-${normalized}`;
    els.purchaseStatusPill.textContent = formatLabel(normalized);
}

function updatePurchaseFormActions() {
    const status = (currentPurchaseDetail?.status || "draft").toLowerCase();
    const isDraft = status === "draft";
    const canReceive = ["ordered", "partial"].includes(status);
    const hasPo = !!editingPurchaseId;
    const canCancel = ["draft", "ordered"].includes(status)
        && (currentPurchaseDetail?.received_quantity || 0) <= 0;
    const hasBill = !!currentPurchaseDetail?.bill_id;
    const canCreateBill = status === "received" && hasPo && !hasBill;

    if (els.purchaseLineAdd) els.purchaseLineAdd.disabled = !isDraft || !hasPo;
    if (els.purchaseMarkOrdered) {
        els.purchaseMarkOrdered.disabled = !isDraft || !hasPo || !(currentPurchaseDetail?.lines || []).length;
        els.purchaseMarkOrdered.classList.toggle("hidden", !isDraft || !hasPo);
    }
    if (els.purchaseReceiveOpen) {
        els.purchaseReceiveOpen.disabled = !canReceive || !hasPo;
        els.purchaseReceiveOpen.classList.toggle("hidden", !canReceive || !hasPo);
    }
    if (els.purchaseCancelPo) {
        els.purchaseCancelPo.disabled = !canCancel || !hasPo;
        els.purchaseCancelPo.classList.toggle("hidden", !canCancel || !hasPo);
    }
    if (els.purchaseCreateBill) {
        els.purchaseCreateBill.disabled = !canCreateBill;
        els.purchaseCreateBill.classList.toggle("hidden", !canCreateBill);
    }
    if (els.purchaseViewBill) {
        els.purchaseViewBill.classList.toggle("hidden", !hasBill);
    }
}

function resetPurchaseLineInputs() {
    if (els.purchaseLineProduct) els.purchaseLineProduct.value = "";
    if (els.purchaseLineQty) els.purchaseLineQty.value = "";
    if (els.purchaseLineCost) els.purchaseLineCost.value = "";
    if (els.purchaseLineNotes) els.purchaseLineNotes.value = "";
}

async function savePurchaseForm() {
    if (!canAccessBackOffice()) return;
    if (editingPurchaseId && ["received", "cancelled"].includes((currentPurchaseDetail?.status || "").toLowerCase())) {
        toast("This purchase order is read-only.", "error");
        return;
    }
    if (els.purchaseFormSave) {
        els.purchaseFormSave.disabled = true;
        els.purchaseFormSave.textContent = "Saving...";
    }
    if (els.purchaseFormError) els.purchaseFormError.textContent = "";
    const payload = {
        supplier_id: els.purchaseSupplier?.value || "",
        branch_id: els.purchaseBranch?.value || "",
        expected_date: els.purchaseExpectedDate?.value || "",
        notes: els.purchaseNotes?.value || "",
    };
    try {
        if (editingPurchaseId) {
            await apiRequest(`/purchases/${editingPurchaseId}/update/`, { method: "PUT", body: payload });
            toast("Purchase order updated", "success");
        } else {
            const result = await apiRequest(`/purchases/create/`, { method: "POST", body: payload });
            editingPurchaseId = result.id;
            toast("Purchase order created", "success");
        }
        if (editingPurchaseId) {
            currentPurchaseDetail = await apiFetch(`/purchases/${editingPurchaseId}/`);
            if (els.purchaseFormTitle && currentPurchaseDetail?.po_number) {
                els.purchaseFormTitle.textContent = `PO ${currentPurchaseDetail.po_number}`;
            }
            setPurchaseFormStatus(currentPurchaseDetail?.status || "draft");
            renderPurchaseLines(currentPurchaseDetail?.lines || []);
            await loadPurchaseReceipts(editingPurchaseId);
            renderPurchaseBillSection(currentPurchaseDetail);
            updatePurchaseFormActions();
        }
        await loadBackOfficePurchases();
    } catch (err) {
        if (els.purchaseFormError) {
            els.purchaseFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.purchaseFormSave) {
            els.purchaseFormSave.disabled = false;
            els.purchaseFormSave.textContent = "Save Purchase Order";
        }
    }
}

async function loadPurchaseSupplierPricing(supplierId) {
    purchaseSupplierPrices = {};
    if (!supplierId) return;
    try {
        const data = await apiFetch(`/suppliers/${supplierId}/products/`);
        (data || []).forEach(link => {
            if (!link.product?.id) return;
            purchaseSupplierPrices[link.product.id] = link.supplier_price;
        });
        prefillPurchaseLineCost();
    } catch (err) {
        purchaseSupplierPrices = {};
    }
}

function prefillPurchaseLineCost() {
    if (!els.purchaseLineProduct || !els.purchaseLineCost) return;
    const productId = els.purchaseLineProduct.value || "";
    if (!productId) return;
    const current = (els.purchaseLineCost.value || "").trim();
    if (current) return;
    const price = purchaseSupplierPrices[productId];
    if (price !== undefined && price !== null && price !== "") {
        els.purchaseLineCost.value = price;
    }
}

function renderPurchaseLines(lines) {
    if (!els.purchaseLinesList) return;
    const status = (currentPurchaseDetail?.status || "draft").toLowerCase();
    const isDraft = status === "draft";
    if (!editingPurchaseId) {
        els.purchaseLinesList.innerHTML = `<tr><td colspan="7" class="muted">Save the purchase order before adding lines.</td></tr>`;
        return;
    }
    if (!lines || !lines.length) {
        els.purchaseLinesList.innerHTML = `<tr><td colspan="7" class="muted">No lines added yet.</td></tr>`;
        return;
    }
    els.purchaseLinesList.innerHTML = lines.map(line => {
        const remaining = line.remaining_quantity ?? Math.max(0, (line.ordered_quantity || 0) - (line.received_quantity || 0));
        return `
            <tr data-line-id="${line.id}">
                <td>
                    <strong>${esc(line.product?.name || "Item")}</strong>
                    <div class="muted">${esc(line.product?.sku || "")}</div>
                </td>
                <td><input class="summary-input line-ordered" type="number" min="1" ${isDraft ? "" : "disabled"} value="${line.ordered_quantity || 0}"></td>
                <td>${line.received_quantity ?? 0}</td>
                <td><input class="summary-input line-cost" type="number" step="0.01" ${isDraft ? "" : "disabled"} value="${line.unit_cost ?? ""}"></td>
                <td>${remaining}</td>
                <td><input class="summary-input line-notes" ${isDraft ? "" : "disabled"} value="${esc(line.notes || "")}"></td>
                <td>
                    <button class="btn-secondary btn-xs" data-line-action="save" ${isDraft ? "" : "disabled"}>Save</button>
                    <button class="btn-ghost btn-xs" data-line-action="remove" ${isDraft ? "" : "disabled"}>Remove</button>
                </td>
            </tr>
        `;
    }).join("");
}

async function addPurchaseLine() {
    if (!editingPurchaseId) {
        toast("Save the purchase order before adding lines.", "info");
        return;
    }
    if (!currentPurchaseDetail || (currentPurchaseDetail.status || "draft") !== "draft") {
        toast("Lines can only be added while draft.", "error");
        return;
    }
    const productId = els.purchaseLineProduct?.value || "";
    const qtyRaw = (els.purchaseLineQty?.value || "").trim();
    const costRaw = (els.purchaseLineCost?.value || "").trim();
    const notes = (els.purchaseLineNotes?.value || "").trim();
    if (!productId) {
        toast("Select a product first.", "error");
        return;
    }
    const qty = parseInt(qtyRaw, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
        toast("Quantity must be a positive integer.", "error");
        return;
    }
    try {
        await apiRequest(`/purchases/${editingPurchaseId}/lines/add/`, {
            method: "POST",
            body: {
                product_id: productId,
                ordered_quantity: qty,
                unit_cost: costRaw || null,
                notes,
            },
        });
        resetPurchaseLineInputs();
        const detail = await apiFetch(`/purchases/${editingPurchaseId}/`);
        currentPurchaseDetail = detail;
        renderPurchaseLines(detail.lines || []);
        updatePurchaseFormActions();
        await loadBackOfficePurchases();
        toast("Line added", "success");
    } catch (err) {
        toast(`Failed to add line: ${err.message}`, "error");
    }
}

async function loadPurchaseReceipts(purchaseId) {
    if (!purchaseId) {
        renderPurchaseReceipts([]);
        return;
    }
    try {
        const data = await apiFetch(`/purchases/${purchaseId}/receipts/`);
        renderPurchaseReceipts(ensureArray(data, "purchaseReceipts"));
    } catch (err) {
        renderPurchaseReceipts([], { error: true });
    }
}

function renderPurchaseReceipts(receipts, { error = false } = {}) {
    if (!els.purchaseReceiptsList) return;
    if (error) {
        els.purchaseReceiptsList.innerHTML = `<div class="muted">Failed to load receipt history.</div>`;
        return;
    }
    if (!receipts.length) {
        els.purchaseReceiptsList.innerHTML = `<div class="muted">No receipts yet.</div>`;
        return;
    }
    els.purchaseReceiptsList.innerHTML = receipts.map(entry => `
        <div class="receipt-history-row">
            <div>
                <div class="receipt-title">${esc(entry.product_name || "Item")} <span class="muted">(${esc(entry.product_sku || "—")})</span></div>
                <div class="receipt-meta">
                    <span>${formatDateTime(entry.received_at)}</span>
                    <span>•</span>
                    <span>${esc(entry.received_by || "—")}</span>
                    <span>•</span>
                    <span>${esc(entry.branch_name || "—")}</span>
                </div>
            </div>
            <div class="receipt-qty">+${entry.quantity ?? 0}</div>
        </div>
    `).join("");
}

function renderPurchaseBillSection(detail) {
    if (!els.purchaseBillMeta) return;
    const billId = detail?.bill_id || null;
    const billStatus = detail?.bill_status || "";
    if (!detail) {
        els.purchaseBillMeta.textContent = "No bill created yet.";
        if (els.purchaseCreateBill) els.purchaseCreateBill.classList.add("hidden");
        if (els.purchaseViewBill) els.purchaseViewBill.classList.add("hidden");
        return;
    }
    if (billId) {
        const statusBadge = renderStatusBadge(billStatus || "open");
        els.purchaseBillMeta.innerHTML = `Bill linked • ${statusBadge}`;
        if (els.purchaseViewBill) els.purchaseViewBill.classList.remove("hidden");
        if (els.purchaseCreateBill) els.purchaseCreateBill.classList.add("hidden");
    } else {
        els.purchaseBillMeta.textContent = detail.status === "received"
            ? "No bill created yet. You can create one now."
            : "Bills can be created once the PO is fully received.";
        if (els.purchaseViewBill) els.purchaseViewBill.classList.add("hidden");
    }
}

async function createBillForPurchase(purchaseId) {
    if (!purchaseId) return;
    if (!confirm("Create a supplier bill for this purchase order?")) return;
    try {
        const result = await apiRequest(`/purchases/${purchaseId}/create-bill/`, {
            method: "POST",
            body: {},
        });
        toast("Supplier bill created", "success");
        if (editingPurchaseId === purchaseId) {
            currentPurchaseDetail = await apiFetch(`/purchases/${purchaseId}/`);
            setPurchaseFormStatus(currentPurchaseDetail?.status || "received");
            renderPurchaseLines(currentPurchaseDetail?.lines || []);
            await loadPurchaseReceipts(purchaseId);
            renderPurchaseBillSection(currentPurchaseDetail);
            updatePurchaseFormActions();
        }
        await loadBackOfficePurchases();
        await loadBackOfficeBills();
        if (result?.id) {
            openBillDetail(result.id);
        }
    } catch (err) {
        toast(`Create bill failed: ${err.message}`, "error");
    }
}

async function openBillDetail(billId) {
    if (!els.billDetailModal || !billId) return;
    editingBillId = billId;
    currentBillDetail = null;
    if (els.billDetailError) els.billDetailError.textContent = "";
    try {
        const detail = await apiFetch(`/purchases/bills/${billId}/`);
        if (!detail) {
            toast("Failed to load bill", "error");
            return;
        }
        currentBillDetail = detail;
        renderBillDetail(detail);
        openOverlay(els.billDetailModal, { closeOthers: false });
    } catch (err) {
        if (els.billDetailError) els.billDetailError.textContent = err.message || "Failed to load bill.";
        toast(`Failed to load bill: ${err.message}`, "error");
    }
}

function closeBillDetail() {
    if (!els.billDetailModal) return;
    closeOverlay(els.billDetailModal);
    editingBillId = null;
    currentBillDetail = null;
}

function renderBillDetail(bill) {
    if (!bill) return;
    if (els.billDetailTitle) {
        const label = bill.bill_number ? `Bill ${bill.bill_number}` : "Supplier Bill";
        els.billDetailTitle.textContent = label;
    }
    if (els.billDetailStatus) {
        els.billDetailStatus.className = `status-badge status-${(bill.status || "open").toLowerCase()}`;
        els.billDetailStatus.textContent = formatLabel(bill.status || "open");
    }
    if (els.billDetailMeta) {
        const metaParts = [
            bill.supplier?.name || "Supplier",
            bill.branch?.name || "Branch",
            bill.purchase_order?.po_number ? `PO ${bill.purchase_order.po_number}` : null,
            bill.bill_date ? formatShortDate(bill.bill_date) : null,
        ].filter(Boolean);
        els.billDetailMeta.textContent = metaParts.join(" • ");
    }
    if (els.billDetailLines) {
        const lines = bill.lines || [];
        if (!lines.length) {
            els.billDetailLines.innerHTML = `<tr><td colspan="4" class="muted">No bill lines found.</td></tr>`;
        } else {
            els.billDetailLines.innerHTML = lines.map(line => `
                <tr>
                    <td>
                        <strong>${esc(line.product?.name || line.description || "Item")}</strong>
                        <div class="muted">${esc(line.product?.sku || "")}</div>
                    </td>
                    <td>${line.quantity ?? 0}</td>
                    <td>${line.unit_cost ? fmtPrice(line.unit_cost) : "—"}</td>
                    <td>${line.line_total ? fmtPrice(line.line_total) : "—"}</td>
                </tr>
            `).join("");
        }
    }
    if (els.billDetailTotals) {
        const subtotal = bill.subtotal !== null && bill.subtotal !== undefined ? fmtPrice(bill.subtotal) : "—";
        const taxAmount = bill.tax_amount !== null && bill.tax_amount !== undefined ? fmtPrice(bill.tax_amount) : "—";
        const totalAmount = bill.total_amount !== null && bill.total_amount !== undefined ? fmtPrice(bill.total_amount) : "—";
        const amountPaid = bill.amount_paid !== null && bill.amount_paid !== undefined ? fmtPrice(bill.amount_paid) : "—";
        const balanceDue = bill.balance_due !== null && bill.balance_due !== undefined ? fmtPrice(bill.balance_due) : "—";
        els.billDetailTotals.innerHTML = `
            <div class="bill-total-line"><span>Subtotal</span><strong>${subtotal}</strong></div>
            <div class="bill-total-line"><span>Tax</span><strong>${taxAmount}</strong></div>
            <div class="bill-total-line"><span>Total</span><strong>${totalAmount}</strong></div>
            <div class="bill-total-line"><span>Paid</span><strong>${amountPaid}</strong></div>
            <div class="bill-total-line"><span>Balance</span><strong>${balanceDue}</strong></div>
        `;
    }
    if (els.billDetailNotes) {
        els.billDetailNotes.textContent = bill.notes ? `Notes: ${bill.notes}` : "";
    }
    if (els.billDetailCancel) {
        const status = (bill.status || "").toLowerCase();
        const canCancel = !["cancelled", "paid"].includes(status) && (!bill.amount_paid || Number(bill.amount_paid) <= 0);
        els.billDetailCancel.classList.toggle("hidden", !canCancel);
        els.billDetailCancel.disabled = !canCancel;
    }
}

async function cancelSupplierBill(billId) {
    if (!billId) return;
    if (!confirm("Cancel this supplier bill?")) return;
    try {
        await apiRequest(`/purchases/bills/${billId}/cancel/`, { method: "POST" });
        toast("Bill cancelled", "success");
        const detail = await apiFetch(`/purchases/bills/${billId}/`);
        currentBillDetail = detail;
        renderBillDetail(detail);
        await loadBackOfficeBills();
        if (currentPurchaseDetail?.bill_id === billId) {
            currentPurchaseDetail = await apiFetch(`/purchases/${currentPurchaseDetail.id}/`);
            renderPurchaseBillSection(currentPurchaseDetail);
        }
        if (editingSupplierId) {
            loadSupplierFinancials(editingSupplierId);
        }
    } catch (err) {
        toast(`Cancel failed: ${err.message}`, "error");
        if (els.billDetailError) els.billDetailError.textContent = err.message || "Cancel failed.";
    }
}

async function savePurchaseLine(lineId, rowEl) {
    if (!editingPurchaseId || !lineId || !rowEl) return;
    const orderedRaw = (rowEl.querySelector(".line-ordered")?.value || "").trim();
    const unitCostRaw = (rowEl.querySelector(".line-cost")?.value || "").trim();
    const notes = (rowEl.querySelector(".line-notes")?.value || "").trim();
    const ordered = parseInt(orderedRaw, 10);
    if (!Number.isInteger(ordered) || ordered <= 0) {
        toast("Ordered quantity must be a positive integer.", "error");
        return;
    }
    try {
        await apiRequest(`/purchases/${editingPurchaseId}/lines/${lineId}/`, {
            method: "PUT",
            body: {
                ordered_quantity: ordered,
                unit_cost: unitCostRaw || null,
                notes,
            },
        });
        const detail = await apiFetch(`/purchases/${editingPurchaseId}/`);
        currentPurchaseDetail = detail;
        renderPurchaseLines(detail.lines || []);
        updatePurchaseFormActions();
        await loadBackOfficePurchases();
        toast("Line updated", "success");
    } catch (err) {
        toast(`Update failed: ${err.message}`, "error");
    }
}

async function removePurchaseLine(lineId) {
    if (!editingPurchaseId || !lineId) return;
    if (!confirm("Remove this line?")) return;
    try {
        await apiRequest(`/purchases/${editingPurchaseId}/lines/${lineId}/delete/`, { method: "DELETE" });
        const detail = await apiFetch(`/purchases/${editingPurchaseId}/`);
        currentPurchaseDetail = detail;
        renderPurchaseLines(detail.lines || []);
        updatePurchaseFormActions();
        await loadBackOfficePurchases();
        toast("Line removed", "success");
    } catch (err) {
        toast(`Remove failed: ${err.message}`, "error");
    }
}

async function markPurchaseOrdered() {
    if (!editingPurchaseId) return;
    try {
        await apiRequest(`/purchases/${editingPurchaseId}/mark-ordered/`, { method: "POST" });
        const detail = await apiFetch(`/purchases/${editingPurchaseId}/`);
        currentPurchaseDetail = detail;
        setPurchaseFormStatus(detail.status || "ordered");
        renderPurchaseLines(detail.lines || []);
        renderPurchaseBillSection(detail);
        updatePurchaseFormActions();
        await loadBackOfficePurchases();
        toast("Purchase order marked ordered", "success");
    } catch (err) {
        toast(`Mark ordered failed: ${err.message}`, "error");
    }
}

async function cancelPurchaseOrder(purchaseId) {
    if (!purchaseId) return;
    if (!confirm("Cancel this purchase order?")) return;
    try {
        await apiRequest(`/purchases/${purchaseId}/cancel/`, { method: "POST" });
        toast("Purchase order cancelled", "success");
        if (editingPurchaseId === purchaseId) {
            currentPurchaseDetail = await apiFetch(`/purchases/${purchaseId}/`);
            setPurchaseFormStatus(currentPurchaseDetail?.status || "cancelled");
            renderPurchaseLines(currentPurchaseDetail?.lines || []);
            await loadPurchaseReceipts(purchaseId);
            renderPurchaseBillSection(currentPurchaseDetail);
            updatePurchaseFormActions();
        }
        await loadBackOfficePurchases();
    } catch (err) {
        toast(`Cancel failed: ${err.message}`, "error");
    }
}

function bindPurchaseLineActions() {
    if (!els.purchaseLinesList) return;
    els.purchaseLinesList.addEventListener("click", (event) => {
        const action = event.target?.dataset?.lineAction;
        if (!action) return;
        const row = event.target.closest("tr");
        const lineId = row?.dataset?.lineId;
        if (!lineId) return;
        if (action === "save") {
            savePurchaseLine(lineId, row);
        }
        if (action === "remove") {
            removePurchaseLine(lineId);
        }
    });
}

async function openPurchaseReceiveModal(purchaseId) {
    if (!els.purchaseReceiveModal) return;
    try {
        const detail = await apiFetch(`/purchases/${purchaseId}/`);
        if (!detail) {
            toast("Failed to load purchase order", "error");
            return;
        }
        purchaseReceiveTarget = detail;
        renderPurchaseReceiveLines(detail);
        if (els.purchaseReceiveError) els.purchaseReceiveError.textContent = "";
        openOverlay(els.purchaseReceiveModal, { closeOthers: false });
    } catch (err) {
        toast(`Failed to load PO: ${err.message}`, "error");
    }
}

function closePurchaseReceiveModal() {
    if (!els.purchaseReceiveModal) return;
    closeOverlay(els.purchaseReceiveModal);
    purchaseReceiveTarget = null;
}

function renderPurchaseReceiveLines(detail) {
    if (!els.purchaseReceiveList) return;
    const poNumber = detail.po_number || "PO";
    if (els.purchaseReceiveMeta) {
        els.purchaseReceiveMeta.textContent = `${poNumber} • ${detail.supplier?.name || "Supplier"} • ${detail.branch?.name || "Branch"}`;
    }
    const lines = detail.lines || [];
    if (!lines.length) {
        els.purchaseReceiveList.innerHTML = `<tr><td colspan="5" class="muted">No lines to receive.</td></tr>`;
        return;
    }
    els.purchaseReceiveList.innerHTML = lines.map(line => {
        const remaining = line.remaining_quantity ?? Math.max(0, (line.ordered_quantity || 0) - (line.received_quantity || 0));
        return `
            <tr data-line-id="${line.id}">
                <td>
                    <strong>${esc(line.product?.name || "Item")}</strong>
                    <div class="muted">${esc(line.product?.sku || "")}</div>
                </td>
                <td>${line.ordered_quantity ?? 0}</td>
                <td>${line.received_quantity ?? 0}</td>
                <td>${remaining}</td>
                <td><input class="summary-input receive-qty" type="number" min="0" max="${remaining}" placeholder="0"></td>
            </tr>
        `;
    }).join("");
}

async function submitPurchaseReceive() {
    if (!purchaseReceiveTarget?.id) return;
    const rows = els.purchaseReceiveList?.querySelectorAll("tr") || [];
    const lines = [];
    rows.forEach(row => {
        const lineId = row.dataset.lineId;
        const qtyRaw = (row.querySelector(".receive-qty")?.value || "").trim();
        if (!lineId || !qtyRaw) return;
        const qty = parseInt(qtyRaw, 10);
        if (Number.isInteger(qty) && qty > 0) {
            lines.push({ line_id: lineId, received_quantity: qty });
        }
    });
    if (!lines.length) {
        if (els.purchaseReceiveError) els.purchaseReceiveError.textContent = "Enter at least one received quantity.";
        return;
    }
    if (els.purchaseReceiveError) els.purchaseReceiveError.textContent = "";
    try {
        await apiRequest(`/purchases/${purchaseReceiveTarget.id}/receive/`, { method: "POST", body: { lines } });
        toast("Stock received", "success");
        closePurchaseReceiveModal();
        if (editingPurchaseId === purchaseReceiveTarget.id) {
            currentPurchaseDetail = await apiFetch(`/purchases/${editingPurchaseId}/`);
            setPurchaseFormStatus(currentPurchaseDetail.status || "partial");
            renderPurchaseLines(currentPurchaseDetail.lines || []);
            await loadPurchaseReceipts(editingPurchaseId);
            renderPurchaseBillSection(currentPurchaseDetail);
            updatePurchaseFormActions();
        }
        await loadBackOfficePurchases();
    } catch (err) {
        if (els.purchaseReceiveError) els.purchaseReceiveError.textContent = err.message || "Receive failed.";
        toast(`Receive failed: ${err.message}`, "error");
    }
}

async function removeProductSupplierLink(linkId) {
    if (!editingProductId || !linkId) return;
    const confirmed = confirm("Remove this supplier link?");
    if (!confirmed) return;
    try {
        await apiRequest(`/inventory/products/${editingProductId}/suppliers/${linkId}/`, {
            method: "DELETE",
        });
        toast("Supplier link removed", "success");
        await loadProductSupplierLinks(editingProductId);
    } catch (err) {
        toast(`Remove failed: ${err.message}`, "error");
    }
}

async function loadSupplierLinkedProducts(supplierId) {
    if (!els.supplierLinkedProducts) return;
    if (!supplierId) {
        els.supplierLinkedProducts.textContent = "Save supplier to link products.";
        return;
    }
    const data = await apiFetch(`/suppliers/${supplierId}/products/`);
    const links = ensureArray(data, "supplierProducts");
    if (!links.length) {
        els.supplierLinkedProducts.textContent = "No products linked yet.";
        return;
    }
    els.supplierLinkedProducts.innerHTML = links.map(link => {
        const primary = link.is_primary ? `<span class="status-badge status-active">Primary</span>` : "";
        return `
            <div class="linked-product-row">
                <div><strong>${esc(link.product?.name || "Product")}</strong></div>
                <div class="muted">${esc(link.product?.sku || "—")}</div>
                ${primary}
            </div>
        `;
    }).join("");
}

function resetSupplierFinancials() {
    if (els.supplierBalance) els.supplierBalance.textContent = "Outstanding balance: —";
    if (els.supplierBillsList) els.supplierBillsList.textContent = "Save supplier to view bills.";
    if (els.supplierLedgerList) els.supplierLedgerList.textContent = "Save supplier to view ledger activity.";
}

async function loadSupplierFinancials(supplierId) {
    if (!supplierId) {
        resetSupplierFinancials();
        return;
    }
    if (els.supplierBalance) {
        els.supplierBalance.textContent = "Outstanding balance: …";
    }
    try {
        const balance = await apiFetch(`/suppliers/${supplierId}/balances/`);
        if (els.supplierBalance) {
            const outstanding = balance?.outstanding_balance ? fmtPrice(balance.outstanding_balance) : fmtPrice(0);
            els.supplierBalance.textContent = `Outstanding balance: ${outstanding}`;
        }
    } catch (err) {
        if (els.supplierBalance) els.supplierBalance.textContent = "Outstanding balance: —";
    }

    try {
        const bills = await apiFetch(withParams("/purchases/bills/", {
            supplier: supplierId,
            limit: 5,
            offset: 0,
        }));
        const billRows = ensureArray(normalizePaginated(bills), "supplierBills");
        if (els.supplierBillsList) {
            if (!billRows.length) {
                els.supplierBillsList.textContent = "No bills yet.";
            } else {
                els.supplierBillsList.innerHTML = billRows.map(bill => `
                    <div class="supplier-financial-item">
                        <div>
                            <strong>${esc(bill.bill_number || "Bill")}</strong>
                            <div class="muted">${esc(bill.purchase_order?.po_number || "—")}</div>
                        </div>
                        <div>
                            <div>${bill.total_amount !== null && bill.total_amount !== undefined ? fmtPrice(bill.total_amount) : "—"}</div>
                            <div class="muted">${formatLabel(bill.status || "open")}</div>
                        </div>
                    </div>
                `).join("");
            }
        }
    } catch (err) {
        if (els.supplierBillsList) els.supplierBillsList.textContent = "Failed to load bills.";
    }

    try {
        const ledger = await apiFetch(withParams(`/suppliers/${supplierId}/ledger/`, {
            limit: 5,
            offset: 0,
        }));
        const ledgerRows = ensureArray(normalizePaginated(ledger), "supplierLedger");
        if (els.supplierLedgerList) {
            if (!ledgerRows.length) {
                els.supplierLedgerList.textContent = "No ledger entries yet.";
            } else {
                els.supplierLedgerList.innerHTML = ledgerRows.map(entry => `
                    <div class="supplier-financial-item">
                        <div>
                            <strong>${formatLabel(entry.entry_type || "entry")}</strong>
                            <div class="muted">${formatShortDate(entry.created_at)} • ${esc(entry.reference || "—")}</div>
                        </div>
                        <div>
                            <div>${entry.amount ? fmtPrice(entry.amount) : "—"}</div>
                            <div class="muted">${formatLabel(entry.direction || "out")}</div>
                        </div>
                    </div>
                `).join("");
            }
        }
    } catch (err) {
        if (els.supplierLedgerList) els.supplierLedgerList.textContent = "Failed to load ledger.";
    }
}

async function loadBackOfficeStaff() {
    if (!canAccessBackOffice()) return;
    try {
        await loadBackOfficeBranches();
        renderStaffRoleOptions();
        const endpoint = withParams("/accounts/users/", {
            limit: backOfficeStaffLimit,
            offset: backOfficeStaffOffset,
            search: backOfficeStaffQuery,
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeStaffPage = page;
        backOfficeStaff = ensureArray(page, "backOfficeStaff");
        renderBackOfficeStaff();
        updatePager({
            prevEl: els.backofficeStaffPrev,
            nextEl: els.backofficeStaffNext,
            pageEl: els.backofficeStaffPage,
            offset: backOfficeStaffOffset,
            limit: backOfficeStaffLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeStaffTable) {
            const tbody = els.backofficeStaffTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6">Failed to load users</td></tr>`;
            }
        }
    }
}

async function loadBackOfficeRoutes() {
    const branchId = els.backofficeOrdersBranch?.value || els.backofficeCustomerBranch?.value || "";
    const currentCustomerRoute = els.backofficeCustomerRoute?.value || "";
    const currentOrdersRoute = els.backofficeOrdersRoute?.value || "";
    const data = await apiFetch(withParams("/routes/", { branch: branchId }));
    backOfficeRoutes = ensureArray(data, "backOfficeRoutes");
    if (!els.customerRoute) return;
    if (!backOfficeRoutes.length) {
        els.customerRoute.innerHTML = `<option value="">No routes found</option>`;
        return;
    }
    els.customerRoute.innerHTML = `
        <option value="">Select route (optional)</option>
        ${backOfficeRoutes.map(r => `<option value="${r.id}">${esc(r.name)}${r.branch_name ? ` — ${esc(r.branch_name)}` : ""}</option>`).join("")}
    `;

    if (els.backofficeCustomerRoute) {
        els.backofficeCustomerRoute.innerHTML = `
            <option value="">All routes</option>
            ${backOfficeRoutes.map(r => `<option value="${r.id}">${esc(r.name)}${r.branch_name ? ` — ${esc(r.branch_name)}` : ""}</option>`).join("")}
        `;
        if (currentCustomerRoute) {
            els.backofficeCustomerRoute.value = currentCustomerRoute;
        }
    }

    if (els.backofficeOrdersRoute) {
        els.backofficeOrdersRoute.innerHTML = `
            <option value="">All routes</option>
            ${backOfficeRoutes.map(r => `<option value="${r.id}">${esc(r.name)}${r.branch_name ? ` — ${esc(r.branch_name)}` : ""}</option>`).join("")}
        `;
        if (currentOrdersRoute) {
            els.backofficeOrdersRoute.value = currentOrdersRoute;
        }
    }
}

function renderBackOfficeCustomers() {
    if (!els.backofficeCustomerTable) return;
    const tbody = els.backofficeCustomerTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeCustomers;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8">No customers found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(customer => {
        const wholesale = customer.is_wholesale_customer ? "Yes" : "No";
        const active = customer.is_active ? "Active" : "Inactive";
        const balance = customer.can_view_balance ? "Yes" : "No";
        const linked = Boolean(customer.user_id);
        const accountLabel = linked
            ? `${customer.user_username || customer.user_email || "Linked"} • ${customer.is_active ? "Approved" : "Pending"}`
            : "Unlinked";
        const approveBtn = linked && !customer.is_active
            ? `<button class="btn-ghost" onclick="approveCustomerAccount('${customer.id}')">Approve</button>`
            : "";
        const linkBtn = !linked
            ? `<button class="btn-ghost" onclick="linkCustomerAccount('${customer.id}')">Link</button>`
            : "";
        return `
            <tr>
                <td>${esc(customer.name)}</td>
                <td>${esc(customer.route_name || "—")}</td>
                <td>${esc(customer.branch_name || "—")}</td>
                <td>${wholesale}</td>
                <td>${active}</td>
                <td>${balance}</td>
                <td>${esc(accountLabel)}</td>
                <td>
                    <button class="btn-ghost" onclick="openCustomerForm('${customer.id}')">Edit</button>
                    ${approveBtn}
                    ${linkBtn}
                </td>
            </tr>
        `;
    }).join("");
}

function renderBackOfficeSuppliers() {
    if (!els.backofficeSupplierTable) return;
    const tbody = els.backofficeSupplierTable.querySelector("tbody");
    const rows = backOfficeSuppliers;
    if (!tbody) return;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6">No suppliers found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(supplier => {
        const contact = supplier.contact_person || "—";
        const phone = supplier.phone || "—";
        const email = supplier.email || "—";
        const status = supplier.is_active === false ? renderStatusBadge("inactive") : renderStatusBadge("active");
        return `
            <tr>
                <td>${esc(supplier.name)}</td>
                <td>${esc(contact)}</td>
                <td>${esc(phone)}</td>
                <td>${esc(email)}</td>
                <td>${status}</td>
                <td><button class="btn-ghost" onclick="openSupplierForm('${supplier.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

function renderStaffRoleOptions(selectedValue = "") {
    if (!els.staffRole) return;
    const current = selectedValue || els.staffRole.value || "";
    els.staffRole.innerHTML = `
        <option value="">Select role</option>
        ${STAFF_ROLE_OPTIONS.map(role => `<option value="${role.value}">${role.label}</option>`).join("")}
    `;
    if (current) {
        els.staffRole.value = current;
    }
}

function formatStaffRole(role) {
    const normalized = (role || "").trim().toLowerCase();
    const match = STAFF_ROLE_OPTIONS.find(r => r.value === normalized);
    return match ? match.label : (role || "—");
}

function renderBackOfficeStaff() {
    if (!els.backofficeStaffTable) return;
    const tbody = els.backofficeStaffTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeStaff;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6">No users found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(user => {
        const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "—";
        const statusClass = user.is_active ? "active" : "inactive";
        const statusLabel = user.is_active ? "Active" : "Inactive";
        return `
            <tr>
                <td>${esc(user.username || "—")}</td>
                <td>${esc(name)}</td>
                <td>${esc(formatStaffRole(user.role))}</td>
                <td>${esc(user.branch_name || "—")}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn-ghost" onclick="openStaffForm('${user.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeSales() {
    if (!canAccessBackOffice()) return;
    try {
        await loadBackOfficeBranches();
        await ensureDeliveryQueueCache();
        const endpoint = withParams("/sales/backoffice/sales/", {
            limit: backOfficeSalesLimit,
            offset: backOfficeSalesOffset,
            q: backOfficeSalesQuery,
            branch: els.backofficeSalesBranch?.value || "",
            status: els.backofficeSalesStatus?.value || "",
            date_from: els.backofficeSalesFrom?.value || "",
            date_to: els.backofficeSalesTo?.value || "",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeSalesPage = page;
        backOfficeSales = ensureArray(page, "backOfficeSales");
        renderBackOfficeSales();
        updatePager({
            prevEl: els.backofficeSalesPrev,
            nextEl: els.backofficeSalesNext,
            pageEl: els.backofficeSalesPage,
            offset: backOfficeSalesOffset,
            limit: backOfficeSalesLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeSalesTable) {
            const tbody = els.backofficeSalesTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="10">Failed to load sales</td></tr>`;
            }
        }
    }
}

function exportBackOfficeSales() {
    if (!canAccessBackOffice()) return;
    downloadCsv("/sales/backoffice/sales/export/", "backoffice-sales.csv", {
        limit: backOfficeSalesLimit,
        offset: backOfficeSalesOffset,
        q: backOfficeSalesQuery,
        branch: els.backofficeSalesBranch?.value || "",
        status: els.backofficeSalesStatus?.value || "",
        date_from: els.backofficeSalesFrom?.value || "",
        date_to: els.backofficeSalesTo?.value || "",
    });
}

function renderBackOfficeSales() {
    if (!els.backofficeSalesTable) return;
    const tbody = els.backofficeSalesTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeSales;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="10">No sales found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(sale => {
        const paymentMethod = sale.payment_mode ? formatPaymentMode(sale.payment_mode) : "";
        const paymentStatus = sale.payment_status ? renderStatusBadge(sale.payment_status) : "";
        const paymentText = [paymentMethod, paymentStatus].filter(Boolean).join(" ") || "—";
        const deliveryBadge = renderDeliverySaleBadge(sale);
        const deliveryAction = renderDeliverySaleAction(sale, {
            buttonClass: "btn-ghost",
            compact: true,
        });
        return `
            <tr>
                <td>#${shortOrderId(sale.id)}</td>
                <td>${esc(sale.customer?.name || "—")}</td>
                <td>${esc(sale.branch?.name || "—")}</td>
                <td>${formatLabel(sale.status)}</td>
                <td>${fmtPrice(sale.grand_total || 0)}</td>
                <td>${fmtPrice(sale.amount_paid || 0)}</td>
                <td>${fmtPrice(sale.balance_due || 0)}</td>
                <td>${paymentText}</td>
                <td>${formatDateTime(sale.sale_date)}</td>
                <td>
                    <div class="delivery-row-actions">
                        ${deliveryBadge}
                        ${deliveryAction}
                        <button class="btn-ghost" onclick="openBackOfficeSaleDetail('${sale.id}')">View</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

async function openBackOfficeSaleDetail(saleId) {
    if (!saleId || !els.backofficeSaleDetailModal) return;
    const detail = await apiFetch(`/sales/backoffice/sales/${saleId}/`);
    if (!detail) {
        toast("Failed to load sale details", "error");
        return;
    }
    renderBackOfficeSaleDetail(detail);
    openOverlay(els.backofficeSaleDetailModal, { closeOthers: false });
}

function closeBackOfficeSaleDetail() {
    if (!els.backofficeSaleDetailModal) return;
    closeOverlay(els.backofficeSaleDetailModal);
}

function renderBackOfficeSaleDetail(detail) {
    if (!els.backofficeSaleDetailBody) return;
    const paymentsHtml = renderPaymentHistoryList(detail.payments || [], { compact: true });
    const saleTotal = parseFloat(detail.grand_total || 0);
    const saleIncludedTax = saleTotal * TAX_RATE / (1 + TAX_RATE);
    const saleNet = Math.max(0, saleTotal - saleIncludedTax);
    const itemsHtml = (detail.items || []).map(item => `
        <div class="detail-item">
            <div>
                <div><strong>${esc(item.product_name || "Item")}</strong></div>
                <div class="muted">${esc(item.unit_name || "Unit")} ${item.unit_code ? `(${esc(item.unit_code)})` : ""}</div>
            </div>
            <div>${item.quantity}x</div>
            <div>${fmtPrice(item.total_price || 0)}</div>
        </div>
    `).join("");

    els.backofficeSaleDetailBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-row"><span>Sale</span><strong>#${shortOrderId(detail.id)}</strong></div>
                <div class="detail-row"><span>Status</span><strong>${formatLabel(detail.status)}</strong></div>
                <div class="detail-row"><span>Sale Type</span><strong>${formatLabel(detail.sale_type)}</strong></div>
                <div class="detail-row"><span>Payment Status</span><strong>${formatLabel(detail.payment_status)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Customer</span><strong>${esc(detail.customer?.name || "—")}</strong></div>
                <div class="detail-row"><span>Branch</span><strong>${esc(detail.branch?.name || "—")}</strong></div>
                <div class="detail-row"><span>Completed By</span><strong>${esc(detail.completed_by?.display_name || "—")}</strong></div>
                <div class="detail-row"><span>Assigned To</span><strong>${esc(detail.assigned_to?.display_name || "—")}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Total</span><strong>${fmtPrice(detail.grand_total || 0)}</strong></div>
                <div class="detail-row"><span>Paid</span><strong>${fmtPrice(detail.amount_paid || 0)}</strong></div>
                <div class="detail-row"><span>Balance Due</span><strong>${fmtPrice(detail.balance_due || 0)}</strong></div>
                <div class="detail-row"><span>Payment Mode</span><strong>${formatPaymentMode(detail.payment_mode)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Created</span><strong>${formatDateTime(detail.sale_date)}</strong></div>
                <div class="detail-row"><span>Completed</span><strong>${formatDateTime(detail.completed_at)}</strong></div>
                <div class="detail-row"><span>Due Date</span><strong>${detail.due_date || "—"}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Items</h4>
            <div class="detail-list">${itemsHtml || `<div class="muted">No items.</div>`}</div>
        </div>
        <div class="detail-section">
            <h4>Totals</h4>
            <div class="detail-list">
                <div class="detail-item"><span>Subtotal</span><strong>${fmtPrice(detail.total_amount || 0)}</strong></div>
                <div class="detail-item"><span>VAT (included)</span><strong>${fmtPrice(detail.tax ?? saleIncludedTax)}</strong></div>
                <div class="detail-item"><span>Net (ex VAT)</span><strong>${fmtPrice(saleNet)}</strong></div>
                <div class="detail-item"><span>Total</span><strong>${fmtPrice(detail.grand_total || 0)}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Payments</h4>
            <div class="payment-history">${paymentsHtml}</div>
        </div>
    `;
}

async function loadBackOfficeOrders() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeBranches(),
            loadBackOfficeRoutes(),
        ]);
        const endpoint = withParams("/sales/backoffice/orders/", {
            limit: backOfficeOrdersLimit,
            offset: backOfficeOrdersOffset,
            q: backOfficeOrdersQuery,
            branch: els.backofficeOrdersBranch?.value || "",
            route: els.backofficeOrdersRoute?.value || "",
            status: els.backofficeOrdersStatus?.value || "",
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeOrdersPage = page;
        backOfficeOrders = ensureArray(page, "backOfficeOrders");
        renderBackOfficeOrders();
        updatePager({
            prevEl: els.backofficeOrdersPrev,
            nextEl: els.backofficeOrdersNext,
            pageEl: els.backofficeOrdersPage,
            offset: backOfficeOrdersOffset,
            limit: backOfficeOrdersLimit,
            pageData: page,
        });
    } catch (err) {
        if (els.backofficeOrdersTable) {
            const tbody = els.backofficeOrdersTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9">Failed to load orders</td></tr>`;
            }
        }
    }
}

function exportBackOfficeOrders() {
    if (!canAccessBackOffice()) return;
    downloadCsv("/sales/backoffice/orders/export/", "backoffice-orders.csv", {
        limit: backOfficeOrdersLimit,
        offset: backOfficeOrdersOffset,
        q: backOfficeOrdersQuery,
        branch: els.backofficeOrdersBranch?.value || "",
        route: els.backofficeOrdersRoute?.value || "",
        status: els.backofficeOrdersStatus?.value || "",
    });
}

function renderBackOfficeOrders() {
    if (!els.backofficeOrdersTable) return;
    const tbody = els.backofficeOrdersTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeOrders;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="9">No orders found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(order => {
        const total = order.sale?.grand_total || "0.00";
        const assigned = order.assigned_to?.display_name || "Unassigned";
        return `
            <tr>
                <td>#${shortOrderId(order.id)}</td>
                <td>${esc(order.customer?.name || "—")}</td>
                <td>${esc(order.branch?.name || "—")}</td>
                <td>${esc(order.route?.name || "—")}</td>
                <td>${formatLabel(order.status)}</td>
                <td>${fmtPrice(total)}</td>
                <td>${esc(assigned)}</td>
                <td>${formatDateTime(order.created_at)}</td>
                <td><button class="btn-ghost" onclick="openBackOfficeOrderDetail('${order.id}')">View</button></td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeReports() {
    if (!canAccessBackOffice()) return;
    backOfficeReportsRange = els.backofficeReportsRange?.value || backOfficeReportsRange || "7";
    if (els.reportsSalesNote) {
        els.reportsSalesNote.textContent = `Last ${backOfficeReportsRange} days`;
    }
    if (els.reportsSalesTable) {
        const tbody = els.reportsSalesTable.querySelector("tbody");
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="muted">Loading sales overview...</td></tr>`;
    }
    if (els.reportsTopProductsTable) {
        const tbody = els.reportsTopProductsTable.querySelector("tbody");
        if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="muted">Loading top products...</td></tr>`;
    }
    if (els.reportsLowStockTable) {
        const tbody = els.reportsLowStockTable.querySelector("tbody");
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading stock...</td></tr>`;
    }

    const summary = await apiFetch("/reports/dashboard/");
    const salesSummary = await apiFetch(withParams("/reports/sales-summary/", { days: backOfficeReportsRange }));
    const topProducts = await apiFetch(withParams("/reports/top-products/", { days: backOfficeReportsRange }));
    const inventorySummary = await apiFetch("/reports/inventory-summary/");

    backOfficeReportsSummary = summary;
    backOfficeReportsSales = ensureArray(salesSummary?.sales_by_day, "reportsSalesByDay");
    backOfficeReportsPayments = ensureArray(salesSummary?.sales_by_payment_method, "reportsPaymentMethods");
    backOfficeReportsTopProducts = ensureArray(topProducts?.top_products, "reportsTopProducts");
    backOfficeReportsLowStock = ensureArray(inventorySummary?.low_stock_products, "reportsLowStock");

    renderBackOfficeReports();
}

function renderBackOfficeReports() {
    if (els.reportsTodaySales) {
        els.reportsTodaySales.textContent = fmtPrice(backOfficeReportsSummary?.today_sales || 0);
    }
    if (els.reportsWeekSales) {
        els.reportsWeekSales.textContent = fmtPrice(backOfficeReportsSummary?.week_sales || 0);
    }
    if (els.reportsPendingOrders) {
        const count = backOfficeReportsSummary?.pending_orders_count ?? 0;
        els.reportsPendingOrders.textContent = count.toLocaleString("en-KE");
    }
    if (els.reportsLowStock) {
        const count = backOfficeReportsSummary?.low_stock_count ?? 0;
        els.reportsLowStock.textContent = count.toLocaleString("en-KE");
    }

    if (els.reportsSalesTable) {
        const tbody = els.reportsSalesTable.querySelector("tbody");
        if (tbody) {
            if (!backOfficeReportsSales.length) {
                tbody.innerHTML = `<tr><td colspan="3">No sales data for this range.</td></tr>`;
            } else {
                tbody.innerHTML = backOfficeReportsSales.map(row => `
                    <tr>
                        <td>${formatShortDate(row.date)}</td>
                        <td>${row.total_orders || 0}</td>
                        <td>${fmtPrice(row.total_sales || 0)}</td>
                    </tr>
                `).join("");
            }
        }
    }

    if (els.reportsPaymentList) {
        if (!backOfficeReportsPayments.length) {
            els.reportsPaymentList.innerHTML = `<span class="muted">No payment breakdown available.</span>`;
        } else {
            els.reportsPaymentList.innerHTML = backOfficeReportsPayments.map(row => `
                <span class="reports-payment-pill">${formatLabel(row.payment_method)} · ${fmtPrice(row.total_sales || 0)}</span>
            `).join("");
        }
    }

    if (els.reportsTopProductsTable) {
        const tbody = els.reportsTopProductsTable.querySelector("tbody");
        if (tbody) {
            if (!backOfficeReportsTopProducts.length) {
                tbody.innerHTML = `<tr><td colspan="3">No products found.</td></tr>`;
            } else {
                tbody.innerHTML = backOfficeReportsTopProducts.map(row => `
                    <tr>
                        <td>${esc(row.product_name || "—")}</td>
                        <td>${row.total_quantity || 0}</td>
                        <td>${fmtPrice(row.total_revenue || 0)}</td>
                    </tr>
                `).join("");
            }
        }
    }

    if (els.reportsLowStockTable) {
        const tbody = els.reportsLowStockTable.querySelector("tbody");
        if (tbody) {
            if (!backOfficeReportsLowStock.length) {
                tbody.innerHTML = `<tr><td colspan="5">No low stock items.</td></tr>`;
            } else {
                tbody.innerHTML = backOfficeReportsLowStock.map(row => `
                    <tr>
                        <td>${esc(row.product_name || "—")}</td>
                        <td>${esc(row.sku || "—")}</td>
                        <td>${row.quantity ?? 0}</td>
                        <td>${row.reorder_level ?? 0}</td>
                        <td>${esc(row.branch_name || "—")}</td>
                    </tr>
                `).join("");
            }
        }
    }
}

async function openBackOfficeOrderDetail(orderId) {
    if (!orderId || !els.backofficeOrderDetailModal) return;
    const detail = await apiFetch(`/sales/backoffice/orders/${orderId}/`);
    if (!detail) {
        toast("Failed to load order details", "error");
        return;
    }
    renderBackOfficeOrderDetail(detail);
    openOverlay(els.backofficeOrderDetailModal, { closeOthers: false });
}

function closeBackOfficeOrderDetail() {
    if (!els.backofficeOrderDetailModal) return;
    closeOverlay(els.backofficeOrderDetailModal);
}

function renderBackOfficeOrderDetail(order) {
    if (!els.backofficeOrderDetailBody) return;
    const itemsHtml = (order.items || []).map(item => `
        <div class="detail-item">
            <div>
                <div><strong>${esc(item.product_name || "Item")}</strong></div>
                <div class="muted">${esc(item.unit_name || "Unit")} ${item.unit_code ? `(${esc(item.unit_code)})` : ""}</div>
            </div>
            <div>${item.quantity}x</div>
            <div>${fmtPrice(item.total_price || 0)}</div>
        </div>
    `).join("");
    const paymentsHtml = renderPaymentHistoryList(order.payments || [], { compact: true });
    const orderTotal = parseFloat(order.sale?.grand_total || 0);
    const orderIncludedTax = orderTotal * TAX_RATE / (1 + TAX_RATE);
    const orderNet = Math.max(0, orderTotal - orderIncludedTax);

    els.backofficeOrderDetailBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-row"><span>Order</span><strong>#${shortOrderId(order.id)}</strong></div>
                <div class="detail-row"><span>Status</span><strong>${formatLabel(order.status)}</strong></div>
                <div class="detail-row"><span>Credit</span><strong>${formatLabel(order.credit_approval_status || "not_requested")}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Customer</span><strong>${esc(order.customer?.name || "—")}</strong></div>
                <div class="detail-row"><span>Branch</span><strong>${esc(order.branch?.name || "—")}</strong></div>
                <div class="detail-row"><span>Route</span><strong>${esc(order.route?.name || "—")}</strong></div>
                <div class="detail-row"><span>Assigned</span><strong>${esc(order.assigned_to?.display_name || "Unassigned")}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Sale</span><strong>#${shortOrderId(order.sale?.id)}</strong></div>
                <div class="detail-row"><span>Total</span><strong>${fmtPrice(order.sale?.grand_total || 0)}</strong></div>
                <div class="detail-row"><span>Paid</span><strong>${fmtPrice(order.sale?.amount_paid || 0)}</strong></div>
                <div class="detail-row"><span>Balance</span><strong>${fmtPrice(order.sale?.balance_due || 0)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Created</span><strong>${formatDateTime(order.created_at)}</strong></div>
                <div class="detail-row"><span>Updated</span><strong>${formatDateTime(order.updated_at)}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Items</h4>
            <div class="detail-list">${itemsHtml || `<div class="muted">No items.</div>`}</div>
        </div>
        <div class="detail-section">
            <h4>Totals</h4>
            <div class="detail-list">
                <div class="detail-item"><span>Subtotal</span><strong>${fmtPrice(order.sale?.total_amount || 0)}</strong></div>
                <div class="detail-item"><span>VAT (included)</span><strong>${fmtPrice(order.sale?.tax ?? orderIncludedTax)}</strong></div>
                <div class="detail-item"><span>Net (ex VAT)</span><strong>${fmtPrice(orderNet)}</strong></div>
                <div class="detail-item"><span>Total</span><strong>${fmtPrice(order.sale?.grand_total || 0)}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Payments</h4>
            <div class="payment-history">${paymentsHtml}</div>
        </div>
        <div class="detail-section">
            <h4>Delivery Run</h4>
            <div id="order-delivery-run-actions" class="muted">Checking delivery run...</div>
        </div>
    `;

    loadBackOfficeOrderRunActions(order);
}

async function loadBackOfficeOrderRunActions(order) {
    if (!order) return;
    const container = document.getElementById("order-delivery-run-actions");
    if (!container) return;
    if (!order.assigned_to?.id) {
        container.innerHTML = `<div class="muted">Assign a delivery person to create a run.</div>`;
        return;
    }
    container.innerHTML = `<div class="muted">Checking for existing run...</div>`;
    const existingRun = await findDeliveryRunForOrder(order.id);
    if (existingRun) {
        container.innerHTML = `<button class="btn-secondary" data-view-run="${existingRun.id}">View Delivery Run</button>`;
        const viewBtn = container.querySelector("[data-view-run]");
        if (viewBtn) {
            viewBtn.addEventListener("click", () => openBackOfficeDeliveryDetail(existingRun.id));
        }
        return;
    }
    container.innerHTML = `<button class="btn-primary" data-create-run="${order.id}">Create Delivery Run</button>`;
    const createBtn = container.querySelector("[data-create-run]");
    if (createBtn) {
        createBtn.addEventListener("click", () => createDeliveryRunForOrder(order.id, order.assigned_to.id));
    }
}

async function findDeliveryRunForOrder(orderId) {
    if (!orderId) return null;
    const data = await apiFetch(withParams("/delivery/runs/", {
        search: orderId,
        limit: 1,
        offset: 0,
    }));
    const page = normalizePaginated(data);
    const runs = ensureArray(page, "deliveryRuns");
    return runs[0] || null;
}

async function createDeliveryRunForOrder(orderId, deliveryPersonId) {
    if (!orderId || !deliveryPersonId) {
        toast("Assign a delivery person first.", "error");
        return;
    }
    try {
        const res = await apiRequest("/delivery/runs/create/", {
            method: "POST",
            body: {
                order_id: orderId,
                delivery_person_id: deliveryPersonId,
            },
        });
        toast("Delivery run created", "success");
        if (res?.id) {
            openBackOfficeDeliveryDetail(res.id);
        }
    } catch (err) {
        if (err.message && err.message.includes("already exists")) {
            const existing = await findDeliveryRunForOrder(orderId);
            if (existing) {
                openBackOfficeDeliveryDetail(existing.id);
                return;
            }
        }
        toast(`Create run failed: ${err.message}`, "error");
    }
}

// ——— Back Office Delivery Runs ———
async function loadBackOfficeDeliveryRuns() {
    if (!canAccessBackOffice()) return;
    try {
        await Promise.all([
            loadBackOfficeBranches(),
            loadBackOfficeDeliveryPeople(),
        ]);
        const queryParams = {
            limit: backOfficeDeliveryLimit,
            offset: backOfficeDeliveryOffset,
            search: backOfficeDeliveryQuery,
            status: els.backofficeDeliveryStatus?.value || "",
            branch: els.backofficeDeliveryBranch?.value || "",
            delivery_person: els.backofficeDeliveryPerson?.value || "",
        };
        if (backOfficeDeliveryScope === "active") {
            queryParams.active = 1;
        }
        const endpoint = withParams("/delivery/runs/", queryParams);
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeDeliveryPage = page;
        backOfficeDeliveryRuns = ensureArray(page, "backOfficeDeliveryRuns");
        renderBackOfficeDeliveryRuns();
        updatePager({
            prevEl: els.backofficeDeliveryPrev,
            nextEl: els.backofficeDeliveryNext,
            pageEl: els.backofficeDeliveryPage,
            offset: backOfficeDeliveryOffset,
            limit: backOfficeDeliveryLimit,
            pageData: page,
        });
    } catch (err) {
        console.error("Failed to load delivery runs", err);
        if (els.backofficeDeliveryTable) {
            const tbody = els.backofficeDeliveryTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8">Failed to load delivery runs.</td></tr>`;
            }
        }
    }
}

async function loadBackOfficeDeliveryQueue() {
    if (!canAccessBackOffice()) return;
    try {
        await loadBackOfficeBranches();
        const queueParams = {
            limit: backOfficeDeliveryLimit,
            offset: backOfficeDeliveryQueueOffset,
            search: backOfficeDeliveryQuery,
            branch: els.backofficeDeliveryQueueBranch?.value || "",
            type: "sale",
        };
        const endpoint = withParams("/delivery/queue/", queueParams);
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficeDeliveryQueuePage = page;
        backOfficeDeliveryQueue = ensureArray(page, "backOfficeDeliveryQueue");
        syncDeliveryQueueIndex(backOfficeDeliveryQueue);
        renderBackOfficeDeliveryQueue();
        updatePager({
            prevEl: els.backofficeDeliveryQueuePrev,
            nextEl: els.backofficeDeliveryQueueNext,
            pageEl: els.backofficeDeliveryQueuePage,
            offset: backOfficeDeliveryQueueOffset,
            limit: backOfficeDeliveryLimit,
            pageData: page,
        });
    } catch (err) {
        console.error("Failed to load delivery queue", err);
        if (els.backofficeDeliveryQueueTable) {
            const tbody = els.backofficeDeliveryQueueTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8">Failed to load delivery queue.</td></tr>`;
            }
        }
    }
}

async function loadBackOfficeDeliveryPeople() {
    if (!els.backofficeDeliveryPerson) return;
    await ensureAssignableUsers();
    const current = els.backofficeDeliveryPerson.value || "";
    const deliveryUsers = assignableUsers.filter(u => {
        const role = normalizeRole(u.role);
        return role === "deliver_person" || role === "delivery_person";
    });
    const options = [
        `<option value="">All delivery persons</option>`,
        ...deliveryUsers.map(user => {
            const label = `${user.display_name || user.username || "User"}`;
            return `<option value="${user.id}">${esc(label)}</option>`;
        }),
    ];
    els.backofficeDeliveryPerson.innerHTML = options.join("");
    if (current) els.backofficeDeliveryPerson.value = current;
}

function renderBackOfficeDeliveryRuns() {
    if (!els.backofficeDeliveryTable) return;
    const tbody = els.backofficeDeliveryTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeDeliveryRuns;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8">No delivery runs found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(run => {
        const orderId = run.order?.id ? `#${shortOrderId(run.order.id)}` : (run.sale?.id ? `#${shortOrderId(run.sale.id)}` : "—");
        const customerName = run.order?.customer_name || run.sale?.customer?.name || "—";
        const deliveryPerson = run.delivery_person?.name || run.delivery_person?.username || "—";
        const branchName = run.branch?.name || "—";
        const statusBadge = renderDeliveryStatusBadge(run.status);
        const lastPing = formatDateTime(run.last_ping_at);
        const lastMapsUrl = buildMapsUrl(run.last_known_latitude, run.last_known_longitude);
        const locationHtml = renderLocationDisplay(run.last_known_latitude, run.last_known_longitude, {
            coordsClass: "location-coords location-coords-small",
        });
        const mapAction = lastMapsUrl
            ? `<a class="btn-ghost btn-inline" href="${lastMapsUrl}" target="_blank" rel="noopener noreferrer">Open in Maps</a>`
            : "";
        return `
            <tr>
                <td>${orderId}</td>
                <td>${esc(customerName)}</td>
                <td>${esc(deliveryPerson)}</td>
                <td>${esc(branchName)}</td>
                <td>${statusBadge}</td>
                <td>${lastPing}</td>
                <td><span class="delivery-location-cell" data-delivery-location="${run.id}">${locationHtml}</span></td>
                <td>
                    <div class="delivery-row-actions">
                        <button class="btn-ghost" onclick="openBackOfficeDeliveryDetail('${run.id}')">View</button>
                        ${mapAction}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    enhanceFriendlyLocationLabels(tbody);
}

function renderBackOfficeDeliveryQueue() {
    if (!els.backofficeDeliveryQueueTable) return;
    const tbody = els.backofficeDeliveryQueueTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeDeliveryQueue;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8">No delivery queue items found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(item => {
        const itemType = item.type || item.source_type || "customer_order";
        const typeLabel = itemType === "sale" ? "POS Sale" : "Customer Order";
        const ref = item.order_id || item.sale_id ? `#${shortOrderId(item.order_id || item.sale_id)}` : "—";
        const customerName = item.customer?.name || "—";
        const deliveryPerson = item.delivery_person?.name || item.delivery_person?.username || "—";
        const createdAt = formatDateTime(item.created_at);
        const statusBadge = renderDeliveryStatusBadge(item.status);
        const total = fmtPrice(item.total || 0);
        const runAction = item.existing_run_id
            ? `<button class="btn-secondary btn-inline" onclick="openBackOfficeDeliveryDetail('${item.existing_run_id}')">View Run</button>`
            : `<button class="btn-primary btn-inline" data-create-delivery-run="${itemType}" data-source-id="${item.source_id}" data-delivery-person="${item.delivery_person?.id || ""}">Create Run</button>`;
        const sourceAction = item.order_id
            ? `<button class="btn-ghost btn-inline" onclick="openBackOfficeOrderDetail('${item.order_id}')">View Order</button>`
            : `<button class="btn-ghost btn-inline" onclick="openBackOfficeSaleDetail('${item.sale_id}')">View Sale</button>`;
        const badge = `<span class="status-pill status-draft-queued">Delivery</span>`;
        return `
            <tr data-delivery-queue-sale-id="${esc(item.sale_id || item.order_id || "")}" class="${backOfficeDeliveryQueueHighlightSaleId && String(backOfficeDeliveryQueueHighlightSaleId) === String(item.sale_id || item.order_id || "") ? "delivery-queue-highlight" : ""}">
                <td>${esc(typeLabel)}</td>
                <td>${esc(ref)}</td>
                <td>${esc(customerName)} ${badge}</td>
                <td>${statusBadge}</td>
                <td>${esc(total)}</td>
                <td>${esc(deliveryPerson)}</td>
                <td>${esc(createdAt)}</td>
                <td>
                    <div class="delivery-row-actions">
                        ${sourceAction}
                        ${runAction}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    tbody.querySelectorAll("[data-create-delivery-run]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const sourceType = btn.dataset.createDeliveryRun;
            const sourceId = btn.dataset.sourceId;
            const deliveryPersonId = btn.dataset.deliveryPerson || "";
            if (!sourceId) return;
            try {
                const res = await apiRequest("/delivery/runs/create/", {
                    method: "POST",
                    body: {
                        source_type: sourceType,
                        source_id: sourceId,
                        delivery_person_id: deliveryPersonId || null,
                    },
                });
                toast("Delivery run created", "success");
                if (res?.id) {
                    openBackOfficeDeliveryDetail(res.id);
                    await loadBackOfficeDeliveryQueue();
                }
            } catch (err) {
                toast(`Create run failed: ${err.message}`, "error");
            }
        });
    });
    if (backOfficeDeliveryQueueHighlightSaleId) {
        const highlighted = tbody.querySelector(`[data-delivery-queue-sale-id="${CSS.escape(String(backOfficeDeliveryQueueHighlightSaleId))}"]`);
        if (highlighted) {
            highlighted.classList.add("delivery-queue-highlight");
            highlighted.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
}

async function openBackOfficeDeliveryDetail(runId) {
    if (!runId || !els.backofficeDeliveryDetailModal) return;
    els.backofficeDeliveryDetailBody.innerHTML = `<div class="muted">Loading delivery run...</div>`;
    openOverlay(els.backofficeDeliveryDetailModal, { closeOthers: false });
    try {
        const [detail, history] = await Promise.all([
            apiFetch(`/delivery/runs/${runId}/`),
            apiFetch(`/delivery/runs/${runId}/history/`),
        ]);
        renderBackOfficeDeliveryDetail(detail, ensureArray(history, "deliveryRunHistory"));
    } catch (err) {
        els.backofficeDeliveryDetailBody.innerHTML = `<div class="muted">Failed to load delivery run.</div>`;
    }
}

function closeBackOfficeDeliveryDetail() {
    if (!els.backofficeDeliveryDetailModal) return;
    closeOverlay(els.backofficeDeliveryDetailModal);
}

function renderBackOfficeDeliveryDetail(run, history = []) {
    if (!els.backofficeDeliveryDetailBody) return;
    if (!run) {
        els.backofficeDeliveryDetailBody.innerHTML = `<div class="muted">Delivery run not found.</div>`;
        return;
    }
    const orderId = run.order?.id ? `#${shortOrderId(run.order.id)}` : "—";
    const saleId = run.order?.sale_id ? `#${shortOrderId(run.order.sale_id)}` : (run.sale?.id ? `#${shortOrderId(run.sale.id)}` : "—");
    const customerName = run.order?.customer_name || run.sale?.customer?.name || "—";
    const deliveryPerson = run.delivery_person?.name || run.delivery_person?.username || "—";
    const branchName = run.branch?.name || "—";
    const statusBadge = renderDeliveryStatusBadge(run.status);
    const lastLocation = formatLocation(run.last_known_latitude, run.last_known_longitude);
    const deliveryPayments = ensureArray(run.sale?.delivery_payments || [], "deliveryPayments");
    const deliveryPaymentTotal = run.sale?.delivery_payment_total || (deliveryPayments.length ? deliveryPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || "0"), 0) : 0);
    const historyHtml = renderDeliveryRunHistoryList(history);
    const orderAction = run.order?.id
        ? `<div class="detail-actions"><button class="btn-secondary" onclick="openBackOfficeOrderDetail('${run.order.id}')">View Order</button></div>`
        : (run.sale?.id ? `<div class="detail-actions"><button class="btn-secondary" onclick="openBackOfficeSaleDetail('${run.sale.id}')">View Sale</button></div>` : "");
    const proofSection = run.status === "delivered" || run.recipient_name
        ? `
        <div class="detail-section">
            <h4>Proof of Delivery</h4>
            <div class="detail-list">
                <div class="detail-item"><span>Recipient</span><strong>${esc(run.recipient_name || "—")}</strong></div>
                <div class="detail-item"><span>Phone</span><strong>${esc(run.recipient_phone || "—")}</strong></div>
                <div class="detail-item"><span>Delivered At</span><strong>${formatDateTime(run.delivered_at || run.completed_at)}</strong></div>
                <div class="detail-item"><span>Notes</span><strong>${esc(run.delivery_notes || "—")}</strong></div>
            </div>
        </div>
        `
        : "";

    els.backofficeDeliveryDetailBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-row"><span>Order</span><strong>${orderId}</strong></div>
                <div class="detail-row"><span>Sale</span><strong>${saleId}</strong></div>
                <div class="detail-row"><span>Status</span><strong>${statusBadge}</strong></div>
                <div class="detail-row"><span>Customer</span><strong>${esc(customerName)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Delivery Person</span><strong>${esc(deliveryPerson)}</strong></div>
                <div class="detail-row"><span>Branch</span><strong>${esc(branchName)}</strong></div>
                <div class="detail-row"><span>Assigned</span><strong>${formatDateTime(run.assigned_at)}</strong></div>
                <div class="detail-row"><span>Started</span><strong>${formatDateTime(run.started_at)}</strong></div>
                <div class="detail-row"><span>Completed</span><strong>${formatDateTime(run.completed_at)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Last Ping</span><strong>${formatDateTime(run.last_ping_at)}</strong></div>
                <div class="detail-row"><span>Last Location</span><strong class="location-inline">${renderLocationDisplay(run.last_known_latitude, run.last_known_longitude, { mapsUrl: buildMapsUrl(run.last_known_latitude, run.last_known_longitude) })}</strong></div>
                <div class="detail-row"><span>Start</span><strong class="location-inline">${renderLocationDisplay(run.start_latitude, run.start_longitude, { mapsUrl: buildMapsUrl(run.start_latitude, run.start_longitude) })}</strong></div>
                <div class="detail-row"><span>End</span><strong class="location-inline">${renderLocationDisplay(run.end_latitude, run.end_longitude, { mapsUrl: buildMapsUrl(run.end_latitude, run.end_longitude) })}</strong></div>
                ${deliveryPayments.length ? `<div class="detail-row"><span>Delivery Payments</span><strong>${fmtPrice(deliveryPaymentTotal)}</strong></div>` : ""}
            </div>
        </div>
        ${orderAction}
        ${proofSection}
        ${deliveryPayments.length ? `
        <div class="detail-section">
            <h4>Delivery Payments</h4>
            <div class="payment-history">${renderPaymentHistoryList(deliveryPayments, { compact: true })}</div>
        </div>
        ` : ""}
        <div class="detail-section">
            <h4>Route History</h4>
            <div class="delivery-run-history">${historyHtml}</div>
        </div>
    `;
    enhanceFriendlyLocationLabels(els.backofficeDeliveryDetailBody);
}

function syncBackOfficePaymentsModeUI() {
    if (els.backofficePaymentsModeAll) {
        els.backofficePaymentsModeAll.classList.toggle("active", backOfficePaymentsMode !== "delivery");
    }
    if (els.backofficePaymentsModeDelivery) {
        els.backofficePaymentsModeDelivery.classList.toggle("active", backOfficePaymentsMode === "delivery");
    }
    if (els.backofficePaymentsCollectionStage) {
        if (backOfficePaymentsMode === "delivery") {
            els.backofficePaymentsCollectionStage.value = "delivery";
            els.backofficePaymentsCollectionStage.disabled = true;
        } else {
            els.backofficePaymentsCollectionStage.disabled = false;
            if (els.backofficePaymentsCollectionStage.value === "delivery") {
                els.backofficePaymentsCollectionStage.value = "";
            }
        }
    }
}

async function loadBackOfficePaymentDeliveryPeople() {
    if (!els.backofficePaymentsDeliveryPerson) return;
    await ensureAssignableUsers();
    const current = els.backofficePaymentsDeliveryPerson.value || backOfficePaymentsDeliveryPerson || "";
    const deliveryUsers = assignableUsers.filter(u => {
        const role = normalizeRole(u.role);
        return role === "deliver_person" || role === "delivery_person";
    });
    els.backofficePaymentsDeliveryPerson.innerHTML = [
        `<option value="">All delivery persons</option>`,
        ...deliveryUsers.map(user => {
            const label = `${user.display_name || user.username || "User"}`;
            return `<option value="${user.id}">${esc(label)}</option>`;
        }),
    ].join("");
    if (current) {
        els.backofficePaymentsDeliveryPerson.value = current;
    }
}

function setBackOfficePaymentsMode(mode, { reload = true } = {}) {
    backOfficePaymentsMode = mode === "delivery" ? "delivery" : "all";
    localStorage.setItem("backoffice_payments_mode", backOfficePaymentsMode);
    syncBackOfficePaymentsModeUI();
    if (reload) {
        backOfficePaymentsOffset = 0;
        loadBackOfficePayments();
    }
}

function getBackOfficePaymentsQueryParams() {
    const params = {
        limit: backOfficePaymentsLimit,
        offset: backOfficePaymentsOffset,
        q: backOfficePaymentsQuery,
        branch: els.backofficePaymentsBranch?.value || "",
        method: els.backofficePaymentsMethod?.value || "",
        status: els.backofficePaymentsStatus?.value || "",
        date_from: els.backofficePaymentsFrom?.value || "",
        date_to: els.backofficePaymentsTo?.value || "",
    };
    const collectionStage = els.backofficePaymentsCollectionStage?.value || "";
    const remittanceStatus = els.backofficePaymentsRemittance?.value || "";
    const deliveryPerson = els.backofficePaymentsDeliveryPerson?.value || "";
    if (backOfficePaymentsMode === "delivery") {
        params.collection_stage = "delivery";
    } else if (collectionStage) {
        params.collection_stage = collectionStage;
    }
    if (remittanceStatus) {
        params.remittance_status = remittanceStatus;
    }
    if (deliveryPerson) {
        params.delivery_person = deliveryPerson;
    }
    return params;
}

function renderRemittanceBadge(payment) {
    if (!payment) return `<span class="status-pill status-unpaid">—</span>`;
    const stage = payment.collection_stage || "";
    const status = payment.remittance_status || "";
    if (stage !== "delivery") {
        return `<span class="status-pill status-unpaid">—</span>`;
    }
    const cls = status === "remitted"
        ? "status-remitted"
        : status === "disputed"
            ? "status-disputed"
            : "status-pending";
    return `<span class="status-pill ${cls}">${esc(formatLabel(status || "pending"))}</span>`;
}

function isSelectableDeliveryPayment(payment) {
    return Boolean(payment)
        && payment.collection_stage === "delivery"
        && payment.remittance_status !== "remitted"
        && canAccessBackOffice();
}

function clearBackOfficePaymentsSelection() {
    backOfficePaymentsBulkSelection = new Set();
    backOfficePaymentsBulkNote = "";
    if (els.backofficePaymentsBulkNote) {
        els.backofficePaymentsBulkNote.value = "";
    }
    syncBackOfficePaymentsSelectionUI();
}

function getVisibleSelectableBackOfficePaymentIds() {
    return backOfficePayments
        .filter(isSelectableDeliveryPayment)
        .map(payment => String(payment.id));
}

function syncBackOfficePaymentsSelectionUI() {
    const active = backOfficePaymentsMode === "delivery" && backOfficePaymentsBulkSelection.size > 0;
    if (els.backofficePaymentsBulkBar) {
        els.backofficePaymentsBulkBar.classList.toggle("hidden", !active);
    }
    if (els.backofficePaymentsBulkCount) {
        els.backofficePaymentsBulkCount.textContent = `${backOfficePaymentsBulkSelection.size} selected`;
    }
    if (els.backofficePaymentsBulkNote) {
        els.backofficePaymentsBulkNote.value = backOfficePaymentsBulkNote || "";
    }
    if (els.backofficePaymentsSelectAll) {
        const visibleSelectable = getVisibleSelectableBackOfficePaymentIds();
        const selectedVisible = visibleSelectable.filter(id => backOfficePaymentsBulkSelection.has(id));
        els.backofficePaymentsSelectAll.checked = visibleSelectable.length > 0 && selectedVisible.length === visibleSelectable.length;
        els.backofficePaymentsSelectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleSelectable.length;
        els.backofficePaymentsSelectAll.disabled = visibleSelectable.length === 0;
    }
    if (els.backofficePaymentsBulkSubmit) {
        els.backofficePaymentsBulkSubmit.disabled = backOfficePaymentsBulkSelection.size === 0 || backOfficePaymentsMode !== "delivery";
    }
}

function setBackOfficePaymentsSelection(nextIds = []) {
    backOfficePaymentsBulkSelection = new Set((Array.isArray(nextIds) ? nextIds : []).map(id => String(id)).filter(Boolean));
    syncBackOfficePaymentsSelectionUI();
}

function toggleBackOfficePaymentSelection(paymentId, checked) {
    if (!paymentId) return;
    const next = new Set(backOfficePaymentsBulkSelection);
    const id = String(paymentId);
    if (checked) next.add(id);
    else next.delete(id);
    backOfficePaymentsBulkSelection = next;
    syncBackOfficePaymentsSelectionUI();
}

async function submitBackOfficeDeliveryRemittanceBulk() {
    if (backOfficePaymentsMode !== "delivery") return;
    const paymentIds = Array.from(backOfficePaymentsBulkSelection);
    if (!paymentIds.length) {
        toast("Select one or more delivery payments first.", "info");
        return;
    }
    const note = (els.backofficePaymentsBulkNote?.value || "").trim();
    const confirmed = window.confirm(`Mark ${paymentIds.length} selected delivery payment(s) as remitted?`);
    if (!confirmed) return;
    try {
        const res = await apiRequest("/payments/backoffice/remit/", {
            method: "POST",
            body: {
                payment_ids: paymentIds,
                note,
                remittance_status: "remitted",
            },
        });
        const updated = res?.updated || 0;
        const already = Array.isArray(res?.already_remitted) ? res.already_remitted.length : 0;
        const invalid = Array.isArray(res?.invalid) ? res.invalid.length : 0;
        const msgParts = [];
        if (updated) msgParts.push(`${updated} remitted`);
        if (already) msgParts.push(`${already} already remitted`);
        if (invalid) msgParts.push(`${invalid} invalid`);
        toast(msgParts.length ? `Bulk remittance complete: ${msgParts.join(", ")}` : "Bulk remittance complete", updated ? "success" : "info");
        clearBackOfficePaymentsSelection();
        await loadBackOfficePayments();
    } catch (err) {
        toast(`Bulk remittance failed: ${err.message}`, "error");
    }
}

async function remitBackOfficeDeliveryPayment(paymentId) {
    if (!paymentId) return;
    const note = window.prompt("Optional remittance note:", "");
    if (note === null) return;
    const confirmed = window.confirm("Mark this delivery payment as remitted?");
    if (!confirmed) return;
    try {
        const res = await apiRequest("/payments/backoffice/remit/", {
            method: "POST",
            body: {
                payment_ids: [paymentId],
                note: note || "",
                remittance_status: "remitted",
            },
        });
        toast((res?.updated || 0) ? "Delivery payment marked as remitted" : "No delivery payments were updated", "success");
        await loadBackOfficePayments();
        if (currentBackOfficePaymentDetailId === paymentId) {
            await openBackOfficePaymentDetail(paymentId);
        }
    } catch (err) {
        toast(`Remittance update failed: ${err.message}`, "error");
    }
}

async function loadBackOfficePayments() {
    if (!canAccessBackOffice()) return;
    try {
        await loadBackOfficeBranches();
        await loadBackOfficePaymentDeliveryPeople();
        syncBackOfficePaymentsModeUI();
        if (backOfficePaymentsMode !== "delivery") {
            clearBackOfficePaymentsSelection();
        }
        const endpoint = withParams("/payments/backoffice/", getBackOfficePaymentsQueryParams());
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        backOfficePaymentsPage = page;
        backOfficePayments = ensureArray(page, "backOfficePayments");
        renderBackOfficePayments();
        updatePager({
            prevEl: els.backofficePaymentsPrev,
            nextEl: els.backofficePaymentsNext,
            pageEl: els.backofficePaymentsPage,
            offset: backOfficePaymentsOffset,
            limit: backOfficePaymentsLimit,
            pageData: page,
        });
    } catch (err) {
        console.error("Failed to load payments", err);
        if (els.backofficePaymentsTable) {
            const tbody = els.backofficePaymentsTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="14">Failed to load payments.</td></tr>`;
            }
        }
    }
}

function exportBackOfficePayments() {
    if (!canAccessBackOffice()) return;
    const filename = backOfficePaymentsMode === "delivery"
        ? "delivery-collections.csv"
        : "backoffice-payments.csv";
    const params = getBackOfficePaymentsQueryParams();
    delete params.limit;
    delete params.offset;
    downloadCsv("/payments/backoffice/export/", filename, params);
}

function renderBackOfficePayments() {
    if (!els.backofficePaymentsTable) return;
    const tbody = els.backofficePaymentsTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficePayments;
    const deliveryMode = backOfficePaymentsMode === "delivery";
    if (els.backofficePaymentsSelectAllCell) {
        els.backofficePaymentsSelectAllCell.classList.toggle("hidden", !deliveryMode);
    }
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${deliveryMode ? 15 : 14}">No payments found</td></tr>`;
        syncBackOfficePaymentsSelectionUI();
        return;
    }
    tbody.innerHTML = rows.map(payment => {
        const paymentId = shortOrderId(payment.id);
        const saleId = shortOrderId(payment.sale_id);
        const customerName = payment.customer?.name || "—";
        const branchName = payment.branch?.name || "—";
        const deliveryPersonName = payment.delivery_person?.name || payment.received_by?.name || "—";
        const methodLabel = formatPaymentMethod(payment.method);
        const statusBadge = renderStatusBadge(payment.status);
        const collectionBadge = `<span class="status-pill ${payment.collection_stage === "delivery" ? "status-active" : payment.collection_stage === "credit" ? "status-pending" : "status-unpaid"}">${esc(formatLabel(payment.collection_stage || "—"))}</span>`;
        const remittanceBadge = renderRemittanceBadge(payment);
        const refValue = payment.reference || payment.provider_checkout_id || payment.provider_request_id || "—";
        const phoneValue = payment.phone_number || "—";
        const remitAction = payment.collection_stage === "delivery" && payment.remittance_status !== "remitted"
            ? `<button class="btn-ghost btn-inline" onclick="remitBackOfficeDeliveryPayment('${payment.id}')">Mark Remitted</button>`
            : "";
        const selectable = deliveryMode && isSelectableDeliveryPayment(payment);
        const checked = backOfficePaymentsBulkSelection.has(String(payment.id)) ? "checked" : "";
        return `
            <tr class="${selectable ? "delivery-collection-row" : ""}">
                ${deliveryMode ? `
                <td class="backoffice-payments-select-cell">
                    <label class="checkbox-row checkbox-row-tight ${selectable ? "" : "muted"}">
                        <input type="checkbox" data-payment-select="${esc(payment.id)}" ${selectable ? "" : "disabled"} ${checked}>
                        <span class="sr-only">Select payment</span>
                    </label>
                </td>` : ""}
                <td>${paymentId}</td>
                <td>${saleId}</td>
                <td>${esc(customerName)}</td>
                <td>${esc(branchName)}</td>
                <td>${esc(deliveryPersonName)}</td>
                <td>${methodLabel}</td>
                <td>${collectionBadge}</td>
                <td>${remittanceBadge}</td>
                <td>${statusBadge}</td>
                <td>${fmtPrice(payment.amount || 0)}</td>
                <td><span class="payment-ref">${esc(refValue)}</span></td>
                <td>${esc(phoneValue)}</td>
                <td>${formatDateTime(payment.payment_date)}</td>
                <td>
                    <div class="payment-actions">
                        <button class="btn-ghost btn-inline" onclick="openBackOfficePaymentDetail('${payment.id}')">View</button>
                        ${remitAction}
                    </div>
                </td>
            </tr>
        `;
    }).join("");
    if (deliveryMode) {
        tbody.querySelectorAll("[data-payment-select]").forEach(cb => {
            cb.addEventListener("change", () => toggleBackOfficePaymentSelection(cb.dataset.paymentSelect, cb.checked));
        });
    }
    syncBackOfficePaymentsSelectionUI();
}

async function openBackOfficePaymentDetail(paymentId) {
    if (!paymentId || !els.backofficePaymentDetailModal) return;
    currentBackOfficePaymentDetailId = paymentId;
    const detail = await apiFetch(`/payments/backoffice/${paymentId}/`);
    if (!detail) {
        toast("Failed to load payment details", "error");
        return;
    }
    renderBackOfficePaymentDetail(detail);
    openOverlay(els.backofficePaymentDetailModal, { closeOthers: false });
}

function closeBackOfficePaymentDetail() {
    if (!els.backofficePaymentDetailModal) return;
    currentBackOfficePaymentDetailId = null;
    closeOverlay(els.backofficePaymentDetailModal);
}

function renderBackOfficePaymentDetail(payment) {
    if (!els.backofficePaymentDetailBody) return;
    if (!payment) {
        els.backofficePaymentDetailBody.innerHTML = `<div class="muted">Payment not found.</div>`;
        return;
    }
    const methodLabel = formatPaymentMethod(payment.method);
    const statusBadge = renderStatusBadge(payment.status);
    const refValue = payment.reference || payment.provider_checkout_id || payment.provider_request_id || "—";
    const sale = payment.sale || {};
    const customerName = payment.customer?.name || "—";
    const branchName = payment.branch?.name || "—";
    const deliveryPerson = payment.delivery_person?.name || payment.received_by?.name || "—";
    const receivedBy = payment.received_by?.name || "—";
    const verifiedBy = payment.verified_by?.name || "—";
    const remittedBy = payment.remitted_by?.name || "—";
    const remittanceBadge = renderRemittanceBadge(payment);
    const metadataJson = payment.provider_metadata ? JSON.stringify(payment.provider_metadata, null, 2) : "";
    const metadataBlock = metadataJson
        ? `<pre class="detail-json">${esc(metadataJson)}</pre>`
        : `<div class="muted">No provider metadata.</div>`;

    const saleAction = sale.id
        ? `<div class="detail-actions"><button class="btn-secondary" onclick="openBackOfficeSaleDetail('${sale.id}')">View Sale</button></div>`
        : "";
    const remitAction = payment.collection_stage === "delivery" && payment.remittance_status !== "remitted"
        ? `<div class="detail-actions"><button class="btn-secondary" onclick="remitBackOfficeDeliveryPayment('${payment.id}')">Mark Remitted</button></div>`
        : "";

    els.backofficePaymentDetailBody.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-row"><span>Amount</span><strong>${fmtPrice(payment.amount || 0)}</strong></div>
                <div class="detail-row"><span>Method</span><strong>${methodLabel}</strong></div>
                <div class="detail-row"><span>Status</span><strong>${statusBadge}</strong></div>
                <div class="detail-row"><span>Reference</span><strong><span class="payment-ref">${esc(refValue)}</span></strong></div>
                <div class="detail-row"><span>Phone</span><strong>${esc(payment.phone_number || "—")}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Payment ID</span><strong>${esc(payment.id)}</strong></div>
                <div class="detail-row"><span>Payment Date</span><strong>${formatDateTime(payment.payment_date)}</strong></div>
                <div class="detail-row"><span>Created</span><strong>${formatDateTime(payment.created_at)}</strong></div>
                <div class="detail-row"><span>Received By</span><strong>${esc(receivedBy)}</strong></div>
                <div class="detail-row"><span>Verified By</span><strong>${esc(verifiedBy)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Sale</span><strong>${sale.id ? esc(sale.id) : "—"}</strong></div>
                <div class="detail-row"><span>Sale Status</span><strong>${sale.status ? formatLabel(sale.status) : "—"}</strong></div>
                <div class="detail-row"><span>Payment Status</span><strong>${sale.payment_status ? renderStatusBadge(sale.payment_status) : "—"}</strong></div>
                <div class="detail-row"><span>Customer</span><strong>${esc(customerName)}</strong></div>
                <div class="detail-row"><span>Branch</span><strong>${esc(branchName)}</strong></div>
                <div class="detail-row"><span>Delivery Person</span><strong>${esc(deliveryPerson)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Collection Stage</span><strong>${esc(formatLabel(payment.collection_stage || "—"))}</strong></div>
                <div class="detail-row"><span>Remittance</span><strong>${remittanceBadge}</strong></div>
                <div class="detail-row"><span>Remitted By</span><strong>${esc(remittedBy)}</strong></div>
                <div class="detail-row"><span>Remitted At</span><strong>${formatDateTime(payment.remitted_at)}</strong></div>
                <div class="detail-row"><span>Remittance Note</span><strong>${esc(payment.remittance_note || "—")}</strong></div>
            </div>
        </div>
        ${saleAction}
        ${remitAction}
        <div class="detail-section">
            <h4>Sale Totals</h4>
            <div class="detail-list">
                <div class="detail-item"><span>Total</span><strong>${sale.grand_total ? fmtPrice(sale.grand_total) : "—"}</strong></div>
                <div class="detail-item"><span>Paid</span><strong>${sale.amount_paid ? fmtPrice(sale.amount_paid) : "—"}</strong></div>
                <div class="detail-item"><span>Balance Due</span><strong>${sale.balance_due ? fmtPrice(sale.balance_due) : "—"}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Provider Metadata</h4>
            <div class="detail-list">
                <div class="detail-item"><span>Provider</span><strong>${esc(payment.provider || "—")}</strong></div>
                <div class="detail-item"><span>Checkout ID</span><strong>${esc(payment.provider_checkout_id || "—")}</strong></div>
                <div class="detail-item"><span>Request ID</span><strong>${esc(payment.provider_request_id || "—")}</strong></div>
                <div class="detail-item"><span>Result Code</span><strong>${esc(payment.provider_result_code || "—")}</strong></div>
                <div class="detail-item"><span>Result Description</span><strong>${esc(payment.provider_result_desc || "—")}</strong></div>
                <div class="detail-item"><span>Verified At</span><strong>${formatDateTime(payment.verified_at)}</strong></div>
                <div class="detail-item"><span>Applied At</span><strong>${formatDateTime(payment.applied_at)}</strong></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>Provider Payload</h4>
            ${metadataBlock}
        </div>
    `;
}

async function loadSetupBranches() {
    const data = await apiFetch(withParams("/business/branches/", {
        include_inactive: "1",
        search: backOfficeSetupBranchQuery,
    }));
    backOfficeBranchesList = ensureArray(data, "backOfficeBranchesList");
    return backOfficeBranchesList;
}

async function loadBackOfficeBranchesSetup() {
    if (!canAccessBackOffice()) return;
    try {
        await loadSetupBranches();
        renderBackOfficeBranchesSetup();
    } catch (err) {
        if (els.setupBranchTable) {
            const tbody = els.setupBranchTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5">Failed to load branches</td></tr>`;
            }
        }
    }
}

function renderBackOfficeBranchesSetup() {
    if (!els.setupBranchTable) return;
    const tbody = els.setupBranchTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeBranchesList;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5">No branches found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(branch => {
        const statusClass = branch.is_active ? "active" : "inactive";
        const statusLabel = branch.is_active ? "Active" : "Inactive";
        return `
            <tr>
                <td>${esc(branch.name)}</td>
                <td>${esc(branch.location || "—")}</td>
                <td>${esc(branch.business || "—")}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn-ghost" onclick="openBranchForm('${branch.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeRoutesSetup() {
    if (!canAccessBackOffice()) return;
    try {
        const data = await apiFetch(withParams("/routes/", {
            include_inactive: "1",
            search: backOfficeSetupRouteQuery,
        }));
        backOfficeRoutesSetup = ensureArray(data, "backOfficeRoutesSetup");
        renderBackOfficeRoutesSetup();
    } catch (err) {
        if (els.setupRouteTable) {
            const tbody = els.setupRouteTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5">Failed to load routes</td></tr>`;
            }
        }
    }
}

function renderBackOfficeRoutesSetup() {
    if (!els.setupRouteTable) return;
    const tbody = els.setupRouteTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeRoutesSetup;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5">No routes found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(route => {
        const statusClass = route.is_active ? "active" : "inactive";
        const statusLabel = route.is_active ? "Active" : "Inactive";
        return `
            <tr>
                <td>${esc(route.name)}</td>
                <td>${esc(route.code || "—")}</td>
                <td>${esc(route.branch_name || "—")}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn-ghost" onclick="openRouteForm('${route.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeCategoriesSetup() {
    if (!canAccessBackOffice()) return;
    try {
        const data = await apiFetch(withParams("/inventory/categories/", {
            include_inactive: "1",
            search: backOfficeSetupCategoryQuery,
        }));
        backOfficeCategoriesSetup = ensureArray(data, "backOfficeCategoriesSetup");
        renderBackOfficeCategoriesSetup();
    } catch (err) {
        if (els.setupCategoryTable) {
            const tbody = els.setupCategoryTable.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="3">Failed to load categories</td></tr>`;
            }
        }
    }
}

function renderBackOfficeCategoriesSetup() {
    if (!els.setupCategoryTable) return;
    const tbody = els.setupCategoryTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficeCategoriesSetup;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="3">No categories found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(category => {
        const statusClass = category.is_active ? "active" : "inactive";
        const statusLabel = category.is_active ? "Active" : "Inactive";
        return `
            <tr>
                <td>${esc(category.name)}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn-ghost" onclick="openCategoryForm('${category.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

async function initInventoryAdjustments() {
    await loadBackOfficeBranches();
    if (els.inventoryAdjustBranch) {
        els.inventoryAdjustBranch.innerHTML = `
            <option value="">Select branch</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
    }
    loadInventoryAdjustProducts(els.inventoryAdjustSearch?.value || "");
    loadInventoryAdjustments();
    updateInventoryAdjustMode();
}

function openInventoryScanModal() {
    if (!els.inventoryScanModal) return;
    openOverlay(els.inventoryScanModal, { closeOthers: false });
    startInventoryScanner();
}

function closeInventoryScanModal() {
    stopInventoryScanner();
    closeOverlay(els.inventoryScanModal);
}

function setInventoryScanStatus(message = "", tone = "info") {
    if (!els.inventoryScanStatus) return;
    els.inventoryScanStatus.textContent = message;
    els.inventoryScanStatus.dataset.tone = tone;
}

async function startInventoryScanner() {
    if (inventoryScanActive) return;
    if (!els.inventoryScanVideo) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setInventoryScanStatus("Camera not supported on this device.", "error");
        return;
    }
    if (!("BarcodeDetector" in window)) {
        setInventoryScanStatus("Barcode scanning not supported in this browser.", "error");
        return;
    }

    try {
        inventoryScanDetector = new BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"],
        });
        inventoryScanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
        });
        els.inventoryScanVideo.srcObject = inventoryScanStream;
        await els.inventoryScanVideo.play();
        inventoryScanActive = true;
        setInventoryScanStatus("Scanning... Hold steady.", "info");
        runInventoryScanLoop();
    } catch (err) {
        setInventoryScanStatus("Camera permission denied or unavailable.", "error");
        stopInventoryScanner();
    }
}

function runInventoryScanLoop() {
    if (!inventoryScanActive || !inventoryScanDetector || !els.inventoryScanVideo) return;
    if (inventoryScanLoopTimer) clearTimeout(inventoryScanLoopTimer);
    inventoryScanLoopTimer = setTimeout(async () => {
        if (!inventoryScanActive) return;
        try {
            const codes = await inventoryScanDetector.detect(els.inventoryScanVideo);
            if (codes && codes.length) {
                const value = codes[0].rawValue || codes[0].data || "";
                if (value) {
                    handleInventoryScanResult(value);
                    return;
                }
            }
        } catch (err) {
            // ignore transient scan errors
        }
        runInventoryScanLoop();
    }, 220);
}

function handleInventoryScanResult(value) {
    const code = String(value || "").trim();
    if (!code) return;
    if (els.inventoryAdjustSearch) {
        els.inventoryAdjustSearch.value = code;
        loadInventoryAdjustProducts(code);
    }
    stopInventoryScanner();
    closeOverlay(els.inventoryScanModal);
    toast(`Scanned: ${code}`, "success");
}

function stopInventoryScanner() {
    inventoryScanActive = false;
    if (inventoryScanLoopTimer) {
        clearTimeout(inventoryScanLoopTimer);
        inventoryScanLoopTimer = null;
    }
    if (inventoryScanStream) {
        inventoryScanStream.getTracks().forEach(track => track.stop());
        inventoryScanStream = null;
    }
    if (els.inventoryScanVideo) {
        els.inventoryScanVideo.pause();
        els.inventoryScanVideo.srcObject = null;
    }
}

// ——— POS Barcode Scan (Mobile) ———
function openPosScanModal() {
    if (!els.posScanModal) return;
    openOverlay(els.posScanModal, { closeOthers: false });
    startPosScanner();
}

function closePosScanModal() {
    stopPosScanner();
    closeOverlay(els.posScanModal);
}

function setPosScanStatus(message = "", tone = "info") {
    if (!els.posScanStatus) return;
    els.posScanStatus.textContent = message;
    els.posScanStatus.dataset.tone = tone;
}

function setPosScanCode(value = "") {
    if (!els.posScanCode) return;
    els.posScanCode.textContent = value ? `Detected: ${value}` : "";
}

async function startPosScanner() {
    if (posScanActive) return;
    if (!els.posScanVideo) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPosScanStatus("Camera not supported on this device.", "error");
        focusSearchInput();
        return;
    }
    if (!("BarcodeDetector" in window)) {
        setPosScanStatus("Barcode scanning is not supported in this browser.", "error");
        focusSearchInput();
        return;
    }
    try {
        posScanDetector = new BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"],
        });
        posScanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
        });
        els.posScanVideo.srcObject = posScanStream;
        await els.posScanVideo.play();
        posScanActive = true;
        posScanLastValue = null;
        posScanLastAt = 0;
        setPosScanStatus("Scanning... Hold steady.", "info");
        setPosScanCode("");
        runPosScanLoop();
    } catch (err) {
        setPosScanStatus("Camera permission denied or unavailable.", "error");
        stopPosScanner();
    }
}

function runPosScanLoop() {
    if (!posScanActive || !posScanDetector || !els.posScanVideo) return;
    if (posScanLoopTimer) clearTimeout(posScanLoopTimer);
    posScanLoopTimer = setTimeout(async () => {
        if (!posScanActive) return;
        try {
            const codes = await posScanDetector.detect(els.posScanVideo);
            if (codes && codes.length) {
                const value = codes[0].rawValue || codes[0].data || "";
                if (value) {
                    handlePosScanResult(value);
                    return;
                }
            }
        } catch (err) {
            // ignore transient scan errors
        }
        runPosScanLoop();
    }, 220);
}

function handlePosScanResult(value) {
    const code = String(value || "").trim();
    if (!code) return;
    const now = Date.now();
    if (posScanLastValue === code && now - posScanLastAt < 2000) {
        runPosScanLoop();
        return;
    }
    posScanLastValue = code;
    posScanLastAt = now;
    setPosScanCode(code);
    if (!canPerformSales()) {
        setPosScanStatus("Sales are not available for your role.", "error");
        return;
    }
    const match = findExactSkuMatch(code);
    if (match) {
        addToCart(match.id);
        stopPosScanner();
        closeOverlay(els.posScanModal);
        toast(`Scanned: ${code}`, "success");
        return;
    }
    setPosScanStatus("Searching for product...", "info");
    fetchMobileSearch(code)
        .then(() => {
            const results = Array.isArray(mobileSearchResults) ? mobileSearchResults : [];
            const found = results.find(p => (p.sku || "").toLowerCase() === code.toLowerCase());
            if (found) {
                addToCart(found.id);
                stopPosScanner();
                closeOverlay(els.posScanModal);
                toast(`Scanned: ${code}`, "success");
                return;
            }
            setPosScanStatus("No matching product found. Try again.", "error");
            runPosScanLoop();
        })
        .catch(() => {
            setPosScanStatus("No matching product found. Try again.", "error");
            runPosScanLoop();
        });
}

function stopPosScanner() {
    posScanActive = false;
    if (posScanLoopTimer) {
        clearTimeout(posScanLoopTimer);
        posScanLoopTimer = null;
    }
    if (posScanStream) {
        posScanStream.getTracks().forEach(track => track.stop());
        posScanStream = null;
    }
    if (els.posScanVideo) {
        els.posScanVideo.pause();
        els.posScanVideo.srcObject = null;
    }
}

function getInventoryAdjustMode() {
    if (!els.inventoryAdjustMode) return "manual";
    const selected = Array.from(els.inventoryAdjustMode).find(input => input.checked);
    return selected ? selected.value : "manual";
}

function updateInventoryAdjustMode() {
    const mode = getInventoryAdjustMode();
    if (els.inventoryCountedFields) {
        els.inventoryCountedFields.classList.toggle("hidden", mode !== "counted");
    }
    const isCounted = mode === "counted";
    if (els.inventoryAdjustType) els.inventoryAdjustType.disabled = isCounted;
    if (els.inventoryAdjustQty) els.inventoryAdjustQty.disabled = isCounted;
    if (isCounted) {
        updateInventoryCountedPreview();
    }
}

function updateInventoryCountedPreview() {
    if (!els.inventoryCountedQty || !els.inventoryVariance || !els.inventoryAdjustPreview) return;
    const mode = getInventoryAdjustMode();
    if (mode !== "counted") return;
    const systemQty = Number(els.inventoryAdjustStock?.textContent || 0);
    const counted = Number(els.inventoryCountedQty.value || 0);
    if (Number.isNaN(counted)) {
        els.inventoryVariance.textContent = "—";
        els.inventoryAdjustPreview.textContent = "—";
        return;
    }
    const diff = counted - systemQty;
    if (diff === 0) {
        els.inventoryVariance.textContent = "0";
        els.inventoryAdjustPreview.textContent = "No adjustment needed";
        if (els.inventoryAdjustType) els.inventoryAdjustType.value = "increase";
        if (els.inventoryAdjustQty) els.inventoryAdjustQty.value = "";
        return;
    }
    const type = diff > 0 ? "increase" : "decrease";
    const qty = Math.abs(diff);
    if (els.inventoryAdjustType) els.inventoryAdjustType.value = type;
    if (els.inventoryAdjustQty) els.inventoryAdjustQty.value = qty;
    els.inventoryVariance.textContent = diff > 0 ? `+${diff}` : `${diff}`;
    els.inventoryAdjustPreview.textContent = `${formatStatus(type)} ${qty}`;
}

async function loadInventoryAdjustProducts(query = "") {
    if (!canAccessBackOffice()) return;
    const endpoint = withParams("/inventory/products/", {
        limit: 20,
        offset: 0,
        search: query,
        branch: els.inventoryAdjustBranch?.value || "",
    });
    const data = await apiFetch(endpoint);
    const page = normalizePaginated(data);
    inventoryAdjustProducts = ensureArray(page, "inventoryAdjustProducts");
    if (els.inventoryAdjustProduct) {
        const options = [`<option value="">Select product</option>`].concat(
            inventoryAdjustProducts.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`)
        );
        const current = els.inventoryAdjustProduct.value || "";
        els.inventoryAdjustProduct.innerHTML = options.join("");
        if (current) {
            els.inventoryAdjustProduct.value = current;
        }
    }
    updateInventoryAdjustStock();
}

async function updateInventoryAdjustStock() {
    if (!els.inventoryAdjustStock) return;
    const productId = els.inventoryAdjustProduct?.value || "";
    const branchId = els.inventoryAdjustBranch?.value || "";
    if (!productId || !branchId) {
        els.inventoryAdjustStock.textContent = "—";
        updateInventoryCountedPreview();
        return;
    }
    try {
        const data = await apiFetch(withParams("/inventory/stock/lookup/", {
            product: productId,
            branch: branchId,
        }));
        const qty = data?.quantity ?? data?.stock ?? 0;
        els.inventoryAdjustStock.textContent = qty.toString();
    } catch (err) {
        els.inventoryAdjustStock.textContent = "—";
    }
    updateInventoryCountedPreview();
}

async function submitInventoryAdjustment() {
    if (!canAccessBackOffice()) return;
    const productId = els.inventoryAdjustProduct?.value || "";
    const branchId = els.inventoryAdjustBranch?.value || "";
    const type = els.inventoryAdjustType?.value || "increase";
    const qty = Number(els.inventoryAdjustQty?.value || 0);
    const reason = els.inventoryAdjustReason?.value?.trim() || "";
    const note = els.inventoryAdjustNote?.value?.trim() || "";
    const mode = getInventoryAdjustMode();

    if (!productId || !branchId) {
        const message = "Product and branch are required.";
        if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
        toast(message, "error");
        return;
    }
    if (mode === "counted") {
        if (!els.inventoryCountedQty?.value) {
            const message = "Counted quantity is required.";
            if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
            toast(message, "error");
            return;
        }
        if (!qty || qty <= 0) {
            const message = "No adjustment needed.";
            if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
            toast(message, "info");
            return;
        }
    }
    if (!qty || qty <= 0) {
        const message = "Quantity must be greater than zero.";
        if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
        toast(message, "error");
        return;
    }
    if (!reason) {
        const message = "Reason is required.";
        if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
        toast(message, "error");
        return;
    }

    if (els.inventoryAdjustSubmit) {
        els.inventoryAdjustSubmit.disabled = true;
        els.inventoryAdjustSubmit.textContent = "Saving...";
    }
    if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = "";

    const payload = {
        product_id: productId,
        branch_id: branchId,
        adjustment_type: type,
        quantity: qty,
        reason,
        note,
    };

    try {
        await apiRequest("/inventory/adjustments/create/", { method: "POST", body: payload });
        toast("Inventory adjusted", "success");
        if (els.inventoryAdjustQty) els.inventoryAdjustQty.value = "";
        if (els.inventoryCountedQty) els.inventoryCountedQty.value = "";
        if (els.inventoryAdjustReason) els.inventoryAdjustReason.value = "";
        if (els.inventoryAdjustNote) els.inventoryAdjustNote.value = "";
        await updateInventoryAdjustStock();
        inventoryAdjustOffset = 0;
        await loadInventoryAdjustments();
    } catch (err) {
        if (els.inventoryAdjustError) {
            els.inventoryAdjustError.textContent = err.message || "Adjustment failed.";
        }
        toast(`Adjustment failed: ${err.message}`, "error");
    } finally {
        if (els.inventoryAdjustSubmit) {
            els.inventoryAdjustSubmit.disabled = false;
            els.inventoryAdjustSubmit.textContent = "Save Adjustment";
        }
    }
}

async function loadInventoryAdjustments() {
    if (!canAccessBackOffice()) return;
    const endpoint = withParams("/inventory/adjustments/", {
        limit: inventoryAdjustLimit,
        offset: inventoryAdjustOffset,
        branch: els.inventoryAdjustBranch?.value || "",
        product: els.inventoryAdjustProduct?.value || "",
    });
    const data = await apiFetch(endpoint);
    const page = normalizePaginated(data);
    inventoryAdjustPage = page;
    inventoryAdjustments = ensureArray(page, "inventoryAdjustments");
    renderInventoryAdjustments();
    updatePager({
        prevEl: els.inventoryAdjustPrev,
        nextEl: els.inventoryAdjustNext,
        pageEl: els.inventoryAdjustPage,
        offset: inventoryAdjustOffset,
        limit: inventoryAdjustLimit,
        pageData: page,
    });
}

function renderInventoryAdjustments() {
    if (!els.inventoryAdjustTable) return;
    const tbody = els.inventoryAdjustTable.querySelector("tbody");
    if (!tbody) return;
    const rows = inventoryAdjustments;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7">No adjustments found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(adj => {
        const typeLabel = adj.adjustment_type === "decrease" ? "Decrease" : "Increase";
        return `
            <tr>
                <td>${formatDateTime(adj.created_at)}</td>
                <td>${esc(adj.product_name || "—")} ${adj.product_sku ? `(${esc(adj.product_sku)})` : ""}</td>
                <td>${esc(adj.branch_name || "—")}</td>
                <td>${typeLabel}</td>
                <td>${adj.quantity ?? "—"}</td>
                <td>${esc(adj.reason || "—")}</td>
                <td>${esc(adj.created_by_name || "—")}</td>
            </tr>
        `;
    }).join("");
}

async function loadBackOfficeCategories() {
    const data = await apiFetch("/inventory/categories/");
    backOfficeCategories = ensureArray(data, "backOfficeCategories");
    if (!els.productCategory) return;
    if (!backOfficeCategories.length) {
        els.productCategory.innerHTML = `<option value="">No categories found</option>`;
        return;
    }
    els.productCategory.innerHTML = `
        <option value="">Select category</option>
        ${backOfficeCategories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}
    `;
}

async function loadBackOfficeBranches() {
    const data = await apiFetch("/business/branches/");
    branches = ensureArray(data, "branches");
    const currentCustomerBranch = els.backofficeCustomerBranch?.value || "";
    const currentSalesBranch = els.backofficeSalesBranch?.value || "";
    const currentOrdersBranch = els.backofficeOrdersBranch?.value || "";
    const currentDeliveryBranch = els.backofficeDeliveryBranch?.value || "";
    const currentDeliveryQueueBranch = els.backofficeDeliveryQueueBranch?.value || "";
    const currentPaymentsBranch = els.backofficePaymentsBranch?.value || "";
    const currentPurchaseBranch = els.backofficePurchasesBranch?.value || "";
    const currentBillsBranch = els.backofficeBillsBranch?.value || "";
    if (!els.productBranch) return;
    els.productBranch.innerHTML = `
        <option value="">Select branch (optional)</option>
        ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
    `;

    if (els.backofficeCustomerBranch) {
        els.backofficeCustomerBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentCustomerBranch) {
            els.backofficeCustomerBranch.value = currentCustomerBranch;
        }
    }

    if (els.backofficeSalesBranch) {
        els.backofficeSalesBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentSalesBranch) {
            els.backofficeSalesBranch.value = currentSalesBranch;
        }
    }

    if (els.backofficeOrdersBranch) {
        els.backofficeOrdersBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentOrdersBranch) {
            els.backofficeOrdersBranch.value = currentOrdersBranch;
        }
    }

    if (els.backofficeDeliveryBranch) {
        els.backofficeDeliveryBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentDeliveryBranch) {
            els.backofficeDeliveryBranch.value = currentDeliveryBranch;
        }
    }

    if (els.backofficeDeliveryQueueBranch) {
        els.backofficeDeliveryQueueBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentDeliveryQueueBranch) {
            els.backofficeDeliveryQueueBranch.value = currentDeliveryQueueBranch;
        }
    }

    if (els.backofficePaymentsBranch) {
        els.backofficePaymentsBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentPaymentsBranch) {
            els.backofficePaymentsBranch.value = currentPaymentsBranch;
        }
    }

    if (els.backofficePurchasesBranch) {
        els.backofficePurchasesBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentPurchaseBranch) {
            els.backofficePurchasesBranch.value = currentPurchaseBranch;
        }
    }

    if (els.backofficeBillsBranch) {
        els.backofficeBillsBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentBillsBranch) {
            els.backofficeBillsBranch.value = currentBillsBranch;
        }
    }

    if (els.purchaseBranch) {
        els.purchaseBranch.innerHTML = `
            <option value="">Select branch</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
    }

    if (els.staffBranch) {
        els.staffBranch.innerHTML = `
            <option value="">Select branch (optional)</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
    }
}

function renderBackOfficeProducts() {
    if (!els.backofficeProductTable) return;
    const tbody = els.backofficeProductTable.querySelector("tbody");
    if (!tbody) return;
    const query = (backOfficeQuery || "").toLowerCase().trim();
    let rows = backOfficeProducts;
    if (query) {
        rows = rows.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
    }
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8">No products found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(product => {
        const statusClass = product.is_active ? "active" : "inactive";
        const statusLabel = product.is_active ? "Active" : "Inactive";
        return `
            <tr>
                <td>${esc(product.sku)}</td>
                <td>${esc(product.name)}</td>
                <td>${esc(product.category || "—")}</td>
                <td>${fmtPrice(product.selling_price || 0)}</td>
                <td>${product.wholesale_price ? fmtPrice(product.wholesale_price) : "—"}</td>
                <td>${product.stock ?? 0}</td>
                <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
                <td><button class="btn-ghost" onclick="openProductForm('${product.id}')">Edit</button></td>
            </tr>
        `;
    }).join("");
}

function getBaseUnitForProduct(product) {
    if (!product || !Array.isArray(product.units)) return null;
    return product.units.find(u => u.is_base_unit) || product.units[0] || null;
}

function buildProductUnitRow(unit = {}) {
    const idAttr = unit.id ? `data-unit-id="${unit.id}"` : "";
    return `
        <div class="unit-row" ${idAttr}>
            <input class="summary-input unit-name" placeholder="Unit name" value="${esc(unit.unit_name || "")}">
            <input class="summary-input unit-code" placeholder="Code" value="${esc(unit.unit_code || "")}">
            <input class="summary-input unit-conversion" type="number" min="1" step="1" placeholder="Conversion" value="${unit.conversion_to_base_unit || ""}">
            <input class="summary-input unit-retail" type="number" step="0.01" placeholder="Retail price" value="${unit.retail_price ?? ""}">
            <input class="summary-input unit-wholesale" type="number" step="0.01" placeholder="Wholesale price" value="${unit.wholesale_price ?? ""}">
            <input class="summary-input unit-threshold" type="number" min="1" step="1" placeholder="Wholesale threshold" value="${unit.wholesale_threshold ?? ""}">
            <label class="checkbox-row unit-active">
                <input type="checkbox" ${unit.is_active === false ? "" : "checked"}>
                Active
            </label>
            <button type="button" class="btn-ghost unit-remove">Remove</button>
        </div>
    `;
}

function renderProductUnitRows(units) {
    if (!els.productUnitsList) return;
    const rows = (units || []).map(unit => buildProductUnitRow(unit)).join("");
    els.productUnitsList.innerHTML = rows;
}

function addProductUnitRow(unit = {}) {
    if (!els.productUnitsList) return;
    els.productUnitsList.insertAdjacentHTML("beforeend", buildProductUnitRow(unit));
}

function openProductForm(productId = null) {
    if (!els.productFormModal) return;
    editingProductId = productId;
    if (els.productFormError) els.productFormError.textContent = "";
    if (!productId) {
        if (els.productFormTitle) els.productFormTitle.textContent = "Add Product";
        if (els.productForm) els.productForm.reset();
        if (els.productActive) els.productActive.checked = true;
        if (els.productCategory) els.productCategory.value = "";
        if (els.productBranch) els.productBranch.value = "";
        if (els.productUnitName) els.productUnitName.value = "Base Unit";
        if (els.productUnitCode) els.productUnitCode.value = "";
        if (els.productForm) els.productForm.dataset.baseUnitId = "";
        renderProductUnitRows([]);
        productSupplierLinks = [];
        renderProductSupplierLinks();
    } else {
        const product = backOfficeProducts.find(p => p.id === productId);
        if (!product) return;
        if (els.productFormTitle) els.productFormTitle.textContent = "Edit Product";
        if (els.productSku) els.productSku.value = product.sku || "";
        if (els.productName) els.productName.value = product.name || "";
        if (els.productCategory) els.productCategory.value = product.category || "";
        const baseUnit = getBaseUnitForProduct(product);
        if (els.productUnitName) els.productUnitName.value = baseUnit?.unit_name || "Base Unit";
        if (els.productUnitCode) els.productUnitCode.value = baseUnit?.unit_code || "";
        if (els.productForm) els.productForm.dataset.baseUnitId = baseUnit?.id || "";
        if (els.productCost) els.productCost.value = product.cost_price || "";
        if (els.productSelling) els.productSelling.value = product.selling_price || "";
        if (els.productRetail) els.productRetail.value = baseUnit?.retail_price || product.retail_price || "";
        if (els.productWholesale) els.productWholesale.value = baseUnit?.wholesale_price || product.wholesale_price || "";
        if (els.productThreshold) els.productThreshold.value = baseUnit?.wholesale_threshold || product.wholesale_threshold || "";
        if (els.productActive) els.productActive.checked = product.is_active !== false;
        if (els.productBranch) els.productBranch.value = "";
        if (els.productStock) els.productStock.value = "";
        renderProductUnitRows((product.units || []).filter(u => !u.is_base_unit));
        loadProductSupplierLinks(productId);
    }
    loadSupplierOptionsForProductForm();
    openOverlay(els.productFormModal);
}

function closeProductForm() {
    if (!els.productFormModal) return;
    closeOverlay(els.productFormModal);
    editingProductId = null;
}

function collectProductUnitsFromForm() {
    const errors = [];
    const units = [];

    const baseName = (els.productUnitName?.value || "").trim();
    const baseCode = (els.productUnitCode?.value || "").trim();
    if (!baseName) {
        errors.push("Base unit name is required.");
    }
    const baseUnitId = els.productForm?.dataset?.baseUnitId || "";
    units.push({
        id: baseUnitId || undefined,
        unit_name: baseName || "Base Unit",
        unit_code: baseCode || "",
        conversion_to_base_unit: 1,
        is_base_unit: true,
        retail_price: els.productRetail?.value || "",
        wholesale_price: els.productWholesale?.value || "",
        wholesale_threshold: els.productThreshold?.value || "",
        is_active: true,
    });

    const rows = els.productUnitsList?.querySelectorAll(".unit-row") || [];
    rows.forEach((row, index) => {
        const name = (row.querySelector(".unit-name")?.value || "").trim();
        const code = (row.querySelector(".unit-code")?.value || "").trim();
        const conversionRaw = (row.querySelector(".unit-conversion")?.value || "").trim();
        const retail = (row.querySelector(".unit-retail")?.value || "").trim();
        const wholesale = (row.querySelector(".unit-wholesale")?.value || "").trim();
        const threshold = (row.querySelector(".unit-threshold")?.value || "").trim();
        const isActive = row.querySelector(".unit-active input")?.checked ?? true;

        const hasAny = name || code || conversionRaw || retail || wholesale || threshold;
        if (!hasAny) return;

        if (!name) {
            errors.push(`Additional unit ${index + 1}: name is required.`);
        }
        if (!conversionRaw) {
            errors.push(`Additional unit ${index + 1}: conversion is required.`);
        }
        const conversion = parseInt(conversionRaw, 10);
        if (!Number.isInteger(conversion) || conversion <= 0) {
            errors.push(`Additional unit ${index + 1}: conversion must be a positive integer.`);
        }

        units.push({
            id: row.dataset.unitId || undefined,
            unit_name: name,
            unit_code: code,
            conversion_to_base_unit: conversion,
            is_base_unit: false,
            retail_price: retail,
            wholesale_price: wholesale,
            wholesale_threshold: threshold,
            is_active: isActive,
        });
    });

    return { units, errors };
}

async function saveProductForm() {
    if (!canAccessBackOffice()) return;
    if (!payloadFieldCheck()) return;
    if (els.productFormSave) {
        els.productFormSave.disabled = true;
        els.productFormSave.textContent = "Saving...";
    }
    const unitPayload = collectProductUnitsFromForm();
    if (unitPayload.errors.length) {
        const message = unitPayload.errors.join(" ");
        if (els.productFormError) els.productFormError.textContent = message;
        toast(message, "error");
        if (els.productFormSave) {
            els.productFormSave.disabled = false;
            els.productFormSave.textContent = "Save Product";
        }
        return;
    }

    const payload = {
        sku: els.productSku?.value?.trim() || "",
        name: els.productName?.value?.trim() || "",
        category: els.productCategory?.value || "",
        unit: els.productUnitName?.value || "",
        cost_price: els.productCost?.value || "",
        selling_price: els.productSelling?.value || "",
        retail_price: els.productRetail?.value || "",
        wholesale_price: els.productWholesale?.value || "",
        wholesale_threshold: els.productThreshold?.value || "",
        branch: els.productBranch?.value || "",
        stock_quantity: els.productStock?.value || "",
        is_active: els.productActive?.checked ?? true,
        units: unitPayload.units,
    };

    if (els.productFormError) els.productFormError.textContent = "";
    try {
        if (editingProductId) {
            await apiRequest(`/inventory/products/${editingProductId}/`, { method: "PUT", body: payload });
            toast("Product updated", "success");
        } else {
            await apiRequest(`/inventory/products/create/`, { method: "POST", body: payload });
            toast("Product created", "success");
        }
        closeProductForm();
        await loadBackOfficeProducts();
        await loadProducts();
    } catch (err) {
        if (els.productFormError) {
            els.productFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.productFormSave) {
            els.productFormSave.disabled = false;
            els.productFormSave.textContent = "Save Product";
        }
    }
}

function payloadFieldCheck() {
    const required = [
        { field: "SKU", value: els.productSku?.value },
        { field: "Name", value: els.productName?.value },
        { field: "Category", value: els.productCategory?.value },
        { field: "Base Unit Name", value: els.productUnitName?.value },
        { field: "Cost Price", value: els.productCost?.value },
        { field: "Selling Price", value: els.productSelling?.value },
    ];
    const missing = required.filter(item => !item.value || !item.value.toString().trim());
    if (missing.length) {
        const message = `Missing required fields: ${missing.map(m => m.field).join(", ")}`;
        if (els.productFormError) els.productFormError.textContent = message;
        toast(message, "error");
        return false;
    }
    if ((els.productStock?.value || "").toString().trim() && !(els.productBranch?.value || "").toString().trim()) {
        const message = "Branch is required when stock quantity is provided.";
        if (els.productFormError) els.productFormError.textContent = message;
        toast(message, "error");
        return false;
    }
    return true;
}

function openCustomerForm(customerId = null) {
    if (!els.customerFormModal) return;
    editingCustomerId = customerId;
    if (els.customerFormError) els.customerFormError.textContent = "";
    if (!customerId) {
        if (els.customerFormTitle) els.customerFormTitle.textContent = "Add Customer";
        if (els.customerForm) els.customerForm.reset();
        if (els.customerActive) els.customerActive.checked = true;
        if (els.customerWholesale) els.customerWholesale.checked = false;
        if (els.customerBalance) els.customerBalance.checked = false;
        if (els.customerRoute) els.customerRoute.value = "";
    } else {
        const customer = backOfficeCustomers.find(c => c.id === customerId);
        if (!customer) return;
        if (els.customerFormTitle) els.customerFormTitle.textContent = "Edit Customer";
        if (els.customerName) els.customerName.value = customer.name || "";
        if (els.customerRoute) els.customerRoute.value = customer.route_id || "";
        if (els.customerWholesale) els.customerWholesale.checked = !!customer.is_wholesale_customer;
        if (els.customerActive) els.customerActive.checked = customer.is_active !== false;
        if (els.customerBalance) els.customerBalance.checked = !!customer.can_view_balance;
    }
    openOverlay(els.customerFormModal);
}

function closeCustomerForm() {
    if (!els.customerFormModal) return;
    closeOverlay(els.customerFormModal);
    editingCustomerId = null;
}

async function saveCustomerForm() {
    if (!canAccessBackOffice()) return;
    const name = els.customerName?.value?.trim() || "";
    if (!name) {
        if (els.customerFormError) els.customerFormError.textContent = "Name is required.";
        toast("Name is required.", "error");
        return;
    }
    if (els.customerFormSave) {
        els.customerFormSave.disabled = true;
        els.customerFormSave.textContent = "Saving...";
    }
    const payload = {
        name,
        route_id: els.customerRoute?.value || "",
        is_wholesale_customer: !!els.customerWholesale?.checked,
        is_active: !!els.customerActive?.checked,
        can_view_balance: !!els.customerBalance?.checked,
    };
    try {
        if (editingCustomerId) {
            await apiRequest(`/customers/${editingCustomerId}/`, { method: "PUT", body: payload });
            toast("Customer updated", "success");
        } else {
            await apiRequest(`/customers/create/`, { method: "POST", body: payload });
            toast("Customer created", "success");
        }
        closeCustomerForm();
        await loadBackOfficeCustomers();
    } catch (err) {
        if (els.customerFormError) {
            els.customerFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.customerFormSave) {
            els.customerFormSave.disabled = false;
            els.customerFormSave.textContent = "Save Customer";
        }
    }
}

function openSupplierForm(supplierId = null) {
    if (!els.supplierFormModal) return;
    editingSupplierId = supplierId;
    if (els.supplierFormError) els.supplierFormError.textContent = "";
    if (!supplierId) {
        if (els.supplierFormTitle) els.supplierFormTitle.textContent = "Add Supplier";
        if (els.supplierForm) els.supplierForm.reset();
        if (els.supplierActive) els.supplierActive.checked = true;
        loadSupplierLinkedProducts(null);
        resetSupplierFinancials();
    } else {
        const supplier = backOfficeSuppliers.find(s => s.id === supplierId);
        if (!supplier) return;
        if (els.supplierFormTitle) els.supplierFormTitle.textContent = "Edit Supplier";
        if (els.supplierName) els.supplierName.value = supplier.name || "";
        if (els.supplierContact) els.supplierContact.value = supplier.contact_person || "";
        if (els.supplierPhone) els.supplierPhone.value = supplier.phone || "";
        if (els.supplierEmail) els.supplierEmail.value = supplier.email || "";
        if (els.supplierAddress) els.supplierAddress.value = supplier.address || "";
        if (els.supplierNotes) els.supplierNotes.value = supplier.notes || "";
        if (els.supplierActive) els.supplierActive.checked = supplier.is_active !== false;
        loadSupplierLinkedProducts(supplierId);
        loadSupplierFinancials(supplierId);
    }
    openOverlay(els.supplierFormModal);
}

function closeSupplierForm() {
    if (!els.supplierFormModal) return;
    closeOverlay(els.supplierFormModal);
    editingSupplierId = null;
}

async function saveSupplierForm() {
    if (!canAccessBackOffice()) return;
    const name = els.supplierName?.value?.trim() || "";
    const email = els.supplierEmail?.value?.trim() || "";
    if (!name) {
        if (els.supplierFormError) els.supplierFormError.textContent = "Name is required.";
        toast("Name is required.", "error");
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (els.supplierFormError) els.supplierFormError.textContent = "Enter a valid email address.";
        toast("Enter a valid email address.", "error");
        return;
    }
    if (els.supplierFormSave) {
        els.supplierFormSave.disabled = true;
        els.supplierFormSave.textContent = "Saving...";
    }
    const payload = {
        name,
        contact_person: els.supplierContact?.value?.trim() || "",
        phone: els.supplierPhone?.value?.trim() || "",
        email,
        address: els.supplierAddress?.value?.trim() || "",
        notes: els.supplierNotes?.value?.trim() || "",
        is_active: !!els.supplierActive?.checked,
    };
    try {
        if (editingSupplierId) {
            await apiRequest(`/suppliers/${editingSupplierId}/`, { method: "PUT", body: payload });
            toast("Supplier updated", "success");
        } else {
            await apiRequest(`/suppliers/create/`, { method: "POST", body: payload });
            toast("Supplier created", "success");
        }
        closeSupplierForm();
        await loadBackOfficeSuppliers();
    } catch (err) {
        if (els.supplierFormError) {
            els.supplierFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.supplierFormSave) {
            els.supplierFormSave.disabled = false;
            els.supplierFormSave.textContent = "Save Supplier";
        }
    }
}

async function approveCustomerAccount(customerId) {
    if (!canAccessBackOffice()) {
        toast("You do not have permission to approve customers", "error");
        return;
    }
    if (!customerId) return;
    const confirmed = window.confirm("Approve this customer account?");
    if (!confirmed) return;
    try {
        await apiRequest(`/customers/${customerId}/approve/`, { method: "POST" });
        toast("Customer approved", "success");
        await loadBackOfficeCustomers();
    } catch (err) {
        toast(`Approval failed: ${err.message}`, "error");
    }
}

async function linkCustomerAccount(customerId) {
    if (!canAccessBackOffice()) {
        toast("You do not have permission to link customers", "error");
        return;
    }
    if (!customerId) return;
    const identifier = window.prompt("Enter the customer's username or email to link:");
    if (!identifier || !identifier.trim()) return;
    try {
        await apiRequest(`/customers/${customerId}/link/`, {
            method: "POST",
            body: { user_identifier: identifier.trim() },
        });
        toast("Customer linked", "success");
        await loadBackOfficeCustomers();
    } catch (err) {
        toast(`Link failed: ${err.message}`, "error");
    }
}

async function openStaffForm(userId = null) {
    if (!els.staffFormModal) return;
    editingStaffId = userId;
    if (els.staffFormError) els.staffFormError.textContent = "";
    await loadBackOfficeBranches();
    renderStaffRoleOptions();

    if (!userId) {
        if (els.staffFormTitle) els.staffFormTitle.textContent = "Add User";
        if (els.staffForm) els.staffForm.reset();
        if (els.staffActive) els.staffActive.checked = true;
        if (els.staffRole) els.staffRole.value = "";
        if (els.staffBranch) els.staffBranch.value = "";
        if (els.staffPasswordRequired) els.staffPasswordRequired.classList.remove("hidden");
        if (els.staffPassword) {
            els.staffPassword.required = true;
            els.staffPassword.value = "";
        }
        if (els.staffPasswordHint) els.staffPasswordHint.textContent = "Required for new users.";
    } else {
        const staff = backOfficeStaff.find(u => u.id === userId);
        if (!staff) return;
        if (els.staffFormTitle) els.staffFormTitle.textContent = "Edit User";
        if (els.staffUsername) els.staffUsername.value = staff.username || "";
        if (els.staffEmail) els.staffEmail.value = staff.email || "";
        if (els.staffFirst) els.staffFirst.value = staff.first_name || "";
        if (els.staffMiddle) els.staffMiddle.value = staff.middle_name || "";
        if (els.staffLast) els.staffLast.value = staff.last_name || "";
        if (els.staffPhone) els.staffPhone.value = staff.phone || "";
        if (els.staffRole) els.staffRole.value = staff.role || "";
        if (els.staffBranch) els.staffBranch.value = staff.branch_id || "";
        if (els.staffActive) els.staffActive.checked = staff.is_active !== false;
        if (els.staffPasswordRequired) els.staffPasswordRequired.classList.add("hidden");
        if (els.staffPassword) {
            els.staffPassword.required = false;
            els.staffPassword.value = "";
        }
        if (els.staffPasswordHint) els.staffPasswordHint.textContent = "Leave blank to keep current password.";
    }
    openOverlay(els.staffFormModal);
}

function closeStaffForm() {
    if (!els.staffFormModal) return;
    closeOverlay(els.staffFormModal);
    editingStaffId = null;
}

async function saveStaffForm() {
    if (!canAccessBackOffice()) return;
    const username = els.staffUsername?.value?.trim() || "";
    const email = els.staffEmail?.value?.trim() || "";
    const firstName = els.staffFirst?.value?.trim() || "";
    const lastName = els.staffLast?.value?.trim() || "";
    const role = els.staffRole?.value || "";
    const password = els.staffPassword?.value || "";

    if (!username || !email || !firstName || !lastName || !role) {
        const message = "Please fill in all required fields.";
        if (els.staffFormError) els.staffFormError.textContent = message;
        toast(message, "error");
        return;
    }

    if (!editingStaffId && !password) {
        const message = "Password is required for new users.";
        if (els.staffFormError) els.staffFormError.textContent = message;
        toast(message, "error");
        return;
    }

    if (els.staffFormSave) {
        els.staffFormSave.disabled = true;
        els.staffFormSave.textContent = "Saving...";
    }

    const payload = {
        username,
        email,
        first_name: firstName,
        middle_name: els.staffMiddle?.value?.trim() || "",
        last_name: lastName,
        phone: els.staffPhone?.value?.trim() || "",
        role,
        branch_id: els.staffBranch?.value || "",
        is_active: !!els.staffActive?.checked,
    };
    if (password) {
        payload.password = password;
    }

    if (els.staffFormError) els.staffFormError.textContent = "";
    try {
        if (editingStaffId) {
            await apiRequest(`/accounts/users/${editingStaffId}/`, { method: "PUT", body: payload });
            toast("User updated", "success");
        } else {
            await apiRequest(`/accounts/users/create/`, { method: "POST", body: payload });
            toast("User created", "success");
        }
        closeStaffForm();
        await loadBackOfficeStaff();
    } catch (err) {
        if (els.staffFormError) {
            els.staffFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.staffFormSave) {
            els.staffFormSave.disabled = false;
            els.staffFormSave.textContent = "Save User";
        }
    }
}

function openBranchForm(branchId = null) {
    if (!els.branchFormModal) return;
    editingBranchId = branchId;
    if (els.branchFormError) els.branchFormError.textContent = "";
    if (!branchId) {
        if (els.branchFormTitle) els.branchFormTitle.textContent = "Add Branch";
        if (els.branchForm) els.branchForm.reset();
        if (els.branchActive) els.branchActive.checked = true;
    } else {
        const branch = backOfficeBranchesList.find(b => b.id === branchId);
        if (!branch) return;
        if (els.branchFormTitle) els.branchFormTitle.textContent = "Edit Branch";
        if (els.branchName) els.branchName.value = branch.name || "";
        if (els.branchLocation) els.branchLocation.value = branch.location || "";
        if (els.branchActive) els.branchActive.checked = branch.is_active !== false;
    }
    openOverlay(els.branchFormModal);
}

function closeBranchForm() {
    if (!els.branchFormModal) return;
    closeOverlay(els.branchFormModal);
    editingBranchId = null;
}

async function saveBranchForm() {
    if (!canAccessBackOffice()) return;
    const name = els.branchName?.value?.trim() || "";
    const location = els.branchLocation?.value?.trim() || "";
    if (!name || !location) {
        const message = "Branch name and location are required.";
        if (els.branchFormError) els.branchFormError.textContent = message;
        toast(message, "error");
        return;
    }
    if (els.branchFormSave) {
        els.branchFormSave.disabled = true;
        els.branchFormSave.textContent = "Saving...";
    }
    const payload = {
        branch_name: name,
        location,
        is_active: !!els.branchActive?.checked,
    };
    try {
        if (editingBranchId) {
            await apiRequest(`/business/branches/${editingBranchId}/`, { method: "PUT", body: payload });
            toast("Branch updated", "success");
        } else {
            await apiRequest(`/business/branches/create/`, { method: "POST", body: payload });
            toast("Branch created", "success");
        }
        closeBranchForm();
        await loadBackOfficeBranchesSetup();
        await loadBackOfficeBranches();
    } catch (err) {
        if (els.branchFormError) {
            els.branchFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.branchFormSave) {
            els.branchFormSave.disabled = false;
            els.branchFormSave.textContent = "Save Branch";
        }
    }
}

async function openRouteForm(routeId = null) {
    if (!els.routeFormModal) return;
    editingRouteId = routeId;
    if (els.routeFormError) els.routeFormError.textContent = "";
    await loadSetupBranches();
    if (els.routeBranch) {
        els.routeBranch.innerHTML = `
            <option value="">Select branch (optional)</option>
            ${backOfficeBranchesList.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
    }
    if (!routeId) {
        if (els.routeFormTitle) els.routeFormTitle.textContent = "Add Route";
        if (els.routeForm) els.routeForm.reset();
        if (els.routeActive) els.routeActive.checked = true;
    } else {
        const route = backOfficeRoutesSetup.find(r => r.id === routeId);
        if (!route) return;
        if (els.routeFormTitle) els.routeFormTitle.textContent = "Edit Route";
        if (els.routeName) els.routeName.value = route.name || "";
        if (els.routeCode) els.routeCode.value = route.code || "";
        if (els.routeBranch) els.routeBranch.value = route.branch_id || "";
        if (els.routeActive) els.routeActive.checked = route.is_active !== false;
    }
    openOverlay(els.routeFormModal);
}

function closeRouteForm() {
    if (!els.routeFormModal) return;
    closeOverlay(els.routeFormModal);
    editingRouteId = null;
}

async function saveRouteForm() {
    if (!canAccessBackOffice()) return;
    const name = els.routeName?.value?.trim() || "";
    if (!name) {
        const message = "Route name is required.";
        if (els.routeFormError) els.routeFormError.textContent = message;
        toast(message, "error");
        return;
    }
    if (els.routeFormSave) {
        els.routeFormSave.disabled = true;
        els.routeFormSave.textContent = "Saving...";
    }
    const payload = {
        name,
        code: els.routeCode?.value?.trim() || "",
        branch_id: els.routeBranch?.value || "",
        is_active: !!els.routeActive?.checked,
    };
    try {
        if (editingRouteId) {
            await apiRequest(`/routes/${editingRouteId}/`, { method: "PUT", body: payload });
            toast("Route updated", "success");
        } else {
            await apiRequest(`/routes/create/`, { method: "POST", body: payload });
            toast("Route created", "success");
        }
        closeRouteForm();
        await loadBackOfficeRoutesSetup();
        await loadBackOfficeRoutes();
    } catch (err) {
        if (els.routeFormError) {
            els.routeFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.routeFormSave) {
            els.routeFormSave.disabled = false;
            els.routeFormSave.textContent = "Save Route";
        }
    }
}

function openCategoryForm(categoryId = null) {
    if (!els.categoryFormModal) return;
    editingCategoryId = categoryId;
    if (els.categoryFormError) els.categoryFormError.textContent = "";
    if (!categoryId) {
        if (els.categoryFormTitle) els.categoryFormTitle.textContent = "Add Category";
        if (els.categoryForm) els.categoryForm.reset();
        if (els.categoryActive) els.categoryActive.checked = true;
    } else {
        const category = backOfficeCategoriesSetup.find(c => c.id === categoryId);
        if (!category) return;
        if (els.categoryFormTitle) els.categoryFormTitle.textContent = "Edit Category";
        if (els.categoryName) els.categoryName.value = category.name || "";
        if (els.categoryActive) els.categoryActive.checked = category.is_active !== false;
    }
    openOverlay(els.categoryFormModal);
}

function closeCategoryForm() {
    if (!els.categoryFormModal) return;
    closeOverlay(els.categoryFormModal);
    editingCategoryId = null;
}

async function saveCategoryForm() {
    if (!canAccessBackOffice()) return;
    const name = els.categoryName?.value?.trim() || "";
    if (!name) {
        const message = "Category name is required.";
        if (els.categoryFormError) els.categoryFormError.textContent = message;
        toast(message, "error");
        return;
    }
    if (els.categoryFormSave) {
        els.categoryFormSave.disabled = true;
        els.categoryFormSave.textContent = "Saving...";
    }
    const payload = {
        name,
        is_active: !!els.categoryActive?.checked,
    };
    try {
        if (editingCategoryId) {
            await apiRequest(`/inventory/categories/${editingCategoryId}/`, { method: "PUT", body: payload });
            toast("Category updated", "success");
        } else {
            await apiRequest(`/inventory/categories/create/`, { method: "POST", body: payload });
            toast("Category created", "success");
        }
        closeCategoryForm();
        await loadBackOfficeCategoriesSetup();
        await loadBackOfficeCategories();
    } catch (err) {
        if (els.categoryFormError) {
            els.categoryFormError.textContent = err.message || "Save failed.";
        }
        toast(`Save failed: ${err.message}`, "error");
    } finally {
        if (els.categoryFormSave) {
            els.categoryFormSave.disabled = false;
            els.categoryFormSave.textContent = "Save Category";
        }
    }
}

// ——— Categories ———
function buildCategoryFilters() {
    if (!els.categoryFilters) return;
    const products = ensureArray(allProducts, "allProducts");
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
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
    updateSearchResults();
}

function updateSearchResults({ forceOpen = false, keepOpen = false } = {}) {
    if (!els.productSearchResults || !els.productSearch) return;
    const products = ensureArray(allProducts, "allProducts");
    const query = els.productSearch.value.toLowerCase().trim();
    let filtered = products;

    if (query) {
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query)
        );
    }

    lastFilteredProducts = filtered;
    searchResults = filtered.slice(0, 20);
    if (searchResultIndex >= searchResults.length) {
        searchResultIndex = searchResults.length ? searchResults.length - 1 : -1;
    }

    const shouldOpen = forceOpen || keepOpen || (!!query && filtered.length > 0);
    searchResultsOpen = shouldOpen;

    if (isMobileLayout()) {
        scheduleMobileSearch(query);
    } else {
        resetMobileSearch();
    }

    if (!shouldOpen || !query) {
        hideSearchResults();
        renderMobileProducts();
        return;
    }

    if (!searchResults.length) {
        els.productSearchResults.innerHTML = `<div class="search-result-empty">No matches</div>`;
        els.productSearchResults.classList.remove("hidden");
        renderMobileProducts();
        return;
    }

    els.productSearchResults.innerHTML = searchResults.map((p, idx) => {
        const stockClass = p.stock <= 0 ? "stock-out" : p.stock <= 10 ? "stock-low" : "stock-ok";
        const stockLabel = p.stock <= 0 ? "Out of stock" : `${p.stock} in stock`;
        const active = idx === searchResultIndex ? "active" : "";
        return `
            <div class="search-result-row ${active}" onclick="selectSearchResult('${p.id}')">
                <div class="search-result-main">
                    <span class="product-name">${esc(p.name)}</span>
                    <span class="product-sku">SKU: ${esc(p.sku)}</span>
                </div>
                <span class="product-stock ${stockClass}">${stockLabel}</span>
                <span class="product-price">${fmtPrice(p.selling_price)}</span>
                <span class="search-result-action">Enter to add</span>
            </div>
        `;
    }).join("");
    els.productSearchResults.classList.remove("hidden");
    renderMobileProducts();
}

function renderMobileProducts() {
    if (!els.mobileProductsList) return;
    const query = (els.productSearch?.value || "").trim().toLowerCase();
    const hasQuery = Boolean(query);
    let list = isMobileLayout() && hasQuery && Array.isArray(mobileSearchResults)
        ? mobileSearchResults
        : lastFilteredProducts;

    if (mobileActiveCategory && mobileActiveCategory !== "all") {
        list = list.filter((p) => (p.category_id || "").toString() === mobileActiveCategory);
    }

    if (mobileSearchLoading) {
        els.mobileProductsList.innerHTML = `<div class="sale-entry-empty">Searching...</div>`;
        return;
    }

    if (!list.length) {
        const message = hasQuery ? "No matching products." : "Start typing to search products.";
        els.mobileProductsList.innerHTML = `<div class="sale-entry-empty">${message}</div>`;
        restoreMobileScrollIfNeeded("products");
        return;
    }

    els.mobileProductsList.innerHTML = list.map((p) => {
        const stockValue = Number(p.stock || 0);
        const stockClass = stockValue <= 0 ? "stock-out" : stockValue <= 10 ? "stock-low" : "stock-ok";
        const stockLabel = stockValue <= 0 ? "Out of stock" : `${stockValue} in stock`;
        const canSell = canPerformSales();
        return `
            <div class="mobile-product-card">
                <div class="mobile-product-main">
                    <div class="mobile-product-name">${esc(p.name)}</div>
                    <div class="mobile-product-sku">SKU: ${esc(p.sku || "—")}</div>
                    <div class="mobile-product-stock ${stockClass}">${stockLabel}</div>
                </div>
                <div class="mobile-product-meta">
                    <div class="mobile-product-price">${fmtPrice(p.selling_price)}</div>
                    <button class="mobile-product-action" ${canSell ? "" : "disabled"} onclick="addToCart('${p.id}')">Add</button>
                </div>
            </div>
        `;
    }).join("");
}

function resetMobileSearch() {
    if (mobileSearchTimer) {
        clearTimeout(mobileSearchTimer);
        mobileSearchTimer = null;
    }
    mobileSearchToken += 1;
    mobileSearchResults = null;
    mobileSearchLoading = false;
    mobileSearchQuery = "";
}

function scheduleMobileSearch(query) {
    if (!isMobileLayout()) return;
    const trimmed = (query || "").trim().toLowerCase();
    if (!trimmed) {
        resetMobileSearch();
        renderMobileProducts();
        return;
    }
    if (mobileSearchQuery === trimmed && mobileSearchResults !== null) {
        return;
    }
    mobileSearchQuery = trimmed;
    if (mobileSearchTimer) clearTimeout(mobileSearchTimer);
    mobileSearchLoading = true;
    renderMobileProducts();
    mobileSearchTimer = setTimeout(() => {
        fetchMobileSearch(trimmed);
    }, 320);
}

async function fetchMobileSearch(query) {
    const token = ++mobileSearchToken;
    const branchId = els.branchSelect?.value || "";
    const category = mobileActiveCategory && mobileActiveCategory !== "all" ? mobileActiveCategory : "";
    const endpoint = withParams("/inventory/products/", {
        branch: branchId,
        search: query,
        category: category || undefined,
    });
    mobileSearchLoading = true;
    try {
        const data = await apiFetchAll(endpoint, { limit: 100 });
        if (token !== mobileSearchToken) return;
        mobileSearchResults = ensureArray(data, "mobile_search_results");
    } catch (err) {
        if (token !== mobileSearchToken) return;
        mobileSearchResults = [];
    } finally {
        if (token === mobileSearchToken) {
            mobileSearchLoading = false;
            renderMobileProducts();
        }
    }
}

function hideSearchResults() {
    searchResultsOpen = false;
    searchResultIndex = -1;
    if (els.productSearchResults) {
        els.productSearchResults.classList.add("hidden");
        els.productSearchResults.innerHTML = "";
    }
}

function clearSearchInput() {
    if (!els.productSearch) return;
    els.productSearch.value = "";
    updateSearchResults();
}

function focusSearchInput() {
    if (!els.productSearch) return;
    requestAnimationFrame(() => {
        els.productSearch.focus();
        els.productSearch.select();
    });
}

function findExactSkuMatch(query) {
    const products = ensureArray(allProducts, "allProducts");
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;
    return products.find(p => (p.sku || "").toLowerCase() === normalized) || null;
}

function selectSearchResult(productId) {
    if (!productId) return;
    addToCart(productId);
    clearSearchInput();
    hideSearchResults();
}

// ——— Cart ———
function addToCart(productId) {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    const product = ensureArray(allProducts, "allProducts").find(p => p.id === productId);
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

    setActiveSaleRow(productId);
    renderCart();
    updateTotals();
    scheduleReprice();
    toast(`${product.name} added`, "success");
    focusSearchInput();
}

function updateQty(productId, delta) {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    const item = cart.find(i => i.product.id === productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.product.id !== productId);
    } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
        toast("Maximum stock reached", "warning");
    }

    setActiveSaleRow(productId);
    renderCart();
    updateTotals();
    scheduleReprice();
    focusSearchInput();
}

function removeFromCart(productId) {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    cart = cart.filter(i => i.product.id !== productId);
    if (activeSaleRowId === productId) {
        activeSaleRowId = null;
    }
    renderCart();
    updateTotals();
    scheduleReprice();
}

async function clearCart({ skipServer = false } = {}) {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    resetMpesaPending();
    if (!skipServer && currentSaleId) {
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
    currentOfflineDraftId = null;
    currentOfflineDraftCorrelationId = null;
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
            <tr class="sale-entry-empty">
                <td colspan="7">No items yet. Use search to add products.</td>
            </tr>`;
        renderMobileCart();
        return;
    }

    const canSell = canPerformSales();
    els.cartItems.innerHTML = cart.map(item => {
        const unitPrice = getItemUnitPrice(item);
        const total = getItemLineTotal(item, unitPrice);
        const priceType = item.price_type_used ? item.price_type_used : "";
        const priceReason = item.pricing_reason ? item.pricing_reason : "";
        const rowClass = [
            "sale-entry-row",
            activeSaleRowId === item.product.id ? "active" : "",
            item.offline_issue ? "needs-review" : "",
        ].join(" ").trim();
        return `
            <tr class="${rowClass}" onclick="activateSaleRow('${item.product.id}')">
                <td class="sale-entry-item">
                    <div class="sale-entry-name">${esc(item.product.name)}</div>
                    ${item.offline_issue ? `<span class="issue-badge" title="${esc(item.offline_issue_reason || "")}">Review</span>` : ""}
                    ${priceType ? `<span class="price-badge ${priceType}" title="${esc(priceReason)}">${priceType}</span>` : ""}
                </td>
                <td class="sale-entry-sku">${esc(item.product.sku || "—")}</td>
                <td class="sale-entry-unit">${renderUnitSelect(item)}</td>
                <td class="sale-entry-qty">
                    <button class="qty-btn" ${canSell ? "" : "disabled"} onclick="event.stopPropagation(); updateQty('${item.product.id}', -1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" ${canSell ? "" : "disabled"} onclick="event.stopPropagation(); updateQty('${item.product.id}', 1)">+</button>
                </td>
                <td class="sale-entry-price">${fmtPrice(unitPrice)}</td>
                <td class="sale-entry-total">${fmtPrice(total)}</td>
                <td class="sale-entry-action">
                    <button class="cart-item-remove" ${canSell ? "" : "disabled"} onclick="event.stopPropagation(); removeFromCart('${item.product.id}')" title="Remove">✕</button>
                </td>
            </tr>`;
    }).join("");
    renderMobileCart();
}

function renderMobileCart() {
    if (!els.mobileCartList) return;
    if (!cart.length) {
        els.mobileCartList.innerHTML = `
            <div class="mobile-cart-empty">
                <div class="mobile-cart-empty-title">Cart is empty</div>
                <div class="mobile-cart-empty-text">Search products on the Sell screen and add them here before checkout.</div>
                <button class="btn-secondary mobile-cart-empty-action" onclick="setMobileTab('products')">Continue selling</button>
            </div>
        `;
        return;
    }

    const canSell = canPerformSales();
    els.mobileCartList.innerHTML = cart.map(item => {
        const unitPrice = getItemUnitPrice(item);
        const total = getItemLineTotal(item, unitPrice);
        const unitLabel = item.unit?.unit_name || item.unit?.unit_code || "unit";
        return `
            <div class="mobile-cart-item">
                <div class="mobile-cart-main">
                    <div class="mobile-cart-name">${esc(item.product.name)}</div>
                    <div class="mobile-cart-sub">SKU: ${esc(item.product.sku || "—")} • ${esc(unitLabel)}</div>
                    <div class="mobile-cart-sub">${fmtPrice(unitPrice)} each</div>
                </div>
                <div class="mobile-cart-side">
                    <div class="mobile-cart-stepper" aria-label="Quantity controls">
                        <button class="qty-btn" ${canSell ? "" : "disabled"} onclick="updateQty('${item.product.id}', -1)">−</button>
                        <span class="qty-value">${item.qty}</span>
                        <button class="qty-btn" ${canSell ? "" : "disabled"} onclick="updateQty('${item.product.id}', 1)">+</button>
                    </div>
                    <div class="mobile-cart-total">${fmtPrice(total)}</div>
                    <button class="cart-item-remove" ${canSell ? "" : "disabled"} onclick="removeFromCart('${item.product.id}')" title="Remove item">Remove</button>
                </div>
            </div>
        `;
    }).join("");
}

function isCreditSaleSelected() {
    return !!(els.creditToggle && els.creditToggle.checked);
}

function getSelectedPaymentMethod() {
    return (els.paymentMethodSelect?.value || "cash").toLowerCase();
}

function updateMpesaFields() {
    if (!els.mpesaFields) return;
    const isMpesa = getSelectedPaymentMethod() === "mpesa";
    els.mpesaFields.classList.toggle("hidden", !isMpesa);
    if (!isMpesa) {
        if (els.mpesaPhone) els.mpesaPhone.value = "";
        if (els.mpesaReference) els.mpesaReference.value = "";
        setMpesaStatus("");
    }
    updateCheckoutButtonLabel();
}

function updateCreditPaymentMethodFields() {
    if (!els.paymentPhoneRow) return;
    const isMpesa = (els.paymentMethod?.value || "cash").toLowerCase() === "mpesa";
    els.paymentPhoneRow.classList.toggle("hidden", !isMpesa);
    if (!isMpesa && els.paymentPhone) {
        els.paymentPhone.value = "";
    }
}

function setMpesaStatus(message, tone = "info") {
    if (!els.mpesaStatus) return;
    if (!message) {
        els.mpesaStatus.textContent = "";
        els.mpesaStatus.classList.add("hidden");
        els.mpesaStatus.dataset.tone = "";
        return;
    }
    els.mpesaStatus.textContent = message;
    els.mpesaStatus.dataset.tone = tone;
    els.mpesaStatus.classList.remove("hidden");
}

function resetMpesaPending() {
    if (mpesaPollTimer) {
        clearInterval(mpesaPollTimer);
        mpesaPollTimer = null;
    }
    mpesaPollAttempts = 0;
    mpesaPendingPayment = null;
    setMpesaStatus("");
    updateCheckoutButtonLabel();
}

function updateCheckoutButtonLabel() {
    if (!els.checkoutBtn) return;
    if (mpesaPendingPayment) {
        els.checkoutBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Waiting for M-Pesa...`;
        return;
    }
    const method = getSelectedPaymentMethod();
    if (method === "mpesa") {
        els.checkoutBtn.innerHTML = `<span class="btn-icon">📲</span> Send STK Push`;
    } else {
        els.checkoutBtn.innerHTML = `<span class="btn-icon">💳</span> Complete Sale`;
    }
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
    const discount = parseFloat(els.discountInput.value) || 0;
    const grandTotal = Math.max(0, subtotal - discount);
    const tax = grandTotal * TAX_RATE / (1 + TAX_RATE);
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const change = amountPaid - grandTotal;
    const itemsCount = cart.reduce((sum, item) => sum + (item.qty || 0), 0);

    els.subtotal.textContent = fmtPrice(subtotal);
    els.taxAmount.textContent = fmtPrice(tax);
    els.grandTotal.textContent = fmtPrice(grandTotal);
    els.changeAmount.textContent = fmtPrice(Math.max(0, change));
    if (els.mobileSubtotal) els.mobileSubtotal.textContent = fmtPrice(subtotal);
    if (els.mobileGrandTotal) els.mobileGrandTotal.textContent = fmtPrice(grandTotal);
    if (els.mobileItemsCount) els.mobileItemsCount.textContent = itemsCount;

    const empty = cart.length === 0;
    const canSell = canPerformSales();
    const completion = getCompletionValidation();
    const mpesaPending = Boolean(mpesaPendingPayment);
    els.checkoutBtn.disabled = empty || !canSell || !completion.valid || mpesaPending;
    els.holdSaleBtn.disabled = empty || !canSell;
    els.clearCartBtn.disabled = !canSell;
    if (els.mobileCartCheckout) {
        els.mobileCartCheckout.disabled = empty || !canSell || !completion.valid || mpesaPending;
    }
    if (els.mobileCartPanel) {
        els.mobileCartPanel.classList.toggle("is-empty", empty);
    }

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
    updateCheckoutButtonLabel();
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
    if (currentOfflineDraftCorrelationId) {
        payload.correlation_id = currentOfflineDraftCorrelationId;
    }

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
    const method = getSelectedPaymentMethod();
    const phoneNumber = (els.mpesaPhone?.value || "").trim();
    if (amountPaid < 0) {
        return { valid: false, message: "Amount paid cannot be negative." };
    }
    if (method === "mpesa") {
        if (amountPaid <= 0) {
            return { valid: false, message: "M-Pesa payment requires an amount." };
        }
        if (!phoneNumber) {
            return { valid: false, message: "M-Pesa phone number is required." };
        }
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
    openOverlay(els.creditModal);
    setCreditTab("payments");
    loadCreditSales();
    hydrateCreditSelectors();
}

function closeCreditModal() {
    if (!els.creditModal) return;
    closeOverlay(els.creditModal);
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
    if (canAccessDeliveryQueue()) {
        await ensureDeliveryQueueCache();
    }
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
        const deliveryBadge = renderDeliverySaleBadge(sale);
        const queueItem = getDeliveryQueueItemForSale(sale.id);
        const queueRunId = queueItem?.existing_run_id || queueItem?.delivery_run_id || "";
        const runLabel = queueRunId ? "View Run" : "Go to Delivery";
        const runClick = queueRunId
            ? `openBackOfficeDeliveryDetail('${queueRunId}')`
            : `openDeliveryQueueForSale('${sale.id}')`;
        const deliveryAction = isDeliveryEligibleSale(sale) && canAccessDeliveryQueue()
            ? `<button class="btn-secondary btn-inline" onclick="event.stopPropagation(); ${runClick}">${runLabel}</button>`
            : "";
        return `
            <div class="credit-sale-item ${active ? "active" : ""}" onclick="selectCreditSale('${sale.id}')">
                <div>
                    <div>${esc(getCustomerName(sale.customer))}</div>
                    <div class="muted">${sale.id}</div>
                    <div class="muted">Due ${sale.due_date || "—"}</div>
                    <div class="credit-sale-delivery-row">
                        ${deliveryBadge}
                        ${deliveryAction}
                    </div>
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
    const paymentsHtml = renderPaymentHistoryList(payments, { compact: true });
    const deliveryBadge = renderDeliverySaleBadge(sale);
    const queueItem = getDeliveryQueueItemForSale(sale.id);
    const queueRunId = queueItem?.existing_run_id || queueItem?.delivery_run_id || "";
    const runLabel = queueRunId ? "View Run" : "Go to Delivery";
    const runClick = queueRunId
        ? `openBackOfficeDeliveryDetail('${queueRunId}')`
        : `openDeliveryQueueForSale('${sale.id}')`;
    const deliveryAction = isDeliveryEligibleSale(sale) && canAccessDeliveryQueue()
        ? `<button class="btn-primary btn-inline" onclick="${runClick}">${runLabel}</button>`
        : "";

    els.creditSaleDetail.innerHTML = `
        <div class="credit-detail-row"><span>Customer</span><strong>${esc(getCustomerName(sale.customer))}</strong></div>
        <div class="credit-detail-row"><span>Total</span><strong>${fmtPrice(sale.grand_total)}</strong></div>
        <div class="credit-detail-row"><span>Amount Paid</span><strong>${fmtPrice(sale.amount_paid)}</strong></div>
        <div class="credit-detail-row"><span>Balance Due</span><strong>${fmtPrice(sale.balance_due ?? sale.balance ?? 0)}</strong></div>
        <div class="credit-detail-row"><span>Due Date</span><strong>${sale.due_date || "—"}</strong></div>
        <div class="credit-detail-row"><span>Status</span><strong>${renderStatusBadge(sale.payment_status)}</strong></div>
        ${deliveryBadge ? `<div class="credit-detail-row credit-delivery-row"><span>Delivery</span><div>${deliveryBadge}${deliveryAction}</div></div>` : ""}
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
    const method = (els.paymentMethod?.value || "cash").toLowerCase();
    const reference = (els.paymentReference?.value || "").trim();
    const phoneNumber = (els.paymentPhone?.value || "").trim();
    if (method === "mpesa") {
        if (!reference) {
            setPaymentError("M-Pesa transaction code is required.");
            toast("M-Pesa transaction code is required", "error");
            return;
        }
        if (!phoneNumber) {
            setPaymentError("M-Pesa phone number is required.");
            toast("M-Pesa phone number is required", "error");
            return;
        }
    }
    clearPaymentError();
    const payload = {
        amount: amount.toFixed(2),
        method,
        reference,
        phone_number: phoneNumber,
        note: els.paymentNote?.value || "",
    };
    try {
        await apiRequest(`/sales/${selectedCreditSale.id}/payments/`, { method: "POST", body: payload });
        toast("Payment recorded", "success");
        if (els.paymentPhone) els.paymentPhone.value = "";
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
    restoreMobileScrollIfNeeded("products");
}


async function syncDraftPricing() {
    if (!validateSaleInputs()) return;
    if (cart.length === 0) return;
    if (!navigator.onLine) {
        setOfflineMode(true);
        await saveOfflineDraft({ reason: "offline" });
        return;
    }

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
        if (isNetworkError(err)) {
            setOfflineMode(true);
            await saveOfflineDraft({ reason: err.message || "offline" });
        }
    }
}

async function createSale(payload) {
    return apiRequest("/sales/", { method: "POST", body: payload });
}

async function updateSale(saleId, payload) {
    return apiRequest(`/sales/${saleId}/`, { method: "PUT", body: payload });
}

async function completeSale(saleId, payload) {
    const method = getSelectedPaymentMethod();
    const reference = (els.mpesaReference?.value || "").trim();
    const phoneNumber = (els.mpesaPhone?.value || "").trim();
    return apiRequest(`/sales/${saleId}/complete/`, {
        method: "POST",
        body: {
            discount: payload.discount,
            amount_paid: payload.amount_paid,
            method,
            reference,
            phone_number: phoneNumber,
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
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    posLog("[pos] checkout click", {
        saleId: currentSaleId,
        branch: els.branchSelect.value,
        customer: els.customerSelect.value,
        amountPaid: els.amountPaid.value,
        cartCount: cart.length,
        saleType: currentSaleType,
        isCredit: isCreditSaleSelected(),
    });
    if (mpesaPendingPayment) {
        toast("Waiting for M-Pesa confirmation", "info");
        return;
    }
    if (!validateSaleInputs({ requirePayment: true, debug: POS_DEBUG })) {
        posLog("[pos] checkout aborted: validation failed");
        return;
    }
    if (!navigator.onLine) {
        setOfflineMode(true);
        await saveOfflineDraft({ reason: "offline" });
        toast("Offline: sale saved as a local draft. Sync when online.", "warning");
        currentSaleId = null;
        currentSaleMeta = null;
        currentSaleType = "retail";
        await clearCart({ skipServer: true });
        return;
    }

    if (getSelectedPaymentMethod() === "mpesa") {
        await checkoutMpesa();
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
        if (isMobileLayout()) {
            console.info("[receipt] sale completed modal opening", { saleId, mode: getPrintMode() });
            showMobileSuccess(saleId).catch((err) => {
                console.warn("[receipt] showMobileSuccess failed", err);
                toast(`Receipt preview failed: ${err.message}`, "warning");
            });
        } else {
            console.info("[receipt] receipt modal opening", { saleId, mode: getPrintMode(), autoPrint: true });
            showReceipt(saleId, { autoPrint: true }).catch((err) => {
                console.warn("[receipt] showReceipt failed", err);
                toast(`Receipt preview failed: ${err.message}`, "warning");
            });
        }
        loadProducts();
        loadHeldSales();
        await refreshCustomerOrdersAfterSaleComplete(saleId);
    } catch (err) {
        posLog("[pos] checkout error", err?.message || err);
        if (isNetworkError(err)) {
            setOfflineMode(true);
            await saveOfflineDraft({ reason: err.message || "offline" });
            toast("Offline: sale saved as a local draft. Sync when online.", "warning");
            currentSaleId = null;
            currentSaleMeta = null;
            currentSaleType = "retail";
            await clearCart({ skipServer: true });
        } else {
            toast(`Sale failed: ${err.message}`, "error");
        }
    } finally {
        els.checkoutBtn.disabled = false;
        updateCheckoutButtonLabel();
    }
}

async function checkoutMpesa() {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    const payload = buildPayload();
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const phoneNumber = (els.mpesaPhone?.value || "").trim();
    if (!navigator.onLine) {
        toast("Offline: M-Pesa requires an internet connection", "error");
        setOfflineMode(true);
        return;
    }

    if (!phoneNumber) {
        toast("M-Pesa phone number is required", "error");
        return;
    }

    if (!amountPaid || amountPaid <= 0) {
        toast("Enter the amount to pay via M-Pesa", "error");
        return;
    }

    els.checkoutBtn.disabled = true;
    els.checkoutBtn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Sending STK push...`;

    try {
        let saleId = currentSaleId;
        if (saleId) {
            await updateSale(saleId, payload);
        } else {
            const sale = await createSale(payload);
            saleId = sale.id;
            currentSaleId = saleId;
        }

        const response = await apiRequest(`/payments/mpesa/stk-push/`, {
            method: "POST",
            body: {
                sale_id: saleId,
                phone_number: phoneNumber,
                amount: amountPaid.toFixed(2),
            },
        });

        mpesaPendingPayment = {
            id: response.payment_id,
            saleId,
            checkoutId: response.checkout_request_id,
        };
        setMpesaStatus("Waiting for customer confirmation...", "info");
        toast(response.message || "STK Push sent", "info");
        startMpesaPolling(mpesaPendingPayment.id);
    } catch (err) {
        toast(`M-Pesa failed: ${err.message}`, "error");
        resetMpesaPending();
    } finally {
        updateCheckoutButtonLabel();
        updateTotals();
    }
}

function startMpesaPolling(paymentId) {
    if (!paymentId) return;
    if (mpesaPollTimer) clearInterval(mpesaPollTimer);
    mpesaPollAttempts = 0;
    mpesaPollTimer = setInterval(() => {
        pollMpesaPayment(paymentId);
    }, MPESA_POLL_INTERVAL);
    pollMpesaPayment(paymentId);
}

async function pollMpesaPayment(paymentId) {
    if (!mpesaPendingPayment || mpesaPendingPayment.id !== paymentId) return;
    mpesaPollAttempts += 1;
    if (mpesaPollAttempts > MPESA_POLL_MAX) {
        toast("M-Pesa confirmation timed out. Please check the phone or retry.", "warning");
        resetMpesaPending();
        return;
    }

    try {
        const statusData = await apiFetch(`/payments/${paymentId}/`);
        if (!statusData) return;
        if (statusData.status === "completed") {
            toast("M-Pesa payment confirmed", "success");
            resetMpesaPending();
            if (statusData.sale_status === "completed") {
                currentSaleId = null;
                currentSaleMeta = null;
                currentSaleType = "retail";
                if (isMobileLayout()) {
                    showMobileSuccess(statusData.sale_id);
                } else {
                    showReceipt(statusData.sale_id, { autoPrint: true });
                }
                loadProducts();
                loadHeldSales();
                await refreshCustomerOrdersAfterSaleComplete(statusData.sale_id);
            } else {
                toast("Payment received. Finalizing sale...", "info");
            }
        } else if (statusData.status === "failed") {
            toast(statusData.provider_result_desc || "M-Pesa payment failed", "error");
            resetMpesaPending();
        } else {
            setMpesaStatus("Waiting for customer confirmation...", "info");
        }
    } catch (err) {
        posLog("[pos] mpesa poll error", err?.message || err);
    }
}

// ——— Hold Sale ———
async function holdSale() {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    if (!validateSaleInputs()) return;

    const payload = buildPayload({ status: "held" });
    const csrfToken = getCSRFToken();

    try {
        if (!navigator.onLine) {
            setOfflineMode(true);
            await saveOfflineDraft({ reason: "offline" });
            toast("Offline: draft saved locally.", "warning");
            currentSaleId = null;
            currentSaleType = "retail";
            await clearCart({ skipServer: true });
            return;
        }
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
        if (isNetworkError(err)) {
            setOfflineMode(true);
            await saveOfflineDraft({ reason: err.message || "offline" });
            toast("Offline: draft saved locally.", "warning");
            currentSaleId = null;
            currentSaleType = "retail";
            await clearCart({ skipServer: true });
        } else {
            toast(`Hold failed: ${err.message}`, "error");
        }
    }
}

// ——— Receipt ———
async function showReceipt(saleRef, { autoPrint = false } = {}) {
    const saleId = typeof saleRef === "object" && saleRef ? (saleRef.id || saleRef.sale_id || saleRef.receiptNo || saleRef.receipt_no || "") : saleRef;
    const [receipt, saleDetail] = await Promise.all([
        apiFetch(`/sales/${saleId}/receipt/`),
        apiFetch(`/sales/${saleId}/`),
    ]);
    if (!receipt) {
        toast("Could not load receipt", "error");
        return;
    }

    try {
        currentReceiptPayload = buildReceiptPayload({ receipt, sale: saleDetail });
    } catch (err) {
        console.warn("[receipt] buildReceiptPayload error", err);
        toast(`Receipt preview unavailable: ${err.message}`, "warning");
        currentReceiptPayload = null;
    }
    if (typeof saleRef === "object" && saleRef) {
        lastCompletedSale = saleRef;
    }
    console.info("[receipt] showReceipt print mode", {
        mode: getPrintMode(),
        androidButtonRendered: getPrintMode() === "android",
        autoPrintRequested: Boolean(autoPrint),
    });
    console.info("[receipt] showReceipt runtime", {
        appBuild: APP_BUILD,
        storedMode: localStorage.getItem(PRINT_MODE_KEY) || "(empty)",
        computedMode: getPrintMode(),
        isMobile: isMobileLayout(),
    });
    if (window.debugReceiptDom) window.debugReceiptDom();
    const receiptItems = ensureArray(receipt.items || saleDetail?.items || saleDetail?.sale_items || saleDetail?.lines || [], "receiptItems");
    const detailItems = ensureArray(saleDetail?.items || saleDetail?.sale_items || saleDetail?.lines || [], "saleDetailItems");
    const itemsHtml = receiptItems.map((item, index) => {
        const detail = detailItems[index];
        let unitLabel = "";
        if (detail?.product && detail?.product_unit) {
            const product = allProducts.find(p => p.id === detail.product);
            const unit = product?.units?.find(u => u.id === detail.product_unit);
            unitLabel = unit?.unit_code || unit?.unit_name || "";
        }
        const unitMeta = unitLabel ? ` ${esc(unitLabel)}` : "";
        const unitPrice = item.unit_price ?? detail?.unit_price ?? 0;
        return `
            <div class="receipt-item">
                <div>
                    <div class="receipt-item-name">${esc(item.product)} × ${item.quantity}${unitMeta}</div>
                    <div class="receipt-item-meta">@ ${fmtPrice(unitPrice)}</div>
                </div>
                <span class="receipt-item-total">${fmtPrice(item.total)}</span>
            </div>
        `;
    }).join("");

    const paymentList = ensureArray(saleDetail?.payments || receipt.payments || [], "receiptPayments");
    const paymentHistory = renderPaymentHistoryList(paymentList, { compact: true });
    const balanceValue = receipt.balance_due ?? receipt.balance;
    const paymentStatus = receipt.payment_status || saleDetail?.payment_status || "";

    const creditMeta = saleDetail && saleDetail.is_credit_sale ? `
        <div class="receipt-total-row receipt-balance">
            <span>Payment Status</span>
            <span>${formatStatus(paymentStatus || "unpaid")}</span>
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

    const receiptTotal = receipt.total ?? 0;
    const receiptTax = receipt.tax ?? (receiptTotal * TAX_RATE / (1 + TAX_RATE));
    const receiptNet = Math.max(0, receiptTotal - receiptTax);

    const branchName = branches.find(b => b.id === saleDetail?.branch)?.name || "";
    const customerName = saleDetail?.customer ? getCustomerName(saleDetail.customer) : "";
    const servedBy = currentUser?.display_name || currentUser?.username || currentUser?.email || "";

    const receiptMeta = [
        branchName ? `<div class="receipt-meta">${esc(branchName)}</div>` : "",
        customerName ? `<div class="receipt-subline">Customer: ${esc(customerName)}</div>` : "",
        servedBy ? `<div class="receipt-subline">Served by: ${esc(servedBy)}</div>` : "",
    ].filter(Boolean).join("");
    const receiptNumber = receipt.receipt_no
        || receipt.invoice_no
        || saleDetail?.receipt_no
        || saleDetail?.invoice_no
        || String(receipt.sale_id || saleId || "").slice(-8);

    currentReceiptSaleId = saleId;
    if (els.receiptModal) {
        els.receiptModal.dataset.saleId = String(saleId);
    }

    els.receiptContent.innerHTML = `
        <div class="receipt-success">✅</div>
        <div class="receipt-header">
            <h3>Sale Receipt</h3>
            <div class="receipt-id">Receipt #${esc(receiptNumber)}</div>
            <div class="receipt-date">${new Date(receipt.date).toLocaleString()}</div>
            ${receiptMeta}
        </div>
        <hr class="receipt-divider">
        <div class="receipt-items">${itemsHtml}</div>
        <hr class="receipt-divider">
        <div class="receipt-totals">
            <div class="receipt-total-row">
                <span>Subtotal</span>
                <span>${fmtPrice(receipt.subtotal ?? receipt.total ?? 0)}</span>
            </div>
            <div class="receipt-total-row">
                <span>VAT (included)</span>
                <span>${fmtPrice(receiptTax)}</span>
            </div>
            <div class="receipt-total-row">
                <span>Net (ex VAT)</span>
                <span>${fmtPrice(receiptNet)}</span>
            </div>
            <div class="receipt-total-row receipt-grand">
                <span>Total</span>
                <span>${fmtPrice(receiptTotal)}</span>
            </div>
            <div class="receipt-total-row receipt-paid">
                <span>Paid</span>
                <span>${fmtPrice(receipt.paid)}</span>
            </div>
            <div class="receipt-total-row receipt-balance">
                <span>Balance</span>
                <span>${fmtPrice(balanceValue)}</span>
            </div>
            ${creditMeta}
        </div>
        <div class="receipt-payments">
            <div class="receipt-section-title">Payments</div>
            ${paymentHistory}
        </div>
    `;

    openOverlay(els.receiptModal);
    syncPrintModeControl();
    syncReceiptActionUi();
    if (autoPrint && saleId) {
        scheduleAutoPrint(saleId);
    }
}

function scheduleAutoPrint(saleId) {
    if (!isAutoPrintEnabled()) return;
    if (getPrintMode() === "android") {
        console.info("[receipt] auto-print skipped for android mode", { saleId });
        return;
    }
    if (autoPrintedSales.has(saleId)) return;
    autoPrintedSales.add(saleId);
    requestAnimationFrame(() => {
        setTimeout(() => {
            try {
                void printReceipt({ allowBrowserFallback: false }).catch((err) => {
                    console.warn("[receipt] auto-print failed", err);
                });
            } catch (err) {
                console.warn("[receipt] auto-print failed", err);
            }
        }, 80);
    });
}

function isAutoPrintEnabled() {
    const value = localStorage.getItem(AUTO_PRINT_KEY);
    if (value === null) return true;
    return value === "1";
}

function setAutoPrintEnabled(enabled) {
    localStorage.setItem(AUTO_PRINT_KEY, enabled ? "1" : "0");
}

async function checkPrintBridge() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(`${PRINT_BRIDGE_URL}/health`, {
            method: "GET",
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        const online = !!data?.ok;
        console.info("[receipt] bridge online", online);
        return online;
    } catch (err) {
        console.info("[receipt] bridge offline", err?.message || err);
        return false;
    }
}

function getReceiptPrintUrl() {
    const configured = localStorage.getItem(PRINT_BRIDGE_URL_KEY) || "";
    const trimmed = configured.trim();
    if (trimmed) {
        try {
            return new URL(trimmed, window.location.origin).toString();
        } catch (err) {
            console.warn("[receipt] invalid bridge url override", err);
        }
    }
    return `${PRINT_BRIDGE_URL}/print/receipt`;
}

async function sendPrintBridgeJob(receipt) {
    const res = await fetch(getReceiptPrintUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            receipt,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Bridge print failed (HTTP ${res.status})`);
    }
    return data;
}

function syncPrintModeControl() {
    if (!els.printModeSelect) return;
    els.printModeSelect.value = getSelectedPrintMode();
}

function syncReceiptActionUi() {
    const modal = els.receiptModal || document.getElementById("receipt-modal");
    if (!modal) return;
    const printBtn = modal.querySelector("#print-receipt-btn");
    const autoWrap = modal.querySelector("#auto-print-toggle-wrap");
    const autoToggle = modal.querySelector("#auto-print-toggle");
    const forceAndroidBtn = modal.querySelector("#force-android-print-btn");
    const debug = modal.querySelector("#receipt-print-debug");
    const mode = getPrintMode();
    const androidMode = mode === "android";
    if (printBtn) {
        printBtn.textContent = androidMode ? "📱 Print via Bluetooth" : "🖨️ Reprint Receipt";
        printBtn.classList.toggle("btn-primary", androidMode);
        printBtn.classList.toggle("btn-secondary", !androidMode);
        printBtn.dataset.mode = mode;
    }
    if (autoWrap) {
        autoWrap.classList.toggle("hidden", androidMode);
    }
    if (autoToggle) {
        autoToggle.disabled = androidMode;
        if (androidMode) autoToggle.checked = false;
    }
    if (forceAndroidBtn) {
        forceAndroidBtn.classList.toggle("hidden", !isMobileLayout());
    }
    if (debug) {
        debug.textContent = `RECEIPT MODAL BUILD 2026-04-29.13 | APP_BUILD ${APP_BUILD} | stored: ${localStorage.getItem(PRINT_MODE_KEY) || "(empty)"} | computed: ${mode} | isMobile: ${isMobileLayout()}`;
    }
}

function syncMobileSuccessActionUi() {
    const modal = els.mobileSuccessModal || document.getElementById("mobile-success-modal");
    if (!modal) return;
    const printBtn = modal.querySelector("#mobile-success-print");
    const receiptBtn = modal.querySelector("#mobile-success-receipt");
    const debug = modal.querySelector("#mobile-success-debug");
    const mode = getPrintMode();
    const androidMode = mode === "android";
    if (printBtn) {
        printBtn.classList.toggle("hidden", !androidMode);
        printBtn.dataset.mode = mode;
    }
    if (receiptBtn) {
        receiptBtn.textContent = androidMode ? "View Receipt" : "View Receipt";
    }
    if (debug) {
        debug.textContent = `SUCCESS MODAL BUILD 2026-04-29.13 | APP_BUILD ${APP_BUILD} | stored: ${localStorage.getItem(PRINT_MODE_KEY) || "(empty)"} | computed: ${mode} | isMobile: ${isMobileLayout()}`;
    }
}

window.debugReceiptDom = function debugReceiptDom() {
    console.log("APP_BUILD", APP_BUILD);
    console.log("receipt modal elements", document.querySelectorAll('[id*=receipt], [class*=receipt]'));
    console.log("print mode controls", document.querySelectorAll('[id*=print], [class*=print]'));
};

async function printHistoricalReceipt(saleId, { source = "history" } = {}) {
    const mode = getPrintMode();
    console.info("[receipt] historical receipt print clicked", {
        mode,
        saleId,
        source,
        currentReceiptSaleId,
        hasCurrentPayload: Boolean(currentReceiptPayload),
    });
    if (!saleId) {
        toast("Receipt data is unavailable.", "warning");
        return;
    }
    try {
        if (String(currentReceiptSaleId) !== String(saleId) || !currentReceiptPayload) {
            await showReceipt(saleId, { autoPrint: false });
        }
    } catch (err) {
        console.warn("[receipt] historical receipt load failed", err);
        toast(`Receipt preview failed: ${err.message}`, "warning");
        return;
    }
    const payload = currentReceiptPayload || (lastCompletedSale ? buildReceiptPayload(lastCompletedSale) : null);
    if (!payload) {
        toast("Receipt data is unavailable.", "warning");
        return;
    }
    if (mode === "pc") {
        try {
            await printReceiptPc(payload);
        } catch (err) {
            console.warn("[receipt] historical PC print failed", err);
            toast(`PC print failed: ${err.message}`, "warning");
        }
        return;
    }
    if (mode === "android") {
        printReceiptAndroid(payload);
        return;
    }
    toast("Printing disabled", "info");
}

function getDefaultPrintMode() {
    return isMobileLayout() ? "android" : "pc";
}

function getPrintMode() {
    const saved = localStorage.getItem(PRINT_MODE_KEY);
    if (saved === "pc" || saved === "android" || saved === "none") return saved;
    const fallback = getDefaultPrintMode();
    localStorage.setItem(PRINT_MODE_KEY, fallback);
    return fallback;
}

function getSelectedPrintMode() {
    return getPrintMode();
}

function setSelectedPrintMode(mode) {
    const next = mode === "pc" || mode === "android" || mode === "none" ? mode : getDefaultPrintMode();
    localStorage.setItem(PRINT_MODE_KEY, next);
    syncPrintModeControl();
    syncMobileSuccessActionUi();
    syncReceiptActionUi();
    if (els.receiptModal && !els.receiptModal.classList.contains("hidden")) {
        console.info("[receipt] receipt action controls rerendered", {
            selected: next,
            computed: getPrintMode(),
            androidButtonRendered: next === "android",
        });
    }
    return next;
}

function asNumber(value, fallback = null) {
    if (value === null || value === undefined || value === "") return fallback;
    const cleaned = String(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function pickValue(source, paths, fallback = "") {
    for (const path of paths) {
        const value = path.split(".").reduce((acc, key) => {
            if (acc === null || acc === undefined) return undefined;
            return acc[key];
        }, source);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
}

function normalizeReceiptItem(item = {}) {
    const name = pickValue(item, [
        "product_name",
        "item.product_name",
        "product.name",
        "item.product.name",
        "product.product_name",
        "item.name",
        "name",
        "item.description",
        "item.product.name",
        "item.product.product_name",
        "description",
    ], "");
    const qty = asNumber(pickValue(item, ["qty", "quantity"], 1), 1);
    const unitPrice = asNumber(pickValue(item, ["unit_price", "unitPrice", "price", "rate"], 0), 0);
    const lineTotal = asNumber(pickValue(item, ["line_total", "lineTotal", "total", "amount"], qty * unitPrice), qty * unitPrice);
    return {
        name: String(name || pickValue(item, ["product", "item.product"], "") || "Item"),
        qty,
        unitPrice,
        lineTotal,
    };
}

function resolveBranchName(value) {
    if (!value) return "";
    if (typeof value === "object") {
        return value.name || value.branch_name || value.title || "";
    }
    const branch = branches.find((entry) => String(entry.id) === String(value) || String(entry.code) === String(value));
    return branch?.name || String(value);
}

function resolveCustomerName(value) {
    if (!value) return "";
    if (typeof value === "object") {
        return value.name || value.full_name || value.fullName || value.customer_name || value.username || value.email || "";
    }
    const text = String(value);
    return /^[0-9a-f-]{16,}$/i.test(text) ? "" : text;
}

function buildReceiptPayload(sale = {}) {
    const source = sale && typeof sale === "object" ? sale : {};
    const receiptSource = source.receipt && typeof source.receipt === "object" ? source.receipt : source;
    const saleSource = source.sale && typeof source.sale === "object" ? source.sale : source;
    const paymentList = ensureArray(
        pickValue(receiptSource, ["payments"], null) || pickValue(saleSource, ["payments"], null) || [],
        "receiptPayments"
    );
    const conditions = ensureArray(
        pickValue(receiptSource, ["conditions"], null) || pickValue(saleSource, ["conditions"], null) || [],
        "receiptConditions"
    );
    const itemsSource = ensureArray(
        pickValue(receiptSource, ["items"], null)
            || pickValue(saleSource, ["items"], null)
            || pickValue(saleSource, ["sale_items"], null)
            || pickValue(saleSource, ["lines"], null)
            || [],
        "receiptItems"
    );
    const items = itemsSource.map(normalizeReceiptItem);
    const subtotal = asNumber(pickValue(receiptSource, ["subtotal", "sub_total", "subtotal_amount"], null), null);
    const discount = asNumber(pickValue(receiptSource, ["discount"], null), null);
    const vat = asNumber(pickValue(receiptSource, ["vat", "tax"], null), null);
    const netAmount = asNumber(pickValue(receiptSource, ["netAmount", "net_amount"], null), null);
    const total = asNumber(
        pickValue(receiptSource, ["total", "grand_total", "grandTotal"], null),
        items.reduce((sum, item) => sum + item.lineTotal, 0)
    );
    const paid = asNumber(pickValue(receiptSource, ["paid", "amount_paid", "amountPaid"], null), null);
    const change = asNumber(pickValue(receiptSource, ["change", "balance_change"], null), null);
    const balance = asNumber(pickValue(receiptSource, ["balance", "balance_due", "balanceDue"], null), null);
    const paymentMethod = pickValue(receiptSource, ["paymentMethod", "payment_method", "paymentMode"], "");
    const inferredMethod = paymentMethod || (paymentList.length > 1 ? "Split Payment" : pickValue(paymentList[0] || {}, ["payment_method", "paymentMethod", "method", "type"], ""));
    const branch = resolveBranchName(
        pickValue(receiptSource, ["branch", "branch_name", "branchName", "branch_id"], null)
            || pickValue(saleSource, ["branch", "branch_name", "branchName", "branch_id"], null)
    );
    const cashier = pickValue(receiptSource, ["cashier", "cashierName", "served_by", "servedBy", "user_name"], null)
        || pickValue(saleSource, ["cashier", "served_by", "servedBy", "user_name"], null)
        || (currentUser?.display_name || currentUser?.username || currentUser?.email || "");
    const customer = resolveCustomerName(
        pickValue(receiptSource, ["customer"], null)
            || pickValue(saleSource, ["customer"], null)
            || pickValue(receiptSource, ["customer_name"], null)
            || pickValue(saleSource, ["customer_name"], null)
    );
    const receiptNo = String(
        pickValue(receiptSource, ["receiptNo", "receipt_no", "invoice_no", "invoiceNo"], "")
            || pickValue(saleSource, ["receiptNo", "receipt_no", "sale_id", "id"], "")
            || (String(pickValue(saleSource, ["id"], "")).slice(-8))
    );
    const date = String(
        pickValue(receiptSource, ["date", "created_at", "createdAt"], "")
            || pickValue(saleSource, ["date", "created_at", "createdAt"], "")
    );
    const deliveryPerson = resolveCustomerName(
        pickValue(receiptSource, ["deliveryPerson", "delivery_person", "assigned_to", "deliveryPersonName"], null)
            || pickValue(saleSource, ["deliveryPerson", "delivery_person", "assigned_to", "deliveryPersonName"], null)
    );
    const paymentStatus = pickValue(receiptSource, ["paymentStatus", "payment_status", "status"], "")
        || pickValue(saleSource, ["paymentStatus", "payment_status", "status"], "");
    const isCredit = Boolean(
        pickValue(receiptSource, ["isCredit", "is_credit", "is_credit_sale"], null)
            ?? pickValue(saleSource, ["isCredit", "is_credit", "is_credit_sale"], null)
            ?? String(paymentStatus).toLowerCase().includes("credit")
    );
    const payments = paymentList.map((payment) => ({
        method: sanitizeText(pickValue(payment, ["method", "payment_method", "paymentMethod", "type"], "")),
        amount: asNumber(pickValue(payment, ["amount", "paid_amount", "paidAmount"], null), null),
        status: sanitizeText(pickValue(payment, ["status", "payment_status"], "")),
        reference: sanitizeText(pickValue(payment, ["reference", "payment_reference", "code"], "")),
        date: sanitizeText(pickValue(payment, ["date", "created_at", "createdAt"], "")),
        note: sanitizeText(pickValue(payment, ["note", "notes"], "")),
    }));

    return {
        storeName: String(
            pickValue(receiptSource, ["storeName", "store_name"], "")
                || pickValue(saleSource, ["storeName", "store_name"], "")
                || "STERY WHOLESALERS"
        ),
        branch: branch || "",
        branchName: branch || "",
        receiptNo: receiptNo || "",
        cashier: cashier || "",
        cashierName: cashier || "",
        customer: customer || "",
        customerName: customer || "",
        deliveryPerson: deliveryPerson || "",
        deliveryPersonName: deliveryPerson || "",
        date: date || "",
        items,
        subtotal,
        discount,
        vat,
        tax: vat,
        netAmount,
        total,
        paid,
        change,
        balance,
        paymentMethod: inferredMethod || "",
        paymentStatus: String(paymentStatus || ""),
        saleType: String(pickValue(receiptSource, ["saleType", "sale_type"], "") || pickValue(saleSource, ["saleType", "sale_type", "sale_type_name"], "") || ""),
        isCredit: Boolean(isCredit || pickValue(saleSource, ["is_credit_sale", "isCredit", "is_credit"], false)),
        footer: String(pickValue(receiptSource, ["footer"], "Thank you for shopping with us") || "Thank you for shopping with us"),
        printLogo: Boolean(pickValue(receiptSource, ["printLogo", "print_logo"], false) || pickValue(saleSource, ["printLogo", "print_logo"], false)),
        duplicateLabel: String(pickValue(receiptSource, ["duplicateLabel", "duplicate_label"], "") || ""),
        note: String(pickValue(receiptSource, ["note", "notes"], "") || ""),
        payments,
        conditions: conditions.length ? conditions : defaultReceiptConditions({
            saleType: String(pickValue(receiptSource, ["saleType", "sale_type"], "") || pickValue(saleSource, ["saleType", "sale_type", "sale_type_name"], "") || ""),
            isCredit: Boolean(isCredit || pickValue(saleSource, ["is_credit_sale", "isCredit", "is_credit"], false)),
        }),
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

function encodeReceiptPayloadForAndroid(receipt) {
    const json = JSON.stringify(receipt || {});
    return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function printReceiptAndroid(receipt) {
    const encoded = encodeReceiptPayloadForAndroid(receipt);
    console.info("[receipt] android print user-triggered", true);
    console.info("[receipt] android deep link length", encoded.length);
    const url = `steryprint://print?data=${encoded}`;
    window.location.href = url;
}

async function printReceiptPc(receipt) {
    return sendPrintBridgeJob(receipt);
}

async function printReceiptUsingSelectedMode(receipt, { saleId = "", allowBrowserFallback = false, userTriggered = false } = {}) {
    const mode = getPrintMode();
    console.info("[receipt] print mode", {
        mode,
        saleId: saleId || null,
        userTriggered: Boolean(userTriggered),
        androidButtonRendered: mode === "android",
    });

    if (mode === "none") {
        return { ok: true, skipped: true };
    }

    if (mode === "android") {
        console.info("[receipt] android button rendered", true);
        if (userTriggered) {
            console.info("[receipt] android button click handler firing", true);
            printReceiptAndroid(receipt);
            return { ok: true, mode };
        }
        console.info("[receipt] android print user-triggered", false);
        toast("Tap 'Print via Bluetooth' to launch Android printing.", "info");
        return { ok: true, mode };
    }

    if (mode === "pc") {
        try {
            await printReceiptPc(receipt);
            return { ok: true, mode };
        } catch (err) {
            console.warn("[receipt] pc print failed", err);
            toast(`PC print failed: ${err.message}`, "warning");
        }
    }

    if (allowBrowserFallback && saleId) {
        openBrowserReceiptFallback(`/api/sales/${saleId}/receipt/print/?paper=${encodeURIComponent(localStorage.getItem("pos_receipt_paper_width_mm") || "80")}`);
        return { ok: true, mode: "browser" };
    }
    return { ok: false, mode, skipped: true };
}

async function printReceipt({ allowBrowserFallback = true, userTriggered = false } = {}) {
    const saleId = currentReceiptSaleId || els.receiptModal?.dataset?.saleId || "";
    const receipt = currentReceiptPayload || null;

    if (!receipt) {
        const printUrl = saleId ? getReceiptPrintUrl(saleId) : "";
        if (printUrl) openBrowserReceiptFallback(printUrl);
        else window.print();
        return;
    }

    await printReceiptUsingSelectedMode(receipt, { saleId, allowBrowserFallback, userTriggered });
}

function closeReceiptModal() {
    newSale();
}

function newSale() {
    closeOverlay(els.receiptModal);
    resetMpesaPending();
    clearCart();
    currentSaleId = null;
    currentSaleType = "retail";
    currentReceiptSaleId = null;
    currentReceiptPayload = null;
    if (els.receiptModal) {
        delete els.receiptModal.dataset.saleId;
    }
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
    return ["cashier", "salesperson", "supervisor", "admin", "deliver_person", "delivery_person"].includes(normalizeRole(currentUserRole));
}

function canUpdateCustomerOrders() {
    return ["salesperson", "supervisor", "admin", "deliver_person", "delivery_person"].includes(normalizeRole(currentUserRole));
}

function canAssignCustomerOrders() {
    return ["salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canApproveCustomerCredit() {
    return ["salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canAccessDeliveryRun() {
    return isDeliveryRole();
}

function canViewDeliveryTracking() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function openCustomerOrdersModal({ statusList = null } = {}) {
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
    openOverlay(els.customerOrdersModal);
    customerOrdersLog("[customer-orders] modal opened");
    customerOrdersOffset = 0;
    if (Array.isArray(statusList) && statusList.length) {
        setCustomerOrdersStatusList(statusList);
    } else {
        loadCustomerOrders();
    }
    if (canAssignCustomerOrders()) {
        ensureAssignableUsers();
    }
}

function closeCustomerOrdersModal() {
    if (!els.customerOrdersModal) return;
    closeOverlay(els.customerOrdersModal);
}

// ——— Delivery Run (Delivery Person) ———
function openDeliveryRunModal() {
    if (!els.deliveryRunModal) return;
    if (!canAccessDeliveryRun()) {
        toast("You do not have access to delivery runs", "error");
        return;
    }
    currentDeliveryRun = null;
    if (els.deliveryRunError) {
        els.deliveryRunError.textContent = "";
        els.deliveryRunError.classList.add("hidden");
    }
    if (els.deliveryRunMeta) {
        els.deliveryRunMeta.innerHTML = `<div class="muted">Loading delivery run...</div>`;
    }
    if (els.deliveryRunHistory) {
        els.deliveryRunHistory.classList.add("muted");
        els.deliveryRunHistory.innerHTML = `No location history yet.`;
    }
    setDeliveryRunLocationState({ loading: true });
    closeDeliveryProofForm();
    openOverlay(els.deliveryRunModal, { closeOthers: false });
    loadMyDeliveryRun();
}

function closeDeliveryRunModal() {
    if (!els.deliveryRunModal) return;
    closeOverlay(els.deliveryRunModal);
    if (els.deliveryRunError) {
        els.deliveryRunError.textContent = "";
        els.deliveryRunError.classList.add("hidden");
    }
}

async function loadMyDeliveryRun() {
    if (!els.deliveryRunMeta) return;
    try {
        const endpoint = withParams("/delivery/runs/", {
            active: 1,
            limit: 1,
            offset: 0,
        });
        const data = await apiFetch(endpoint);
        const page = normalizePaginated(data);
        const runs = ensureArray(page, "deliveryRuns");
        const run = runs[0] || null;
        if (!run) {
            currentDeliveryRun = null;
            els.deliveryRunMeta.innerHTML = `<div class="muted">No active delivery run assigned.</div>`;
            setDeliveryRunLocationState({ run: null, history: [], loading: false });
            renderDeliveryRunHistoryList([], els.deliveryRunHistory);
            updateDeliveryRunActions(null);
            return;
        }
        currentDeliveryRun = run;
        renderDeliveryRunMeta(run);
        updateDeliveryRunActions(run);
        await loadDeliveryRunLocationHistory(run);
    } catch (err) {
        els.deliveryRunMeta.innerHTML = `<div class="muted">Failed to load delivery run.</div>`;
        setDeliveryRunError("Failed to load delivery run.");
        setDeliveryRunLocationState({ error: "Failed to load location history.", loading: false });
    }
}

function renderDeliveryRunMeta(run) {
    if (!els.deliveryRunMeta || !run) return;
    const statusBadge = renderDeliveryStatusBadge(run.status);
    const orderId = run.order?.id ? `#${shortOrderId(run.order.id)}` : "—";
    const customerName = run.order?.customer_name || "—";
    const branchName = run.branch?.name || "—";
    const lastLocation = formatLocation(run.last_known_latitude, run.last_known_longitude);
    const contactPhone = getDeliveryCustomerPhone(run);
    const directionsUrl = buildDeliveryDirectionsUrl(run);
    const deliveryPayments = ensureArray(run.sale?.delivery_payments || [], "deliveryPayments");
    const deliveryPaymentTotal = run.sale?.delivery_payment_total || (deliveryPayments.length ? deliveryPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || "0"), 0) : 0);
    els.deliveryRunMeta.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <div class="detail-row"><span>Order</span><strong>${orderId}</strong></div>
                <div class="detail-row"><span>Status</span><strong>${statusBadge}</strong></div>
                <div class="detail-row"><span>Customer</span><strong>${esc(customerName)}</strong></div>
                <div class="detail-row"><span>Branch</span><strong>${esc(branchName)}</strong></div>
            </div>
            <div class="detail-card">
                <div class="detail-row"><span>Assigned</span><strong>${formatDateTime(run.assigned_at)}</strong></div>
                <div class="detail-row"><span>Started</span><strong>${formatDateTime(run.started_at)}</strong></div>
                <div class="detail-row"><span>Last Ping</span><strong>${formatDateTime(run.last_ping_at)}</strong></div>
                <div class="detail-row"><span>Last Location</span><strong>${lastLocation}</strong></div>
                ${deliveryPayments.length ? `<div class="detail-row"><span>Delivery Payments</span><strong>${fmtPrice(deliveryPaymentTotal)}</strong></div>` : ""}
            </div>
        </div>
    `;
    renderDeliveryRunQuickActions(run, { contactPhone, directionsUrl });
}

function updateDeliveryRunActions(run) {
    const status = run?.status || "";
    const isActive = ["assigned", "picked_up", "en_route", "arrived"].includes(status);
    const isTerminal = ["delivered", "failed", "cancelled"].includes(status);
    const statusActions = buildDeliveryQuickStatusActions(run);
    if (!run) {
        if (els.deliveryRunQuickActions) {
            els.deliveryRunQuickActions.classList.add("hidden");
            els.deliveryRunQuickActions.innerHTML = "";
        }
        if (els.deliveryRunStatusActions) {
            els.deliveryRunStatusActions.classList.add("hidden");
            els.deliveryRunStatusActions.innerHTML = "";
        }
    }

    if (els.deliveryRunStart) {
        els.deliveryRunStart.disabled = !run || status !== "assigned";
    }
    if (els.deliveryRunLocation) {
        els.deliveryRunLocation.disabled = !run || !isActive;
    }
    if (els.deliveryRunComplete) {
        els.deliveryRunComplete.disabled = !run || isTerminal;
    }
    if (els.deliveryRunFail) {
        els.deliveryRunFail.disabled = !run || isTerminal;
    }
    if (els.deliveryRunStatus) {
        const options = buildDeliveryStatusOptions(status);
        els.deliveryRunStatus.innerHTML = options.length
            ? `<option value="">Update status…</option>${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join("")}`
            : `<option value="">No status updates</option>`;
        els.deliveryRunStatus.disabled = !run || !options.length;
    }
    if (els.deliveryRunStatusSubmit) {
        els.deliveryRunStatusSubmit.disabled = !run || !els.deliveryRunStatus || els.deliveryRunStatus.disabled;
    }
    if (els.deliveryRunStatusActions) {
        if (statusActions) {
            els.deliveryRunStatusActions.classList.remove("hidden");
            els.deliveryRunStatusActions.innerHTML = statusActions;
            els.deliveryRunStatusActions.querySelectorAll("[data-delivery-action]").forEach((btn) => {
                btn.addEventListener("click", () => updateDeliveryRunStatusFromButton(run?.id, btn.dataset.deliveryAction));
            });
        } else {
            els.deliveryRunStatusActions.classList.add("hidden");
            els.deliveryRunStatusActions.innerHTML = "";
        }
    }
}

function renderDeliveryRunQuickActions(run, { contactPhone = "", directionsUrl = "" } = {}) {
    if (!els.deliveryRunQuickActions) return;
    if (!run || ["delivered", "failed", "cancelled"].includes((run.status || "").toLowerCase())) {
        els.deliveryRunQuickActions.classList.add("hidden");
        els.deliveryRunQuickActions.innerHTML = "";
        return;
    }
    const actions = [];
    const phone = sanitizePhoneNumber(contactPhone);
    if (phone) {
        actions.push(`
            <button type="button" class="btn-secondary btn-inline" data-delivery-call="${esc(phone)}">Call</button>
        `);
        actions.push(`
            <button type="button" class="btn-secondary btn-inline" data-delivery-copy="${esc(phone)}">Copy</button>
        `);
    }
    if (directionsUrl) {
        actions.push(`
            <a class="btn-secondary btn-inline" href="${esc(directionsUrl)}" target="_blank" rel="noopener">Maps</a>
        `);
    }
    if (!actions.length) {
        els.deliveryRunQuickActions.classList.add("hidden");
        els.deliveryRunQuickActions.innerHTML = "";
        return;
    }
    els.deliveryRunQuickActions.classList.remove("hidden");
    els.deliveryRunQuickActions.innerHTML = actions.join("");
    const callBtn = els.deliveryRunQuickActions.querySelector("[data-delivery-call]");
    if (callBtn) {
        callBtn.addEventListener("click", () => {
            const phoneValue = callBtn.dataset.deliveryCall || "";
            if (!phoneValue) return;
            window.location.href = `tel:${phoneValue}`;
        });
    }
    const copyBtn = els.deliveryRunQuickActions.querySelector("[data-delivery-copy]");
    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            const phoneValue = copyBtn.dataset.deliveryCopy || "";
            if (!phoneValue) return;
            const ok = await copyTextToClipboard(phoneValue);
            toast(ok ? "Copied" : "Copy failed", ok ? "success" : "warning");
        });
    }
}

function buildDeliveryQuickStatusActions(run) {
    if (!run) return "";
    const status = (run.status || "").toLowerCase();
    if (["delivered", "failed", "cancelled"].includes(status)) return "";
    const actions = [];
    if (status === "assigned") {
        actions.push({ value: "start", label: "Start Delivery", cls: "btn-primary" });
    }
    if (status === "picked_up" || status === "en_route") {
        actions.push({ value: "arrived", label: "Mark Arrived", cls: "btn-secondary" });
    }
    if (status === "arrived") {
        actions.push({ value: "complete", label: "Complete Delivery", cls: "btn-primary" });
    }
    return actions.map(action => `<button type="button" class="${action.cls} btn-inline" data-delivery-action="${action.value}">${action.label}</button>`).join("");
}

async function updateDeliveryRunStatusFromButton(runId, action) {
    if (!runId || !action) return;
    if (action === "start") {
        await startDeliveryRun(runId);
        return;
    }
    if (action === "complete") {
        openDeliveryProofForm();
        return;
    }
    if (!els.deliveryRunStatus) return;
    if (!Array.from(els.deliveryRunStatus.options || []).some(opt => opt.value === action)) return;
    els.deliveryRunStatus.value = action;
    await updateDeliveryRunStatus(runId);
}

function getDeliveryCustomerPhone(run) {
    const direct = run?.recipient_phone || "";
    if (direct) return direct;
    const customerPhone = run?.sale?.customer?.phone || run?.order?.customer?.phone || "";
    return customerPhone || "";
}

function buildDeliveryDirectionsUrl(run) {
    const lat = run?.last_known_latitude ?? run?.end_latitude ?? run?.start_latitude;
    const lng = run?.last_known_longitude ?? run?.end_longitude ?? run?.start_longitude;
    if (lat == null || lng == null || lat === "" || lng === "") return "";
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
}

async function copyTextToClipboard(text) {
    const value = (text || "").toString().trim();
    if (!value) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (err) {
        // fall through to legacy path
    }
    try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
    } catch (err) {
        return false;
    }
}

function sanitizePhoneNumber(phone) {
    const value = (phone || "").toString().trim();
    if (!value) return "";
    const cleaned = value.replace(/[^\d+]/g, "");
    return cleaned || "";
}

function openDeliveryProofForm() {
    if (!els.deliveryRunPod) return;
    if (!currentDeliveryRun || ["delivered", "failed", "cancelled"].includes(currentDeliveryRun.status)) {
        return;
    }
    els.deliveryRunPod.classList.remove("hidden");
    if (els.deliveryPodName) {
        els.deliveryPodName.value = "";
        els.deliveryPodName.focus();
    }
    if (els.deliveryPodPhone) els.deliveryPodPhone.value = "";
    if (els.deliveryPodNotes) els.deliveryPodNotes.value = "";
    if (els.deliveryPaymentCash) els.deliveryPaymentCash.value = "";
    if (els.deliveryPaymentMpesa) els.deliveryPaymentMpesa.value = "";
    if (els.deliveryPaymentReference) els.deliveryPaymentReference.value = "";
    if (els.deliveryPaymentPhone) els.deliveryPaymentPhone.value = "";
    if (els.deliveryPaymentNotes) els.deliveryPaymentNotes.value = "";
    updateDeliveryPaymentSummary();
}

function closeDeliveryProofForm() {
    if (!els.deliveryRunPod) return;
    els.deliveryRunPod.classList.add("hidden");
    if (els.deliveryPodName) els.deliveryPodName.value = "";
    if (els.deliveryPodPhone) els.deliveryPodPhone.value = "";
    if (els.deliveryPodNotes) els.deliveryPodNotes.value = "";
    if (els.deliveryPaymentCash) els.deliveryPaymentCash.value = "";
    if (els.deliveryPaymentMpesa) els.deliveryPaymentMpesa.value = "";
    if (els.deliveryPaymentReference) els.deliveryPaymentReference.value = "";
    if (els.deliveryPaymentPhone) els.deliveryPaymentPhone.value = "";
    if (els.deliveryPaymentNotes) els.deliveryPaymentNotes.value = "";
    updateDeliveryPaymentSummary();
}

async function submitDeliveryProof(runId) {
    if (!runId) return;
    const recipientName = (els.deliveryPodName?.value || "").trim();
    const recipientPhone = (els.deliveryPodPhone?.value || "").trim();
    const deliveryNotes = (els.deliveryPodNotes?.value || "").trim();
    const deliveryPayments = collectDeliveryPayments();
    if (!recipientName) {
        setDeliveryRunError("Recipient name is required.");
        return;
    }
    if (deliveryPayments.error) {
        setDeliveryRunError(deliveryPayments.error);
        return;
    }
    setDeliveryRunError("");
    const ok = await completeDeliveryRun(runId, {
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        delivery_notes: deliveryNotes,
        delivery_payments: deliveryPayments.items,
    });
    if (ok) closeDeliveryProofForm();
}

function collectDeliveryPayments() {
    const payments = [];
    const cashAmount = parseFloat(els.deliveryPaymentCash?.value || "0");
    const mpesaAmount = parseFloat(els.deliveryPaymentMpesa?.value || "0");
    const reference = (els.deliveryPaymentReference?.value || "").trim();
    const phoneNumber = (els.deliveryPaymentPhone?.value || "").trim();
    const note = (els.deliveryPaymentNotes?.value || "").trim();

    if (Number.isNaN(cashAmount) || cashAmount < 0) {
        return { error: "Cash collected must be zero or greater." };
    }
    if (Number.isNaN(mpesaAmount) || mpesaAmount < 0) {
        return { error: "M-Pesa collected must be zero or greater." };
    }
    if (cashAmount > 0) {
        payments.push({
            method: "cash",
            amount: cashAmount.toFixed(2),
            note,
        });
    }
    if (mpesaAmount > 0) {
        if (!reference) {
            return { error: "M-Pesa reference is required when recording M-Pesa delivery payment." };
        }
        if (!phoneNumber) {
            return { error: "M-Pesa phone number is required when recording M-Pesa delivery payment." };
        }
        payments.push({
            method: "mpesa",
            amount: mpesaAmount.toFixed(2),
            reference,
            phone_number: phoneNumber,
            note,
        });
    }
    const collected = payments.reduce((sum, payment) => sum + parseFloat(payment.amount || "0"), 0);
    const balance = getCurrentDeliveryBalance();
    if (collected - balance > 0.009) {
        return { error: "Collected amount cannot exceed the outstanding balance." };
    }
    return { items: payments };
}

function getCurrentDeliveryBalance() {
    const sale = currentDeliveryRun?.sale;
    if (!sale) return 0;
    const balance = parseFloat(sale.balance_due ?? sale.grand_total ?? sale.balance ?? "0");
    return Number.isFinite(balance) ? balance : 0;
}

function updateDeliveryPaymentSummary() {
    if (!els.deliveryPaymentSummary) return;
    const deliveryPayments = collectDeliveryPayments();
    if (deliveryPayments.error) {
        els.deliveryPaymentSummary.textContent = deliveryPayments.error;
        return;
    }
    const collected = deliveryPayments.items.reduce((sum, payment) => sum + parseFloat(payment.amount || "0"), 0);
    const balance = getCurrentDeliveryBalance();
    const remaining = Math.max(0, balance - collected);
    els.deliveryPaymentSummary.textContent = collected > 0
        ? `Collected ${fmtPrice(collected)} · Remaining credit ${fmtPrice(remaining)}`
        : "No payment collected.";
}

function buildDeliveryStatusOptions(status) {
    const normalized = (status || "").toString().toLowerCase();
    const map = {
        picked_up: ["en_route", "arrived"],
        en_route: ["arrived"],
        arrived: [],
    };
    const options = map[normalized] || [];
    return options.map(value => ({
        value,
        label: formatLabel(value),
    }));
}

function setDeliveryRunError(message) {
    if (!els.deliveryRunError) return;
    if (!message) {
        els.deliveryRunError.textContent = "";
        els.deliveryRunError.classList.add("hidden");
        return;
    }
    els.deliveryRunError.textContent = message;
    els.deliveryRunError.classList.remove("hidden");
}

function setDeliveryRunLocationState({ run = currentDeliveryRun, history = [], loading = false, error = "" } = {}) {
    const hasSummary = Boolean(els.deliveryRunLocationSummary);
    const hasNote = Boolean(els.deliveryRunLocationNote);
    const hasError = Boolean(els.deliveryRunLocationError);
    if (!hasSummary && !hasNote && !hasError) return;

    if (els.deliveryRunLocationRefresh) {
        els.deliveryRunLocationRefresh.disabled = loading;
    }

    if (hasNote) {
        let note = "No location history yet.";
        if (loading) {
            note = "Loading location history...";
        } else if (error) {
            note = "Unable to load location history.";
        } else if (run && run.last_known_latitude != null && run.last_known_longitude != null) {
            note = "Last known location available.";
        }
        els.deliveryRunLocationNote.textContent = note;
    }

    if (hasError) {
        if (error) {
            els.deliveryRunLocationError.textContent = error;
            els.deliveryRunLocationError.classList.remove("hidden");
        } else {
            els.deliveryRunLocationError.textContent = "";
            els.deliveryRunLocationError.classList.add("hidden");
        }
    }

    if (hasSummary) {
        if (loading) {
            els.deliveryRunLocationSummary.classList.add("muted");
            els.deliveryRunLocationSummary.innerHTML = `<div class="muted">Loading location history...</div>`;
            return;
        }
        if (error) {
            els.deliveryRunLocationSummary.classList.add("muted");
            els.deliveryRunLocationSummary.innerHTML = `<div class="muted">Location summary unavailable.</div>`;
            return;
        }
        const pingCount = Array.isArray(history) ? history.length : 0;
        const hasAnyCoords = [
            run?.last_known_latitude,
            run?.last_known_longitude,
            run?.start_latitude,
            run?.start_longitude,
            run?.end_latitude,
            run?.end_longitude,
        ].some(value => value != null && value !== "");
        if (!hasAnyCoords && pingCount === 0) {
            els.deliveryRunLocationSummary.classList.add("muted");
            els.deliveryRunLocationSummary.innerHTML = `<div class="muted">No location history yet.</div>`;
            return;
        }
        const lastPing = formatDateTime(run?.last_ping_at);
        const pingLabel = `${pingCount} ping${pingCount === 1 ? "" : "s"}`;
        const lastKnownMapUrl = buildMapsUrl(run?.last_known_latitude, run?.last_known_longitude);
        const startMapUrl = buildMapsUrl(run?.start_latitude, run?.start_longitude);
        const endMapUrl = buildMapsUrl(run?.end_latitude, run?.end_longitude);
        els.deliveryRunLocationSummary.classList.remove("muted");
        els.deliveryRunLocationSummary.innerHTML = `
            <div class="detail-card delivery-run-location-card">
                <div class="detail-row">
                    <span>Last Known</span>
                    <strong class="location-inline" data-location-summary="last-known">
                        ${renderLocationDisplay(run?.last_known_latitude, run?.last_known_longitude, { mapsUrl: lastKnownMapUrl })}
                    </strong>
                </div>
                <div class="detail-row"><span>Last Ping</span><strong>${lastPing}</strong></div>
                <div class="detail-row">
                    <span>Start</span>
                    <strong class="location-inline" data-location-summary="start">
                        ${renderLocationDisplay(run?.start_latitude, run?.start_longitude, { mapsUrl: startMapUrl })}
                    </strong>
                </div>
                <div class="detail-row">
                    <span>End</span>
                    <strong class="location-inline" data-location-summary="end">
                        ${renderLocationDisplay(run?.end_latitude, run?.end_longitude, { mapsUrl: endMapUrl })}
                    </strong>
                </div>
                <div class="detail-row"><span>History</span><strong>${pingLabel}</strong></div>
            </div>
        `;
        enhanceFriendlyLocationLabels(els.deliveryRunLocationSummary);
    }
}

async function loadDeliveryRunLocationHistory(run) {
    if (!run || !els.deliveryRunHistory) {
        return;
    }
    setDeliveryRunLocationState({ run, history: [], loading: true });
    try {
        const history = await apiFetch(`/delivery/runs/${run.id}/history/`);
        const rows = ensureArray(history, "deliveryRunHistory").slice().sort((a, b) => {
            const aTime = new Date(a.recorded_at || 0).getTime() || 0;
            const bTime = new Date(b.recorded_at || 0).getTime() || 0;
            return bTime - aTime;
        });
        setDeliveryRunLocationState({ run, history: rows, loading: false });
        renderDeliveryRunHistoryList(rows, els.deliveryRunHistory);
    } catch (err) {
        setDeliveryRunLocationState({ run, history: [], loading: false, error: "Failed to load location history." });
        renderDeliveryRunHistoryList([], els.deliveryRunHistory);
    }
}

function renderDeliveryRunHistoryList(history, targetEl) {
    const emptyHtml = `<div class="muted">No location history yet.</div>`;
    if (!history || !history.length) {
        if (targetEl) {
            targetEl.classList.add("muted");
            targetEl.innerHTML = emptyHtml;
        }
        return emptyHtml;
    }
    const html = history.map(ping => {
        const metaParts = [];
        const accuracyVal = Number(ping.accuracy_meters);
        if (!Number.isNaN(accuracyVal)) metaParts.push(`±${accuracyVal.toFixed(1)}m`);
        const speedVal = Number(ping.speed_kph);
        if (!Number.isNaN(speedVal)) metaParts.push(`${speedVal.toFixed(1)} km/h`);
        const headingVal = Number(ping.heading_degrees);
        if (!Number.isNaN(headingVal)) metaParts.push(`${headingVal.toFixed(0)}°`);
        const metaLine = metaParts.length ? metaParts.join(" • ") : "—";
        const mapsUrl = buildMapsUrl(ping.latitude, ping.longitude);
        return `
            <div class="history-row">
                <div>
                    <strong>${formatDateTime(ping.recorded_at)}</strong>
                    <div class="history-meta">${metaLine}</div>
                </div>
                <div class="history-location">
                    ${renderLocationDisplay(ping.latitude, ping.longitude, { mapsUrl, coordsClass: "location-coords location-coords-small" })}
                </div>
            </div>
        `;
    }).join("");
    if (targetEl) {
        targetEl.classList.remove("muted");
        targetEl.innerHTML = html;
        enhanceFriendlyLocationLabels(targetEl);
    }
    return html;
}

async function startDeliveryRun(runId) {
    if (!runId) return;
    setDeliveryRunError("");
    let coords = null;
    try {
        coords = await getCurrentPosition();
    } catch (err) {
        toast("Location unavailable; starting without GPS", "warning");
    }
    try {
        await apiRequest(`/delivery/runs/${runId}/start/`, {
            method: "POST",
            body: coords ? { latitude: coords.latitude, longitude: coords.longitude } : {},
        });
        toast("Run started", "success");
        await loadMyDeliveryRun();
    } catch (err) {
        setDeliveryRunError(`Start failed: ${err.message}`);
    }
}

async function sendDeliveryRunLocation(runId) {
    if (!runId) return;
    setDeliveryRunError("");
    let coords;
    try {
        coords = await getCurrentPosition();
    } catch (err) {
        setDeliveryRunError(err.message || "Unable to access location.");
        return;
    }
    try {
        await apiRequest(`/delivery/runs/${runId}/location/`, {
            method: "POST",
            body: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy_meters: coords.accuracy,
                speed_kph: coords.speed,
                heading_degrees: coords.heading,
            },
        });
        toast("Location sent", "success");
        await loadMyDeliveryRun();
    } catch (err) {
        setDeliveryRunError(`Location update failed: ${err.message}`);
    }
}

async function updateDeliveryRunStatus(runId) {
    if (!runId || !els.deliveryRunStatus) return;
    const status = els.deliveryRunStatus.value;
    if (!status) {
        setDeliveryRunError("Select a status to update.");
        return;
    }
    setDeliveryRunError("");
    try {
        await apiRequest(`/delivery/runs/${runId}/status/`, {
            method: "POST",
            body: { status },
        });
        toast("Status updated", "success");
        await loadMyDeliveryRun();
    } catch (err) {
        setDeliveryRunError(`Status update failed: ${err.message}`);
    }
}

async function completeDeliveryRun(runId, proof = {}) {
    if (!runId) return;
    setDeliveryRunError("");
    let coords = null;
    try {
        coords = await getCurrentPosition();
    } catch (err) {
        toast("Location unavailable; completing without GPS", "warning");
    }
    try {
        await apiRequest(`/delivery/runs/${runId}/complete/`, {
            method: "POST",
            body: {
                ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
                ...proof,
            },
        });
        toast("Run completed", "success");
        await loadMyDeliveryRun();
        return true;
    } catch (err) {
        setDeliveryRunError(`Complete failed: ${err.message}`);
        return false;
    }
}

async function failDeliveryRun(runId) {
    if (!runId) return;
    setDeliveryRunError("");
    let coords = null;
    try {
        coords = await getCurrentPosition();
    } catch (err) {
        toast("Location unavailable; failing without GPS", "warning");
    }
    try {
        await apiRequest(`/delivery/runs/${runId}/fail/`, {
            method: "POST",
            body: coords ? { latitude: coords.latitude, longitude: coords.longitude } : {},
        });
        toast("Run marked failed", "success");
        await loadMyDeliveryRun();
    } catch (err) {
        setDeliveryRunError(`Fail update failed: ${err.message}`);
    }
}

function getCurrentPosition(options = {}) {
    if (!navigator.geolocation) {
        return Promise.reject(new Error("Geolocation is not supported on this device."));
    }
    const config = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        ...options,
    };
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    speed: pos.coords.speed,
                    heading: pos.coords.heading,
                });
            },
            (err) => {
                reject(new Error(err.message || "Unable to access location."));
            },
            config,
        );
    });
}

async function ensureAssignableUsers() {
    if (!canAssignCustomerOrders()) {
        assignableUsers = [];
        return;
    }
    if (assignableUsers.length) return;
    const users = await apiFetch("/accounts/assignable/");
    assignableUsers = Array.isArray(users) ? users : [];
}

function setCustomerOrdersFilter(status) {
    customerOrdersFilter = status || "all";
    customerOrdersStatusList = [];
    customerOrdersOffset = 0;
    if (els.customerOrdersFilters) {
        els.customerOrdersFilters.querySelectorAll(".order-filter").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.status === customerOrdersFilter);
        });
    }
    updateCustomerOrdersStatusNote();
    loadCustomerOrders();
}

function setCustomerOrdersStatusList(statusList = []) {
    customerOrdersStatusList = Array.isArray(statusList) ? statusList.filter(Boolean) : [];
    customerOrdersFilter = "all";
    customerOrdersOffset = 0;
    if (els.customerOrdersFilters) {
        els.customerOrdersFilters.querySelectorAll(".order-filter").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.status === "all");
        });
    }
    updateCustomerOrdersStatusNote();
    loadCustomerOrders();
}

function clearCustomerOrdersStatusList() {
    if (!customerOrdersStatusList.length) return;
    customerOrdersStatusList = [];
    customerOrdersOffset = 0;
    updateCustomerOrdersStatusNote();
    loadCustomerOrders();
}

function updateCustomerOrdersStatusNote() {
    if (!els.customerOrdersStatusNote) return;
    const hasMultiStatus = Array.isArray(customerOrdersStatusList) && customerOrdersStatusList.length > 0;
    els.customerOrdersStatusNote.classList.toggle("hidden", !hasMultiStatus);
    if (els.customerOrdersStatusNote) {
        els.customerOrdersStatusNote.setAttribute("aria-hidden", hasMultiStatus ? "false" : "true");
    }
    if (els.customerOrdersStatusClear) {
        els.customerOrdersStatusClear.disabled = !hasMultiStatus;
    }
}

async function loadCustomerOrders() {
    if (!els.customerOrdersList) return;
    customerOrdersFailed = false;
    els.customerOrdersLoading.classList.remove("hidden");
    els.customerOrdersError.classList.add("hidden");
    els.customerOrdersEmpty.classList.add("hidden");

    const isMultiStatus = Array.isArray(customerOrdersStatusList) && customerOrdersStatusList.length > 0;
    const params = new URLSearchParams();
    if (!isMultiStatus && customerOrdersFilter && customerOrdersFilter !== "all") {
        params.set("status", customerOrdersFilter);
    }
    if (customerOrdersQuery) {
        params.set("q", customerOrdersQuery);
    }
    if (!isMultiStatus) {
        params.set("limit", CUSTOMER_ORDERS_LIMIT);
        params.set("offset", customerOrdersOffset);
    }

    const endpoint = `/sales/customer-orders/${params.toString() ? `?${params}` : ""}`;
    customerOrdersLog("[customer-orders] fetch", endpoint, { isMultiStatus, statusList: customerOrdersStatusList });
    const data = isMultiStatus ? await apiFetchAll(endpoint) : await apiFetch(endpoint);
    const page = isMultiStatus ? { count: Array.isArray(data) ? data.length : 0, next: null, previous: null, results: ensureArray(data, "customerOrdersMulti") } : normalizePaginated(data);
    customerOrdersLog("[customer-orders] response", Array.isArray(page.results) ? page.results.length : page);
    if (!data && !isMultiStatus) {
        customerOrdersFailed = true;
        customerOrders = [];
        customerOrdersPage = { count: 0, next: null, previous: null, results: [] };
        els.customerOrdersError.textContent = "Unable to load customer orders. Please try again.";
        els.customerOrdersError.classList.remove("hidden");
    } else {
        const rows = isMultiStatus
            ? ensureArray(page.results, "customerOrdersMulti").filter(order => customerOrdersStatusList.includes(order.status))
            : page.results;
        customerOrders = rows;
        customerOrdersPage = isMultiStatus
            ? { count: rows.length, next: null, previous: null, results: rows }
            : page;
    }
    els.customerOrdersLoading.classList.add("hidden");
    updatePager({
        prevEl: els.customerOrdersPrev,
        nextEl: els.customerOrdersNext,
        pageEl: els.customerOrdersPage,
        offset: customerOrdersOffset,
        limit: isMultiStatus ? Math.max(customerOrdersPage.count || 0, 1) : CUSTOMER_ORDERS_LIMIT,
        pageData: customerOrdersPage,
    });
    if (isMultiStatus) {
        updateCustomerOrdersStatusNote();
    }
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
        const paymentBadge = renderPaymentOutstandingBadge(order);
        return `
            <div class="order-row ${active ? "active" : ""}" data-order="${order.id}">
                <div class="order-main">
                    <div class="order-top">
                        <div class="order-id">#${shortOrderId(order.id)}</div>
                        ${renderOrderStatusBadge(order.status)}
                        ${paymentBadge}
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
    const saleBalanceDue = parseFloat(sale.balance_due ?? sale.balance ?? "0");
    const saleHasBalance = !Number.isNaN(saleBalanceDue) && saleBalanceDue > 0.009;
    const customerName = order.customer?.name || "Customer";
    const branchName = order.branch?.name || "Branch";
    const assignedId = order.assigned_to?.id || "";
    const assignedLabel = order.assigned_to?.display_name || "Unassigned";
    const creditStatus = order.credit_approval_status || "not_requested";
    const deliveryWorkflow = isDeliveryRole() && currentUser?.id && assignedId && String(assignedId) === String(currentUser.id);
    const assigneeOptions = canAssignCustomerOrders()
        ? (assignableUsers.length
            ? `<option value="">Unassigned</option>` + assignableUsers.map(u => {
                const label = `${u.display_name || u.username} (${u.role})`;
                return `<option value="${u.id}" ${u.id === assignedId ? "selected" : ""}>${label}</option>`;
            }).join("")
            : `<option value="">Loading assignees…</option>`)
        : "";

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
    const saleAction = sale.id && !deliveryWorkflow
        ? saleCompleted
            ? saleHasBalance
                ? `
                    <button class="btn-secondary" data-open-credit-sale="${sale.id}" ${canPerformSales() ? "" : "disabled"}>
                        Record Payment
                    </button>
                `
                : `<div class="sale-completed-note">Linked sale paid.</div>`
            : `
                <button class="btn-secondary" data-open-sale="${sale.id}" ${canPerformSales() ? "" : "disabled"}>
                    Open Linked Sale
                </button>
            `
        : "";
    const deliveryRunActionBlock = sale.id && deliveryWorkflow
        ? `
            <div class="sale-actions">
                <div id="customer-order-delivery-run-actions" class="muted">Checking delivery run...</div>
            </div>
        `
        : "";
    const saleBlockedNote = !deliveryWorkflow && deliveryBlocked
        ? `<div class="sale-blocked-note">Complete the linked sale before marking this order delivered.</div>`
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
                    ${saleBlockedNote}
                </div>
            ` : ""}
            ${deliveryRunActionBlock}
        </div>
        ${creditActions ? `
            <div class="order-detail-card">
                <div class="credit-approval">
                    <div class="label">Credit Approval</div>
                    ${creditActions}
                </div>
            </div>
        ` : ""}
        ${canAssignCustomerOrders() ? `
        <div class="order-detail-card">
            <div class="order-detail-row">
                <div>
                    <div class="label">Assigned To</div>
                    <div class="assigned-current">${esc(assignedLabel)}</div>
                </div>
                <select id="customer-order-assign" class="summary-select">
                    ${assigneeOptions}
                </select>
            </div>
        </div>
        ` : ""}
        <div class="order-detail-card">
            <h4>Items</h4>
            <div class="order-items">${itemsHtml || "<div class='orders-detail-empty'>No items found.</div>"}</div>
        </div>
        <div class="order-detail-card">
            <div class="order-totals">
                <div><span>Subtotal</span><strong>${fmtPrice(sale.total_amount ?? 0)}</strong></div>
                <div><span>VAT (included)</span><strong>${fmtPrice(sale.tax ?? 0)}</strong></div>
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
    const openCreditBtn = els.customerOrderDetail.querySelector("button[data-open-credit-sale]");
    if (openCreditBtn) {
        openCreditBtn.addEventListener("click", () => openLinkedCreditPayment(openCreditBtn.dataset.openCreditSale));
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

    if (deliveryWorkflow) {
        loadCustomerOrderRunActions(order);
    }
}

async function loadCustomerOrderRunActions(order) {
    if (!order) return;
    const container = document.getElementById("customer-order-delivery-run-actions");
    if (!container) return;
    const sale = order.sale || {};
    const assignedId = order.assigned_to?.id || "";
    if (!isDeliveryRole() || !currentUser?.id || !assignedId || String(assignedId) !== String(currentUser.id)) {
        container.innerHTML = "";
        return;
    }
    if (sale.status !== "completed") {
        container.innerHTML = `<div class="sale-blocked-note">Complete the linked sale before starting delivery.</div>`;
        return;
    }

    container.innerHTML = `<div class="muted">Checking delivery run...</div>`;
    const existingRun = await findDeliveryRunForOrder(order.id);
    if (existingRun) {
        container.innerHTML = `<button class="btn-secondary" data-view-run="${existingRun.id}">View Delivery Run</button>`;
        const viewBtn = container.querySelector("[data-view-run]");
        if (viewBtn) {
            viewBtn.addEventListener("click", () => openBackOfficeDeliveryDetail(existingRun.id));
        }
        return;
    }
    container.innerHTML = `<button class="btn-primary" data-create-run="${order.id}">Start Delivery</button>`;
    const createBtn = container.querySelector("[data-create-run]");
    if (createBtn) {
        createBtn.addEventListener("click", () => createDeliveryRunForOrder(order.id, order.assigned_to?.id));
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
        const balanceDue = parseFloat(sale.balance_due ?? sale.balance ?? "0");
        const hasBalance = !Number.isNaN(balanceDue) && balanceDue > 0.009;
        if (hasBalance) {
            await openLinkedCreditPayment(sale.id);
            return;
        }
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

async function openLinkedCreditPayment(saleId) {
    if (!saleId) return;
    if (!canPerformSales()) {
        toast("You do not have permission to record payments", "error");
        return;
    }
    openCreditModal();
    try {
        await loadCreditSales();
        await selectCreditSale(saleId);
        setCreditTab("payments");
        toast("Record payment for the linked sale", "info");
    } catch (err) {
        toast("Failed to open credit payments", "error");
    }
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
    return ["admin", "supervisor"].includes(normalizeRole(currentUserRole));
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
    if (els.ledgerPerformancePanel) {
        els.ledgerPerformancePanel.classList.toggle("hidden", activeTab !== "performance");
    }
    if (activeTab === "expenses") {
        expensesOffset = 0;
        loadExpenses();
    }
    if (activeTab === "performance") {
        setPerformanceTab(performanceActiveTab);
    }
    if (activeTab === "overview") {
        initAiSummary();
    }
}

function buildLedgerParams({ includePagination = false } = {}) {
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
    if (includePagination) {
        params.set("limit", LEDGER_LIMIT);
        params.set("offset", ledgerOffset);
    }
    return params;
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
    openOverlay(els.ledgerModal);
    const scrollEl = els.ledgerModal.querySelector(".modal-body-scroll");
    if (scrollEl) scrollEl.scrollTo({ top: 0 });
    ledgerOffset = 0;
    loadLedger();
    initAiSummary();
}

function closeLedgerModal() {
    if (!els.ledgerModal) return;
    closeOverlay(els.ledgerModal);
}

async function loadLedger() {
    if (!els.ledgerList) return;
    ledgerFailed = false;
    if (els.ledgerLoading) els.ledgerLoading.classList.remove("hidden");
    if (els.ledgerError) els.ledgerError.classList.add("hidden");
    if (els.ledgerEmpty) els.ledgerEmpty.classList.add("hidden");

    const params = buildLedgerParams({ includePagination: true });
    const summaryParams = buildLedgerParams();
    const qs = params.toString();
    const summaryQs = summaryParams.toString();
    const [entries, summary] = await Promise.all([
        apiFetch(`/ledger/${qs ? `?${qs}` : ""}`),
        apiFetch(`/ledger/summary/${summaryQs ? `?${summaryQs}` : ""}`),
    ]);

    const page = normalizePaginated(entries);
    if (!entries) {
        ledgerFailed = true;
        ledgerEntries = [];
        ledgerPage = { count: 0, next: null, previous: null, results: [] };
        if (els.ledgerError) {
            els.ledgerError.textContent = "Unable to load ledger entries. Please try again.";
            els.ledgerError.classList.remove("hidden");
        }
    } else {
        ledgerEntries = page.results;
        ledgerPage = page;
    }

    ledgerSummary = summary || null;

    if (els.ledgerLoading) els.ledgerLoading.classList.add("hidden");
    renderLedgerSummary();
    renderLedgerEntries();
    updatePager({
        prevEl: els.ledgerPrev,
        nextEl: els.ledgerNext,
        pageEl: els.ledgerPage,
        offset: ledgerOffset,
        limit: LEDGER_LIMIT,
        pageData: ledgerPage,
    });
}

function setPerformanceTab(tab) {
    const activeTab = tab || "cashiers";
    performanceActiveTab = activeTab;
    if (els.performanceTabs) {
        els.performanceTabs.forEach(btn => {
            btn.classList.toggle("active", btn.dataset.perfTab === activeTab);
        });
    }
    if (els.performanceCashiersPanel) {
        els.performanceCashiersPanel.classList.toggle("hidden", activeTab !== "cashiers");
    }
    if (els.performanceSalesPanel) {
        els.performanceSalesPanel.classList.toggle("hidden", activeTab !== "salespeople");
    }
    if (els.performanceDeliveryPanel) {
        els.performanceDeliveryPanel.classList.toggle("hidden", activeTab !== "delivery");
    }
    if (els.performanceRoutesPanel) {
        els.performanceRoutesPanel.classList.toggle("hidden", activeTab !== "routes");
    }
    if (els.performanceRouteFilter) {
        els.performanceRouteFilter.classList.toggle("hidden", activeTab !== "routes");
    }
    if (els.performanceUserFilter) {
        els.performanceUserFilter.classList.toggle("hidden", activeTab === "routes");
    }
    loadPerformanceUsers();
    loadRoutes();
    loadPerformance();
}

function buildPerformanceParams() {
    const params = new URLSearchParams();
    const start = els.performanceStart?.value;
    const end = els.performanceEnd?.value;
    const branchId = els.performanceBranch?.value;
    const userId = els.performanceUser?.value;
    const routeId = els.performanceRoute?.value;
    if (start) params.set("date_from", start);
    if (end) params.set("date_to", end);
    if (branchId) params.set("branch", branchId);
    if (performanceActiveTab !== "routes" && userId) params.set("user_id", userId);
    if (performanceActiveTab === "routes" && routeId) params.set("route_id", routeId);
    return params.toString();
}

async function loadPerformanceUsers() {
    if (!els.performanceUser) return;
    if (performanceActiveTab === "routes") {
        return;
    }
    const roleMap = {
        cashiers: "cashier",
        salespeople: "salesperson",
        delivery: "deliver_person",
    };
    const role = roleMap[performanceActiveTab];
    if (!role) return;
    const branchId = els.performanceBranch?.value || "";
    const cacheKey = `${role}:${branchId}`;
    if (performanceUsersCache.has(cacheKey)) {
        renderPerformanceUserOptions(performanceUsersCache.get(cacheKey), role);
        return;
    }
    const qs = new URLSearchParams();
    qs.set("role", role);
    if (branchId) qs.set("branch", branchId);
    const data = await apiFetch(`/finance/performance/users/?${qs.toString()}`);
    if (!data) return;
    performanceUsersCache.set(cacheKey, data);
    renderPerformanceUserOptions(data, role);
}

function renderPerformanceUserOptions(users, role) {
    if (!els.performanceUser) return;
    const options = [`<option value="">All users</option>`]
        .concat((users || []).map(u => `<option value="${u.id}">${esc(u.full_name || u.username)}</option>`));
    els.performanceUser.innerHTML = options.join("");
    const selected = performanceUserSelections[performanceActiveTab] || "";
    if (selected) {
        els.performanceUser.value = selected;
    }
}

async function loadRoutes() {
    if (!els.performanceRoute || performanceActiveTab !== "routes") return;
    const branchId = els.performanceBranch?.value || "";
    if (performanceRoutesCache.branch === branchId && performanceRoutesCache.items.length) {
        renderRouteOptions(performanceRoutesCache.items);
        return;
    }
    const qs = new URLSearchParams();
    if (branchId) qs.set("branch", branchId);
    const data = await apiFetch(`/routes/${qs.toString() ? `?${qs.toString()}` : ""}`);
    if (!data) return;
    performanceRoutesCache = { branch: branchId, items: data };
    renderRouteOptions(data);
}

function renderRouteOptions(routes) {
    if (!els.performanceRoute) return;
    const options = [`<option value="">All routes</option>`]
        .concat((routes || []).map(r => `<option value="${r.id}">${esc(r.name)}</option>`));
    els.performanceRoute.innerHTML = options.join("");
}

async function loadPerformance() {
    if (!els.performanceLoading) return;
    if (els.performanceError) els.performanceError.classList.add("hidden");
    els.performanceLoading.classList.remove("hidden");

    const params = buildPerformanceParams();
    const endpointMap = {
        cashiers: "/finance/performance/cashiers/",
        salespeople: "/finance/performance/salespeople/",
        delivery: "/finance/performance/delivery/",
        routes: "/finance/performance/routes/",
    };
    const endpoint = endpointMap[performanceActiveTab] || endpointMap.cashiers;
    const url = params ? `${endpoint}?${params}` : endpoint;

    const data = await apiFetch(url);
    if (!data || !data.results) {
        if (els.performanceError) {
            els.performanceError.textContent = "Unable to load performance report. Please try again.";
            els.performanceError.classList.remove("hidden");
        }
        els.performanceLoading.classList.add("hidden");
        return;
    }
    performanceData[performanceActiveTab] = data.results || [];
    renderPerformance();
    els.performanceLoading.classList.add("hidden");
}

function renderPerformance() {
    if (performanceActiveTab === "cashiers") {
        renderCashierPerformance();
    } else if (performanceActiveTab === "salespeople") {
        renderSalespersonPerformance();
    } else if (performanceActiveTab === "delivery") {
        renderDeliveryPerformance();
    } else {
        renderRoutePerformance();
    }
}

function renderCashierPerformance() {
    const data = performanceData.cashiers || [];
    renderCashierSummary(data);
    if (els.performanceCashiersList) {
        if (!data.length) {
            els.performanceCashiersList.innerHTML = "";
            if (els.performanceCashiersEmpty) els.performanceCashiersEmpty.classList.remove("hidden");
            return;
        }
        if (els.performanceCashiersEmpty) els.performanceCashiersEmpty.classList.add("hidden");
        els.performanceCashiersList.innerHTML = `
            <table class="perf-table">
                <thead>
                    <tr>
                        <th>Cashier</th>
                        <th>Sales Count</th>
                        <th>Sales Total</th>
                        <th>Collections</th>
                        <th>Refund Count</th>
                        <th>Refund Total</th>
                        <th>Avg Sale</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${esc(row.user_name || "—")}</td>
                            <td>${row.sales_count_processed || 0}</td>
                            <td>${fmtPrice(row.sales_total_processed || 0)}</td>
                            <td>${fmtPrice(row.collections_processed || 0)}</td>
                            <td>${row.refunds_processed_count || 0}</td>
                            <td>${fmtPrice(row.refunds_total || 0)}</td>
                            <td>${fmtPrice(row.average_sale_value || 0)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }
}

function renderSalespersonPerformance() {
    const data = performanceData.salespeople || [];
    renderSalespersonSummary(data);
    if (els.performanceSalesList) {
        if (!data.length) {
            els.performanceSalesList.innerHTML = "";
            if (els.performanceSalesEmpty) els.performanceSalesEmpty.classList.remove("hidden");
            return;
        }
        if (els.performanceSalesEmpty) els.performanceSalesEmpty.classList.add("hidden");
        els.performanceSalesList.innerHTML = `
            <table class="perf-table">
                <thead>
                    <tr>
                        <th>Salesperson</th>
                        <th>Sales Count</th>
                        <th>Sales Total</th>
                        <th>Gross Profit</th>
                        <th>Margin %</th>
                        <th>Credit Issued</th>
                        <th>Credit Recovered</th>
                        <th>Outstanding</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${esc(row.user_name || "—")}</td>
                            <td>${row.sales_count_assigned || 0}</td>
                            <td>${fmtPrice(row.sales_total_assigned || 0)}</td>
                            <td>${fmtPrice(row.gross_profit_generated || 0)}</td>
                            <td>${fmtPercent(row.gross_margin_percent || 0)}</td>
                            <td>${fmtPrice(row.credit_issued || 0)}</td>
                            <td>${fmtPrice(row.credit_recovered || 0)}</td>
                            <td>${fmtPrice(row.outstanding_credit || 0)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }
}

function renderDeliveryPerformance() {
    const data = performanceData.delivery || [];
    renderDeliverySummary(data);
    if (els.performanceDeliveryList) {
        if (!data.length) {
            els.performanceDeliveryList.innerHTML = "";
            if (els.performanceDeliveryEmpty) els.performanceDeliveryEmpty.classList.remove("hidden");
            return;
        }
        if (els.performanceDeliveryEmpty) els.performanceDeliveryEmpty.classList.add("hidden");
        els.performanceDeliveryList.innerHTML = `
            <table class="perf-table">
                <thead>
                    <tr>
                        <th>Delivery Person</th>
                        <th>Assigned Orders</th>
                        <th>Delivered Orders</th>
                        <th>Assigned Sales</th>
                        <th>Collections</th>
                        <th>Outstanding</th>
                        <th>Overdue</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${esc(row.user_name || "—")}</td>
                            <td>${row.assigned_orders_count || 0}</td>
                            <td>${row.delivered_orders_count || 0}</td>
                            <td>${fmtPrice(row.assigned_sales_total || 0)}</td>
                            <td>${fmtPrice(row.collections_processed || 0)}</td>
                            <td>${fmtPrice(row.outstanding_credit || 0)}</td>
                            <td>${fmtPrice(row.overdue_credit || 0)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }
}

function renderRoutePerformance() {
    const data = performanceData.routes || [];
    renderRouteSummary(data);
    if (els.performanceRoutesList) {
        if (!data.length) {
            els.performanceRoutesList.innerHTML = "";
            if (els.performanceRoutesEmpty) els.performanceRoutesEmpty.classList.remove("hidden");
            return;
        }
        if (els.performanceRoutesEmpty) els.performanceRoutesEmpty.classList.add("hidden");
        els.performanceRoutesList.innerHTML = `
            <table class="perf-table">
                <thead>
                    <tr>
                        <th>Route</th>
                        <th>Customers</th>
                        <th>Sales Count</th>
                        <th>Sales Total</th>
                        <th>Collections</th>
                        <th>Outstanding</th>
                        <th>Overdue</th>
                        <th>Delivered</th>
                        <th>Avg Sale</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td>${esc(row.route_name || "—")}</td>
                            <td>${row.customers_count || 0}</td>
                            <td>${row.sales_count || 0}</td>
                            <td>${fmtPrice(row.sales_total || 0)}</td>
                            <td>${fmtPrice(row.collections_total || 0)}</td>
                            <td>${fmtPrice(row.outstanding_credit || 0)}</td>
                            <td>${fmtPrice(row.overdue_credit || 0)}</td>
                            <td>${row.delivered_orders_count || 0}</td>
                            <td>${fmtPrice(row.average_sale_value || 0)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }
}

function renderCashierSummary(data) {
    if (!els.performanceCashiersSummary) return;
    const totals = data.reduce(
        (acc, row) => {
            acc.sales += Number(row.sales_total_processed || 0);
            acc.collections += Number(row.collections_processed || 0);
            acc.refunds += Number(row.refunds_total || 0);
            return acc;
        },
        { sales: 0, collections: 0, refunds: 0 }
    );
    els.performanceCashiersSummary.innerHTML = `
        <div class="ledger-summary-grid">
            <div class="ledger-summary-card">
                <span>Total Sales Processed</span>
                <strong>${fmtPrice(totals.sales)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Collections</span>
                <strong>${fmtPrice(totals.collections)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Refunds</span>
                <strong>${fmtPrice(totals.refunds)}</strong>
            </div>
        </div>
    `;
}

function renderSalespersonSummary(data) {
    if (!els.performanceSalesSummary) return;
    const totals = data.reduce(
        (acc, row) => {
            acc.sales += Number(row.sales_total_assigned || 0);
            acc.grossProfit += Number(row.gross_profit_generated || 0);
            acc.outstanding += Number(row.outstanding_credit || 0);
            return acc;
        },
        { sales: 0, grossProfit: 0, outstanding: 0 }
    );
    els.performanceSalesSummary.innerHTML = `
        <div class="ledger-summary-grid">
            <div class="ledger-summary-card">
                <span>Total Sales</span>
                <strong>${fmtPrice(totals.sales)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Gross Profit</span>
                <strong>${fmtPrice(totals.grossProfit)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Outstanding Credit</span>
                <strong>${fmtPrice(totals.outstanding)}</strong>
            </div>
        </div>
    `;
}

function renderDeliverySummary(data) {
    if (!els.performanceDeliverySummary) return;
    const totals = data.reduce(
        (acc, row) => {
            acc.assigned += Number(row.assigned_orders_count || 0);
            acc.delivered += Number(row.delivered_orders_count || 0);
            acc.collections += Number(row.collections_processed || 0);
            return acc;
        },
        { assigned: 0, delivered: 0, collections: 0 }
    );
    els.performanceDeliverySummary.innerHTML = `
        <div class="ledger-summary-grid">
            <div class="ledger-summary-card">
                <span>Total Assigned Orders</span>
                <strong>${totals.assigned}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Delivered Orders</span>
                <strong>${totals.delivered}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Collections</span>
                <strong>${fmtPrice(totals.collections)}</strong>
            </div>
        </div>
    `;
}

function renderRouteSummary(data) {
    if (!els.performanceRoutesSummary) return;
    const totals = data.reduce(
        (acc, row) => {
            acc.sales += Number(row.sales_total || 0);
            acc.collections += Number(row.collections_total || 0);
            acc.outstanding += Number(row.outstanding_credit || 0);
            return acc;
        },
        { sales: 0, collections: 0, outstanding: 0 }
    );
    els.performanceRoutesSummary.innerHTML = `
        <div class="ledger-summary-grid">
            <div class="ledger-summary-card">
                <span>Total Sales</span>
                <strong>${fmtPrice(totals.sales)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Collections</span>
                <strong>${fmtPrice(totals.collections)}</strong>
            </div>
            <div class="ledger-summary-card">
                <span>Total Outstanding Credit</span>
                <strong>${fmtPrice(totals.outstanding)}</strong>
            </div>
        </div>
    `;
}

async function exportPerformanceCsv() {
    const params = buildPerformanceParams();
    const endpointMap = {
        cashiers: "/finance/performance/cashiers/export/",
        salespeople: "/finance/performance/salespeople/export/",
        delivery: "/finance/performance/delivery/export/",
        routes: "/finance/performance/routes/export/",
    };
    const endpoint = endpointMap[performanceActiveTab] || endpointMap.cashiers;
    const url = params ? `${endpoint}?${params}` : endpoint;
    await downloadCsv(url, `performance_${performanceActiveTab}.csv`);
}

async function exportFinanceCsv() {
    const params = buildLedgerParams();
    if (els.financeExportInclude?.checked) {
        params.set("include_entries", "1");
    }
    const qs = params.toString();
    await downloadCsv(`/finance/export/${qs ? `?${qs}` : ""}`, "finance_export.csv");
}

async function exportExpensesCsv() {
    const params = buildExpenseParams();
    const qs = params.toString();
    await downloadCsv(`/expenses/export/${qs ? `?${qs}` : ""}`, "expenses_export.csv");
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

function buildExpenseParams({ includePagination = false } = {}) {
    const params = new URLSearchParams();
    const start = els.expenseStart?.value;
    const end = els.expenseEnd?.value;
    const category = els.expenseCategoryFilter?.value?.trim();
    const branchId = els.expenseBranchFilter?.value;
    if (start) params.set("date_from", start);
    if (end) params.set("date_to", end);
    if (category) params.set("category", category);
    if (branchId) params.set("branch", branchId);
    if (includePagination) {
        params.set("limit", EXPENSES_LIMIT);
        params.set("offset", expensesOffset);
    }
    return params;
}

async function loadExpenses() {
    if (!els.expenseList) return;
    expensesFailed = false;
    if (els.expenseLoading) els.expenseLoading.classList.remove("hidden");
    if (els.expenseError) els.expenseError.classList.add("hidden");
    if (els.expenseEmpty) els.expenseEmpty.classList.add("hidden");

    const params = buildExpenseParams({ includePagination: true });
    const qs = params.toString();
    const data = await apiFetch(`/expenses/${qs ? `?${qs}` : ""}`);
    const page = normalizePaginated(data);
    if (!data) {
        expensesFailed = true;
        expensesList = [];
        expensesPage = { count: 0, next: null, previous: null, results: [] };
        if (els.expenseError) {
            els.expenseError.textContent = "Unable to load expenses. Please try again.";
            els.expenseError.classList.remove("hidden");
        }
    } else {
        expensesList = page.results;
        expensesPage = page;
    }
    if (els.expenseLoading) els.expenseLoading.classList.add("hidden");
    renderExpenses();
    updatePager({
        prevEl: els.expensePrev,
        nextEl: els.expenseNext,
        pageEl: els.expensePage,
        offset: expensesOffset,
        limit: EXPENSES_LIMIT,
        pageData: expensesPage,
    });
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
        expensesOffset = 0;
        ledgerOffset = 0;
        loadExpenses();
        loadLedger();
    } catch (err) {
        if (els.expenseFormError) {
            els.expenseFormError.textContent = err.message || "Unable to add expense.";
            els.expenseFormError.classList.remove("hidden");
        }
    }
}

// ——— Returns / Refunds ———
function openReturnsModal() {
    if (!API_TOKEN || !currentUser) {
        toast("Please log in to process returns", "error");
        openAuthModal();
        return;
    }
    if (!canProcessReturns()) {
        toast("You do not have permission to process returns", "error");
        return;
    }
    if (!els.returnsModal) return;
    openOverlay(els.returnsModal);
    clearReturnsState();
}

function closeReturnsModal() {
    if (!els.returnsModal) return;
    clearReturnsState();
    closeOverlay(els.returnsModal);
}

function clearReturnsState() {
    returnSale = null;
    returnItems = [];
    if (els.returnsSaleMeta) {
        els.returnsSaleMeta.classList.add("hidden");
        els.returnsSaleMeta.textContent = "";
    }
    if (els.returnsItems) els.returnsItems.innerHTML = "";
    if (els.returnsTotal) els.returnsTotal.textContent = "Refund Total: —";
    if (els.returnsError) els.returnsError.classList.add("hidden");
}

async function loadReturnableSale() {
    const saleId = (els.returnsSaleId?.value || "").trim();
    if (!saleId) {
        toast("Enter a sale ID", "error");
        return;
    }
    const data = await apiFetch(`/sales/${saleId}/returns/`);
    if (!data) {
        toast("Unable to load sale for return", "error");
        return;
    }
    returnSale = data.sale;
    returnItems = data.items || [];
    renderReturnsSale();
}

function renderReturnsSale() {
    if (!returnSale) return;
    if (els.returnsSaleMeta) {
        const customerName = customers.find(c => c.id === returnSale.customer)?.name || "Customer";
        els.returnsSaleMeta.innerHTML = `
            <strong>Sale #${shortOrderId(returnSale.id)}</strong> • ${esc(customerName)} • ${formatDateTime(returnSale.completed_at)}
        `;
        els.returnsSaleMeta.classList.remove("hidden");
    }
    renderReturnsItems();
}

function renderReturnsItems() {
    if (!els.returnsItems) return;
    if (!returnItems.length) {
        els.returnsItems.innerHTML = `<div class="orders-empty">No returnable items found.</div>`;
        return;
    }
    els.returnsItems.innerHTML = returnItems.map(item => {
        const remaining = item.quantity_remaining ?? 0;
        return `
            <div class="return-item" data-sale-item="${item.sale_item_id}">
                <div>
                    <div class="item-name">${esc(item.product_name)}</div>
                    <div class="item-meta">Sold ${item.quantity_sold} • Returned ${item.quantity_returned} • Remaining ${remaining}</div>
                </div>
                <div>
                    <label class="item-meta">Qty to return</label>
                    <input type="number" min="0" max="${remaining}" value="0" class="summary-input return-qty">
                </div>
                <div>
                    <label class="item-meta">Restock</label>
                    <input type="checkbox" class="return-restock" checked>
                </div>
                <div class="item-meta">Unit ${fmtPrice(item.unit_price || 0)}</div>
            </div>
        `;
    }).join("");
}

function buildReturnPayload() {
    if (!els.returnsItems) return { items: [] };
    const items = [];
    els.returnsItems.querySelectorAll(".return-item").forEach(row => {
        const saleItemId = row.dataset.saleItem;
        const qtyInput = row.querySelector(".return-qty");
        const restockInput = row.querySelector(".return-restock");
        const qty = parseInt(qtyInput?.value || "0", 10);
        if (qty > 0) {
            items.push({
                sale_item: saleItemId,
                quantity_returned: qty,
                restock_to_inventory: restockInput?.checked ?? true,
            });
        }
    });
    return { items };
}

async function submitReturn(dryRun) {
    if (!returnSale) {
        toast("Load a sale first", "error");
        return;
    }
    const payload = buildReturnPayload();
    if (!payload.items.length) {
        toast("Select at least one item to return", "error");
        return;
    }
    payload.dry_run = !!dryRun;
    if (els.returnsError) els.returnsError.classList.add("hidden");

    try {
        const res = await apiRequest(`/sales/${returnSale.id}/returns/`, {
            method: "POST",
            body: payload,
        });
        if (dryRun) {
            const total = res.total_refund_amount || 0;
            if (els.returnsTotal) els.returnsTotal.textContent = `Refund Total: ${fmtPrice(total)}`;
            toast("Refund calculated", "info");
        } else {
            const total = res.total_refund_amount || 0;
            if (els.returnsTotal) els.returnsTotal.textContent = `Refund Total: ${fmtPrice(total)}`;
            toast("Return processed", "success");
            loadReturnableSale();
        }
    } catch (err) {
        if (els.returnsError) {
            els.returnsError.textContent = err.message || "Return failed.";
            els.returnsError.classList.remove("hidden");
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
            <div class="ledger-section-title">Gross Profit</div>
            <div class="ledger-summary-grid">
                <div class="ledger-summary-card">
                    <span>Gross Profit Today</span>
                    <strong>${fmtPrice(summary.gross_profit_today || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Gross Profit This Month</span>
                    <strong>${fmtPrice(summary.gross_profit_month || 0)}</strong>
                </div>
                <div class="ledger-summary-card">
                    <span>Gross Margin This Month</span>
                    <strong>${fmtPercent(summary.gross_margin_percent_month || 0)}</strong>
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

function setAiStatus(text, tone = "") {
    if (!els.aiSummaryStatus) return;
    els.aiSummaryStatus.textContent = text;
    els.aiSummaryStatus.dataset.tone = tone;
}

function resetAiPanel() {
    if (els.aiSummaryFinancial) {
        els.aiSummaryFinancial.innerHTML = `<li class="ai-summary-placeholder">Open the ledger overview to generate a summary.</li>`;
    }
    if (els.aiSummaryOps) {
        els.aiSummaryOps.innerHTML = "";
    }
    if (els.aiSummaryAlerts) {
        els.aiSummaryAlerts.innerHTML = "";
    }
    if (els.aiSummaryActions) {
        els.aiSummaryActions.innerHTML = "";
    }
    if (els.aiSummaryUpdated) {
        els.aiSummaryUpdated.textContent = "—";
    }
    aiSummaryContext = { hasOutOfStock: false, hasPendingOrders: false, hasOverdueCredit: false };
    if (els.aiResponse) {
        els.aiResponse.classList.add("hidden");
        els.aiResponse.textContent = "";
    }
    if (els.aiError) {
        els.aiError.classList.add("hidden");
        els.aiError.textContent = "";
    }
    if (els.aiSummaryLoading) {
        els.aiSummaryLoading.classList.add("hidden");
    }
    setAiStatus("Ready");
}

function fmtKes(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    return `KES ${num.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCount(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    return num.toLocaleString("en-KE");
}

function fmtDelta(value, formatter = v => v) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    const sign = num > 0 ? "+" : num < 0 ? "-" : "";
    const absValue = formatter(Math.abs(num));
    return absValue ? `${sign}${absValue}` : "";
}

function fmtPercentDelta(current, baseline) {
    const cur = Number(current);
    const base = Number(baseline);
    if (!Number.isFinite(cur) || !Number.isFinite(base) || base === 0) return "";
    const diff = ((cur - base) / Math.abs(base)) * 100;
    const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
    return `${sign}${Math.abs(diff).toFixed(0)}%`;
}

function buildComparisonNote(current, comparisons, formatter) {
    const notes = comparisons
        .map(item => {
            if (!item || !Number.isFinite(Number(item.value))) return "";
            const delta = Number(current) - Number(item.value);
            if (!Number.isFinite(delta)) return "";
            const deltaText = fmtDelta(delta, formatter);
            const pctText = fmtPercentDelta(current, item.value);
            if (!deltaText && !pctText) return "";
            const suffix = pctText ? ` (${pctText})` : "";
            return `${item.label} ${deltaText}${suffix}`;
        })
        .filter(Boolean);
    return notes.join(" · ");
}

function addMetric(list, label, value, formatter = v => v, note = "") {
    if (value === null || value === undefined || value === "") return;
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    const formatted = formatter(num);
    if (!formatted) return;
    list.push({ label, value: formatted, note });
}

function addTextMetric(list, label, value) {
    const text = (value || "").toString().trim();
    if (!text) return;
    list.push({ label, value: text });
}

function renderMetricList(items, emptyText) {
    if (!items.length) {
        return `<li class="ai-summary-empty">${esc(emptyText)}</li>`;
    }
    return items.map(item => (
        `<li class="ai-metric-row">
            <div class="ai-metric-main">
                <span class="ai-metric-label">${esc(item.label)}</span>
                <span class="ai-metric-value">${esc(item.value)}</span>
            </div>
            ${item.note ? `<span class="ai-metric-note">${esc(item.note)}</span>` : ""}
        </li>`
    )).join("");
}

function formatShortTime(value) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
}

function focusLedgerDetails() {
    setLedgerTab("overview");
    if (els.ledgerSummary) {
        els.ledgerSummary.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    if (els.ledgerList) {
        els.ledgerList.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function focusOperationsDetails() {
    if (!canAccessBackOffice()) {
        focusLedgerDetails();
        return;
    }
    openBackOffice();
    setBackOfficeSection("orders");
}

function focusAlertsDetails() {
    if (!canAccessBackOffice()) {
        focusLedgerDetails();
        return;
    }
    // Fallback routing: direct to the most likely operational area based on alert type.
    if (aiSummaryContext.hasOutOfStock) {
        openBackOffice();
        setBackOfficeSection("inventory");
        return;
    }
    if (aiSummaryContext.hasPendingOrders) {
        openBackOffice();
        setBackOfficeSection("orders");
        return;
    }
    if (aiSummaryContext.hasOverdueCredit) {
        openBackOffice();
        setBackOfficeSection("payments");
        return;
    }
    openBackOffice();
    setBackOfficeSection("orders");
}

function initAiSummary() {
    if (!els.aiSummaryCard) return;
    if (!canViewLedger()) return;
    const now = Date.now();
    if (aiSummaryPending) return;
    if (aiSummaryLoadedAt && now - aiSummaryLoadedAt < 60_000) return;
    loadAiSummary();
}

async function loadAiSummary() {
    if (!els.aiSummaryCard) return;
    aiSummaryPending = true;
    if (els.aiSummaryLoading) els.aiSummaryLoading.classList.remove("hidden");
    if (els.aiError) els.aiError.classList.add("hidden");
    setAiStatus("Loading…", "loading");

    try {
        const params = buildLedgerParams();
        const summaryQs = params.toString();
        const branchId = els.ledgerBranch?.value || "";
        const hasDateFilter = params.get("date_from") || params.get("date_to");
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().slice(0, 10);
        const compareParams = new URLSearchParams(params.toString());
        compareParams.set("date_from", yesterdayKey);
        compareParams.set("date_to", yesterdayKey);

        const [summary, products, creditOpen, cashierPerf, orders, summaryYesterday] = await Promise.all([
            apiFetch(`/ledger/summary/${summaryQs ? `?${summaryQs}` : ""}`),
            apiFetch(withParams("/inventory/products/", { branch: branchId, limit: 200, offset: 0 })),
            apiFetch(`/sales/credit/open/`),
            apiFetch(`/finance/performance/cashiers/${summaryQs ? `?${summaryQs}` : ""}`),
            apiFetch(`/sales/backoffice/orders/${summaryQs ? `?${summaryQs}` : ""}`),
            !hasDateFilter ? apiFetch(`/ledger/summary/?${compareParams.toString()}`) : Promise.resolve(null),
        ]);

        const productPage = normalizePaginated(products);
        const productList = ensureArray(productPage, "ai-products");
        const ordersPage = normalizePaginated(orders);
        const ordersList = ensureArray(ordersPage, "ai-orders");
        const creditList = ensureArray(creditOpen, "ai-credit");
        const cashierResults = (cashierPerf && cashierPerf.results) ? cashierPerf.results : [];

        const financialMetrics = [];
        const salesToday = Number(summary?.sales_today);
        const salesWeekAvg = Number(summary?.sales_week) ? Number(summary?.sales_week) / 7 : null;
        const salesNote = buildComparisonNote(
            salesToday,
            [
                !hasDateFilter ? { label: "vs yesterday", value: summaryYesterday?.sales_today } : null,
                !hasDateFilter && Number.isFinite(salesWeekAvg) ? { label: "vs week avg", value: salesWeekAvg } : null,
            ],
            fmtKes
        );
        addMetric(financialMetrics, "Sales today", summary?.sales_today, fmtKes, salesNote);

        const grossToday = Number(summary?.gross_profit_today);
        const grossNote = buildComparisonNote(
            grossToday,
            !hasDateFilter ? [{ label: "vs yesterday", value: summaryYesterday?.gross_profit_today }] : [],
            fmtKes
        );
        addMetric(financialMetrics, "Gross profit today", summary?.gross_profit_today, fmtKes, grossNote);
        addMetric(financialMetrics, "Outstanding credit", summary?.outstanding_credit, fmtKes);
        addMetric(financialMetrics, "Net position", summary?.net_position, fmtKes);

        if (els.aiSummaryFinancial) {
            els.aiSummaryFinancial.innerHTML = renderMetricList(financialMetrics, "Financial data is unavailable.");
        }

        const pendingOrders = ordersList.filter(o => ["pending", "pending_credit_approval"].includes((o.status || "").toLowerCase()));
        const lowStockItems = productList.filter(p => Number(p.stock) <= 0);
        const opsMetrics = [];
        addMetric(opsMetrics, "Pending orders", pendingOrders.length, fmtCount);
        addMetric(opsMetrics, "Out of stock items", lowStockItems.length, fmtCount);
        addTextMetric(opsMetrics, "Top cashier", cashierResults[0]?.user_name);

        if (els.aiSummaryOps) {
            els.aiSummaryOps.innerHTML = renderMetricList(opsMetrics, "Operational data is unavailable.");
        }

        const alerts = [];
        aiSummaryContext = {
            hasOutOfStock: lowStockItems.length > 0,
            hasPendingOrders: pendingOrders.length > 0,
            hasOverdueCredit: Number(summary?.overdue_credit || 0) > 0,
        };
        if (lowStockItems.length) {
            const sample = lowStockItems.slice(0, 3).map(p => p.name).filter(Boolean);
            const suffix = lowStockItems.length > sample.length ? ` +${lowStockItems.length - sample.length} more` : "";
            const details = sample.length ? `: ${sample.join(", ")}${suffix}` : "";
            alerts.push({ tone: "critical", text: `Out of stock (${lowStockItems.length})${details}` });
        }
        if (pendingOrders.length) {
            alerts.push({ tone: "warn", text: `Pending orders: ${pendingOrders.length}` });
        }
        const overdue = Number(summary?.overdue_credit || 0);
        if (overdue > 0) {
            alerts.push({ tone: "critical", text: `Overdue credit: ${fmtKes(overdue)}` });
        }
        if (!alerts.length) {
            alerts.push({ tone: "ok", text: "No critical alerts detected." });
        }

        if (els.aiSummaryAlerts) {
            els.aiSummaryAlerts.innerHTML = alerts.map(item => (
                `<li class="ai-alert ${item.tone}">${esc(item.text)}</li>`
            )).join("");
        }

        const actions = [];
        if (lowStockItems.length) {
            actions.push({ tone: "critical", text: "Restock out-of-stock items and confirm replenishment ETA." });
        }
        if (pendingOrders.length) {
            actions.push({ tone: "warn", text: "Review pending orders and prioritize fulfillment backlog." });
        }
        if (overdue > 0) {
            actions.push({ tone: "critical", text: "Follow up on overdue credit balances and confirm collection plan." });
        }
        if (!hasDateFilter && Number.isFinite(salesToday) && salesToday === 0) {
            actions.push({ tone: "warn", text: "No sales recorded today. Verify trading activity or POS sync." });
        }
        if (!actions.length) {
            actions.push({ tone: "ok", text: "No urgent action required." });
        }
        if (els.aiSummaryActions) {
            els.aiSummaryActions.innerHTML = actions.map(item => (
                `<li class="ai-action ${item.tone}">${esc(item.text)}</li>`
            )).join("");
        }

        setAiStatus("Updated", "ok");
        if (els.aiSummaryUpdated) {
            els.aiSummaryUpdated.textContent = formatShortTime(new Date());
        }
        aiSummaryLoadedAt = Date.now();
    } catch (err) {
        if (els.aiError) {
            els.aiError.textContent = err.message || "Unable to load AI summary.";
            els.aiError.classList.remove("hidden");
        }
        setAiStatus("Error", "error");
    } finally {
        aiSummaryPending = false;
        if (els.aiSummaryLoading) els.aiSummaryLoading.classList.add("hidden");
    }
}

async function submitAiPrompt() {
    if (!els.aiPromptInput || !els.aiResponse) return;
    const prompt = (els.aiPromptInput.value || "").trim();
    if (!prompt) return;
    if (els.aiResponse) {
        els.aiResponse.innerHTML = `<div class="ai-response-text">Thinking…</div>`;
        els.aiResponse.classList.remove("hidden");
    }
    if (els.aiError) {
        els.aiError.classList.add("hidden");
        els.aiError.textContent = "";
    }

    const parseAiError = (err) => {
        const fallback = "Unable to answer right now.";
        if (!err || !err.message) return fallback;
        const raw = err.message;
        try {
            const data = JSON.parse(raw);
            if (data && typeof data.detail === "string") return data.detail;
        } catch (e) {
            // ignore JSON parse
        }
        return raw || fallback;
    };

    try {
        const data = await apiRequest("/ai/ask/", {
            method: "POST",
            body: { prompt },
        });
        if (!data || !data.answer) {
            throw new Error("AI response unavailable.");
        }
        const responsePayload = {
            title: data.source ? `${formatStatus(data.source)} Response` : "AI Response",
            text: data.answer,
        };
        els.aiResponse.innerHTML = renderAiResponse(responsePayload);
    } catch (err) {
        if (els.aiError) {
            els.aiError.textContent = parseAiError(err);
            els.aiError.classList.remove("hidden");
        }
    } finally {
        els.aiPromptInput.value = "";
    }
}

function buildAiResponse(prompt, summary) {
    const text = prompt.toLowerCase();
    if (!summary) {
        return { title: "Summary unavailable", lines: ["Refresh the ledger to pull the latest data."] };
    }

    const line = (label, value, formatter = v => v) => {
        if (value === null || value === undefined || value === "") return null;
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        const formatted = formatter(num);
        if (!formatted) return null;
        return `${label}: ${formatted}`;
    };

    const response = (title, lines, fallback = "No matching data available.") => {
        const clean = lines.filter(Boolean);
        return { title, lines: clean.length ? clean : [fallback] };
    };

    if (text.includes("sales")) {
        return response("Sales Snapshot", [
            line("Today", summary.sales_today, fmtKes),
            line("This week", summary.sales_week, fmtKes),
            line("This month", summary.sales_month, fmtKes),
        ]);
    }
    if (text.includes("credit")) {
        return response("Credit Position", [
            line("Outstanding credit", summary.outstanding_credit, fmtKes),
            line("Overdue credit", summary.overdue_credit, fmtKes),
        ]);
    }
    if (text.includes("profit")) {
        const margin = Number(summary.gross_margin_percent_month);
        const marginLine = Number.isFinite(margin) ? `Gross margin (month): ${fmtPercent(margin)}` : null;
        return response("Profit Snapshot", [
            line("Gross profit today", summary.gross_profit_today, fmtKes),
            line("Gross profit this month", summary.gross_profit_month, fmtKes),
            marginLine,
        ]);
    }
    if (text.includes("expenses")) {
        return response("Expense Snapshot", [
            line("Expenses today", summary.expenses_today, fmtKes),
            line("Expenses this month", summary.expenses_month, fmtKes),
            line("Net position", summary.net_position, fmtKes),
        ]);
    }

    return response("Business Snapshot", [
        line("Sales today", summary.sales_today, fmtKes),
        line("Gross profit today", summary.gross_profit_today, fmtKes),
        line("Outstanding credit", summary.outstanding_credit, fmtKes),
    ]);
}

function renderAiResponse(payload) {
    if (!payload) return "";
    if (typeof payload === "string") {
        return renderAiAnswer(payload);
    }
    const title = payload.title ? `<div class="ai-response-title">${esc(payload.title)}</div>` : "";
    if (payload.text) {
        return `${title}${renderAiAnswer(payload.text)}`;
    }
    const lines = Array.isArray(payload.lines) && payload.lines.length
        ? `<ul class="ai-response-list">${payload.lines.map(item => `<li>${esc(item)}</li>`).join("")}</ul>`
        : "";
    return `${title}${lines}`;
}

function renderAiAnswer(text) {
    const content = (text || "").toString().trim();
    if (!content) {
        return `<div class="ai-response-text">No response available.</div>`;
    }
    const sections = parseAiAnswerSections(content);
    return sections.map(section => {
        const sectionTitle = section.title
            ? `<div class="ai-response-section-title">${esc(section.title)}</div>`
            : "";
        const tone = section.tone ? ` data-tone="${section.tone}"` : "";
        return `<div class="ai-response-section"${tone}>${sectionTitle}${section.body}</div>`;
    }).join("");
}

function parseAiAnswerSections(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim());
    const sections = [];
    let current = { title: "", tone: "summary", blocks: [] };

    const pushSection = () => {
        if (!current) return;
        const body = renderAiBlocks(current.blocks);
        sections.push({
            title: current.title,
            tone: current.tone,
            body,
        });
    };

    const normalizeTitle = (value) => value.replace(/^#+\s*/, "").replace(/:$/, "").trim();
    const classifyTitle = (value) => {
        const t = value.toLowerCase();
        if (t.includes("financial")) return "finance";
        if (t.includes("operation")) return "ops";
        if (t.includes("alert")) return "alert";
        if (t.includes("action")) return "action";
        if (t.includes("risk")) return "risk";
        return "summary";
    };

    const isHeader = (line) => {
        if (!line) return false;
        if (line.startsWith("#")) return true;
        if (line.length <= 40 && /:$/.test(line)) return true;
        const lower = line.toLowerCase();
        return ["financial overview", "operations", "alerts", "action items", "risks"].some(key => lower === key);
    };

    lines.forEach((line) => {
        if (!line) {
            current.blocks.push({ type: "spacer" });
            return;
        }
        if (isHeader(line)) {
            if (current.blocks.length || current.title) {
                pushSection();
            }
            const title = normalizeTitle(line);
            current = { title, tone: classifyTitle(title), blocks: [] };
            return;
        }
        if (/^[-*•]\s+/.test(line)) {
            current.blocks.push({ type: "bullet", text: line.replace(/^[-*•]\s+/, "") });
            return;
        }
        if (line.includes(":")) {
            const [label, ...rest] = line.split(":");
            const value = rest.join(":").trim();
            if (label && value) {
                current.blocks.push({ type: "metric", label: label.trim(), value });
                return;
            }
        }
        current.blocks.push({ type: "text", text: line });
    });

    if (current.blocks.length || current.title) {
        pushSection();
    }
    return sections.length ? sections : [{ title: "Summary", tone: "summary", body: renderAiBlocks([{ type: "text", text }]) }];
}

function renderAiBlocks(blocks) {
    if (!blocks.length) {
        return `<div class="ai-response-text">No details provided.</div>`;
    }
    const html = [];
    let listItems = [];
    const flushList = () => {
        if (!listItems.length) return;
        html.push(`<ul class="ai-response-bullets">${listItems.join("")}</ul>`);
        listItems = [];
    };
    blocks.forEach((block) => {
        if (block.type === "bullet") {
            const tone = classifyAiBullet(block.text);
            listItems.push(`<li class="ai-response-bullet"${tone ? ` data-tone="${tone}"` : ""}>${esc(block.text)}</li>`);
            return;
        }
        flushList();
        if (block.type === "metric") {
            html.push(
                `<div class="ai-response-metric"><span class="ai-response-label">${esc(block.label)}</span><span class="ai-response-value">${esc(block.value)}</span></div>`
            );
            return;
        }
        if (block.type === "spacer") {
            html.push(`<div class="ai-response-spacer"></div>`);
            return;
        }
        html.push(`<div class="ai-response-text">${esc(block.text)}</div>`);
    });
    flushList();
    return html.join("");
}

function classifyAiBullet(text) {
    const lower = (text || "").toLowerCase();
    if (/(overdue|out of stock|failed|error|critical|risk|blocked|urgent)/.test(lower)) {
        return "critical";
    }
    if (/(pending|watch|review|attention|warning)/.test(lower)) {
        return "warn";
    }
    if (/(ok|stable|on track|no issues)/.test(lower)) {
        return "ok";
    }
    return "";
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
        heldSalesPage = { count: 0, next: null, previous: null, results: [] };
        updatePager({
            prevEl: els.heldSalesPrev,
            nextEl: els.heldSalesNext,
            pageEl: els.heldSalesPage,
            offset: heldSalesOffset,
            limit: HELD_SALES_LIMIT,
            pageData: heldSalesPage,
        });
        renderHeldSales([]);
        return;
    }
    const endpoint = withParams("/sales/held/", {
        limit: HELD_SALES_LIMIT,
        offset: heldSalesOffset,
    });
    const held = await apiFetch(endpoint);
    const page = normalizePaginated(held);
    if (!held) {
        heldSalesCache = [];
        heldSalesPage = { count: 0, next: null, previous: null, results: [] };
        updatePager({
            prevEl: els.heldSalesPrev,
            nextEl: els.heldSalesNext,
            pageEl: els.heldSalesPage,
            offset: heldSalesOffset,
            limit: HELD_SALES_LIMIT,
            pageData: heldSalesPage,
        });
        renderHeldSales([]);
        return;
    }
    heldSalesCache = page.results;
    heldSalesPage = page;
    updatePager({
        prevEl: els.heldSalesPrev,
        nextEl: els.heldSalesNext,
        pageEl: els.heldSalesPage,
        offset: heldSalesOffset,
        limit: HELD_SALES_LIMIT,
        pageData: heldSalesPage,
    });
    renderHeldSales(heldSalesCache);
}

function renderHeldSales(heldSales) {
    const targetLists = [els.heldSalesList, els.mobileHeldList].filter(Boolean);
    if (!targetLists.length) return;
    if (!heldSales.length) {
        targetLists.forEach(list => {
            list.innerHTML = `<div class="held-empty">No held sales</div>`;
        });
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

    const canSell = canPerformSales();
    const html = heldSales.map(sale => {
        const total = sale.grand_total || "0.00";
        const disabled = canSell ? "" : "disabled";
        const disabledAttr = canSell ? "" : `aria-disabled="true"`;
        return `
            <div class="held-item ${disabled}" ${disabledAttr} onclick="resumeHeldSale('${sale.id}')">
                <div class="held-info">
                    <div class="held-title">${customerName(sale.customer)}</div>
                    <div class="held-meta">${branchName(sale.branch)} • ${sale.sale_type || "retail"} • ${new Date(sale.updated_at || sale.sale_date).toLocaleString()}</div>
                </div>
                <div class="held-total">${fmtPrice(total)}</div>
            </div>
        `;
    }).join("");

    targetLists.forEach(list => {
        list.innerHTML = html;
    });
}

async function resumeHeldSale(saleId) {
    if (!canPerformSales()) {
        toast("Sales are not available for your role.", "error");
        return;
    }
    let sale;
    try {
        sale = await resumeSale(saleId);
    } catch (err) {
        toast(`Unable to resume sale: ${err.message}`, "error");
        return;
    }

    if (!ensureArray(allProducts, "allProducts").length) {
        await loadProducts();
    }

    const items = sale.items || [];
    cart = items.map(item => {
        const product = ensureArray(allProducts, "allProducts").find(p => p.id === item.product) || {
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

function fmtPercent(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0.00%";
    return `${num.toFixed(2)}%`;
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

function formatShortDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

function formatStatus(status) {
    if (!status) return "—";
    const text = status.toString().toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatLabel(value) {
    if (!value) return "—";
    return value
        .toString()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderStatusBadge(status) {
    const normalized = (status || "unpaid").toString().toLowerCase();
    const label = formatStatus(normalized);
    return `<span class="status-badge status-${normalized}">${label}</span>`;
}

function renderDeliveryStatusBadge(status) {
    const normalized = (status || "assigned").toString().toLowerCase();
    const label = formatLabel(normalized);
    return `<span class="status-badge status-${normalized}">${label}</span>`;
}

function formatCoord(value) {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    return num.toFixed(5);
}

function formatLocation(lat, lng) {
    const latText = formatCoord(lat);
    const lngText = formatCoord(lng);
    if (!latText || !lngText) return "—";
    return `${latText}, ${lngText}`;
}

function buildMapsUrl(lat, lng) {
    const latText = formatCoord(lat);
    const lngText = formatCoord(lng);
    if (!latText || !lngText) return "";
    return `https://www.google.com/maps?q=${encodeURIComponent(`${latText},${lngText}`)}`;
}

const locationLabelCache = new Map();
const locationLabelInflight = new Map();

function getLocationCacheKey(lat, lng) {
    const latText = formatCoord(lat);
    const lngText = formatCoord(lng);
    if (!latText || !lngText) return "";
    return `${latText},${lngText}`;
}

function formatFriendlyLocationLabel(data) {
    if (!data) return "";
    const address = data.address || {};
    const parts = [];
    if (address.neighbourhood) parts.push(address.neighbourhood);
    else if (address.suburb) parts.push(address.suburb);
    else if (address.village) parts.push(address.village);
    else if (address.town) parts.push(address.town);
    else if (address.city) parts.push(address.city);
    else if (address.county) parts.push(address.county);
    if (address.city && !parts.includes(address.city)) parts.push(address.city);
    if (!parts.length && data.name) parts.push(data.name);
    if (!parts.length && data.display_name) {
        parts.push(data.display_name.split(",").slice(0, 2).join(",").trim());
    }
    const label = parts.filter(Boolean).join(", ").trim();
    return label || "";
}

async function resolveFriendlyLocationLabel(lat, lng) {
    const cacheKey = getLocationCacheKey(lat, lng);
    if (!cacheKey) return "";
    if (locationLabelCache.has(cacheKey)) {
        return locationLabelCache.get(cacheKey);
    }
    if (locationLabelInflight.has(cacheKey)) {
        return locationLabelInflight.get(cacheKey);
    }

    const latText = formatCoord(lat);
    const lngText = formatCoord(lng);
    if (!latText || !lngText) return "";

    const request = fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latText)}&lon=${encodeURIComponent(lngText)}&zoom=18&addressdetails=1`, {
        method: "GET",
        headers: {
            Accept: "application/json",
        },
    })
        .then(async (response) => {
            if (!response.ok) throw new Error(`Reverse geocode failed (${response.status})`);
            const data = await response.json();
            const label = formatFriendlyLocationLabel(data) || "";
            const value = label || "";
            locationLabelCache.set(cacheKey, value);
            return value;
        })
        .catch(() => {
            locationLabelCache.set(cacheKey, "");
            return "";
        })
        .finally(() => {
            locationLabelInflight.delete(cacheKey);
        });

    locationLabelInflight.set(cacheKey, request);
    return request;
}

function enhanceFriendlyLocationLabels(rootEl) {
    if (!rootEl) return;
    const nodes = rootEl.querySelectorAll("[data-location-key]");
    nodes.forEach((node) => {
        const key = node.dataset.locationKey || "";
        if (!key) return;
        if (node.dataset.locationLabelEnhanced === key) return;
        node.dataset.locationLabelEnhanced = key;
        const coordsText = node.querySelector("[data-location-coords]")?.textContent || "—";
        resolveFriendlyLocationLabelFromKey(key).then((label) => {
            if (!node.isConnected) return;
            const labelEl = node.querySelector("[data-location-label]");
            const coordsEl = node.querySelector("[data-location-coords]");
            if (!labelEl || !coordsEl) return;
            if (label) {
                labelEl.textContent = label;
                coordsEl.textContent = coordsText;
                coordsEl.classList.remove("hidden");
            } else {
                labelEl.textContent = coordsText;
                coordsEl.classList.add("hidden");
            }
        });
    });
}

function resolveFriendlyLocationLabelFromKey(cacheKey) {
    if (!cacheKey) return Promise.resolve("");
    if (locationLabelCache.has(cacheKey)) {
        return Promise.resolve(locationLabelCache.get(cacheKey));
    }
    if (locationLabelInflight.has(cacheKey)) {
        return locationLabelInflight.get(cacheKey);
    }
    const [lat, lng] = cacheKey.split(",");
    return resolveFriendlyLocationLabel(lat, lng);
}

function renderLocationDisplay(lat, lng, { mapsUrl = "", element = null, coordsClass = "location-coords", labelClass = "location-label" } = {}) {
    const coordsText = formatLocation(lat, lng);
    const cacheKey = getLocationCacheKey(lat, lng);
    const safeMap = mapsUrl || buildMapsUrl(lat, lng);
    const labelAttr = cacheKey ? ` data-location-key="${esc(cacheKey)}"` : "";
    const html = `
        <span class="location-display"${labelAttr}>
            <span class="${labelClass}" data-location-label>${esc(coordsText)}</span>
            <span class="${coordsClass}" data-location-coords>${esc(coordsText)}</span>
            ${safeMap ? `<a class="location-map-link" href="${safeMap}" target="_blank" rel="noopener noreferrer">Open in Maps</a>` : ""}
        </span>
    `;
    if (element) element.innerHTML = html;
    if (cacheKey && element) {
        resolveFriendlyLocationLabel(lat, lng).then((label) => {
            if (!element.isConnected) return;
            const labelEl = element.querySelector("[data-location-label]");
            const coordsEl = element.querySelector("[data-location-coords]");
            if (!labelEl || !coordsEl) return;
            if (label) {
                labelEl.textContent = label;
                coordsEl.textContent = coordsText;
                coordsEl.classList.remove("hidden");
            } else {
                labelEl.textContent = coordsText;
                coordsEl.classList.add("hidden");
            }
        });
    }
    return html;
}

function formatPaymentMethod(method) {
    const normalized = (method || "cash").toString().toLowerCase();
    if (normalized === "mpesa") return "M-Pesa";
    return "Cash";
}

function formatPaymentMode(mode) {
    if (!mode) return "—";
    const normalized = mode.toString().toLowerCase();
    if (normalized === "mpesa") return "M-Pesa";
    if (normalized === "mobile_money") return "Mobile Money";
    if (normalized === "bank") return "Bank Transfer";
    if (normalized === "credit") return "Credit";
    if (normalized === "card") return "Card";
    return formatStatus(normalized);
}

function renderPaymentHistoryList(payments, { compact = false } = {}) {
    const list = ensureArray(payments, "payments");
    if (!list.length) {
        return `<div class="payment-empty">No payments yet</div>`;
    }
    const rows = list.map(payment => {
        const method = formatPaymentMethod(payment.method || payment.payment_method);
        const status = (payment.status || "completed").toString().toLowerCase();
        const metaParts = [];
        if (payment.reference) metaParts.push(`Ref: ${esc(payment.reference)}`);
        if (payment.phone_number) metaParts.push(esc(payment.phone_number));
        if (payment.payment_date) metaParts.push(formatDateTime(payment.payment_date));
        const metaLine = metaParts.length ? `<div class="payment-sub">${metaParts.join(" • ")}</div>` : "";
        const receivedBy = payment.received_by_name ? `<div class="payment-received">By ${esc(payment.received_by_name)}</div>` : "";
        return `
            <div class="payment-history-item ${compact ? "compact" : ""}">
                <div class="payment-main">
                    <div class="payment-line">
                        <span class="payment-method">${method}</span>
                        <span class="payment-amount">${fmtPrice(payment.amount)}</span>
                        ${renderStatusBadge(status)}
                    </div>
                    ${metaLine}
                </div>
                ${receivedBy}
            </div>
        `;
    }).join("");
    return `<div class="payment-history-list ${compact ? "compact" : ""}">${rows}</div>`;
}

function renderOrderStatusBadge(status) {
    const normalized = (status || "pending").toString().toLowerCase();
    const label = formatStatus(normalized).replace(/_/g, " ");
    return `<span class="status-badge status-order status-order-${normalized}">${label}</span>`;
}

function renderPaymentOutstandingBadge(order) {
    const sale = order?.sale;
    if (!sale || sale.status !== "completed") return "";
    const paymentStatus = (sale.payment_status || "").toString().toLowerCase();
    const balanceDue = parseFloat(sale.balance_due ?? "0");
    const hasBalance = !Number.isNaN(balanceDue) && balanceDue > 0.009;
    if (!hasBalance && !["partial", "unpaid"].includes(paymentStatus)) return "";
    if (paymentStatus === "partial") {
        return `<span class="status-badge status-payment status-payment-partial">Partial payment</span>`;
    }
    return `<span class="status-badge status-payment status-payment-outstanding">Payment outstanding</span>`;
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
    setActiveSaleRow(productId);
    renderCart();
    updateTotals();
    scheduleReprice();
    focusSearchInput();
}

function setActiveSaleRow(productId) {
    activeSaleRowId = productId || null;
}

function activateSaleRow(productId) {
    setActiveSaleRow(productId);
    renderCart();
}

function applySaleDetailToCart(sale) {
    if (!sale || !Array.isArray(sale.items)) return;
    currentSaleId = sale.id;
    currentOfflineDraftCorrelationId = null;
    currentSaleType = sale.sale_type || currentSaleType;
    els.saleTypeSelect.value = currentSaleType;

    const updated = sale.items.map(si => {
        const product = ensureArray(allProducts, "allProducts").find(p => p.id === si.product) || {
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
    openOverlay(els.authModal);
}

function closeAuthModal() {
    if (!els.authModal) return;
    closeOverlay(els.authModal);
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
    allProducts = ensureArray([], "allProducts");
    activeCategory = "all";
    buildCategoryFilters();
    renderProducts();
    if (!canPerformSales()) {
        if (!canManageCustomerOrders()) {
            toast("Logged in successfully, but your role does not have POS access.", "error");
            applyRoleUI();
            return;
        }
        applyRoleUI();
        return;
    }
    await loadBranches();
    restoreMobileBranchSelection();
    await Promise.all([
        loadCustomers(),
        loadAssignableUsers(),
        loadProducts(),
        loadMobileCategories(),
        loadHeldSales(),
    ]);
    if (isMobileLayout()) {
        if (window.history.state && window.history.state.mobileNav) {
            restoreMobileHistoryState(window.history.state);
        } else {
            const savedTab = getMobilePersistedActiveTab();
            const savedSnapshot = getMobileSavedTabState(savedTab);
            setMobileTab(savedTab, {
                syncHistory: false,
                preserveScroll: Boolean(savedSnapshot),
                restoreSnapshot: savedSnapshot,
            });
            syncMobileHistoryState("replace");
        }
        loadMobileDashboardSummary();
        if (activeMobileTab === "sales") loadMobileSales();
        if (activeMobileTab === "stock") loadMobileStock({ query: mobileStockQuery });
    }
    if (navigator.onLine) {
        syncOfflineDrafts();
    }
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
    mobileHistorySyncSuspended = true;
    mobileStateRestoring = true;
    setApiToken("");
    setUserRole("");
    currentUser = null;
    clearMobileUiState();
    firstProtectedFailure = null;
    updateAuthStatus();
    applyRoleUI();
    if (els.creditModal) closeOverlay(els.creditModal);
    if (els.customerOrdersModal) closeOverlay(els.customerOrdersModal);
    if (els.ledgerModal) closeOverlay(els.ledgerModal);
    if (els.returnsModal) closeOverlay(els.returnsModal);
    if (els.receiptModal) closeOverlay(els.receiptModal);
    closeOpenMobileHistoryOverlays();
    setMobileTab("home", { syncHistory: false, preserveScroll: true });
    mobileStateRestoring = false;
    mobileHistorySyncSuspended = false;
    if (isMobileLayout()) {
        syncMobileHistoryState("replace");
    }
}

function logout() {
    clearAuth();
    toast("Logged out", "info");
    openAuthModal();
}

function canPerformSales() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canCreateCustomer() {
    return ["salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canViewMobileSales() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canViewStock() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canViewCustomers() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canViewReports() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function isSupervisorOrAdmin() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}

function canProcessReturns() {
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
    if (els.mobileCartCheckout) {
        els.mobileCartCheckout.disabled = !canSell;
    }
    if (els.posScanBtn) {
        els.posScanBtn.disabled = !canSell;
    }
    if (els.mobileCustomerAdd) {
        els.mobileCustomerAdd.disabled = !canCreateCustomer();
    }
    updateMobileRoleBanner();
    renderMobileProducts();
    if (els.returnsBtn) {
        const canReturn = canProcessReturns();
        els.returnsBtn.classList.toggle("btn-disabled", !canReturn);
        els.returnsBtn.setAttribute("aria-disabled", canReturn ? "false" : "true");
    }
    if (els.customerOrdersBtn) {
        const canManage = canManageCustomerOrders();
        els.customerOrdersBtn.classList.toggle("btn-disabled", !canManage);
        els.customerOrdersBtn.setAttribute("aria-disabled", canManage ? "false" : "true");
    }
    if (els.deliveryRunBtn) {
        const canDelivery = canAccessDeliveryRun();
        els.deliveryRunBtn.classList.toggle("hidden", !canDelivery);
        els.deliveryRunBtn.setAttribute("aria-disabled", canDelivery ? "false" : "true");
    }
    if (els.ledgerBtn) {
        const canView = canViewLedger();
        els.ledgerBtn.classList.toggle("hidden", !canView);
        els.ledgerBtn.setAttribute("aria-disabled", canView ? "false" : "true");
    }
    if (els.backofficeLedgerTab) {
        const canView = canViewLedger();
        els.backofficeLedgerTab.classList.toggle("hidden", !canView);
        els.backofficeLedgerTab.setAttribute("aria-disabled", canView ? "false" : "true");
    }
    if (els.backofficeBtn) {
        const canBackOffice = canAccessBackOffice();
        els.backofficeBtn.classList.toggle("hidden", !canBackOffice);
        els.backofficeBtn.setAttribute("aria-disabled", canBackOffice ? "false" : "true");
    }
    if (els.productImportTools) {
        const canImport = canImportProducts();
        els.productImportTools.classList.toggle("hidden", !canImport);
    }
    updateMobileDashboardTiles();
}

function normalizeRole(role) {
    return (role || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_");
}

function getResolvedUserRole() {
    return normalizeRole(currentUser?.role || currentUserRole || localStorage.getItem("pos_user_role") || "");
}

function isDeliveryRole(role = getResolvedUserRole()) {
    const normalized = normalizeRole(role);
    return normalized === "deliver_person" || normalized === "delivery_person";
}

function canAccessDeliveryQueue() {
    return canViewDeliveryTracking();
}

function isDeliveryEligibleSale(sale) {
    if (!sale) return false;
    if (sale.delivery_required) return true;
    const assignedRole = normalizeRole(sale.assigned_to?.role);
    return assignedRole === "deliver_person" || assignedRole === "delivery_person";
}

function renderDeliverySaleBadge(sale) {
    if (!isDeliveryEligibleSale(sale)) return "";
    return `<span class="status-pill status-draft-queued">Delivery</span>`;
}

function renderDeliverySaleAction(sale, { buttonClass = "btn-ghost", compact = true } = {}) {
    if (!isDeliveryEligibleSale(sale) || !canAccessDeliveryQueue()) return "";
    const queueItem = getDeliveryQueueItemForSale(sale?.id);
    const existingRunId = queueItem?.existing_run_id || queueItem?.delivery_run_id || "";
    const label = existingRunId ? "View Run" : "Go to Delivery";
    const click = existingRunId
        ? `openBackOfficeDeliveryDetail('${existingRunId}')`
        : `openDeliveryQueueForSale('${sale.id}')`;
    const extraClass = compact ? "btn-inline" : "";
    const classes = [buttonClass, extraClass].filter(Boolean).join(" ");
    return `<button class="${classes}" onclick="${click}">${label}</button>`;
}

function syncDeliveryQueueIndex(rows) {
    backOfficeDeliveryQueueIndex = new Map();
    backOfficeDeliveryQueueSaleIndex = new Map();
    (Array.isArray(rows) ? rows : []).forEach(item => {
        if (!item?.id) return;
        backOfficeDeliveryQueueIndex.set(String(item.id), item);
        if (item.sale_id) backOfficeDeliveryQueueSaleIndex.set(String(item.sale_id), item);
        if (item.order_id) backOfficeDeliveryQueueSaleIndex.set(String(item.order_id), item);
    });
    backOfficeDeliveryQueueLoaded = true;
}

async function ensureDeliveryQueueCache({ force = false } = {}) {
    if (!canAccessDeliveryQueue()) return [];
    if (backOfficeDeliveryQueueLoading) return backOfficeDeliveryQueueLoading;
    if (backOfficeDeliveryQueueLoaded && !force) return backOfficeDeliveryQueue;
    backOfficeDeliveryQueueLoading = (async () => {
        const rows = await apiFetchAll(withParams("/delivery/queue/", { type: "sale" })) || [];
        const items = ensureArray(rows, "deliveryQueueCache");
        syncDeliveryQueueIndex(items);
        backOfficeDeliveryQueue = items;
        return items;
    })().finally(() => {
        backOfficeDeliveryQueueLoading = null;
    });
    return backOfficeDeliveryQueueLoading;
}

function getDeliveryQueueItemForSale(saleId) {
    if (!saleId) return null;
    return backOfficeDeliveryQueueSaleIndex.get(String(saleId)) || null;
}

function openDeliveryQueueForSale(saleId) {
    if (!saleId) return;
    if (!canAccessDeliveryQueue()) {
        toast("Delivery Queue is not available for your role.", "error");
        return;
    }
    if (!canAccessBackOffice()) {
        toast("You do not have access to Delivery Queue.", "error");
        return;
    }
    if (els.backofficeModal && els.backofficeModal.classList.contains("hidden")) {
        openBackOffice();
    }
    backOfficeDeliveryQueueHighlightSaleId = String(saleId);
    setBackOfficeSection("delivery");
    setBackOfficeDeliveryMode("queue");
}

function canImportProducts() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}
