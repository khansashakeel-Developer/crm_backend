// models/Invoice.js
const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isBundle: { type: Boolean, default: false },
    enrollment: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment" },

    totalAmount: Number,
    discountAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    remainingAmount: Number,

    description: { type: String, default: "" },

    items: [{
      program: { type: mongoose.Schema.Types.ObjectId, ref: "Program" },
      programName: String,
      enrollment: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment" },
      amount: Number,
      discount: { type: Number, default: 0 },
      feeType: { type: String, enum: ["program", "certificate", "manual"], default: "program" },
    }],

    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "WARNING", "EXTENDED", "BLOCKED", "CANCELLED"],
      default: "PENDING",
    },

    dueDate: Date,
    issueDate: { type: Date, default: Date.now },

    // ─── QuickBooks Online Sync ───────────────────────────────────
    qboInvoiceId: { type: String, default: null, index: true },
    qboSyncStatus: {
      type: String,
      enum: ["pending", "synced", "failed", "skipped"],
      default: "pending",
    },
    qboLastSyncedAt: { type: Date, default: null },
    qboLastAttemptAt: { type: Date, default: null },
    qboSyncError: { type: String, default: null },

    installments: [{
      label: { type: String, default: "Installment" },
      amount: Number,
      dueDate: Date,
      paidAmount: { type: Number, default: 0 },
      paidAt: { type: Date, default: null },
      status: { type: String, enum: ["PENDING", "PAID", "OVERDUE"], default: "PENDING" },
      isAdvance: { type: Boolean, default: false },
      feeType: { type: String, enum: ["program", "certificate", "manual"], default: "program" },
      program: { type: mongoose.Schema.Types.ObjectId, ref: "Program", default: null },
      enrollment: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },
      method: { type: String, enum: ["cash", "bank", "cheque", "manual"], default: null },
      referenceNumber: { type: String, default: null },
      notes: { type: String, default: null },
      receiptUrl: { type: String, default: null },
      receiptPublicId: { type: String, default: null },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);