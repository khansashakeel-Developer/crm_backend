// Website announcements: the upcoming-trainings window and the scrolling strip.
// Source of truth is the existing Batch records. Marketing ticks "Announce on the website" (and optionally
// "Show in the strip") on a batch in the CRM; nothing is announced otherwise.
const Batch = require("../models/batchModel");
const uploadBufferToCloudinary = require("../utils/uploadBufferToCloudinary");

// Public. GET /api/v1/announcements/public
// -> { data: [{ _id, type: "training", title, startsAt, href, showInStrip }] }   (soonest first, future only)
exports.getPublicAnnouncements = async (req, res) => {
  try {
    const batches = await Batch.find({
      announce: true,
      status: "upcoming",
      start_date: { $gt: new Date() },
    })
      .sort({ start_date: 1 })
      .limit(10)
      .populate("program_id", "name slug status")
      .select("name start_date show_in_strip program_id");

    const data = batches
      .filter((b) => b.program_id && b.program_id.slug && b.program_id.status === "active")
      .map((b) => ({
        _id: b._id,
        type: "training",
        title: `${b.program_id.name}, ${b.name}`,
        startsAt: b.start_date,
        href: `/program/${b.program_id.slug}`,
        showInStrip: !!b.show_in_strip,
      }));

    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin. POST /api/v1/announcements/flyer  (multipart, field "flyer")  -> { url }
// Marketing uploads only the flyer; the returned url is saved as the webinar's flyerUrl.
exports.uploadFlyer = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No flyer uploaded" });
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: "alco-webinar-flyers",
      filename: `flyer-${Date.now()}`,
    });
    res.status(201).json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
