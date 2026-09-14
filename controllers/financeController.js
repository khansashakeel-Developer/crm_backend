// controllers/financeController.js
const Invoice = require("../models/invoiceModel.js");
const Payment = require("../models/paymentModel.js");
const Enrollment = require("../models/enrollmentModel.js");
const Lead = require("../models/leadModel.js");
const User = require("../models/userModel.js");
const Batch = require("../models/batchModel");
const Counter = require("../models/counterModel.js");
const Certificate = require("../models/certificateModel.js");
const { uploadToCloudinary } = require("../middlewares/uploadReceipt");
const logAudit = require("../utils/auditLogger.js");
const mongoose = require("mongoose");
const sendEmailDynamic = require("../utils/sendEmailDynamic.js");
const { postPaymentJournal } = require("../utils/postPaymentJournal.js");
const { postInvoiceJournal } = require("../utils/postInvoiceJournal.js");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const JournalEntry = require("../models/journalEntryModel.js");
const reverseJournalEntry = require("../utils/reverseJournalEntry.js");
const { invoiceNumberExists, reserveNextInvoiceNumber } = require("../utils/invoiceNumber.js");
const generateReceivingInvoiceTemplate = require("../template/generate-receiving-invoice.js");
const Cheque = require("../models/chequeModel.js");
const { notifyChequeDiscardRecipients } = require("../utils/chequeDiscardHelpers.js");

function getNetAmount(invoice) {
  return Math.max(0, (invoice.totalAmount || 0) - (invoice.discountAmount || 0));
}


// ─────────────────────────────────────────────
// INVOICE MANAGEMENT
// ─────────────────────────────────────────────

// CREATE INVOICE
// exports.createInvoice = async (req, res) => {
//   try {
//     const { user, enrollment, totalAmount, dueDate, installments } = req.body;

//     if (!user || !enrollment || !totalAmount) {
//       return res.status(400).json({ success: false, message: "user, enrollment, totalAmount are required" });
//     }

//     const count = await Invoice.countDocuments();
//     const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

//     const invoice = await Invoice.create({
//       invoiceNumber,
//       user,
//       enrollment,
//       totalAmount,
//       remainingAmount: totalAmount,
//       dueDate,
//       installments: installments || [],
//     });

//     await logAudit({
//       req,
//       action: "INVOICE_CREATED",
//       module: "finance",
//       targetId: invoice._id,
//       after: invoice.toObject(),
//     });

//     res.status(201).json({ success: true, data: invoice });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// exports.createInvoice = async (req, res) => {
//   try {
//     const { user, enrollment, totalAmount, dueDate, installments } = req.body;

//     if (!user || !enrollment || !totalAmount) {
//       return res.status(400).json({
//         success: false,
//         message: "user, enrollment, totalAmount are required",
//       });
//     }

//     const count = await Invoice.countDocuments();
//     const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

//     const invoice = await Invoice.create({
//       invoiceNumber,
//       user,
//       enrollment,
//       totalAmount,
//       remainingAmount: totalAmount,
//       dueDate,
//       installments: installments || [],
//     });

//     // ✅ AUTO JOURNAL — Receivable + Income
//     await postInvoiceJournal({
//       amount: totalAmount,
//       invoiceId: invoice._id,
//       userId: req.user._id,
//       description: `Invoice ${invoiceNumber} created`,
//     });

//     await logAudit({
//       req,
//       action: "INVOICE_CREATED",
//       module: "finance",
//       targetId: invoice._id,
//       after: invoice.toObject(),
//     });

//     res.status(201).json({ success: true, data: invoice });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.createInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      user, enrollment, enrollments, items,
      totalAmount, discountAmount = 0, dueDate, installments, invoiceNumber, issueDate,
    } = req.body;

    const isBundle = Array.isArray(enrollments) && enrollments.length > 1;

    if (!user || !totalAmount) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "user, totalAmount are required" });
    }
    if (!isBundle && !enrollment) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "enrollment is required" });
    }
    if (isBundle && (!items || !items.length)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "items required for bundle invoice" });
    }

    let finalInvoiceNumber = invoiceNumber;
    if (!finalInvoiceNumber) {
      finalInvoiceNumber = await reserveNextInvoiceNumber();
    } else {
      const exists = await invoiceNumberExists(finalInvoiceNumber);
      if (exists) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Invoice number ${finalInvoiceNumber} already exists` });
      }
    }

    const grossAmount = Number(totalAmount);
    const discount = Number(discountAmount);
    const netAmount = grossAmount - discount;
    const invoiceDate = issueDate ? new Date(issueDate) : new Date();

    const invoiceArr = await Invoice.create([{
      invoiceNumber: finalInvoiceNumber,
      user,
      enrollment: isBundle ? enrollments[0] : enrollment,
      isBundle,
      enrollments: isBundle ? enrollments : undefined,
      items: isBundle ? items : undefined,
      totalAmount: grossAmount,
      discountAmount: discount,
      remainingAmount: netAmount,
      dueDate,
      issueDate: invoiceDate,
      installments: installments || [],
    }], { session });
    const invoice = invoiceArr[0];

    if (isBundle) {
      await Enrollment.updateMany(
        { _id: { $in: enrollments } },
        { invoice: invoice._id },
        { session }
      );
    }

    // ── Bundle certificate items ──
    const certItems = (items || []).filter((it) => it.feeType === "certificate");
    for (const it of certItems) {
      const already = await Certificate.findOne({ enrollment: it.enrollment, program: it.program }).session(session);
      if (!already) {
        await Certificate.create([{
          user, enrollment: it.enrollment, program: it.program,
          certificateFee: it.amount, feePaid: false, feeType: "certificate", status: "locked",
        }], { session });
      }
    }

    // ── Single invoice certificate installment ──
    if (!isBundle) {
      const singleCertInst = (installments || []).find((i) => i.feeType === "certificate");
      if (singleCertInst) {
        let resolvedProgram = singleCertInst.program;
        if (!resolvedProgram) {
          const enrollmentDoc = await Enrollment.findById(enrollment).select("program").session(session);
          resolvedProgram = enrollmentDoc?.program;
        }
        if (resolvedProgram) {
          const already = await Certificate.findOne({ enrollment, program: resolvedProgram }).session(session);
          if (!already) {
            await Certificate.create([{
              user, enrollment, program: resolvedProgram,
              certificateFee: singleCertInst.amount, feePaid: false, feeType: "certificate", status: "locked",
            }], { session });
          }
        }
      }
    }

    await postInvoiceJournal({
      amount: grossAmount,
      discountAmount: discount,
      invoiceId: invoice._id,
      userId: req.user._id,
      description: `Invoice ${invoice.invoiceNumber}`,
      date: invoice.issueDate,
      session,
    });

    await logAudit({
      req, action: "INVOICE_CREATED", module: "finance",
      targetId: invoice._id, after: invoice.toObject(),
    });

    await session.commitTransaction();
    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// GET ALL INVOICES (with filters)
// exports.getAllInvoices = async (req, res) => {
//   try {
//     const { status, userId, enrollmentId, page = 1, limit = 10 } = req.query;

//     const filter = {};
//     if (status) filter.status = status;
//     if (userId) filter.user = userId;
//     if (enrollmentId) filter.enrollment = enrollmentId;

//     const invoices = await Invoice.find(filter)
//       .populate("user", "name email phone")
//       .populate({ path: "enrollment", populate: [{ path: "program", select: "name short_description" }, { path: "batch", select: "name start_date end_date" }] })
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * limit)
//       .limit(Number(limit));

//     const total = await Invoice.countDocuments(filter);

//     res.json({
//       success: true,
//       data: invoices,
//       meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.getAllInvoices = async (req, res) => {
  try {
    const { status, userId, enrollmentId, search, dateFrom, dateTo, programIds, hasDiscount, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.user = userId;
    if (enrollmentId) filter.enrollment = enrollmentId;

    // ── Discount filter ──────────────────────────────────
    if (hasDiscount === "true") {
      filter.discountAmount = { $gt: 0 };
    }

    // ── Program filter — enrollment ke through resolve karna hoga ──
    if (programIds) {
      const programIdArr = programIds.split(",").filter(Boolean);
      if (programIdArr.length) {
        const matchedEnrollments = await Enrollment.find({
          program: { $in: programIdArr },
        }).select("_id");
        const enrollmentIds = matchedEnrollments.map((e) => e._id);

        // Single invoice (enrollment field) YA bundle invoice (items.enrollment) — dono cover karo
        filter.$or = [
          ...(filter.$or || []),
          { enrollment: { $in: enrollmentIds } },
          { "items.enrollment": { $in: enrollmentIds } },
        ];
      }
    }

    if (dateFrom || dateTo) {
      filter.issueDate = {};
      if (dateFrom) filter.issueDate.$gte = new Date(dateFrom + "T00:00:00.000Z");
      if (dateTo) filter.issueDate.$lte = new Date(dateTo + "T23:59:59.999Z");
    }

    if (search) {
      const matchedUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      const userIds = matchedUsers.map((u) => u._id);

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { invoiceNumber: { $regex: search, $options: "i" } },
          { user: { $in: userIds } },
        ],
      });
    }

    const invoices = await Invoice.find(filter)
      .populate("user", "name email phone")
      .populate({ path: "enrollment", populate: [{ path: "program", select: "name short_description" }, { path: "batch", select: "name start_date end_date" }] })
      .populate({ path: "items.enrollment", populate: [{ path: "program", select: "name short_description" }, { path: "batch", select: "name start_date end_date" }] })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Invoice.countDocuments(filter);

    res.json({
      success: true,
      data: invoices,
      meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET SINGLE INVOICE
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("enrollment");

    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    res.json({ success: true, data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// MARK INVOICE AS PAID MANUALLY
exports.markInvoicePaid = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    const before = invoice.toObject();

    invoice.status = "PAID";
    invoice.paidAmount = getNetAmount(invoice);
    invoice.remainingAmount = 0;
    await invoice.save();

    // markInvoicePaid mein invoice.status = "PAID" ke baad:
    const payment = new Payment({
      invoice: invoice._id,
      enrollment: invoice.enrollment,
      user: invoice.user,
      amount: invoice.totalAmount,
      method: "manual",        // ✅ method add karo
      status: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
      receivedBy: req.user._id,
      notes: "Marked as fully paid manually",
    });
    await payment.save();

    await logAudit({
      req,
      action: "INVOICE_MARKED_PAID",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    res.json({ success: true, message: "Invoice marked as paid", data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.markInstallmentPaid = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { invoiceId, installmentId } = req.params;
//     const { method, referenceNumber, notes } = req.body;

//     // ── Validate method ───────────────────────────────────────────
//     if (!method) {
//       await session.abortTransaction();
//       return res.status(400).json({ success: false, message: "Payment method is required" });
//     }

//     if (["bank", "cheque"].includes(method) && !referenceNumber) {
//       await session.abortTransaction();
//       return res.status(400).json({
//         success: false,
//         message: "Reference number is required for bank/cheque payments"
//       });
//     }

//     // ── Find invoice ──────────────────────────────────────────────
//     const invoice = await Invoice.findById(invoiceId).session(session);
//     if (!invoice)
//       return res.status(404).json({ success: false, message: "Invoice not found" });

//     // ── Find installment ──────────────────────────────────────────
//     const installment = invoice.installments.id(installmentId);
//     if (!installment)
//       return res.status(404).json({ success: false, message: "Installment not found" });

//     if (installment.status === "PAID")
//       return res.status(400).json({ success: false, message: "Already paid" });

//     const before = invoice.toObject();

//     // ── Mark installment paid ─────────────────────────────────────
//     installment.status = "PAID";
//     installment.paidAmount = installment.amount;
//     installment.method = method;
//     installment.referenceNumber = referenceNumber || null;

//     // ── Recalculate invoice totals ────────────────────────────────
//     const totalPaid = invoice.installments.reduce(
//       (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
//     );
//     invoice.paidAmount = totalPaid;
//     invoice.remainingAmount = Math.max(0, invoice.totalAmount - totalPaid);
//     invoice.status =
//       invoice.remainingAmount === 0 ? "PAID"
//         : totalPaid > 0 ? "PARTIAL"
//           : "PENDING";

//     await invoice.save({ session });

//     // ── Payment record ────────────────────────────────────────────
//     const payment = new Payment({
//       invoice: invoice._id,
//       enrollment: invoice.enrollment,
//       user: invoice.user,
//       amount: installment.amount,
//       method,
//       referenceNumber: referenceNumber || null,
//       status: "approved",
//       approvedBy: req.user._id,
//       approvedAt: new Date(),
//       receivedBy: req.user._id,
//       notes: notes || `Payment for ${installment.label}`,
//     });
//     await payment.save({ session });

//     // ── Audit log ─────────────────────────────────────────────────
//     await logAudit({
//       req,
//       action: "INSTALLMENT_MARKED_PAID",
//       module: "finance",
//       targetId: invoice._id,
//       before,
//       after: invoice.toObject(),
//     });

//     let enrollmentActivated = false;
//     let leadDeleted = false;

//     // ── ADVANCE PAID — main logic ─────────────────────────────────
//     if (installment.isAdvance) {

//       // Overdue installments check (future pending = ok)
//       const hasOverdue = invoice.installments.some(
//         (inst) =>
//           inst.status !== "PAID" &&
//           inst.dueDate &&
//           new Date(inst.dueDate) < new Date()
//       );

//       const enrollment = await Enrollment.findById(invoice.enrollment).populate('batch').session(session);

//       if (enrollment && enrollment.accessStatus === "RESTRICTED" && !hasOverdue) {

//         // ── 1. Find lead by user_id + program ─────────────────────
//         // const lead = await Lead.findOne({
//         //   user_id: enrollment.user,
//         //   program_id: enrollment.program,
//         //   status: "converted",
//         // }).session(session);
//         const lead = await Lead.findOneAndUpdate({
//           user_id: enrollment.user,
//           program_id: enrollment.program,
//           status: "converted",
//         }, { advance_paid: true }).session(session);

//         if (lead) {
//           // ── 2. Save full lead snapshot into enrollment ──────────
//           enrollment.leadSnapshot = {
//             paymentPlan: lead.paymentPlan || null,
//             contractDetails: lead.contractDetails || null,
//             source: lead.source || null,
//             quality: lead.quality || null,
//             opportunity_value: lead.opportunity_value || 0,
//             notes: lead.notes || null,
//             utm_source: lead.utm_source || null,
//             utm_medium: lead.utm_medium || null,
//             utm_campaign: lead.utm_campaign || null,
//             lead_score: lead.lead_score || 0,
//             activities: lead.activities || [],
//             assigned_to: lead.assigned_to || null,
//             created_by: lead.created_by || null,
//             lead_id: lead._id,
//           };

//           // ── 3. Delete lead ──────────────────────────────────────
//           await Lead.findByIdAndDelete(lead._id).session(session);
//           leadDeleted = true;

//           await logAudit({
//             req,
//             action: "LEAD_DELETED_AFTER_ENROLLMENT",
//             module: "leads",
//             targetId: lead._id,
//             before: lead.toObject(),
//             after: null,
//           });
//         }

//         // ── 4. Activate enrollment ──────────────────────────────
//         enrollment.accessStatus = "ACTIVE";
//         await enrollment.save({ session });
//         enrollmentActivated = true;

//         await logAudit({
//           req,
//           action: "ENROLLMENT_ACTIVATED_ADVANCE_PAID",
//           module: "finance",
//           targetId: enrollment._id,
//           after: { accessStatus: "ACTIVE", leadDeleted },
//         });
//       }
//     }

//     await session.commitTransaction();

//     return res.json({
//       success: true,
//       message: enrollmentActivated
//         ? `Installment paid — Enrollment activated!${leadDeleted ? " Lead record deleted." : ""}`
//         : "Installment marked as paid",
//       data: invoice,
//       enrollmentActivated,
//       leadDeleted,
//     });

//   } catch (err) {
//     await session.abortTransaction();
//     console.error("markInstallmentPaid error:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   } finally {
//     session.endSession();
//   }
// };

// financeController.js mein add karo

// ── Installment Edit ─────────────────────────────────────────────
// exports.markInstallmentPaid = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { invoiceId, installmentId } = req.params;
//     const { method, referenceNumber, notes } = req.body;

//     if (!method) {
//       await session.abortTransaction();
//       return res.status(400).json({ success: false, message: "Payment method is required" });
//     }

//     if (["bank", "cheque"].includes(method) && !referenceNumber) {
//       await session.abortTransaction();
//       return res.status(400).json({
//         success: false,
//         message: "Reference number is required for bank/cheque payments",
//       });
//     }

//     const invoice = await Invoice.findById(invoiceId).session(session);
//     if (!invoice)
//       return res.status(404).json({ success: false, message: "Invoice not found" });

//     const installment = invoice.installments.id(installmentId);
//     if (!installment)
//       return res.status(404).json({ success: false, message: "Installment not found" });

//     if (installment.status === "PAID")
//       return res.status(400).json({ success: false, message: "Already paid" });

//     const before = invoice.toObject();

//     // 👇 Receipt optional — sirf tab Cloudinary pe jayega jab file upload hui ho
//     let receiptUrl = null;
//     let receiptPublicId = null;

//     if (req.file) {
//       const result = await uploadToCloudinary(req.file.buffer, {
//         folder: "receipts",
//         resource_type: "auto", // image ya pdf dono handle karega
//       });
//       receiptUrl = result.secure_url;
//       receiptPublicId = result.public_id;
//     }

//     installment.status = "PAID";
//     installment.paidAmount = installment.amount;
//     installment.method = method;
//     installment.referenceNumber = referenceNumber || null;
//     installment.receiptUrl = receiptUrl;
//     installment.receiptPublicId = receiptPublicId;

//     const totalPaid = invoice.installments.reduce(
//       (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
//     );
//     invoice.paidAmount = totalPaid;
//     invoice.remainingAmount = Math.max(0, invoice.totalAmount - totalPaid);
//     invoice.status =
//       invoice.remainingAmount === 0 ? "PAID"
//         : totalPaid > 0 ? "PARTIAL"
//           : "PENDING";

//     await invoice.save({ session });

//     const payment = new Payment({
//       invoice: invoice._id,
//       enrollment: invoice.enrollment,
//       user: invoice.user,
//       amount: installment.amount,
//       method,
//       referenceNumber: referenceNumber || null,
//       receiptUrl,
//       receiptPublicId,
//       status: "approved",
//       approvedBy: req.user._id,
//       approvedAt: new Date(),
//       receivedBy: req.user._id,
//       notes: notes || `Payment for ${installment.label}`,
//     });
//     await payment.save({ session });
//     installment.paymentId = payment._id;
//     await invoice.save({ session });

//     await postPaymentJournal({
//       amount: installment.amount,
//       method,
//       paymentId: payment._id,
//       userId: req.user._id,
//       description: `Installment paid — ${installment.label} (${invoice.invoiceNumber})`,
//       session,
//     });

//     await logAudit({
//       req,
//       action: "INSTALLMENT_MARKED_PAID",
//       module: "finance",
//       targetId: invoice._id,
//       before,
//       after: invoice.toObject(),
//     });

//     let enrollmentActivated = false;
//     let leadDeleted = false;

//     if (installment.isAdvance) {
//       const hasOverdue = invoice.installments.some(
//         (inst) =>
//           inst.status !== "PAID" &&
//           inst.dueDate &&
//           new Date(inst.dueDate) < new Date()
//       );

//       const enrollment = await Enrollment.findById(invoice.enrollment)
//         .populate("batch")
//         .session(session);

//       if (enrollment && enrollment.accessStatus === "RESTRICTED" && !hasOverdue) {
//         const lead = await Lead.findOneAndUpdate(
//           { user_id: enrollment.user, program_id: enrollment.program, status: "converted" },
//           { advance_paid: true }
//         ).session(session);

//         if (lead) {
//           enrollment.leadSnapshot = {
//             paymentPlan: lead.paymentPlan || null,
//             contractDetails: lead.contractDetails || null,
//             source: lead.source || null,
//             quality: lead.quality || null,
//             opportunity_value: lead.opportunity_value || 0,
//             notes: lead.notes || null,
//             utm_source: lead.utm_source || null,
//             utm_medium: lead.utm_medium || null,
//             utm_campaign: lead.utm_campaign || null,
//             lead_score: lead.lead_score || 0,
//             activities: lead.activities || [],
//             assigned_to: lead.assigned_to || null,
//             created_by: lead.created_by || null,
//             lead_id: lead._id,
//           };

//           await Lead.findByIdAndDelete(lead._id).session(session);
//           leadDeleted = true;

//           await logAudit({
//             req,
//             action: "LEAD_DELETED_AFTER_ENROLLMENT",
//             module: "leads",
//             targetId: lead._id,
//             before: lead.toObject(),
//             after: null,
//           });
//         }

//         enrollment.accessStatus = "ACTIVE";
//         await enrollment.save({ session });
//         enrollmentActivated = true;

//         if (enrollment.batch) {
//           await Batch.findByIdAndUpdate(
//             enrollment.batch,
//             { $addToSet: { students: enrollment.user } }, // ya field name jo bhi ho
//             { session }
//           );
//         }

//         await logAudit({
//           req,
//           action: "ENROLLMENT_ACTIVATED_ADVANCE_PAID",
//           module: "finance",
//           targetId: enrollment._id,
//           after: { accessStatus: "ACTIVE", leadDeleted },
//         });
//       }
//     }

//     await session.commitTransaction();

//     return res.json({
//       success: true,
//       message: "Installment marked as paid",
//       data: invoice,
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     console.error("markInstallmentPaid error:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   } finally {
//     session.endSession();
//   }
// };


exports.updateInstallment = async (req, res) => {
  try {
    const { invoiceId, installmentId } = req.params;
    const { label, amount, dueDate } = req.body;

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const installment = invoice.installments.id(installmentId);
    if (!installment)
      return res.status(404).json({ success: false, message: "Installment not found" });

    const before = invoice.toObject();

    if (label) installment.label = label;
    if (amount !== undefined) installment.amount = Number(amount);
    if (dueDate) installment.dueDate = new Date(dueDate);

    // Recalculate totalAmount from all installments
    const newTotal = invoice.installments.reduce(
      (sum, inst) => sum + (inst.amount || 0), 0
    );
    // invoice.totalAmount = newTotal;
    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - (invoice.paidAmount || 0));

    // invoice.remainingAmount = Math.max(0, newTotal - (invoice.paidAmount || 0));

    await invoice.save();

    await logAudit({
      req,
      action: "INSTALLMENT_UPDATED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    res.json({ success: true, message: "Installment updated", data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Installment Add ──────────────────────────────────────────────
exports.addInstallment = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { label, amount, dueDate, isAdvance, feeType, date } = req.body;

    if (!label || amount === undefined)
      return res.status(400).json({ success: false, message: "label and amount are required" });

    // 👇 enrollment populate kiya taake fallback mein program mil sake
    const invoice = await Invoice.findById(invoiceId).populate("enrollment"); // ya populate("enrollment", "program") agar sirf program chahiye
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const before = invoice.toObject();
    const numAmount = Number(amount);
    const entryDate = date ? new Date(date) : new Date();

    const isExtraFee = feeType === "certificate" || feeType === "manual";

    invoice.installments.push({
      label,
      amount: numAmount,
      dueDate: dueDate ? new Date(dueDate) : null,
      isAdvance: isAdvance ?? false,
      feeType: feeType || "program",
      status: "PENDING",
      paidAmount: 0,
    });

    if (isExtraFee) {
      invoice.totalAmount = (invoice.totalAmount || 0) + numAmount;
    } else {
      const totalInstallments = invoice.installments.reduce(
        (sum, i) => sum + (i.amount || 0),
        0
      );

      if (totalInstallments > invoice.totalAmount) {
        return res.status(400).json({
          success: false,
          message: "Installments exceed invoice total"
        });
      }
    }

    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - (invoice.paidAmount || 0));

    invoice.status =
      invoice.remainingAmount === 0 ? "PAID"
        : (invoice.paidAmount || 0) > 0 ? "PARTIAL"
          : "PENDING";

    await invoice.save();

    if (isExtraFee) {
      try {
        await postInvoiceJournal({
          amount: numAmount,
          invoiceId: invoice._id,
          userId: req.user._id,
          description: `${label} added to invoice ${invoice.invoiceNumber}`,
          date: entryDate,
        });
      } catch (journalErr) {
        console.error("postInvoiceJournal failed:", journalErr.message);
      }
    }

    if (feeType === "certificate") {
      const already = await Certificate.findOne({ enrollment: invoice.enrollment?._id || invoice.enrollment });
      if (!already) {
        // items[0].program already ObjectId string hota hai (jaise aapke data mein "69d88bcd3b3f401bb2e711bc")
        // enrollment.program ek populated object hai, isliye ._id nikalna zaroori hai
        const resolvedProgram =
          invoice.items?.[0]?.program ||
          invoice.enrollment?.program?._id ||
          invoice.enrollment?.program || // agar kabhi already ObjectId ho to yehi fallback ban jayega
          undefined;

        await Certificate.create({
          user: invoice.user?._id || invoice.user,
          enrollment: invoice.enrollment?._id || invoice.enrollment,
          program: resolvedProgram,
          certificateFee: numAmount,
          feePaid: false,
          status: "locked",
        });
      }
    }

    await logAudit({
      req,
      action: "INSTALLMENT_ADDED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    res.json({ success: true, message: "Installment added", data: invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE INVOICE
// exports.updateInvoice = async (req, res) => {
//   try {
//     const before = await Invoice.findById(req.params.id).lean();
//     if (!before) return res.status(404).json({ success: false, message: "Invoice not found" });

//     const updated = await Invoice.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });

//     await logAudit({
//       req,
//       action: "INVOICE_UPDATED",
//       module: "finance",
//       targetId: updated._id,
//       before,
//       after: updated.toObject(),
//     });

//     res.json({ success: true, data: updated });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.updateInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const before = await Invoice.findById(req.params.id).session(session);
    if (!before)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const beforeObj = before.toObject();
    const oldTotal = before.totalAmount;
    const newTotal = req.body.totalAmount !== undefined ? Number(req.body.totalAmount) : oldTotal;
    const correctionDate = req.body.date ? new Date(req.body.date) : new Date();

    Object.assign(before, req.body);
    before.remainingAmount = Math.max(0, getNetAmount(before) - (before.paidAmount || 0));
    await before.save({ session });

    // ── totalAmount change hua? → journal reverse + repost ────────
    if (newTotal !== oldTotal) {
      await reverseJournalEntry({
        sourceType: "invoice",
        sourceRef: before._id,
        userId: req.user._id,
        description: `Reversal — invoice ${before.invoiceNumber} amount corrected`,
        session,
      });

      await postInvoiceJournal({
        amount: newTotal,
        invoiceId: before._id,
        userId: req.user._id,
        description: `Invoice ${before.invoiceNumber} amount corrected to ${newTotal}`,
        date: correctionDate,
        session, // 👈 postInvoiceJournal ko bhi session accept karna hoga
      });
    }

    await logAudit({
      req,
      action: "INVOICE_UPDATED",
      module: "finance",
      targetId: before._id,
      before: beforeObj,
      after: before.toObject(),
    });

    await session.commitTransaction();
    res.json({ success: true, data: before });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// ── VOID A SINGLE INSTALLMENT PAYMENT ────────────────────────────
exports.markInstallmentPaid = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceId, installmentId } = req.params;
    const { method, referenceNumber, notes, paidDate } = req.body

    if (!method) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Payment method is required" });
    }

    if (["bank", "cheque"].includes(method) && !referenceNumber) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Reference number is required for bank/cheque payments",
      });
    }

    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const installment = invoice.installments.id(installmentId);
    if (!installment)
      return res.status(404).json({ success: false, message: "Installment not found" });

    if (installment.status === "PAID")
      return res.status(400).json({ success: false, message: "Already paid" });

    const before = invoice.toObject();

    // 👇 Receipt optional — sirf tab Cloudinary pe jayega jab file upload hui ho
    let receiptUrl = null;
    let receiptPublicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: "receipts",
        resource_type: "auto",
      });
      receiptUrl = result.secure_url;
      receiptPublicId = result.public_id;
    }
    const paidAtValue = paidDate ? new Date(paidDate) : new Date()
    // ── 1. Payment pehle banao ─────────────────────────────────────
    const payment = new Payment({
      invoice: invoice._id,
      enrollment: invoice.enrollment,
      user: invoice.user,
      amount: installment.amount,
      method,
      referenceNumber: referenceNumber || null,
      receiptUrl,
      receiptPublicId,
      status: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
      paidAt: paidAtValue,
      receivedBy: req.user._id,
      notes: notes || `Payment for ${installment.label}`,
    });
    await payment.save({ session });

    // ── 2. Installment update — paymentId link sahi yahan set hoga ──
    installment.status = "PAID";
    installment.paidAmount = installment.amount;
    installment.method = method;
    installment.referenceNumber = referenceNumber || null;
    installment.receiptUrl = receiptUrl;
    installment.receiptPublicId = receiptPublicId;
    installment.paymentId = payment._id; // ✅ correct link
    installment.paidAt = paidAtValue;

    const totalPaid = invoice.installments.reduce(
      (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
    );
    invoice.paidAmount = totalPaid;
    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - totalPaid);
    invoice.status =
      invoice.remainingAmount === 0 ? "PAID"
        : totalPaid > 0 ? "PARTIAL"
          : "PENDING";

    await invoice.save({ session }); // ✅ ek hi save — sab kuch persist ho jayega

    // ── Certificate fee ka installment paid hua? → Certificate record update karo ──
    if (installment.feeType === "certificate") {
      await Certificate.findOneAndUpdate(
        { enrollment: invoice.enrollment },
        { feePaid: true, feePaidAt: paidAtValue },
        { session }
      );
    }

    // ── 3. Journal post karo ─────────────────────────────────────────
    await postPaymentJournal({
      amount: installment.amount,
      method,
      paymentId: payment._id,
      userId: req.user._id,
      description: `Installment paid — ${installment.label} (${invoice.invoiceNumber})`,
      date: paidAtValue,
      session,
    });

    await logAudit({
      req,
      action: "INSTALLMENT_MARKED_PAID",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    let enrollmentActivated = false;
    let leadDeleted = false;

    // ── 4. Advance paid → activate enrollment(s) ──────────────────
    if (installment.isAdvance) {
      const hasOverdue = invoice.installments.some(
        (inst) =>
          inst.status !== "PAID" &&
          inst.dueDate &&
          new Date(inst.dueDate) < new Date()
      );

      const enrollment = await Enrollment.findById(invoice.enrollment)
        .populate("batch")
        .session(session);

      if (enrollment && enrollment.accessStatus === "RESTRICTED" && !hasOverdue) {
        const lead = await Lead.findOneAndUpdate(
          { user_id: enrollment.user, program_id: enrollment.program, status: "converted" },
          { advance_paid: true }
        ).session(session);

        if (lead) {
          enrollment.leadSnapshot = {
            paymentPlan: lead.paymentPlan || null,
            contractDetails: lead.contractDetails || null,
            source: lead.source || null,
            quality: lead.quality || null,
            opportunity_value: lead.opportunity_value || 0,
            notes: lead.notes || null,
            utm_source: lead.utm_source || null,
            utm_medium: lead.utm_medium || null,
            utm_campaign: lead.utm_campaign || null,
            lead_score: lead.lead_score || 0,
            activities: lead.activities || [],
            assigned_to: lead.assigned_to || null,
            created_by: lead.created_by || null,
            lead_id: lead._id,
          };

          await Lead.findByIdAndDelete(lead._id).session(session);
          leadDeleted = true;

          await logAudit({
            req,
            action: "LEAD_DELETED_AFTER_ENROLLMENT",
            module: "leads",
            targetId: lead._id,
            before: lead.toObject(),
            after: null,
          });
        }

        enrollment.accessStatus = "ACTIVE";
        await enrollment.save({ session });
        enrollmentActivated = true;

        if (enrollment.batch) {
          await Batch.findByIdAndUpdate(
            enrollment.batch,
            { $addToSet: { students: enrollment.user } },
            { session }
          );
        }

        await logAudit({
          req,
          action: "ENROLLMENT_ACTIVATED_ADVANCE_PAID",
          module: "finance",
          targetId: enrollment._id,
          after: { accessStatus: "ACTIVE", leadDeleted },
        });
      }
    }

    await session.commitTransaction();

    return res.json({
      success: true,
      message: "Installment marked as paid",
      data: invoice,
    });
    } catch (err) {
    await session.abortTransaction();
    console.error("markInstallmentPaid error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// ── RECORD CHEQUE — just logs it as pending, no money counted yet ──
exports.recordChequePayment = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { accountHolderName, cheques } = req.body;

    if (!accountHolderName || !Array.isArray(cheques) || cheques.length === 0) {
      return res.status(400).json({ success: false, message: "Account holder name and at least one cheque are required" });
    }
    for (const c of cheques) {
      if (!c.chequeNumber || !c.amount || Number(c.amount) <= 0) {
        return res.status(400).json({ success: false, message: "Each cheque needs a cheque number and a valid amount" });
      }
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    const totalAmount = cheques.reduce((sum, c) => sum + Number(c.amount), 0);
    if (totalAmount > invoice.remainingAmount) {
      return res.status(400).json({
        success: false,
        message: `Cheque total (Rs ${totalAmount}) exceeds remaining balance (Rs ${invoice.remainingAmount}) — cheques can't exceed what's owed`,
      });
    }

    const chequeDocs = await Cheque.create(
      cheques.map((c) => ({
        invoice: invoice._id,
        user: invoice.user,
        accountHolderName,
        chequeNumber: c.chequeNumber,
        amount: Number(c.amount),
        date: c.date ? new Date(c.date) : null,
        status: "pending",
        createdBy: req.user._id,
      }))
    );

    await logAudit({
      req,
      action: "CHEQUE_RECORDED",
      module: "finance",
      targetId: invoice._id,
      after: { cheques: chequeDocs.map((c) => ({ chequeNumber: c.chequeNumber, amount: c.amount })) },
    });

    return res.json({ success: true, message: "Cheque(s) recorded — pending clearance", data: { cheques: chequeDocs } });
  } catch (err) {
    console.error("recordChequePayment error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
// ── LIST CHEQUES for an invoice ───────────────────────────────────
exports.getInvoiceCheques = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const cheques = await Cheque.find({ invoice: invoiceId }).sort({ createdAt: -1 });
    res.json({ success: true, data: cheques });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DISCARD A CHEQUE — reverses it off the installment it was applied to ──
// ── DISCARD (= CLEARED) — cheque banked successfully, money now counted ──
exports.discardCheque = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceId, chequeId } = req.params;

    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const cheque = await Cheque.findOne({ _id: chequeId, invoice: invoiceId }).session(session);
    if (!cheque) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Cheque not found" });
    }
    if (cheque.status !== "pending") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Cheque is already ${cheque.status}` });
    }

    if (cheque.amount > invoice.remainingAmount) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Cheque amount exceeds remaining balance — invoice may have changed since this cheque was recorded" });
    }

    const before = invoice.toObject();
    const paidAtValue = new Date();

    const payment = new Payment({
      invoice: invoice._id,
      enrollment: invoice.enrollment,
      user: invoice.user,
      amount: cheque.amount,
      method: "cheque",
      status: "approved",
      approvedBy: req.user._id,
      approvedAt: new Date(),
      paidAt: paidAtValue,
      receivedBy: req.user._id,
      notes: `Cheque #${cheque.chequeNumber} cleared`,
    });
    await payment.save({ session });

    cheque.status = "cleared";
    cheque.clearedAt = paidAtValue;
    cheque.clearedBy = req.user._id;
    cheque.paymentId = payment._id;
    await cheque.save({ session });

    invoice.paidAmount = (invoice.paidAmount || 0) + cheque.amount;
    invoice.remainingAmount = Math.max(0, invoice.remainingAmount - cheque.amount);
    invoice.status =
      invoice.remainingAmount === 0 ? "PAID"
        : invoice.paidAmount > 0 ? "PARTIAL"
          : "PENDING";
    await invoice.save({ session });

    await postPaymentJournal({
      amount: cheque.amount,
      method: "cheque",
      paymentId: payment._id,
      userId: req.user._id,
      description: `Cheque #${cheque.chequeNumber} cleared — ${invoice.invoiceNumber}`,
      date: paidAtValue,
      session,
    });

    await logAudit({
      req,
      action: "CHEQUE_CLEARED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    await session.commitTransaction();
    return res.json({ success: true, message: "Cheque cleared — payment recorded", data: invoice });
  } catch (err) {
    await session.abortTransaction();
    console.error("discardCheque (clear) error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// ── BOUNCE — cheque failed, no money was ever counted, just flag it ──
exports.bounceCheque = async (req, res) => {
  try {
    const { invoiceId, chequeId } = req.params;
    const { reason, depositDate, bounceDate } = req.body;

    if (!depositDate || !bounceDate) {
      return res.status(400).json({ success: false, message: "Deposit date and bounce date are both required" });
    }

    const cheque = await Cheque.findOne({ _id: chequeId, invoice: invoiceId });
    if (!cheque) return res.status(404).json({ success: false, message: "Cheque not found" });
    if (cheque.status !== "pending") {
      return res.status(400).json({ success: false, message: `Cheque is already ${cheque.status}` });
    }

    cheque.status = "bounced";
    cheque.depositDate = new Date(depositDate);
    cheque.bounceDate = new Date(bounceDate);
    cheque.bouncedAt = new Date();
    cheque.bouncedBy = req.user._id;
    cheque.bounceReason = reason || "Cheque bounced";
    await cheque.save();

    await logAudit({
      req,
      action: "CHEQUE_BOUNCED",
      module: "finance",
      targetId: invoiceId,
      after: { chequeNumber: cheque.chequeNumber, reason: cheque.bounceReason },
    });

    const invoice = await Invoice.findById(invoiceId).select("invoiceNumber");
    notifyChequeDiscardRecipients({
      chequeNumber: cheque.chequeNumber,
      amount: cheque.amount,
      invoiceNumber: invoice?.invoiceNumber || "—",
      reason: cheque.bounceReason,
      triggeredBy: req.user._id,
    }).catch((err) => console.error("notifyChequeDiscardRecipients failed:", err.message));

    res.json({ success: true, message: "Cheque marked as bounced", data: cheque });
  } catch (err) {
    console.error("bounceCheque error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
// ── EDIT A PAID INSTALLMENT (amount/date correction after payment) ──
// exports.editPaidInstallment = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { invoiceId, installmentId } = req.params;
//     const { amount, paidDate, method, referenceNumber, notes, reason } = req.body;

//     if (!reason) {
//       await session.abortTransaction();
//       return res.status(400).json({ success: false, message: "Reason for correction is required" });
//     }

//     const invoice = await Invoice.findById(invoiceId).session(session);
//     if (!invoice)
//       return res.status(404).json({ success: false, message: "Invoice not found" });

//     const installment = invoice.installments.id(installmentId);
//     if (!installment)
//       return res.status(404).json({ success: false, message: "Installment not found" });

//     if (installment.status !== "PAID")
//       return res.status(400).json({ success: false, message: "Only paid installments can be corrected" });

//     const payment = await Payment.findById(installment.paymentId).session(session);
//     if (!payment || payment.status !== "approved")
//       return res.status(404).json({ success: false, message: "Matching payment record not found" });

//     const before = invoice.toObject();
//     const beforePayment = payment.toObject();
//     const oldAmount = installment.amount;
//     const newAmount = amount !== undefined ? Number(amount) : oldAmount;
//     const diff = newAmount - oldAmount;

//     const isExtraFee = installment.feeType === "certificate" || installment.feeType === "manual";
//     if (isExtraFee) {
//       invoice.totalAmount = Math.max(0, invoice.totalAmount + diff);

//       if (diff !== 0) {
//         await postInvoiceJournal({
//           amount: diff,   // ⚠️ negative bhi ho sakta hai — postInvoiceJournal ko ye handle karna hoga
//           invoiceId: invoice._id,
//           userId: req.user._id,
//           description: `${installment.label} corrected — adjusting AR/Income by ${diff > 0 ? "+" : ""}${diff} (${invoice.invoiceNumber}): ${reason}`,
//           date: newPaidDate || new Date(),
//           session,
//         });
//       }
//     }


//     // ── Step 1: PURANI entry (50,000 wali) ko reverse karo — YE MISSING THA ──
//     const reversed = await reverseJournalEntry({
//       sourceType: "payment",
//       sourceRef: payment._id,
//       userId: req.user._id,
//       description: `Reversal — correcting ${installment.label} (${invoice.invoiceNumber}): ${reason}`,
//       session,
//     });

//     if (!reversed.length) {
//       await session.abortTransaction();
//       return res.status(400).json({
//         success: false,
//         message: "No posted journal entry found for this payment — cannot correct safely",
//       });
//     }

//     // ── Step 2: Naye correct values determine karo ──
//     // const newAmount = amount !== undefined ? Number(amount) : oldAmount;
//     const newPaidDate = paidDate ? new Date(paidDate) : installment.paidAt;
//     const newMethod = method || installment.method;
//     const newRef = referenceNumber !== undefined ? referenceNumber : installment.referenceNumber;

//     // ── Step 3: Payment + installment record update karo ──
//     payment.amount = newAmount;
//     payment.method = newMethod;
//     payment.referenceNumber = newRef;
//     payment.paidAt = newPaidDate;
//     payment.notes = `${payment.notes || ""} [CORRECTED from Rs ${oldAmount} to Rs ${newAmount}: ${reason}]`;
//     await payment.save({ session });

//     installment.amount = newAmount;
//     installment.paidAmount = newAmount;
//     installment.method = newMethod;
//     installment.referenceNumber = newRef;
//     installment.paidAt = newPaidDate;

//     // invoice.totalAmount = Math.max(0, invoice.totalAmount + diff);

//     // ── Step 4: Invoice totals recalculate karo ──
//     const totalPaid = invoice.installments.reduce(
//       (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
//     );
//     invoice.paidAmount = totalPaid;
//     invoice.remainingAmount = Math.max(0, invoice.totalAmount - totalPaid);
//     invoice.status =
//       invoice.remainingAmount === 0 ? "PAID"
//         : totalPaid > 0 ? "PARTIAL"
//           : "PENDING";

//     await invoice.save({ session });

//     // ── Step 5: NAYI (sahi) entry post karo — full new amount pe ──
//     await postPaymentJournal({
//       amount: newAmount,
//       method: newMethod,
//       paymentId: payment._id,
//       userId: req.user._id,
//       description: `Corrected payment — ${installment.label} (${invoice.invoiceNumber}): ${reason}`,
//       date: newPaidDate,
//       session,
//     });

//     await logAudit({
//       req,
//       action: "PAYMENT_CORRECTED",
//       module: "finance",
//       targetId: invoice._id,
//       before: { invoice: before, payment: beforePayment },
//       after: { invoice: invoice.toObject(), payment: payment.toObject(), oldAmount, newAmount, reason },
//     });

//     await session.commitTransaction();

//     return res.json({
//       success: true,
//       message: `Payment corrected — Rs ${oldAmount} reversed, Rs ${newAmount} reposted with accurate date`,
//       data: invoice,
//     });
//   } catch (err) {
//     await session.abortTransaction();
//     console.error("editPaidInstallment error:", err);
//     return res.status(500).json({ success: false, message: err.message });
//   } finally {
//     session.endSession();
//   }
// };

// ── EDIT A PAID INSTALLMENT (amount/date correction after payment) ──
exports.editPaidInstallment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceId, installmentId } = req.params;
    const { amount, paidDate, method, referenceNumber, notes, reason, adjustTotal } = req.body;

    if (!reason) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Reason for correction is required" });
    }

    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const installment = invoice.installments.id(installmentId);
    if (!installment)
      return res.status(404).json({ success: false, message: "Installment not found" });

    if (installment.status !== "PAID")
      return res.status(400).json({ success: false, message: "Only paid installments can be corrected" });

    const payment = await Payment.findById(installment.paymentId).session(session);
    if (!payment || payment.status !== "approved")
      return res.status(404).json({ success: false, message: "Matching payment record not found" });

    const before = invoice.toObject();
    const beforePayment = payment.toObject();

    // ── Sab naye values ek jagah, reversal se pehle hi declare kar do ──
    const oldAmount = installment.amount;
    const newAmount = amount !== undefined ? Number(amount) : oldAmount;
    const diff = newAmount - oldAmount;
    const newPaidDate = paidDate ? new Date(paidDate) : installment.paidAt;
    const newMethod = method || installment.method;
    const newRef = referenceNumber !== undefined ? referenceNumber : installment.referenceNumber;

    const isExtraFee = installment.feeType === "certificate" || installment.feeType === "manual";
    const shouldAdjustTotal = !!adjustTotal; // ✅ default false — Scenario B (payment-correction)

    // ── Scenario A: Fee khud reassess hui — invoice.totalAmount bhi adjust karo ──
    if (shouldAdjustTotal && isExtraFee && diff !== 0) {
      invoice.totalAmount = Math.max(0, invoice.totalAmount + diff);

      await postInvoiceJournal({
        amount: diff, // postInvoiceJournal ab negative diff bhi safely handle karta hai
        invoiceId: invoice._id,
        userId: req.user._id,
        description: `${installment.label} — fee reassessed, adjusting AR/Income by ${diff > 0 ? "+" : ""}${diff} (${invoice.invoiceNumber}): ${reason}`,
        date: newPaidDate,
        session,
      });
    }
    // ── Scenario B (default): Sirf collection/receipt galat thi — totalAmount untouched ──

    // ── Step 1: Purani payment journal entry reverse karo ──
    const reversed = await reverseJournalEntry({
      sourceType: "payment",
      sourceRef: payment._id,
      userId: req.user._id,
      description: `Reversal — correcting ${installment.label} (${invoice.invoiceNumber}): ${reason}`,
      session,
    });

    if (!reversed.length) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "No posted journal entry found for this payment — cannot correct safely",
      });
    }

    // ── Step 2: Payment + installment record update karo ──
    payment.amount = newAmount;
    payment.method = newMethod;
    payment.referenceNumber = newRef;
    payment.paidAt = newPaidDate;
    payment.notes = `${payment.notes || ""} [CORRECTED from Rs ${oldAmount} to Rs ${newAmount}: ${reason}]`;
    await payment.save({ session });

    installment.amount = newAmount;
    installment.paidAmount = newAmount;
    installment.method = newMethod;
    installment.referenceNumber = newRef;
    installment.paidAt = newPaidDate;

    // ── Step 3: Invoice totals recalculate karo ──
    const totalPaid = invoice.installments.reduce(
      (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
    );
    invoice.paidAmount = totalPaid;
    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - totalPaid);
    invoice.status =
      invoice.remainingAmount === 0 ? "PAID"
        : totalPaid > 0 ? "PARTIAL"
          : "PENDING";

    await invoice.save({ session });

    // ── Step 4: Nayi (sahi) payment entry post karo — full new amount pe ──
    await postPaymentJournal({
      amount: newAmount,
      method: newMethod,
      paymentId: payment._id,
      userId: req.user._id,
      description: `Corrected payment — ${installment.label} (${invoice.invoiceNumber}): ${reason}`,
      date: newPaidDate,
      session,
    });

    await logAudit({
      req,
      action: "PAYMENT_CORRECTED",
      module: "finance",
      targetId: invoice._id,
      before: { invoice: before, payment: beforePayment },
      after: {
        invoice: invoice.toObject(),
        payment: payment.toObject(),
        oldAmount,
        newAmount,
        adjustedTotal: shouldAdjustTotal,
        reason,
      },
    });

    await session.commitTransaction();

    return res.json({
      success: true,
      message: `Payment corrected — Rs ${oldAmount} reversed, Rs ${newAmount} reposted with accurate date`,
      data: invoice,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("editPaidInstallment error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

exports.voidInstallmentPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceId, installmentId } = req.params;
    const { reason, voidReason } = req.body;

    const invoice = await Invoice.findById(invoiceId).session(session);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const installment = invoice.installments.id(installmentId);
    if (!installment)
      return res.status(404).json({ success: false, message: "Installment not found" });

    if (installment.status !== "PAID")
      return res.status(400).json({ success: false, message: "Installment is not paid" });

    const before = invoice.toObject();

    const payment = await Payment.findById(installment.paymentId).session(session);
    if (!payment || payment.status !== "approved")
      return res.status(404).json({ success: false, message: "Matching payment record not found" });

    await reverseJournalEntry({
      sourceType: "payment",
      sourceRef: payment._id,
      userId: req.user._id,
      description: `Voided payment — ${installment.label} (${invoice.invoiceNumber})${reason ? ` — ${reason}` : ""}`,
      session,
    });

    payment.status = "voided";
    payment.voidedBy = req.user._id;
    payment.voidedAt = new Date();
    payment.voidReason = voidReason || "other";
    payment.notes = `${payment.notes || ""} [VOIDED: ${reason || "no reason"}]`;
    await payment.save({ session });

    installment.status = "PENDING";
    installment.paidAmount = 0;
    installment.method = null;
    installment.referenceNumber = null;
    installment.receiptUrl = null;
    installment.receiptPublicId = null;
    installment.paymentId = null; // 👈 link bhi clear karo

    // ── Certificate fee void hua? → feePaid wapas false karo ──
    if (installment.feeType === "certificate") {
      await Certificate.findOneAndUpdate(
        { enrollment: invoice.enrollment },
        { feePaid: false, feePaidAt: null },
        { session }
      );
    }

    const totalPaid = invoice.installments.reduce(
      (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0),
      0
    );

    invoice.paidAmount = totalPaid;
    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - totalPaid);
    invoice.status =
      invoice.remainingAmount === 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";

    await invoice.save({ session });

    await logAudit({
      req,
      action: "INSTALLMENT_PAYMENT_VOIDED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    await session.commitTransaction();
    res.json({ success: true, message: "Payment voided — journal entries reversed", data: invoice });
  } catch (err) {
    await session.abortTransaction();
    console.error("voidInstallmentPayment error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};

// ── DELETE / CANCEL INVOICE (soft-delete, journal-safe) ──────────
exports.deleteInvoice = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { reason } = req.body;
    const invoice = await Invoice.findById(req.params.id).session(session);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    if (invoice.status === "CANCELLED")
      return res.status(400).json({ success: false, message: "Invoice already cancelled" });

    const before = invoice.toObject();

    // ── 1. Sab approved payments reverse + void karo ──────────────
    const payments = await Payment.find({
      invoice: invoice._id,
      status: "approved",
    }).session(session);

    for (const payment of payments) {
      await reverseJournalEntry({
        sourceType: "payment",
        sourceRef: payment._id,
        userId: req.user._id,
        description: `Reversal — invoice ${invoice.invoiceNumber} cancelled`,
        session,
      });

      payment.status = "voided";
      payment.voidedBy = req.user._id;
      payment.voidedAt = new Date();
      payment.notes = `${payment.notes || ""} [VOIDED: invoice cancelled — ${reason || "no reason"}]`;
      await payment.save({ session });
    }

    // ── 2. Invoice creation journal (AR + Income) reverse karo ────
    await reverseJournalEntry({
      sourceType: "invoice",
      sourceRef: invoice._id,
      userId: req.user._id,
      description: `Reversal — invoice ${invoice.invoiceNumber} cancelled${reason ? ` — ${reason}` : ""}`,
      session,
    });

    // ── 3. Invoice + installments reset, soft-delete ──────────────
    invoice.installments.forEach((inst) => {
      inst.status = "PENDING";
      inst.paidAmount = 0;
      inst.method = null;
      inst.referenceNumber = null;
      inst.receiptUrl = null;
      inst.receiptPublicId = null;
    });
    invoice.paidAmount = 0;
    invoice.remainingAmount = 0;
    invoice.status = "CANCELLED";
    await invoice.save({ session });

    await logAudit({
      req,
      action: "INVOICE_CANCELLED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    await session.commitTransaction();
    res.json({
      success: true,
      message: `Invoice cancelled — ${payments.length} payment(s) voided, all journal entries reversed`,
      data: invoice,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("deleteInvoice error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
};
exports.deleteInstallment = async (req, res) => {
  try {
    const { invoiceId, installmentId } = req.params;

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    const installment = invoice.installments.id(installmentId);
    if (!installment)
      return res.status(404).json({ success: false, message: "Installment not found" });

    // ── Sirf PENDING + "program" type delete ho sakta hai ──
    if (installment.status === "PAID") {
      return res.status(400).json({ success: false, message: "Paid installments cannot be deleted" });
    }
    if (installment.feeType === "certificate" || installment.feeType === "manual") {
      return res.status(400).json({ success: false, message: "Certificate/manual fees cannot be deleted from here" });
    }

    const before = invoice.toObject();

    // Simple removal — totalAmount ko touch nahi karna, kyunki ye PENDING program installment hai
    invoice.installments.pull(installmentId);

    const totalPaid = invoice.installments.reduce(
      (sum, inst) => sum + (inst.status === "PAID" ? inst.amount : 0), 0
    );
    invoice.paidAmount = totalPaid;
    invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - totalPaid);
    invoice.status =
      invoice.remainingAmount === 0 && totalPaid > 0 ? "PAID"
        : totalPaid > 0 ? "PARTIAL"
          : "PENDING";

    await invoice.save();

    await logAudit({
      req,
      action: "INSTALLMENT_DELETED",
      module: "finance",
      targetId: invoice._id,
      before,
      after: invoice.toObject(),
    });

    res.json({ success: true, message: "Installment deleted", data: invoice });
  } catch (err) {
    console.error("deleteInstallment error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// controllers/invoiceController.js
// exports.sendReceivingReportEmail = async (req, res) => {
//   await connectDB();
//   const { invoiceIds, filters, recipientMode, recipientIds } = req.body;

//   const invoiceQuery = invoiceIds?.length
//     ? { _id: { $in: invoiceIds } }
//     : buildInvoiceFilterQuery(filters);

//   const invoices = await Invoice.find(invoiceQuery)
//     .populate("user", "name email phone")
//     .populate({ path: "enrollment", populate: { path: "program", select: "name" } })
//     .lean();

//   if (!invoices.length)
//     return res.status(404).json({ success: false, message: "No invoices found" });

//   let recipients;
//   if (recipientMode === "specific" && recipientIds?.length) {
//     recipients = await User.find({ _id: { $in: recipientIds }, role: { $in: ["admin", "super_admin"] } })
//       .select("email name").lean();
//   } else {
//     recipients = await User.find({ role: { $in: ["admin", "super_admin"] } })
//       .select("email name").lean();
//   }

//   if (!recipients.length)
//     return res.status(400).json({ success: false, message: "No recipients found" });

//   // ── Signed token — filters embed karo (24hr expiry) ──────
//   const exportToken = jwt.sign(
//     { invoiceIds: invoiceIds?.length ? invoiceIds : null, filters: filters || null },
//     process.env.JWT_SECRET,
//     { expiresIn: "24h" }
//   );

//   const downloadUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/invoices/receiving/export-excel?token=${exportToken}`;

//   // Summary numbers
//   const totalInvoiced   = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
//   const totalReceived   = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
//   const totalOutstanding = invoices.reduce((s, i) => s + (i.remainingAmount || 0), 0);

//   const dateRange = filters?.dateFrom && filters?.dateTo
//     ? `${new Date(filters.dateFrom).toLocaleDateString("en-PK")} – ${new Date(filters.dateTo).toLocaleDateString("en-PK")}`
//     : "All Time";

//   const invoiceRows = invoices.map((inv) => `
//     <tr style="border-bottom:1px solid #f0f2f7;">
//       <td style="padding:10px 12px;font-family:'Courier New',monospace;font-size:11px;color:#4a5060;">${inv.invoiceNumber}</td>
//       <td style="padding:10px 12px;font-size:12px;color:#0f1117;">${inv.user?.name || "—"}</td>
//       <td style="padding:10px 12px;font-size:12px;color:#4a5060;">${inv.enrollment?.program?.name || "—"}</td>
//       <td style="padding:10px 12px;text-align:right;font-family:'Courier New',monospace;font-size:12px;">Rs ${(inv.totalAmount || 0).toLocaleString()}</td>
//       <td style="padding:10px 12px;text-align:right;font-family:'Courier New',monospace;font-size:12px;color:#1a8a57;">Rs ${(inv.paidAmount || 0).toLocaleString()}</td>
//       <td style="padding:10px 12px;text-align:right;font-family:'Courier New',monospace;font-size:12px;color:#c94040;">Rs ${(inv.remainingAmount || 0).toLocaleString()}</td>
//       <td style="padding:10px 12px;text-align:center;font-size:11px;">${inv.status}</td>
//     </tr>
//   `).join("");

//   res.json({ success: true, message: `Report ${recipients.length} recipient(s) ko bheji jaa rahi hai` });

//   // ── Email background mein ─────────────────────────────────
//   Promise.allSettled(
//     recipients.map((r) =>
//       sendEmailDynamic({
//         to: r.email,
//         subject: "Receiving Report — AL&CO Finance",
//         templateName: "receiving-report-admin",
//         replacements: {
//           recipientName: r.name,
//           generatedDate: new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }),
//           dateRange,
//           invoiceCount: invoices.length,
//           invoiceRows,
//           totalInvoiced: totalInvoiced.toLocaleString(),
//           totalReceived: totalReceived.toLocaleString(),
//           totalOutstanding: totalOutstanding.toLocaleString(),
//           downloadUrl,  // ← token wala link
//         },
//       })
//     )
//   ).catch((err) => console.error("Report email error:", err));
// };
// exports.sendReceivingReportEmail = async (req, res) => {
//   try {
//     const { invoiceIds, filters, recipientMode, recipientIds } = req.body;

//     const invoiceQuery = invoiceIds?.length
//       ? { _id: { $in: invoiceIds } }
//       : buildInvoiceFilterQuery(filters || {});

//     const [invoices, recipients] = await Promise.all([
//       Invoice.find(invoiceQuery)
//         .populate("user", "name email")
//         .populate({ path: "enrollment", populate: { path: "program", select: "name" } })
//         .lean()
//         .limit(500), // ← limit lagao, sab fetch na karo
//       recipientMode === "specific" && recipientIds?.length
//         ? User.find({ _id: { $in: recipientIds }, role: { $in: ["admin", "super_admin"] } }).select("email name").lean()
//         : User.find({ role: { $in: ["admin", "super_admin"] } }).select("email name").lean(),
//     ]);

//     if (!invoices.length)
//       return res.status(404).json({ success: false, message: "No invoices found" });

//     if (!recipients.length)
//       return res.status(400).json({ success: false, message: "No recipients found" });

//     // ── Token generate ────────────────────────────────────────
//     const exportToken = jwt.sign(
//       { invoiceIds: invoiceIds?.length ? invoiceIds : null, filters: filters || null },
//       process.env.JWT_SECRET,
//       { expiresIn: "24h" }
//     );

//     const downloadUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/invoices/receiving/export-excel?token=${exportToken}`;

//     const dateRange = filters?.dateFrom && filters?.dateTo
//       ? `${new Date(filters.dateFrom).toLocaleDateString("en-PK")} – ${new Date(filters.dateTo).toLocaleDateString("en-PK")}`
//       : "All Time";

//     // ── Turant response bhejo ─────────────────────────────────
//     res.json({
//       success: true,
//       message: `Report ${recipients.length} recipient(s) ko bheji ja rahi hai`,
//     });

//     // ── Email background mein ─────────────────────────────────
//     const totalInvoiced   = invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
//     const totalReceived   = invoices.reduce((s, i) => s + (i.paidAmount || 0), 0);
//     const totalOutstanding = invoices.reduce((s, i) => s + (i.remainingAmount || 0), 0);

//     setImmediate(() => {
//       Promise.allSettled(
//         recipients.map((r) =>
//           sendEmailDynamic({
//             to: r.email,
//             subject: "Receiving Report — AL&CO Finance",
//             templateName: "receiving-report-admin",
//             replacements: {
//               recipientName: r.name,
//               generatedDate: new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }),
//               dateRange,
//               invoiceCount: invoices.length,
//               totalInvoiced: totalInvoiced.toLocaleString(),
//               totalReceived: totalReceived.toLocaleString(),
//               totalOutstanding: totalOutstanding.toLocaleString(),
//               downloadUrl,
//             },
//           })
//         )
//       ).catch((err) => console.error("Report email error:", err));
//     });

//   } catch (err) {
//     console.error("sendReceivingReportEmail error:", err);
//     if (!res.headersSent) {
//       res.status(500).json({ success: false, message: err.message });
//     }
//   }
// };

// ── Excel download endpoint ───────────────────────────────────
exports.exportReceivingExcel = async (req, res) => {
  // await connectDB();
  const { token } = req.query;

  if (!token) return res.status(400).send("Token missing");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).send("Link expired ya invalid hai");
  }

  const { invoiceIds, filters } = decoded;

  const invoiceQuery = invoiceIds?.length
    ? { _id: { $in: invoiceIds } }
    : filters?.status || filters?.dateFrom
      ? {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dateFrom || filters.dateTo ? {
          dueDate: {
            ...(filters.dateFrom ? { $gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { $lte: new Date(filters.dateTo) } : {}),
          }
        } : {})
      }
      : {};

  const invoices = await Invoice.find(invoiceQuery)
    .populate("user", "name email phone")
    .populate({ path: "enrollment", populate: { path: "program batch", select: "name" } })
    .lean();

  // ── ExcelJS workbook ──────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Receiving Invoices");

  const navy = "1A1A2E";
  const gold = "C8A84B";

  // Headers
  const columns = [
    { header: "Invoice #", key: "invoice", width: 18 },
    { header: "Student", key: "student", width: 22 },
    { header: "Email", key: "email", width: 32 },
    { header: "Program", key: "program", width: 30 },
    { header: "Batch", key: "batch", width: 20 },
    { header: "Total (Rs)", key: "total", width: 16 },
    { header: "Paid (Rs)", key: "paid", width: 16 },
    { header: "Remaining (Rs)", key: "remaining", width: 18 },
    { header: "Status", key: "status", width: 13 },
    { header: "Description", key: "desc", width: 30 },
  ];

  ws.columns = columns;

  // Header row style
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + navy } };
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFDDE2EC" } },
      bottom: { style: "thin", color: { argb: "FFDDE2EC" } },
      left: { style: "thin", color: { argb: "FFDDE2EC" } },
      right: { style: "thin", color: { argb: "FFDDE2EC" } },
    };
  });
  headerRow.height = 28;

  const statusColors = {
    PAID: { bg: "FFE6F6EC", fg: "FF1A8A57" },
    PARTIAL: { bg: "FFFFF8E1", fg: "FFB07800" },
    PENDING: { bg: "FFE8F0F8", fg: "FF1A3A5C" },
    OVERDUE: { bg: "FFFCE9E9", fg: "FFC94040" },
    BLOCKED: { bg: "FFF0F0F0", fg: "FF555555" },
    EXTENDED: { bg: "FFECE9FB", fg: "FF4B3FA8" },
  };

  const thinBorder = {
    top: { style: "thin", color: { argb: "FFDDE2EC" } },
    bottom: { style: "thin", color: { argb: "FFDDE2EC" } },
    left: { style: "thin", color: { argb: "FFDDE2EC" } },
    right: { style: "thin", color: { argb: "FFDDE2EC" } },
  };

  // Data rows
  invoices.forEach((inv, idx) => {
    const row = ws.addRow({
      invoice: inv.invoiceNumber,
      student: inv.user?.name || "—",
      email: inv.user?.email || "—",
      program: inv.enrollment?.program?.name || "—",
      batch: inv.enrollment?.batch?.name || "—",
      total: inv.totalAmount || 0,
      paid: inv.paidAmount || 0,
      remaining: inv.remainingAmount || 0,
      status: inv.status,
      desc: inv.description || "",
    });

    const rowBg = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFBFD";

    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { name: "Calibri", size: 10.5 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };

      // Currency cols
      if ([6, 7, 8].includes(colNumber)) {
        cell.numFmt = '#,##0;(#,##0);"-"';
        cell.alignment = { horizontal: "right" };
      }
      // Invoice # mono
      if (colNumber === 1) {
        cell.font = { name: "Consolas", size: 10 };
      }
      // Status badge
      if (colNumber === 9) {
        const sc = statusColors[inv.status] || { bg: "FFF4F6FB", fg: "FF555555" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc.bg } };
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: sc.fg } };
        cell.alignment = { horizontal: "center" };
      }
    });

    row.height = 20;
  });

  // Totals row
  const dataStart = 2;
  const dataEnd = ws.lastRow.number;
  const totalRow = ws.addRow({
    program: "TOTAL",
    total: { formula: `SUM(F${dataStart}:F${dataEnd})` },
    paid: { formula: `SUM(G${dataStart}:G${dataEnd})` },
    remaining: { formula: `SUM(H${dataStart}:H${dataEnd})` },
  });

  totalRow.eachCell((cell, col) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF" + navy } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
    cell.border = { ...thinBorder, top: { style: "medium", color: { argb: "FF" + navy } } };
    if ([6, 7, 8].includes(col)) {
      cell.numFmt = '#,##0;(#,##0);"-"';
      cell.alignment = { horizontal: "right" };
    }
    if (col === 4) cell.alignment = { horizontal: "right" };
  });
  totalRow.height = 22;

  // Freeze + autofilter
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `J${dataEnd}` };

  // ── Send as download ──────────────────────────────────────
  const date = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="receiving-report-${date}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
};

// ─────────────────────────────────────────────
// PAYMENT MANAGEMENT
// ─────────────────────────────────────────────

// ADD PAYMENT (offline / manual)
exports.addPayment = async (req, res) => {
  try {
    const { invoice, enrollment, user, amount, method, referenceNumber, notes } = req.body;

    if (!invoice || !enrollment || !user || !amount || !method) {
      return res.status(400).json({ success: false, message: "invoice, enrollment, user, amount, method are required" });
    }

    const payment = await Payment.create({
      invoice,
      enrollment,
      user,
      amount,
      method,
      referenceNumber,
      notes,
      receivedBy: req.user.id,
      status: "pending",
    });

    await logAudit({
      req,
      action: "PAYMENT_ADDED",
      module: "finance",
      targetId: payment._id,
      after: payment.toObject(),
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET ALL PAYMENTS (with filters)
// exports.getAllPayments = async (req, res) => {
//   try {
//     const { status, method, userId, page = 1, limit = 10 } = req.query;

//     const filter = {};
//     if (status) filter.status = status;
//     if (method) filter.method = method;
//     if (userId) filter.user = userId;

//     const payments = await Payment.find(filter)
//       .populate("user", "name email")
//       .populate("invoice", "totalAmount status")
//       .populate("enrollment")
//       .populate("receivedBy", "name")
//       .populate("approvedBy", "name")
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * limit)
//       .limit(Number(limit));

//     const total = await Payment.countDocuments(filter);

//     res.json({
//       success: true,
//       data: payments,
//       meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// GET ALL PAYMENTS (with filters)
// GET ALL PAYMENTS (with filters)
exports.getAllPayments = async (req, res) => {
  try {
    const {
      status,
      method,
      userId,
      search,
      dateFrom,
      dateTo,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (userId) filter.user = userId;

    // 👇 naya — Student name/email se search (getAllInvoices jaisa pattern)
    if (search) {
      const matchedUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");
      filter.user = { $in: matchedUsers.map((u) => u._id) };
    }

    // Date filter runs on paidAt (not createdAt)
    if (dateFrom || dateTo) {
      filter.paidAt = {};
      if (dateFrom) filter.paidAt.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        filter.paidAt.$lte = end;
      }
    }

    const payments = await Payment.find(filter)
      .populate("user", "name email")
      .populate("invoice", "totalAmount status invoiceNumber")
      .populate("enrollment")
      .populate("receivedBy", "name")
      .populate("approvedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Payment.countDocuments(filter);

    // Aggregate total amount for the SAME filter (not just current page)
    const totalAmountAgg = await Payment.aggregate([
      { $match: filter },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);
    const totalAmount = totalAmountAgg[0]?.totalAmount || 0;

    res.json({
      success: true,
      data: payments,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit),
        totalAmount,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET SINGLE PAYMENT
exports.getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate("user", "name email")
      .populate("invoice")
      .populate("enrollment");

    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    res.json({ success: true, data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── approvePayment — FIXED (advancePaid scope issue) ────────────────────────
exports.approvePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
    if (payment.status === "approved") return res.status(400).json({ success: false, message: "Already approved" });

    const before = payment.toObject();

    payment.status = "approved";
    payment.approvedBy = req.user.id;
    payment.approvedAt = new Date();
    await payment.save();

    // ── Invoice update ────────────────────────────────────────
    let advancePaid = false; // ✅ scope fix — upar declare karo

    const invoice = await Invoice.findById(payment.invoice);
    if (invoice) {
      invoice.paidAmount = (invoice.paidAmount || 0) + payment.amount;
      invoice.remainingAmount = Math.max(0, getNetAmount(invoice) - invoice.paidAmount);
      invoice.status =
        invoice.remainingAmount === 0 ? "PAID"
          : invoice.paidAmount > 0 ? "PARTIAL"
            : invoice.status;

      // Matching installment mark karo
      const matchingInst = invoice.installments.find(
        (inst) => inst.status === "PENDING" && Number(inst.amount) === Number(payment.amount)
      );
      if (matchingInst) {
        matchingInst.status = "PAID";
        matchingInst.paidAmount = payment.amount;
      }

      await invoice.save();

      // Advance paid? → Enrollment ACTIVE
      const advanceInst = invoice.installments.find((inst) => inst.isAdvance === true);
      advancePaid = advanceInst?.status === "PAID";

      if (advancePaid) {
        await Enrollment.findByIdAndUpdate(invoice.enrollment, { accessStatus: "ACTIVE" });

        await logAudit({
          req,
          action: "ENROLLMENT_ACTIVATED_ADVANCE_PAID",
          module: "finance",
          targetId: invoice.enrollment,
          after: { accessStatus: "ACTIVE" },
        });
      }
    }

    await logAudit({
      req,
      action: "PAYMENT_APPROVED",
      module: "finance",
      targetId: payment._id,
      before,
      after: payment.toObject(),
    });

    res.json({
      success: true,
      message: advancePaid ? "Payment approved — Enrollment activated!" : "Payment approved",
      data: payment,
      enrollmentActivated: advancePaid,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// REJECT PAYMENT
exports.rejectPayment = async (req, res) => {
  try {
    const { reason } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });

    const before = payment.toObject();

    payment.status = "rejected";
    payment.rejectedBy = req.user.id;
    payment.rejectedAt = new Date();
    payment.rejectionReason = reason || "No reason provided";
    await payment.save();

    await logAudit({
      req,
      action: "PAYMENT_REJECTED",
      module: "finance",
      targetId: payment._id,
      before,
      after: payment.toObject(),
    });

    res.json({ success: true, message: "Payment rejected", data: payment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// EDIT PAYMENT
exports.updatePayment = async (req, res) => {
  try {
    const before = await Payment.findById(req.params.id).lean();
    if (!before) return res.status(404).json({ success: false, message: "Payment not found" });

    const updated = await Payment.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    await logAudit({
      req,
      action: "PAYMENT_UPDATED",
      module: "finance",
      targetId: updated._id,
      before,
      after: updated.toObject(),
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// INSTALLMENT MONITORING
// ─────────────────────────────────────────────

// PENDING INVOICES
exports.getPendingPayments = async (req, res) => {
  try {
    const invoices = await Invoice.find({ status: { $in: ["PENDING", "PARTIAL"] } })
      .populate("user", "name email phone")
      .populate("enrollment")
      .sort({ dueDate: 1 });

    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// OVERDUE INVOICES
exports.getOverduePayments = async (req, res) => {
  try {
    const invoices = await Invoice.find({
      status: { $in: ["OVERDUE", "PENDING", "PARTIAL"] },
      dueDate: { $lt: new Date() },
    })
      .populate("user", "name email phone")
      .populate("enrollment")
      .sort({ dueDate: 1 });

    res.json({ success: true, count: invoices.length, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPCOMING DUES (next N days)
exports.getUpcomingDues = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invoices = await Invoice.find({
      status: { $in: ["PENDING", "PARTIAL"] },
      dueDate: { $gte: now, $lte: future },
    })
      .populate("user", "name email phone")
      .populate("enrollment")
      .sort({ dueDate: 1 });

    res.json({ success: true, count: invoices.length, daysAhead: days, data: invoices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// FINANCE EXTENSION
// ─────────────────────────────────────────────

exports.addFinanceExtension = async (req, res) => {
  try {
    const { enrollmentId, days, reason } = req.body;

    if (!enrollmentId || !days) {
      return res.status(400).json({ success: false, message: "enrollmentId and days are required" });
    }

    const before = await Enrollment.findById(enrollmentId).lean();
    if (!before) return res.status(404).json({ success: false, message: "Enrollment not found" });

    const enrollment = await Enrollment.findByIdAndUpdate(
      enrollmentId,
      {
        financeExtension: {
          durationDays: days,
          reason: reason || "",
          approvedBy: req.user.id,
          newDueDate: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        },
      },
      { new: true }
    );

    await logAudit({
      req,
      action: "FINANCE_EXTENSION_ADDED",
      module: "finance",
      targetId: enrollmentId,
      before,
      after: enrollment.toObject(),
    });

    res.json({ success: true, message: "Finance extension applied", data: enrollment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// REPORTS & ANALYTICS
// ─────────────────────────────────────────────

// TOTAL REVENUE SUMMARY
exports.getRevenueReport = async (req, res) => {
  try {
    const summary = await Invoice.aggregate([
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          grossRevenue: { $sum: "$totalAmount" },
          totalDiscount: { $sum: "$discountAmount" },
          netRevenue: {
            $sum: {
              $subtract: [
                "$totalAmount",
                { $ifNull: ["$discountAmount", 0] }
              ]
            }
          },
          totalCollected: { $sum: "$paidAmount" },
        }
      }
    ]);

    const byStatus = await Invoice.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$totalAmount" } } },
    ]);

    res.json({
      success: true,
      data: {
        summary: summary[0] || { totalRevenue: 0, totalCollected: 0, totalPending: 0, totalInvoices: 0 },
        byStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// MONTHLY COLLECTIONS
exports.getMonthlyCollections = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const monthly = await Payment.aggregate([
      {
        $match: {
          status: "approved",
        },
      },
      {
        // ✅ paidAt use karo, agar missing ho to createdAt fallback
        $addFields: {
          effectiveDate: { $ifNull: ["$paidAt", "$createdAt"] },
        },
      },
      {
        $match: {
          effectiveDate: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$effectiveDate" } }, // 👈 paidAt/effectiveDate se group
          totalCollected: { $sum: "$amount" },
          paymentCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);

    const result = Array.from({ length: 12 }, (_, i) => {
      const found = monthly.find((m) => m._id.month === i + 1);
      return {
        month: i + 1,
        monthName: new Date(year, i, 1).toLocaleString("default", { month: "long" }),
        totalCollected: found ? found.totalCollected : 0,
        paymentCount: found ? found.paymentCount : 0,
      };
    });

    res.json({ success: true, year, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PENDING PAYMENTS REPORT
exports.getPendingReport = async (req, res) => {
  try {
    const overdue = await Invoice.find({
      status: { $in: ["OVERDUE", "PENDING", "PARTIAL"] },
    })
      .populate("user", "name email phone")
      .populate({ path: "enrollment", populate: { path: "program", select: "name" } })
      .sort({ dueDate: 1 });

    const totalOutstanding = overdue.reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);

    res.json({
      success: true,
      data: { totalOutstanding, count: overdue.length, invoices: overdue },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/finance/invoices/my — Student apni invoices dekhe
exports.getMyInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ user: req.user.id })
      .populate("user", "name email phone documents")
      .populate({
        path: "enrollment",
        populate: [
          { path: "program", select: "name short_description" },
          { path: "batch", select: "start_date name" }
        ]
      })
      .sort({ createdAt: -1 });

    // Har invoice ke saath payments bhi attach karo
    const result = await Promise.all(
      invoices.map(async (inv) => {
        const payments = await Payment.find({
          invoice: inv._id,
          status: "approved",
        }).select("amount method referenceNumber paidAt createdAt").sort({ paidAt: -1 });

        return { ...inv.toObject(), payments };
      })
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("user", "name email phone")
      .populate({
        path: "enrollment",
        populate: [
          { path: "program", select: "name" },
          { path: "batch", select: "name start_date end_date" },
        ],
      });

    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    // ✅ AUTHORIZATION CHECK — yahan rakho
    if (req.user.role === "user" && invoice.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const user = invoice.user;
    const program = invoice.enrollment?.program;

    const formatDate = (d) =>
      d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

    const quantity =
      invoice.enrollment?.bundle?.courses?.length ||
      invoice.enrollment?.courses?.length ||
      1;

    const installmentRows = invoice.installments
      .map((inst, i) => {
        const isAdv = inst.isAdvance;
        const isPaid = inst.status === "PAID";
        return `
    <tr style="background:${isAdv ? "#fdf6e3" : "#ffffff"}; border-bottom:1px solid #dde2ec;">
      <td style="padding:13px 16px; font-size:11px; color:#8a92a6;">${String(i + 1).padStart(2, "0")}</td>
      <td style="padding:13px 16px; font-size:13px; color:#0f1117; font-weight:700;">
        ${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}
        ${isAdv ? `<span style="background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>` : ""}
      </td>
      <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${quantity}</td>
      <td style="padding:13px 16px; font-size:11.5px; color:#4a5060; text-transform:capitalize;">${inst.method || "—"}</td>
      <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${inst.referenceNumber || "—"}</td>
      <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${formatDate(inst.dueDate)}</td>
      <td style="padding:13px 16px;">
        <span style="font-size:9.5px; font-weight:700; padding:3px 9px; border-radius:5px;
          background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
          ${inst.status}
        </span>
      </td>
      <td style="padding:13px 16px; text-align:right; font-weight:600; font-size:13px;">
        Rs ${formatAmount(inst.amount)}
      </td>
    </tr>`;
      })
      .join("");

    const contractDetails = invoice.enrollment?.leadSnapshot?.contractDetails;

    const grossAmount = invoice.totalAmount || 0;
    const discountAmount = invoice.discountAmount || 0;
    const netAmount = Math.max(0, grossAmount - discountAmount);

    const discountRow = discountAmount > 0
      ? `<tr style="border-bottom:1px solid #dde2ec;">
      <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Discount</td>
      <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#c94040;font-size:13px;">- Rs ${formatAmount(discountAmount)}</td>
    </tr>`
      : "";

    await sendEmailDynamic({
      to: user.email,
      subject: `Invoice Reminder: ${invoice.invoiceNumber} | ALCO`,
      templateName: "send-invoice",
      replacements: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceStatus: invoice.status,
        issueDate: formatDate(new Date()),
        advanceDueDate: formatDate(invoice.dueDate),
        enrollmentId:
          invoice.enrollment?._id?.toString().slice(0, 8) +
          "..." +
          invoice.enrollment?._id?.toString().slice(-4),
        studentName: user.name,
        studentEmail: user.email,
        studentPhone: user.phone || "—",
        salesManagerName: "Finance Team",
        salesManagerEmail: "finance@alco.com",
        batchName: invoice.enrollment?.batch?.name || "—",
        batchStartDate: formatDate(invoice.enrollment?.batch?.start_date),
        batchEndDate: formatDate(invoice.enrollment?.batch?.end_date),
        studentCnic: contractDetails?.cnic || "—",
        studentAddress: contractDetails?.currentAddress || "—",
        studentProfession: contractDetails?.occupation || "—",
        programName: program?.name || "Program",
        planNotes: invoice.notes || "",
        installmentRows,
        totalAmount: formatAmount(grossAmount),
        discountAmount: formatAmount(discountAmount),
        netAmount: formatAmount(netAmount),
        discountRow,
        paidAmount: formatAmount(invoice.paidAmount || 0),
        remainingAmount: formatAmount(invoice.remainingAmount || invoice.totalAmount),
        advanceAmount: formatAmount(
          invoice.installments.find((i) => i.isAdvance)?.amount || 0
        ),
      },
    });

    await logAudit({
      req,
      action: "INVOICE_EMAIL_SENT",
      module: "finance",
      targetId: invoice._id,
      after: { sentTo: user.email, sentAt: new Date() },
    });

    res.json({
      success: true,
      message: `Invoice email ${user.email} ko bhej diya gaya`,
    });
  } catch (err) {
    console.error("sendInvoiceEmail error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.sendReceivingReportEmail = async (req, res) => {
  try {
    const { invoiceIds, filters, recipientMode, recipientIds } = req.body;

    const buildInvoiceQuery = (f = {}) => ({
      ...(f.status ? { status: f.status } : {}),
      ...(f.dateFrom || f.dateTo ? {
        dueDate: {
          ...(f.dateFrom ? { $gte: new Date(f.dateFrom) } : {}),
          ...(f.dateTo ? { $lte: new Date(f.dateTo) } : {}),
        }
      } : {}),
    });

    const invoiceQuery = invoiceIds?.length
      ? { _id: { $in: invoiceIds } }
      : buildInvoiceQuery(filters || {});

    const [invoices, recipients] = await Promise.all([
      Invoice.find(invoiceQuery)
        .populate("user", "name email")
        .populate({ path: "enrollment", populate: { path: "program", select: "name" } })
        .lean().limit(500),
      recipientMode === "specific" && recipientIds?.length
        ? User.find({ _id: { $in: recipientIds }, role: { $in: ["admin", "super_admin"] } }).select("email name").lean()
        : User.find({ role: { $in: ["admin", "super_admin"] } }).select("email name").lean(),
    ]);

    if (!invoices.length)
      return res.status(404).json({ success: false, message: "No invoices found" });
    if (!recipients.length)
      return res.status(400).json({ success: false, message: "No recipients found" });

    const exportToken = jwt.sign(
      { invoiceIds: invoiceIds?.length ? invoiceIds : null, filters: filters || null },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // const downloadUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/invoices/receiving/export-excel?token=${exportToken}`;
    const excelUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/invoices/receiving/export-excel?token=${exportToken}`;
    const pdfUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/invoices/receiving/export-pdf?token=${exportToken}`;
    const dateRange = filters?.dateFrom && filters?.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString("en-PK")} – ${new Date(filters.dateTo).toLocaleDateString("en-PK")}`
      : "All Time";

    res.json({ success: true, message: `Report ${recipients.length} recipient(s) ko bheji ja rahi hai` });

    setImmediate(() => {
      Promise.allSettled(
        recipients.map((r) =>
          sendEmailDynamic({
            to: r.email,
            subject: "Receiving Report — AL&CO Finance",
            templateName: "receiving-report-admin",
            replacements: {
              recipientName: r.name,
              generatedDate: new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }),
              dateRange,
              invoiceCount: invoices.length,
              excelUrl,
              pdfUrl
            },
          })
        )
      ).catch((err) => console.error("Report email error:", err));
    });

  } catch (err) {
    console.error("sendReceivingReportEmail error:", err);
    if (!res.headersSent)
      res.status(500).json({ success: false, message: err.message });
  }
};

// ── Shared: build a Payment mongo filter from query/body filters ──
function buildPaymentFilterQuery(f = {}) {
  const filter = {};
  if (f.status) filter.status = f.status;
  if (f.method) filter.method = f.method;
  if (f.userId) filter.user = f.userId;

  if (f.dateFrom || f.dateTo) {
    filter.paidAt = {};
    if (f.dateFrom) filter.paidAt.$gte = new Date(f.dateFrom);
    if (f.dateTo) {
      const end = new Date(f.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.paidAt.$lte = end;
    }
  }
  return filter;
}

// ── 1. TRIGGER EMAIL — sends admins a report with Excel + PDF links ──
exports.sendPaymentsReportEmail = async (req, res) => {
  try {
    const { paymentIds, filters, recipientMode, recipientIds } = req.body;

    const paymentQuery = paymentIds?.length
      ? { _id: { $in: paymentIds } }
      : buildPaymentFilterQuery(filters || {});

    const [payments, recipients] = await Promise.all([
      Payment.find(paymentQuery)
        .populate("user", "name email")
        .populate("receivedBy", "name")
        .lean()
        .limit(500),
      recipientMode === "specific" && recipientIds?.length
        ? User.find({ _id: { $in: recipientIds }, role: { $in: ["admin", "super_admin"] } }).select("email name").lean()
        : User.find({ role: { $in: ["admin", "super_admin"] } }).select("email name").lean(),
    ]);

    if (!payments.length)
      return res.status(404).json({ success: false, message: "No payments found" });
    if (!recipients.length)
      return res.status(400).json({ success: false, message: "No recipients found" });

    // ── Signed token — 24hr expiry, embeds the same filter set ──
    const exportToken = jwt.sign(
      { paymentIds: paymentIds?.length ? paymentIds : null, filters: filters || null },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    const excelUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/payments/report/export-excel?token=${exportToken}`;
    const pdfUrl = `${process.env.BACKEND_BASE_URL}/api/v1/finance/payments/report/export-pdf?token=${exportToken}`;

    const dateRange = filters?.dateFrom && filters?.dateTo
      ? `${new Date(filters.dateFrom).toLocaleDateString("en-PK")} – ${new Date(filters.dateTo).toLocaleDateString("en-PK")}`
      : "All Time";

    const totalAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);

    // ── Respond immediately, email goes out in background ──
    res.json({ success: true, message: `Report ${recipients.length} recipient(s) ko bheji ja rahi hai` });

    setImmediate(() => {
      Promise.allSettled(
        recipients.map((r) =>
          sendEmailDynamic({
            to: r.email,
            subject: "Payments Report — AL&CO Finance",
            templateName: "payments-report-admin", // 👈 naya template banana hoga
            replacements: {
              recipientName: r.name,
              generatedDate: new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }),
              dateRange,
              paymentCount: payments.length,
              totalAmount: totalAmount.toLocaleString(),
              excelUrl,
              pdfUrl,
            },
          })
        )
      ).catch((err) => console.error("Payments report email error:", err));
    });
  } catch (err) {
    console.error("sendPaymentsReportEmail error:", err);
    if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
  }
};

// ── 2. EXCEL DOWNLOAD (token-based, no auth middleware) ──
exports.exportPaymentsExcel = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Token missing");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).send("Link expired ya invalid hai");
  }

  const { paymentIds, filters } = decoded;
  const paymentQuery = paymentIds?.length
    ? { _id: { $in: paymentIds } }
    : buildPaymentFilterQuery(filters || {});

  const payments = await Payment.find(paymentQuery)
    .populate("user", "name email")
    .populate("receivedBy", "name")
    .populate("approvedBy", "name")
    .lean();

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Payments");

  const navy = "1A1A2E";

  ws.columns = [
    { header: "Student", key: "student", width: 22 },
    { header: "Email", key: "email", width: 32 },
    { header: "Amount (Rs)", key: "amount", width: 16 },
    { header: "Method", key: "method", width: 14 },
    { header: "Reference #", key: "ref", width: 20 },
    { header: "Status", key: "status", width: 13 },
    { header: "Received By", key: "receivedBy", width: 20 },
    { header: "Paid At", key: "paidAt", width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + navy } };
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  headerRow.height = 28;

  const statusColors = {
    approved: { bg: "FFE6F6EC", fg: "FF1A8A57" },
    pending: { bg: "FFFFF8E1", fg: "FFB07800" },
    rejected: { bg: "FFFCE9E9", fg: "FFC94040" },
  };
  const thinBorder = {
    top: { style: "thin", color: { argb: "FFDDE2EC" } },
    bottom: { style: "thin", color: { argb: "FFDDE2EC" } },
    left: { style: "thin", color: { argb: "FFDDE2EC" } },
    right: { style: "thin", color: { argb: "FFDDE2EC" } },
  };

  payments.forEach((p, idx) => {
    const row = ws.addRow({
      student: p.user?.name || "—",
      email: p.user?.email || "—",
      amount: p.amount || 0,
      method: p.method || "—",
      ref: p.referenceNumber || "—",
      status: p.status,
      receivedBy: p.receivedBy?.name || "—",
      paidAt: p.paidAt ? new Date(p.paidAt).toLocaleDateString("en-PK") : "—",
    });

    const rowBg = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFBFD";
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { name: "Calibri", size: 10.5 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };

      if (colNumber === 3) {
        cell.numFmt = '#,##0;(#,##0);"-"';
        cell.alignment = { horizontal: "right" };
      }
      if (colNumber === 6) {
        const sc = statusColors[p.status] || { bg: "FFF4F6FB", fg: "FF555555" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc.bg } };
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: sc.fg } };
        cell.alignment = { horizontal: "center" };
      }
    });
    row.height = 20;
  });

  const dataStart = 2;
  const dataEnd = ws.lastRow.number;
  const totalRow = ws.addRow({
    student: "TOTAL",
    amount: { formula: `SUM(C${dataStart}:C${dataEnd})` },
  });
  totalRow.eachCell((cell, col) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF" + navy } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
    cell.border = { ...thinBorder, top: { style: "medium", color: { argb: "FF" + navy } } };
    if (col === 3) {
      cell.numFmt = '#,##0;(#,##0);"-"';
      cell.alignment = { horizontal: "right" };
    }
  });
  totalRow.height = 22;

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `H${dataEnd}` };

  const date = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="payments-report-${date}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
};

// ── 3. PDF DOWNLOAD (token-based, no auth middleware) ──
exports.exportPaymentsPdf = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Token missing");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).send("Link expired ya invalid hai");
  }

  const { paymentIds, filters } = decoded;
  const paymentQuery = paymentIds?.length
    ? { _id: { $in: paymentIds } }
    : buildPaymentFilterQuery(filters || {});

  const payments = await Payment.find(paymentQuery)
    .populate("user", "name email")
    .populate("receivedBy", "name")
    .lean();

  const date = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="payments-report-${date}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.pipe(res);

  // ── Header ──
  doc.fontSize(16).fillColor("#1A1A2E").text("Payments Report", { align: "left" });
  doc.fontSize(9).fillColor("#8a92a6")
    .text(`Generated on ${new Date().toLocaleDateString("en-PK")} — ${payments.length} payment(s)`);
  doc.moveDown(1);

  // ── Table setup ──
  const cols = [
    { label: "Student", width: 140, key: (p) => p.user?.name || "—" },
    { label: "Email", width: 180, key: (p) => p.user?.email || "—" },
    { label: "Amount (Rs)", width: 100, key: (p) => Number(p.amount || 0).toLocaleString(), align: "right" },
    { label: "Method", width: 80, key: (p) => p.method || "—" },
    { label: "Reference #", width: 110, key: (p) => p.referenceNumber || "—" },
    { label: "Status", width: 80, key: (p) => p.status },
    { label: "Received By", width: 100, key: (p) => p.receivedBy?.name || "—" },
  ];

  const tableLeft = 40;
  let y = doc.y + 5;
  const rowHeight = 22;

  const drawHeader = () => {
    doc.rect(tableLeft, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill("#1A1A2E");
    let x = tableLeft;
    doc.fontSize(9).fillColor("#FFFFFF");
    cols.forEach((c) => {
      doc.text(c.label, x + 6, y + 6, { width: c.width - 12, align: c.align || "left" });
      x += c.width;
    });
    y += rowHeight;
  };

  drawHeader();

  let total = 0;
  payments.forEach((p, idx) => {
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      drawHeader();
    }
    if (idx % 2 === 1) {
      doc.rect(tableLeft, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill("#FAFBFD");
    }
    let x = tableLeft;
    doc.fontSize(8.5).fillColor("#0f1117");
    cols.forEach((c) => {
      doc.text(c.key(p), x + 6, y + 6, { width: c.width - 12, align: c.align || "left" });
      x += c.width;
    });
    total += Number(p.amount || 0);
    y += rowHeight;
  });

  // ── Totals row ──
  doc.rect(tableLeft, y, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill("#F4F6FB");
  doc.fontSize(9).fillColor("#1A1A2E");
  doc.text("TOTAL", tableLeft + 6, y + 6, { width: cols[0].width - 12 });
  doc.text(total.toLocaleString(), tableLeft + cols[0].width + cols[1].width + 6, y + 6, {
    width: cols[2].width - 12, align: "right",
  });

  doc.end();
};

// ── Excel download endpoint ───────────────────────────────────
// exports.exportReceivingExcel = async (req, res) => {
//   await connectDB();
//   const { token } = req.query;

//   if (!token) return res.status(400).send("Token missing");

//   let decoded;
//   try {
//     decoded = jwt.verify(token, process.env.JWT_SECRET);
//   } catch {
//     return res.status(401).send("Link expired ya invalid hai");
//   }

//   const { invoiceIds, filters } = decoded;

//   const invoiceQuery = invoiceIds?.length
//     ? { _id: { $in: invoiceIds } }
//     : buildInvoiceFilterQuery(filters || {});

//   const invoices = await Invoice.find(invoiceQuery)
//     .populate("user", "name email phone")
//     .populate({ path: "enrollment", populate: { path: "program batch", select: "name" } })
//     .lean();

//   // ── ExcelJS workbook ──────────────────────────────────────
//   const workbook = new ExcelJS.Workbook();
//   const ws = workbook.addWorksheet("Receiving Invoices");

//   const navy = "1A1A2E";
//   const gold = "C8A84B";

//   // Headers
//   const columns = [
//     { header: "Invoice #",        key: "invoice",    width: 18 },
//     { header: "Student",          key: "student",    width: 22 },
//     { header: "Email",            key: "email",      width: 32 },
//     { header: "Program",          key: "program",    width: 30 },
//     { header: "Batch",            key: "batch",      width: 20 },
//     { header: "Total (Rs)",       key: "total",      width: 16 },
//     { header: "Paid (Rs)",        key: "paid",       width: 16 },
//     { header: "Remaining (Rs)",   key: "remaining",  width: 18 },
//     { header: "Status",           key: "status",     width: 13 },
//     { header: "Description",      key: "desc",       width: 30 },
//   ];

//   ws.columns = columns;

//   // Header row style
//   const headerRow = ws.getRow(1);
//   headerRow.eachCell((cell) => {
//     cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + navy } };
//     cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
//     cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
//     cell.border = {
//       top: { style: "thin", color: { argb: "FFDDE2EC" } },
//       bottom: { style: "thin", color: { argb: "FFDDE2EC" } },
//       left: { style: "thin", color: { argb: "FFDDE2EC" } },
//       right: { style: "thin", color: { argb: "FFDDE2EC" } },
//     };
//   });
//   headerRow.height = 28;

//   const statusColors = {
//     PAID:     { bg: "FFE6F6EC", fg: "FF1A8A57" },
//     PARTIAL:  { bg: "FFFFF8E1", fg: "FFB07800" },
//     PENDING:  { bg: "FFE8F0F8", fg: "FF1A3A5C" },
//     OVERDUE:  { bg: "FFFCE9E9", fg: "FFC94040" },
//     BLOCKED:  { bg: "FFF0F0F0", fg: "FF555555" },
//     EXTENDED: { bg: "FFECE9FB", fg: "FF4B3FA8" },
//   };

//   const thinBorder = {
//     top: { style: "thin", color: { argb: "FFDDE2EC" } },
//     bottom: { style: "thin", color: { argb: "FFDDE2EC" } },
//     left: { style: "thin", color: { argb: "FFDDE2EC" } },
//     right: { style: "thin", color: { argb: "FFDDE2EC" } },
//   };

//   // Data rows
//   invoices.forEach((inv, idx) => {
//     const row = ws.addRow({
//       invoice:   inv.invoiceNumber,
//       student:   inv.user?.name || "—",
//       email:     inv.user?.email || "—",
//       program:   inv.enrollment?.program?.name || "—",
//       batch:     inv.enrollment?.batch?.name || "—",
//       total:     inv.totalAmount || 0,
//       paid:      inv.paidAmount || 0,
//       remaining: inv.remainingAmount || 0,
//       status:    inv.status,
//       desc:      inv.description || "",
//     });

//     const rowBg = idx % 2 === 0 ? "FFFFFFFF" : "FFFAFBFD";

//     row.eachCell((cell, colNumber) => {
//       cell.border = thinBorder;
//       cell.font = { name: "Calibri", size: 10.5 };
//       cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };

//       // Currency cols
//       if ([6, 7, 8].includes(colNumber)) {
//         cell.numFmt = '#,##0;(#,##0);"-"';
//         cell.alignment = { horizontal: "right" };
//       }
//       // Invoice # mono
//       if (colNumber === 1) {
//         cell.font = { name: "Consolas", size: 10 };
//       }
//       // Status badge
//       if (colNumber === 9) {
//         const sc = statusColors[inv.status] || { bg: "FFF4F6FB", fg: "FF555555" };
//         cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sc.bg } };
//         cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: sc.fg } };
//         cell.alignment = { horizontal: "center" };
//       }
//     });

//     row.height = 20;
//   });

//   // Totals row
//   const dataStart = 2;
//   const dataEnd   = ws.lastRow.number;
//   const totalRow  = ws.addRow({
//     program:   "TOTAL",
//     total:     { formula: `SUM(F${dataStart}:F${dataEnd})` },
//     paid:      { formula: `SUM(G${dataStart}:G${dataEnd})` },
//     remaining: { formula: `SUM(H${dataStart}:H${dataEnd})` },
//   });

//   totalRow.eachCell((cell, col) => {
//     cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF" + navy } };
//     cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
//     cell.border = { ...thinBorder, top: { style: "medium", color: { argb: "FF" + navy } } };
//     if ([6, 7, 8].includes(col)) {
//       cell.numFmt = '#,##0;(#,##0);"-"';
//       cell.alignment = { horizontal: "right" };
//     }
//     if (col === 4) cell.alignment = { horizontal: "right" };
//   });
//   totalRow.height = 22;

//   // Freeze + autofilter
//   ws.views = [{ state: "frozen", ySplit: 1 }];
//   ws.autoFilter = { from: "A1", to: `J${dataEnd}` };

//   // ── Send as download ──────────────────────────────────────
//   const date = new Date().toISOString().split("T")[0];
//   res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//   res.setHeader("Content-Disposition", `attachment; filename="receiving-report-${date}.xlsx"`);

//   await workbook.xlsx.write(res);
//   res.end();
// };

exports.sendReceivingInvoiceEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { sendAll, installmentId } = req.body; // ← this was never being read before

    const invoice = await Invoice.findById(id)
      .populate("user", "name email phone")
      .populate({
        path: "enrollment",
        populate: [
          { path: "program", select: "name" },
          { path: "batch", select: "name start_date end_date" },
        ],
      });

    if (!invoice)
      return res.status(404).json({ success: false, message: "Invoice not found" });

    // ── Only the installment(s) THIS receipt is for ──────────────
    let selectedInstallments;
    if (sendAll) {
      selectedInstallments = invoice.installments.filter((i) => i.status === "PAID");
    } else {
      if (!installmentId) {
        return res.status(400).json({ success: false, message: "installmentId required when sendAll is false" });
      }
      const found = invoice.installments.id(installmentId); // subdoc lookup, same pattern used elsewhere in this file
      if (!found) {
        return res.status(404).json({ success: false, message: "Installment not found on this invoice" });
      }
      if (found.status !== "PAID") {
        return res.status(400).json({ success: false, message: "Selected installment is not paid yet" });
      }
      selectedInstallments = [found];
    }

    if (!selectedInstallments.length) {
      return res.status(400).json({ success: false, message: "No paid installment(s) to receipt" });
    }

    const user = invoice.user;
    const program = invoice.enrollment?.program;

    const formatDate = (d) =>
      d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

    // ← was invoice.installments.map(...) — now only the selected ones
    const installmentRows = selectedInstallments
      .map((inst, i) => {
        const isAdv = inst.isAdvance;
        const receiptCell = inst.receiptUrl
          ? `<a href="${inst.receiptUrl}" target="_blank" style="color:#1a3a5c;font-size:11.5px;font-weight:700;text-decoration:none;border-bottom:1px solid #c8a84b;">View Receipt</a>`
          : `<span style="color:#8a92a6;font-size:11.5px;">—</span>`;

        return `
    <tr style="border-bottom:1px solid #dde2ec;">
      <td style="padding:13px 16px;font-size:13px;color:#0f1117;font-weight:700;">
        ${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}
      </td>
      <td style="padding:13px 16px;font-size:13px;color:#4a5060;text-transform:capitalize;">${inst.method || "—"}</td>
      <td style="padding:13px 16px;font-family:'Courier New',monospace;font-size:12px;color:#4a5060;">${inst.referenceNumber || "—"}</td>
      <td style="padding:13px 16px;font-family:'Courier New',monospace;font-size:11.5px;color:#4a5060;">${formatDate(inst.paidAt || inst.dueDate)}</td>
      <td style="padding:13px 16px;text-align:center;">${receiptCell}</td>
      <td style="padding:13px 16px;text-align:right;font-family:'Courier New',monospace;font-weight:600;font-size:13.5px;">Rs ${formatAmount(inst.paidAmount ?? inst.amount)}</td>
    </tr>`;
      })
      .join("");

    const receiptTotal = selectedInstallments.reduce(
      (sum, i) => sum + Number(i.paidAmount ?? i.amount ?? 0),
      0
    );

    const contractDetails = invoice.enrollment?.leadSnapshot?.contractDetails;

    const grossAmount = invoice.totalAmount || 0;
    const discountAmount = invoice.discountAmount || 0;
    const netAmount = Math.max(0, grossAmount - discountAmount);

    const discountRow = discountAmount > 0
      ? `<tr style="border-bottom:1px solid #dde2ec;">
      <td style="padding:11px 18px;font-size:13px;color:#4a5060;font-weight:500;">Discount</td>
      <td style="padding:11px 18px;text-align:right;font-family:'Courier New',monospace;font-weight:600;color:#c94040;font-size:13px;">- Rs ${formatAmount(discountAmount)}</td>
    </tr>`
      : "";

    await sendEmailDynamic({
      to: user.email,
      subject: `Payment Receipt — Invoice ${invoice.invoiceNumber} | ALCO`,
      templateName: "generate-receiving-invoice",
      replacements: {
        invoiceNumber: invoice.invoiceNumber,
        receiptDate: formatDate(new Date()),
        enrollmentId:
          invoice.enrollment?._id?.toString().slice(0, 8) +
          "..." +
          invoice.enrollment?._id?.toString().slice(-4),
        studentName: user.name,
        studentEmail: user.email,
        studentPhone: user.phone || "—",
        salesManagerName: "Finance Team",
        salesManagerEmail: "finance@alco.com",
        programName: program?.name || "Program",
        installmentRows,
        receiptTotal: formatAmount(receiptTotal),
        totalAmount: formatAmount(grossAmount),
        discountAmount: formatAmount(discountAmount),
        netAmount: formatAmount(netAmount),
        discountRow,
        paidAmount: formatAmount(invoice.paidAmount || 0),
        remainingAmount: formatAmount(invoice.remainingAmount || 0),
      },
    });

    await logAudit({
      req,
      action: "RECEIVING_INVOICE_EMAIL_SENT",
      module: "finance",
      targetId: invoice._id,
      after: {
        sentTo: user.email,
        sentAt: new Date(),
        sendAll: !!sendAll,
        installmentId: installmentId || null,
        receiptTotal,
      },
    });

    res.json({
      success: true,
      message: `Receipt (${sendAll ? "all paid installments" : "1 installment"}) bhej diya gaya to ${user.email}`,
    });
  } catch (err) {
    console.error("sendReceivingInvoiceEmail error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET — Sales Manager ki assigned leads ki invoices
exports.getSalesRoleInvoices = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    // sales_manager aur sales_rep dono handle
    const leads = await Lead.find({
      assigned_to: req.user._id,
      status: "converted"
    }).select("user_id");

    const userIds = leads.map((l) => l.user_id);

    const filter = { user: { $in: userIds } };
    if (status) filter.status = status;

    const invoices = await Invoice.find(filter)
      .populate("user", "name email phone")
      .populate({
        path: "enrollment",
        populate: [
          { path: "program", select: "name short_description" },
          { path: "batch", select: "name start_date end_date" },
        ],
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Invoice.countDocuments(filter);

    res.json({
      success: true,
      data: invoices,
      meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// SEARCH ENROLLMENTS — for manual invoice creation
// exports.searchEnrollments = async (req, res) => {
//   try {
//     const { q } = req.query;
//     if (!q || q.trim().length < 2)
//       return res.status(400).json({ success: false, message: "Query too short" });

//     // const User = require("../models/userModel.js");

//     // Step 1: User name/email se match karo
//     const users = await User.find({
//       $or: [
//         { name: { $regex: q, $options: "i" } },
//         { email: { $regex: q, $options: "i" } },
//       ],
//       role: "user",
//     }).select("_id name email phone").limit(20);

//     if (!users.length)
//       return res.json({ success: true, data: [] });

//     const userIds = users.map((u) => u._id);

//     // Step 2: In users ki enrollments fetch karo
//     const enrollments = await Enrollment.find({ user: { $in: userIds } })
//       .populate("user", "name email phone")
//       .populate("program", "name")
//       .populate("batch", "name start_date end_date")
//       .sort({ createdAt: -1 });

//     res.json({ success: true, data: enrollments });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
exports.searchEnrollments = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(400).json({ success: false, message: "Query too short" });

    // const User = require("../models/userModel.js");

    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ],
    }).select("_id name email phone").limit(20);

    if (!users.length) return res.json({ success: true, data: [] });

    const enrollments = await Enrollment.find({ user: { $in: users.map(u => u._id) } })
      .populate("user", "name email phone")
      .populate("program", "name")
      .populate("batch", "name start_date end_date")
      .sort({ createdAt: -1 });

    // ── Har enrollment ke saath uski invoice bhi attach karo ──
    const result = await Promise.all(
      enrollments.map(async (enr) => {
        const invoice = await Invoice.findOne({ enrollment: enr._id })
          .select("_id invoiceNumber totalAmount paidAmount remainingAmount status installments dueDate");
        return { ...enr.toObject(), invoice: invoice || null };
      })
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// // ── CHECK invoice number uniqueness ──────────────────────────────
// exports.checkInvoiceNumber = async (req, res) => {
//   try {
//     const { invoiceNumber } = req.query;
//     if (!invoiceNumber || !invoiceNumber.trim()) {
//       return res.status(400).json({ success: false, message: "invoiceNumber required" });
//     }

//     const exists = await Invoice.findOne({
//       invoiceNumber: invoiceNumber.trim(),
//     }).select("_id");

//     res.json({ success: true, available: !exists });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // ── GENERATE next invoice number (starts after 2090) ─────────────
// exports.generateInvoiceNumber = async (req, res) => {
//   try {
//     const STARTING_POINT = 2090; // ✅ ab se yahi baseline hai

//     // Sirf purely-numeric invoiceNumbers consider karo (legacy imports)
//     const invoices = await Invoice.find({
//       invoiceNumber: { $regex: /^\d+$/ },
//     }).select("invoiceNumber").lean();

//     const maxExisting = invoices.reduce((max, inv) => {
//       const num = parseInt(inv.invoiceNumber, 10);
//       return num > max ? num : max;
//     }, STARTING_POINT);

//     const nextNumber = String(maxExisting + 1);

//     // Race-condition safety — agar dusra request pehle le chuka ho to next try karo
//     let candidate = nextNumber;
//     let attempt = 0;
//     while (await Invoice.findOne({ invoiceNumber: candidate }).select("_id")) {
//       attempt += 1;
//       candidate = String(maxExisting + 1 + attempt);
//     }

//     res.json({ success: true, invoiceNumber: candidate });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// ── Helper: check invoiceNumber in BOTH Invoice collection AND Lead payment plans ──
// async function invoiceNumberExists(invoiceNumber) {
//   // 1) Check in Invoice collection
//   const invoiceExists = await Invoice.findOne({ invoiceNumber }).select("_id").lean();
//   if (invoiceExists) return true;

//   // 2) Check in Lead's paymentPlan (top-level field, not per-installment)
//   const leadExists = await Lead.findOne({
//     "paymentPlan.invoiceNumber": invoiceNumber,   // ✅ FIXED PATH
//   }).select("_id").lean();

//   return !!leadExists;
// }

// ── CHECK invoice number uniqueness ──────────────────────────────
exports.checkInvoiceNumber = async (req, res) => {
  try {
    const { invoiceNumber } = req.query;
    if (!invoiceNumber || !invoiceNumber.trim()) {
      return res.status(400).json({ success: false, message: "invoiceNumber required" });
    }

    const trimmed = invoiceNumber.trim();
    const exists = await invoiceNumberExists(trimmed);

    res.json({ success: true, available: !exists });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GENERATE next invoice number (starts after 2090) ─────────────
// async function reserveNextInvoiceNumber() {
//   let candidate;
//   do {
//     const counter = await Counter.findOneAndUpdate(
//       { _id: "invoiceNumber" },
//       { $inc: { seq: 1 } },
//       { new: true, upsert: true }
//     );
//     candidate = String(counter.seq);
//   } while (await invoiceNumberExists(candidate)); // legacy/manual numbers ke against safety check
//   return candidate;
// }

exports.checkInvoiceNumber = async (req, res) => {
  try {
    const { invoiceNumber } = req.query;
    if (!invoiceNumber?.trim())
      return res.status(400).json({ success: false, message: "invoiceNumber required" });
    const exists = await invoiceNumberExists(invoiceNumber.trim());
    res.json({ success: true, available: !exists });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.generateInvoiceNumber = async (req, res) => {
  try {
    const invoiceNumber = await reserveNextInvoiceNumber();
    res.json({ success: true, invoiceNumber });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ Explicit MM-DD-YYYY parser
function parseMMDDYYYY(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const parts = trimmed.split(/[\/\-]/);
  if (parts.length !== 3) {
    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  const [mm, dd, yyyy] = parts.map(Number);
  if (!mm || !dd || !yyyy) return null;
  const date = new Date(yyyy, mm - 1, dd);
  return isNaN(date.getTime()) ? null : date;
}

function computeInvoiceStatus(paidAmount, totalAmount) {
  if (paidAmount <= 0) return "PENDING";
  if (paidAmount >= totalAmount) return "PAID";
  return "PARTIAL";
}

// ✅ Ye functions financeController.js mein ADD/REPLACE karni hain (existing exports ke sath)
// NOTE: `invoiceNumberExists` helper already isi file mein defined hai (module-level function) — reuse ho raha hai.
// Top mein already ye imports maujood hain: ExcelJS, User, Enrollment, Lead, Invoice, Payment,
// postInvoiceJournal, postPaymentJournal, logAudit

// ─────────────────────────────────────────────────────────
// HELPER: Header row parse karo — column LETTERS pe depend nahi karte,
// header TEXT se match karte hain. Finance team jis order mein bhi
// columns rakhe, system samajh jayega.
//
// Expected headers (case-insensitive, exact text match):
//   Name, Email, Amount, Due Date, Issue Date, Invoice Number,
//   Advance Amount, Advance Paid Date, Advance Description,
//   Installment 1 Amount, Installment 1 Due Date, Installment 1 Description, Installment 1 Paid Date,
//   Installment 2 Amount, Installment 2 Due Date, Installment 2 Description, Installment 2 Paid Date,
//   ... (jitni installments chahiye utni add kar sakte hain)
// ─────────────────────────────────────────────────────────
function buildHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const map = {
    installments: {}, // { 1: { amount, dueDate, description, paidDate }, 2: {...} }
  };

  const installmentPattern = /^installment\s*(\d+)\s*(amount|due date|description|paid date)$/i;

  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value || "").trim().toLowerCase();
    if (!text) return;

    // NAYA
    if (text === "name") map.name = colNumber;
    else if (text === "email") map.email = colNumber;
    else if (text === "amount") map.amount = colNumber;
    else if (text === "discount" || text === "discount amount") map.discountAmount = colNumber;
    else if (text === "due date") map.dueDate = colNumber;
    else if (text === "issue date") map.issueDate = colNumber;
    else if (text === "invoice number") map.invoiceNumber = colNumber;
    else if (text === "advance amount") map.advanceAmount = colNumber;
    else if (text === "advance paid date") map.advancePaidDate = colNumber;
    else if (text === "advance description") map.advanceDescription = colNumber;
    else {
      const m = text.match(installmentPattern);
      if (m) {
        const num = m[1];
        const field = m[2]; // "amount" | "due date" | "description" | "paid date"
        if (!map.installments[num]) map.installments[num] = {};
        if (field === "amount") map.installments[num].amount = colNumber;
        else if (field === "due date") map.installments[num].dueDate = colNumber;
        else if (field === "description") map.installments[num].description = colNumber;
        else if (field === "paid date") map.installments[num].paidDate = colNumber;
      }
    }
  });

  return map;
}

// ✅ ExcelJS ke cell.value ko safely nikalo — Date/Number/String/rich-text sab handle karta hai.
// Purani buggy version cell.text?.trim() use karti thi, jo Date ya Number cells par crash
// karti thi (".trim is not a function") kyunki .text un cases mein string nahi hoti.
function cellRawValue(row, colNumber) {
  if (!colNumber) return null;
  const cell = row.getCell(colNumber);
  let val = cell.value;
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val;

  // hyperlink / formula / rich-text ko unwrap karo — nested bhi ho sakta hai
  let depth = 0;
  while (typeof val === "object" && val !== null && !(val instanceof Date) && depth < 5) {
    if (val.richText) {
      return val.richText.map((rt) => rt.text).join("");
    }
    if (val.text !== undefined) {
      val = val.text; // hyperlink ka text — ye khud richText object bhi ho sakta hai
      depth++;
      continue;
    }
    if (val.result !== undefined) {
      val = val.result; // formula result
      depth++;
      continue;
    }
    break;
  }

  if (val instanceof Date) return val;
  if (typeof val === "object") return null;
  return val;
}

function cellText(row, colNumber) {
  const val = cellRawValue(row, colNumber);
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString();
  const str = String(val).trim();
  return str || null;
}

function cellDate(row, colNumber) {
  const val = cellRawValue(row, colNumber);
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val;
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function cellNumber(row, colNumber) {
  const val = cellRawValue(row, colNumber);
  if (val === null || val === undefined) return 0;
  if (val instanceof Date) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

// ✅ Due date automation: agar due date nahi di gayi lekin paidDate hai,
// to paidDate + 7 din (1 hafta) ko due date bana do
function resolveDueDate(explicitDueDate, paidDate) {
  if (explicitDueDate) return explicitDueDate;
  if (paidDate) {
    const d = new Date(paidDate);
    d.setDate(d.getDate() + 7);
    return d;
  }
  return null;
}

// ─────────────────────────────────────────────────────────
// STEP 1: PREVIEW — Excel parse (header-based) + user match + ALL enrollments per user
// ─────────────────────────────────────────────────────────
exports.previewBulkInvoice = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const headerMap = buildHeaderMap(worksheet);
    if (!headerMap.email) {
      return res.status(400).json({ success: false, message: "'Email' column not found in header row" });
    }

    const parsedRows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header skip

      const email = cellText(row, headerMap.email)?.toLowerCase();
      if (!email) return;

      // NAYA
      const fallbackAmount = cellNumber(row, headerMap.amount);
      const discountAmount = cellNumber(row, headerMap.discountAmount);
      const dueDate = cellDate(row, headerMap.dueDate);
      const issueDate = cellDate(row, headerMap.issueDate);
      const invoiceNumber = cellText(row, headerMap.invoiceNumber);
      const advanceAmount = cellNumber(row, headerMap.advanceAmount);
      const advancePaidDate = cellDate(row, headerMap.advancePaidDate);
      const advanceDescription = cellText(row, headerMap.advanceDescription) || "Advance Payment";

      // ✅ Installments dynamically nikalo (jitni bhi header mein defined hain)
      const installments = Object.entries(headerMap.installments)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([num, cols]) => {
          const amount = cellNumber(row, cols.amount);
          const paidDate = cellDate(row, cols.paidDate);
          const explicitDueDate = cellDate(row, cols.dueDate);
          return {
            number: Number(num),
            amount,
            dueDate: resolveDueDate(explicitDueDate, paidDate),
            description: cellText(row, cols.description) || `Installment ${num}`,
            paidDate,
          };
        })
        .filter((i) => i.amount > 0); // ✅ khaali installment slots skip karo

      // PURANA — parsedRows.push()
      parsedRows.push({
        email,
        fallbackAmount,
        discountAmount,
        dueDate,
        issueDate,
        invoiceNumber,
        advance: advanceAmount > 0
          ? {
            amount: advanceAmount,
            dueDate: resolveDueDate(dueDate, advancePaidDate),
            description: advanceDescription,
            paidDate: advancePaidDate,
          }
          : null,
        installments,
      });
    });

    if (parsedRows.length === 0) {
      return res.status(400).json({ success: false, message: "No valid rows found (Email required)" });
    }

    // ✅ file ke andar duplicate emails hata do (last occurrence rakho)
    const rowMap = new Map();
    parsedRows.forEach((r) => rowMap.set(r.email, r));
    const uniqueRows = Array.from(rowMap.values());

    // ✅ DB mein users dhoondo
    const emails = uniqueRows.map((r) => r.email);
    const users = await User.find({ email: { $in: emails } }).select("name email phone");
    const userMap = new Map(users.map((u) => [u.email, u]));

    // ✅ In users ki SAARI enrollments dhoondo (bundle = multiple programs)
    const foundUserIds = users.map((u) => u._id);
    const allEnrollments = await Enrollment.find({ user: { $in: foundUserIds } })
      .populate("program", "name price")
      .select("user program");

    const enrollmentsByUser = new Map();
    allEnrollments.forEach((e) => {
      const uid = e.user.toString();
      if (!enrollmentsByUser.has(uid)) enrollmentsByUser.set(uid, []);
      enrollmentsByUser.get(uid).push(e);
    });

    const allEnrollmentIds = allEnrollments.map((e) => e._id);
    const existingInvoices = await Invoice.find({
      enrollment: { $in: allEnrollmentIds },
      status: { $ne: "CANCELLED" },
    }).select("enrollment invoiceNumber totalAmount status");
    const invoicedEnrollmentMap = new Map(existingInvoices.map((inv) => [inv.enrollment.toString(), inv]));

    const preview = [];
    for (const r of uniqueRows) {
      const user = userMap.get(r.email);
      if (!user) {
        preview.push({ email: r.email, user: null, status: "not_found" });
        continue;
      }

      const userInfo = { _id: user._id, name: user.name, email: user.email, phone: user.phone };

      if (r.invoiceNumber) {
        const taken = await invoiceNumberExists(r.invoiceNumber);
        if (taken) {
          preview.push({
            email: r.email, user: userInfo, status: "invalid_invoice_number", invoiceNumber: r.invoiceNumber,
          });
          continue;
        }
      }

      const userEnrollments = enrollmentsByUser.get(user._id.toString()) || [];
      if (userEnrollments.length === 0) {
        preview.push({ email: r.email, user: userInfo, status: "no_enrollment", enrollmentOptions: [] });
        continue;
      }

      const enrollmentOptions = userEnrollments.map((e) => {
        const existingInv = invoicedEnrollmentMap.get(e._id.toString());
        return {
          enrollmentId: e._id,
          programId: e.program?._id || null,
          programName: e.program?.name || "—",
          // defaultAmount: userEnrollments.length === 1 ? (r.fallbackAmount || 0) : 0,
          // ✅ Har program apna price le, bundle mein bhi correct amount milega
          defaultAmount: e.program?.price || r.fallbackAmount || 0,
          hasInvoice: !!existingInv,
          existingInvoiceNumber: existingInv?.invoiceNumber || null,
        };
      });

      const availableOptions = enrollmentOptions.filter((o) => !o.hasInvoice);
      if (availableOptions.length === 0) {
        preview.push({ email: r.email, user: userInfo, status: "duplicate", enrollmentOptions });
        continue;
      }

      preview.push({
        email: r.email,
        user: userInfo,
        status: "eligible",
        enrollmentOptions,
        defaultSelectedIds: availableOptions.map((o) => o.enrollmentId),
        dueDate: r.dueDate,
        issueDate: r.issueDate,
        invoiceNumber: r.invoiceNumber || undefined,
        discountAmount: r.discountAmount || 0,
        advance: r.advance,           // { amount, dueDate, description, paidDate } | null
        installments: r.installments, // [{ number, amount, dueDate, description, paidDate }]
      });
    }

    res.status(200).json({
      success: true,
      totalRows: uniqueRows.length,
      eligibleCount: preview.filter((p) => p.status === "eligible").length,
      duplicateCount: preview.filter((p) => p.status === "duplicate").length,
      noEnrollmentCount: preview.filter((p) => p.status === "no_enrollment").length,
      notFoundCount: preview.filter((p) => p.status === "not_found").length,
      invalidCount: preview.filter((p) => p.status === "invalid_invoice_number").length,
      preview,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────
// STEP 2: CONFIRM — actual invoice + installments creation
// Payload: [{
//   user, invoiceNumber?, dueDate?, issueDate?,
//   items: [{enrollmentId, programId, programName, amount, discount}],
//   advance?: { amount, dueDate, description, paidDate, paid },
//   installments?: [{ amount, dueDate, description, paidDate, paid }]
// }]
// "paid: true" wali installments ke liye Payment record + journal banega.
// "paid: false" wali installments invoice mein PENDING reh jayengi, payment module mein NAHI jayengi.
// ─────────────────────────────────────────────────────────
exports.confirmBulkInvoice = async (req, res) => {
  try {
    const { invoices } = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ success: false, message: "invoices array is required" });
    }

    const STARTING_POINT = 2090;
    const existingNumeric = await Invoice.find({ invoiceNumber: { $regex: /^\d+$/ } })
      .select("invoiceNumber").lean();
    const leadsWithInvoices = await Lead.find({ "paymentPlan.invoiceNumber": { $regex: /^\d+$/ } })
      .select("paymentPlan.invoiceNumber").lean();

    let runningMax = existingNumeric.reduce((max, inv) => {
      const num = parseInt(inv.invoiceNumber, 10);
      return num > max ? num : max;
    }, STARTING_POINT);
    runningMax = leadsWithInvoices.reduce((max, lead) => {
      const num = parseInt(lead.paymentPlan?.invoiceNumber, 10);
      return !isNaN(num) && num > max ? num : max;
    }, runningMax);

    const created = [];
    const skipped = [];

    for (const row of invoices) {
      const { user, invoiceNumber, dueDate, issueDate, items, advance, installments } = row;

      if (!user || !Array.isArray(items) || items.length === 0) {
        skipped.push({ user, reason: "Missing user or items" });
        continue;
      }

      const enrollmentIds = items.map((it) => it.enrollmentId);
      const alreadyInvoiced = await Invoice.findOne({
        enrollment: { $in: enrollmentIds },
        status: { $ne: "CANCELLED" },
      });
      if (alreadyInvoiced) {
        skipped.push({ user, reason: "One or more selected enrollments already invoiced" });
        continue;
      }

      let finalInvoiceNumber = invoiceNumber;
      if (finalInvoiceNumber) {
        const taken = await invoiceNumberExists(finalInvoiceNumber);
        if (taken) {
          skipped.push({ user, reason: `Invoice number ${finalInvoiceNumber} already taken` });
          continue;
        }
      } else {
        runningMax += 1;
        let candidate = String(runningMax);
        while (await invoiceNumberExists(candidate)) {
          runningMax += 1;
          candidate = String(runningMax);
        }
        finalInvoiceNumber = candidate;
      }

      const invoiceDate = issueDate ? new Date(issueDate) : new Date();
      const isBundle = items.length > 1;

      const grossItems = items.map((it) => ({
        ...it,
        amount: Number(it.amount || 0),
        discount: Number(it.discount || 0),
        netAmount: Math.max(0, Number(it.amount || 0) - Number(it.discount || 0)),
      }));

      const totalAmount = grossItems.reduce((sum, it) => sum + it.amount, 0); // Gross
      const discountAmount = grossItems.reduce((sum, it) => sum + it.discount, 0);
      const netAmount = totalAmount - discountAmount;

      if (netAmount <= 0) {
        skipped.push({
          user,
          reason: "Total amount is zero — check amounts/discounts",
        });
        continue;
      }

      // ── Installments array banao (advance + numbered installments) ──
      // "paid: false" wali entries invoice mein PENDING reh jayengi, koi Payment record nahi banega
      const installmentDocs = [];
      const paidEntriesForJournal = []; // { amount, method, paidAt, label } — baad mein Payment+journal ke liye

      if (advance && advance.amount > 0) {
        const isPaid = !!advance.paid;
        installmentDocs.push({
          label: advance.description || "Advance Payment",
          amount: advance.amount,
          dueDate: advance.dueDate ? new Date(advance.dueDate) : null,
          isAdvance: true,
          feeType: "program",
          status: isPaid ? "PAID" : "PENDING",
          paidAmount: isPaid ? advance.amount : 0,
          paidAt: isPaid && advance.paidDate ? new Date(advance.paidDate) : null,
        });
        if (isPaid) {
          paidEntriesForJournal.push({
            amount: advance.amount,
            paidAt: advance.paidDate ? new Date(advance.paidDate) : new Date(),
            label: advance.description || "Advance Payment",
            installmentIndex: installmentDocs.length - 1,
          });
        }
      }

      (installments || []).forEach((inst) => {
        if (!inst.amount || inst.amount <= 0) return;
        const isPaid = !!inst.paid;
        installmentDocs.push({
          label: inst.description || "Installment",
          amount: inst.amount,
          dueDate: inst.dueDate ? new Date(inst.dueDate) : null,
          isAdvance: false,
          feeType: "program",
          status: isPaid ? "PAID" : "PENDING",
          paidAmount: isPaid ? inst.amount : 0,
          paidAt: isPaid && inst.paidDate ? new Date(inst.paidDate) : null,
        });
        if (isPaid) {
          paidEntriesForJournal.push({
            amount: inst.amount,
            paidAt: inst.paidDate ? new Date(inst.paidDate) : new Date(),
            label: inst.description || "Installment",
            installmentIndex: installmentDocs.length - 1,
          });
        }
      });

      const paidAmount = installmentDocs.reduce((sum, i) => sum + (i.paidAmount || 0), 0);
      const remainingAmount = Math.max(0, netAmount - paidAmount);
      const invoiceStatus =
        remainingAmount === 0 && paidAmount > 0 ? "PAID" : paidAmount > 0 ? "PARTIAL" : "PENDING";

      const invoice = await Invoice.create({
        invoiceNumber: finalInvoiceNumber,
        user,
        isBundle,
        enrollment: grossItems[0].enrollmentId,
        enrollments: isBundle ? grossItems.map((it) => it.enrollmentId) : undefined,

        items: isBundle
          ? grossItems.map((it) => ({
            program: it.programId || undefined,
            programName: it.programName,
            enrollment: it.enrollmentId,
            amount: it.amount,
            discountAmount: it.discount,     // Agar item schema me field hai
            feeType: "program",
          }))
          : undefined,
        totalAmount,
        discountAmount,
        paidAmount,
        remainingAmount,
        status: invoiceStatus,
        dueDate: dueDate || null,
        issueDate: invoiceDate,
        installments: installmentDocs,
      });

      if (isBundle) {
        await Enrollment.updateMany(
          { _id: { $in: grossItems.map((it) => it.enrollmentId) } },
          { invoice: invoice._id }
        );
      }

      // ✅ Invoice creation journal — AR + Income, bilkul normal single-invoice flow jaisa
      await postInvoiceJournal({
        amount: totalAmount,
        discountAmount,
        invoiceId: invoice._id,
        userId: req.user._id,
        description: `Invoice ${finalInvoiceNumber} created (bulk import)${isBundle ? " — bundle" : ""}`,
        date: invoiceDate,
      });

      // ✅ Jo installments "paid" mark hui thin — unke liye Payment record + payment journal
      for (const entry of paidEntriesForJournal) {
        const payment = await Payment.create({
          invoice: invoice._id,
          enrollment: invoice.enrollment,
          user,
          amount: entry.amount,
          method: "manual",
          status: "approved",
          approvedBy: req.user._id,
          approvedAt: new Date(),
          receivedBy: req.user._id,
          paidAt: entry.paidAt,
          notes: `${entry.label} — migrated via bulk import`,
        });

        invoice.installments[entry.installmentIndex].paymentId = payment._id;

        await postPaymentJournal({
          amount: entry.amount,
          method: "manual",
          paymentId: payment._id,
          userId: req.user._id,
          description: `${entry.label} — ${invoice.invoiceNumber} (bulk import)`,
          date: entry.paidAt,
        });
      }

      if (paidEntriesForJournal.length > 0) {
        await invoice.save(); // paymentId links save karo
      }

      await logAudit({
        req,
        action: "INVOICE_CREATED",
        module: "finance",
        targetId: invoice._id,
        after: invoice.toObject(),
      });

      created.push(invoice);
    }

    res.status(201).json({
      success: true,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────
// BULK DISCOUNT CORRECTION — Excel se invoices ki gross/discount fix karo
// Expected headers: "Invoice Number", "Discount Amount", "Reason" (optional)
// ─────────────────────────────────────────────────────────

function buildDiscountHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const map = {};
  headerRow.eachCell((cell, colNumber) => {
    const text = String(cell.value || "").trim().toLowerCase();
    if (text === "invoice number") map.invoiceNumber = colNumber;
    else if (text === "discount amount") map.discountAmount = colNumber;
    else if (text === "reason") map.reason = colNumber;
  });
  return map;
}

// ── STEP 1: PREVIEW ──────────────────────────────────────
exports.previewBulkDiscount = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const headerMap = buildDiscountHeaderMap(worksheet);
    if (!headerMap.invoiceNumber || !headerMap.discountAmount) {
      return res.status(400).json({
        success: false,
        message: "'Invoice Number' and 'Discount Amount' columns required in header row",
      });
    }

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const invoiceNumber = cellText(row, headerMap.invoiceNumber);
      const discountAmount = cellNumber(row, headerMap.discountAmount);
      const reason = cellText(row, headerMap.reason) || "";
      if (!invoiceNumber || discountAmount <= 0) return;
      rows.push({ invoiceNumber, discountAmount, reason });
    });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "No valid rows found" });
    }

    const preview = [];
    for (const r of rows) {
      const invoice = await Invoice.findOne({ invoiceNumber: r.invoiceNumber })
        .populate("user", "name email");

      if (!invoice) {
        preview.push({ ...r, status: "not_found" });
        continue;
      }
      if ((invoice.discountAmount || 0) > 0) {
        preview.push({ ...r, status: "already_has_discount", existingDiscount: invoice.discountAmount });
        continue;
      }
      if (r.discountAmount >= invoice.totalAmount) {
        preview.push({ ...r, status: "invalid_discount", currentTotal: invoice.totalAmount });
        continue;
      }

      // ✅ NAYA — reverse karne layak posted journal entry hai ya nahi, yahi pe check karo
      const postedEntry = await JournalEntry.findOne({
        sourceType: "invoice",
        sourceRef: invoice._id,
        status: "posted",
      }).select("_id");

      if (!postedEntry) {
        preview.push({
          ...r,
          status: "no_journal_entry",
          invoiceId: invoice._id,
          studentName: invoice.user?.name,
        });
        continue;
      }

      preview.push({
        ...r,
        status: "eligible",
        invoiceId: invoice._id,
        studentName: invoice.user?.name,
        studentEmail: invoice.user?.email,
        currentNetAmount: invoice.totalAmount,
        newGrossAmount: invoice.totalAmount + r.discountAmount,
        paidAmount: invoice.paidAmount || 0,
        remainingAmount: invoice.remainingAmount || 0,
        issueDate: invoice.issueDate,
      })
    }

    res.status(200).json({
      success: true,
      totalRows: rows.length,
      eligibleCount: preview.filter((p) => p.status === "eligible").length,
      preview,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── STEP 2: CONFIRM — reverse purani journal, gross+discount set karo, nayi journal issueDate pe post karo ──
exports.confirmBulkDiscount = async (req, res) => {
  try {
    const { rows } = req.body; // [{ invoiceId, discountAmount, reason }]

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "rows array is required" });
    }

    const corrected = [];
    const skipped = [];

    for (const r of rows) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const invoice = await Invoice.findById(r.invoiceId).session(session);
        if (!invoice) {
          skipped.push({ invoiceId: r.invoiceId, reason: "Invoice not found" });
          await session.abortTransaction();
          session.endSession();
          continue;
        }
        if ((invoice.discountAmount || 0) > 0) {
          skipped.push({ invoiceId: r.invoiceId, reason: "Discount already applied" });
          await session.abortTransaction();
          session.endSession();
          continue;
        }

        const discountAmount = Number(r.discountAmount);
        const oldNetAmount = invoice.totalAmount;
        const newGrossAmount = oldNetAmount + discountAmount;
        const issueDate = invoice.issueDate; // 👈 create ke waqt jo date thi, wahi journal pe use hogi

        // ── Step 1: Purani (net-as-gross) journal entry reverse karo ──
        const reversed = await reverseJournalEntry({
          sourceType: "invoice",
          sourceRef: invoice._id,
          userId: req.user._id,
          description: `Reversal — invoice ${invoice.invoiceNumber} discount correction`,
          session,
        });

        if (!reversed.length) {
          skipped.push({ invoiceId: r.invoiceId, reason: "No posted journal entry found to reverse" });
          await session.abortTransaction();
          session.endSession();
          continue;
        }

        // ── Step 2: Invoice ko gross + discount se update karo (remainingAmount same rehta hai) ──
        invoice.totalAmount = newGrossAmount;   // 350000 + 100000 = 450000 ✅ ye theek update ho raha hai
        invoice.discountAmount = discountAmount;
        await invoice.save({ session });

        // ── Step 3: Nayi 3-line journal entry issueDate pe post karo ──
        await postInvoiceJournal({
          amount: newGrossAmount,
          discountAmount,
          invoiceId: invoice._id,
          userId: req.user._id,
          description: `Invoice ${invoice.invoiceNumber} corrected — discount applied${r.reason ? `: ${r.reason}` : ""}`,
          date: issueDate,   // 👈 aaj ki date nahi, invoice ki issueDate
          session,
        });

        await logAudit({
          req,
          action: "INVOICE_DISCOUNT_APPLIED",
          module: "finance",
          targetId: invoice._id,
          before: { totalAmount: oldNetAmount, discountAmount: 0 },
          after: { totalAmount: newGrossAmount, discountAmount },
        });

        await session.commitTransaction();
        session.endSession();

        corrected.push({
          invoiceNumber: invoice.invoiceNumber,
          oldNetAmount,
          newGrossAmount,
          discountAmount,
        });
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        skipped.push({ invoiceId: r.invoiceId, reason: err.message });
      }
    }

    res.status(200).json({
      success: true,
      correctedCount: corrected.length,
      skippedCount: skipped.length,
      corrected,
      skipped,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};