
const mongoose = require("mongoose");
const Program = require("../models/programModel.js");
const Course = require("../models/courseModel.js");
const Module = require("../models/moduleModel.js");
const Lesson = require("../models/lessonModel.js");
const Batch = require("../models/batchModel.js");
const Enrollment = require("../models/enrollmentModel");
const Invoice = require("../models/invoiceModel");

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
        const { program_id, status } = req.query;

        const query = {};

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

        const payload = { ...req.body, date_required: isDateRequired };

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

        const payload = { ...req.body, date_required: isDateRequired };

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

        const payload = { ...req.body, date_required: isDateRequired };

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


