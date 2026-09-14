// routes/financeRoute.js

const express = require("express");
const router = express.Router();
const { uploadExcel } = require("../middlewares/uploadExcel.js");

const {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  markInvoicePaid,
  markInstallmentPaid,
  recordChequePayment,
  getInvoiceCheques,
  discardCheque,
  bounceCheque,
  editPaidInstallment,
  updateInstallment,
  deleteInstallment,
  addInstallment,
  updateInvoice,
  sendInvoiceEmail,
  sendReceivingInvoiceEmail,
  getSalesRoleInvoices,
  addPayment,
  getAllPayments,
  getPaymentById,
  approvePayment,
  rejectPayment,
  updatePayment,
  sendPaymentsReportEmail,
  exportPaymentsExcel,
  exportPaymentsPdf,
  getMyInvoices,
  getPendingPayments,
  getOverduePayments,
  getUpcomingDues,
  addFinanceExtension,
  getRevenueReport,
  getMonthlyCollections,
  getPendingReport,
  searchEnrollments,
  exportReceivingExcel,
  sendReceivingReportEmail,
  voidInstallmentPayment,
  deleteInvoice,
  checkInvoiceNumber,
  generateInvoiceNumber,
  previewBulkInvoice,
  confirmBulkInvoice,
  previewBulkDiscount,
  confirmBulkDiscount,
} = require("../controllers/financeController.js");

// your existing JWT middleware
const { protect } = require("../middlewares/authMiddleware.js");
const { authorize } = require("../middlewares/roleMiddleware.js");
const { uploadReceiptFile } = require("../middlewares/uploadReceipt.js");


router.get("/enrollments/search", protect, authorize("super_admin", "admin", "finance_manager"), searchEnrollments);

// ─── INVOICE ROUTES ───────────────────────────────────────────
router.post("/invoices", protect, authorize("finance_manager", "admin", "super_admin"), createInvoice);
router.get("/invoices", protect, authorize("finance_manager", "admin", "super_admin"), getAllInvoices);
router.get("/invoices/my", protect, getMyInvoices);
router.get("/invoices/pending", protect, authorize("finance_manager", "admin", "super_admin"), getPendingPayments);
router.get("/invoices/overdue", protect, authorize("finance_manager", "admin", "super_admin"), getOverduePayments);
router.get("/invoices/upcoming-dues", protect, authorize("finance_manager", "admin", "super_admin"), getUpcomingDues);
router.get("/invoices/receiving/export-excel", exportReceivingExcel);
router.post(
  "/invoices/receiving/export-email",
  protect,
  authorize("admin", "super_admin", "finance_manager"),
  sendReceivingReportEmail
);

router.get(
  "/invoices/sales",
  protect,
  authorize("sales_manager", "sales_rep"),
  getSalesRoleInvoices
);

router.get("/invoices/check-number", protect, authorize("user", "finance_manager", "admin", "super_admin"), checkInvoiceNumber);
router.get("/invoices/generate-number", protect, authorize("user", "finance_manager", "admin", "super_admin"), generateInvoiceNumber);


router.get("/invoices/:id", protect, authorize("finance_manager", "admin", "super_admin"), getInvoiceById);
router.patch("/invoices/:id", protect, authorize("finance_manager", "admin", "super_admin"), updateInvoice);
router.patch(
  "/invoices/:invoiceId/installments/:installmentId/void",
  protect,
  authorize("admin", "super_admin"),
  voidInstallmentPayment
);
router.delete(
  "/invoices/:id",
  protect,
  authorize("admin", "super_admin"),   // 👈 yahan bhi authorize
  deleteInvoice
);
router.patch("/invoices/:id/mark-paid", protect, authorize("finance_manager", "admin", "super_admin"), markInvoicePaid);
router.patch("/invoices/:invoiceId/installments/:installmentId/mark-paid", protect, authorize("admin", "super_admin", "finance_manager"), uploadReceiptFile, markInstallmentPaid);
router.post("/invoices/:invoiceId/cheques", protect, authorize("admin", "super_admin", "finance_manager"), recordChequePayment);
router.get("/invoices/:invoiceId/cheques", protect, authorize("admin", "super_admin", "finance_manager"), getInvoiceCheques);
router.patch("/invoices/:invoiceId/cheques/:chequeId/discard", protect, authorize("admin", "super_admin", "finance_manager"), discardCheque);
router.patch("/invoices/:invoiceId/cheques/:chequeId/bounce", protect, authorize("admin", "super_admin", "finance_manager"), bounceCheque);
router.patch(
  "/invoices/:invoiceId/installments/:installmentId/correct",
  protect,
  authorize("admin", "super_admin", "finance_manager"),
  editPaidInstallment
);
router.patch(
  "/invoices/:invoiceId/installments/:installmentId",
  protect, authorize("admin", "super_admin", "finance_manager"),
  updateInstallment
);

router.delete(
  "/invoices/:invoiceId/installments/:installmentId",
  protect, authorize("admin", "super_admin", "finance_manager"),
  deleteInstallment
);

router.post(
  "/invoices/:invoiceId/installments",
  protect, authorize("admin", "super_admin", "finance_manager"),
  addInstallment
);

router.post("/invoices/:id/send-invoice", protect, authorize("user", "finance_manager", "admin", "super_admin"), sendInvoiceEmail);
router.post("/invoices/:id/send-receiving-invoice", protect, authorize("user", "finance_manager", "admin", "super_admin"), sendReceivingInvoiceEmail);

// ─── PAYMENT ROUTES ───────────────────────────────────────────
router.post("/payments", protect, authorize("finance_manager", "admin", "super_admin"), addPayment);
router.get("/payments", protect, authorize("finance_manager", "admin", "super_admin"), getAllPayments);
router.get("/payments/:id", protect, authorize("finance_manager", "admin", "super_admin"), getPaymentById);
router.patch("/payments/:id", protect, authorize("finance_manager", "admin", "super_admin"), updatePayment);
router.patch("/payments/:id/approve", protect, authorize("finance_manager", "admin", "super_admin"), approvePayment);
router.patch("/payments/:id/reject", protect, authorize("finance_manager", "admin", "super_admin"), rejectPayment);

// Trigger email to admins (requires login — only admins should be able to send)
router.post(
  "/payments/report/export-email",
  protect,          // apka existing auth middleware
  authorize("admin", "super_admin", "finance_manager"), // agar role-check middleware hai
  sendPaymentsReportEmail
);

// Public-ish download links, protected by the signed token in the query string
router.get("/payments/report/export-excel", exportPaymentsExcel);
router.get("/payments/report/export-pdf", exportPaymentsPdf);

// ─── FINANCE EXTENSION ────────────────────────────────────────
router.post("/extension", protect, authorize("finance_manager", "admin", "super_admin"), addFinanceExtension);

// ─── REPORTS (Finance Manager + Admin) ───────────────────────
router.get("/reports/revenue", protect, authorize("finance_manager", "admin", "super_admin"), getRevenueReport);
router.get("/reports/monthly", protect, authorize("finance_manager", "admin", "super_admin"), getMonthlyCollections);
router.get("/reports/pending", protect, authorize("finance_manager", "admin", "super_admin"), getPendingReport);

router.post(
  "/invoices/bulk-import/preview",
  protect,
  authorize("admin", "super_admin", "finance_manager"),
  uploadExcel.single("file"),
  previewBulkInvoice
);

router.post(
  "/invoices/bulk-import/confirm",
  protect,
  authorize("admin", "super_admin", "finance_manager"),
  confirmBulkInvoice
);

router.post("/invoices/bulk-discount/preview", protect, authorize("finance_manager", "admin", "super_admin"), uploadExcel.single("file"), previewBulkDiscount);
router.post("/invoices/bulk-discount/confirm", protect, authorize("finance_manager", "admin", "super_admin"), confirmBulkDiscount);

module.exports = router;


// const express = require("express");
// const router = express.Router();

// const {
//   addFinanceExtension,
// } = require("../controllers/financeController.js");

// const { protect, authorize } = require("../middlewares/authMiddleware.js");

// // Finance Extension (only finance/admin/super_admin)
// router.post(
//   "/extension",
//   protect,
//   authorize("finance_manager", "admin", "super_admin"),
//   addFinanceExtension
// );

// module.exports = router;