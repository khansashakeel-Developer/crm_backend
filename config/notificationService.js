const Notification = require("../models/notificationModel.js");
const { sendNotificationToUser } = require("./socket");


// ── Core: notification create karo + socket emit karo ────────
const createNotification = async ({
  user_id,
  type,
  title,
  message,
  lead_id,
  activity_id,
  triggered_by,
}) => {
  const notification = await Notification.create({
    user_id,
    type,
    title,
    message,
    lead_id,
    activity_id,
    triggered_by,
  });

  const populated = await notification.populate("triggered_by", "name role");

  // Real-time socket emit
  sendNotificationToUser(user_id.toString(), {
    _id: populated._id,
    type: populated.type,
    title: populated.title,
    message: populated.message,
    lead_id: populated.lead_id,
    activity_id: populated.activity_id,
    triggered_by: populated.triggered_by,
    is_read: false,
    createdAt: populated.createdAt,
  });

  return populated;
};

// ── Lead assign hone pe ──────────────────────────────────────
const notifyLeadAssigned = ({ userId, leadName, leadId, assignedBy }) => {
  return createNotification({
    user_id: userId,
    type: "lead_assigned",
    title: "Lead Assigned to You",
    message: `Lead "${leadName}" has been assigned to you.`,
    lead_id: leadId,
    triggered_by: assignedBy,
  });
};

// ── Activity add hone pe ─────────────────────────────────────
const notifyActivityAdded = ({ userId, leadName, leadId, activityId, activityType, addedBy }) => {
  return createNotification({
    user_id: userId,
    type: "activity_added",
    title: "New Activity on Your Request",
    message: `A ${activityType} was logged for your request "${leadName}".`,
    lead_id: leadId,
    activity_id: activityId,
    triggered_by: addedBy,
  });
};

// ── Status change hone pe ────────────────────────────────────
const notifyStatusChanged = ({ userId, leadName, leadId, newStatus, changedBy }) => {
  return createNotification({
    user_id: userId,
    type: "status_changed",
    title: "Request Status Updated",
    message: `Your request "${leadName}" status changed to "${newStatus}".`,
    lead_id: leadId,
    triggered_by: changedBy,
  });
};

// ── Payment plan set hone pe ─────────────────────────────────
const notifyPaymentPlanSet = ({ userId, leadName, leadId, triggeredBy }) => {
  return createNotification({
    user_id: userId,
    type: "payment_plan_set",
    title: "Payment Plan Ready 💳",
    message: `Your payment plan for "${leadName}" has been set. Please review it in your dashboard.`,
    lead_id: leadId,
    triggered_by: triggeredBy,
  });
};

// ── Contract submit hone pe (admin ko) ──────────────────────
const notifyContractSubmitted = ({ userId, leadName, leadId, triggeredBy }) => {
  return createNotification({
    user_id: userId,
    type: "contract_submitted",
    title: "Contract Signed ✅",
    message: `${leadName} has signed the contract`,
    lead_id: leadId,
    triggered_by: triggeredBy,
  });
};

// Access extend hone pe — user ko
const notifyAccessExtended = ({ userId, days, triggeredBy }) => {
  return createNotification({
    user_id: userId,
    type: "access_extended",
    title: "Access Extended ✅",
    message: `Your access has been extended by ${days} days.`,
    triggered_by: triggeredBy,
  });
};

// Finance pool khatam — admin ko
const notifyPoolExhausted = ({ adminId, enrollmentId, triggeredBy }) => {
  return createNotification({
    user_id: adminId,
    type: "pool_exhausted",
    title: "Finance Grace Pool Exhausted ⚠️",
    message: `Enrollment ${enrollmentId}'s finance grace pool has been exhausted. Admin intervention required.`,
    triggered_by: triggeredBy,
  });
};

// notificationController.js mein add karo
const notifyBookRequested = ({ adminId, userName, bookTitle, leadId }) => {
  return createNotification({
    user_id:     adminId,   // super_admin ka _id
    type:        "book_requested",
    title:       "New Book Request 📚",
    message:     `${userName} has requested the book "${bookTitle}".`,
    lead_id:     leadId,    // click karke lead pe ja sake
  });
};


// Cheque discarded — notify every finance/admin/super_admin recipient
const notifyChequeDiscarded = async ({ userIds, chequeNumber, amount, invoiceNumber, reason, triggeredBy }) => {
  return Promise.all(
    (userIds || []).map((uid) =>
      createNotification({
        user_id: uid,
        type: "cheque_discarded",
        title: "Cheque Discarded",
        message: `Cheque #${chequeNumber} (Rs ${Number(amount || 0).toLocaleString()}) on invoice ${invoiceNumber} was discarded${reason ? ` — ${reason}` : ""}.`,
        triggered_by: triggeredBy || undefined,
      })
    )
  );
};

const notifyChequeExpired = async ({ userIds, chequeNumber, amount, invoiceNumber, triggeredBy }) => {
  return Promise.all(
    (userIds || []).map((uid) =>
      createNotification({
        user_id: uid,
        type: "cheque_discarded",
        title: "Cheque Expired",
        message: `Cheque #${chequeNumber} (Rs ${Number(amount || 0).toLocaleString()}) on invoice ${invoiceNumber} has passed its 6-month validity. It has NOT been discarded automatically — review and discard manually if needed.`,
        triggered_by: triggeredBy || undefined,
      })
    )
  );
};

module.exports = {
  createNotification,
  notifyLeadAssigned,
  notifyActivityAdded,
  notifyStatusChanged,
  notifyPaymentPlanSet,
  notifyContractSubmitted,
  notifyAccessExtended,
  notifyPoolExhausted,
  notifyBookRequested,
  notifyChequeDiscarded,
  notifyChequeExpired,
};