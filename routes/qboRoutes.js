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
const Enrollment = require("../models/enrollmentModel");
const { protect } = require("../middlewares/authMiddleware.js");
const { authorize } = require("../middlewares/roleMiddleware.js");

const ROLES = ["super_admin", "admin", "finance_manager"];

// helper — simple paginated QBO query
async function runQuery(entity, { limit = 100, offset = 0, where = "" } = {}) {
  const q = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""} STARTPOSITION ${Number(offset) + 1} MAXRESULTS ${Number(limit)}`;
  const data = await qbo.qboRequest("GET", `/query?query=${encodeURIComponent(q)}&minorversion=65`);
  return data.QueryResponse?.[entity] || [];
}

// GET /api/qbo-data/customers
router.get("/customers", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { limit, offset, search } = req.query;
    const where = search
      ? `DisplayName LIKE '%${String(search).replace(/'/g, "\\'")}%'`
      : "";
    const customers = await runQuery("Customer", { limit, offset, where });

    res.json({
      success: true,
      count: customers.length,
      data: customers.map((c) => ({
        qboId: c.Id,
        displayName: c.DisplayName,
        email: c.PrimaryEmailAddr?.Address || null,
        phone: c.PrimaryPhone?.FreeFormNumber || null,
        balance: c.Balance ?? 0,
        active: c.Active,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo-data/invoices
router.get("/invoices", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { limit, offset, customerId, docNumber } = req.query;
    const filters = [];
    if (customerId) filters.push(`CustomerRef = '${customerId}'`);
    if (docNumber) filters.push(`DocNumber = '${String(docNumber).replace(/'/g, "\\'")}'`);
    const invoices = await runQuery("Invoice", { limit, offset, where: filters.join(" AND ") });

    res.json({
      success: true,
      count: invoices.length,
      data: invoices.map((inv) => ({
        qboId: inv.Id,
        docNumber: inv.DocNumber,
        customer: inv.CustomerRef?.name || null,
        customerId: inv.CustomerRef?.value || null,
        totalAmt: inv.TotalAmt,
        balance: inv.Balance,
        txnDate: inv.TxnDate,
        dueDate: inv.DueDate,
        privateNote: inv.PrivateNote || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo-data/payments
router.get("/payments", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { limit, offset, customerId } = req.query;
    const where = customerId ? `CustomerRef = '${customerId}'` : "";
    const payments = await runQuery("Payment", { limit, offset, where });

    res.json({
      success: true,
      count: payments.length,
      data: payments.map((p) => ({
        qboId: p.Id,
        customer: p.CustomerRef?.name || null,
        customerId: p.CustomerRef?.value || null,
        totalAmt: p.TotalAmt,
        txnDate: p.TxnDate,
        refNumber: p.PaymentRefNum || null,
        linkedInvoiceId: p.Line?.[0]?.LinkedTxn?.[0]?.TxnId || null,
        privateNote: p.PrivateNote || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// fetch ALL rows of a QBO entity (paginated loop, QBO caps MAXRESULTS ~1000)
async function fetchAllQbo(entity, where = "") {
  const all = [];
  let start = 1;
  const pageSize = 200;
  while (true) {
    const q = `SELECT * FROM ${entity}${where ? ` WHERE ${where}` : ""} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    const data = await qbo.qboRequest("GET", `/query?query=${encodeURIComponent(q)}&minorversion=65`);
    const page = data.QueryResponse?.[entity] || [];
    all.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }
  return all;
}

// GET /api/qbo/import/enrollments/:userId  — flat enrollment list for one user
router.get("/enrollments/:userId", protect, authorize(...ROLES), async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ user: req.params.userId })
      .populate("program", "name short_description")
      .select("program status accessStatus")
      .lean();
 
    res.json({
      success: true,
      data: enrollments.map((e) => ({
        _id: e._id,
        program: e.program ? { _id: e.program._id, name: e.program.name, short_description: e.program.short_description } : null,
        status: e.status,
        accessStatus: e.accessStatus,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo/import/list?search=  — "Only in QBO" invoices, for the picker (Step 1)
router.get("/list", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { search = "" } = req.query;
    const re = search ? new RegExp(search.trim(), "i") : null;

    const [crmInvoices, qboInvoices] = await Promise.all([
      Invoice.find({}).select("invoiceNumber qboInvoiceId").lean(),
      fetchAllQbo("Invoice"),
    ]);

    const crmMatchedIds = new Set(
      crmInvoices.map((i) => i.qboInvoiceId).filter(Boolean)
    );
    const crmDocNumbers = new Set(crmInvoices.map((i) => String(i.invoiceNumber)));

    const onlyInQbo = qboInvoices.filter((q) => {
      if (crmMatchedIds.has(q.Id)) return false;
      if (crmDocNumbers.has(String(q.DocNumber))) return false; // number-matched fallback already covers it
      return true;
    });

    const filtered = re
      ? onlyInQbo.filter((q) => re.test(q.DocNumber || "") || re.test(q.CustomerRef?.name || ""))
      : onlyInQbo;

    res.json({
      success: true,
      total: filtered.length,
      data: filtered.slice(0, 50).map((q) => ({
        qboInvoiceId: q.Id,
        docNumber: q.DocNumber,
        customer: q.CustomerRef?.name || null,
        qboCustomerId: q.CustomerRef?.value || null,
        totalAmt: q.TotalAmt,
        balance: q.Balance,
        txnDate: q.TxnDate,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo/import/detail/:qboInvoiceId  — full invoice + its payments (Step 2)
router.get("/detail/:qboInvoiceId", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { qboInvoiceId } = req.params;

    const invData = await qbo.qboRequest("GET", `/invoice/${qboInvoiceId}`);
    const qboInvoice = invData.Invoice;
    if (!qboInvoice) return res.status(404).json({ success: false, message: "QBO invoice not found" });

    // find QBO payments linked to this invoice
    const customerId = qboInvoice.CustomerRef?.value;
    const qboPayments = customerId ? await fetchAllQbo("Payment", `CustomerRef = '${customerId}'`) : [];
    const linkedPayments = qboPayments.filter((p) =>
      (p.Line || []).some((l) => (l.LinkedTxn || []).some((lt) => lt.TxnId === qboInvoiceId))
    );

    // try to auto-suggest a CRM user via email/name match on the QBO customer
    let suggestedUser = null;
    let suggestedEnrollments = []; // enrollments whose program name matches an invoice line description

    if (customerId) {
      const custData = await qbo.qboRequest("GET", `/customer/${customerId}`);
      const email = custData.Customer?.PrimaryEmailAddr?.Address;
      if (email) {
        const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") }).select("name email").lean();
        if (user) {
          suggestedUser = { id: user._id, name: user.name, email: user.email };


          const enrollments = await Enrollment.find({ user: user._id })
            .populate("program", "name short_description")
            .select("program status accessStatus")
            .lean();

          const lineDescriptions = (qboInvoice.Line || [])
            .filter((l) => l.DetailType === "SalesItemLineDetail")
            .map((l) => l.Description || "");

          // tokenize into significant words (alphanumeric, length > 3 — skips "of","the","nlp" etc
          // short abbreviations too, which is fine since we rely on the longer descriptive words)
          function tokenize(s) {
            return (s || "").toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 3) || [];
          }

          const lineTokens = new Set(lineDescriptions.flatMap(tokenize));

          suggestedEnrollments = enrollments
            .filter((e) => {
              const programTokens = [
                ...tokenize(e.program?.name),
                ...tokenize(e.program?.short_description),
              ];
              if (!programTokens.length) return false;
              // match if at least one significant word overlaps between the QBO line
              // description and the program's name/short_description
              return programTokens.some((t) => lineTokens.has(t));
            })
            .map((e) => ({ id: e._id, programId: e.program?._id, programName: e.program?.name }));
        }
      }
    }

    res.json({
      success: true,
      data: {
        invoice: {
          qboInvoiceId: qboInvoice.Id,
          docNumber: qboInvoice.DocNumber,
          customer: qboInvoice.CustomerRef?.name || null,
          qboCustomerId: customerId,
          totalAmt: qboInvoice.TotalAmt,
          balance: qboInvoice.Balance,
          txnDate: qboInvoice.TxnDate,
          dueDate: qboInvoice.DueDate,
          lines: (qboInvoice.Line || [])
            .filter((l) => l.DetailType === "SalesItemLineDetail" || l.DetailType === "DiscountLineDetail")
            .map((l) => ({ description: l.Description, amount: l.Amount, type: l.DetailType })),
        },
        payments: linkedPayments.map((p) => ({
          qboPaymentId: p.Id,
          amount: p.TotalAmt,
          txnDate: p.TxnDate,
          refNumber: p.PaymentRefNum || null,
        })),
        suggestedUser,
        suggestedEnrollments,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo/import/invoice  { qboInvoiceId, userId, enrollmentId? }
// Creates the CRM invoice (+ its payments) from QBO data and links them — one action.
router.post("/invoice", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { qboInvoiceId, userId, enrollmentIds } = req.body;
    if (!qboInvoiceId || !userId) {
      return res.status(400).json({ success: false, message: "qboInvoiceId and userId are required" });
    }
    const ids = (Array.isArray(enrollmentIds) ? enrollmentIds : enrollmentIds ? [enrollmentIds] : []).filter(Boolean);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "CRM user not found" });

    const already = await Invoice.findOne({ qboInvoiceId });
    if (already) {
      return res.status(400).json({ success: false, message: `Already imported as CRM invoice #${already.invoiceNumber}` });
    }

    const invData = await qbo.qboRequest("GET", `/invoice/${qboInvoiceId}`);
    const qboInvoice = invData.Invoice;
    if (!qboInvoice) return res.status(404).json({ success: false, message: "QBO invoice not found" });

    const numberTaken = await Invoice.findOne({ invoiceNumber: qboInvoice.DocNumber });
    if (numberTaken) {
      return res.status(400).json({
        success: false,
        message: `Invoice number ${qboInvoice.DocNumber} already exists in CRM — link it manually instead of importing`,
      });
    }

    const grossLines = (qboInvoice.Line || []).filter((l) => l.DetailType === "SalesItemLineDetail");
    const discountLines = (qboInvoice.Line || []).filter((l) => l.DetailType === "DiscountLineDetail");
    const totalAmount = grossLines.reduce((s, l) => s + Number(l.Amount || 0), 0);
    const discountAmount = discountLines.reduce((s, l) => s + Number(l.Amount || 0), 0);
    const netAmount = Math.max(0, totalAmount - discountAmount);

    const isBundle = ids.length > 1;
    let invoiceDoc = {
      invoiceNumber: qboInvoice.DocNumber,
      user: userId,
      totalAmount,
      discountAmount,
      remainingAmount: netAmount,
      paidAmount: 0,
      status: "PENDING",
      issueDate: qboInvoice.TxnDate ? new Date(qboInvoice.TxnDate) : new Date(),
      dueDate: qboInvoice.DueDate ? new Date(qboInvoice.DueDate) : undefined,
      qboInvoiceId: qboInvoice.Id,
      qboSyncStatus: "synced",
      qboLastSyncedAt: new Date(),
    };

    if (isBundle) {
      // fetch enrollments + their program names, to best-effort match each
      // QBO line to the right enrollment/program by description
      const enrollments = await Enrollment.find({ _id: { $in: ids } }).populate("program", "name").lean();
      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      const items = grossLines.map((l) => {
        const desc = (l.Description || "").toLowerCase();
        const match = enrollments.find((e) => {
          const pName = norm(e.program?.name);
          return pName && norm(desc).includes(pName);
        });
        return {
          program: match?.program?._id || undefined,
          programName: match?.program?.name || l.Description || "Program Fee",
          enrollment: match?._id || undefined,
          amount: Number(l.Amount || 0),
          discountAmount: 0,
          feeType: /cpd|certificate/i.test(l.Description || "") ? "certificate"
            : /manual/i.test(l.Description || "") ? "manual"
              : "program",
        };
      });

      invoiceDoc = {
        ...invoiceDoc,
        isBundle: true,
        enrollment: ids[0],
        enrollments: ids,
        items,
      };
    } else if (ids.length === 1) {
      invoiceDoc.enrollment = ids[0];
    }

    const invoice = await Invoice.create(invoiceDoc);

    if (isBundle) {
      await Enrollment.updateMany({ _id: { $in: ids } }, { invoice: invoice._id });
    }

    // ── Import + link any QBO payments tied to this invoice ──
    const custId = qboInvoice.CustomerRef?.value;
    const qboPayments = custId ? await fetchAllQbo("Payment", `CustomerRef = '${custId}'`) : [];
    const linkedPayments = qboPayments.filter((p) =>
      (p.Line || []).some((l) => (l.LinkedTxn || []).some((lt) => lt.TxnId === qboInvoiceId))
    );

    const importedPayments = [];
    let totalPaid = 0;
    for (const qp of linkedPayments) {
      const amount = Number(qp.TotalAmt || 0);
      const payment = await Payment.create({
        invoice: invoice._id,
        enrollment: ids[0] || undefined,
        user: userId,
        amount,
        method: "manual",
        status: "approved",
        approvedBy: req.user._id,
        approvedAt: new Date(),
        receivedBy: req.user._id,
        paidAt: qp.TxnDate ? new Date(qp.TxnDate) : new Date(),
        referenceNumber: qp.PaymentRefNum || null,
        notes: "Imported from QuickBooks",
        qboPaymentId: qp.Id,
        qboSyncStatus: "synced",
        qboLastSyncedAt: new Date(),
      });
      importedPayments.push(payment);
      totalPaid += amount;
    }

    invoice.paidAmount = totalPaid;
    invoice.remainingAmount = Math.max(0, netAmount - totalPaid);
    invoice.status = invoice.remainingAmount === 0 && totalPaid > 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
    await invoice.save();

    if (!user.qboCustomerId && custId) {
      user.qboCustomerId = custId;
      user.qboSyncStatus = "synced";
      user.qboLastSyncedAt = new Date();
      await user.save({ validateBeforeSave: false });
    }

    res.status(201).json({
      success: true,
      message: `Imported invoice #${invoice.invoiceNumber}${isBundle ? " (bundle)" : ""} with ${importedPayments.length} payment(s), all linked to QBO`,
      data: { invoice, paymentsImported: importedPayments.length },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo-compare/invoices
router.get("/compare/invoices", protect, authorize(...ROLES), async (req, res) => {
  try {
    const [crmInvoices, qboInvoices] = await Promise.all([
      Invoice.find({}).populate("user", "name email").lean(),
      fetchAllQbo("Invoice"),
    ]);

    const qboById = new Map(qboInvoices.map((q) => [q.Id, q]));
    const qboByDocNumber = new Map(qboInvoices.map((q) => [String(q.DocNumber), q]));
    const qboIdsMatched = new Set();

    const rows = crmInvoices.map((inv) => {
      // ✅ FIX: previously matched purely by DocNumber, which ignored qboInvoiceId
      // entirely — so an invoice that had been explicitly unlinked (qboInvoiceId
      // cleared) still showed as "Matched" because the same DocNumber still exists
      // in QBO. Now: if the CRM invoice is actually linked (qboInvoiceId set), match
      // by that ID — same behavior as payments/customers, and it correctly goes to
      // "Only in CRM" once unlinked. DocNumber is only used as a fallback to surface
      // potential matches for invoices that were never linked in the first place.
      const q = inv.qboInvoiceId
        ? qboById.get(inv.qboInvoiceId)
        : qboByDocNumber.get(String(inv.invoiceNumber));
      if (q) qboIdsMatched.add(q.Id);

      return {
        invoiceNumber: inv.invoiceNumber,
        customer: inv.user?.name || null,
        crm: {
          exists: true,
          crmId: inv._id,
          totalAmount: inv.totalAmount,
          discountAmount: inv.discountAmount,
          netAmount: inv.totalAmount - inv.discountAmount,
          status: inv.status,
          qboSyncStatus: inv.qboSyncStatus || "not_synced",
          qboSyncError: inv.qboSyncError || null,
        },
        qbo: q
          ? { exists: true, qboId: q.Id, totalAmt: q.TotalAmt, balance: q.Balance, txnDate: q.TxnDate }
          : { exists: false },
        match: q ? "matched" : "only_crm",
      };
    });

    // QBO invoices with no CRM counterpart (manually created / orphaned)
    for (const q of qboInvoices) {
      if (qboIdsMatched.has(q.Id)) continue;
      rows.push({
        invoiceNumber: q.DocNumber,
        customer: q.CustomerRef?.name || null,
        crm: { exists: false },
        qbo: { exists: true, qboId: q.Id, totalAmt: q.TotalAmt, balance: q.Balance, txnDate: q.TxnDate },
        match: "only_qbo",
      });
    }

    res.json({
      success: true,
      summary: {
        matched: rows.filter((r) => r.match === "matched").length,
        onlyCrm: rows.filter((r) => r.match === "only_crm").length,
        onlyQbo: rows.filter((r) => r.match === "only_qbo").length,
      },
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo-compare/payments
router.get("/compare/payments", protect, authorize(...ROLES), async (req, res) => {
  try {
    const [crmPayments, qboPayments] = await Promise.all([
      Payment.find({}).populate("user", "name email").populate("invoice", "invoiceNumber").lean(),
      fetchAllQbo("Payment"),
    ]);

    const qboById = new Map(qboPayments.map((p) => [p.Id, p]));
    const qboIdsMatched = new Set();

    const rows = crmPayments.map((p) => {
      const q = p.qboPaymentId ? qboById.get(p.qboPaymentId) : null;
      if (q) qboIdsMatched.add(q.Id);

      return {
        invoiceNumber: p.invoice?.invoiceNumber || null,
        customer: p.user?.name || null,
        crm: {
          exists: true,
          crmId: p._id,
          amount: p.amount,
          status: p.status,
          qboSyncStatus: p.qboSyncStatus || "not_synced",
          qboSyncError: p.qboSyncError || null,
        },
        qbo: q
          ? { exists: true, qboId: q.Id, totalAmt: q.TotalAmt, txnDate: q.TxnDate }
          : { exists: false },
        match: q ? "matched" : "only_crm",
      };
    });

    for (const q of qboPayments) {
      if (qboIdsMatched.has(q.Id)) continue;
      rows.push({
        invoiceNumber: q.Line?.[0]?.LinkedTxn?.[0]?.TxnId || null,
        customer: q.CustomerRef?.name || null,
        crm: { exists: false },
        qbo: { exists: true, qboId: q.Id, totalAmt: q.TotalAmt, txnDate: q.TxnDate },
        match: "only_qbo",
      });
    }

    res.json({
      success: true,
      summary: {
        matched: rows.filter((r) => r.match === "matched").length,
        onlyCrm: rows.filter((r) => r.match === "only_crm").length,
        onlyQbo: rows.filter((r) => r.match === "only_qbo").length,
      },
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/qbo-compare/customers
router.get("/compare/customers", protect, authorize(...ROLES), async (req, res) => {
  try {
    const [crmUsers, qboCustomers] = await Promise.all([
      // ✅ FIX: previously only fetched users that ALREADY had qboCustomerId set —
      // a customer who exists in CRM but was never synced to QBO could never show
      // up in this list, so "Only in CRM" was always empty. Now fetching all
      // CRM customers (role: "user"), synced or not.
      User.find({ role: "user" }).select("name email qboCustomerId qboSyncStatus qboSyncError").lean(),
      fetchAllQbo("Customer"),
    ]);

    console.log(`CRM users with qboCustomerId: ${crmUsers.length}, QBO customers: ${qboCustomers.length}`);
    console.log(`CRM users sample:`, crmUsers);

    const qboById = new Map(qboCustomers.map((c) => [c.Id, c]));
    const qboIdsMatched = new Set();

    const rows = crmUsers.map((u) => {
      const q = u.qboCustomerId ? qboById.get(u.qboCustomerId) : null;
      if (q) qboIdsMatched.add(q.Id);
      return {
        name: u.name,
        email: u.email,
        crm: {
          exists: true,
          crmId: u._id,
          qboSyncStatus: u.qboSyncStatus || "not_synced",
          qboSyncError: u.qboSyncError || null,
        },
        qbo: q ? { exists: true, qboId: q.Id, balance: q.Balance, active: q.Active } : { exists: false },
        match: q ? "matched" : "only_crm",
      };
    });

    for (const q of qboCustomers) {
      if (qboIdsMatched.has(q.Id)) continue;
      rows.push({
        name: q.DisplayName,
        email: q.PrimaryEmailAddr?.Address || null,
        crm: { exists: false },
        qbo: { exists: true, qboId: q.Id, balance: q.Balance, active: q.Active },
        match: "only_qbo",
      });
    }

    res.json({
      success: true,
      summary: {
        matched: rows.filter((r) => r.match === "matched").length,
        onlyCrm: rows.filter((r) => r.match === "only_crm").length,
        onlyQbo: rows.filter((r) => r.match === "only_qbo").length,
      },
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// GET /api/qbo-monitor/health
router.get("/monitor/health", protect, authorize(...ROLES), async (req, res) => {
  try {
    const [tokenStatus, invoiceCounts, paymentCounts, customerCounts] = await Promise.all([
      qbo.getTokenStatus(),
      Invoice.aggregate([{ $group: { _id: "$qboSyncStatus", count: { $sum: 1 } } }]),
      Payment.aggregate([{ $group: { _id: "$qboSyncStatus", count: { $sum: 1 } } }]),
      User.aggregate([{ $group: { _id: "$qboSyncStatus", count: { $sum: 1 } } }]),
    ]);

    const toObj = (rows) =>
      rows.reduce((acc, r) => ({ ...acc, [r._id || "not_synced"]: r.count }), {
        synced: 0, failed: 0, not_synced: 0,
      });

    const recentFailedInvoices = await Invoice.find({ qboSyncStatus: "failed" })
      .select("invoiceNumber qboSyncError updatedAt")
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    const recentFailedPayments = await Payment.find({ qboSyncStatus: "failed" })
      .select("amount qboSyncError updatedAt")
      .populate("invoice", "invoiceNumber")
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean();

    // token expiring within 7 days → warning
    const expiresAt = tokenStatus.expiresAt ? new Date(tokenStatus.expiresAt) : null;
    const daysToExpiry = expiresAt ? Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    res.json({
      success: true,
      data: {
        token: {
          ...tokenStatus,
          daysToExpiry,
          warning: tokenStatus.isExpired
            ? "Token expired — reconnect required"
            : daysToExpiry !== null && daysToExpiry <= 7
              ? `Token expires in ${daysToExpiry} day(s)`
              : null,
        },
        invoices: toObj(invoiceCounts),
        payments: toObj(paymentCounts),
        customers: toObj(customerCounts),
        recentFailures: {
          invoices: recentFailedInvoices,
          payments: recentFailedPayments,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-monitor/retry-failed
// body: { type: "invoices" | "payments" | "both" }
router.post("/monitor/retry-failed", protect, authorize(...ROLES), async (req, res) => {
  const { type = "both" } = req.body;
  const results = { invoices: [], payments: [] };

  try {
    if (type === "invoices" || type === "both") {
      const failedInvoices = await Invoice.find({ qboSyncStatus: "failed" });
      for (const invoice of failedInvoices) {
        try {
          const user = await User.findById(invoice.user);
          if (!user) throw new Error("User not found");
          await qbo.syncInvoice(invoice, user);
          results.invoices.push({ id: invoice._id, invoiceNumber: invoice.invoiceNumber, status: "success" });
        } catch (err) {
          results.invoices.push({ id: invoice._id, invoiceNumber: invoice.invoiceNumber, status: "failed", error: err.message });
        }
      }
    }

    if (type === "payments" || type === "both") {
      const failedPayments = await Payment.find({ qboSyncStatus: "failed" });
      for (const payment of failedPayments) {
        try {
          const invoice = await Invoice.findById(payment.invoice);
          const user = await User.findById(payment.user);
          if (!invoice || !user) throw new Error("Invoice or user not found");
          await qbo.syncPayment(payment, invoice, user);
          results.payments.push({ id: payment._id, status: "success" });
        } catch (err) {
          results.payments.push({ id: payment._id, status: "failed", error: err.message });
        }
      }
    }

    const summary = {
      invoicesRetried: results.invoices.length,
      invoicesSucceeded: results.invoices.filter((r) => r.status === "success").length,
      paymentsRetried: results.payments.length,
      paymentsSucceeded: results.payments.filter((r) => r.status === "success").length,
    };

    res.json({ success: true, summary, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-monitor/retry-failed/:type/:id  — retry a single record
router.post("/monitor/retry-failed/:type/:id", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "invoice") {
      const invoice = await Invoice.findById(id);
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });
      const user = await User.findById(invoice.user);
      const result = await qbo.syncInvoice(invoice, user);
      return res.json({ success: true, data: result });
    }

    if (type === "payment") {
      const payment = await Payment.findById(id);
      if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
      const invoice = await Invoice.findById(payment.invoice);
      const user = await User.findById(payment.user);
      const result = await qbo.syncPayment(payment, invoice, user);
      return res.json({ success: true, data: result });
    }

    res.status(400).json({ success: false, message: "type must be 'invoice' or 'payment'" });
  } catch (err) {
    console.error("QBO RETRY FAILED:", {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status,
      stack: err.stack,
    });

    return res.status(500).json({
      success: false,
      message: err.message,
      qboError: err.response?.data || null,
    });
  }
});

// GET /api/qbo-manual/unlinked/:type?search=   — CRM records with no *currently valid* QBO link, for the "pick one to link" dropdown
router.get("/unlinked/:type", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { type } = req.params;
    const { search = "" } = req.query;
    const re = search ? new RegExp(search.trim(), "i") : null;
    // how many rows to return — the modal starts at 20 and asks for more via "Load More"
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);

    if (type === "customer") {
      // ✅ FIX: previously "unlinked" meant qboCustomerId is null/missing — but a
      // customer whose qboCustomerId points at a QBO record that no longer exists
      // (deleted, merged, stale from an earlier bug, etc.) showed as "Only in CRM"
      // in /compare/customers yet never appeared here to be (re-)linked, because
      // its qboCustomerId field technically wasn't null. Now checked against the
      // live QBO customer list, same definition /compare/customers uses.
      const qboCustomers = await fetchAllQbo("Customer");
      const validQboIds = new Set(qboCustomers.map((c) => c.Id));

      const nameFilter = re ? { $or: [{ name: re }, { email: re }] } : {};
      const candidates = await User.find({ role: "user", ...nameFilter })
        .select("name email qboCustomerId")
        .lean();

      const unlinked = candidates.filter((u) => !u.qboCustomerId || !validQboIds.has(u.qboCustomerId));
      return res.json({
        success: true,
        total: unlinked.length,
        data: unlinked.slice(0, limit).map((u) => ({ id: u._id, label: `${u.name} — ${u.email || ""}` })),
      });
    }

    if (type === "invoice") {
      // ✅ FIX: same stale-ID issue as customers, now checked against live QBO invoices.
      const qboInvoices = await fetchAllQbo("Invoice");
      const validQboIds = new Set(qboInvoices.map((q) => q.Id));

      const filter = {};
      if (re) {
        // search matches invoiceNumber OR the linked customer's name/email
        const matchedUsers = await User.find({ $or: [{ name: re }, { email: re }] }).select("_id").lean();
        filter.$or = [
          { invoiceNumber: re },
          { user: { $in: matchedUsers.map((u) => u._id) } },
        ];
      }
      const candidates = await Invoice.find(filter)
        .populate("user", "name")
        .select("invoiceNumber user totalAmount qboInvoiceId")
        .sort({ createdAt: -1 })
        .lean();

      const unlinked = candidates.filter((i) => !i.qboInvoiceId || !validQboIds.has(i.qboInvoiceId));
      return res.json({
        success: true,
        total: unlinked.length,
        data: unlinked.slice(0, limit).map((i) => ({ id: i._id, label: `#${i.invoiceNumber} — ${i.user?.name || "—"} — Rs ${i.totalAmount || 0}` })),
      });
    }

    if (type === "payment") {
      // ✅ FIX: same stale-ID issue as customers, now checked against live QBO payments.
      const qboPayments = await fetchAllQbo("Payment");
      const validQboIds = new Set(qboPayments.map((q) => q.Id));

      const candidates = await Payment.find({})
        .populate("user", "name")
        .populate("invoice", "invoiceNumber")
        .select("amount user invoice qboPaymentId")
        .lean();

      const filtered = re
        ? candidates.filter((p) => re.test(p.user?.name || "") || re.test(p.invoice?.invoiceNumber || ""))
        : candidates;

      const unlinked = filtered.filter((p) => !p.qboPaymentId || !validQboIds.has(p.qboPaymentId));
      return res.json({
        success: true,
        total: unlinked.length,
        data: unlinked.slice(0, limit).map((p) => ({
          id: p._id,
          label: `Rs ${p.amount || 0} — ${p.user?.name || "—"} — Inv #${p.invoice?.invoiceNumber || "—"}`,
        })),
      });
    }

    res.status(400).json({ success: false, message: "type must be invoice | payment | customer" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-manual/link/customer/:userId  { qboCustomerId }
router.post("/link/customer/:userId", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { qboCustomerId } = req.body;
    if (!qboCustomerId) return res.status(400).json({ success: false, message: "qboCustomerId is required" });

    const data = await qbo.qboRequest("GET", `/customer/${qboCustomerId}`);
    if (!data.Customer) return res.status(404).json({ success: false, message: "QBO customer not found" });
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { qboCustomerId, qboSyncStatus: "synced", qboSyncError: null, qboLastSyncedAt: new Date() },
      { new: true, runValidators: false }
    );
    if (!user) return res.status(404).json({ success: false, message: "CRM user not found" });

    res.json({ success: true, message: "Linked", data: { user: user._id, qboCustomerId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-manual/link/invoice/:invoiceId  { qboInvoiceId }
router.post("/link/invoice/:invoiceId", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { qboInvoiceId } = req.body;
    if (!qboInvoiceId) return res.status(400).json({ success: false, message: "qboInvoiceId is required" });

    const data = await qbo.qboRequest("GET", `/invoice/${qboInvoiceId}`);
    if (!data.Invoice) return res.status(404).json({ success: false, message: "QBO invoice not found" });

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.invoiceId,
      { qboInvoiceId, qboSyncStatus: "synced", qboSyncError: null, qboLastSyncedAt: new Date() },
      { new: true }
    );
    if (!invoice) return res.status(404).json({ success: false, message: "CRM invoice not found" });

    res.json({ success: true, message: "Linked", data: { invoice: invoice._id, qboInvoiceId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-manual/link/payment/:paymentId  { qboPaymentId }
router.post("/link/payment/:paymentId", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { qboPaymentId } = req.body;
    if (!qboPaymentId) return res.status(400).json({ success: false, message: "qboPaymentId is required" });

    const data = await qbo.qboRequest("GET", `/payment/${qboPaymentId}`);
    if (!data.Payment) return res.status(404).json({ success: false, message: "QBO payment not found" });

    const payment = await Payment.findByIdAndUpdate(
      req.params.paymentId,
      { qboPaymentId, qboSyncStatus: "synced", qboSyncError: null, qboLastSyncedAt: new Date() },
      { new: true }
    );
    if (!payment) return res.status(404).json({ success: false, message: "CRM payment not found" });

    res.json({ success: true, message: "Linked", data: { payment: payment._id, qboPaymentId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/qbo-manual/unlink/:type/:id  — clear a bad link (invoice | payment | customer)
router.post("/unlink/:type/:id", protect, authorize(...ROLES), async (req, res) => {
  try {
    const { type, id } = req.params;
    const clear = { qboSyncStatus: "not_synced", qboSyncError: null, qboLastSyncedAt: null };

    if (type === "customer") {
      const user = await User.findByIdAndUpdate(id, { ...clear, qboCustomerId: null }, { new: true, runValidators: false });
      if (!user) return res.status(404).json({ success: false, message: "Customer not found" });

      // ── cascade: unlink all this user's invoices + their payments ──
      const invoices = await Invoice.find({ user: id, qboInvoiceId: { $ne: null } }).select("_id");
      const invoiceIds = invoices.map((i) => i._id);

      await Invoice.updateMany({ _id: { $in: invoiceIds } }, { ...clear, qboInvoiceId: null });
      await Payment.updateMany(
        { invoice: { $in: invoiceIds }, qboPaymentId: { $ne: null } },
        { ...clear, qboPaymentId: null }
      );

      return res.json({
        success: true,
        message: "Customer unlinked",
        cascaded: { invoices: invoiceIds.length },
      });
    }

    if (type === "invoice") {
      const invoice = await Invoice.findByIdAndUpdate(id, { ...clear, qboInvoiceId: null }, { new: true });
      if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

      // ── cascade: unlink all payments tied to this invoice ──
      const result = await Payment.updateMany(
        { invoice: id, qboPaymentId: { $ne: null } },
        { ...clear, qboPaymentId: null }
      );

      return res.json({
        success: true,
        message: "Invoice unlinked",
        cascaded: { payments: result.modifiedCount },
      });
    }

    if (type === "payment") {
      // payments have no dependents — no cascade needed
      const payment = await Payment.findByIdAndUpdate(id, { ...clear, qboPaymentId: null }, { new: true });
      if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
      return res.json({ success: true, message: "Payment unlinked" });
    }

    res.status(400).json({ success: false, message: "type must be invoice | payment | customer" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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

// POST /api/qbo/disconnect
router.post(
  "/disconnect",
  protect,
  authorize("super_admin", "admin", "finance_manager"),
  async (req, res) => {
    try {
      // 1. Revoke the token with Intuit so it can't be reused.
      //    Intuit's revoke endpoint: POST https://developer.api.intuit.com/v2/oauth2/token/revoke
      //    Add a revokeToken() function to services/qboService.js if it
      //    doesn't already have one — it needs the current refresh_token
      //    and your app's client_id/client_secret (Basic auth).
      await qbo.revokeToken();

      // 2. Clear the stored connection so getTokenStatus() reports "not connected".
      //    See the note below — where this actually needs to be cleared
      //    depends on how you decide to store tokens.
      await qbo.clearStoredTokens();

      res.json({ success: true, message: "QuickBooks disconnected" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

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

// router.post(
//   "/sync/invoice/:id",
//   protect,
//   authorize("super_admin", "admin", "finance_manager"),
//   async (req, res) => {
//     try {
//       const invoice = await Invoice.findById(req.params.id);
//       if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

//       const user = await User.findById(invoice.user);
//       if (!user) return res.status(404).json({ success: false, message: "User not found" });

//       const qboInvoice = await qbo.syncInvoice(invoice, user);
//       res.json({
//         success: true,
//         message: "Invoice synced",
//         data: {
//           qboInvoiceId: qboInvoice.Id,
//           docNumber: qboInvoice.DocNumber,
//           balance: qboInvoice.Balance,
//         },
//       });
//     } catch (err) {
//       res.status(500).json({ success: false, message: err.message });
//     }
//   }
// );


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

      // ✅ NEW — auto-sync every approved payment for this invoice that isn't synced yet
      const pendingPayments = await Payment.find({
        invoice: invoice._id,
        status: "approved",
        $or: [{ qboPaymentId: null }, { qboPaymentId: { $exists: false } }],
      });

      const paymentResults = [];
      for (const payment of pendingPayments) {
        try {
          const qboPayment = await qbo.syncPayment(payment, invoice, user);
          paymentResults.push({ paymentId: payment._id, amount: payment.amount, status: "success", qboPaymentId: qboPayment.Id });
        } catch (err) {
          paymentResults.push({ paymentId: payment._id, amount: payment.amount, status: "failed", error: err.message });
        }
      }

      res.json({
        success: true,
        message: `Invoice synced${paymentResults.length ? ` — ${paymentResults.filter(p => p.status === "success").length}/${paymentResults.length} payment(s) also synced` : ""}`,
        data: {
          qboInvoiceId: qboInvoice.Id,
          docNumber: qboInvoice.DocNumber,
          balance: qboInvoice.Balance,
        },
        payments: paymentResults,
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