const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    program_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },
    name: {
      type: String,
      required: true, // e.g. "Batch 2026-A"
    },
    date_required: {
      type: Boolean,
      default: true,
    },
    start_date: {
      type: Date,
      // required: true,      
    },
    end_date: Date,
    max_students: {
      type: Number,
      default: 30,
    },
    current_students: {
      type: Number,
      default: 0,
    },
     mode: {
      type: String,
      enum: ["online", "physical"],
      default: "online",
    },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["upcoming", "active", "completed", "cancelled"],
      default: "upcoming",
    },
    instructor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Batch", batchSchema);