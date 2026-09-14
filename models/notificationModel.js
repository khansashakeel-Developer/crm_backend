const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["lead_assigned", "activity_added", "status_changed", "general", "payment_plan_set", "contract_submitted", "access_extended", "pool_exhausted",
        "book_requested", "cheque_discarded"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: "Lead" },
    activity_id: { type: mongoose.Schema.Types.ObjectId, ref: "Activity" },
    triggered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    is_read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Fast query ke liye index
notificationSchema.index({ user_id: 1, is_read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);