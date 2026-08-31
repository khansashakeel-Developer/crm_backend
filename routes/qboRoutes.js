/**
 * routes/qboRoutes.js
 * Phase 1 — OAuth + status + manual retry
 */

const express = require("express");
const router = express.Router();
const qbo = require("../services/qboService");
const Invoice = require("../models/invoiceModel");
const Payment = require("../models/paymentModel");
const User = require("../models/userModel");
const { protect } = require("../middlewares/authMiddleware.js");
const { authorize } = require("../middlewares/roleMiddleware.js");

router.get(
  "/connect",
  protect,
  authorize("super_admin", "admin", "finance_manager"),
  (req, res) => {
    try {
      const uri = qbo.getAuthorizationUri();
      res.json({ success: true, authorizationUri: uri });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get("/bank-accounts", protect, authorize("super_admin", "admin", "finance_manager"), async (req, res) => {
  try {
    const qboService = require("../services/qboService");
    const data = await qboService.qboRequest(
      "GET",
      "/query?query=SELECT * FROM Account WHERE AccountType IN ('Bank','Other Current Asset')&minorversion=65"
    );
    res.json({ success: true, data: data.QueryResponse?.Account || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/callback", async (req, res) => {
  try {
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const result = await qbo.handleOAuthCallback(fullUrl);

    res.send(`
      <html>
        <body style="font-family:sans-serif;padding:40px">
          <h2>✅ QuickBooks Connected Successfully</h2>
          <p><strong>Realm ID:</strong> ${result.realmId}</p>
          <p>Copy these into your <code>.env</code> and restart the server:</p>
          <pre style="background:#f4f4f4;padding:16px;border-radius:8px">
QBO_REALM_ID=${result.realmId}
QBO_ACCESS_TOKEN=${result.access_token}
QBO_REFRESH_TOKEN=${result.refresh_token}
QBO_TOKEN_EXPIRES_AT=${new Date(Date.now() + result.expires_in * 1000).toISOString()}
          </pre>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("QBO OAuth callback error:", err);
    res.status(500).send(`<h2>QBO Connection Failed</h2><pre>${err.message}</pre>`);
  }
});

router.get("/status", protect, authorize("super_admin", "admin", "finance_manager"), async (req, res) => {
  res.json({ success: true, data: await qbo.getTokenStatus() });
});

router.post(
  "/sync/invoice/:id",
  protect,
  authorize("super_admin", "admin", "finance_manager"),
  async (req, res) => {
    try {
      const invoice = await Invoice.findById(req.params.id);
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

      const user = await User.findById(invoice.user);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      const qboInvoice = await qbo.syncInvoice(invoice, user);
      res.json({
        success: true,
        message: "Invoice synced",
        data: {
          qboInvoiceId: qboInvoice.Id,
          docNumber: qboInvoice.DocNumber,
          balance: qboInvoice.Balance,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post(
  "/test/sync/invoice/:id",
  protect,
  authorize("super_admin", "admin", "finance_manager"),
  async (req, res) => {
    try {
      const invoice = await Invoice.findById(req.params.id);
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

      const user = await User.findById(invoice.user);
      if (!user) return res.status(404).json({ success: false, message: "User not found" });

      console.log("\n========== QBO DRY RUN TEST START ==========");
      console.log("Invoice:", invoice.invoiceNumber, "| Total:", invoice.totalAmount, "| Discount:", invoice.discountAmount);
      console.log("User:", user.name, "|", user.email, "| existing qboCustomerId:", user.qboCustomerId || "none");

      const qbo = require("../services/qboService");
      const result = await qbo.syncInvoice(invoice, user, { dryRun: true });

      console.log("========== QBO DRY RUN TEST END ==========\n");

      res.json({
        success: true,
        message: "Dry run complete — check server console for full payload. Nothing was saved to QBO or MongoDB.",
        data: result,
      });
    } catch (err) {
      console.error("[QBO DRY RUN] Error:", err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post(
  "/sync/payment/:id",
  protect,
  authorize("super_admin", "admin", "finance_manager"),
  async (req, res) => {
    try {
      const payment = await Payment.findById(req.params.id);
      if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

      const invoice = await Invoice.findById(payment.invoice);
      const user = await User.findById(payment.user);

      if (!invoice || !user) {
        return res.status(404).json({ success: false, message: "Invoice or User not found" });
      }

      const qboPayment = await qbo.syncPayment(payment, invoice, user);
      res.json({
        success: true,
        message: "Payment synced",
        data: { qboPaymentId: qboPayment.Id },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.get("/accounts", protect, authorize("super_admin", "admin", "finance_manager"), async (req, res) => {
  try {
    const data = await qbo.qboRequest("GET", "/query?query=SELECT * FROM Account WHERE AccountType='Income'&minorversion=65");
    res.json({ success: true, data: data.QueryResponse?.Account || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;