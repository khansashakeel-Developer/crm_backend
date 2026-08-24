const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            // trim: true,
        },
        slug: {
            type: String,
            unique: true,
            lowercase: true,
        },
        description: {
            type: String,
        },
        short_description: {
            type: String,
        },
        level: {
            type: String,
            enum: ["level 1", "level 2", "level 3", "level 4", "level 5", "level 6"],
            required: function () {
                return this.category !== "business_in_a_box";
            },
        },
        thumbnail: {
            type: String, // S3 URL
        },
        price: {
            type: Number,
            default: 0,
        },
        currency: {
            type: String,
            default: "USD",
        },
        duration_weeks: {
            type: Number,
        },
        category: {
            type: String,
            enum: ["nlp", "icf", "hypnotherapy", "trainer", "business_in_a_box"],
            default: "nlp",
        },
        status: {
            type: String,
            enum: ["active", "inactive", "draft"],
            default: "draft",
        },
        is_featured: {
            type: Boolean,
            default: false,
        },
        certificateFee: {
            type: Number,
            default: 0,
        },
        manualFee: {
            type: Number,
            default: 5000,
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        // Stats
        // total_students: {
        //     type: Number,
        //     default: 0,
        // },
        total_courses: {
            type: Number,
            default: 0,
        },
        materials: [
            {
                title: { type: String, required: true },       
                type: {
                    type: String,
                    enum: ["manual", "slides", "audio", "other"],
                    default: "other",
                },
                fileUrl: { type: String, required: true },       
                public_id: { type: String },                     
                order: { type: Number, default: 0 },
            },
        ],
    },
    { timestamps: true }
);

// ✅ Virtual yahan define hoga, schema ke saath, ek hi baar
programSchema.virtual('total_students', {
    ref: 'Enrollment',
    localField: '_id',
    foreignField: 'program',
    count: true,
});

// ✅ toJSON/toObject mein virtuals include karne ke liye (warna JSON response mein nahi aayenge)
programSchema.set('toObject', { virtuals: true });
programSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model("Program", programSchema);