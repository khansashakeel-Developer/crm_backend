// utils/chequeDiscardHelpers.js
const Account = require("../models/accountModel.js");
const JournalEntry = require("../models/journalEntryModel.js");
const User = require("../models/userModel.js");
const generateUniqueNumber = require("./generateUniqueNumber.js");
const { notifyChequeDiscarded, notifyChequeExpired } = require("../config/notificationService.js");

function getNetAmount(invoice) {
  return Math.max(0, (invoice.totalAmount || 0) - (invoice.discountAmount || 0));
}

// Mirrors postPaymentJournal but reversed: Debit AR(1100) / Credit Bank(1002)
async function postChequeReversalJournal({ amount, invoiceNumber, chequeNumber, userId, session, date }) {
  const bankAccount = await Account.findOne({ code: "1002", isActive: true }).session(session);
  const arAccount = await Account.findOne({ code: "1100", isActive: true }).session(session);

  if (!bankAccount || !arAccount) {
    console.warn("postChequeReversalJournal: accounts not found — seed first");
    return null;
  }

  const entryDate = date || new Date();

  const entryData = {
    date: entryDate,
    description: `Cheque #${chequeNumber} discarded — ${invoiceNumber}`,
    lines: [
      { account: arAccount._id, type: "debit", amount, description: "Receivable reinstated — cheque discarded" },
      { account: bankAccount._id, type: "credit", amount, description: "Bank balance reversed — cheque discarded" },
    ],
    sourceType: "cheque_discard",
    sourceRef: null,
    entryType: "auto",
    status: "posted",
    createdBy: userId || null,
    entryNumber: generateUniqueNumber("JE-CHQ"),
    isReversal: true,
    originalJournal: null,
    period: { month: entryDate.getMonth() + 1, year: entryDate.getFullYear() },
  };

  const opts = session ? { session } : {};
  const entry = await JournalEntry.create([entryData], opts);

  arAccount.currentBalance += amount;
  bankAccount.currentBalance -= amount;

  if (session) {
    await arAccount.save({ session });
    await bankAccount.save({ session });
  } else {
    await arAccount.save();
    await bankAccount.save();
  }

  return entry[0];
}

// Marks a cheque discarded, reverses its journal impact, pulls the amount
// back out of invoice paid/remaining totals. Caller commits the session.
async function discardChequeAndReverse({ invoice, cheque, discardedBy, reason, session }) {
  if (cheque.status === "discarded") throw new Error("Cheque already discarded");

  cheque.status = "discarded";
  cheque.discardedAt = new Date();
  cheque.discardedBy = discardedBy || null;
  cheque.discardReason = reason || null;
  await cheque.save({ session });

  invoice.paidAmount = Math.max(0, (invoice.paidAmount || 0) - cheque.amount);
  invoice.remainingAmount = Math.max(0, (invoice.remainingAmount || 0) + cheque.amount);
  invoice.status =
    invoice.remainingAmount === 0 && invoice.paidAmount > 0 ? "PAID"
      : invoice.paidAmount > 0 ? "PARTIAL"
        : "PENDING";

  await invoice.save({ session });

  await postChequeReversalJournal({
    amount: cheque.amount,
    invoiceNumber: invoice.invoiceNumber,
    chequeNumber: cheque.chequeNumber,
    userId: discardedBy,
    session,
  });

  return { invoice, cheque };
}

// Call AFTER the transaction commits.
async function notifyChequeDiscardRecipients({ chequeNumber, amount, invoiceNumber, reason, triggeredBy }) {
  const recipients = await User.find({ role: { $in: ["finance_manager", "admin", "super_admin"] } }).select("_id");
  return notifyChequeDiscarded({
    userIds: recipients.map((u) => u._id),
    chequeNumber,
    amount,
    invoiceNumber,
    reason,
    triggeredBy,
  });
}

async function notifyChequeExpiredRecipients({ chequeNumber, amount, invoiceNumber }) {
  const recipients = await User.find({ role: { $in: ["finance_manager", "admin", "super_admin"] } }).select("_id");
  return notifyChequeExpired({
    userIds: recipients.map((u) => u._id),
    chequeNumber,
    amount,
    invoiceNumber,
  });
}

module.exports = { discardChequeAndReverse, notifyChequeDiscardRecipients, notifyChequeExpiredRecipients, postChequeReversalJournal, getNetAmount };