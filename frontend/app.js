/* =========================================
   RetailPOS — Application Logic
   ========================================= */

const API_BASE = "/api";
const APP_BUILD = "2026-04-06.2";
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
let backOfficeProducts = [];
let backOfficeActiveSection = "products";
let backOfficeQuery = "";
let editingProductId = null;
let backOfficeCategories = [];
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
let editingBranchId = null;
let editingRouteId = null;
let editingCategoryId = null;
let inventoryAdjustments = [];
let inventoryAdjustProducts = [];
let inventoryAdjustOffset = 0;
let inventoryAdjustLimit = 20;
let inventoryAdjustPage = { count: 0, next: null, previous: null, results: [] };
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
let backOfficePayments = [];
let backOfficePaymentsQuery = "";
let backOfficePaymentsOffset = 0;
let backOfficePaymentsLimit = 20;
let backOfficePaymentsPage = { count: 0, next: null, previous: null, results: [] };
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
    printReceiptBtn: document.getElementById("print-receipt-btn"),
    receiptCloseBtn: document.getElementById("receipt-close-btn"),
    newSaleBtn:      document.getElementById("new-sale-btn"),
    toastContainer:  document.getElementById("toast-container"),
    authBtn:         document.getElementById("auth-btn"),
    logoutBtn:       document.getElementById("logout-btn"),
    creditBtn:       document.getElementById("credit-btn"),
    customerOrdersBtn: document.getElementById("customer-orders-btn"),
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
    customerOrdersSearch: document.getElementById("customer-orders-search"),
    customerOrdersList: document.getElementById("customer-orders-list"),
    customerOrdersLoading: document.getElementById("customer-orders-loading"),
    customerOrdersError: document.getElementById("customer-orders-error"),
    customerOrdersEmpty: document.getElementById("customer-orders-empty"),
    customerOrderDetail: document.getElementById("customer-order-detail"),
    customerOrdersPrev: document.getElementById("customer-orders-prev"),
    customerOrdersNext: document.getElementById("customer-orders-next"),
    customerOrdersPage: document.getElementById("customer-orders-page"),
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
    backofficeCustomerSection: document.getElementById("backoffice-customers"),
    backofficeStaffSection: document.getElementById("backoffice-staff"),
    backofficeInventorySection: document.getElementById("backoffice-inventory"),
    backofficeSalesSection: document.getElementById("backoffice-sales"),
    backofficeOrdersSection: document.getElementById("backoffice-orders"),
    backofficePaymentsSection: document.getElementById("backoffice-payments"),
    backofficeSetupSection: document.getElementById("backoffice-setup"),
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
    backofficePaymentsSearch: document.getElementById("backoffice-payments-search"),
    backofficePaymentsBranch: document.getElementById("backoffice-payments-branch"),
    backofficePaymentsMethod: document.getElementById("backoffice-payments-method"),
    backofficePaymentsStatus: document.getElementById("backoffice-payments-status"),
    backofficePaymentsFrom: document.getElementById("backoffice-payments-from"),
    backofficePaymentsTo: document.getElementById("backoffice-payments-to"),
    backofficePaymentsTable: document.getElementById("backoffice-payments-table"),
    backofficePaymentsPrev: document.getElementById("backoffice-payments-prev"),
    backofficePaymentsNext: document.getElementById("backoffice-payments-next"),
    backofficePaymentsPage: document.getElementById("backoffice-payments-page"),
    backofficePaymentsExport: document.getElementById("backoffice-payments-export"),
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

function openOverlay(overlayEl, { closeOthers = true } = {}) {
    if (!overlayEl) return;
    if (closeOthers) closeAllOverlays({ except: overlayEl });
    overlayEl.classList.remove("hidden");
    const existingIndex = overlayStack.indexOf(overlayEl.id);
    if (existingIndex !== -1) overlayStack.splice(existingIndex, 1);
    overlayStack.push(overlayEl.id);
    updateOverlayState();
}

function closeOverlay(overlayEl) {
    if (!overlayEl) return;
    overlayEl.classList.add("hidden");
    const index = overlayStack.indexOf(overlayEl.id);
    if (index !== -1) overlayStack.splice(index, 1);
    updateOverlayState();
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
    const ledgerBtn = e.target.closest("#ledger-btn");
    if (ledgerBtn) {
        e.preventDefault();
        openLedgerModal();
    }
});
customerOrdersLog("[customer-orders] delegated listener attached");

function registerStaffServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
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
    setupOverlayInteractions();

    els.productSearch.addEventListener("input", () => {
        searchResultIndex = -1;
        updateSearchResults();
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
    if (els.backofficePaymentsSearch) {
        els.backofficePaymentsSearch.addEventListener("input", () => {
            backOfficePaymentsQuery = els.backofficePaymentsSearch.value || "";
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsBranch) {
        els.backofficePaymentsBranch.addEventListener("change", () => {
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsMethod) {
        els.backofficePaymentsMethod.addEventListener("change", () => {
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsStatus) {
        els.backofficePaymentsStatus.addEventListener("change", () => {
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsFrom) {
        els.backofficePaymentsFrom.addEventListener("change", () => {
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsTo) {
        els.backofficePaymentsTo.addEventListener("change", () => {
            backOfficePaymentsOffset = 0;
            loadBackOfficePayments();
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
    if (els.backofficePaymentsPrev) {
        els.backofficePaymentsPrev.addEventListener("click", () => {
            if (backOfficePaymentsOffset <= 0) return;
            backOfficePaymentsOffset = Math.max(0, backOfficePaymentsOffset - backOfficePaymentsLimit);
            loadBackOfficePayments();
        });
    }
    if (els.backofficePaymentsNext) {
        els.backofficePaymentsNext.addEventListener("click", () => {
            if (backOfficePaymentsOffset + backOfficePaymentsLimit >= (backOfficePaymentsPage?.count || 0)) return;
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
        els.printReceiptBtn.addEventListener("click", printReceipt);
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
    branches = await apiFetch("/business/branches/") || [];
    els.branchSelect.innerHTML = branches.length
        ? branches.map(b => `<option value="${b.id}">${b.name} — ${b.location}</option>`).join("")
        : `<option value="">No branches found</option>`;
    if (heldSalesCache.length) renderHeldSales(heldSalesCache);
    renderExpenseBranchOptions();
}

async function loadCustomers() {
    customers = ensureArray(await apiFetchAll("/customers/"), "customers");
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
    const products = await apiFetchAll("/inventory/products/");
    allProducts = ensureArray(products, "allProducts");
    buildCategoryFilters();
    renderProducts();
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
    if (els.backofficePaymentsSection) {
        els.backofficePaymentsSection.classList.toggle("hidden", backOfficeActiveSection !== "payments");
    }
    if (els.backofficeSetupSection) {
        els.backofficeSetupSection.classList.toggle("hidden", backOfficeActiveSection !== "setup");
    }
    if (backOfficeActiveSection === "customers") {
        loadBackOfficeCustomers();
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
    if (backOfficeActiveSection === "payments") {
        loadBackOfficePayments();
    }
    if (backOfficeActiveSection === "setup") {
        setBackOfficeSetupSection(backOfficeSetupSection || "branches");
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
                <td><button class="btn-ghost" onclick="openBackOfficeSaleDetail('${sale.id}')">View</button></td>
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
    `;
}

async function loadBackOfficePayments() {
    if (!canAccessBackOffice()) return;
    try {
        await loadBackOfficeBranches();
        const endpoint = withParams("/payments/backoffice/", {
            limit: backOfficePaymentsLimit,
            offset: backOfficePaymentsOffset,
            q: backOfficePaymentsQuery,
            branch: els.backofficePaymentsBranch?.value || "",
            method: els.backofficePaymentsMethod?.value || "",
            status: els.backofficePaymentsStatus?.value || "",
            date_from: els.backofficePaymentsFrom?.value || "",
            date_to: els.backofficePaymentsTo?.value || "",
        });
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
                tbody.innerHTML = `<tr><td colspan="11">Failed to load payments.</td></tr>`;
            }
        }
    }
}

function exportBackOfficePayments() {
    if (!canAccessBackOffice()) return;
    downloadCsv("/payments/backoffice/export/", "backoffice-payments.csv", {
        limit: backOfficePaymentsLimit,
        offset: backOfficePaymentsOffset,
        q: backOfficePaymentsQuery,
        branch: els.backofficePaymentsBranch?.value || "",
        method: els.backofficePaymentsMethod?.value || "",
        status: els.backofficePaymentsStatus?.value || "",
        date_from: els.backofficePaymentsFrom?.value || "",
        date_to: els.backofficePaymentsTo?.value || "",
    });
}

function renderBackOfficePayments() {
    if (!els.backofficePaymentsTable) return;
    const tbody = els.backofficePaymentsTable.querySelector("tbody");
    if (!tbody) return;
    const rows = backOfficePayments;
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="11">No payments found</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map(payment => {
        const paymentId = shortOrderId(payment.id);
        const saleId = shortOrderId(payment.sale_id);
        const customerName = payment.customer?.name || "—";
        const branchName = payment.branch?.name || "—";
        const methodLabel = formatPaymentMethod(payment.method);
        const statusBadge = renderStatusBadge(payment.status);
        const refValue = payment.reference || payment.provider_checkout_id || payment.provider_request_id || "—";
        const phoneValue = payment.phone_number || "—";
        return `
            <tr>
                <td>${paymentId}</td>
                <td>${saleId}</td>
                <td>${esc(customerName)}</td>
                <td>${esc(branchName)}</td>
                <td>${methodLabel}</td>
                <td>${statusBadge}</td>
                <td>${fmtPrice(payment.amount || 0)}</td>
                <td><span class="payment-ref">${esc(refValue)}</span></td>
                <td>${esc(phoneValue)}</td>
                <td>${formatDateTime(payment.payment_date)}</td>
                <td><button class="btn-ghost" onclick="openBackOfficePaymentDetail('${payment.id}')">View</button></td>
            </tr>
        `;
    }).join("");
}

async function openBackOfficePaymentDetail(paymentId) {
    if (!paymentId || !els.backofficePaymentDetailModal) return;
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
    const receivedBy = payment.received_by?.name || "—";
    const verifiedBy = payment.verified_by?.name || "—";
    const metadataJson = payment.provider_metadata ? JSON.stringify(payment.provider_metadata, null, 2) : "";
    const metadataBlock = metadataJson
        ? `<pre class="detail-json">${esc(metadataJson)}</pre>`
        : `<div class="muted">No provider metadata.</div>`;

    const saleAction = sale.id
        ? `<div class="detail-actions"><button class="btn-secondary" onclick="openBackOfficeSaleDetail('${sale.id}')">View Sale</button></div>`
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
            </div>
        </div>
        ${saleAction}
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
}

async function submitInventoryAdjustment() {
    if (!canAccessBackOffice()) return;
    const productId = els.inventoryAdjustProduct?.value || "";
    const branchId = els.inventoryAdjustBranch?.value || "";
    const type = els.inventoryAdjustType?.value || "increase";
    const qty = Number(els.inventoryAdjustQty?.value || 0);
    const reason = els.inventoryAdjustReason?.value?.trim() || "";
    const note = els.inventoryAdjustNote?.value?.trim() || "";

    if (!productId || !branchId) {
        const message = "Product and branch are required.";
        if (els.inventoryAdjustError) els.inventoryAdjustError.textContent = message;
        toast(message, "error");
        return;
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
    const currentPaymentsBranch = els.backofficePaymentsBranch?.value || "";
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

    if (els.backofficePaymentsBranch) {
        els.backofficePaymentsBranch.innerHTML = `
            <option value="">All branches</option>
            ${branches.map(b => `<option value="${b.id}">${esc(b.name)} — ${esc(b.location || "")}</option>`).join("")}
        `;
        if (currentPaymentsBranch) {
            els.backofficePaymentsBranch.value = currentPaymentsBranch;
        }
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
    }
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

    if (!shouldOpen || !query) {
        hideSearchResults();
        return;
    }

    if (!searchResults.length) {
        els.productSearchResults.innerHTML = `<div class="search-result-empty">No matches</div>`;
        els.productSearchResults.classList.remove("hidden");
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
    cart = cart.filter(i => i.product.id !== productId);
    if (activeSaleRowId === productId) {
        activeSaleRowId = null;
    }
    renderCart();
    updateTotals();
    scheduleReprice();
}

async function clearCart() {
    resetMpesaPending();
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
            <tr class="sale-entry-empty">
                <td colspan="7">No items yet. Use search to add products.</td>
            </tr>`;
        return;
    }

    els.cartItems.innerHTML = cart.map(item => {
        const unitPrice = getItemUnitPrice(item);
        const total = getItemLineTotal(item, unitPrice);
        const priceType = item.price_type_used ? item.price_type_used : "";
        const priceReason = item.pricing_reason ? item.pricing_reason : "";
        const rowClass = activeSaleRowId === item.product.id ? "sale-entry-row active" : "sale-entry-row";
        return `
            <tr class="${rowClass}" onclick="activateSaleRow('${item.product.id}')">
                <td class="sale-entry-item">
                    <div class="sale-entry-name">${esc(item.product.name)}</div>
                    ${priceType ? `<span class="price-badge ${priceType}" title="${esc(priceReason)}">${priceType}</span>` : ""}
                </td>
                <td class="sale-entry-sku">${esc(item.product.sku || "—")}</td>
                <td class="sale-entry-unit">${renderUnitSelect(item)}</td>
                <td class="sale-entry-qty">
                    <button class="qty-btn" onclick="event.stopPropagation(); updateQty('${item.product.id}', -1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="event.stopPropagation(); updateQty('${item.product.id}', 1)">+</button>
                </td>
                <td class="sale-entry-price">${fmtPrice(unitPrice)}</td>
                <td class="sale-entry-total">${fmtPrice(total)}</td>
                <td class="sale-entry-action">
                    <button class="cart-item-remove" onclick="event.stopPropagation(); removeFromCart('${item.product.id}')" title="Remove">✕</button>
                </td>
            </tr>`;
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

    els.subtotal.textContent = fmtPrice(subtotal);
    els.taxAmount.textContent = fmtPrice(tax);
    els.grandTotal.textContent = fmtPrice(grandTotal);
    els.changeAmount.textContent = fmtPrice(Math.max(0, change));

    const empty = cart.length === 0;
    const canSell = canPerformSales();
    const completion = getCompletionValidation();
    const mpesaPending = Boolean(mpesaPendingPayment);
    els.checkoutBtn.disabled = empty || !canSell || !completion.valid || mpesaPending;
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
    const paymentsHtml = renderPaymentHistoryList(payments, { compact: true });

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
        showReceipt(saleId);
        loadProducts();
        loadHeldSales();
        await refreshCustomerOrdersAfterSaleComplete(saleId);
    } catch (err) {
        posLog("[pos] checkout error", err?.message || err);
        toast(`Sale failed: ${err.message}`, "error");
    } finally {
        els.checkoutBtn.disabled = false;
        updateCheckoutButtonLabel();
    }
}

async function checkoutMpesa() {
    const payload = buildPayload();
    const amountPaid = parseFloat(els.amountPaid.value) || 0;
    const phoneNumber = (els.mpesaPhone?.value || "").trim();

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
                showReceipt(statusData.sale_id);
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

    const detailItems = ensureArray(saleDetail?.items || [], "saleDetailItems");
    const itemsHtml = receipt.items.map((item, index) => {
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

    els.receiptContent.innerHTML = `
        <div class="receipt-success">✅</div>
        <div class="receipt-header">
            <h3>Sale Receipt</h3>
            <div class="receipt-id">Sale #${receipt.sale_id}</div>
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
}

function printReceipt() {
    const contentEl = document.getElementById("receipt-content");
    if (!contentEl) {
        window.print();
        return;
    }
    const content = contentEl.innerHTML;
    const win = window.open("", "", "width=360,height=600");
    if (!win) {
        window.print();
        return;
    }
    win.document.write(`
        <html>
            <head>
                <title>Receipt</title>
                <style>
                    body {
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                        font-size: 12px;
                        background: #ffffff;
                        color: #000000;
                        margin: 0;
                        padding: 10px 12px;
                    }
                    .receipt { padding: 0; text-align: left; }
                    .receipt-success { display: none; }
                    .receipt-header h3 { font-size: 16px; margin: 0 0 4px; }
                    .receipt-header .receipt-id,
                    .receipt-header .receipt-date,
                    .receipt-meta,
                    .receipt-subline { font-size: 11px; color: #333; }
                    .receipt-divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
                    .receipt-items { text-align: left; }
                    .receipt-item { display: flex; justify-content: space-between; gap: 8px; padding: 4px 0; font-size: 12px; }
                    .receipt-item-name { color: #000; }
                    .receipt-item-meta { font-size: 11px; color: #555; }
                    .receipt-item-total { font-weight: 700; }
                    .receipt-totals { text-align: left; margin-top: 6px; }
                    .receipt-total-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
                    .receipt-total-row.receipt-grand { font-size: 14px; font-weight: 700; border-top: 1px dashed #999; margin-top: 6px; padding-top: 6px; }
                    .receipt-total-row.receipt-paid { font-weight: 700; }
                    .receipt-payments { margin-top: 8px; }
                    .receipt-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
                </style>
            </head>
            <body>
                ${content}
            </body>
        </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
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
    openOverlay(els.customerOrdersModal);
    customerOrdersLog("[customer-orders] modal opened");
    customerOrdersOffset = 0;
    loadCustomerOrders();
    ensureAssignableUsers();
}

function closeCustomerOrdersModal() {
    if (!els.customerOrdersModal) return;
    closeOverlay(els.customerOrdersModal);
}

async function ensureAssignableUsers() {
    if (assignableUsers.length) return;
    const users = await apiFetch("/accounts/assignable/");
    assignableUsers = Array.isArray(users) ? users : [];
}

function setCustomerOrdersFilter(status) {
    customerOrdersFilter = status || "all";
    customerOrdersOffset = 0;
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
    params.set("limit", CUSTOMER_ORDERS_LIMIT);
    params.set("offset", customerOrdersOffset);

    const endpoint = `/sales/customer-orders/${params.toString() ? `?${params}` : ""}`;
    customerOrdersLog("[customer-orders] fetch", endpoint);
    const data = await apiFetch(endpoint);
    const page = normalizePaginated(data);
    customerOrdersLog("[customer-orders] response", Array.isArray(page.results) ? page.results.length : page);
    if (!data) {
        customerOrdersFailed = true;
        customerOrders = [];
        customerOrdersPage = { count: 0, next: null, previous: null, results: [] };
        els.customerOrdersError.textContent = "Unable to load customer orders. Please try again.";
        els.customerOrdersError.classList.remove("hidden");
    } else {
        customerOrders = page.results;
        customerOrdersPage = page;
    }
    els.customerOrdersLoading.classList.add("hidden");
    updatePager({
        prevEl: els.customerOrdersPrev,
        nextEl: els.customerOrdersNext,
        pageEl: els.customerOrdersPage,
        offset: customerOrdersOffset,
        limit: CUSTOMER_ORDERS_LIMIT,
        pageData: customerOrdersPage,
    });
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
    if (els.creditModal) closeOverlay(els.creditModal);
    if (els.customerOrdersModal) closeOverlay(els.customerOrdersModal);
    if (els.ledgerModal) closeOverlay(els.ledgerModal);
    if (els.returnsModal) closeOverlay(els.returnsModal);
    if (els.receiptModal) closeOverlay(els.receiptModal);
}

function logout() {
    clearAuth();
    toast("Logged out", "info");
    openAuthModal();
}

function canPerformSales() {
    return ["cashier", "salesperson", "supervisor", "admin"].includes(normalizeRole(currentUserRole));
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
}

function normalizeRole(role) {
    return (role || "").toString().trim().toLowerCase();
}

function canImportProducts() {
    return ["supervisor", "admin"].includes(normalizeRole(currentUserRole));
}
