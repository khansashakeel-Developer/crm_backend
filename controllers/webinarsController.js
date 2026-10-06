const Webinar = require('../models/WebinarModel');
const Registration = require('../models/RegistrationModel');

// ---------- ADMIN ----------

exports.createWebinar = async (req, res) => {
  try {
    const webinar = await Webinar.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json(webinar);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// controllers/webinarController.js
exports.getAllWebinars = async (req, res) => {
  const { page = 1, limit = 10, search = "", status = "" } = req.query;

  const query = {};
  if (search) query.title = { $regex: search, $options: "i" };
  if (status) query.status = status;

  const skip = (Number(page) - 1) * Number(limit);

  const [webinars, total] = await Promise.all([
    Webinar.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)),
    Webinar.countDocuments(query),
  ]);

  res.json({
    data: webinars,
    meta: {
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      total,
    },
  });
};

exports.getWebinarById = async (req, res) => {
  const webinar = await Webinar.findById(req.params.id);
  if (!webinar) return res.status(404).json({ message: 'Not found' });
  res.json(webinar);
};

// controllers/webinarsController.js
exports.updateWebinar = async (req, res) => {
  try {
    const payload = { ...req.body };

    // ✅ assignedTo temporarily disabled — feature commented out for now
    delete payload.assignedTo;

    const webinar = await Webinar.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!webinar) return res.status(404).json({ message: "Not found" });
    res.json(webinar);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteWebinar = async (req, res) => {
  await Webinar.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
};

exports.getWebinarRegistrations = async (req, res) => {
  const registrations = await Registration.find({ webinar: req.params.id }).sort({ createdAt: -1 });
  res.json(registrations);
};

// ---------- PUBLIC ----------

// Public: the next published webinar (used by the website's free-webinar form and announcement window).
// GET /api/webinars/public/free-weekly/next  ->  { _id, title, date, flyerUrl }   (404 when none is scheduled)
exports.getNextFreeWeeklyWebinar = async (req, res) => {
  try {
    const webinar = await Webinar.findOne({ status: "published", date: { $gt: new Date() } })
      .sort({ date: 1 })
      .select("title date flyerUrl");
    if (!webinar) return res.status(404).json({ message: "No upcoming webinar" });
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json({ _id: webinar._id, title: webinar.title, date: webinar.date, flyerUrl: webinar.flyerUrl || undefined });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPublicWebinar = async (req, res) => {
  const webinar = await Webinar.findOne({ _id: req.params.id, status: "published" })
    .select("title description date fields"); // ✅ assignedTo hata diya
  if (!webinar) return res.status(404).json({ message: "Webinar not found or not published" });
  res.json(webinar);
};

exports.registerForWebinar = async (req, res) => {
  try {
    const webinar = await Webinar.findOne({ _id: req.params.id, status: "published" });
    // ✅ .populate("assignedTo", "name") hata diya

    if (!webinar) return res.status(404).json({ message: "Webinar not found or not published" });

    const registration = await Registration.create({
      webinar: webinar._id,
      responses: req.body.responses,
      ip: req.ip,
      webinarTitleSnapshot: webinar.title,   // ✅ title snapshot — ye perfect chal raha hai, rakha hai
      // ✅ assignedToSnapshot hata diya
    });

    res.status(201).json({ message: "Registered successfully", registration });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ── assignWebinar function poora COMMENT OUT kar diya — temporarily disabled ──
// exports.assignWebinar = async (req, res) => {
//   try {
//     const { userId } = req.body;
//     const webinar = await Webinar.findByIdAndUpdate(
//       req.params.id,
//       { assignedTo: userId || null },
//       { new: true }
//     ).populate("assignedTo", "name email role");
//     if (!webinar) return res.status(404).json({ message: "Not found" });
//     res.json(webinar);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// };

// controllers/webinarController.js
exports.duplicateWebinar = async (req, res) => {
  try {
    const original = await Webinar.findById(req.params.id);
    if (!original) return res.status(404).json({ message: "Webinar not found" });

    const duplicate = await Webinar.create({
      title: `${original.title} (Copy)`,
      description: original.description,
      date: original.date,
      status: "draft",
      fields: original.fields,
      // ✅ assignedTo hata diya
      createdBy: req.user._id,
    });

    res.status(201).json(duplicate);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
// const express = require('express');
// const router = express.Router();
// const { protect } = require('../middlewares/authMiddleware');
// const { authorize } = require('../middlewares/roleMiddleware');
// const Webinar = require('../models/WebinarModel');
// const Registration = require('../models/Registration');

// // ---------- ADMIN ROUTES ----------

// // Create webinar with custom fields
// router.post('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   try {
//     const webinar = await Webinar.create({ ...req.body, createdBy: req.user._id });
//     res.status(201).json(webinar);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });

// // List all webinars (admin)
// router.get('/', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   const webinars = await Webinar.find().sort({ date: -1 });
//   res.json(webinars);
// });

// // Get single webinar (admin, includes fields for editing)
// router.get('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   const webinar = await Webinar.findById(req.params.id);
//   if (!webinar) return res.status(404).json({ message: 'Not found' });
//   res.json(webinar);
// });

// // Update webinar / fields
// router.put('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   const webinar = await Webinar.findByIdAndUpdate(req.params.id, req.body, { new: true });
//   if (!webinar) return res.status(404).json({ message: 'Not found' });
//   res.json(webinar);
// });

// // Delete webinar
// router.delete('/:id', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   await Webinar.findByIdAndDelete(req.params.id);
//   res.json({ message: 'Deleted' });
// });

// // List registrations for a webinar
// router.get('/:id/registrations', protect, authorize('admin', 'super_admin'), async (req, res) => {
//   const registrations = await Registration.find({ webinar: req.params.id }).sort({ createdAt: -1 });
//   res.json(registrations);
// });

// // ---------- PUBLIC ROUTES ----------

// // Get published webinar form (public, no auth)
// router.get('/public/:id', async (req, res) => {
//   const webinar = await Webinar.findOne({ _id: req.params.id, status: 'published' })
//     .select('title description date fields');
//   if (!webinar) return res.status(404).json({ message: 'Webinar not found or not published' });
//   res.json(webinar);
// });

// // Submit registration (public, no auth)
// router.post('/public/:id/register', async (req, res) => {
//   try {
//     const webinar = await Webinar.findOne({ _id: req.params.id, status: 'published' });
//     if (!webinar) return res.status(404).json({ message: 'Webinar not found or not published' });

//     const registration = await Registration.create({
//       webinar: webinar._id,
//       responses: req.body.responses,
//       ip: req.ip
//     });
//     res.status(201).json({ message: 'Registered successfully', registration });
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });

// module.exports = router;
// const Webinar = require('../models/WebinarModel');
// const Registration = require('../models/RegistrationModel');

// // ---------- ADMIN ----------

// exports.createWebinar = async (req, res) => {
//   try {
//     const webinar = await Webinar.create({ ...req.body, createdBy: req.user._id });
//     res.status(201).json(webinar);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// };

// // controllers/webinarController.js
// exports.getAllWebinars = async (req, res) => {
//   const { page = 1, limit = 10, search = "", status = "" } = req.query;

//   const query = {};
//   if (search) query.title = { $regex: search, $options: "i" };
//   if (status) query.status = status;

//   const skip = (Number(page) - 1) * Number(limit);

//   const [webinars, total] = await Promise.all([
//     Webinar.find(query).sort({ date: -1 }).skip(skip).limit(Number(limit)),
//     Webinar.countDocuments(query),
//   ]);

//   res.json({
//     data: webinars,
//     meta: {
//       page: Number(page),
//       totalPages: Math.ceil(total / Number(limit)),
//       total,
//     },
//   });
// };
// exports.getWebinarById = async (req, res) => {
//   const webinar = await Webinar.findById(req.params.id);
//   if (!webinar) return res.status(404).json({ message: 'Not found' });
//   res.json(webinar);
// };

// exports.updateWebinar = async (req, res) => {
//   const webinar = await Webinar.findByIdAndUpdate(req.params.id, req.body, { new: true });
//   if (!webinar) return res.status(404).json({ message: 'Not found' });
//   res.json(webinar);
// };

// exports.deleteWebinar = async (req, res) => {
//   await Webinar.findByIdAndDelete(req.params.id);
//   res.json({ message: 'Deleted' });
// };

// exports.getWebinarRegistrations = async (req, res) => {
//   const registrations = await Registration.find({ webinar: req.params.id }).sort({ createdAt: -1 });
//   res.json(registrations);
// };

// // ---------- PUBLIC ----------

// exports.getPublicWebinar = async (req, res) => {
//   const webinar = await Webinar.findOne({ _id: req.params.id, status: 'published' })
//     .select('title description date fields');
//   if (!webinar) return res.status(404).json({ message: 'Webinar not found or not published' });
//   res.json(webinar);
// };

// exports.registerForWebinar = async (req, res) => {
//   try {
//     const webinar = await Webinar.findOne({ _id: req.params.id, status: "published" });
//     if (!webinar) return res.status(404).json({ message: "Webinar not found or not published" });

//     const registration = await Registration.create({
//       webinar: webinar._id,
//       responses: req.body.responses,
//       referredBy: req.body.referredBy || null, // ✅ NEW
//       usedTitle: req.body.usedTitle || null,
//       ip: req.ip,
//     });
//     res.status(201).json({ message: "Registered successfully", registration });
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// };