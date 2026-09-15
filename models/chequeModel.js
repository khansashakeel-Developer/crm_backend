// models/chequeModel.js

const mongoose = require("mongoose");

const chequeSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    installment: { type: mongoose.Schema.Types.ObjectId, default: null }, // matches invoice.installments._id
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    accountHolderName: { type: String, required: true },
    chequeNumber: { type: String, required: true },
    amount: { type: Number, required: true },
    date: { type: Date, default: null }, // optional, null = never expires
    status: {
      type: String,
      enum: ["pending", "cleared", "bounced", "returned"],
      default: "pending",
    },
    isBackfill: { type: Boolean, default: false }, // true = historical/migrated cheque, doesn't touch invoice balances
    clearedAt: { type: Date, default: null },
    clearedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    returnedAt: { type: Date, default: null },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    depositDate: { type: Date, default: null },
    bounceDate: { type: Date, default: null },
    bouncedAt: { type: Date, default: null },
    bouncedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    bounceReason: { type: String, default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null },
    expiryNotifiedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

chequeSchema.index({ invoice: 1, status: 1 });

module.exports = mongoose.model("Cheque", chequeSchema);