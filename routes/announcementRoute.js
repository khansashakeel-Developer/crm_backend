const express = require("express");
const multer = require("multer");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { getPublicAnnouncements, uploadFlyer } = require("../controllers/announcementController");

// Flyer: images only, up to 2 MB, kept in memory and sent straight to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

// PUBLIC (the website reads this)
router.get("/public", getPublicAnnouncements);

// ADMIN (CRM screen)
router.post("/flyer", protect, authorize("admin", "super_admin"), upload.single("flyer"), uploadFlyer);

module.exports = router;
