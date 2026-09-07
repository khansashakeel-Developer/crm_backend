// /**
//  * services/qboService.js
//  * Phase 1 — QuickBooks Online Integration Service
//  */

// const axios = require("axios");
// const OAuthClient = require("intuit-oauth");
// const QboToken = require("../models/qboTokenModel");

// const isProd = process.env.QBO_ENVIRONMENT === "production";
// const ENV_KEY = isProd ? "production" : "sandbox";

// const oauthClient = new OAuthClient({
//   clientId: isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID,
//   clientSecret: isProd ? process.env.QBO_PROD_CLIENT_SECRET : process.env.QBO_DEV_CLIENT_SECRET,
//   environment: process.env.QBO_ENVIRONMENT || "sandbox",
//   redirectUri: process.env.QBO_REDIRECT_URI,
//   logging: process.env.NODE_ENV !== "production",
// });

// const REALM_ID = process.env.QBO_REALM_ID;
// const BASE_URL = isProd
//   ? "https://quickbooks.api.intuit.com"
//   : "https://sandbox-quickbooks.api.intuit.com";

// let cachedToken = null;

// let tokenStore = {
//   access_token: process.env.QBO_ACCESS_TOKEN || null,
//   refresh_token: process.env.QBO_REFRESH_TOKEN || null,
//   expires_at: process.env.QBO_TOKEN_EXPIRES_AT
//     ? new Date(process.env.QBO_TOKEN_EXPIRES_AT).getTime()
//     : 0,
// };


// async function loadToken() {
//   if (cachedToken) return cachedToken;
//   const doc = await QboToken.findOne({ environment: ENV_KEY });
//   if (!doc) return null;
//   cachedToken = {
//     access_token: doc.accessToken,
//     refresh_token: doc.refreshToken,
//     expires_at: doc.expiresAt.getTime(),
//     realmId: doc.realmId,
//   };
//   return cachedToken;
// }

// async function saveToken({ access_token, refresh_token, expires_at, realmId }) {
//   cachedToken = { access_token, refresh_token, expires_at, realmId };
//   await QboToken.findOneAndUpdate(
//     { environment: ENV_KEY },
//     { realmId, accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(expires_at), environment: ENV_KEY },
//     { upsert: true, new: true }
//   );
// }

// function isTokenExpired(token) {
//   return !token?.access_token || Date.now() >= token.expires_at - 120000;
// }

// async function ensureValidToken() {
//   let token = await loadToken();
//   if (!isTokenExpired(token)) return token.access_token;

//   if (!token?.refresh_token) {
//     throw new Error("QBO: No refresh token available. Re-authorize the app.");
//   }

//   oauthClient.setToken({ access_token: token.access_token, refresh_token: token.refresh_token });
//   const authResponse = await oauthClient.refreshUsingToken(token.refresh_token);
//   const newToken = authResponse.getToken();

//   await saveToken({
//     access_token: newToken.access_token,
//     refresh_token: newToken.refresh_token || token.refresh_token,
//     expires_at: Date.now() + (newToken.expires_in || 3600) * 1000,
//     realmId: token.realmId,
//   });

//   console.log("[QBO] Token refreshed and persisted");
//   return newToken.access_token;
// }

// async function qboRequest(method, path, data = null) {
//   const accessToken = await ensureValidToken();
//   const token = await loadToken();
//   const url = `${BASE_URL}/v3/company/${token.realmId}${path}`;

//   const config = {
//     method,
//     url,
//     headers: {
//       Authorization: `Bearer ${accessToken}`,
//       Accept: "application/json",
//       "Content-Type": "application/json",
//     },
//   };
//   if (data) config.data = data;

//   try {
//     const res = await axios(config);
//     return res.data;
//   } catch (err) {
//     const qboErr = err.response?.data?.Fault?.Error?.[0];
//     const message = qboErr
//       ? `QBO ${qboErr.code}: ${qboErr.Message} — ${qboErr.Detail || ""}`
//       : err.message;
//     const error = new Error(message);
//     error.status = err.response?.status;
//     error.qbo = qboErr;
//     throw error;
//   }
// }

// async function findOrCreateCustomer(user) {
//   if (!user) throw new Error("User is required");

//   if (user.qboCustomerId) {
//     try {
//       const data = await qboRequest("GET", `/customer/${user.qboCustomerId}`);
//       return data.Customer;
//     } catch (e) {
//       console.warn(`[QBO] Stored qboCustomerId ${user.qboCustomerId} invalid, re-matching`);
//     }
//   }

//   const email = (user.email || "").toLowerCase().trim();
//   const displayName = (user.name || "Unknown Customer").trim();

//   if (email) {
//     const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email.replace(/'/g, "\\'")}'`;
//     const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
//     const customers = data.QueryResponse?.Customer || [];
//     if (customers.length === 1) return customers[0];
//     if (customers.length > 1) {
//       const exact = customers.find((c) => c.DisplayName === displayName);
//       if (exact) return exact;
//       console.warn(`[QBO] Multiple customers for email ${email}, using first`);
//       return customers[0];
//     }
//   }

//   const nameQuery = `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
//   const nameData = await qboRequest("GET", `/query?query=${encodeURIComponent(nameQuery)}&minorversion=65`);
//   const byName = nameData.QueryResponse?.Customer || [];
//   if (byName.length === 1) return byName[0];
//   if (byName.length > 1) {
//     const err = new Error(`QBO: Multiple customers found with DisplayName "${displayName}". Manual match required.`);
//     err.code = "AMBIGUOUS_CUSTOMER";
//     throw err;
//   }

//   const payload = {
//     DisplayName: displayName,
//     GivenName: displayName.split(" ")[0] || displayName,
//     FamilyName: displayName.split(" ").slice(1).join(" ") || undefined,
//     PrimaryEmailAddr: email ? { Address: email } : undefined,
//     PrimaryPhone: user.phone ? { FreeFormNumber: user.phone } : undefined,
//   };
//   Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

//   try {
//     const data = await qboRequest("POST", "/customer?minorversion=65", payload);
//     return data.Customer;
//   } catch (err) {
//     if (err.message?.includes("Duplicate") || err.qbo?.code === "6240") {
//       const uniqueName = email ? `${displayName} (${email})` : `${displayName} #${Date.now().toString().slice(-4)}`;
//       payload.DisplayName = uniqueName;
//       const data = await qboRequest("POST", "/customer?minorversion=65", payload);
//       return data.Customer;
//     }
//     throw err;
//   }
// }

// async function findInvoiceByDocNumber(docNumber) {
//   if (!docNumber) return null;
//   const query = `SELECT * FROM Invoice WHERE DocNumber = '${String(docNumber).replace(/'/g, "\\'")}'`;
//   const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
//   const invoices = data.QueryResponse?.Invoice || [];
//   return invoices[0] || null;
// }

// async function createQboInvoice({ invoice, user, customerId }) {
//   if (!invoice) throw new Error("Invoice is required");
//   if (!customerId) throw new Error("QBO Customer Id is required");

//   const existing = await findInvoiceByDocNumber(invoice.invoiceNumber);
//   if (existing) {
//     console.log(`[QBO] Invoice ${invoice.invoiceNumber} already exists (Id: ${existing.Id})`);
//     return existing;
//   }

//   const Program = require("../models/programModel");
//   const Enrollment = require("../models/enrollmentModel");
//   const lines = [];

//   async function resolveItemId(programId) {
//     if (!programId) return process.env.QBO_DEFAULT_ITEM_ID || null;
//     const program = await Program.findById(programId);
//     if (!program) return process.env.QBO_DEFAULT_ITEM_ID || null;
//     if (!program.qboItemId) {
//       const item = await syncProgramItem(program); // lazy-sync agar pehle se nahi hua
//       return item.Id;
//     }
//     return program.qboItemId;
//   }

//   if (invoice.isBundle && Array.isArray(invoice.items) && invoice.items.length) {
//     for (const item of invoice.items) {
//       const amount = Number(item.amount || 0) - Number(item.discount || 0);
//       if (amount <= 0) continue;
//       const itemId = await resolveItemId(item.program);
//       lines.push({
//         Amount: amount,
//         DetailType: "SalesItemLineDetail",
//         Description: item.programName || "Program Fee",
//         SalesItemLineDetail: {
//           ItemRef: itemId ? { value: itemId } : undefined,
//           UnitPrice: amount,
//           Qty: 1,
//         },
//       });
//     }
//   } else {
//     const net = Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.discountAmount || 0));
//     // Non-bundle invoice ke liye enrollment se program nikalo
//     let programId = null;
//     if (invoice.enrollment) {
//       const enrollment = await Enrollment.findById(invoice.enrollment).select("program");
//       programId = enrollment?.program;
//     }
//     const itemId = await resolveItemId(programId);
//     lines.push({
//       Amount: net,
//       DetailType: "SalesItemLineDetail",
//       Description: invoice.description || `Invoice ${invoice.invoiceNumber}`,
//       SalesItemLineDetail: {
//         ItemRef: itemId ? { value: itemId } : undefined,
//         UnitPrice: net,
//         Qty: 1,
//       },
//     });
//   }

//   if (!lines.length) throw new Error("QBO: Cannot create invoice with zero lines");
//   lines.forEach((l) => {
//     if (!l.SalesItemLineDetail.ItemRef) delete l.SalesItemLineDetail.ItemRef;
//   });

//   const payload = {
//     CustomerRef: { value: customerId },
//     DocNumber: String(invoice.invoiceNumber),
//     TxnDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
//     DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : undefined,
//     Line: lines,
//     PrivateNote: `CRM Invoice ID: ${invoice._id}`,
//   };
//   Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

//   const data = await qboRequest("POST", "/invoice?minorversion=65", payload);
//   return data.Invoice;
// }

// async function createQboPayment({ payment, invoice, customerId, qboInvoiceId }) {
//   if (!payment || !qboInvoiceId || !customerId) {
//     throw new Error("payment, qboInvoiceId and customerId are required");
//   }
//   if (payment.status !== "approved") {
//     throw new Error("Only approved payments can be synced to QBO");
//   }

//   const depositAccountId =
//     payment.method === "cash"
//       ? process.env.QBO_DEPOSIT_ACCOUNT_CASH
//       : process.env.QBO_DEPOSIT_ACCOUNT_BANK;

//   const payload = {
//     CustomerRef: { value: customerId },
//     TotalAmt: Number(payment.amount),
//     TxnDate: payment.paidAt
//       ? new Date(payment.paidAt).toISOString().slice(0, 10)
//       : new Date().toISOString().slice(0, 10),
//     PaymentRefNum: payment.referenceNumber || undefined,
//     PrivateNote: `CRM Payment ID: ${payment._id} | Method: ${payment.method}`,
//     Line: [
//       {
//         Amount: Number(payment.amount),
//         LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: "Invoice" }],
//       },
//     ],
//   };

//   if (depositAccountId) {
//     payload.DepositToAccountRef = { value: depositAccountId };
//   }
//   Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

//   const data = await qboRequest("POST", "/payment?minorversion=65", payload);
//   return data.Payment;
// }

// async function syncCustomer(userDoc) {
//   try {
//     const customer = await findOrCreateCustomer(userDoc);
//     userDoc.qboCustomerId = customer.Id;
//     userDoc.qboSyncStatus = "synced";
//     userDoc.qboLastSyncedAt = new Date();
//     userDoc.qboSyncError = null;
//     await userDoc.save();
//     return customer;
//   } catch (err) {
//     userDoc.qboSyncStatus = "failed";
//     userDoc.qboSyncError = err.message;
//     await userDoc.save().catch(() => { });
//     throw err;
//   }
// }

// async function syncInvoice(invoiceDoc, userDoc) {
//   try {
//     let customerId = userDoc.qboCustomerId;
//     if (!customerId || userDoc.qboSyncStatus !== "synced") {
//       const customer = await syncCustomer(userDoc);
//       customerId = customer.Id;
//     }

//     const qboInvoice = await createQboInvoice({
//       invoice: invoiceDoc,
//       user: userDoc,
//       customerId,
//     });

//     invoiceDoc.qboInvoiceId = qboInvoice.Id;
//     invoiceDoc.qboSyncStatus = "synced";
//     invoiceDoc.qboLastSyncedAt = new Date();
//     invoiceDoc.qboSyncError = null;
//     await invoiceDoc.save();
//     return qboInvoice;
//   } catch (err) {
//     invoiceDoc.qboSyncStatus = "failed";
//     invoiceDoc.qboSyncError = err.message;
//     await invoiceDoc.save().catch(() => { });
//     throw err;
//   }
// }

// async function syncPayment(paymentDoc, invoiceDoc, userDoc) {
//   try {
//     if (!invoiceDoc.qboInvoiceId) {
//       await syncInvoice(invoiceDoc, userDoc);
//     }

//     const customerId = userDoc.qboCustomerId;
//     if (!customerId) throw new Error("User has no qboCustomerId");

//     if (paymentDoc.qboPaymentId) {
//       console.log(`[QBO] Payment ${paymentDoc._id} already synced (${paymentDoc.qboPaymentId})`);
//       return { Id: paymentDoc.qboPaymentId };
//     }

//     const qboPayment = await createQboPayment({
//       payment: paymentDoc,
//       invoice: invoiceDoc,
//       customerId,
//       qboInvoiceId: invoiceDoc.qboInvoiceId,
//     });

//     paymentDoc.qboPaymentId = qboPayment.Id;
//     paymentDoc.qboSyncStatus = "synced";
//     paymentDoc.qboLastSyncedAt = new Date();
//     paymentDoc.qboSyncError = null;
//     await paymentDoc.save();
//     return qboPayment;
//   } catch (err) {
//     paymentDoc.qboSyncStatus = "failed";
//     paymentDoc.qboSyncError = err.message;
//     await paymentDoc.save().catch(() => { });
//     throw err;
//   }
// }

// function getAuthorizationUri() {
//   return oauthClient.authorizeUri({
//     scope: [OAuthClient.scopes.Accounting],
//     state: "alco-crm-qbo-phase1",
//   });
// }

// async function handleOAuthCallback(url) {
//   const authResponse = await oauthClient.createToken(url);
//   const token = authResponse.getToken();
//   const realmId = token.realmId || oauthClient.getToken().realmId;

//   await saveToken({
//     access_token: token.access_token,
//     refresh_token: token.refresh_token,
//     expires_at: Date.now() + (token.expires_in || 3600) * 1000,
//     realmId,
//   });

//   return { access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, realmId };
// }

// async function getTokenStatus() {
//   const token = await loadToken();
//   return {
//     hasAccessToken: !!token?.access_token,
//     hasRefreshToken: !!token?.refresh_token,
//     expiresAt: token?.expires_at ? new Date(token.expires_at).toISOString() : null,
//     isExpired: isTokenExpired(token),
//     realmId: token?.realmId || null,
//     environment: ENV_KEY,
//   };
// }

// async function getTokenStatus() {
//   const token = await loadToken();
//   return {
//     hasAccessToken: !!token?.access_token,
//     hasRefreshToken: !!token?.refresh_token,
//     expiresAt: token?.expires_at ? new Date(token.expires_at).toISOString() : null,
//     isExpired: isTokenExpired(token),
//     realmId: token?.realmId || null,
//     environment: ENV_KEY,
//   };
// }

// async function findOrCreateItem(programDoc) {
//   if (!programDoc) throw new Error("Program is required");

//   if (programDoc.qboItemId) {
//     try {
//       const data = await qboRequest("GET", `/item/${programDoc.qboItemId}`);
//       return data.Item;
//     } catch (e) {
//       console.warn(`[QBO] Stored qboItemId ${programDoc.qboItemId} invalid, re-matching`);
//     }
//   }

//   const name = (programDoc.name || "Program Fee").trim();
//   const query = `SELECT * FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`;
//   const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
//   const existing = data.QueryResponse?.Item || [];
//   if (existing.length) return existing[0];

//   // Naya Item banao — Income account required hai, apne QBO Sandbox ka default income account Id .env se lo
//   const incomeAccountId = process.env.QBO_DEFAULT_INCOME_ACCOUNT_ID;
//   if (!incomeAccountId) {
//     throw new Error("QBO_DEFAULT_INCOME_ACCOUNT_ID not set — cannot create Item");
//   }

//   const payload = {
//     Name: name,
//     Type: "Service",
//     IncomeAccountRef: { value: incomeAccountId },
//     UnitPrice: programDoc.price || 0,
//   };

//   const created = await qboRequest("POST", "/item?minorversion=65", payload);
//   return created.Item;
// }

// async function syncProgramItem(programDoc) {
//   try {
//     const item = await findOrCreateItem(programDoc);
//     programDoc.qboItemId = item.Id;
//     programDoc.qboSyncStatus = "synced";
//     await programDoc.save();
//     return item;
//   } catch (err) {
//     programDoc.qboSyncStatus = "failed";
//     await programDoc.save().catch(() => {});
//     throw err;
//   }
// }

// function setTokens({ access_token, refresh_token, expires_at }) {
//   if (access_token) tokenStore.access_token = access_token;
//   if (refresh_token) tokenStore.refresh_token = refresh_token;
//   if (expires_at) tokenStore.expires_at = new Date(expires_at).getTime();
// }

// module.exports = {
//   getAuthorizationUri,
//   handleOAuthCallback,
//   getTokenStatus,
//   setTokens,
//   findOrCreateCustomer,
//   syncCustomer,
//   syncInvoice,
//   syncPayment,
//   findOrCreateItem,
//   syncProgramItem,
//   qboRequest,
// }

/**
 * services/qboService.js
 * Phase 1 — QuickBooks Online Integration Service
 */

const axios = require("axios");
const OAuthClient = require("intuit-oauth");
const QboToken = require("../models/qboTokenModel");
const User = require("../models/userModel");

const isProd = process.env.QBO_ENVIRONMENT === "production";
const ENV_KEY = isProd ? "production" : "sandbox";

const oauthClient = new OAuthClient({
  clientId: isProd ? process.env.QBO_PROD_CLIENT_ID : process.env.QBO_DEV_CLIENT_ID,
  clientSecret: isProd ? process.env.QBO_PROD_CLIENT_SECRET : process.env.QBO_DEV_CLIENT_SECRET,
  environment: process.env.QBO_ENVIRONMENT || "sandbox",
  redirectUri: process.env.QBO_REDIRECT_URI,
  logging: process.env.NODE_ENV !== "production",
});

const BASE_URL = isProd
  ? "https://quickbooks.api.intuit.com"
  : "https://sandbox-quickbooks.api.intuit.com";

let cachedToken = null;

// ─────────────────────────────────────────────────────────
// TOKEN PERSISTENCE (MongoDB-backed)
// ─────────────────────────────────────────────────────────

async function loadToken() {
  if (cachedToken) return cachedToken;
  const doc = await QboToken.findOne({ environment: ENV_KEY });
  if (!doc) return null;
  cachedToken = {
    access_token: doc.accessToken,
    refresh_token: doc.refreshToken,
    expires_at: doc.expiresAt.getTime(),
    realmId: doc.realmId,
  };
  return cachedToken;
}

async function saveToken({ access_token, refresh_token, expires_at, realmId }) {
  cachedToken = { access_token, refresh_token, expires_at, realmId };
  await QboToken.findOneAndUpdate(
    { environment: ENV_KEY },
    { realmId, accessToken: access_token, refreshToken: refresh_token, expiresAt: new Date(expires_at), environment: ENV_KEY },
    { upsert: true, new: true }
  );
}

function isTokenExpired(token) {
  return !token?.access_token || Date.now() >= token.expires_at - 120000;
}

async function ensureValidToken() {
  let token = await loadToken();
  if (!isTokenExpired(token)) return token.access_token;

  if (!token?.refresh_token) {
    throw new Error("QBO: No refresh token available. Re-authorize the app.");
  }

  oauthClient.setToken({ access_token: token.access_token, refresh_token: token.refresh_token });
  const authResponse = await oauthClient.refreshUsingToken(token.refresh_token);
  const newToken = authResponse.getToken();

  await saveToken({
    access_token: newToken.access_token,
    refresh_token: newToken.refresh_token || token.refresh_token,
    expires_at: Date.now() + (newToken.expires_in || 3600) * 1000,
    realmId: token.realmId,
  });

  console.log("[QBO] Token refreshed and persisted");
  return newToken.access_token;
}

// ─────────────────────────────────────────────────────────
// CORE REQUEST WRAPPER (dry-run aware)
// ─────────────────────────────────────────────────────────

async function qboRequest(method, path, data = null, options = {}) {
  const { dryRun = false } = options;

  if (dryRun && method !== "GET") {
    console.log(`\n[QBO DRY RUN] Would send: ${method} ${path}`);
    console.log(`[QBO DRY RUN] Payload:`, JSON.stringify(data, null, 2));
    return { DryRun: true, Id: "DRY-RUN-FAKE-ID", DocNumber: data?.DocNumber || null };
  }

  const accessToken = await ensureValidToken();
  const token = await loadToken();
  const url = `${BASE_URL}/v3/company/${token.realmId}${path}`;

  const config = {
    method,
    url,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (data) config.data = data;

  try {
    const res = await axios(config);
    return res.data;
  } catch (err) {
    const qboErr = err.response?.data?.Fault?.Error?.[0];
    const message = qboErr
      ? `QBO ${qboErr.code}: ${qboErr.Message} — ${qboErr.Detail || ""}`
      : err.message;
    const error = new Error(message);
    error.status = err.response?.status;
    error.qbo = qboErr;
    throw error;
  }
}

// ─────────────────────────────────────────────────────────
// CUSTOMER
// ─────────────────────────────────────────────────────────

async function findOrCreateCustomer(user, options = {}) {
  if (!user) throw new Error("User is required");

  // Step 1: agar CRM mein already qboCustomerId save hai, wahi use karo
  if (user.qboCustomerId) {
    try {
      const data = await qboRequest("GET", `/customer/${user.qboCustomerId}`);
      return data.Customer;
    } catch (e) {
      console.warn(`[QBO] Stored qboCustomerId ${user.qboCustomerId} invalid, re-matching`);
    }
  }

  const email = (user.email || "").toLowerCase().trim();
  const displayName = (user.name || "Unknown Customer").trim();

  if (email) {
    const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email.replace(/'/g, "\\'")}'`;
    const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
    const customers = data.QueryResponse?.Customer || [];
    if (customers.length === 1) return customers[0];
    if (customers.length > 1) {
      const exact = customers.find((c) => c.DisplayName === displayName);
      if (exact) return exact;
      console.warn(`[QBO] Multiple customers for email ${email}, using first`);
      return customers[0];
    }
  }

  const nameQuery = `SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`;
  const nameData = await qboRequest("GET", `/query?query=${encodeURIComponent(nameQuery)}&minorversion=65`);
  const byName = nameData.QueryResponse?.Customer || [];
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    const err = new Error(`QBO: Multiple customers found with DisplayName "${displayName}". Manual match required.`);
    err.code = "AMBIGUOUS_CUSTOMER";
    throw err;
  }

  const payload = {
    DisplayName: displayName,
    GivenName: displayName.split(" ")[0] || displayName,
    FamilyName: displayName.split(" ").slice(1).join(" ") || undefined,
    PrimaryEmailAddr: email ? { Address: email } : undefined,
    PrimaryPhone: user.phone ? { FreeFormNumber: user.phone } : undefined,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  try {
    const data = await qboRequest("POST", "/customer?minorversion=65", payload, options);
    return data.Customer || data;
  } catch (err) {
    if (err.message?.includes("Duplicate") || err.qbo?.code === "6240") {
      const uniqueName = email ? `${displayName} (${email})` : `${displayName} #${Date.now().toString().slice(-4)}`;
      payload.DisplayName = uniqueName;
      const data = await qboRequest("POST", "/customer?minorversion=65", payload, options);
      return data.Customer || data;
    }
    throw err;
  }
}

async function syncCustomer(userDoc, options = {}) {
  try {
    const customer = await findOrCreateCustomer(userDoc, options);
    if (options.dryRun) {
      console.log(`[QBO DRY RUN] Would set user.qboCustomerId = ${customer.Id}`);
      return customer;
    }

    const updatePayload = {
      qboCustomerId: customer.Id,
      qboSyncStatus: "synced",
      qboLastSyncedAt: new Date(),
      qboSyncError: null,
    };

    await User.findByIdAndUpdate(
      userDoc._id,
      { $set: updatePayload },
      { runValidators: false, session: options.session }  // ✅ sirf changed fields, poora doc validate nahi hota
    );

    // in-memory object bhi update kar do taake baaki code (jaise createQboInvoice) turant sahi value use kare
    Object.assign(userDoc, updatePayload);

    return customer;
  } catch (err) {
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// ITEM (Program → QBO Service Item)
// ─────────────────────────────────────────────────────────

async function findOrCreateItem(programDoc, options = {}) {
  if (!programDoc) throw new Error("Program is required");

  const desiredIncomeAccountId = programDoc.qboIncomeAccountId || process.env.QBO_DEFAULT_INCOME_ACCOUNT_ID;
  if (!desiredIncomeAccountId) {
    throw new Error(`QBO income account not set for program "${programDoc.name}" — set qboIncomeAccountId`);
  }

  if (programDoc.qboItemId) {
    try {
      const data = await qboRequest("GET", `/item/${programDoc.qboItemId}`);
      const item = data.Item;
      if (item.IncomeAccountRef?.value !== desiredIncomeAccountId) {
        return await updateItemIncomeAccount(item, desiredIncomeAccountId, options);
      }
      return item;
    } catch (e) {
      console.warn(`[QBO] Stored qboItemId ${programDoc.qboItemId} invalid, re-matching`);
    }
  }

  const name = (programDoc.name || "Program Fee").trim();
  const query = `SELECT * FROM Item WHERE Name = '${name.replace(/'/g, "\\'")}'`;
  const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
  const existing = data.QueryResponse?.Item || [];

  if (existing.length) {
    const item = existing[0];
    // ✅ purana item galat (e.g. Checking/generic) account pe hai to sahi sub-account pe fix karo
    if (item.IncomeAccountRef?.value !== desiredIncomeAccountId) {
      return await updateItemIncomeAccount(item, desiredIncomeAccountId, options);
    }
    return item;
  }

  const payload = {
    Name: name,
    Type: "Service",
    IncomeAccountRef: { value: desiredIncomeAccountId },
    UnitPrice: programDoc.price || 0,
  };

  try {
    const created = await qboRequest("POST", "/item?minorversion=65", payload, options);
    return created.Item || created;
  } catch (err) {
    if (err.message?.includes("Duplicate") || err.qbo?.code === "6240") {
      const uniqueName = `${name} #${Date.now().toString().slice(-4)}`;
      payload.Name = uniqueName;
      const created = await qboRequest("POST", "/item?minorversion=65", payload, options);
      return created.Item || created;
    }
    throw err;
  }
}

async function updateItemIncomeAccount(item, incomeAccountId, options = {}) {
  if (options.dryRun) {
    console.log(`[QBO DRY RUN] Would update Item ${item.Id} IncomeAccountRef → ${incomeAccountId}`);
    return { ...item, IncomeAccountRef: { value: incomeAccountId } };
  }
  const payload = {
    Id: item.Id,
    SyncToken: item.SyncToken,
    sparse: true,
    IncomeAccountRef: { value: incomeAccountId },
  };
  const updated = await qboRequest("POST", "/item?minorversion=65", payload, options);
  return updated.Item || updated;
}

async function syncProgramItem(programDoc, options = {}) {
  try {
    const item = await findOrCreateItem(programDoc, options);
    if (options.dryRun) {
      console.log(`[QBO DRY RUN] Would set program.qboItemId = ${item.Id}`);
      return item;
    }
    programDoc.qboItemId = item.Id;
    programDoc.qboSyncStatus = "synced";
    await programDoc.save();
    return item;
  } catch (err) {
    if (!options.dryRun) {
      programDoc.qboSyncStatus = "failed";
      await programDoc.save().catch(() => { });
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// INVOICE
// ─────────────────────────────────────────────────────────

async function findInvoiceByDocNumber(docNumber) {
  if (!docNumber) return null;
  const query = `SELECT * FROM Invoice WHERE DocNumber = '${String(docNumber).replace(/'/g, "\\'")}'`;
  const data = await qboRequest("GET", `/query?query=${encodeURIComponent(query)}&minorversion=65`);
  const invoices = data.QueryResponse?.Invoice || [];
  return invoices[0] || null;
}

async function createQboInvoice({ invoice, user, customerId }, options = {}) {
  if (!invoice) throw new Error("Invoice is required");
  if (!customerId) throw new Error("QBO Customer Id is required");

  if (!options.dryRun) {
    const existing = await findInvoiceByDocNumber(invoice.invoiceNumber);
    if (existing) {
      console.log(`[QBO] Invoice ${invoice.invoiceNumber} already exists (Id: ${existing.Id})`);
      return existing;
    }
  }

  const Program = require("../models/programModel");
  const Enrollment = require("../models/enrollmentModel");
  const lines = [];

  async function resolveItemId(programId, feeType) {
    if (!programId) return process.env.QBO_DEFAULT_ITEM_ID || null;
    const program = await Program.findById(programId);
    if (!program) return process.env.QBO_DEFAULT_ITEM_ID || null;

    if (feeType === "certificate") {
      if (program.qboCertificateItemId) return program.qboCertificateItemId;
      console.warn(`[QBO] No qboCertificateItemId for "${program.name}" — falling back to main program item`);
    } else if (feeType === "manual") {
      if (program.qboManualItemId) return program.qboManualItemId;
      console.warn(`[QBO] No qboManualItemId for "${program.name}" — falling back to main program item`);
    }

    if (!program.qboItemId || program.qboSyncStatus !== "synced") {
      const item = await syncProgramItem(program, options);
      return item.Id;
    }
    return program.qboItemId;
  }


  // if (Array.isArray(invoice.items) && invoice.items.length) {
  //   const totalDiscount = Number(invoice.discountAmount || 0);

  //   for (const item of invoice.items) {
  //     let gross = Number(item.amount || 0);
  //     if (gross <= 0) continue;

  //     // ✅ Discount sirf program fee pe lagta hai — QBO ko program line ki
  //     // GROSS (discount se pehle wali) amount bhejo, taake QBO ka apna
  //     // Discount line sahi subtract kar sake. Certificate/Manual lines
  //     // untouched rehte hain — unme discount kabhi add/subtract nahi hota.
  //     const isProgramLine = !item.feeType || item.feeType === "program";
  //     if (isProgramLine && totalDiscount > 0) {
  //       gross += totalDiscount;
  //     }

  //     const itemId = await resolveItemId(item.program, item.feeType);
  //     lines.push({
  //       Amount: gross,
  //       DetailType: "SalesItemLineDetail",
  //       Description: item.programName || "Program Fee",
  //       SalesItemLineDetail: {
  //         ItemRef: itemId ? { value: itemId } : undefined,
  //         UnitPrice: gross,
  //         Qty: 1,
  //       },
  //     });
  //   }

  //   if (totalDiscount > 0) {
  //     const discountAccountId = process.env.QBO_DISCOUNT_ACCOUNT_ID;
  //     lines.push({
  //       Amount: totalDiscount,
  //       DetailType: "DiscountLineDetail",
  //       Description: "Discount",
  //       DiscountLineDetail: {
  //         PercentBased: false,
  //         ...(discountAccountId ? { DiscountAccountRef: { value: discountAccountId } } : {}),
  //       },
  //     });
  //   }
  // }
  if (Array.isArray(invoice.items) && invoice.items.length) {
    let totalItemDiscount = 0;
    for (const item of invoice.items) {
      const gross = Number(item.amount || 0) - Number(item.discount || 0);
      if (gross <= 0) continue;
      const itemId = await resolveItemId(item.program, item.feeType);
      lines.push({
        Amount: gross,
        DetailType: "SalesItemLineDetail",
        Description: item.programName || "Program Fee",
        SalesItemLineDetail: {
          ItemRef: itemId ? { value: itemId } : undefined,
          UnitPrice: gross,
          Qty: 1,
        },
      });
      totalItemDiscount += Number(item.discount || 0);
    }

    const discount = totalItemDiscount || Number(invoice.discountAmount || 0);
    if (discount > 0) {
      const discountAccountId = process.env.QBO_DISCOUNT_ACCOUNT_ID;
      lines.push({
        Amount: discount,
        DetailType: "DiscountLineDetail",
        Description: "Discount",
        DiscountLineDetail: {
          PercentBased: false,
          ...(discountAccountId ? { DiscountAccountRef: { value: discountAccountId } } : {}),
        },
      });
    }
  } else {
    const gross = Number(invoice.totalAmount || 0);
    const discount = Number(invoice.discountAmount || 0);

    let programId = null;
    if (invoice.enrollment) {
      const enrollment = await Enrollment.findById(invoice.enrollment).select("program");
      programId = enrollment?.program;
    }
    const itemId = await resolveItemId(programId, "program");

    if (gross > 0) {
      lines.push({
        Amount: gross,
        DetailType: "SalesItemLineDetail",
        Description: invoice.description || `Invoice ${invoice.invoiceNumber}`,
        SalesItemLineDetail: {
          ItemRef: itemId ? { value: itemId } : undefined,
          UnitPrice: gross,
          Qty: 1,
        },
      });
    }

    if (discount > 0) {
      lines.push({
        Amount: discount,
        DetailType: "DiscountLineDetail",
        Description: "Discount",
        DiscountLineDetail: { PercentBased: false, DiscountAccountRef: { value: process.env.QBO_DISCOUNT_ACCOUNT_ID } },
      });
    }
  }

  if (!lines.length) throw new Error("QBO: Cannot create invoice with zero lines");
  lines.forEach((l) => {
    if (l.SalesItemLineDetail && !l.SalesItemLineDetail.ItemRef) {
      delete l.SalesItemLineDetail.ItemRef;
    }
  });

  const payload = {
    CustomerRef: { value: customerId },
    DocNumber: String(invoice.invoiceNumber),
    TxnDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    DueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : undefined,
    Line: lines,
    PrivateNote: `CRM Invoice ID: ${invoice._id}`,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const data = await qboRequest("POST", "/invoice?minorversion=65", payload, options);
  return data.Invoice || data;
}

async function syncInvoice(invoiceDoc, userDoc, options = {}) {
  try {
    let customerId = userDoc.qboCustomerId;
    if (!customerId || userDoc.qboSyncStatus !== "synced") {
      const customer = await syncCustomer(userDoc, options);
      customerId = customer.Id;
    }

    const qboInvoice = await createQboInvoice({ invoice: invoiceDoc, user: userDoc, customerId }, options);

    if (options.dryRun) return qboInvoice;

    if (options.dryRun) {
      console.log(`[QBO DRY RUN] Would set invoice.qboInvoiceId = ${qboInvoice.Id}`);
      return qboInvoice;
    }

    invoiceDoc.qboInvoiceId = qboInvoice.Id;
    invoiceDoc.qboSyncStatus = "synced";
    invoiceDoc.qboLastSyncedAt = new Date();
    invoiceDoc.qboSyncError = null;
    await invoiceDoc.save(options.session ? { session: options.session } : undefined);
    return qboInvoice;
  } catch (err) {
    console.error("[QBO] syncInvoice REAL error:", err.message);
    console.error("[QBO] syncInvoice error stack:", err.stack);

    if (!options.dryRun && typeof invoiceDoc?.save === "function") {
      try {
        invoiceDoc.qboSyncStatus = "failed";
        invoiceDoc.qboSyncError = err.message;
        await invoiceDoc.save();
      } catch (saveErr) {
        console.error("[QBO] Could not persist failed status:", saveErr.message);
      }
    } else if (typeof invoiceDoc?.save !== "function") {
      console.error("[QBO] WARNING: invoiceDoc is not a proper Mongoose document!", typeof invoiceDoc, invoiceDoc?.constructor?.name);
    }

    throw err;   // ✅ asal error hi throw hoga, mask nahi hoga
  }
}

// ─────────────────────────────────────────────────────────
// PAYMENT
// ─────────────────────────────────────────────────────────

async function createQboPayment({ payment, invoice, customerId, qboInvoiceId }, options = {}) {
  if (!payment || !qboInvoiceId || !customerId) {
    throw new Error("payment, qboInvoiceId and customerId are required");
  }
  if (payment.status !== "approved") {
    throw new Error("Only approved payments can be synced to QBO");
  }

  const depositAccountId =
    payment.method === "cash"
      ? process.env.QBO_DEPOSIT_ACCOUNT_CASH
      : process.env.QBO_DEPOSIT_ACCOUNT_BANK;

  const payload = {
    CustomerRef: { value: customerId },
    TotalAmt: Number(payment.amount),
    TxnDate: payment.paidAt
      ? new Date(payment.paidAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    PaymentRefNum: payment.referenceNumber || undefined,
    PrivateNote: `${payment.notes || "Payment"} | Invoice ${invoice.invoiceNumber} | CRM Payment ID: ${payment._id}`,  // ✅ updated
    Line: [
      {
        Amount: Number(payment.amount),
        LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: "Invoice" }],
      },
    ],
  };

  if (depositAccountId) {
    payload.DepositToAccountRef = { value: depositAccountId };
  }
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const data = await qboRequest("POST", "/payment?minorversion=65", payload, options);
  return data.Payment || data;
}

async function syncPayment(paymentDoc, invoiceDoc, userDoc, options = {}) {
  try {
    if (!invoiceDoc.qboInvoiceId) {
      await syncInvoice(invoiceDoc, userDoc, options);
    }

    const customerId = userDoc.qboCustomerId;
    if (!customerId) throw new Error("User has no qboCustomerId");

    if (paymentDoc.qboPaymentId) {
      console.log(`[QBO] Payment ${paymentDoc._id} already synced (${paymentDoc.qboPaymentId})`);
      return { Id: paymentDoc.qboPaymentId };
    }

    const qboPayment = await createQboPayment(
      { payment: paymentDoc, invoice: invoiceDoc, customerId, qboInvoiceId: invoiceDoc.qboInvoiceId },
      options
    );

    if (options.dryRun) {
      console.log(`[QBO DRY RUN] Would set payment.qboPaymentId = ${qboPayment.Id}`);
      return qboPayment;
    }

    paymentDoc.qboPaymentId = qboPayment.Id;
    paymentDoc.qboSyncStatus = "synced";
    paymentDoc.qboLastSyncedAt = new Date();
    paymentDoc.qboSyncError = null;
    await paymentDoc.save();
    return qboPayment;
  } catch (err) {
    if (!options.dryRun) {
      paymentDoc.qboSyncStatus = "failed";
      paymentDoc.qboSyncError = err.message;
      await paymentDoc.save().catch(() => { });
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
// OAUTH
// ─────────────────────────────────────────────────────────

function getAuthorizationUri() {
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "alco-crm-qbo-phase1",
  });
}

async function handleOAuthCallback(url) {
  const authResponse = await oauthClient.createToken(url);
  const token = authResponse.getToken();
  const realmId = token.realmId || oauthClient.getToken().realmId;

  await saveToken({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: Date.now() + (token.expires_in || 3600) * 1000,
    realmId,
  });

  return { access_token: token.access_token, refresh_token: token.refresh_token, expires_in: token.expires_in, realmId };
}

async function getTokenStatus() {
  const token = await loadToken();
  return {
    hasAccessToken: !!token?.access_token,
    hasRefreshToken: !!token?.refresh_token,
    expiresAt: token?.expires_at ? new Date(token.expires_at).toISOString() : null,
    isExpired: isTokenExpired(token),
    realmId: token?.realmId || null,
    environment: ENV_KEY,
  };
}

// ─────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────

module.exports = {
  qboRequest,
  ensureValidToken,
  getAuthorizationUri,
  handleOAuthCallback,
  getTokenStatus,
  findOrCreateCustomer,
  syncCustomer,
  findOrCreateItem,
  updateItemIncomeAccount,
  syncProgramItem,
  findInvoiceByDocNumber,
  createQboInvoice,
  createQboPayment,
  syncInvoice,
  syncPayment,
};