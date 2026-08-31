/**
 * utils/qboHooks.js
 * Phase 1 — Safe non-blocking hooks
 */

const qbo = require("../services/qboService");
const User = require("../models/userModel");
const Invoice = require("../models/invoiceModel");
const Payment = require("../models/paymentModel");

// ✅ Reliable check — sirf real Mongoose document ke paas .save() method hota hai
function isDoc(x) {
  return !!x && typeof x === "object" && typeof x.save === "function";
}

async function afterInvoiceCreated(invoiceIdOrDoc, userIdOrDoc) {
  try {
    const isProd = process.env.QBO_ENVIRONMENT === "production";
    const clientId = isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID;

    if (!clientId) {
      console.log("[QBO] Skipping sync — credentials not configured");
      return;
    }

    const invoice = isDoc(invoiceIdOrDoc) ? invoiceIdOrDoc : await Invoice.findById(invoiceIdOrDoc);
    const user = isDoc(userIdOrDoc) ? userIdOrDoc : await User.findById(userIdOrDoc || invoice?.user);

    if (!invoice || !user) {
      console.warn("[QBO] afterInvoiceCreated: invoice or user missing");
      return;
    }

    await qbo.syncInvoice(invoice, user);
    console.log(`[QBO] Invoice ${invoice.invoiceNumber} synced → ${invoice.qboInvoiceId}`);
  } catch (err) {
    console.error(`[QBO] afterInvoiceCreated failed:`, err.message);
  }
}

async function afterPaymentApproved(paymentIdOrDoc) {
  try {
    const isProd = process.env.QBO_ENVIRONMENT === "production";
    const clientId = isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID;

    if (!clientId) {
      console.log("[QBO] Skipping payment sync — credentials not configured");
      return;
    }

    const payment = isDoc(paymentIdOrDoc) ? paymentIdOrDoc : await Payment.findById(paymentIdOrDoc);

    if (!payment) return;
    if (payment.status !== "approved") return;

    const invoice = await Invoice.findById(payment.invoice);
    const user = await User.findById(payment.user);

    if (!invoice || !user) {
      console.warn("[QBO] afterPaymentApproved: invoice or user missing");
      return;
    }

    await qbo.syncPayment(payment, invoice, user);
    console.log(`[QBO] Payment ${payment._id} synced → ${payment.qboPaymentId}`);
  } catch (err) {
    console.error(`[QBO] afterPaymentApproved failed:`, err.message);
  }
}

module.exports = {
  afterInvoiceCreated,
  afterPaymentApproved,
};
// /**
//  * utils/qboHooks.js
//  * Phase 1 — Safe non-blocking hooks
//  */

// const qbo = require("../services/qboService");
// const User = require("../models/userModel");
// const Invoice = require("../models/invoiceModel");
// const Payment = require("../models/paymentModel");

// async function afterInvoiceCreated(invoiceIdOrDoc, userIdOrDoc) {
//   try {
//     const isProd = process.env.QBO_ENVIRONMENT === "production";
//     const clientId = isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID;

//     if (!clientId) {
//       console.log("[QBO] Skipping sync — credentials not configured");
//       return;
//     }

//     const invoice =
//       typeof invoiceIdOrDoc === "object" && invoiceIdOrDoc._id
//         ? invoiceIdOrDoc
//         : await Invoice.findById(invoiceIdOrDoc);

//     const user =
//       typeof userIdOrDoc === "object" && userIdOrDoc._id
//         ? userIdOrDoc
//         : await User.findById(userIdOrDoc || invoice?.user);

//     if (!invoice || !user) {
//       console.warn("[QBO] afterInvoiceCreated: invoice or user missing");
//       return;
//     }

//     await qbo.syncInvoice(invoice, user);
//     console.log(`[QBO] Invoice ${invoice.invoiceNumber} synced → ${invoice.qboInvoiceId}`);
//   } catch (err) {
//     console.error(`[QBO] afterInvoiceCreated failed:`, err.message);
//   }
// }

// async function afterPaymentApproved(paymentIdOrDoc) {
//   try {
//     const isProd = process.env.QBO_ENVIRONMENT === "production";
//     const clientId = isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID;

//     if (!clientId) {
//       console.log("[QBO] Skipping payment sync — credentials not configured");
//       return;
//     }

//     const payment =
//       typeof paymentIdOrDoc === "object" && paymentIdOrDoc._id
//         ? paymentIdOrDoc
//         : await Payment.findById(paymentIdOrDoc);

//     if (!payment) return;
//     if (payment.status !== "approved") return;

//     const invoice = await Invoice.findById(payment.invoice);
//     const user = await User.findById(payment.user);

//     if (!invoice || !user) {
//       console.warn("[QBO] afterPaymentApproved: invoice or user missing");
//       return;
//     }

//     await qbo.syncPayment(payment, invoice, user);
//     console.log(`[QBO] Payment ${payment._id} synced → ${payment.qboPaymentId}`);
//   } catch (err) {
//     console.error(`[QBO] afterPaymentApproved failed:`, err.message);
//   }
// }

// module.exports = {
//   afterInvoiceCreated,
//   afterPaymentApproved,
// };