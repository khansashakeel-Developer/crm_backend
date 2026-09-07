const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware.js");
const { authorize } = require("../middlewares/roleMiddleware.js");
const cloudinary = require("../config/cloudinary.js");  
const multer = require("multer");                        
const {
  // Public
  getPrograms,
  getProgramBySlug,
  getProgramCurriculum,
  getProgramBatches,
  getProgramsPublic,
  // Admin — Programs
  adminGetPrograms,
  adminCreateProgram,
  adminGetProgramById,
  adminUpdateProgram,
  adminDeleteProgram,
  adminDuplicateProgram,
  // Admin — Courses
  adminGetCourses,
  adminCreateCourse,
  adminUpdateCourse,
  adminDeleteCourse,
  adminReorderCourses,
  adminGetCourseById,
  // Admin — Modules
  adminGetModules,
  adminCreateModule,
  adminUpdateModule,
  adminDeleteModule,
  adminGetModuleById,
  // Admin — Lessons
  adminGetLessons,
  adminCreateLesson,
  adminUpdateLesson,
  adminDeleteLesson,
  // Admin — Batches
  adminGetBatches,
  adminGetBatchById,
  adminCreateBatch,
  adminUpdateBatch,
  adminDeleteBatch,
  adminExportBatchPayments, //khansa
  // Admin — Batch Student Management
  adminAddStudentToBatch,
  adminRemoveStudentFromBatch,
  adminSwitchStudentBatch,
  uploadMaterial
} = require("../controllers/programController.js");

// ── Multer Memory Storage ──
const upload = multer({
  storage: multer.memoryStorage(),
});

// ── Audio Upload Handler ──
const uploadAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No audio file uploaded" });
    }

    const allowedMimeTypes = [
      "audio/mpeg", "audio/mp3", "audio/wav",
      "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only audio files allowed.",
      });
    }

    const base64 = req.file.buffer.toString("base64");
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "lesson-audios",
      resource_type: "video",  // Cloudinary audio = video resource type
    });

    return res.status(200).json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration,
      format: result.format,
    });

  } catch (err) {
    console.log("AUDIO UPLOAD ERROR:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── AUDIO UPLOAD ROUTE ──
router.post(
  "/upload-audio",
  protect,
  authorize("admin", "super_admin"),
  upload.single("audio"),
  uploadAudio
);

// ── CLOUDINARY SIGNATURE ──
router.get(
  "/upload-signature",
  protect,
  authorize("admin", "super_admin"),
  async (req, res) => {
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);
      
      // ❌ resource_type signature params mein nahi hoga
      const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: "lesson-audios" },
        process.env.CLOUDINARY_API_SECRET
      );
      
      res.json({
        timestamp,
        signature,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── PUBLIC ──
router.get("/public", getPrograms);
router.get("/public/:slug", getProgramBySlug);
router.get("/name", getProgramsPublic);
router.get("/public/:slug/curriculum", getProgramCurriculum);
router.get("/public/:slug/batches", getProgramBatches);

// ── FIRST ADMIN — Programs ──
router.get("/", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetPrograms);
router.post("/", protect, authorize("admin", "super_admin"), adminCreateProgram);
router.post("/:id/duplicate", protect, authorize("admin", "super_admin"), adminDuplicateProgram);

// ── ADMIN — Batches ──
router.get("/batches", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetBatches);
router.get("/batches/:id", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetBatchById);
router.get("/batches/:id/export", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminExportBatchPayments); //khansa
router.post("/batches", protect, authorize("admin", "super_admin", "finance_manager"), adminCreateBatch);
router.put("/batches/:id", protect, authorize("admin", "super_admin", "finance_manager"), adminUpdateBatch);
router.delete("/batches/:id", protect, authorize("admin", "super_admin", "finance_manager"), adminDeleteBatch);

// ── ADMIN — Batch Student Management ──
router.post("/batches/:id/students", protect, authorize("admin", "super_admin", "finance_manager"), adminAddStudentToBatch);
router.delete("/batches/:id/students/:studentId", protect, authorize("admin", "super_admin", "finance_manager"), adminRemoveStudentFromBatch);
router.post("/batches/:id/switch-student", protect, authorize("admin", "super_admin", "finance_manager"), adminSwitchStudentBatch);

// ── ADMIN — Courses ──
router.get("/:id/courses", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetCourses);
router.post("/:id/courses", protect, authorize("admin", "super_admin"), adminCreateCourse);
router.put("/courses/reorder", protect, authorize("admin", "super_admin"), adminReorderCourses);
router.put("/courses/:id", protect, authorize("admin", "super_admin", "finance_manager"), adminUpdateCourse);
router.delete("/courses/:id", protect, authorize("admin", "super_admin"), adminDeleteCourse);
router.get("/courses/:id", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetCourseById);

// ── ADMIN — Modules ──
router.get("/courses/:id/modules", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep"), adminGetModules);
router.post("/courses/:id/modules", protect, authorize("admin", "super_admin"), adminCreateModule);
router.put("/modules/:id", protect, authorize("admin", "super_admin"), adminUpdateModule);
router.delete("/modules/:id", protect, authorize("admin", "super_admin"), adminDeleteModule);
router.get("/modules/:id", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep"), adminGetModuleById);

// ── ADMIN — Lessons ──
router.get("/modules/:id/lessons", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep"), adminGetLessons);
router.post("/modules/:id/lessons", protect, authorize("admin", "super_admin"), adminCreateLesson);
router.put("/lessons/:id", protect, authorize("admin", "super_admin"), adminUpdateLesson);
router.delete("/lessons/:id", protect, authorize("admin", "super_admin"), adminDeleteLesson);

// ── LAST ADMIN — Programs ──
router.get("/:id", protect, authorize("admin", "super_admin", "sales_manager", "sales_rep", "finance_manager"), adminGetProgramById);
router.put("/:id", protect, authorize("admin", "super_admin", "finance_manager"), adminUpdateProgram);
router.delete("/:id", protect, authorize("admin", "super_admin"), adminDeleteProgram);

router.post("/upload-material", protect, authorize("admin", "super_admin"), upload.single("file"), uploadMaterial);

module.exports = router;
