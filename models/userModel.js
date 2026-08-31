// models/userModel.js — UPDATED
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      default: null,
      index: true,
    },

    // email: {
    //   type: String,
    //   // ✅ old users ka email nahi hoga — required hataya, sparse index lagaya
    //   unique: true,
    //   sparse: true, // null values unique constraint se exempt hongi
    //   lowercase: true,
    //   default: null,
    // },


    // phone: {
    //   type: String,
    //   unique: true,
    //   sparse: true, // sirf old users ke paas hoga
    //   default: null,
    // },

    // ✅ name se generate hoga: "arslan larik" → "arslan_larik"
    // username: {
    //   type: String,
    //   unique: true,
    //   sparse: true,
    //   lowercase: true,
    //   default: null,
    // },

    // password: {
    //   type: String,
    //   required: true,
    //   select: false,
    // },
    password: {
      type: String,
      required: function () {
        return !this.is_old_user;
      },
      select: false,
    },
    role: {
      type: String,
      enum: [
        "super_admin",
        "admin",
        "sales_manager",
        "sales_rep",
        "support",
        "finance_manager",
        "instructor",
        "email_marketing",
        "seo",
        "user"
      ],
      default: "user",
    },
    // existing schema mein, documents field se pehle ya baad mein add karo:
    fatherHusbandName: { type: String, default: null },
    cnic: { type: String, default: null },
    bankAccountNumber: { type: String, default: null },
    currentAddress: { type: String, default: null },
    emergencyContactName: { type: String, default: null },
    emergencyContactPhone: { type: String, default: null },
    occupation: { type: String, default: null },

    is_old_user: {
      type: Boolean,
      default: false,
    },

    needsAccountSetup: {
      type: Boolean,
      default: false,
    },

    source: {
      type: String,
      enum: ["utm", "referral", "social", "facebook", "instagram", "google", "organic", "enroll", "contact", "contact us",
        "webinar", "frontforce", "lms", "crm", "resource", "register", "other"],
      default: "enroll"
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    isTemporaryPassword: {
      type: Boolean,
      default: false,
    },

    permissions: {
      type: [String],
      default: [],
    },

    avatarColor: {
      type: String,
      default: null,
    },

    isAvailableForLead: {
      type: Boolean,
      default: true,
    },

    lastLeadAssignedAt: {
      type: Date,
      default: null,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    resetPasswordAttempts: { type: Number, default: 0 },
    refreshToken: {
      type: String,
      default: null,
    },

    // userModel.js me add karo
    legacyPrograms: [
      {
        program: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Program",
        },
        isGraduate: {
          type: Boolean,
          default: false,
        },
      },
    ],

    documents: [
      {
        type: {
          type: String,
          enum: ["cnic", "receipt", "certificate", "other"],
          required: true,
        },
        label: {
          type: String,
          default: null,
        },
        url: {
          type: String,
          required: true,
        },
        fileType: {
          type: String,
          enum: ["image", "pdf"],
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    adSource: {
      platform: { type: String, default: null },
      externalLeadId: { type: String, default: null },
      adId: { type: String, default: null },
      adName: { type: String, default: null },
      adsetId: { type: String, default: null },
      adsetName: { type: String, default: null },
      campaignId: { type: String, default: null },
      campaignName: { type: String, default: null },
      formId: { type: String, default: null },
      formName: { type: String, default: null },
      createdTime: { type: Date, default: null },
    },

    // ─── QuickBooks Online Sync ───────────────────────────────────
    qboCustomerId: { type: String, default: null, index: true },
    qboSyncStatus: {
      type: String,
      enum: ["pending", "synced", "failed", "skipped"],
      default: "pending",
    },
    qboLastSyncedAt: { type: Date, default: null },
    qboSyncError: { type: String, default: null },

  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//     },

//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//     },

//     password: {
//       type: String,
//       required: true,
//       select: false,
//     },

//     role: {
//       type: String,
//       // enum: ["admin", "sales_manager", "sales", "support", "finance_manager", "user"],
//       enum: [
//         "super_admin",
//         "admin",
//         "sales_manager",
//         "sales_rep",
//         "support",
//         "finance_manager",
//         "user"
//       ],

//       default: "user",

//     },

//     isVerified: {
//       type: Boolean,
//       default: false,
//     },

//     isActive: {
//       type: Boolean,
//       default: false,
//     },

//     isPaid: {
//       type: Boolean,
//       default: false
//     },

//     isTemporaryPassword: {
//       type: Boolean,
//       default: false
//     },

//     permissions: {
//       type: [String],
//       default: []
//     },

//     avatarColor: {
//       type: String,
//       default: null
//     },

//     lastLogin: {
//       type: Date,
//       default: null
//     },

//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },

//     verificationToken: String,
//     resetPasswordToken: String,
//     resetPasswordExpire: Date,
//     resetPasswordAttempts: { type: Number, default: 0 },
//     refreshToken: {
//       type: String,
//       default: null,
//     },

//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("User", userSchema);