// controllers/enrollmentController.js
const Enrollment = require("../models/enrollmentModel.js");
const Invoice = require("../models/invoiceModel.js");
const Batch = require("../models/batchModel");
const Payment = require("../models/paymentModel.js");
const ExcelJS = require("exceljs");
const User = require("../models/userModel.js");

// CREATE ENROLLMENT (Improved)
exports.createEnrollment = async (req, res) => {
  try {
    const { user, program, batch, paymentPlan, audioAccess } = req.body; // Include paymentPlan

    if (!user || !program || !paymentPlan) {
      return res.status(400).json({
        success: false,
        message: "User, Program, and Payment Plan are required",
      });
    }



    const existing = await Enrollment.findOne({ user, program });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "User already enrolled in this program",
      });
    }

    const enrollment = await Enrollment.create({
      user,
      program,
      batch,
      paymentPlan, // Save payment plan details
      status: "Pending" // Set initial status to Pending
    });

    if (batch) {
      const updatedBatch = await Batch.findOneAndUpdate(
        { _id: batch, students: { $ne: user } }, // agar already enrolled to skip
        {
          $addToSet: { students: user },
          $inc: { current_students: 1 },
        },
        { new: true }
      );
    }

    res.status(201).json({
      success: true,
      data: enrollment,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.createEnrollmentDirect = async (req, res) => {
  try {
    // const { user, program, batch, paymentPlan } = req.body; // Include paymentPlan

    // if (!user || !program || !paymentPlan) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "User, Program, and Payment Plan are required",
    //   });
    // }
    const { user, program, batch, audioAccess } = req.body; // Include paymentPlan

    if (!user || !program) {
      return res.status(400).json({
        success: false,
        message: "User, Program, and Payment Plan are required",
      });
    }


    const existing = await Enrollment.findOne({ user, program });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "User already enrolled in this program",
      });
    }

    const enrollment = await Enrollment.create({
      user,
      program,
      batch,
      audioAccess: audioAccess ?? true,
      assigned_to: req.user._id,
      // paymentPlan, // Save payment plan details
      // status: "Pending" // Set initial status to Pending
    });

    if (batch) {
      const updatedBatch = await Batch.findOneAndUpdate(
        { _id: batch, students: { $ne: user } }, // agar already enrolled to skip
        {
          $addToSet: { students: user },
          $inc: { current_students: 1 },
        },
        { new: true }
      );
    }

    res.status(201).json({
      success: true,
      data: enrollment,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// MY ENROLLMENTS
exports.getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ user: req.user.id })
      .populate("program")
      .populate("batch", "name mode start_date end_date status date_required")

    res.json({
      success: true,
      data: enrollments,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// createEnrollmentDirectBundle — per-program batch support
exports.createEnrollmentDirectBundle = async (req, res) => {
  try {
    // programBatches: [{ program: "id1", batch: "batchId1" }, { program: "id2", batch: "batchId2" }]
    const { user, programBatches } = req.body;

    if (!user || !Array.isArray(programBatches) || programBatches.length < 2) {
      return res.status(400).json({
        success: false,
        message: "User and at least 2 program-batch pairs are required for bundle",
      });
    }

    // duplicate check
    for (const { program } of programBatches) {
      const exists = await Enrollment.findOne({ user, program });
      if (exists) {
        return res.status(409).json({
          success: false,
          message: `User already enrolled in one of the selected programs`,
        });
      }
    }

    const enrollments = [];
    for (const { program, batch, audioAccess } of programBatches) {
      const enrollment = await Enrollment.create({
        user,
        program,
        batch: batch || undefined,
        audioAccess: audioAccess ?? true,
        assigned_to: req.user._id,
      });
      enrollments.push(enrollment);

      if (batch) {
        await Batch.findOneAndUpdate(
          { _id: batch, students: { $ne: user } },
          { $addToSet: { students: user }, $inc: { current_students: 1 } }
        );
      }
    }

    res.status(201).json({ success: true, data: enrollments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// exports.getAllEnrollments = async (req, res) => {
//   try {
//     const page = Number(req.query.page) || 1;
//     const limit = Number(req.query.limit) || 10;

//     const enrollments = await Enrollment.find()
//       .populate("user program batch")
//       .skip((page - 1) * limit)
//       .limit(limit)
//       .sort({ createdAt: -1 });

//     const total = await Enrollment.countDocuments();

//     res.json({
//       success: true,
//       data: enrollments,
//       meta: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// ALL ENROLLMENTS (ADMIN) — grouped by user
// exports.getAllEnrollments = async (req, res) => {
//   try {
//     const page = Number(req.query.page) || 1;
//     const limit = Number(req.query.limit) || 10;

//     // Step 1: Pehle unique users count karo pagination ke liye
//     const uniqueUsers = await Enrollment.distinct("user");
//     const total = uniqueUsers.length;

//     // Step 2: Paginated unique user IDs nikalo
//     const paginatedUserIds = uniqueUsers.slice(
//       (page - 1) * limit,
//       page * limit
//     );

//     // Step 3: Sirf un users ki enrollments fetch karo
//     const enrollments = await Enrollment.find({
//       user: { $in: paginatedUserIds },
//     })
//       .populate("user program batch")
//       .sort({ createdAt: -1 });

//     // Step 4: Group by user
//     const groupedMap = {};

//     for (const enrollment of enrollments) {
//       const userId = enrollment.user?._id?.toString();
//       if (!userId) continue;

//       if (!groupedMap[userId]) {
//         groupedMap[userId] = {
//           user: enrollment.user,         // user object ek baar
//           enrollments: [],               // programs array
//         };
//       }

//       // Enrollment object se user hata do (duplicate avoid)
//       const { user, ...enrollmentData } = enrollment.toObject();

//       groupedMap[userId].enrollments.push(enrollmentData);
//     }

//     const data = Object.values(groupedMap);

//     res.json({
//       success: true,
//       data,
//       meta: {
//         page,
//         limit,
//         total,                                    // total unique users
//         totalPages: Math.ceil(total / limit),
//       },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.getAllEnrollments = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    // const { search, status } = req.query;
    const { search, status, assigned_to, accessStatus, mode = "online" } = req.query;

    // Step 1: Enrollment level filter (status)
    const enrollmentFilter = {};
    if (status) enrollmentFilter.status = status;
    if (assigned_to) enrollmentFilter.assigned_to = assigned_to;
    if (accessStatus) enrollmentFilter.accessStatus = accessStatus;

    // mode: "online" (default) | "physical" | "all"
    if (mode !== "all") {
      const physicalBatchIds = await Batch.find({ mode: "physical" }).distinct("_id");
      enrollmentFilter.batch =
        mode === "physical"
          ? { $in: physicalBatchIds }
          : { $nin: physicalBatchIds }; // online + bina batch wali (Business in the Box) dono
    }

    // Step 2: Pehle sari matching enrollments fetch karo (populate ke saath)
    // const allEnrollments = await Enrollment.find(enrollmentFilter)
    //   .populate("user program batch")
    //   .sort({ createdAt: -1 });
    const allEnrollments = await Enrollment.find(enrollmentFilter)
      .populate("user", "name email phone role")
      .populate("program")
      .populate("batch", "name mode start_date end_date status date_required")
      .populate("assigned_to", "name email role")
      .populate("invoice", "isBundle invoiceNumber")
      .sort({ createdAt: -1 });

    // Step 3: Search filter — user name, email, phone pe
    // const filtered = search
    //   ? allEnrollments.filter((e) => {
    //     const q = search.toLowerCase();
    //     return (
    //       e.user?.name?.toLowerCase().includes(q) ||
    //       e.user?.email?.toLowerCase().includes(q) ||
    //       e.user?.phone?.toLowerCase().includes(q) ||
    //       e.program?.name?.toLowerCase().includes(q)
    //     );
    //   })
    //   : allEnrollments;
    const filtered = search
      ? allEnrollments.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.user?.name?.toLowerCase().includes(q) ||
          e.user?.email?.toLowerCase().includes(q) ||
          e.user?.phone?.toLowerCase().includes(q) ||
          e.program?.name?.toLowerCase().includes(q) ||
          e.assigned_to?.name?.toLowerCase().includes(q)
        );
      })
      : allEnrollments;

    // Step 4: Group by user
    const groupedMap = {};
    for (const enrollment of filtered) {
      const userId = enrollment.user?._id?.toString();
      if (!userId) continue;

      if (!groupedMap[userId]) {
        groupedMap[userId] = {
          user: enrollment.user,
          enrollments: [],
        };
      }

      const { user, ...enrollmentData } = enrollment.toObject();
      groupedMap[userId].enrollments.push(enrollmentData);
    }

    const allGrouped = Object.values(groupedMap);

    // Step 5: Pagination — grouped users pe
    const total = allGrouped.length;
    const paginated = allGrouped.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// SINGLE
// exports.getEnrollmentById = async (req, res) => {
//   try {
//     const enrollment = await Enrollment.findById(req.params.id)
//       .populate("user program batch");

//     if (!enrollment) {
//       return res.status(404).json({
//         success: false,
//         message: "Enrollment not found",
//       });
//     }

//     res.json({ success: true, data: enrollment });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// SINGLE
// exports.getEnrollmentById = async (req, res) => {
//   try {
//     const enrollment = await Enrollment.findById(req.params.id)
//       .populate("user", "name email phone role")
//       .populate("program")
//       .populate("batch")
//       .populate("assigned_to", "name email role");

//     if (!enrollment) {
//       return res.status(404).json({
//         success: false,
//         message: "Enrollment not found",
//       });
//     }

//     const Invoice = require("../models/invoiceModel.js");
//     const Payment = require("../models/paymentModel.js");

//     const invoices = await Invoice.find({ enrollment: enrollment._id }).sort({
//       createdAt: -1,
//     });

//     const payments = await Payment.find({
//       invoice: { $in: invoices.map((inv) => inv._id) },
//     }).sort({ createdAt: -1 });

//     // ─── Build unified timeline ───────────────────────────────
//     const timeline = [];

//     // 1) Lead activities (call, email, meeting, note)
//     const leadActivities = enrollment.leadSnapshot?.activities || [];
//     leadActivities.forEach((a) => {
//       timeline.push({
//         type: a.activity_type, // call | email | meeting | note
//         title: a.title,
//         description: a.description,
//         meta: {
//           call_duration_minutes: a.call_duration_minutes,
//           call_outcome: a.call_outcome,
//           email_subject: a.email_subject,
//           meeting_link: a.meeting_link,
//           meeting_location: a.meeting_location,
//         },
//         date: a.createdAt,
//       });
//     });

//     // 2) Contract signed
//     if (enrollment.leadSnapshot?.contractDetails?.signedAt) {
//       timeline.push({
//         type: "contract",
//         title: "Contract Signed",
//         description: `${enrollment.leadSnapshot.contractDetails.fullName} signed the contract`,
//         date: enrollment.leadSnapshot.contractDetails.signedAt,
//       });
//     }

//     // 3) Enrollment created
//     timeline.push({
//       type: "enrollment",
//       title: "Enrollment Created",
//       description: `Enrolled in ${enrollment.program?.name || "program"}`,
//       date: enrollment.enrolledAt || enrollment.createdAt,
//     });

//     // 4) Invoices
//     invoices.forEach((inv) => {
//       timeline.push({
//         type: "invoice",
//         title: `Invoice ${inv.invoiceNumber} Created`,
//         description: `Total: ${inv.totalAmount} | Status: ${inv.status}`,
//         date: inv.createdAt,
//       });
//     });

//     // 5) Payments
//     payments.forEach((p) => {
//       timeline.push({
//         type: "payment",
//         title: `Payment ${p.status === "approved" ? "Received" : p.status}`,
//         description: p.notes || `Amount: ${p.amount} via ${p.method}`,
//         meta: {
//           amount: p.amount,
//           method: p.method,
//           status: p.status,
//         },
//         date: p.approvedAt || p.createdAt,
//       });
//     });

//     // Sort newest → oldest
//     timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

//     res.json({
//       success: true,
//       data: {
//         ...enrollment.toObject(),
//         invoices,
//         payments,
//         timeline,
//       },
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
exports.getEnrollmentById = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id)
      .populate("user", "name email phone role")
      .populate("program")
      .populate("batch")
      .populate("assigned_to", "name email role");

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found",
      });
    }

    const invoices = await Invoice.find({
      $or: [
        { _id: enrollment.invoice },
        { enrollment: enrollment._id },
        { enrollments: enrollment._id },
      ],
    }).sort({ createdAt: -1 });

    const payments = await Payment.find({
      invoice: { $in: invoices.map((inv) => inv._id) },
    }).sort({ createdAt: -1 });

    let bundleSiblings = [];
    const bundleInvoice = invoices.find((inv) => inv.isBundle);

    if (bundleInvoice) {
      const siblingEnrollmentIds = (
        bundleInvoice.enrollments?.length
          ? bundleInvoice.enrollments               // naye invoices ke liye (agar enrollments[] properly save hua ho)
          : bundleInvoice.items?.map((i) => i.enrollment).filter(Boolean)  // 👈 fallback — purane/legacy invoices ke liye
      ).filter((id) => String(id) !== String(enrollment._id));

      if (siblingEnrollmentIds.length) {
        bundleSiblings = await Enrollment.find({ _id: { $in: siblingEnrollmentIds } })
          .populate("program", "name level category")
          .populate("batch", "name start_date end_date");
      }
    }
    // ─── Build unified timeline ───────────────────────────────
    const timeline = [];

    // 1) Lead activities (call, email, meeting, note)
    const leadActivities = enrollment.leadSnapshot?.activities || [];
    leadActivities.forEach((a) => {
      timeline.push({
        type: a.activity_type, // call | email | meeting | note
        title: a.title,
        description: a.description,
        meta: {
          call_duration_minutes: a.call_duration_minutes,
          call_outcome: a.call_outcome,
          email_subject: a.email_subject,
          meeting_link: a.meeting_link,
          meeting_location: a.meeting_location,
        },
        date: a.createdAt,
      });
    });

    // 2) Contract signed
    if (enrollment.leadSnapshot?.contractDetails?.signedAt) {
      timeline.push({
        type: "contract",
        title: "Contract Signed",
        description: `${enrollment.leadSnapshot.contractDetails.fullName} signed the contract`,
        date: enrollment.leadSnapshot.contractDetails.signedAt,
      });
    }

    // 3) Enrollment created
    timeline.push({
      type: "enrollment",
      title: "Enrollment Created",
      description: `Enrolled in ${enrollment.program?.name || "program"}`,
      date: enrollment.enrolledAt || enrollment.createdAt,
    });

    // 4) Invoices
    invoices.forEach((inv) => {
      timeline.push({
        type: "invoice",
        title: `Invoice ${inv.invoiceNumber} Created`,
        description: `Total: ${inv.totalAmount} | Status: ${inv.status}`,
        date: inv.createdAt,
      });
    });

    // 5) Payments
    payments.forEach((p) => {
      timeline.push({
        type: "payment",
        title: `Payment ${p.status === "approved" ? "Received" : p.status}`,
        description: p.notes || `Amount: ${p.amount} via ${p.method}`,
        meta: {
          amount: p.amount,
          method: p.method,
          status: p.status,
        },
        date: p.approvedAt || p.createdAt,
      });
    });

    // Sort newest → oldest
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: {
        ...enrollment.toObject(),
        invoices,
        payments,
        timeline,
        isBundle: !!bundleInvoice,   // 👈 naya
        bundleSiblings,               // 👈 naya — baaki programs ki list
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// UPDATE (SAFE)
exports.updateEnrollment = async (req, res) => {
  try {
    const { program_id, batch_id, ...rest } = req.body;
    const updatePayload = { ...rest };
    if (program_id !== undefined) updatePayload.program = program_id || null;
    if (batch_id !== undefined) updatePayload.batch = batch_id || null;

    // ── Pehle purana enrollment fetch karo ───────────────
    const oldEnrollment = await Enrollment.findById(req.params.id);
    if (!oldEnrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });

    const oldBatchId = oldEnrollment.batch?.toString();
    const newBatchId = batch_id !== undefined ? (batch_id || null) : oldBatchId;

    // ── Batch switch hoi hai toh counts update karo ──────
    if (newBatchId !== oldBatchId) {
      // Purane batch se nikalo
      if (oldBatchId) {
        await Batch.findByIdAndUpdate(oldBatchId, {
          $pull: { students: oldEnrollment.user },
          $inc: { current_students: -1 },
        });
      }
      // Naye batch mein add karo
      if (newBatchId) {
        await Batch.findOneAndUpdate(
          { _id: newBatchId, students: { $ne: oldEnrollment.user } },
          { $addToSet: { students: oldEnrollment.user }, $inc: { current_students: 1 } }
        );
      }
    }

    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    )
      .populate("program").populate("batch")
      .populate("user", "name email phone role")
      .populate("assigned_to", "name email");

    res.json({ success: true, data: enrollment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE
exports.deleteEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) return res.status(404).json({ success: false, message: "Enrollment not found" });

    // ── Batch count kam karo ──────────────────────────────
    if (enrollment.batch) {
      await Batch.findByIdAndUpdate(enrollment.batch, {
        $pull: { students: enrollment.user },
        $inc: { current_students: -1 },
      });
    }

    await Enrollment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Enrollment deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// GRADUATE
exports.graduateEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      {
        isGraduated: true,
        status: "completed",
        completedAt: new Date(),
      },
      { new: true }
    );

    res.json({ success: true, data: enrollment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// SUSPEND
exports.suspendEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      { status: "suspended" },
      { new: true }
    );

    res.json({ success: true, data: enrollment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// REACTIVATE
exports.reactivateEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { new: true }
    );

    res.json({ success: true, data: enrollment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.assignEnrollment = async (req, res) => {
  const { assigned_to } = req.body;

  const enrollment = await Enrollment.findByIdAndUpdate(
    req.params.id,
    {
      assigned_to,
    },
    { new: true }
  )
    .populate("assigned_to", "name email")
    .populate("user", "name email");

  res.status(200).json({
    success: true,
    data: enrollment,
  });
};


// ─────────────────────────────────────────────────────────
// STEP 1: PREVIEW — Excel parse + user match + duplicate check
// ─────────────────────────────────────────────────────────
exports.previewBulkEnrollment = async (req, res) => {
  try {
    const { program, batch } = req.body;

    if (!program) {
      return res.status(400).json({ success: false, message: "Program is required" });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file is required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    // ✅ Column B = Email (same file format jo users import mein use hoti hai: Name, Email, Phone)
    const emails = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header skip
      const email = row.getCell(2).text?.trim().toLowerCase();
      if (email) emails.push(email);
    });

    if (emails.length === 0) {
      return res.status(400).json({ success: false, message: "No valid emails found in file" });
    }

    // ✅ file ke andar duplicate emails hata do
    const uniqueEmails = [...new Set(emails)];

    // ✅ DB mein users dhoondo
    const users = await User.find({ email: { $in: uniqueEmails } }).select("name email phone");
    const userMap = new Map(users.map((u) => [u.email, u]));

    // ✅ In users ki is program mein existing enrollments check karo
    const foundUserIds = users.map((u) => u._id);
    const existingEnrollments = await Enrollment.find({
      user: { $in: foundUserIds },
      program,
    })
      .select("user audioAccess assigned_to")
      .populate("assigned_to", "name email");
    // user._id (string) -> { enrollmentId, audioAccess, assignedTo }
    const enrolledMap = new Map(
      existingEnrollments.map((e) => [
        e.user.toString(),
        {
          enrollmentId: e._id,
          audioAccess: e.audioAccess,
          assignedTo: e.assigned_to ? { _id: e.assigned_to._id, name: e.assigned_to.name } : null,
        },
      ])
    );

    // ✅ Preview rows banao
    const preview = uniqueEmails.map((email) => {
      const user = userMap.get(email);

      if (!user) {
        return {
          email,
          user: null,
          status: "not_found", // system mein user hi nahi
        };
      }

      const existing = enrolledMap.get(user._id.toString());
      if (existing) {
        return {
          email,
          user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            phone: user.phone,
          },
          status: "duplicate",
          enrollmentId: existing.enrollmentId,
          currentAudioAccess: existing.audioAccess,
          currentAssignedTo: existing.assignedTo,
        };
      }

      return {
        email,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
        },
        status: "eligible",
      };
    });

    res.status(200).json({
      success: true,
      program,
      batch: batch || null,
      totalRows: uniqueEmails.length,
      eligibleCount: preview.filter((p) => p.status === "eligible").length,
      duplicateCount: preview.filter((p) => p.status === "duplicate").length,
      notFoundCount: preview.filter((p) => p.status === "not_found").length,
      preview,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────
// STEP 2: CONFIRM — actual enrollment creation (single row ya bulk, same endpoint)
// ─────────────────────────────────────────────────────────
exports.bulkConfirmEnrollment = async (req, res) => {
  try {
    const { enrollments } = req.body;
    // enrollments: [{ user, program, batch, assigned_to, audioAccess }]

    if (!Array.isArray(enrollments) || enrollments.length === 0) {
      return res.status(400).json({ success: false, message: "enrollments array is required" });
    }

    const created = [];
    const skipped = [];

    for (const item of enrollments) {
      const { user, program, batch, assigned_to, audioAccess } = item;

      if (!user || !program) {
        skipped.push({ user, program, reason: "Missing user or program" });
        continue;
      }

      // ✅ Race-condition safe duplicate check (bulk ke doraan bhi)
      const exists = await Enrollment.findOne({ user, program });
      if (exists) {
        skipped.push({ user, program, reason: "Already enrolled" });
        continue;
      }

      const enrollment = await Enrollment.create({
        user,
        program,
        batch: batch || undefined,
        audioAccess: audioAccess ?? true,
        assigned_to: assigned_to || req.user._id,
      });

      if (batch) {
        await Batch.findOneAndUpdate(
          { _id: batch, students: { $ne: user } },
          { $addToSet: { students: user }, $inc: { current_students: 1 } }
        );
      }

      created.push(enrollment);
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