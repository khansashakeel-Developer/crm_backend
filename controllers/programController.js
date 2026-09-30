
const mongoose = require("mongoose");
const Program = require("../models/programModel.js");
const Course = require("../models/courseModel.js");
const Module = require("../models/moduleModel.js");
const Lesson = require("../models/lessonModel.js");
const Batch = require("../models/batchModel.js");
const Enrollment = require("../models/enrollmentModel");
const Invoice = require("../models/invoiceModel");
const ExcelJS = require("exceljs"); // For Excel export-Khansa
const { allocateBundleLevels, allocateInstallmentsToLevels } = require("../utils/bundleLevelAllocation");

// ── Shared export helpers ──────────────────────────────────
const formatDateRange = (start, end) => {
    if (!start && !end) return "";
    const opts = { day: "numeric", month: "short" };
    const s = start ? new Date(start) : null;
    const e = end ? new Date(end) : null;
    const year = e ? e.getFullYear() : s ? s.getFullYear() : "";
    const sStr = s ? s.toLocaleDateString("en-GB", opts) : "";
    const eStr = e ? e.toLocaleDateString("en-GB", opts) : "";
    return `${sStr} - ${eStr} ${year}`.trim();
};

// mode: "physical" -> sirf physical | "all" -> dono | baaki sab (empty/undefined) -> online
const modeFilter = (mode) => {
    if (mode === "all") return undefined;
    return mode === "physical" ? "physical" : { $ne: "physical" };
};

const money = (n) => (n === "" || n === null || n === undefined ? "" : `Rs. ${Number(n).toFixed(2)}`);
const dateStr = (d) => (d ? new Date(d).toLocaleDateString("en-GB") : "");

async function buildBatchExportData(batch) {
    const enrollments = await Enrollment.find({ batch: batch._id }).select("_id user");
    const enrollmentByUser = new Map(enrollments.map((e) => [e.user.toString(), e._id.toString()]));
    const enrollmentIds = enrollments.map((e) => e._id);
    const enrollmentIdStrings = enrollmentIds.map((id) => id.toString());

    // ── Bundle invoices bhi milengi ab, items.enrollment se match karke ──
    const invoices = await Invoice.find({
        $or: [
            { enrollment: { $in: enrollmentIds } },
            { "items.enrollment": { $in: enrollmentIds } },
        ],
        status: { $ne: "CANCELLED" },
    })
        .select("totalAmount discountAmount paidAmount remainingAmount issueDate installments enrollment isBundle items")
        .populate("items.program", "level");

    // ── Har enrollment (chahe single ho ya bundle ka ek level) ke liye
    //     uska apna slice/invoice attach karo ──
    const invoiceByEnrollment = new Map();

    for (const inv of invoices) {
        if (inv.isBundle && Array.isArray(inv.items) && inv.items.length > 0) {
            const programItems = inv.items
                .filter((it) => !it.feeType || it.feeType === "program")
                .map((it) => ({
                    enrollment: it.enrollment,
                    program: it.program?._id,
                    level: it.program?.level,
                    amount: it.amount,
                }));

            const allocations = allocateBundleLevels(
                programItems,
                Number(inv.discountAmount || 0),
                Number(inv.paidAmount || 0)
            );

            const installmentAllocations = allocateInstallmentsToLevels(
                programItems,
                Number(inv.discountAmount || 0),
                inv.installments || []
            );

            allocations.forEach((slice) => {
                if (enrollmentIdStrings.includes(slice.enrollment)) {
                    const levelInstallments = installmentAllocations.get(slice.enrollment) || { advance: null, installments: [] };

                    invoiceByEnrollment.set(slice.enrollment, {
                        totalAmount: slice.gross,
                        paidAmount: slice.paid,
                        remainingAmount: slice.remaining,
                        issueDate: inv.issueDate,
                        _levelAdvance: levelInstallments.advance,
                        _levelInstallments: levelInstallments.installments,
                    });
                }
            });
        } else {
            const enrollmentStr = inv.enrollment?.toString();
            if (enrollmentStr) {
                invoiceByEnrollment.set(enrollmentStr, {
                    totalAmount: inv.totalAmount,
                    paidAmount: inv.paidAmount,
                    remainingAmount: inv.remainingAmount,
                    issueDate: inv.issueDate,
                    installments: inv.installments,
                });
            }
        }
    }
    let maxInstallments = 0;
    for (const inv of invoiceByEnrollment.values()) {
        const count = inv._levelInstallments ? inv._levelInstallments.length : (inv.installments || []).filter((i) => !i.isAdvance).length;
        if (count > maxInstallments) maxInstallments = count;
    }

    const programName = batch.program_id?.name || "";
    const dateRangeText = formatDateRange(batch.start_date, batch.end_date);

    const studentRows = (batch.students || []).map((student) => {
        const enrollmentId = enrollmentByUser.get(student._id.toString());
        const invoice = enrollmentId ? invoiceByEnrollment.get(enrollmentId) : null;

        const row = {
            name: student.name,
            totalAmount: 0,
            paidAmount: 0,
            issueDate: "",
            installmentPlan: 0,
            advance: { date: "", amount: "" },
            installments: [],
            pending: 0,
        };

        if (invoice) {
            row.totalAmount = invoice.totalAmount || 0;
            row.paidAmount = invoice.paidAmount || 0;
            row.issueDate = invoice.issueDate || "";
            row.pending = invoice.remainingAmount || 0;

            if (invoice._levelAdvance !== undefined) {
                // ── Bundle: use the per-level installment mapping ──
                row.advance = {
                    date: invoice._levelAdvance?.date || "",
                    amount: invoice._levelAdvance?.amount || "",
                };
                row.installmentPlan = (invoice._levelInstallments || []).length + (invoice._levelAdvance ? 1 : 0);
                for (let n = 0; n < maxInstallments; n++) {
                    const inst = (invoice._levelInstallments || [])[n];
                    row.installments.push({ date: inst?.date || "", amount: inst?.amount || "" });
                }
            } else {
                // ── Single-program: original logic, untouched ──
                const regularInstallments = (invoice.installments || []).filter((i) => !i.isAdvance);
                const hasAdvance = (invoice.installments || []).some((i) => i.isAdvance && Number(i.paidAmount) > 0);
                row.installmentPlan = regularInstallments.length + (hasAdvance ? 1 : 0);

                const advance = (invoice.installments || []).find((i) => i.isAdvance);
                row.advance = { date: advance?.paidAt || "", amount: advance?.paidAmount || "" };

                for (let n = 0; n < maxInstallments; n++) {
                    const inst = regularInstallments[n];
                    row.installments.push({ date: inst?.paidAt || "", amount: inst?.paidAmount || "" });
                }
            }
        } else {
            for (let n = 0; n < maxInstallments; n++) {
                row.installments.push({ date: "", amount: "" });
            }
        }

        return row;
    });

    const totals = studentRows.reduce(
        (acc, r) => {
            acc.totalAmount += Number(r.totalAmount || 0);
            acc.paidAmount += Number(r.paidAmount || 0);
            acc.pending += Number(r.pending || 0);
            return acc;
        },
        { totalAmount: 0, paidAmount: 0, pending: 0 }
    );

    return { batch, programName, dateRangeText, maxInstallments, studentRows, totals };
}
// ═══════════════════════════════════════
// PUBLIC ENDPOINTS
// ═══════════════════════════════════════

// GET /api/v1/programs — List all active programs
exports.getPrograms = async (req, res) => {
    try {
        const programs = await Program.find({ status: "active" })
            .select("-created_by")
            .populate("total_students")
            .sort({ createdAt: 1 })   // ✅ ascending 
            .lean();

        res.status(200).json({
            success: true,
            count: programs.length,
            data: programs,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/v1/programs — List all active programs for Public
exports.getProgramsPublic = async (req, res) => {
    try {
        const programs = await Program.find({ status: "active" })
            .select("_id name category")
            .sort({ createdAt: 1 })
            .lean();

        res.status(200).json({
            success: true,
            data: programs,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/v1/programs/:slug — Get program details
exports.getProgramBySlug = async (req, res) => {
    try {
        const program = await Program.findOne({
            slug: req.params.slug,
            status: "active",
        });

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({
            success: true,
            data: program,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/v1/programs/:slug/curriculum — Public curriculum view
exports.getProgramCurriculum = async (req, res) => {
    try {
        const program = await Program.findOne({
            slug: req.params.slug,
            status: "active",
        });

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        const courses = await Course.find({
            program_id: program._id,
            status: "active",
        }).sort({ order: 1 });

        const curriculum = await Promise.all(
            courses.map(async (course) => {
                const modules = await Module.find({
                    course_id: course._id,
                }).sort({ order: 1 });

                const modulesWithLessons = await Promise.all(
                    modules.map(async (mod) => {
                        const lessons = await Lesson.find({
                            module_id: mod._id,
                            status: "active",
                        })
                            .select("title duration_minutes is_free_preview content_type order")
                            .sort({ order: 1 });

                        return { ...mod.toObject(), lessons };
                    })
                );

                return { ...course.toObject(), modules: modulesWithLessons };
            })
        );

        res.status(200).json({
            success: true,
            data: curriculum,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /api/v1/programs/:slug/batches — Get upcoming batches
exports.getProgramBatches = async (req, res) => {
    try {
        const program = await Program.findOne({ slug: req.params.slug });

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        const batches = await Batch.find({
            program_id: program._id,
            status: { $in: ["upcoming", "active"] },
            mode: { $ne: "physical" },
        })
            .select("-instructor_id")
            .sort({ start_date: 1 });

        res.status(200).json({
            success: true,
            data: batches,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ═══════════════════════════════════════
// ADMIN ENDPOINTS — PROGRAMS
// ═══════════════════════════════════════

// GET /admin/v1/programs
exports.adminGetPrograms = async (req, res) => {
    try {
        const { status, category, search, page = 1, limit = 10 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (category) query.category = category;
        if (search) query.name = { $regex: search, $options: "i" };

        const programs = await Program.find(query)
            .populate("created_by", "name email")
            .populate("total_students")
            .sort({ createdAt: 1 })
            .lean()
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Program.countDocuments(query);

        res.status(200).json({
            success: true,
            data: programs,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/programs
exports.adminCreateProgram = async (req, res) => {
    try {
        const { name, slug } = req.body;

        const finalSlug = slug
            ? slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
            : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const existing = await Program.findOne({ slug: finalSlug });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Program with this slug already exists",
            });
        }

        // Clean empty optional enum / number fields
        const body = { ...req.body };

        if (body.level === "" || body.level == null) {
            delete body.level; // omit so enum is not validated
        }

        // Optional: same idea for other fields that can be empty strings
        if (body.price === "") body.price = 0;
        if (body.duration_weeks === "") delete body.duration_weeks;

        const program = await Program.create({
            ...body,
            slug: finalSlug,
            created_by: req.user.id,
        });

        res.status(201).json({
            success: true,
            data: program,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
// GET /admin/v1/programs/:id
exports.adminGetProgramById = async (req, res) => {
    try {
        const program = await Program.findById(req.params.id)
            .populate("created_by", "name email");

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({
            success: true,
            data: program,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/programs/:id
exports.adminUpdateProgram = async (req, res) => {
    try {
        const body = { ...req.body };

        if (body.level === "" || body.level == null) {
            delete body.level;
            // or, if you want to clear it: body.level = undefined;
        }

        const program = await Program.findByIdAndUpdate(
            req.params.id,
            body,
            { new: true, runValidators: true }
        );

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        res.status(200).json({
            success: true,
            data: program,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /admin/v1/programs/:id
exports.adminDeleteProgram = async (req, res) => {
    try {
        const program = await Program.findByIdAndDelete(req.params.id);

        if (!program) {
            return res.status(404).json({ message: "Program not found" });
        }

        // Related data bhi delete karo
        const courses = await Course.find({ program_id: req.params.id });
        for (const course of courses) {
            await Module.deleteMany({ course_id: course._id });
            await Lesson.deleteMany({ course_id: course._id });
        }
        await Course.deleteMany({ program_id: req.params.id });
        await Batch.deleteMany({ program_id: req.params.id });

        res.status(200).json({
            success: true,
            message: "Program deleted successfully",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/programs/:id/duplicate
exports.adminDuplicateProgram = async (req, res) => {
    try {
        const original = await Program.findById(req.params.id);

        if (!original) {
            return res.status(404).json({ message: "Program not found" });
        }

        const duplicate = await Program.create({
            ...original.toObject(),
            _id: undefined,
            name: `${original.name} (Copy)`,
            slug: `${original.slug}-copy-${Date.now()}`,
            status: "draft",
            total_students: 0,
            created_by: req.user.id,
            createdAt: undefined,
            updatedAt: undefined,
        });

        res.status(201).json({
            success: true,
            data: duplicate,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ═══════════════════════════════════════
// ADMIN ENDPOINTS — COURSES
// ═══════════════════════════════════════

// GET /admin/v1/programs/:id/courses
exports.adminGetCourses = async (req, res) => {
    try {
        const courses = await Course.find({ program_id: req.params.id })
            .sort({ order: 1 });

        res.status(200).json({
            success: true,
            data: courses,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/programs/:id/courses
exports.adminCreateCourse = async (req, res) => {
    try {
        const lastCourse = await Course.findOne({ program_id: req.params.id })
            .sort({ order: -1 });

        const course = await Course.create({
            ...req.body,
            program_id: req.params.id,
            order: lastCourse ? lastCourse.order + 1 : 1,
        });

        // Program ka total_courses update karo
        await Program.findByIdAndUpdate(req.params.id, {
            $inc: { total_courses: 1 },
        });

        res.status(201).json({
            success: true,
            data: course,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/courses/:id
exports.adminUpdateCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.status(200).json({
            success: true,
            data: course,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /admin/v1/courses/:id
exports.adminDeleteCourse = async (req, res) => {
    try {
        const course = await Course.findByIdAndDelete(req.params.id);

        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        await Module.deleteMany({ course_id: req.params.id });
        await Lesson.deleteMany({ course_id: req.params.id });

        await Program.findByIdAndUpdate(course.program_id, {
            $inc: { total_courses: -1 },
        });

        res.status(200).json({
            success: true,
            message: "Course deleted",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/courses/reorder
exports.adminReorderCourses = async (req, res) => {
    try {
        const { courses } = req.body;
        // courses = [{ id: "...", order: 1 }, { id: "...", order: 2 }]

        await Promise.all(
            courses.map((c) =>
                Course.findByIdAndUpdate(c.id, { order: c.order })
            )
        );

        res.status(200).json({
            success: true,
            message: "Courses reordered",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ═══════════════════════════════════════
// ADMIN ENDPOINTS — MODULES
// ═══════════════════════════════════════

// GET /admin/v1/courses/:id/modules
exports.adminGetModules = async (req, res) => {
    try {
        const modules = await Module.find({ course_id: req.params.id })
            .sort({ order: 1 });

        res.status(200).json({
            success: true,
            data: modules,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/courses/:id/modules
exports.adminCreateModule = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);

        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }

        const lastModule = await Module.findOne({ course_id: req.params.id })
            .sort({ order: -1 });

        const module = await Module.create({
            ...req.body,
            course_id: req.params.id,
            program_id: course.program_id,
            order: lastModule ? lastModule.order + 1 : 1,
        });

        await Course.findByIdAndUpdate(req.params.id, {
            $inc: { total_modules: 1 },
        });

        res.status(201).json({
            success: true,
            data: module,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/modules/:id
exports.adminUpdateModule = async (req, res) => {
    try {
        const module = await Module.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.status(200).json({
            success: true,
            data: module,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /admin/v1/modules/:id
exports.adminDeleteModule = async (req, res) => {
    try {
        const module = await Module.findByIdAndDelete(req.params.id);

        if (!module) {
            return res.status(404).json({ message: "Module not found" });
        }

        await Lesson.deleteMany({ module_id: req.params.id });

        await Course.findByIdAndUpdate(module.course_id, {
            $inc: { total_modules: -1 },
        });

        res.status(200).json({
            success: true,
            message: "Module deleted",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ═══════════════════════════════════════
// ADMIN ENDPOINTS — LESSONS
// ═══════════════════════════════════════

// GET /admin/v1/modules/:id/lessons
exports.adminGetLessons = async (req, res) => {
    try {
        const lessons = await Lesson.find({ module_id: req.params.id })
            .sort({ order: 1 });

        res.status(200).json({
            success: true,
            data: lessons,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/modules/:id/lessons
exports.adminCreateLesson = async (req, res) => {
    try {
        const module = await Module.findById(req.params.id);

        if (!module) {
            return res.status(404).json({ message: "Module not found" });
        }

        const lastLesson = await Lesson.findOne({ module_id: req.params.id })
            .sort({ order: -1 });

        const lesson = await Lesson.create({
            ...req.body,
            module_id: req.params.id,
            course_id: module.course_id,
            program_id: module.program_id,
            order: lastLesson ? lastLesson.order + 1 : 1,
        });

        await Module.findByIdAndUpdate(req.params.id, {
            $inc: { total_lessons: 1 },
        });

        await Course.findByIdAndUpdate(module.course_id, {
            $inc: { total_lessons: 1 },
        });

        res.status(201).json({
            success: true,
            data: lesson,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/lessons/:id
exports.adminUpdateLesson = async (req, res) => {
    try {
        const lesson = await Lesson.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        res.status(200).json({
            success: true,
            data: lesson,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /admin/v1/lessons/:id
exports.adminDeleteLesson = async (req, res) => {
    try {
        const lesson = await Lesson.findByIdAndDelete(req.params.id);

        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        await Module.findByIdAndUpdate(lesson.module_id, {
            $inc: { total_lessons: -1 },
        });

        await Course.findByIdAndUpdate(lesson.course_id, {
            $inc: { total_lessons: -1 },
        });

        res.status(200).json({
            success: true,
            message: "Lesson deleted",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ═══════════════════════════════════════
// ADMIN ENDPOINTS — BATCHES
// ═══════════════════════════════════════

// GET /admin/v1/batches
exports.adminGetBatches = async (req, res) => {
    try {
        const { program_id, status, mode } = req.query;

        const query = {};

        const m = modeFilter(mode);
        if (m) query.mode = m;

        if (program_id) {
            query.program_id = new mongoose.Types.ObjectId(program_id);
        }

        if (status) {
            query.status = status;
        } else {
            // default: active + upcoming
            query.status = { $in: ["active", "upcoming"] };
        }

        const batches = await Batch.find(query)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email")
            .sort({ start_date: 1 });

        res.status(200).json({
            success: true,
            data: batches,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /admin/v1/batches
exports.adminCreateBatch = async (req, res) => {
    try {
        const { date_required, start_date } = req.body;
        const isDateRequired = date_required !== false; // default true

        if (isDateRequired && !start_date) {
            return res.status(400).json({
                success: false,
                message: "Start date is required when 'Date Required' is checked.",
            });
        }

        const payload = {
            ...req.body,
            date_required: isDateRequired,
            mode: req.body.mode === "physical" ? "physical" : "online",
        };

        // date_required unchecked hai to dates clear rakho
        if (!isDateRequired) {
            payload.start_date = undefined;
            payload.end_date = undefined;
        }

        const batch = await Batch.create(payload);

        res.status(201).json({ success: true, data: batch });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /admin/v1/batches/:id
exports.adminUpdateBatch = async (req, res) => {
    try {
        const { date_required, start_date } = req.body;
        const isDateRequired = date_required !== false;

        if (isDateRequired && !start_date) {
            return res.status(400).json({
                success: false,
                message: "Start date is required when 'Date Required' is checked.",
            });
        }

        const payload = {
            ...req.body,
            date_required: isDateRequired,
            mode: req.body.mode === "physical" ? "physical" : "online",
        };

        if (!isDateRequired) {
            payload.start_date = null;
            payload.end_date = null;
        }

        const batch = await Batch.findByIdAndUpdate(
            req.params.id,
            payload,
            { new: true, runValidators: true }
        );

        if (!batch) {
            return res.status(404).json({ message: "Batch not found" });
        }

        res.status(200).json({ success: true, data: batch });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/* 
// GET /admin/v1/batches/:id
exports.adminGetBatchById = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone")
            .populate("students", "name email phone avatarColor");

        if (!batch) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        // Batch ke students ke enrollments
        const enrollments = await Enrollment.find({
            batch: batch._id,
        }).select("_id user program");

        const enrollmentIds = enrollments.map((e) => e._id);

        // Batch ki invoices
        const invoices = await Invoice.find({
            enrollment: { $in: enrollmentIds },
            status: { $ne: "CANCELLED" },
        }).select("totalAmount discountAmount paidAmount remainingAmount");

        const revenue = invoices.reduce(
            (acc, invoice) => {
                const gross = Number(invoice.totalAmount || 0);
                const discount = Number(invoice.discountAmount || 0);
                const paid = Number(invoice.paidAmount || 0);
                const remaining = Number(invoice.remainingAmount || 0);

                acc.grossAmount += gross;
                acc.discountAmount += discount;
                acc.netAmount += gross - discount;
                acc.paidAmount += paid;
                acc.remainingAmount += remaining;

                return acc;
            },
            {
                grossAmount: 0,
                discountAmount: 0,
                netAmount: 0,
                paidAmount: 0,
                remainingAmount: 0,
            }
        );

        // ── Har student ke liye enrollment fetch karo ──────────
        const studentsWithEnrollment = await Promise.all(
            batch.students.map(async (student) => {
                const enrollment = await Enrollment.findOne({
                    user: student._id,
                    program: batch.program_id._id ?? batch.program_id,
                }).select("_id audioAccess status accessStatus");

                return {
                    ...student.toObject(),
                    enrollmentId: enrollment?._id ?? null,
                    audioAccess: enrollment?.audioAccess ?? true,
                    enrollmentStatus: enrollment?.status ?? null,
                    accessStatus: enrollment?.accessStatus ?? null,
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                ...batch.toObject(),
                revenue,
                students: studentsWithEnrollment,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
*/

// GET /admin/v1/batches/:id
// GET /admin/v1/batches/:id
// GET /admin/v1/batches/:id
exports.adminGetBatchById = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone");

        if (!batch) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        // â”€â”€ Batch ke students ka source-of-truth: Enrollment collection.
        //     batch.students (denormalized array) par depend nahi karte,
        //     kyunki wo drift ho sakta hai aur students list se missing
        //     ho sakte hain, jaisa production mein dekha gaya â”€â”€
        const enrollments = await Enrollment.find({
            batch: batch._id,
            program: batch.program_id._id ?? batch.program_id,
        })
            .select("_id user program audioAccess status accessStatus")
            .populate("user", "name email phone avatarColor");

        const enrollmentIds = enrollments.map((e) => e._id);
        const enrollmentIdStrings = enrollmentIds.map((id) => id.toString());

        // Batch ki invoices â€” bundle invoices bhi milengi jinka
        // top-level "enrollment" is batch se match nahi karta, lekin
        // unke items[] mein is batch ka enrollment hai
        const invoices = await Invoice.find({
            $or: [
                { enrollment: { $in: enrollmentIds } },
                { "items.enrollment": { $in: enrollmentIds } },
            ],
            status: { $ne: "CANCELLED" },
        })
            .select("totalAmount discountAmount paidAmount remainingAmount installments issueDate enrollment isBundle items")
            .populate("items.program", "level");

        const revenue = invoices.reduce(
            (acc, invoice) => {
                if (invoice.isBundle && Array.isArray(invoice.items) && invoice.items.length > 0) {
                    const programItems = invoice.items
                        .filter((it) => !it.feeType || it.feeType === "program")
                        .map((it) => ({
                            enrollment: it.enrollment,
                            program: it.program?._id,
                            level: it.program?.level,
                            amount: it.amount,
                        }));

                    const allocations = allocateBundleLevels(
                        programItems,
                        Number(invoice.discountAmount || 0),
                        Number(invoice.paidAmount || 0)
                    );

                    const matchingSlices = allocations.filter((a) =>
                        enrollmentIdStrings.includes(a.enrollment)
                    );

                    matchingSlices.forEach((slice) => {
                        acc.grossAmount += slice.gross;
                        acc.discountAmount += slice.discount;
                        acc.netAmount += slice.net;
                        acc.paidAmount += slice.paid;
                        acc.remainingAmount += slice.remaining;
                    });
                } else {
                    const gross = Number(invoice.totalAmount || 0);
                    const discount = Number(invoice.discountAmount || 0);
                    const paid = Number(invoice.paidAmount || 0);
                    const remaining = Number(invoice.remainingAmount || 0);

                    acc.grossAmount += gross;
                    acc.discountAmount += discount;
                    acc.netAmount += gross - discount;
                    acc.paidAmount += paid;
                    acc.remainingAmount += remaining;
                }

                return acc;
            },
            {
                grossAmount: 0,
                discountAmount: 0,
                netAmount: 0,
                paidAmount: 0,
                remainingAmount: 0,
            }
        );

        revenue.paidPercentage = revenue.netAmount > 0
            ? Number(((revenue.paidAmount / revenue.netAmount) * 100).toFixed(1))
            : 0;

        // â”€â”€ Har enrollment (= har student) ke liye invoice slice attach karo â”€â”€
        const studentsWithEnrollment = enrollments
            .filter((enrollment) => enrollment.user) // safety: skip if user was deleted
            .map((enrollment) => {
                const enrollmentIdStr = enrollment._id.toString();

                const studentInvoice = invoices.find((inv) => {
                    if (inv.enrollment?.toString() === enrollmentIdStr) return true;
                    return (inv.items || []).some(
                        (it) => it.enrollment?.toString() === enrollmentIdStr
                    );
                });

                let invoiceData = null;

                if (studentInvoice) {
                    if (studentInvoice.isBundle && Array.isArray(studentInvoice.items) && studentInvoice.items.length > 0) {
                        const programItems = studentInvoice.items
                            .filter((it) => !it.feeType || it.feeType === "program")
                            .map((it) => ({
                                enrollment: it.enrollment,
                                program: it.program?._id,
                                level: it.program?.level,
                                amount: it.amount,
                            }));

                        const allocations = allocateBundleLevels(
                            programItems,
                            Number(studentInvoice.discountAmount || 0),
                            Number(studentInvoice.paidAmount || 0)
                        );

                        const mySlice = allocations.find((a) => a.enrollment === enrollmentIdStr);

                        if (mySlice) {
                            invoiceData = {
                                totalAmount: mySlice.gross,
                                discountAmount: mySlice.discount,
                                netAmount: mySlice.net,
                                paidAmount: mySlice.paid,
                                remainingAmount: mySlice.remaining,
                                issueDate: studentInvoice.issueDate,
                                installments: studentInvoice.installments,
                                isBundleSlice: true,
                            };
                        }
                    } else {
                        invoiceData = {
                            totalAmount: studentInvoice.totalAmount,
                            paidAmount: studentInvoice.paidAmount,
                            remainingAmount: studentInvoice.remainingAmount,
                            issueDate: studentInvoice.issueDate,
                            installments: studentInvoice.installments,
                        };
                    }
                }

                const user = enrollment.user;

                return {
                    ...(user.toObject ? user.toObject() : user),
                    enrollmentId: enrollment._id,
                    audioAccess: enrollment.audioAccess ?? true,
                    enrollmentStatus: enrollment.status ?? null,
                    accessStatus: enrollment.accessStatus ?? null,
                    invoice: invoiceData,
                };
            });

        res.status(200).json({
            success: true,
            data: {
                ...batch.toObject(),
                revenue,
                students: studentsWithEnrollment,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
/*
exports.adminGetBatchById = async (req, res) => {
    try {
        const batch = await Batch.findById(req.params.id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone")
            .populate("students", "name email phone avatarColor");

        if (!batch) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        // Batch ke students ke enrollments
        const enrollments = await Enrollment.find({
            batch: batch._id,
        }).select("_id user program");

        const enrollmentIds = enrollments.map((e) => e._id);

        // Batch ki invoices
        const invoices = await Invoice.find({
            enrollment: { $in: enrollmentIds },
            status: { $ne: "CANCELLED" },
        }).select("totalAmount discountAmount paidAmount remainingAmount installments issueDate enrollment");

        const revenue = invoices.reduce(
            (acc, invoice) => {
                const gross = Number(invoice.totalAmount || 0);
                const discount = Number(invoice.discountAmount || 0);
                const paid = Number(invoice.paidAmount || 0);
                const remaining = Number(invoice.remainingAmount || 0);

                acc.grossAmount += gross;
                acc.discountAmount += discount;
                acc.netAmount += gross - discount;
                acc.paidAmount += paid;
                acc.remainingAmount += remaining;

                return acc;
            },
            {
                grossAmount: 0,
                discountAmount: 0,
                netAmount: 0,
                paidAmount: 0,
                remainingAmount: 0,
            }
        );

        // Batch ki payment percentage
        revenue.paidPercentage = revenue.netAmount > 0
            ? Number(((revenue.paidAmount / revenue.netAmount) * 100).toFixed(1))
            : 0;

        // ── Har student ke liye enrollment fetch karo ──────────
        const studentsWithEnrollment = await Promise.all(
            batch.students.map(async (student) => {
                const enrollment = await Enrollment.findOne({
                    user: student._id,
                    program: batch.program_id._id ?? batch.program_id,
                }).select("_id audioAccess status accessStatus");

                const studentInvoice = enrollment
                    ? invoices.find((inv) => inv.enrollment?.toString() === enrollment._id.toString())
                    : null;

                return {
                    ...student.toObject(),
                    enrollmentId: enrollment?._id ?? null,
                    audioAccess: enrollment?.audioAccess ?? true,
                    enrollmentStatus: enrollment?.status ?? null,
                    accessStatus: enrollment?.accessStatus ?? null,
                    invoice: studentInvoice
                        ? {
                              totalAmount: studentInvoice.totalAmount,
                              paidAmount: studentInvoice.paidAmount,
                              remainingAmount: studentInvoice.remainingAmount,
                              issueDate: studentInvoice.issueDate,
                              installments: studentInvoice.installments,
                          }
                        : null,
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                ...batch.toObject(),
                revenue,
                students: studentsWithEnrollment,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
*/

// GET /admin/v1/batches/:id/export
exports.adminExportBatchPayments = async (req, res) => {
    try {
        const format = (req.query.format || "xlsx").toLowerCase();

        const batchDoc = await Batch.findById(req.params.id)
            .populate("program_id", "name slug")
            .populate("students", "name email phone");

        if (!batchDoc) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        const { batch, programName, dateRangeText, maxInstallments, studentRows, totals } =
            await buildBatchExportData(batchDoc);

        const filenameBase = batch.name.replace(/[^a-z0-9]+/gi, "-");

        // ═══ CSV ═══
        if (format === "csv") {
            const esc = (val) => {
                const str = val === null || val === undefined ? "" : String(val);
                return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
            };

            const lines = [];
            lines.push([esc(programName), esc(dateRangeText)].join(","));
            lines.push("");

            const headerCols = ["Full Name", "Total Amount", "Total received", "Invoice date", "Installment plan"];
            headerCols.push("Advance Payment - Date of receipt", "Advance Payment - Amount");
            for (let n = 1; n <= maxInstallments; n++) {
                headerCols.push(`Installment ${n} - Date of receipt`, `Installment ${n} - Amount`);
            }
            headerCols.push("Pending");
            lines.push(headerCols.map(esc).join(","));

            for (const row of studentRows) {
                const cols = [
                    row.name, money(row.totalAmount), money(row.paidAmount), dateStr(row.issueDate),
                    row.installmentPlan, dateStr(row.advance.date), money(row.advance.amount),
                ];
                for (const inst of row.installments) cols.push(dateStr(inst.date), money(inst.amount));
                cols.push(money(row.pending));
                lines.push(cols.map(esc).join(","));
            }

            lines.push("");
            const totalRow = ["Total", money(totals.totalAmount), money(totals.paidAmount), "", "", "", ""];
            for (let n = 0; n < maxInstallments; n++) totalRow.push("", "");
            totalRow.push(money(totals.pending));
            lines.push(totalRow.map(esc).join(","));

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-payments.csv"`);
            return res.send(lines.join("\n"));
        }

        // ═══ PDF ═══
        if (format === "pdf") {
            const nameColWidth = 140;
            const otherColWidth = 78;
            const numDataCols = 4 + (maxInstallments + 1) * 2 + 1;
            const totalWidthPx = nameColWidth + numDataCols * otherColWidth + 40;
            const widthIn = (totalWidthPx / 96).toFixed(2);

            let theadTop = `<th rowspan="2">Full Name</th><th rowspan="2">Total Amount</th><th rowspan="2">Total received</th><th rowspan="2">Invoice date</th><th rowspan="2">Installment plan</th><th colspan="2">Advance Payment</th>`;
            let theadBottom = `<th>Date of receipt</th><th>Amount</th>`;
            for (let n = 1; n <= maxInstallments; n++) {
                theadTop += `<th colspan="2">Installment ${n}</th>`;
                theadBottom += `<th>Date of receipt</th><th>Amount</th>`;
            }
            theadTop += `<th rowspan="2">Pending</th>`;

            let bodyRows = "";
            for (const r of studentRows) {
                let cells = `<td class="name">${r.name}</td><td>${money(r.totalAmount)}</td><td>${money(r.paidAmount)}</td><td>${dateStr(r.issueDate)}</td><td>${r.installmentPlan}</td><td>${dateStr(r.advance.date)}</td><td>${money(r.advance.amount)}</td>`;
                for (const inst of r.installments) cells += `<td>${dateStr(inst.date)}</td><td>${money(inst.amount)}</td>`;
                cells += `<td>${money(r.pending)}</td>`;
                bodyRows += `<tr>${cells}</tr>`;
            }

            let totalCells = `<td>Total</td><td>${money(totals.totalAmount)}</td><td>${money(totals.paidAmount)}</td><td></td><td></td><td></td><td></td>`;
            for (let n = 0; n < maxInstallments; n++) totalCells += `<td></td><td></td>`;
            totalCells += `<td>${money(totals.pending)}</td>`;

            const html = `
                <!DOCTYPE html><html><head><meta charset="utf-8" /><style>
                    * { box-sizing: border-box; }
                    body { font-family: Arial, Helvetica, sans-serif; margin: 20px; }
                    h1 { font-size: 16px; margin: 0 0 2px 0; }
                    h2 { font-size: 12px; font-weight: normal; color: #444; margin: 0 0 14px 0; }
                    table { border-collapse: collapse; width: 100%; font-size: 9px; }
                    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; white-space: nowrap; }
                    th { background: #f3f3f3; font-weight: bold; }
                    td.name { text-align: left; font-weight: 500; }
                    tfoot td { font-weight: bold; background: #fafafa; }
                </style></head><body>
                    <h1>${programName}</h1><h2>${dateRangeText}</h2>
                    <table><thead><tr>${theadTop}</tr><tr>${theadBottom}</tr></thead>
                    <tbody>${bodyRows}</tbody><tfoot><tr>${totalCells}</tr></tfoot></table>
                </body></html>
            `;

            const browser = await launchBrowser();
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "networkidle0" });

            const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
            const heightIn = ((bodyHeight + 40) / 96).toFixed(2);

            const pdfUint8Array = await page.pdf({
                width: `${widthIn}in`,
                height: `${heightIn}in`,
                printBackground: true,
                margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
            });

            await browser.close();
            const pdfBuffer = Buffer.from(pdfUint8Array);

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-payments.pdf"`);
            res.setHeader("Content-Length", pdfBuffer.length);
            return res.end(pdfBuffer);
        }

        // ═══ XLSX (default) ═══
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Batch Payments");
        const totalCols = 5 + (maxInstallments + 1) * 2 + 1;

        sheet.getCell(1, 1).value = programName;
        sheet.getCell(1, 1).font = { bold: true, size: 13 };
        sheet.mergeCells(1, 2, 1, totalCols);
        sheet.getCell(1, 2).value = dateRangeText;
        sheet.getCell(1, 2).font = { bold: true };
        sheet.getCell(1, 2).alignment = { horizontal: "center" };

        const headerRowIndex = 3;
        const subHeaderRowIndex = 4;
        const row1 = ["Full Name", "Total Amount", "Total received", "Invoice date", "Installment plan", "Advance Payment", ""];
        const row2 = ["", "", "", "", "", "Date of receipt", "Amount"];
        for (let n = 1; n <= maxInstallments; n++) {
            row1.push(`Installment ${n}`, "");
            row2.push("Date of receipt", "Amount");
        }
        row1.push("Pending");
        row2.push("");

        sheet.getRow(headerRowIndex).values = row1;
        sheet.getRow(subHeaderRowIndex).values = row2;
        sheet.mergeCells(headerRowIndex, 1, subHeaderRowIndex, 1);
        sheet.mergeCells(headerRowIndex, 2, subHeaderRowIndex, 2);
        sheet.mergeCells(headerRowIndex, 3, subHeaderRowIndex, 3);
        sheet.mergeCells(headerRowIndex, 4, subHeaderRowIndex, 4);
        sheet.mergeCells(headerRowIndex, 5, subHeaderRowIndex, 5);
        let col = 6;
        for (let n = 0; n <= maxInstallments; n++) {
            sheet.mergeCells(headerRowIndex, col, headerRowIndex, col + 1);
            col += 2;
        }
        sheet.mergeCells(headerRowIndex, totalCols, subHeaderRowIndex, totalCols);
        sheet.getRow(headerRowIndex).font = { bold: true };
        sheet.getRow(subHeaderRowIndex).font = { bold: true };

        const currencyFmt = '"Rs. "#,##0.00';
        const dateFmt = "dd/mm/yyyy";
        let currentRow = subHeaderRowIndex + 1;
        for (const r of studentRows) {
            const rowData = [r.name, r.totalAmount, r.paidAmount, r.issueDate, r.installmentPlan, r.advance.date, r.advance.amount];
            for (const inst of r.installments) rowData.push(inst.date, inst.amount);
            rowData.push(r.pending);

            const excelRow = sheet.getRow(currentRow);
            excelRow.values = rowData;
            excelRow.getCell(2).numFmt = currencyFmt;
            excelRow.getCell(3).numFmt = currencyFmt;
            excelRow.getCell(4).numFmt = dateFmt;
            let c = 6;
            for (let n = 0; n <= maxInstallments; n++) {
                excelRow.getCell(c).numFmt = dateFmt;
                excelRow.getCell(c + 1).numFmt = currencyFmt;
                c += 2;
            }
            excelRow.getCell(totalCols).numFmt = currencyFmt;
            currentRow++;
        }

        currentRow++;
        const totalRow = sheet.getRow(currentRow);
        totalRow.getCell(1).value = "Total";
        totalRow.getCell(1).font = { bold: true };
        totalRow.getCell(2).value = totals.totalAmount;
        totalRow.getCell(2).numFmt = currencyFmt;
        totalRow.getCell(2).font = { bold: true };
        totalRow.getCell(3).value = totals.paidAmount;
        totalRow.getCell(3).numFmt = currencyFmt;
        totalRow.getCell(3).font = { bold: true };
        totalRow.getCell(totalCols).value = totals.pending;
        totalRow.getCell(totalCols).numFmt = currencyFmt;
        totalRow.getCell(totalCols).font = { bold: true };

        sheet.columns.forEach((column) => { column.width = 18; });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}-payments.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("BATCH EXPORT ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /admin/v1/batches/export-all
exports.adminExportAllBatchesPayments = async (req, res) => {
    try {
        const format = (req.query.format || "xlsx").toLowerCase();
        const { status, program_id, search, mode } = req.query;

        const query = {};
        const m = modeFilter(mode);
        if (m) query.mode = m;
        if (program_id) query.program_id = new mongoose.Types.ObjectId(program_id);
        if (status) query.status = status;
        if (search) query.name = { $regex: search, $options: "i" };

        const batches = await Batch.find(query)
            .populate("program_id", "name slug")
            .populate("students", "name email phone")
            .sort({ createdAt: 1 });

        if (batches.length === 0) {
            return res.status(404).json({ success: false, message: "No batches found for the given filters" });
        }

        const allData = [];
        for (const batch of batches) {
            allData.push(await buildBatchExportData(batch));
        }

        const filenameBase = `all-batches-payments-${Date.now()}`;

        // ═══ CSV ═══
        if (format === "csv") {
            const esc = (val) => {
                const str = val === null || val === undefined ? "" : String(val);
                return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
            };

            const lines = [];
            for (const data of allData) {
                const { batch, programName, dateRangeText, maxInstallments, studentRows, totals } = data;

                lines.push(esc(batch.name));
                lines.push([esc(programName), esc(dateRangeText)].join(","));

                const headerCols = ["Full Name", "Total Amount", "Total received", "Invoice date", "Installment plan"];
                headerCols.push("Advance Payment - Date of receipt", "Advance Payment - Amount");
                for (let n = 1; n <= maxInstallments; n++) {
                    headerCols.push(`Installment ${n} - Date of receipt`, `Installment ${n} - Amount`);
                }
                headerCols.push("Pending");
                lines.push(headerCols.map(esc).join(","));

                for (const row of studentRows) {
                    const cols = [
                        row.name, money(row.totalAmount), money(row.paidAmount), dateStr(row.issueDate),
                        row.installmentPlan, dateStr(row.advance.date), money(row.advance.amount),
                    ];
                    for (const inst of row.installments) cols.push(dateStr(inst.date), money(inst.amount));
                    cols.push(money(row.pending));
                    lines.push(cols.map(esc).join(","));
                }

                const totalRow = ["Total", money(totals.totalAmount), money(totals.paidAmount), "", "", "", ""];
                for (let n = 0; n < maxInstallments; n++) totalRow.push("", "");
                totalRow.push(money(totals.pending));
                lines.push(totalRow.map(esc).join(","));
                lines.push("");
                lines.push("");
            }

            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.csv"`);
            return res.send(lines.join("\n"));
        }

        // ═══ PDF ═══
        if (format === "pdf") {
            let pagesHtml = "";
            allData.forEach((data, idx) => {
                const { batch, programName, dateRangeText, maxInstallments, studentRows, totals } = data;

                let theadTop = `<th rowspan="2">Full Name</th><th rowspan="2">Total Amount</th><th rowspan="2">Total received</th><th rowspan="2">Invoice date</th><th rowspan="2">Installment plan</th><th colspan="2">Advance Payment</th>`;
                let theadBottom = `<th>Date of receipt</th><th>Amount</th>`;
                for (let n = 1; n <= maxInstallments; n++) {
                    theadTop += `<th colspan="2">Installment ${n}</th>`;
                    theadBottom += `<th>Date of receipt</th><th>Amount</th>`;
                }
                theadTop += `<th rowspan="2">Pending</th>`;

                let bodyRows = "";
                for (const r of studentRows) {
                    let cells = `<td class="name">${r.name}</td><td>${money(r.totalAmount)}</td><td>${money(r.paidAmount)}</td><td>${dateStr(r.issueDate)}</td><td>${r.installmentPlan}</td><td>${dateStr(r.advance.date)}</td><td>${money(r.advance.amount)}</td>`;
                    for (const inst of r.installments) cells += `<td>${dateStr(inst.date)}</td><td>${money(inst.amount)}</td>`;
                    cells += `<td>${money(r.pending)}</td>`;
                    bodyRows += `<tr>${cells}</tr>`;
                }

                let totalCells = `<td>Total</td><td>${money(totals.totalAmount)}</td><td>${money(totals.paidAmount)}</td><td></td><td></td><td></td><td></td>`;
                for (let n = 0; n < maxInstallments; n++) totalCells += `<td></td><td></td>`;
                totalCells += `<td>${money(totals.pending)}</td>`;

                const pageBreakStyle = idx < allData.length - 1 ? "page-break-after: always;" : "";

                pagesHtml += `
                    <div class="batch-page" style="${pageBreakStyle}">
                        <h1>${batch.name}</h1>
                        <h2>${programName}${dateRangeText ? " — " + dateRangeText : ""}</h2>
                        <table><thead><tr>${theadTop}</tr><tr>${theadBottom}</tr></thead>
                        <tbody>${bodyRows}</tbody><tfoot><tr>${totalCells}</tr></tfoot></table>
                    </div>
                `;
            });

            const html = `
                <!DOCTYPE html><html><head><meta charset="utf-8" /><style>
                    * { box-sizing: border-box; }
                    @page { margin: 24px; }
                    html, body { margin: 0; padding: 0; }
                    body { font-family: Arial, Helvetica, sans-serif; }
                    .batch-page { padding: 24px 24px 40px 24px; }
                    h1 { font-size: 16px; margin: 0 0 2px 0; }
                    h2 { font-size: 12px; font-weight: normal; color: #444; margin: 0 0 14px 0; }
                    table { border-collapse: collapse; width: 100%; font-size: 9px; margin-bottom: 20px; }
                    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; white-space: nowrap; }
                    th { background: #f3f3f3; font-weight: bold; }
                    td.name { text-align: left; font-weight: 500; }
                    tfoot td { font-weight: bold; background: #fafafa; }
                </style></head><body>${pagesHtml}</body></html>
            `;

            const maxCols = Math.max(...allData.map((d) => 5 + (d.maxInstallments + 1) * 2 + 1));
            const nameColWidth = 140;
            const otherColWidth = 78;
            const totalWidthPx = nameColWidth + (maxCols - 1) * otherColWidth + 40;
            const widthIn = (totalWidthPx / 96).toFixed(2);

            const browser = await launchBrowser();
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "networkidle0" });

            const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
            const heightIn = ((bodyHeight + 40) / 96).toFixed(2);

            const pdfUint8Array = await page.pdf({
                width: `${widthIn}in`,
                height: `${heightIn}in`,
                printBackground: true,
                margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
            });

            await browser.close();
            const pdfBuffer = Buffer.from(pdfUint8Array);

            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
            res.setHeader("Content-Length", pdfBuffer.length);
            return res.end(pdfBuffer);
        }

        // ═══ XLSX (default) — one sheet per batch ═══
        const workbook = new ExcelJS.Workbook();
        const usedSheetNames = new Set();

        for (const data of allData) {
            const { batch, programName, dateRangeText, maxInstallments, studentRows, totals } = data;

            let baseName = batch.name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
            let uniqueName = baseName || "Batch";
            let suffix = 1;
            while (usedSheetNames.has(uniqueName)) {
                uniqueName = `${baseName.slice(0, 28)}-${suffix}`;
                suffix++;
            }
            usedSheetNames.add(uniqueName);

            const sheet = workbook.addWorksheet(uniqueName);
            const totalCols = 5 + (maxInstallments + 1) * 2 + 1;

            sheet.getCell(1, 1).value = programName;
            sheet.getCell(1, 1).font = { bold: true, size: 13 };
            sheet.mergeCells(1, 2, 1, totalCols);
            sheet.getCell(1, 2).value = dateRangeText;
            sheet.getCell(1, 2).font = { bold: true };
            sheet.getCell(1, 2).alignment = { horizontal: "center" };

            const headerRowIndex = 3;
            const subHeaderRowIndex = 4;
            const row1 = ["Full Name", "Total Amount", "Total received", "Invoice date", "Installment plan", "Advance Payment", ""];
            const row2 = ["", "", "", "", "", "Date of receipt", "Amount"];
            for (let n = 1; n <= maxInstallments; n++) {
                row1.push(`Installment ${n}`, "");
                row2.push("Date of receipt", "Amount");
            }
            row1.push("Pending");
            row2.push("");

            sheet.getRow(headerRowIndex).values = row1;
            sheet.getRow(subHeaderRowIndex).values = row2;
            sheet.mergeCells(headerRowIndex, 1, subHeaderRowIndex, 1);
            sheet.mergeCells(headerRowIndex, 2, subHeaderRowIndex, 2);
            sheet.mergeCells(headerRowIndex, 3, subHeaderRowIndex, 3);
            sheet.mergeCells(headerRowIndex, 4, subHeaderRowIndex, 4);
            sheet.mergeCells(headerRowIndex, 5, subHeaderRowIndex, 5);
            let col = 6;
            for (let n = 0; n <= maxInstallments; n++) {
                sheet.mergeCells(headerRowIndex, col, headerRowIndex, col + 1);
                col += 2;
            }
            sheet.mergeCells(headerRowIndex, totalCols, subHeaderRowIndex, totalCols);
            sheet.getRow(headerRowIndex).font = { bold: true };
            sheet.getRow(subHeaderRowIndex).font = { bold: true };

            const currencyFmt = '"Rs. "#,##0.00';
            const dateFmt = "dd/mm/yyyy";
            let currentRow = subHeaderRowIndex + 1;
            for (const r of studentRows) {
                const rowData = [r.name, r.totalAmount, r.paidAmount, r.issueDate, r.installmentPlan, r.advance.date, r.advance.amount];
                for (const inst of r.installments) rowData.push(inst.date, inst.amount);
                rowData.push(r.pending);

                const excelRow = sheet.getRow(currentRow);
                excelRow.values = rowData;
                excelRow.getCell(2).numFmt = currencyFmt;
                excelRow.getCell(3).numFmt = currencyFmt;
                excelRow.getCell(4).numFmt = dateFmt;
                let c = 6;
                for (let n = 0; n <= maxInstallments; n++) {
                    excelRow.getCell(c).numFmt = dateFmt;
                    excelRow.getCell(c + 1).numFmt = currencyFmt;
                    c += 2;
                }
                excelRow.getCell(totalCols).numFmt = currencyFmt;
                currentRow++;
            }

            currentRow++;
            const totalRow = sheet.getRow(currentRow);
            totalRow.getCell(1).value = "Total";
            totalRow.getCell(1).font = { bold: true };
            totalRow.getCell(2).value = totals.totalAmount;
            totalRow.getCell(2).numFmt = currencyFmt;
            totalRow.getCell(2).font = { bold: true };
            totalRow.getCell(3).value = totals.paidAmount;
            totalRow.getCell(3).numFmt = currencyFmt;
            totalRow.getCell(3).font = { bold: true };
            totalRow.getCell(totalCols).value = totals.pending;
            totalRow.getCell(totalCols).numFmt = currencyFmt;
            totalRow.getCell(totalCols).font = { bold: true };

            sheet.columns.forEach((column) => { column.width = 18; });
        }

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("BULK BATCH EXPORT ERROR:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /admin/v1/batches/:id/students — Add student to batch
exports.adminAddStudentToBatch = async (req, res) => {
    try {
        const { studentId } = req.body;
        if (!studentId) {
            return res.status(400).json({ success: false, message: "studentId required" });
        }

        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        // Check duplicate
        if (batch.students.includes(studentId)) {
            return res.status(409).json({ success: false, message: "Student already in this batch" });
        }

        batch.students.push(studentId);
        batch.current_students = batch.students.length;
        await batch.save();

        // Enrollment check karo
        const existingEnrollment = await Enrollment.findOne({
            user: studentId,
            program: batch.program_id,
        });

        if (existingEnrollment) {
            // Sirf batch update karo
            await Enrollment.findByIdAndUpdate(existingEnrollment._id, {
                batch: batch._id,
            });
        } else {
            // Naya enrollment banao
            await Enrollment.create({
                user: studentId,
                program: batch.program_id,
                batch: batch._id,
                status: "active",
                accessStatus: "RESTRICTED",
            });
        }

        const populatedBatch = await Batch.findById(batch._id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone")
            .populate("students", "name email phone avatarColor");

        res.status(200).json({ success: true, data: populatedBatch });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /admin/v1/batches/:id/students/:studentId — Remove student from batch
exports.adminRemoveStudentFromBatch = async (req, res) => {
    try {
        const { studentId } = req.params;

        const batch = await Batch.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({ success: false, message: "Batch not found" });
        }

        batch.students = batch.students.filter((s) => s.toString() !== studentId);
        batch.current_students = batch.students.length;
        await batch.save();

        // Enrollment ka batch null karo
        await Enrollment.findOneAndUpdate(
            { user: studentId, batch: batch._id },
            { $unset: { batch: "" } },
            { new: true }
        );

        const populatedBatch = await Batch.findById(batch._id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone")
            .populate("students", "name email phone avatarColor");

        res.status(200).json({ success: true, data: populatedBatch });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /admin/v1/batches/:id/switch-student — Switch student to another batch
exports.adminSwitchStudentBatch = async (req, res) => {
    try {
        const { studentId, targetBatchId } = req.body;
        if (!studentId || !targetBatchId) {
            return res.status(400).json({ success: false, message: "studentId and targetBatchId required" });
        }

        // Target batch exists?
        const targetBatch = await Batch.findById(targetBatchId);
        if (!targetBatch) {
            return res.status(404).json({ success: false, message: "Target batch not found" });
        }

        // ── Current batch se remove + count ─────────────────
        const currentBatch = await Batch.findById(req.params.id);
        if (currentBatch) {
            currentBatch.students = currentBatch.students.filter((s) => s.toString() !== studentId);
            currentBatch.current_students = currentBatch.students.length;
            await currentBatch.save();
        }

        // ── Target batch mein add + count ────────────────────
        if (!targetBatch.students.map(s => s.toString()).includes(studentId)) {
            targetBatch.students.push(studentId);
            targetBatch.current_students = targetBatch.students.length;
            await targetBatch.save();
        }

        // ── Enrollment update ────────────────────────────────
        await Enrollment.findOneAndUpdate(
            { user: studentId, program: targetBatch.program_id },
            { batch: targetBatch._id },
            { new: true }
        );

        const populatedBatch = await Batch.findById(targetBatch._id)
            .populate("program_id", "name slug")
            .populate("instructor_id", "name email phone")
            .populate("students", "name email phone avatarColor");

        res.status(200).json({ success: true, message: "Student switched successfully", data: populatedBatch });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /admin/v1/batches/:id
exports.adminDeleteBatch = async (req, res) => {
    try {
        await Batch.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Batch deleted",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /admin/v1/courses/:id
exports.adminGetCourseById = async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if (!course) return res.status(404).json({ message: "Course not found" });
        res.status(200).json({ success: true, data: course });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /admin/v1/modules/:id
exports.adminGetModuleById = async (req, res) => {
    try {
        const module = await Module.findById(req.params.id);
        if (!module) return res.status(404).json({ message: "Module not found" });
        res.status(200).json({ success: true, data: module });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ── Material Upload Handler (manuals/slides/audio) ──
exports.uploadMaterial = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const allowedMimeTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
            "application/vnd.ms-powerpoint", // ppt
            "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a",
        ];

        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type. PDF, PPT/PPTX ya audio hi allowed hai.",
            });
        }

        const isAudio = req.file.mimetype.startsWith("audio/");
        const base64 = req.file.buffer.toString("base64");
        const dataUri = `data:${req.file.mimetype};base64,${base64}`;

        const result = await cloudinary.uploader.upload(dataUri, {
            folder: "program-materials",
            resource_type: isAudio ? "video" : "raw", // PDF/PPT = raw, audio = video
        });

        return res.status(200).json({
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
        });
    } catch (err) {
        console.log("MATERIAL UPLOAD ERROR:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};


