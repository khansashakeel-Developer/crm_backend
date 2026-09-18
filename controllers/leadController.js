const mongoose = require("mongoose"); // ✅ ADD THIS
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const sendEmailDynamic = require("../utils/sendEmailDynamic.js");
const User = require("../models/userModel.js");
const generateColor = require("../utils/generateColor.js");
const { notifyStatusChanged, createNotification, notifyLeadAssigned, notifyActivityAdded, notifyPaymentPlanSet, notifyContractSubmitted } = require("../config/notificationService.js");
const logAudit = require("../utils/auditLogger.js");
const Enrollment = require("../models/enrollmentModel.js");
const Invoice = require("../models/invoiceModel.js");
const Program = require("../models/programModel.js");
const Lead = require("../models/leadModel.js");
const Batch = require("../models/batchModel");
const Certificate = require("../models/certificateModel.js");
const assignLeadManager = require("../utils/assignLeadManager.js");
const { postInvoiceJournal } = require("../utils/postInvoiceJournal.js");
const sendPaymentPlanInvoiceEmail = require("../utils/sendPaymentPlanInvoiceEmail.js");
const { invoiceNumberExists, reserveNextInvoiceNumber } = require("../utils/invoiceNumber.js");
const { sendServerSideStageEvent } = require("../libs/metaServerEvents.js");
const qboHooks = require("../utils/qboHooks");
const ExcelJS = require("exceljs");


// Turnstile token verify utility
const verifyTurnstile = async (token) => {
    if (!token) return false;
    try {
        const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: process.env.TURNSTILE_SECRET_KEY,
                response: token,
            }),
        });
        const data = await res.json();
        return data.success === true;
    } catch {
        return false;
    }
};

// --------------------24/4/2026--------------------
// exports.createLead = async (req, res) => {
//     console.log("REQ BODY:", req.body);  // ← yeh add karo
//     console.log("PHONE:", req.body.phone);  // ← yeh add karo
//     try {
//         const email = req.body.email?.toLowerCase().trim();
//         const { first_name, last_name, program_id } = req.body;

//         if (!email || !first_name || !program_id) {
//             return res.status(400).json({
//                 message: "Email, first name and program are required",
//             });
//         }

//         // ── Step 1: User check ────────────────────────────────
//         // ── Step 1: User check ────────────────────────────────
//         const existingUser = await User.findOne({
//             email: email  // already lowercase trim ho chuka hai upar
//         });

//         if (existingUser) {
//             // Same program check
//             const existingLead = await Lead.findOne({ email, program_id });

//             if (existingLead) {
//                 return res.status(200).json({
//                     success: true,
//                     duplicate: true,
//                     message: "Thank you for your interest! We already have your application and will contact you soon. 😊",
//                 });
//             }

//             // ✅ Alag program — sirf lead banao
//             const lead = await Lead.create({
//                 ...req.body,
//                 email,
//                 created_by: req.user?.id || null,
//             });

//             return res.status(201).json({
//                 success: true,
//                 duplicate: false,
//                 message: "Thank you for applying! We'll be in touch soon. 😊",
//                 data: lead,
//             });
//         }

//         // ── Step 2: Naya user banao ───────────────────────────
//         const plainPassword = Math.random().toString(36).slice(-8);
//         const hashedPassword = await bcrypt.hash(plainPassword, 10);

//         const newUser = await User.create({
//             name: `${first_name} ${last_name || ""}`.trim(),
//             email,
//             phone: req.body.phone || null,  // ← ADD KARO
//             password: hashedPassword,
//             role: "user",
//             isVerified: true,
//             isActive: true,
//             avatarColor: generateColor(email),
//             isTemporaryPassword: true,
//         });

//         // ── Step 3: Lead banao ────────────────────────────────
//         const lead = await Lead.create({
//             ...req.body,
//             email,
//             created_by: req.user?.id || null,
//         });

//         // ── Step 4: Credentials email bhejo ──────────────────
//         await sendEmailDynamic({
//             to: email,
//             subject: "Your Account Credentials 🔑",
//             templateName: "send-user-credentials",
//             replacements: {
//                 UserName: `${first_name} ${last_name || ""}`,
//                 UserEmail: email,
//                 UserPassword: plainPassword,
//                 SupportEmail: "alco@support.com",
//                 YourCompanyName: "Al-and-co",
//                 LoginLink: `https://alco-crm-frontend.vercel.app/auth?email=${email}&password=${plainPassword}`,
//             },
//         });

//         return res.status(201).json({
//             success: true,
//             duplicate: false,
//             message: "Thank you for applying! Check your email for login details. 😊",
//             data: lead,
//         });

//     } catch (error) {
//         console.log("FULL ERROR:", error); // ← yeh add karo temporarily
//         if (error.code === 11000) {
//             console.log("DUPLICATE KEY:", error.keyValue); // ← yeh bhi
//             return res.status(200).json({
//                 success: true,
//                 duplicate: true,
//                 message: "Thank you! We already have your details. 😊",
//             });
//         }
//         res.status(500).json({ message: error.message });
//     }
// };

// ─── Contact Form → Lead (website se aata hai) ────────────────
// exports.createLeadContact = async (req, res) => {
//     try {
//         const { first_name, last_name, email, phone, query } = req.body;

//         if (!first_name || !email) {
//             return res.status(400).json({
//                 success: false,
//                 message: "First name and email are required",
//             });
//         }

//         const cleanEmail = email.toLowerCase().trim();

//         // 🔍 Check existing lead
//         const existingLead = await Lead.findOne({ email: cleanEmail });

//         // 🔍 Check existing user
//         const existingUser = await User.findOne({ email: cleanEmail });

//         const plainPassword = Math.random().toString(36).slice(-8);
//         const hashedPass = await bcrypt.hash(plainPassword, 10);

//         // ✅ USER CREATE (always check)
//         if (!existingUser) {
//             await User.create({
//                 name: `${first_name} ${last_name || ""}`.trim(),
//                 email: cleanEmail,
//                 phone: phone || null,
//                 password: hashedPass,
//                 role: "user",
//                 isVerified: true,
//                 isActive: true,
//                 avatarColor: generateColor(cleanEmail),
//                 isTemporaryPassword: true,
//             });
//         }

//         // ❌ Lead already exist → sirf response do (but user ban chuka hoga)
//         if (existingLead) {
//             return res.status(200).json({
//                 success: true,
//                 duplicate: true,
//                 message: "Thank you! We already have your details 😊",
//             });
//         }

//         // ✅ New Lead create
//         const lead = await Lead.create({
//             first_name: first_name.trim(),
//             last_name: (last_name || "").trim(),
//             email: cleanEmail,
//             phone: phone || null,
//             query: query || null,
//             source: "contact",
//             status: "new",
//             quality: "cold",
//         });

//         await sendEmailDynamic({
//             to: email,
//             subject: "Your Account Credentials 🔑",
//             templateName: "send-user-credentials",
//             replacements: {
//                 UserName: `${first_name} ${last_name || ""}`,
//                 UserEmail: email,
//                 UserPassword: plainPassword,
//                 SupportEmail: "alco@support.com",
//                 YourCompanyName: "Al-and-co",
//                 LoginLink: `https://alco-crm-frontend.vercel.app/auth?email=${email}&password=${plainPassword}`,
//             },
//         });

//         return res.status(201).json({
//             success: true,
//             duplicate: false,
//             message: "Thank you! We will contact you soon 😊",
//             data: { lead_id: lead._id },
//         });

//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
// --------------------24/4/2026--------------------
// CREATE LEAD (from lead form)
// exports.createLead = async (req, res) => {
//     try {
//         const isHuman = await verifyTurnstile(req.body.turnstileToken);
//         if (!isHuman) {
//             return res.status(400).json({ message: "Security check failed. Please try again." });
//         }

//         const email = req.body.email?.toLowerCase().trim();
//         const { first_name, last_name, program_id, opportunity_value: _, ...rest } = req.body;

//         if (!email || !first_name || !program_id) {
//             return res.status(400).json({
//                 message: "Email, first name and program are required",
//             });
//         }

//         // ── Auto opportunity_value from program price ──────────
//         let opportunity_value = 0;
//         if (program_id) {
//             const program = await Program.findById(program_id).select("price");
//             if (program?.price) opportunity_value = program.price;
//         }

//         // ── Base lead data ─────────────────────────────────────
//         const leadData = {
//             first_name,
//             last_name,
//             program_id,
//             ...rest,
//             email,
//             opportunity_value,
//             created_by: req.user?.id || null,
//         };

//         const assignedManager = await assignLeadManager();

//         // ── Step 1: Existing user check ────────────────────────
//         const existingUser = await User.findOne({ email });

//         if (existingUser) {
//             // Same program check
//             const existingLead = await Lead.findOne({ email, program_id });

//             if (existingLead) {
//                 return res.status(200).json({
//                     success: true,
//                     duplicate: true,
//                     message: "Thank you for your interest! We already have your application and will contact you soon. 😊",
//                 });
//             }

//             // ✅ Existing user, new program → sirf lead banao, user mat banao
//             const lead = await Lead.create({
//                 ...leadData,
//                 user_id: existingUser._id,
//                 assigned_to: assignedManager,
//             });

//             return res.status(201).json({
//                 success: true,
//                 duplicate: false,
//                 message: "Thank you for applying! We'll be in touch soon. 😊",
//                 data: lead,
//             });
//         }

//         // ── Step 2: Naya user banao ────────────────────────────
//         const plainPassword = Math.random().toString(36).slice(-8);
//         const hashedPassword = await bcrypt.hash(plainPassword, 10);

//         const newUser = await User.create({
//             name: `${first_name} ${last_name || ""}`.trim(),
//             email,
//             phone: rest.phone || null,
//             password: hashedPassword,
//             role: "user",
//             isVerified: true,
//             isActive: true,
//             avatarColor: generateColor(email),
//             isTemporaryPassword: true,
//         });

//         // ── Step 3: Lead banao ─────────────────────────────────
//         const lead = await Lead.create({
//             ...leadData,
//             user_id: newUser._id,
//             assigned_to: assignedManager,
//         });

//         // ── Step 4: Credentials email bhejo ───────────────────
//         await sendEmailDynamic({
//             to: email,
//             subject: "Your Account Credentials 🔑",
//             templateName: "send-user-credentials",
//             replacements: {
//                 UserName: `${first_name} ${last_name || ""}`,
//                 UserEmail: email,
//                 UserPassword: plainPassword,
//                 SupportEmail: "alco@support.com",
//                 YourCompanyName: "Al-and-co",
//                 LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
//             },
//         });

//         return res.status(201).json({
//             success: true,
//             duplicate: false,
//             message: "Thank you for applying! Check your email for login details. 😊",
//             data: lead,
//         });

//     } catch (error) {
//         if (error.code === 11000) {
//             return res.status(200).json({
//                 success: true,
//                 duplicate: true,
//                 message: "Thank you! We already have your details. 😊",
//             });
//         }
//         res.status(500).json({ message: error.message });
//     }
// };
exports.createLead = async (req, res) => {
    try {
        console.log("========== CREATE LEAD ==========");
        console.log("Incoming body:", JSON.stringify(req.body, null, 2));

        const isHuman = await verifyTurnstile(req.body.turnstileToken);
        console.log("Turnstile verified:", isHuman);

        if (!isHuman) {
            console.log("❌ Turnstile failed — aborting");
            return res.status(400).json({ message: "Security check failed. Please try again." });
        }

        const email = req.body.email?.toLowerCase().trim();
        const { first_name, last_name, program_id, opportunity_value: _, fbc, fbp, ...rest } = req.body;

        console.log("Attribution:", { fbc, fbp });

        console.log("Parsed:", { email, first_name, last_name, program_id });

        if (!email || !first_name || !program_id) {
            console.log("❌ Missing required fields");
            return res.status(400).json({
                message: "Email, first name and program are required",
            });
        }

        // ── Auto opportunity_value from program price ──────────
        let opportunity_value = 0;
        if (program_id) {
            const program = await Program.findById(program_id).select("price");
            console.log("Program fetched:", program ? { _id: program._id, price: program.price } : null);
            if (program?.price) opportunity_value = program.price;
        }
        console.log("opportunity_value set to:", opportunity_value);

        // ── Base lead data ─────────────────────────────────────
        const leadData = {
            first_name,
            last_name,
            program_id,
            ...rest,
            email,
            opportunity_value,
            fbc: fbc || null,   // ✅ explicit
            fbp: fbp || null,   // ✅ explicit
            created_by: req.user?.id || null,
        };
        console.log("leadData built:", JSON.stringify(leadData, null, 2));

        const assignedManager = await assignLeadManager();
        console.log("Assigned manager:", assignedManager);

        // ── Step 1: Existing user check ────────────────────────
        const existingUser = await User.findOne({ email });
        console.log("Existing user found:", existingUser ? { _id: existingUser._id, email: existingUser.email } : null);

        if (existingUser) {
            // Same program check
            const existingLead = await Lead.findOne({ email, program_id });
            console.log("Existing lead (same email+program) found:", existingLead ? existingLead._id : null);

            if (existingLead) {
                console.log("⚠️ Duplicate lead — no DB write, returning early");
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: "Thank you for your interest! We already have your application and will contact you soon. 😊",
                });
            }

            // ✅ Existing user, new program → sirf lead banao, user mat banao
            console.log("Creating Lead for EXISTING user with data:", JSON.stringify({
                ...leadData,
                user_id: existingUser._id,
                assigned_to: assignedManager,
            }, null, 2));

            const lead = await Lead.create({
                ...leadData,
                user_id: existingUser._id,
                assigned_to: assignedManager,
            });

            console.log("✅ Lead created (DB committed):", lead._id);

            return res.status(201).json({
                success: true,
                duplicate: false,
                message: "Thank you for applying! We'll be in touch soon. 😊",
                data: lead,
            });
        }

        // ── Step 2: Naya user banao ────────────────────────────
        const plainPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        console.log("Generated temp password (plain, for testing only):", plainPassword);

        console.log("Creating User with data:", JSON.stringify({
            name: `${first_name} ${last_name || ""}`.trim(),
            email,
            phone: rest.phone || null,
            role: "user",
        }, null, 2));

        const newUser = await User.create({
            name: `${first_name} ${last_name || ""}`.trim(),
            email,
            phone: rest.phone || null,
            password: hashedPassword,
            role: "user",
            isVerified: true,
            isActive: true,
            avatarColor: generateColor(email),
            isTemporaryPassword: true,
        });

        console.log("✅ User created (DB committed):", newUser._id);

        // ── Step 3: Lead banao ─────────────────────────────────
        console.log("Creating Lead for NEW user with data:", JSON.stringify({
            ...leadData,
            user_id: newUser._id,
            assigned_to: assignedManager,
        }, null, 2));

        const lead = await Lead.create({
            ...leadData,
            user_id: newUser._id,
            assigned_to: assignedManager,
        });

        console.log("✅ Lead created (DB committed):", lead._id);

        // ── Step 4: Credentials email bhejo ───────────────────
        console.log("Sending credentials email to:", email);

        await sendEmailDynamic({
            to: email,
            subject: "Your Account Credentials 🔑",
            templateName: "send-user-credentials",
            replacements: {
                UserName: `${first_name} ${last_name || ""}`,
                UserEmail: email,
                UserPassword: plainPassword,
                SupportEmail: "alco@support.com",
                YourCompanyName: "Al-and-co",
                LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
            },
        });

        console.log("✅ Credentials email sent");
        console.log("========== END CREATE LEAD ==========");

        return res.status(201).json({
            success: true,
            duplicate: false,
            message: "Thank you for applying! Check your email for login details. 😊",
            data: lead,
        });

    } catch (error) {
        console.log("❌ ERROR in createLead:", error.message);
        console.log(error.stack);

        if (error.code === 11000) {
            console.log("⚠️ Duplicate key error (E11000) — likely email already exists");
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Thank you! We already have your details. 😊",
            });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.createProgramLead = async (req, res) => {
    try {
        const isHuman = await verifyTurnstile(req.body.turnstileToken);
        if (!isHuman) {
            return res.status(400).json({ message: "Security check failed. Please try again." });
        }

        const email = req.body.email?.toLowerCase().trim();
        const { name, phone, programId } = req.body;

        if (!email || !name || !programId) {
            return res.status(400).json({
                message: "Name, email and program are required",
            });
        }

        const nameParts = name.trim().split(" ");
        const first_name = nameParts[0];
        const last_name = nameParts.slice(1).join(" ") || "";

        // ── Auto opportunity_value from program price ──────────
        let opportunity_value = 0;
        const program = await Program.findById(programId).select("price");
        if (program?.price) opportunity_value = program.price;

        const leadData = {
            first_name,
            last_name,
            program_id: programId,
            phone: phone || null,
            email,
            opportunity_value,
            source: "resource",
            created_by: req.user?.id || null,
        };

        const assignedManager = await assignLeadManager();

        // ── Step 1: Existing user check ────────────────────────
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            const existingLead = await Lead.findOne({ email, program_id: programId });

            if (existingLead) {
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: "Thank you for your interest! We already have your application and will contact you soon. 😊",
                });
            }

            const lead = await Lead.create({
                ...leadData,
                user_id: existingUser._id,
                assigned_to: assignedManager,
            });

            return res.status(201).json({
                success: true,
                duplicate: false,
                message: "Thank you for applying! We'll be in touch soon. 😊",
                data: lead,
            });
        }

        // ── Step 2: Naya user banao ────────────────────────────
        const plainPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newUser = await User.create({
            name: `${first_name} ${last_name}`.trim(),
            email,
            phone: phone || null,
            password: hashedPassword,
            role: "user",
            isVerified: true,
            isActive: true,
            avatarColor: generateColor(email),
            isTemporaryPassword: true,
            source: "resource",
        });

        // ── Step 3: Lead banao ─────────────────────────────────
        const lead = await Lead.create({
            ...leadData,
            user_id: newUser._id,
            assigned_to: assignedManager,
        });

        // ── Step 4: Credentials email bhejo ───────────────────
        await sendEmailDynamic({
            to: email,
            subject: "Your Account Credentials 🔑",
            templateName: "send-user-credentials",
            replacements: {
                UserName: `${first_name} ${last_name}`,
                UserEmail: email,
                UserPassword: plainPassword,
                SupportEmail: "alco@support.com",
                YourCompanyName: "Al-and-co",
                LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
            },
        });

        return res.status(201).json({
            success: true,
            duplicate: false,
            message: "Thank you for applying! Check your email for login details. 😊",
            data: lead,
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Thank you! We already have your details. 😊",
            });
        }
        res.status(500).json({ message: error.message });
    }
};


// ─── createLeadContact (contact form se) ─────────────────────
// exports.createLeadContact = async (req, res) => {
//     try {
//         const { first_name, last_name, email, phone, query } = req.body;

//         if (!first_name || !email) {
//             return res.status(400).json({
//                 success: false,
//                 message: "First name and email are required",
//             });
//         }

//         const cleanEmail = email.toLowerCase().trim();

//         const existingLead = await Lead.findOne({ email: cleanEmail });
//         const existingUser = await User.findOne({ email: cleanEmail });
//         const assignedManager = await assignLeadManager();

//         const plainPassword = Math.random().toString(36).slice(-8);
//         const hashedPass = await bcrypt.hash(plainPassword, 10);

//         // ── User create ya existing use karo ───────────────────
//         let userId;
//         if (existingUser) {
//             userId = existingUser._id; // ← existing user ka id
//         } else {
//             const newUser = await User.create({
//                 name: `${first_name} ${last_name || ""}`.trim(),
//                 email: cleanEmail,
//                 phone: phone || null,
//                 password: hashedPass,
//                 role: "user",
//                 isVerified: true,
//                 isActive: true,
//                 avatarColor: generateColor(cleanEmail),
//                 isTemporaryPassword: true,
//             });
//             userId = newUser._id; // ← naya user ka id

//             // Sirf naye user ko credentials bhejo
//             await sendEmailDynamic({
//                 to: email,
//                 subject: "Your Account Credentials 🔑",
//                 templateName: "send-user-credentials",
//                 replacements: {
//                     UserName: `${first_name} ${last_name || ""}`,
//                     UserEmail: email,
//                     UserPassword: plainPassword,
//                     SupportEmail: "alco@support.com",
//                     YourCompanyName: "Al-and-co",
//                     LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
//                 },
//             });
//         }

//         // ── Duplicate lead check ────────────────────────────────
//         if (existingLead) {
//             return res.status(200).json({
//                 success: true,
//                 duplicate: true,
//                 message: "Thank you! We already have your details 😊",
//             });
//         }


//         // ── Naya lead banao + user_id lagao ────────────────────
//         const lead = await Lead.create({
//             first_name: first_name.trim(),
//             last_name: (last_name || "").trim(),
//             email: cleanEmail,
//             phone: phone || null,
//             query: query || null,
//             source: "contact",
//             status: "new",
//             quality: "cold",
//             user_id: userId, // ← ab sahi se set ho raha hai
//             assigned_to: assignedManager,
//         });

//         return res.status(201).json({
//             success: true,
//             duplicate: false,
//             message: "Thank you! We will contact you soon 😊",
//             data: { lead_id: lead._id },
//         });

//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// GET LEADS 
exports.createLeadContact = async (req, res) => {
    try {
        const isHuman = await verifyTurnstile(req.body.turnstileToken);
        if (!isHuman) {
            return res.status(400).json({ message: "Security check failed. Please try again." });
        }

        const { first_name, last_name, email, phone, fbc, fbp, query } = req.body;

        console.log("Attribution:", { fbc, fbp });

        if (!first_name || !email) {
            return res.status(400).json({
                success: false,
                message: "First name and email are required",
            });
        }

        const cleanEmail = email.toLowerCase().trim();

        // ── PEHLE duplicate lead check ─────────────────────────
        const existingLead = await Lead.findOne({ email: cleanEmail });

        if (existingLead) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Thank you! We already have your details 😊",
            });
        }

        // ── Ab user check + create ─────────────────────────────
        const existingUser = await User.findOne({ email: cleanEmail });
        const assignedManager = await assignLeadManager();

        let userId;
        if (existingUser) {
            userId = existingUser._id;
        } else {
            const plainPassword = Math.random().toString(36).slice(-8);
            const hashedPass = await bcrypt.hash(plainPassword, 10);

            const newUser = await User.create({
                name: `${first_name} ${last_name || ""}`.trim(),
                email: cleanEmail,
                phone: phone || null,
                password: hashedPass,
                role: "user",
                isVerified: true,
                isActive: true,
                avatarColor: generateColor(cleanEmail),
                isTemporaryPassword: true,
            });
            userId = newUser._id;

            await sendEmailDynamic({
                to: email,
                subject: "Your Account Credentials 🔑",
                templateName: "send-user-credentials",
                replacements: {
                    UserName: `${first_name} ${last_name || ""}`,
                    UserEmail: email,
                    UserPassword: plainPassword,
                    SupportEmail: "alco@support.com",
                    YourCompanyName: "Al-and-co",
                    LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
                },
            });
        }

        // ── Lead banao ─────────────────────────────────────────
        const lead = await Lead.create({
            first_name: first_name.trim(),
            last_name: (last_name || "").trim(),
            email: cleanEmail,
            phone: phone || null,
            query: query || null,
            source: "contact",
            status: "new",
            quality: "cold",
            user_id: userId,
            fbc: fbc || null,
            fbp: fbp || null,
            assigned_to: assignedManager,
        });

        return res.status(201).json({
            success: true,
            duplicate: false,
            message: "Thank you! We will contact you soon 😊",
            data: { lead_id: lead._id },
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createLeadAdmin = async (req, res) => {
    try {

        const email = req.body.email?.toLowerCase().trim();
        const { first_name, last_name, program_id, opportunity_value: _, ...rest } = req.body;

        if (!email || !first_name || !program_id) {
            return res.status(400).json({
                message: "Email, first name and program are required",
            });
        }

        // ── Auto opportunity_value from program price ──────────
        let opportunity_value = 0;
        if (program_id) {
            const program = await Program.findById(program_id).select("price");
            if (program?.price) opportunity_value = program.price;
        }

        // ── Base lead data ─────────────────────────────────────
        const leadData = {
            first_name,
            last_name,
            program_id,
            ...rest,
            email,
            opportunity_value,
            created_by: req.user?.id || null,
        };

        // const assignedManager = await assignLeadManager();

        // ── Step 1: Existing user check ────────────────────────
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            // Same program check
            const existingLead = await Lead.findOne({ email, program_id });

            if (existingLead) {
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: "Thank you for your interest! We already have your application and will contact you soon. 😊",
                });
            }

            // ✅ Existing user, new program → sirf lead banao, user mat banao
            const lead = await Lead.create({
                ...leadData,
                user_id: existingUser._id,
                // assigned_to: assignedManager,
            });

            return res.status(201).json({
                success: true,
                duplicate: false,
                message: "Thank you for applying! We'll be in touch soon. 😊",
                data: lead,
            });
        }

        // ── Step 2: Naya user banao ────────────────────────────
        const plainPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newUser = await User.create({
            name: `${first_name} ${last_name || ""}`.trim(),
            email,
            phone: rest.phone || null,
            password: hashedPassword,
            role: "user",
            isVerified: true,
            isActive: true,
            avatarColor: generateColor(email),
            isTemporaryPassword: true,
        });

        // ── Step 3: Lead banao ─────────────────────────────────
        const lead = await Lead.create({
            ...leadData,
            user_id: newUser._id,
            // assigned_to: assignedManager,
        });

        // ── Step 4: Credentials email bhejo ───────────────────
        await sendEmailDynamic({
            to: email,
            subject: "Your Account Credentials 🔑",
            templateName: "send-user-credentials",
            replacements: {
                UserName: `${first_name} ${last_name || ""}`,
                UserEmail: email,
                UserPassword: plainPassword,
                SupportEmail: "alco@support.com",
                YourCompanyName: "Al-and-co",
                LoginLink: `https://app.arslanlarik.com/auth?email=${email}&password=${plainPassword}`,
            },
        });

        return res.status(201).json({
            success: true,
            duplicate: false,
            message: "Thank you for applying! Check your email for login details. 😊",
            data: lead,
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                success: true,
                duplicate: true,
                message: "Thank you! We already have your details. 😊",
            });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status: newStatus } = req.body;

        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        const oldStatus = lead.status;

        lead.status = newStatus;   // ✅ ab sahi value use ho rahi hai
        await lead.save();

        // ✅ Schedule — sirf "call_booked" mein pehli baar enter karne pe
        if (oldStatus !== "call_booked" && newStatus === "call_booked") {
            await sendServerSideStageEvent({ lead, eventName: "Schedule" });
        }

        return res.status(200).json({ success: true, data: lead });
    } catch (error) {
        console.error("updateLeadStatus error:", error);
        return res.status(500).json({ message: error.message });
    }
};

exports.getLeads = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            source,
            search,
            assigned_to,
            quality,
            hasPaymentPlan,
            hasInvoiceNumber,
            dateFilter,   // ✅ "today" | "this_week" | "this_month" | "custom"
            dateFrom,     // ✅ custom ke liye
            dateTo,       // ✅ custom ke liye
        } = req.query;

        const query = {};

        if (status) query.status = status;
        if (source) query.source = source;
        if (assigned_to) query.assigned_to = assigned_to;
        if (quality) query.quality = quality;

        // ── ✅ DATE FILTER (presets + custom range) ──────────────
        if (dateFilter && dateFilter !== "") {
            let start, end;
            const now = new Date();

            if (dateFilter === "today") {
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            } else if (dateFilter === "this_week") {
                const day = now.getDay();
                const diffToMonday = day === 0 ? -6 : 1 - day;
                start = new Date(now);
                start.setDate(now.getDate() + diffToMonday);
                start.setHours(0, 0, 0, 0);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
            } else if (dateFilter === "this_month") {
                start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            } else if (dateFilter === "last_3_months") {                     // ✅ naya
                start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            } else if (dateFilter === "last_6_months") {                     // ✅ naya
                start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate(), 0, 0, 0, 0);
                end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            } else if (dateFilter === "custom") {
                if (dateFrom) {
                    start = new Date(dateFrom);
                    start.setHours(0, 0, 0, 0);
                }
                if (dateTo) {
                    end = new Date(dateTo);
                    end.setHours(23, 59, 59, 999);
                }
            }

            if (start || end) {
                query.createdAt = {};
                if (start) query.createdAt.$gte = start;
                if (end) query.createdAt.$lte = end;
            }
        }

        if (hasPaymentPlan === "true") {
            query["paymentPlan.totalAmount"] = { $exists: true, $gt: 0 };
        }

        if (hasInvoiceNumber === "true") {
            query["paymentPlan.invoiceNumber"] = { $exists: true, $ne: null, $ne: "" };
        }

        // if (search) {
        //     query.$or = [
        //         { first_name: { $regex: search, $options: "i" } },
        //         { last_name: { $regex: search, $options: "i" } },
        //         { email: { $regex: search, $options: "i" } },
        //     ];
        // }

        if (search) {
            const searchRegex = new RegExp(search, "i");

            // assigned_to name se matching users dhundo
            const matchingUsers = await User.find({ name: searchRegex }).select("_id");
            const matchingUserIds = matchingUsers.map((u) => u._id);

            query.$or = [
                { first_name: searchRegex },
                { last_name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { assigned_to: { $in: matchingUserIds } },
                {
                    $expr: {
                        $regexMatch: {
                            input: { $concat: ["$first_name", " ", { $ifNull: ["$last_name", ""] }] },
                            regex: search,
                            options: "i",
                        },
                    },
                },
            ];
        }

        const leads = await Lead.find(query)
            .populate("assigned_to", "name email")
            .populate("program_id", "name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Lead.countDocuments(query);

        res.status(200).json({
            success: true,
            data: leads,
            meta: { page: Number(page), limit: Number(limit), total },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET SINGLE LEAD
exports.getLeadById = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id).populate(
            "assigned_to",
            "name email"
        ).populate("program_id", "name price");

        if (!lead) {
            return res.status(404).json({ message: "Lead not found" });
        }

        res.status(200).json({
            success: true,
            data: lead,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// UPDATE LEAD
exports.updateLead = async (req, res) => {
    try {
        const { id } = req.params;

        const payload = { ...req.body };

        const oldLead = await Lead.findById(id);
        if (!oldLead) {
            return res.status(404).json({ message: "Lead not found" });
        }

        if (payload.batch_id === "") payload.batch_id = null;
        if (payload.program_id === "") payload.program_id = null;
        if (payload.assigned_to === "") payload.assigned_to = null;

        // 🔥 PROGRAM CHANGE LOGIC
        if (
            payload.program_id &&
            payload.program_id !== oldLead.program_id?.toString()
        ) {
            const program = await Program.findById(payload.program_id);

            if (program) {
                payload.opportunity_value = program.price || 0;
            }
        }

        const updated = await Lead.findByIdAndUpdate(
            id,
            payload,
            { new: true, runValidators: true }
        );

        console.log("OLD LEAD:", oldLead);
        console.log("UPDATED LEAD:", updated);

        // ✅ Status change check
        if (
            req.body.status &&
            oldLead.status !== req.body.status &&
            updated.user_id
        ) {
            // 1. In-app notification
            await notifyStatusChanged({
                userId: updated.user_id.toString(),
                leadName: `${updated.first_name} ${updated.last_name}`,
                leadId: updated._id.toString(),
                newStatus: req.body.status,
                changedBy: req.user?._id?.toString(),
            });

            // 2. Email — user ka email fetch karo
            const user = await User.findById(updated.user_id).select("email name");
            if (user?.email) {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "Your Request Has Been Updated 🔄",
                    templateName: "lead-status-update",
                    replacements: {
                        UserName: user.name || updated.first_name,
                        NewStatus: req.body.status,
                        LeadName: `${updated.first_name} ${updated.last_name}`,
                        SupportEmail: "alco@support.com",
                        YourCompanyName: "Al-and-co",
                    },
                });
            }
        }

        res.json({ success: true, data: updated });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE LEAD
exports.deleteLead = async (req, res) => {
    try {
        await Lead.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: "Lead deleted",
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ASSIGN LEAD TO 
exports.assignLead = async (req, res) => {
    try {
        const { assigned_to } = req.body;

        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { assigned_to },
            { new: true }
        );

        if (!lead) {
            return res.status(404).json({ message: "Lead not found" });
        }

        // ✅ 1. assigned_to (manager/rep) ko CRM notification
        if (assigned_to) {
            await notifyLeadAssigned({
                userId: assigned_to.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                assignedBy: req.user?._id?.toString(),
            });
        }

        // ✅ 2. user_id (original user) ko request wali notification
        if (lead.user_id) {
            await createNotification({
                user_id: lead.user_id.toString(),
                type: "lead_assigned",
                title: "Your Request is Being Processed",
                message: `We have received your request and our team will contact you soon.`,
                lead_id: lead._id.toString(),
                triggered_by: req.user?._id?.toString(),
            });
        }

        res.status(200).json({ success: true, data: lead });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// CONVERT LEAD STATUS
// exports.convertLead = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id).populate("assigned_to", "name email");
//         if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

//         if (!lead.paymentPlan) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Please set a payment plan before converting.",
//             });
//         }

//         // ── ✅ FIX: batch_id aur program_id req.body se set karo ──
//         // Frontend batch modal se batch_id bhejta hai
//         if (req.body.batch_id) {
//             lead.batch_id = req.body.batch_id;
//         }
//         if (req.body.program_id) {
//             lead.program_id = req.body.program_id;
//         }

//         // ── Step 1: Program fetch ─────────────────────────────────
//         const program = await Program.findById(lead.program_id).select("name");

//         // ── Step 2: Lead convert + save (batch_id bhi save hoga) ──
//         lead.status = "converted";
//         await lead.save(); // ← ab batch_id null nahi rahega

//         console.log("Lead saved with batch_id:", lead.batch_id); // debug

//         // ── Step 3: User banao ────────────────────────────────────
//         const crypto = require("crypto");
//         const tempPassword = crypto.randomBytes(8).toString("hex");
//         let user = await User.findOne({ email: lead.email });
//         let isNewUser = false;

//         if (!user) {
//             isNewUser = true;
//             user = await User.create({
//                 name: `${lead.first_name} ${lead.last_name}`,
//                 email: lead.email,
//                 phone: lead.phone,
//                 cnic: lead.contractDetails?.cnic || "",
//                 address: lead.contractDetails?.currentAddress || "",
//                 role: "user",
//                 password: tempPassword,
//             });
//         }

//         // ── ✅ Step 3.5: lead.user_id update karo ─────────────────
//         // markInstallmentPaid mein lead dhundne ke liye zaroor hai
//         lead.user_id = user._id;
//         await lead.save();

//         // ── Step 4: Enrollment banao ──────────────────────────────
//         const enrollment = await Enrollment.create({
//             user: user._id,
//             program: lead.program_id,
//             batch: lead.batch_id,   // ← ab sahi value aayegi
//             status: "active",
//             accessStatus: "RESTRICTED",
//         });

//         // ── Step 5: Invoice Number ────────────────────────────────
//         const count = await Invoice.countDocuments();
//         const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

//         // ── Step 6: Invoice banao ─────────────────────────────────
//         const { totalAmount, advanceAmount, advanceDueDate, installments } = lead.paymentPlan;

//         const allInstallments = [
//             {
//                 label: "Advance Payment",
//                 amount: advanceAmount,
//                 dueDate: advanceDueDate,
//                 status: "PENDING",
//                 paidAmount: 0,
//                 isAdvance: true,
//             },
//             ...(installments || []).map((inst) => ({
//                 label: inst.label || "Installment",
//                 amount: inst.amount,
//                 dueDate: inst.dueDate,
//                 status: "PENDING",
//                 paidAmount: 0,
//                 isAdvance: false,
//             })),
//         ];

//         const invoice = await Invoice.create({
//             invoiceNumber,
//             user: user._id,
//             enrollment: enrollment._id,
//             totalAmount,
//             remainingAmount: totalAmount,
//             paidAmount: 0,
//             dueDate: advanceDueDate,
//             installments: allInstallments,
//             notes: lead.paymentPlan.notes || "",
//             status: "PENDING",
//         });

//         // ── Step 7: Enrollment pe invoice link ───────────────────
//         await Enrollment.findByIdAndUpdate(enrollment._id, {
//             invoice: invoice._id,
//         });

//         // ── Step 8: Email helpers ─────────────────────────────────
//         const formatDate = (d) =>
//             d ? new Date(d).toLocaleDateString("en-PK", {
//                 day: "2-digit", month: "short", year: "numeric",
//             }) : "—";

//         const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

//         // ── Step 9: Installment rows HTML ─────────────────────────
//         const installmentRows = invoice.installments.map((inst, i) => {
//             const isAdv = inst.isAdvance;
//             const isPaid = inst.status === "PAID";
//             return `
//       <tr style="background:${isAdv ? "#fdf6e3" : "#ffffff"}; border-bottom:1px solid #dde2ec;">
//         <td style="padding:13px 16px; font-family:'Courier New',monospace; font-size:11px; font-weight:600; color:#8a92a6; width:40px;">
//           ${String(i + 1).padStart(2, "0")}
//         </td>
//         <td style="padding:13px 16px; font-size:13px; color:#0f1117;">
//           <span style="font-weight:700;">${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}</span>
//           ${isAdv ? `<span style="display:inline-block; background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>` : ""}
//         </td>
//         <td style="padding:13px 16px; font-family:'Courier New',monospace; font-size:11.5px; color:#4a5060;">
//           ${formatDate(inst.dueDate)}
//         </td>
//         <td style="padding:13px 16px;">
//           <span style="display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:3px 9px; border-radius:5px;
//             background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
//             ${inst.status}
//           </span>
//         </td>
//         <td style="padding:13px 16px; text-align:right; font-family:'Courier New',monospace; font-weight:600; font-size:13px; color:#0f1117;">
//           Rs ${formatAmount(inst.amount)}
//         </td>
//       </tr>`;
//         }).join("");

//         // ── Step 10: Invoice Email ────────────────────────────────
//         try {
//             await sendEmailDynamic({
//                 to: user.email,
//                 subject: `Your Enrollment Invoice ${invoice.invoiceNumber} | ALCO`,
//                 templateName: "generate-invoice",
//                 replacements: {
//                     invoiceNumber: invoice.invoiceNumber,
//                     invoiceStatus: invoice.status,
//                     issueDate: formatDate(new Date()),
//                     advanceDueDate: formatDate(invoice.dueDate),
//                     enrollmentId: enrollment._id.toString().slice(0, 8) + "..." + enrollment._id.toString().slice(-4),
//                     studentName: user.name,
//                     studentEmail: user.email,
//                     studentPhone: user.phone || "—",
//                     studentProfession: lead.profession || "—",
//                     salesManagerName: lead.assigned_to?.name || "Sales Team",
//                     salesManagerEmail: lead.assigned_to?.email || "sales@alco.com",
//                     programName: program?.name || "NLP Program",
//                     planNotes: lead.paymentPlan.notes || "",
//                     installmentRows,
//                     totalAmount: formatAmount(invoice.totalAmount),
//                     paidAmount: formatAmount(invoice.paidAmount || 0),
//                     remainingAmount: formatAmount(invoice.remainingAmount || invoice.totalAmount),
//                     advanceAmount: formatAmount(invoice.installments.find((i) => i.isAdvance)?.amount || 0),
//                 },
//             });
//         } catch (emailErr) {
//             console.error("Invoice email failed:", emailErr.message);
//         }

//         // ── Step 11: Credentials Email (new user only) ────────────
//         if (isNewUser) {
//             try {
//                 await sendEmailDynamic({
//                     to: user.email,
//                     subject: "Your Login Credentials | ALCO",
//                     templateName: "send-user-credentials",
//                     replacements: {
//                         userName: user.name,
//                         userEmail: user.email,
//                         password: tempPassword,
//                     },
//                 });
//             } catch (credErr) {
//                 console.error("Credentials email failed:", credErr.message);
//             }
//         }

//         // ── Step 12: Audit Log ────────────────────────────────────
//         await logAudit({
//             req,
//             action: "LEAD_CONVERTED",
//             module: "leads",
//             targetId: lead._id,
//             after: {
//                 enrollment: enrollment._id,
//                 invoice: invoice._id,
//                 user: user._id,
//                 batch_id: lead.batch_id,   // ← audit mein bhi track karo
//             },
//         });

//         res.status(201).json({
//             success: true,
//             message: "Lead converted — invoice and credentials emailed",
//             data: {
//                 user: { _id: user._id, name: user.name, email: user.email, isNewUser },
//                 enrollment: {
//                     _id: enrollment._id,
//                     accessStatus: "RESTRICTED",
//                     batch: lead.batch_id,   // ← response mein bhi dikh jaye
//                 },
//                 invoice: {
//                     _id: invoice._id,
//                     invoiceNumber,
//                     totalAmount,
//                     status: "PENDING",
//                 },
//                 lead: {
//                     _id: lead._id,
//                     batch_id: lead.batch_id,     // ← confirm ke liye
//                     user_id: lead.user_id,
//                 },
//             },
//         });
//     } catch (err) {
//         console.error("convertLead error:", err.message);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
// exports.convertLead = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id).populate("assigned_to", "name email");
//         if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

//         if (!lead.paymentPlan) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Please set a payment plan before converting.",
//             });
//         }

//         // ── batch_id aur program_id req.body se set karo ──────────
//         if (req.body.batch_id) lead.batch_id = req.body.batch_id;
//         if (req.body.program_id) lead.program_id = req.body.program_id;

//         // ── Step 1: Program + Batch fetch ─────────────────────────
//         const program = await Program.findById(lead.program_id).select("name");
//         const batchDoc = lead.batch_id
//             ? await Batch.findById(lead.batch_id).select("name start_date end_date")
//             : null;

//         // ── Step 1.5: Already enrolled? (check BEFORE mutating lead) ──
//         const existingUser = await User.findOne({ email: lead.email });
//         if (existingUser) {
//             const existingEnrollment = await Enrollment.findOne({
//                 user: existingUser._id,
//                 program: lead.program_id,
//             });

//             if (existingEnrollment) {
//                 return res.status(409).json({
//                     success: false,
//                     message: "User is already enrolled in this program.",
//                     data: { enrollmentId: existingEnrollment._id },
//                 });
//             }
//         }

//         // ── Step 2: Lead convert + save ───────────────────────────
//         lead.status = "converted";
//         await lead.save();

//         // ── Step 3: User banao ────────────────────────────────────
//         const crypto = require("crypto");
//         const tempPassword = crypto.randomBytes(8).toString("hex");
//         let user = existingUser;
//         let isNewUser = false;

//         if (!user) {
//             isNewUser = true;
//             user = await User.create({
//                 name: `${lead.first_name} ${lead.last_name}`,
//                 email: lead.email,
//                 phone: lead.phone,
//                 cnic: lead.contractDetails?.cnic || "",
//                 address: lead.contractDetails?.currentAddress || "",
//                 role: "user",
//                 password: tempPassword,
//             });
//         }

//         // ── Step 3.5: lead.user_id update karo ───────────────────
//         lead.user_id = user._id;
//         await lead.save();

//         const existingEnrollment = await Enrollment.findOne({
//             user: user._id,
//             program: lead.program_id,
//         });

//         if (existingEnrollment) {
//             return res.status(409).json({
//                 success: false,
//                 message: "User is already enrolled in this program.",
//                 data: { enrollmentId: existingEnrollment._id },
//             });
//         }

//         // ── Step 4: Enrollment banao ──────────────────────────────
//         const enrollment = await Enrollment.create({
//             user: user._id,
//             program: lead.program_id,
//             batch: lead.batch_id,
//             status: "active",
//             accessStatus: "RESTRICTED",
//             assigned_to: lead.assigned_to,
//         });

//         // ── Step 5: Invoice Number ────────────────────────────────
//         // const count = await Invoice.countDocuments();
//         // const paymentPlanIssueDate = lead.paymentPlan.issueDate ? new Date(lead.paymentPlan.issueDate) : new Date();
//         // // const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
//         // let invoiceNumber = lead.paymentPlan.invoiceNumber;
//         // if (!invoiceNumber) {
//         //     const count = await Invoice.countDocuments();
//         //     invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
//         // }
//         // ── Step 5: Invoice Number ────────────────────────────────
//         const paymentPlanIssueDate = lead.paymentPlan.issueDate ? new Date(lead.paymentPlan.issueDate) : new Date();

//         let invoiceNumber = lead.paymentPlan.invoiceNumber;
//         if (invoiceNumber) {
//             // 👇 NAYA — duplicate check
//             const exists = await Invoice.findOne({ invoiceNumber });
//             if (exists) {
//                 return res.status(400).json({
//                     success: false,
//                     message: `Invoice number ${invoiceNumber} already exists`,
//                 });
//             }
//         } else {
//             const count = await Invoice.countDocuments();
//             invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
//         }

//         // ── Step 6: Invoice banao ─────────────────────────────────
//         const { totalAmount, advanceAmount, advanceDueDate, installments } = lead.paymentPlan;

//         const allInstallments = [
//             {
//                 label: "Advance Payment",
//                 amount: advanceAmount,
//                 dueDate: advanceDueDate,
//                 status: "PENDING",
//                 paidAmount: 0,
//                 isAdvance: true,
//             },
//             ...(installments || []).map((inst) => ({
//                 label: inst.label || "Installment",
//                 amount: inst.amount,
//                 dueDate: inst.dueDate,
//                 status: "PENDING",
//                 paidAmount: 0,
//                 isAdvance: false,
//             })),
//         ];

//         const invoice = await Invoice.create({
//             invoiceNumber,
//             user: user._id,
//             enrollment: enrollment._id,
//             totalAmount,
//             remainingAmount: totalAmount,
//             paidAmount: 0,
//             dueDate: advanceDueDate,
//             issueDate: paymentPlanIssueDate,
//             installments: allInstallments,
//             notes: lead.paymentPlan.notes || "",
//             status: "PENDING",
//         });

//         // ✅ ADD THIS
//         try {
//             await postInvoiceJournal({
//                 amount: totalAmount,
//                 invoiceId: invoice._id,
//                 userId: req.user._id,
//                 description: `Invoice ${invoiceNumber} — Lead converted`,
//                 date: paymentPlanIssueDate,
//             });
//         } catch (journalErr) {
//             console.error("postInvoiceJournal failed:", journalErr.message);
//         }

//         lead.invoiceNumber = invoiceNumber;
//         await lead.save();

//         // ── Step 7: Enrollment pe invoice link ───────────────────
//         await Enrollment.findByIdAndUpdate(enrollment._id, { invoice: invoice._id });

//         // ── Step 8: Email helpers ─────────────────────────────────
//         const formatDate = (d) =>
//             d ? new Date(d).toLocaleDateString("en-PK", {
//                 day: "2-digit", month: "short", year: "numeric",
//             }) : "—";

//         const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

//         // ── Step 9: Installment rows HTML (qty column added) ──────
//         const installmentRows = invoice.installments.map((inst, i) => {
//             const isAdv = inst.isAdvance;
//             const isPaid = inst.status === "PAID";
//             return `
//       <tr style="background:${isAdv ? "#fdf6e3" : "#ffffff"}; border-bottom:1px solid #dde2ec;">
//         <td style="padding:13px 14px; font-family:'Courier New',monospace; font-size:11px; font-weight:600; color:#8a92a6; width:36px;">
//           ${String(i + 1).padStart(2, "0")}
//         </td>
//         <td style="padding:13px 14px; font-size:13px; color:#0f1117;">
//           <span style="font-weight:700;">${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}</span>
//           ${isAdv ? `<span style="display:inline-block; background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>` : ""}
//         </td>
//         <td style="padding:13px 14px; text-align:center; font-family:'Courier New',monospace; font-size:12px; color:#4a5060; width:50px;">
//           1
//         </td>
//         <td style="padding:13px 14px; font-family:'Courier New',monospace; font-size:11.5px; color:#4a5060;">
//           ${formatDate(inst.dueDate)}
//         </td>
//         <td style="padding:13px 14px;">
//           <span style="display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:3px 9px; border-radius:5px;
//             background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
//             ${inst.status}
//           </span>
//         </td>
//         <td style="padding:13px 14px; text-align:right; font-family:'Courier New',monospace; font-weight:600; font-size:13px; color:#0f1117;">
//           Rs ${formatAmount(inst.amount)}
//         </td>
//       </tr>`;
//         }).join("");

//         // ── Step 10: Invoice Email ────────────────────────────────
//         try {
//             await sendEmailDynamic({
//                 to: user.email,
//                 subject: `Your Enrollment Invoice ${invoice.invoiceNumber} | ALCO`,
//                 templateName: "generate-invoice",
//                 replacements: {
//                     // ── Invoice meta ──────────────────────────────
//                     invoiceNumber: invoice.invoiceNumber,
//                     invoiceStatus: invoice.status,
//                     issueDate: formatDate(new Date()),
//                     advanceDueDate: formatDate(invoice.dueDate),
//                     enrollmentId: enrollment._id.toString().slice(0, 8) + "..." + enrollment._id.toString().slice(-4),

//                     // ── Batch ─────────────────────────────────────
//                     batchName: batchDoc?.name || "—",
//                     batchStartDate: formatDate(batchDoc?.start_date) || "—",
//                     batchEndDate: formatDate(batchDoc?.end_date) || "—",

//                     // ── Student ───────────────────────────────────
//                     studentName: user.name,
//                     studentEmail: user.email,
//                     studentPhone: user.phone || "—",
//                     studentCnic: lead.contractDetails?.cnic || "—",
//                     studentAddress: lead.contractDetails?.currentAddress || "—",
//                     studentProfession: lead.profession || lead.contractDetails?.occupation || "—",

//                     // ── Sales ─────────────────────────────────────
//                     salesManagerName: lead.assigned_to?.name || "Sales Team",
//                     salesManagerEmail: lead.assigned_to?.email || "sales@alco.com",

//                     // ── Program ───────────────────────────────────
//                     programName: program?.name || "NLP Program",
//                     planNotesBlock: lead.paymentPlan?.notes
//                         ? `<div style="font-size:12px;color:#4a5060;font-style:italic;padding:10px 14px;
//                              background:#ffffff;border-radius:8px;border-left:3px solid #c8a84b;">
//                              ${lead.paymentPlan.notes}
//                            </div>`
//                         : "",

//                     // ── Installments ──────────────────────────────
//                     installmentRows,

//                     // ── Totals ────────────────────────────────────
//                     totalAmount: formatAmount(invoice.totalAmount),
//                     paidAmount: formatAmount(invoice.paidAmount || 0),
//                     remainingAmount: formatAmount(invoice.remainingAmount || invoice.totalAmount),
//                     advanceAmount: formatAmount(invoice.installments.find((i) => i.isAdvance)?.amount || 0),
//                 },
//             });
//         } catch (emailErr) {
//             console.error("Invoice email failed:", emailErr.message);
//         }

//         // ── Step 11: Credentials Email (new user only) ────────────
//         if (isNewUser) {
//             try {
//                 await sendEmailDynamic({
//                     to: user.email,
//                     subject: "Your Login Credentials | ALCO",
//                     templateName: "send-user-credentials",
//                     replacements: {
//                         userName: user.name,
//                         userEmail: user.email,
//                         password: tempPassword,
//                     },
//                 });
//             } catch (credErr) {
//                 console.error("Credentials email failed:", credErr.message);
//             }
//         }

//         // ── Step 12: Audit Log ────────────────────────────────────
//         await logAudit({
//             req,
//             action: "LEAD_CONVERTED",
//             module: "leads",
//             targetId: lead._id,
//             after: {
//                 enrollment: enrollment._id,
//                 invoice: invoice._id,
//                 user: user._id,
//                 batch_id: lead.batch_id,
//             },
//         });

//         res.status(201).json({
//             success: true,
//             message: "Lead converted — invoice and credentials emailed",
//             data: {
//                 user: {
//                     _id: user._id,
//                     name: user.name,
//                     email: user.email,
//                     isNewUser,
//                 },
//                 enrollment: {
//                     _id: enrollment._id,
//                     accessStatus: "RESTRICTED",
//                     batch: lead.batch_id,
//                 },
//                 invoice: {
//                     _id: invoice._id,
//                     invoiceNumber,
//                     totalAmount,
//                     status: "PENDING",
//                 },
//                 lead: {
//                     _id: lead._id,
//                     batch_id: lead.batch_id,
//                     user_id: lead.user_id,
//                 },
//             },
//         });

//     } catch (err) {
//         console.error("convertLead error:", err.message);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
exports.convertLead = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const lead = await Lead.findById(req.params.id).populate("assigned_to", "name email").session(session);
        if (!lead) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        if (!lead.paymentPlan) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Please set a payment plan before converting.",
            });
        }

        if (req.body.batch_id) lead.batch_id = req.body.batch_id;
        if (req.body.program_id) lead.program_id = req.body.program_id;

        const program = await Program.findById(lead.program_id).select("name").session(session);
        const batchDoc = lead.batch_id
            ? await Batch.findById(lead.batch_id).select("name start_date end_date").session(session)
            : null;

        const existingUser = await User.findOne({ email: lead.email }).session(session);
        if (existingUser) {
            const existingEnrollment = await Enrollment.findOne({
                user: existingUser._id,
                program: lead.program_id,
            }).session(session);

            if (existingEnrollment) {
                await session.abortTransaction();
                return res.status(409).json({
                    success: false,
                    message: "User is already enrolled in this program.",
                    data: { enrollmentId: existingEnrollment._id },
                });
            }
        }

        lead.status = "converted";
        await lead.save({ session });

        const crypto = require("crypto");
        const tempPassword = crypto.randomBytes(8).toString("hex");
        let user = existingUser;
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const userArr = await User.create([{
                name: `${lead.first_name} ${lead.last_name}`,
                email: lead.email,
                phone: lead.phone,
                cnic: lead.contractDetails?.cnic || "",
                address: lead.contractDetails?.currentAddress || "",
                role: "user",
                password: tempPassword,
            }], { session });
            user = userArr[0];
        }

        lead.user_id = user._id;
        await lead.save({ session });

        const existingEnrollment = await Enrollment.findOne({
            user: user._id,
            program: lead.program_id,
        }).session(session);

        if (existingEnrollment) {
            await session.abortTransaction();
            return res.status(409).json({
                success: false,
                message: "User is already enrolled in this program.",
                data: { enrollmentId: existingEnrollment._id },
            });
        }

        const enrollmentArr = await Enrollment.create([{
            user: user._id,
            program: lead.program_id,
            batch: lead.batch_id,
            status: "active",
            accessStatus: "RESTRICTED",
            assigned_to: lead.assigned_to,
            audioAccess: false,
        }], { session });
        const enrollment = enrollmentArr[0];

        if (lead.batch_id) {
            await Batch.findOneAndUpdate(
                { _id: lead.batch_id, students: { $ne: user._id } },
                { $addToSet: { students: user._id }, $inc: { current_students: 1 } },
                { session }
            );
        }

        const paymentPlanIssueDate = lead.paymentPlan.issueDate ? new Date(lead.paymentPlan.issueDate) : new Date();

        let invoiceNumber = lead.paymentPlan.invoiceNumber;
        if (invoiceNumber) {
            const taken = await invoiceNumberExists(invoiceNumber, lead._id);
            if (taken) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Invoice number ${invoiceNumber} already exists`,
                });
            }
        } else {
            invoiceNumber = await reserveNextInvoiceNumber();
        }

        const {
            totalAmount,
            advanceAmount,
            advanceDueDate,
            installments,
            certificateFee: certFee = 0,
            manualFee: manuFee = 0,
            discountAmount: discAmount = 0,
        } = lead.paymentPlan;

        const programFee = totalAmount - certFee - manuFee;
        const netPayable = totalAmount - discAmount;

        const allInstallments = [
            {
                label: "Advance Payment",
                amount: advanceAmount,
                dueDate: advanceDueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: true,
            },
            ...(installments || []).map((inst) => ({
                label: inst.label || "Installment",
                amount: inst.amount,
                dueDate: inst.dueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: false,
            })),
        ];

        if (certFee > 0) {
            allInstallments.push({
                label: "Certificate Fee",
                amount: certFee,
                dueDate: advanceDueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: false,
                feeType: "certificate",
            });
        }

        if (manuFee > 0) {
            allInstallments.push({
                label: "Manual Fee",
                amount: manuFee,
                dueDate: advanceDueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: false,
                feeType: "manual",
            });
        }

        const invoiceArr = await Invoice.create([{
            invoiceNumber,
            user: user._id,
            enrollment: enrollment._id,
            items: [
                { program: lead.program_id, programName: program.name, enrollment: enrollment._id, amount: programFee },
                ...(certFee > 0 ? [{ program: lead.program_id, programName: `${program.name} — Certificate Fee`, enrollment: enrollment._id, amount: certFee, feeType: "certificate" }] : []),
                ...(manuFee > 0 ? [{ program: lead.program_id, programName: `${program.name} — Manual Fee`, enrollment: enrollment._id, amount: manuFee, feeType: "manual" }] : []),
            ],
            totalAmount: totalAmount,
            discountAmount: discAmount,
            remainingAmount: netPayable,
            paidAmount: 0,
            dueDate: advanceDueDate,
            issueDate: paymentPlanIssueDate,
            installments: allInstallments,
            notes: lead.paymentPlan.notes || "",
            status: "PENDING",
        }], { session });
        const invoice = invoiceArr[0];

        await postInvoiceJournal({
            amount: totalAmount,
            discountAmount: discAmount,
            invoiceId: invoice._id,
            userId: req.user._id,
            description: `Invoice ${invoiceNumber} — Lead converted`,
            date: paymentPlanIssueDate,
            session,
        });

        // ✅ BLOCKING QBO SYNC — agar fail ho, poora transaction abort
        try {
            const qbo = require("../services/qboService");
            await qbo.syncInvoice(invoice, user, { session });
        } catch (qboErr) {
            await session.abortTransaction();
            console.error("[QBO] convertLead blocking sync failed:", qboErr.message);
            return res.status(502).json({
                success: false,
                message: `QuickBooks sync failed — lead conversion cancelled, no changes were made: ${qboErr.message}`,
            });
        }

        lead.invoiceNumber = invoiceNumber;
        await lead.save({ session });

        await Enrollment.findByIdAndUpdate(enrollment._id, { invoice: invoice._id }, { session });

        await logAudit({
            req,
            action: "LEAD_CONVERTED",
            module: "leads",
            targetId: lead._id,
            after: {
                enrollment: enrollment._id,
                invoice: invoice._id,
                user: user._id,
                batch_id: lead.batch_id,
            },
        });

        await session.commitTransaction();

        // ── Emails — commit ke BAAD, agar ye fail ho to lead conversion pehle hi ho chuka hai ──
        const formatDate = (d) =>
            d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
        const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

        const installmentRows = invoice.installments.map((inst, i) => {
            const isAdv = inst.isAdvance;
            const isPaid = inst.status === "PAID";
            return `
      <tr style="background:${isAdv ? "#fdf6e3" : "#ffffff"}; border-bottom:1px solid #dde2ec;">
        <td style="padding:13px 14px; font-family:'Courier New',monospace; font-size:11px; font-weight:600; color:#8a92a6; width:36px;">
          ${String(i + 1).padStart(2, "0")}
        </td>
        <td style="padding:13px 14px; font-size:13px; color:#0f1117;">
          <span style="font-weight:700;">${isAdv ? "Advance Payment" : inst.label || `Installment ${i + 1}`}</span>
          ${isAdv ? `<span style="display:inline-block; background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>` : ""}
        </td>
        <td style="padding:13px 14px; text-align:center; font-family:'Courier New',monospace; font-size:12px; color:#4a5060; width:50px;">1</td>
        <td style="padding:13px 14px; font-family:'Courier New',monospace; font-size:11.5px; color:#4a5060;">${formatDate(inst.dueDate)}</td>
        <td style="padding:13px 14px;">
          <span style="display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:3px 9px; border-radius:5px;
            background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
            ${inst.status}
          </span>
        </td>
        <td style="padding:13px 14px; text-align:right; font-family:'Courier New',monospace; font-weight:600; font-size:13px; color:#0f1117;">
          Rs ${formatAmount(inst.amount)}
        </td>
      </tr>`;
        }).join("");

        // ── Step 10: Invoice Email ────────────────────────────────
        // try {
        //     await sendEmailDynamic({
        //         to: user.email,
        //         subject: `Your Enrollment Invoice ${invoice.invoiceNumber} | ALCO`,
        //         templateName: "generate-invoice",
        //         replacements: {
        //             // ── Invoice meta ──────────────────────────────
        //             invoiceNumber: invoice.invoiceNumber,
        //             invoiceStatus: invoice.status,
        //             issueDate: formatDate(new Date()),
        //             advanceDueDate: formatDate(invoice.dueDate),
        //             enrollmentId: enrollment._id.toString().slice(0, 8) + "..." + enrollment._id.toString().slice(-4),

        //             // ── Batch ─────────────────────────────────────
        //             batchName: batchDoc?.name || "—",
        //             batchStartDate: formatDate(batchDoc?.start_date) || "—",
        //             batchEndDate: formatDate(batchDoc?.end_date) || "—",

        //             // ── Student ───────────────────────────────────
        //             studentName: user.name,
        //             studentEmail: user.email,
        //             studentPhone: user.phone || "—",
        //             studentCnic: lead.contractDetails?.cnic || "—",
        //             studentAddress: lead.contractDetails?.currentAddress || "—",
        //             studentProfession: lead.profession || lead.contractDetails?.occupation || "—",

        //             // ── Sales ─────────────────────────────────────
        //             salesManagerName: lead.assigned_to?.name || "Sales Team",
        //             salesManagerEmail: lead.assigned_to?.email || "sales@alco.com",

        //             // ── Program ───────────────────────────────────
        //             programName: program?.name || "NLP Program",
        //             planNotesBlock: lead.paymentPlan?.notes
        //                 ? `<div style="font-size:12px;color:#4a5060;font-style:italic;padding:10px 14px;
        //                      background:#ffffff;border-radius:8px;border-left:3px solid #c8a84b;">
        //                      ${lead.paymentPlan.notes}
        //                    </div>`
        //                 : "",

        //             // ── Installments ──────────────────────────────
        //             installmentRows,

        //             // ── Totals ────────────────────────────────────
        //             totalAmount: formatAmount(invoice.totalAmount),
        //             paidAmount: formatAmount(invoice.paidAmount || 0),
        //             remainingAmount: formatAmount(invoice.remainingAmount || invoice.totalAmount),
        //             advanceAmount: formatAmount(invoice.installments.find((i) => i.isAdvance)?.amount || 0),
        //         },
        //     });
        // } catch (emailErr) {
        //     console.error("Invoice email failed:", emailErr.message);
        // }

        // ── Step 11: Credentials Email (new user only) ────────────
        // if (isNewUser) {
        //     try {
        //         await sendEmailDynamic({
        //             to: user.email,
        //             subject: "Your Login Credentials | ALCO",
        //             templateName: "send-user-credentials",
        //             replacements: {
        //                 userName: user.name,
        //                 userEmail: user.email,
        //                 password: tempPassword,
        //             },
        //         });
        //     } catch (credErr) {
        //         console.error("Credentials email failed:", credErr.message);
        //     }
        // }

        // ── Step 12: Audit Log ────────────────────────────────────
        await logAudit({
            req,
            action: "LEAD_CONVERTED",
            module: "leads",
            targetId: lead._id,
            after: {
                enrollment: enrollment._id,
                invoice: invoice._id,
                user: user._id,
                batch_id: lead.batch_id,
            },
        });

        res.status(201).json({
            success: true,
            message: "Lead converted — invoice and credentials emailed",
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    isNewUser,
                },
                enrollment: {
                    _id: enrollment._id,
                    accessStatus: "RESTRICTED",
                    batch: lead.batch_id,
                },
                invoice: {
                    _id: invoice._id,
                    invoiceNumber,
                    totalAmount,
                    status: "PENDING",
                },
                lead: {
                    _id: lead._id,
                    batch_id: lead.batch_id,
                    user_id: lead.user_id,
                },
            },
        });

    } catch (err) {
        await session.abortTransaction();
        console.error("convertLead error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        session.endSession();
    }
};

exports.convertLeadBundle = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id).populate("assigned_to", "name email");
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        const { program_ids, batch_ids } = req.body; // ["nlpId", "masterPracId"], optional batch per program
        if (!Array.isArray(program_ids) || program_ids.length < 2) {
            return res.status(400).json({ success: false, message: "At least 2 programs required for bundle" });
        }

        if (!lead.paymentPlan) {
            return res.status(400).json({ success: false, message: "Please set a payment plan before converting." });
        }

        if (lead.paymentPlan.invoiceNumber) {
            const exists = await Invoice.findOne({ invoiceNumber: lead.paymentPlan.invoiceNumber });
            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: `Invoice number ${lead.paymentPlan.invoiceNumber} already exists`,
                });
            }
        }

        // ── User banao/find karo (same logic jaisa convertLead mein hai) ──
        const crypto = require("crypto");
        const tempPassword = crypto.randomBytes(8).toString("hex");
        let user = await User.findOne({ email: lead.email });
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            user = await User.create({
                name: `${lead.first_name} ${lead.last_name}`,
                email: lead.email,
                phone: lead.phone,
                cnic: lead.contractDetails?.cnic || "",
                address: lead.contractDetails?.currentAddress || "",
                role: "user",
                password: tempPassword,
            });
        }

        lead.user_id = user._id;
        lead.status = "converted";
        await lead.save();

        // ── Duplicate enrollment check — har program k lia ──
        for (const programId of program_ids) {
            const exists = await Enrollment.findOne({ user: user._id, program: programId });
            if (exists) {
                return res.status(409).json({
                    success: false,
                    message: `Already enrolled in one of the bundle programs.`,
                    data: { enrollmentId: exists._id, programId },
                });
            }
        }

        // ── Programs fetch (name + price snapshot k lia) ──
        const programs = await Program.find({ _id: { $in: program_ids } }).select("name price");

        // ── Har program k lia alag Enrollment banao ──
        const enrollments = [];
        for (let i = 0; i < program_ids.length; i++) {
            const programId = program_ids[i];
            const batchId = batch_ids?.[i] || null;

            const enrollment = await Enrollment.create({
                user: user._id,
                program: programId,
                batch: batchId,
                status: "active",
                accessStatus: "RESTRICTED",
                assigned_to: lead.assigned_to,
                audioAccess: false,
            });
            enrollments.push(enrollment);

            // ── Batch count ───────────────────────────────────────
            if (batchId) {
                await Batch.findOneAndUpdate(
                    { _id: batchId, students: { $ne: user._id } },
                    { $addToSet: { students: user._id }, $inc: { current_students: 1 } }
                );
            }
        }

        // ── EK invoice — sab programs items[] mein ──
        // const count = await Invoice.countDocuments();
        // const paymentPlanIssueDate = lead.paymentPlan.issueDate ? new Date(lead.paymentPlan.issueDate) : new Date();
        // // const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
        // let invoiceNumber = lead.paymentPlan.invoiceNumber;
        // if (!invoiceNumber) {
        //     const count = await Invoice.countDocuments();
        //     invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
        // }
        const paymentPlanIssueDate = lead.paymentPlan.issueDate ? new Date(lead.paymentPlan.issueDate) : new Date();

        // NAYA
        let invoiceNumber = lead.paymentPlan.invoiceNumber;
        if (invoiceNumber) {
            const taken = await invoiceNumberExists(invoiceNumber, lead._id);   // 👈 shared helper use karo, apna lead exclude
            if (taken) {
                return res.status(400).json({
                    success: false,
                    message: `Invoice number ${invoiceNumber} already exists`,
                });
            }
        } else {
            invoiceNumber = await reserveNextInvoiceNumber();   // 👈 legacy count-based logic ki jagah shared helper
        }

        const { totalAmount, advanceAmount, advanceDueDate, installments } = lead.paymentPlan;

        const allInstallments = [
            {
                label: "Advance Payment",
                amount: advanceAmount,
                dueDate: advanceDueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: true,
            },
            ...(installments || []).map((inst) => ({
                label: inst.label || "Installment",
                amount: inst.amount,
                dueDate: inst.dueDate,
                status: "PENDING",
                paidAmount: 0,
                isAdvance: false,
            })),
        ];

        const invoice = await Invoice.create({
            invoiceNumber,
            user: user._id,
            enrollment: enrollments[0]._id, // backward-compat k lia first wala rakh do
            isBundle: true,
            enrollments: enrollments.map((e) => e._id),
            items: programs.map((p, i) => ({
                program: p._id,
                programName: p.name,
                enrollment: enrollments[i]._id,
                amount: p.price,
            })),
            totalAmount,
            remainingAmount: totalAmount,
            paidAmount: 0,
            dueDate: advanceDueDate,
            issueDate: paymentPlanIssueDate,
            installments: allInstallments,
            notes: lead.paymentPlan.notes || "",
            status: "PENDING",
        });

        // ── Har enrollment pe invoice link update karo ──
        await Enrollment.updateMany(
            { _id: { $in: enrollments.map((e) => e._id) } },
            { invoice: invoice._id }
        );

        try {
            await postInvoiceJournal({
                amount: totalAmount,
                invoiceId: invoice._id,
                userId: req.user._id,
                description: `Bundle Invoice ${invoiceNumber} — Lead converted`,
                date: paymentPlanIssueDate,
            });
        } catch (journalErr) {
            console.error("postInvoiceJournal failed:", journalErr.message);
        }

        lead.invoiceNumber = invoiceNumber;
        await lead.save();

        // ── Emails (credentials + invoice) — same style jaisa convertLead mein hai ──
        if (isNewUser) {
            try {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "Your Login Credentials | ALCO",
                    templateName: "send-user-credentials",
                    replacements: { userName: user.name, userEmail: user.email, password: tempPassword },
                });
            } catch (e) { console.error("Credentials email failed:", e.message); }
        }

        await logAudit({
            req,
            action: "LEAD_CONVERTED_BUNDLE",
            module: "leads",
            targetId: lead._id,
            after: { enrollments: enrollments.map((e) => e._id), invoice: invoice._id, user: user._id },
        });

        res.status(201).json({
            success: true,
            message: "Bundle lead converted — invoice created for all programs",
            data: { user: { _id: user._id, email: user.email, isNewUser }, enrollments, invoice },
        });

    } catch (err) {
        console.error("convertLeadBundle error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// LOST LEAD
exports.setLeadToLost = async (req, res) => {
    try {
        const { lost_reason, lost_notes } = req.body;

        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { status: "lost", lost_reason, lost_notes },
            { new: true }
        );

        if (!lead) return res.status(404).json({ message: "Lead not found" });

        // ✅ Notify + Email
        if (lead.user_id) {
            // 1. In-app notification
            await notifyStatusChanged({
                userId: lead.user_id.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                newStatus: "lost",
                changedBy: req.user?._id?.toString(),
            });

            // 2. Email
            const user = await User.findById(lead.user_id).select("email name");
            if (user?.email) {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "Update Regarding Your Request",
                    templateName: "lead-lost",
                    replacements: {
                        UserName: user.name || lead.first_name,
                        LostReason: lost_reason || "Not specified",
                        SupportEmail: "alco@support.com",
                        YourCompanyName: "Al-and-co",
                    },
                });
            }
        }

        res.status(200).json({ success: true, data: lead });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// NOT NOW LEAD
exports.setLeadToNotNow = async (req, res) => {
    try {
        const { not_now_reason, not_now_notes } = req.body;

        const lead = await Lead.findByIdAndUpdate(
            req.params.id,
            { status: "not_now", not_now_reason, not_now_notes },
            { new: true }
        );

        if (!lead) return res.status(404).json({ message: "Lead not found" });

        if (lead.user_id) {
            await notifyStatusChanged({
                userId: lead.user_id.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                newStatus: "not_now",
                changedBy: req.user?._id?.toString(),
            });

            const user = await User.findById(lead.user_id).select("email name");
            if (user?.email) {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "Update Regarding Your Request",
                    templateName: "lead-not-now", // 👈 naya template banana hoga (ya lead-lost hi reuse kar lo)
                    replacements: {
                        UserName: user.name || lead.first_name,
                        NotNowReason: not_now_reason || "Not specified",
                        SupportEmail: "alco@support.com",
                        YourCompanyName: "Al-and-co",
                    },
                });
            }
        }

        res.status(200).json({ success: true, data: lead });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET ACTIVITIES
exports.getActivities = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .select("activities")
            .populate("activities.created_by", "name email");

        if (!lead) return res.status(404).json({ message: "Lead not found" });

        res.status(200).json({ success: true, data: lead.activities });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ADD ACTIVITY
exports.addActivity = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        lead.activities.push({
            ...req.body,
            created_by: req.user.id,
        });

        await lead.save();

        // ── Notify + Email user (agar lead ka user_id hai) ────────
        if (lead.user_id) {
            const {
                activity_type,
                title,
                description,
                call_duration_minutes,
                call_outcome,
                email_subject,
                meeting_link,
                meeting_datetime,
                meeting_location,
            } = req.body;

            // 1. In-app notification
            await notifyActivityAdded({
                userId: lead.user_id.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                activityId: lead.activities[lead.activities.length - 1]._id.toString(),
                activityType: activity_type,
                addedBy: req.user?._id?.toString(),
            });

            // 2. Email
            const user = await User.findById(lead.user_id).select("email name");
            if (user?.email) {

                // ── Activity type badge colors ──────────────────────
                const badgeStyles = {
                    call: { bg: "#DCFCE7", color: "#166534", icon: "📞" },
                    email: { bg: "#DBEAFE", color: "#1e40af", icon: "✉️" },
                    meeting: { bg: "#EDE9FE", color: "#5b21b6", icon: "📅" },
                    note: { bg: "#FEF9C3", color: "#854d0e", icon: "📝" },
                };
                const badge = badgeStyles[activity_type] || { bg: "#F3F4F6", color: "#374151", icon: "🔔" };

                // ── Conditional rows builder ────────────────────────
                const makeRow = (label, value) =>
                    value
                        ? `<tr style="border-bottom:1px solid #e2e8f0;">
                <td width="35%" style="padding:12px 16px; background:#f8fafc; font-size:12px; color:#718096; font-weight:600;">${label}</td>
                <td style="padding:12px 16px; font-size:14px; color:#1a202c;">${value}</td>
               </tr>`
                        : "";

                const makeLinkRow = (label, url) =>
                    url
                        ? `<tr style="border-bottom:1px solid #e2e8f0;">
                <td width="35%" style="padding:12px 16px; background:#f8fafc; font-size:12px; color:#718096; font-weight:600;">${label}</td>
                <td style="padding:12px 16px; font-size:14px;">
                  <a href="${url}" style="color:#185FA5; text-decoration:none;">${url}</a>
                </td>
               </tr>`
                        : "";

                await sendEmailDynamic({
                    to: user.email,
                    subject: `New ${activity_type} logged on your request`,
                    templateName: "lead-activity-added",
                    replacements: {
                        UserName: user.name || lead.first_name,
                        YourCompanyName: "Al-and-co",
                        SupportEmail: "alco@support.com",
                        ActivityType: activity_type,
                        ActivityIcon: badge.icon,
                        ActivityBadgeBg: badge.bg,
                        ActivityBadgeColor: badge.color,
                        ActivityTitle: title || "—",
                        LoggedBy: req.user?.name || "Team",

                        // Conditional rows
                        DescriptionRow: makeRow("Description", description),
                        CallDurationRow: makeRow("Call Duration", call_duration_minutes ? `${call_duration_minutes} mins` : ""),
                        CallOutcomeRow: makeRow("Call Outcome", call_outcome),
                        EmailSubjectRow: makeRow("Email Subject", email_subject),
                        MeetingLinkRow: makeLinkRow("Meeting Link", meeting_link),
                        MeetingDateRow: makeRow("Date & Time", meeting_datetime ? new Date(meeting_datetime).toLocaleString() : ""),
                        MeetingLocationRow: makeRow("Location", meeting_location),
                    },
                });
            }
        }

        res.status(201).json({ success: true, data: lead.activities });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── 1. Mark Lead as Interested ──────────────────────────────
// exports.markInterested = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id);
//         if (!lead) return res.status(404).json({ message: "Lead not found" });

//         // Status update
//         lead.status = "interested";

//         // Contract auto-fill (lead data se)
//         // lead.contractDetails = {
//         //     fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
//         //     email: lead.email,
//         //     phone: lead.phone || "",
//         //     programName: lead.program_name || "",
//         //     status: "pending",
//         // };
//         // ✅ Pehle existing contractDetails spread karo, phir override karo
//         lead.contractDetails = {
//             ...lead.contractDetails?.toObject?.() ?? lead.contractDetails ?? {},
//             fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
//             email: lead.email,
//             phone: lead.phone || "",
//             programName: lead.program_name || "",
//             status: lead.contractDetails?.status || "pending",
//         };

//         // Payment plan agar bheja hai to save karo
//         if (req.body.paymentPlan) {
//             const { invoiceNumber, issueDate, ...rest } = req.body.paymentPlan;

//             // ── Certificate fee fetch karo program se ──────────────
//             const program = await Program.findById(lead.program_id).select("certificateFee");
//             const certFee = program?.certificateFee || 0;

//             lead.paymentPlan = {
//                 ...rest,
//                 certificateFee: certFee,                                 // 👈 add
//                 totalAmount: (rest.totalAmount || 0) + certFee,          // 👈 total mein include karo
//                 invoiceNumber: invoiceNumber || undefined,
//                 issueDate: issueDate ? new Date(issueDate) : new Date(),
//                 createdBy: req.user._id,
//                 createdAt: new Date(),
//             };
//         }

//         await lead.save();

//         // ── User ko notify karo ──────────────────────────────────
//         if (lead.user_id) {
//             // In-app notification
//             await notifyStatusChanged({
//                 userId: lead.user_id.toString(),
//                 leadName: `${lead.first_name} ${lead.last_name}`,
//                 leadId: lead._id.toString(),
//                 newStatus: "interested",
//                 changedBy: req.user._id.toString(),
//             });

//             // Email
//             const user = await User.findById(lead.user_id).select("email name");
//             if (user?.email) {
//                 await sendEmailDynamic({
//                     to: user.email,
//                     subject: "You've Been Shortlisted! Complete Your Contract 🎉",
//                     templateName: "lead-interested",
//                     replacements: {
//                         UserName: user.name || lead.first_name,
//                         ProgramName: lead.program_name || "the program",
//                         ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
//                         // ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
//                         SupportEmail: "alco@support.com",
//                         YourCompanyName: "Al-and-co",
//                     },
//                 });
//             }
//         }

//         res.status(200).json({ success: true, data: lead });
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };
// exports.markInterested = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id);
//         if (!lead) return res.status(404).json({ message: "Lead not found" });

//         // Status update
//         lead.status = "interested";

//         // Contract auto-fill (lead data se)
//         // lead.contractDetails = {
//         //     fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
//         //     email: lead.email,
//         //     phone: lead.phone || "",
//         //     programName: lead.program_name || "",
//         //     status: "pending",
//         // };
//         // ✅ Pehle existing contractDetails spread karo, phir override karo
//         lead.contractDetails = {
//             ...lead.contractDetails?.toObject?.() ?? lead.contractDetails ?? {},
//             fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
//             email: lead.email,
//             phone: lead.phone || "",
//             programName: lead.program_name || "",
//             status: lead.contractDetails?.status || "pending",
//         };

//         // Payment plan agar bheja hai to save karo
//         if (req.body.paymentPlan) {
//             const { invoiceNumber, issueDate, ...rest } = req.body.paymentPlan;

//             // ── Certificate fee fetch karo program se ──────────────
//             const program = await Program.findById(lead.program_id).select("certificateFee");
//             const certFee = program?.certificateFee || 0;

//             lead.paymentPlan = {
//                 ...rest,
//                 certificateFee: certFee,                                 // 👈 add
//                 totalAmount: (rest.totalAmount || 0) + certFee,          // 👈 total mein include karo
//                 invoiceNumber: invoiceNumber || undefined,
//                 issueDate: issueDate ? new Date(issueDate) : new Date(),
//                 createdBy: req.user._id,
//                 createdAt: new Date(),
//             };
//         }

//         await lead.save();

//         // ── User ko notify karo ──────────────────────────────────
//         if (lead.user_id) {
//             // In-app notification
//             await notifyStatusChanged({
//                 userId: lead.user_id.toString(),
//                 leadName: `${lead.first_name} ${lead.last_name}`,
//                 leadId: lead._id.toString(),
//                 newStatus: "interested",
//                 changedBy: req.user._id.toString(),
//             });

//             // Email
//             const user = await User.findById(lead.user_id).select("email name");
//             if (user?.email) {
//                 await sendEmailDynamic({
//                     to: user.email,
//                     subject: "You've Been Shortlisted! Complete Your Contract 🎉",
//                     templateName: "lead-interested",
//                     replacements: {
//                         UserName: user.name || lead.first_name,
//                         ProgramName: lead.program_name || "the program",
//                         ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
//                         // ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
//                         SupportEmail: "alco@support.com",
//                         YourCompanyName: "Al-and-co",
//                     },
//                 });
//             }
//         }

//         res.status(200).json({ success: true, data: lead });
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };
exports.markInterested = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        // Status update
        lead.status = "interested";

        // Contract auto-fill (lead data se)
        // lead.contractDetails = {
        //     fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
        //     email: lead.email,
        //     phone: lead.phone || "",
        //     programName: lead.program_name || "",
        //     status: "pending",
        // };
        // ✅ Pehle existing contractDetails spread karo, phir override karo
        lead.contractDetails = {
            ...lead.contractDetails?.toObject?.() ?? lead.contractDetails ?? {},
            fullName: `${lead.first_name} ${lead.last_name || ""}`.trim(),
            email: lead.email,
            phone: lead.phone || "",
            programName: lead.program_name || "",
            status: lead.contractDetails?.status || "pending",
        };

        if (req.body.paymentPlan) {
            // ✅ default value hata do taake "nahi bheja" vs "0 bheja" mein farak reh sake
            const { invoiceNumber, issueDate, certificateFee, manualFee, discount = 0, ...rest } = req.body.paymentPlan;

            // ✅ sahi path se resolve karo, aur ek hi jagah calculate karo
            const resolvedCertFee = certificateFee ?? lead.paymentPlan?.certificateFee ?? 0;
            const resolvedManualFee = manualFee ?? lead.paymentPlan?.manualFee ?? 0;

            lead.paymentPlan = {
                ...rest,
                certificateFee: resolvedCertFee,
                manualFee: resolvedManualFee,
                discountAmount: discount,
                totalAmount: (rest.totalAmount || 0) + resolvedCertFee + resolvedManualFee,
                invoiceNumber: invoiceNumber || undefined,
                issueDate: issueDate ? new Date(issueDate) : new Date(),
                createdBy: req.user._id,
                createdAt: new Date(),
            };
        }

        await lead.save();

        // ── User ko notify karo ──────────────────────────────────
        if (lead.user_id) {
            // In-app notification
            await notifyStatusChanged({
                userId: lead.user_id.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                newStatus: "interested",
                changedBy: req.user._id.toString(),
            });

            // Email
            const user = await User.findById(lead.user_id).select("email name");
            if (user?.email) {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "You've Been Shortlisted! Complete Your Contract 🎉",
                    templateName: "lead-interested",
                    replacements: {
                        UserName: user.name || lead.first_name,
                        ProgramName: lead.program_name || "the program",
                        ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
                        // ContractLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
                        SupportEmail: "alco@support.com",
                        YourCompanyName: "Al-and-co",
                    },
                });
            }
        }

        res.status(200).json({ success: true, data: lead });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── 2. Submit Contract (user side) ──────────────────────────
// exports.submitContract = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id);
//         if (!lead) return res.status(404).json({ message: "Lead not found" });

//         if (lead.status === "converted") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Contract cannot be edited after lead is converted.",
//             });
//         }

//         const program = await Program.findById(lead.program_id);
//         const programName = program?.name || "";

//         const {
//             fatherHusbandName,
//             cnic,
//             bankAccountNumber,
//             currentAddress,
//             emergencyContactName,
//             emergencyContactPhone,
//             occupation,
//             participationAgreement,
//             photoVideoRelease,
//             signatureType,
//             signatureData,
//         } = req.body;

//         // Merge karo — auto-fill fields preserve hongi
//         lead.contractDetails = {
//             ...lead.contractDetails,
//             programName,
//             fatherHusbandName,
//             cnic,
//             bankAccountNumber,
//             currentAddress,
//             emergencyContactName,
//             emergencyContactPhone,
//             occupation,
//             participationAgreement,
//             photoVideoRelease,
//             signatureType,
//             signatureData,
//             status: "signed",
//             signedAt: new Date(),
//             submittedAt: new Date(),
//         };

//         await lead.save();

//         // ── Admin ko notify karo ─────────────────────────────────
//         if (lead.assigned_to) {
//             await notifyContractSubmitted({
//                 userId: lead.assigned_to.toString(),
//                 leadName: `${lead.first_name} ${lead.last_name}`,
//                 leadId: lead._id.toString(),
//                 triggeredBy: lead.user_id?.toString(),
//             });
//         }

//         // ── User ko confirmation email ───────────────────────────
//         const user = await User.findById(lead.user_id).select("email name");
//         if (user?.email) {
//             await sendEmailDynamic({
//                 to: user.email,
//                 subject: "Contract Received — We'll Be in Touch Soon ✅",
//                 templateName: "contract-submitted",
//                 replacements: {
//                     UserName: user.name || lead.first_name,
//                     ProgramName: programName || "the program",
//                     SupportEmail: "alco@support.com",
//                     YourCompanyName: "Al-and-co",
//                 },
//             });
//         }

//         res.status(200).json({ success: true, message: "Contract submitted!", data: lead });
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };
exports.submitContract = async (req, res) => {
    try {
        console.log("REQ BODY:", JSON.stringify(req.body));

        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        if (lead.status === "converted") {
            return res.status(400).json({
                success: false,
                message: "Contract cannot be edited after lead is converted.",
            });
        }

        // ── Safe destructure ─────────────────────────────────────
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({
                success: false,
                message: "Request body is missing or invalid",
            });
        }

        const {
            fatherHusbandName = "",
            cnic = "",
            bankAccountNumber = "",
            currentAddress = "",
            emergencyContactName = "",
            emergencyContactPhone = "",
            occupation = "",
            participationAgreement = false,
            photoVideoRelease = false,
            signatureType = "draw",
            signatureData = "",
        } = req.body;

        const program = await Program.findById(lead.program_id);
        const programName = program?.name || lead.contractDetails?.programName || "";

        const existing = lead.contractDetails?.toObject
            ? lead.contractDetails.toObject()
            : { ...(lead.contractDetails || {}) };

        lead.contractDetails = {
            ...existing,
            programName,
            fatherHusbandName,
            cnic,
            bankAccountNumber,
            currentAddress,
            emergencyContactName,
            emergencyContactPhone,
            occupation,
            participationAgreement,
            photoVideoRelease,
            signatureType,
            signatureData,
            status: "signed",
            signedAt: new Date(),
            submittedAt: new Date(),
        };

        lead.markModified("contractDetails");
        await lead.save();

        // ── Admin notify ─────────────────────────────────────────
        if (lead.assigned_to) {
            await notifyContractSubmitted({
                userId: lead.assigned_to.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                triggeredBy: lead.user_id?.toString(),
            });
        }

        // ── User confirmation email ──────────────────────────────
        const user = await User.findById(lead.user_id).select("email name");
        if (user?.email) {
            await sendEmailDynamic({
                to: user.email,
                subject: "Contract Received — We'll Be in Touch Soon ✅",
                templateName: "contract-submitted",
                replacements: {
                    UserName: user.name || lead.first_name,
                    ProgramName: programName || "the program",
                    SupportEmail: "alco@support.com",
                    YourCompanyName: "Al-and-co",
                },
            });
        }

        res.status(200).json({ success: true, message: "Contract submitted!", data: lead });

    } catch (err) {
        console.error("submitContract error:", err); // ← full error object
        res.status(500).json({ message: err.message, stack: err.stack }); // ← stack bhi bhejo temporarily
    }
};

// ─── Get My Contract (user side) ─────────────────────────────
// exports.getMyContract = async (req, res) => {
//     try {
//         // req.user._id se lead dhundo jo is user ka ho
//         const lead = await Lead.findOne({
//             user_id: req.user._id,
//             status: "interested", // sirf interested leads
//         })
//             .select("first_name last_name email phone program_name contractDetails paymentPlan status")
//             .populate("program_id", "name")
//             .sort({ updatedAt: -1 }); // latest pehle

//         if (!lead) {
//             return res.status(200).json({
//                 success: true,
//                 data: null,
//                 message: "No contract found"
//             });
//         }

//         res.status(200).json({ success: true, data: lead });

//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };

exports.getMyContract = async (req, res) => {
    try {
        const leads = await Lead.find({
            user_id: req.user._id,
            "contractDetails.status": { $in: ["pending", "filled", "signed"] },
        })
            .select("first_name last_name email phone program_name program_id contractDetails paymentPlan invoiceNumber status createdAt updatedAt")
            .populate("program_id", "name")
            .sort({ updatedAt: -1 });

        res.status(200).json({ success: true, data: leads });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// leadController.js
exports.updateContract = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        // Converted lead ka contract edit nahi hoga
        if (lead.status === "converted") {
            return res.status(400).json({
                success: false,
                message: "Cannot edit contract of a converted lead.",
            });
        }

        lead.contractDetails = {
            ...lead.contractDetails,
            ...req.body,
            // status preserve karo ya update karo
            status: req.body.status || lead.contractDetails?.status || "filled",
        };

        await lead.save();
        res.status(200).json({ success: true, data: lead });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


// ─── 3. Update Payment Plan (admin) — notification bhi ───────
// exports.updatePaymentPlan = async (req, res) => {
//     try {
//         const lead = await Lead.findById(req.params.id);
//         if (!lead) return res.status(404).json({ message: "Lead not found" });


//         // const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

//         const { invoiceNumber, issueDate, ...rest } = req.body;

//         // ── Certificate fee fetch karo program se ──────────────
//         const program = await Program.findById(lead.program_id).select("certificateFee");
//         const certFee = program?.certificateFee || 0;

//         lead.paymentPlan = {
//             ...rest,
//             certificateFee: certFee,
//             totalAmount: (rest.totalAmount || 0) + certFee,
//             invoiceNumber: invoiceNumber || lead.paymentPlan?.invoiceNumber || undefined,
//             issueDate: issueDate ? new Date(issueDate) : (lead.paymentPlan?.issueDate || new Date()),
//             createdBy: req.user._id,
//             createdAt: new Date(),
//         };

//         await lead.save();

//         // ── User ko notify karo ──────────────────────────────────
//         if (lead.user_id) {
//             await notifyPaymentPlanSet({
//                 userId: lead.user_id.toString(),
//                 leadName: `${lead.first_name} ${lead.last_name}`,
//                 leadId: lead._id.toString(),
//                 triggeredBy: req.user._id.toString(),
//             });

//             const user = await User.findById(lead.user_id).select("email name");
//             if (user?.email) {
//                 await sendEmailDynamic({
//                     to: user.email,
//                     subject: "Your Payment Plan is Ready 💳",
//                     templateName: "payment-plan-updated",
//                     replacements: {
//                         UserName: user.name || lead.first_name,
//                         ProgramName: lead.program_name || "the program",
//                         TotalAmount: `Rs ${Number(req.body.totalAmount || 0).toLocaleString()}`,
//                         AdvanceAmount: `Rs ${Number(req.body.advanceAmount || 0).toLocaleString()}`,
//                         Installments: req.body.installments?.length || 0,
//                         // DashboardLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract/${lead._id}`,
//                         DashboardLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
//                         SupportEmail: "alco@support.com",
//                         YourCompanyName: "Al-and-co",
//                     },
//                 });
//             }
//         }

//         res.status(200).json({ success: true, data: lead });
//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };
exports.updatePaymentPlan = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ message: "Lead not found" });

        const { invoiceNumber, issueDate, certificateFee = 0, manualFee = 0, discount = 0, ...rest } = req.body;

        const existingCertFee = lead.paymentPlan?.certificateFee || 0;
        const existingManualFee = lead.paymentPlan?.manualFee || 0;

        const resolvedCertFee = existingCertFee > 0 ? existingCertFee : (certificateFee ?? 0);
        const resolvedManualFee = existingManualFee > 0 ? existingManualFee : (manualFee ?? 0);

        lead.paymentPlan = {
            ...rest,
            certificateFee: resolvedCertFee,
            manualFee: resolvedManualFee,
            discountAmount: discount,
            totalAmount: (rest.totalAmount || 0) + resolvedCertFee + resolvedManualFee,
            invoiceNumber: invoiceNumber || lead.paymentPlan?.invoiceNumber || undefined,
            issueDate: issueDate ? new Date(issueDate) : (lead.paymentPlan?.issueDate || new Date()),
            createdBy: req.user._id,
            createdAt: new Date(),
        };

        await lead.save();

        // ── User ko notify karo ──────────────────────────────────
        if (lead.user_id) {
            await notifyPaymentPlanSet({
                userId: lead.user_id.toString(),
                leadName: `${lead.first_name} ${lead.last_name}`,
                leadId: lead._id.toString(),
                triggeredBy: req.user._id.toString(),
            });

            const user = await User.findById(lead.user_id).select("email name");
            if (user?.email) {
                await sendEmailDynamic({
                    to: user.email,
                    subject: "Your Payment Plan is Ready 💳",
                    templateName: "payment-plan-updated",
                    replacements: {
                        UserName: user.name || lead.first_name,
                        ProgramName: lead.program_name || "the program",
                        TotalAmount: `Rs ${Number(req.body.totalAmount || 0).toLocaleString()}`,
                        AdvanceAmount: `Rs ${Number(req.body.advanceAmount || 0).toLocaleString()}`,
                        Installments: req.body.installments?.length || 0,
                        // DashboardLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract/${lead._id}`,
                        DashboardLink: `${process.env.CRM_FRONTEND_URL}/dashboard/contract`,
                        SupportEmail: "alco@support.com",
                        YourCompanyName: "Al-and-co",
                    },
                });
            }
        }

        res.status(200).json({ success: true, data: lead });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getLeadsStats = async (req, res) => {
    try {
        const { userId } = req.query;

        const matchStage = userId
            ? { assigned_to: new mongoose.Types.ObjectId(userId) }
            : {};

        const stats = await Lead.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    new: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
                    contacted: { $sum: { $cond: [{ $eq: ["$status", "contacted"] }, 1, 0] } },
                    qualified: { $sum: { $cond: [{ $eq: ["$status", "qualified"] }, 1, 0] } },
                    interested: { $sum: { $cond: [{ $eq: ["$status", "interested"] }, 1, 0] } },
                    converted: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } },
                    lost: { $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] } },

                    hot: { $sum: { $cond: [{ $eq: ["$quality", "hot"] }, 1, 0] } },
                    warm: { $sum: { $cond: [{ $eq: ["$quality", "warm"] }, 1, 0] } },
                    cold: { $sum: { $cond: [{ $eq: ["$quality", "cold"] }, 1, 0] } },

                    assigned: { $sum: { $cond: [{ $ne: ["$assigned_to", null] }, 1, 0] } },
                }
            }
        ]);

        const data = stats[0] || {
            total: 0, new: 0, contacted: 0, qualified: 0, interested: 0,
            converted: 0, lost: 0, hot: 0, warm: 0, cold: 0, assigned: 0
        };

        const conversionRate =
            data.total > 0
                ? ((data.converted / data.total) * 100).toFixed(1)
                : "0";

        res.status(200).json({
            success: true,
            data: { ...data, conversionRate }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ── Manually trigger payment-plan invoice email (button/API se) ──
// exports.sendPaymentPlanInvoice = async (req, res) => {
//   try {
//     const { invoiceId } = req.params;

//     const invoice = await Invoice.findById(invoiceId).populate("user", "_id");
//     if (!invoice) {
//       return res.status(404).json({ success: false, message: "Invoice not found" });
//     }

//     // Student khud apni invoice email trigger kar sake, baaki sirf staff
//     if (req.user.role === "user" && invoice.user._id.toString() !== req.user._id.toString()) {
//       return res.status(403).json({ success: false, message: "Not authorized" });
//     }

//     const sent = await sendPaymentPlanInvoiceEmail(invoiceId);

//     if (!sent) {
//       return res.status(400).json({
//         success: false,
//         message: "Email nahi bhej saka — invoice ya student email missing hai",
//       });
//     }

//     await logAudit({
//       req,
//       action: "PAYMENT_PLAN_INVOICE_EMAIL_SENT",
//       module: "finance",
//       targetId: invoice._id,
//       after: { sentTo: invoice.user._id, sentAt: new Date() },
//     });

//     res.json({ success: true, message: "Invoice email successfully bhej diya gaya" });
//   } catch (err) {
//     console.error("sendPaymentPlanInvoice error:", err.message);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.sendPaymentPlanInvoice = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id).populate("program_id", "name");

        if (!lead) {
            return res.status(404).json({ success: false, message: "Lead not found" });
        }

        const plan = lead.paymentPlan;
        if (!plan?.invoiceNumber || !plan?.issueDate) {
            return res.status(400).json({
                success: false,
                message: "Invoice number aur issue date pehle fill karein",
            });
        }

        if (!lead.email) {
            return res.status(400).json({ success: false, message: "Lead ka email missing hai" });
        }

        const formatDate = (d) =>
            d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
        const formatAmount = (n) => Number(n || 0).toLocaleString("en-PK");

        const installmentRows = (plan.installments || [])
            .map((inst, i) => {
                const isPaid = inst.status === "paid";
                return `
        <tr style="background:#ffffff; border-bottom:1px solid #dde2ec;">
          <td style="padding:13px 16px; font-size:11px; color:#8a92a6;">${String(i + 1).padStart(2, "0")}</td>
          <td style="padding:13px 16px; font-size:13px; color:#0f1117; font-weight:700;">${inst.label || `Installment ${i + 1}`}</td>
          <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">1</td>
          <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">—</td>
          <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">—</td>
          <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${formatDate(inst.dueDate)}</td>
          <td style="padding:13px 16px;">
            <span style="font-size:9.5px; font-weight:700; padding:3px 9px; border-radius:5px;
              background:${isPaid ? "#eafaf3" : "#fff8e8"}; color:${isPaid ? "#1a8a57" : "#b07800"};">
              ${isPaid ? "PAID" : "PENDING"}
            </span>
          </td>
          <td style="padding:13px 16px; text-align:right; font-weight:600; font-size:13px;">
            Rs ${formatAmount(inst.amount)}
          </td>
        </tr>`;
            })
            .join("");

        const advanceRow = plan.advanceAmount
            ? `
      <tr style="background:#fdf6e3; border-bottom:1px solid #dde2ec;">
        <td style="padding:13px 16px; font-size:11px; color:#8a92a6;">00</td>
        <td style="padding:13px 16px; font-size:13px; color:#0f1117; font-weight:700;">
          Advance Payment
          <span style="background:#c8a84b; color:#5a3a00; font-size:9px; font-weight:700; padding:2px 8px; border-radius:4px; margin-left:7px;">Advance</span>
        </td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">1</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">—</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">—</td>
        <td style="padding:13px 16px; font-size:11.5px; color:#4a5060;">${formatDate(plan.advanceDueDate)}</td>
        <td style="padding:13px 16px;">
          <span style="font-size:9.5px; font-weight:700; padding:3px 9px; border-radius:5px; background:#fff8e8; color:#b07800;">PENDING</span>
        </td>
        <td style="padding:13px 16px; text-align:right; font-weight:600; font-size:13px;">
          Rs ${formatAmount(plan.advanceAmount)}
        </td>
      </tr>`
            : "";

        await sendEmailDynamic({
            to: lead.email,
            subject: `Invoice ${plan.invoiceNumber} | ALCO`,
            templateName: "send-invoice",
            replacements: {
                invoiceNumber: plan.invoiceNumber,
                invoiceStatus: "PENDING",
                issueDate: formatDate(plan.issueDate),
                advanceDueDate: formatDate(plan.advanceDueDate),
                enrollmentId: "—",
                studentName: `${lead.first_name} ${lead.last_name}`,
                studentEmail: lead.email,
                studentPhone: lead.phone || "—",
                salesManagerName: lead.assigned_to?.name || "Finance Team",
                salesManagerEmail: lead.assigned_to?.email || "finance@alco.com",
                batchName: "—",
                batchStartDate: "—",
                batchEndDate: "—",
                studentCnic: "—",
                studentAddress: "—",
                studentProfession: lead.profession || "—",
                programName: lead.program_id?.name || "Program",
                planNotes: plan.notes || "",
                installmentRows: advanceRow + installmentRows,
                totalAmount: formatAmount(plan.totalAmount),
                paidAmount: formatAmount(0),
                remainingAmount: formatAmount(plan.totalAmount),
                advanceAmount: formatAmount(plan.advanceAmount || 0),
            },
        });

        res.json({ success: true, message: "Invoice email successfully bhej diya gaya" });
    } catch (err) {
        console.error("sendPaymentPlanInvoice error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};


// ✅ Ye functions leadController.js mein ADD/REPLACE karni hain (existing exports ke sath)
// NAYA import add karo: const ExcelJS = require("exceljs");

// ✅ Robust cell parsing (Date/Number/Boolean/hyperlink/rich-text safe)
function cellRawValue(row, colNumber) {
    if (!colNumber) return null;
    const cell = row.getCell(colNumber);
    const val = cell.value;
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    if (typeof val === "boolean") return val;
    if (typeof val === "object") {
        if (val.richText) return val.richText.map((rt) => rt.text).join("");
        if (val.text) {
            if (typeof val.text === "string") return val.text;
            if (val.text.richText) return val.text.richText.map((rt) => rt.text).join("");
            if (val.hyperlink) return String(val.hyperlink).replace(/^mailto:/i, "");
        }
        if (val.result !== undefined) return val.result;
        return null;
    }
    return val;
}
function cellText(row, colNumber) {
    const val = cellRawValue(row, colNumber);
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val.toISOString();
    const str = String(val).trim();
    return str || null;
}
function cellDate(row, colNumber) {
    const val = cellRawValue(row, colNumber);
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
}
function cellBoolean(row, colNumber) {
    const val = cellRawValue(row, colNumber);
    if (typeof val === "boolean") return val;
    if (val === null || val === undefined) return false;
    const str = String(val).trim().toLowerCase();
    return str === "true" || str === "1" || str === "yes";
}

// ✅ Header row parse karo — DUAL MODE:
//   1. Facebook/Meta Lead Ads export (id, created_time, ad_id, ad_name, adset_id,
//      adset_name, campaign_id, campaign_name, form_id, form_name, is_organic,
//      platform, full_name, job_title, email, phone_number, city)
//   2. Generic manual list (First Name, Last Name, Email, Phone, Program,
//      Nationality, Profession, Source, Quality)
function buildLeadHeaderMap(worksheet) {
    const headerRow = worksheet.getRow(1);
    const map = {};
    const rawHeaders = new Set();

    headerRow.eachCell((cell, colNumber) => {
        // ✅ Header cell mein kabhi kabhi "[...]" mein explanatory note hoti hai —
        // "platform [have this as well...]" → sirf "platform" nikalo
        const fullText = String(cell.value || "").trim().toLowerCase();
        const text = fullText.split("[")[0].trim();
        if (!text) return;
        rawHeaders.add(text);

        // Facebook export headers
        if (text === "id") map.externalLeadId = colNumber;
        else if (text === "created_time") map.createdTime = colNumber;
        else if (text === "ad_id") map.adId = colNumber;
        else if (text === "ad_name") map.adName = colNumber;
        else if (text === "adset_id") map.adsetId = colNumber;
        else if (text === "adset_name") map.adsetName = colNumber;
        else if (text === "campaign_id") map.campaignId = colNumber;
        else if (text === "campaign_name") map.campaignName = colNumber;
        else if (text === "form_id") map.formId = colNumber;
        else if (text === "form_name") map.formName = colNumber;
        else if (text === "is_organic") map.isOrganic = colNumber;
        else if (text === "platform") map.platform = colNumber;
        else if (text === "full_name") map.fullName = colNumber;
        else if (text === "job_title") map.jobTitle = colNumber;
        else if (text === "phone_number") map.phoneNumber = colNumber;
        else if (text === "city") map.city = colNumber;
        else if (text === "first name") map.firstName = colNumber;
        else if (text === "last name") map.lastName = colNumber;
        else if (text === "phone") map.phone = colNumber;
        else if (text === "program") map.program = colNumber;
        else if (text === "nationality") map.nationality = colNumber;
        else if (text === "profession") map.profession = colNumber;
        else if (text === "source") map.source = colNumber;
        else if (text === "quality") map.quality = colNumber;
        else if (text === "email") map.email = colNumber;
    });

    map.isFacebookFormat = rawHeaders.has("full_name") && (rawHeaders.has("ad_id") || rawHeaders.has("campaign_id"));
    return map;
}

const VALID_SOURCES = ["utm", "referral", "social", "facebook", "instagram", "google", "organic", "enroll", "contact", "webinar", "frontforce", "lms", "crm", "resource", "register", "chatbot", "other"];
const VALID_QUALITIES = ["hot", "warm", "cold"];

// ✅ "Jabir Hussain" → { firstName: "Jabir", lastName: "Hussain" }
function splitFullName(fullName) {
    const parts = (fullName || "").trim().split(/\s+/);
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    return { firstName, lastName };
}

// ─────────────────────────────────────────────────────────
// STEP 1: PREVIEW
// Body: multipart file + optional "defaultProgramId" (Facebook exports ke liye
// zaroori hai, kyunki unmein per-row Program column hota hi nahi — ek file
// = ek ad = ek program hota hai)
// ─────────────────────────────────────────────────────────
exports.previewBulkLeads = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "Excel file is required" });
        }

        const { defaultProgramId } = req.body;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];

        const headerMap = buildLeadHeaderMap(worksheet);
        if (!headerMap.email) {
            return res.status(400).json({ success: false, message: "'Email' column header row mein nahi mila" });
        }
        if (!headerMap.isFacebookFormat && !headerMap.firstName) {
            return res.status(400).json({
                success: false,
                message: "'First Name' column chahiye (ya Facebook ad-export format use karein jisme 'full_name' hota hai)",
            });
        }

        const allPrograms = await Program.find({}).select("name price");
        const programByName = new Map(allPrograms.map((p) => [p.name.trim().toLowerCase(), p]));
        const defaultProgram = defaultProgramId
            ? allPrograms.find((p) => p._id.toString() === defaultProgramId)
            : null;

        const parsedRows = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const email = cellText(row, headerMap.email)?.toLowerCase();
            if (!email) return;

            if (headerMap.isFacebookFormat) {
                // ── FACEBOOK AD EXPORT MODE ──────────────────────────────
                const { firstName, lastName } = splitFullName(cellText(row, headerMap.fullName));
                if (!firstName) return;

                const rawPhone = cellText(row, headerMap.phoneNumber);
                const phone = rawPhone ? rawPhone.replace(/^p:/i, "").trim() : null;

                const rawExternalId = cellText(row, headerMap.externalLeadId);
                const externalLeadId = rawExternalId ? rawExternalId.replace(/^l:/i, "").trim() : null;

                const platformMap = {
                    fb: "Facebook",
                    facebook: "Facebook",
                    ig: "Instagram",
                    instagram: "Instagram",
                };

                let rawPlatform = String(cellText(row, headerMap.platform) || "").trim().toLowerCase();

                // ✅ Fallback: agar "platform" column export me hai hi nahi, to ad/campaign/form name se guess karo
                if (!rawPlatform) {
                    const combinedText = [
                        cellText(row, headerMap.adName),
                        cellText(row, headerMap.campaignName),
                        cellText(row, headerMap.formName),
                    ].filter(Boolean).join(" ").toLowerCase();

                    if (combinedText.includes("instagram") || combinedText.includes(" ig ") || combinedText.includes("ig_")) {
                        rawPlatform = "instagram";
                    } else if (combinedText.includes("facebook") || combinedText.includes("fb_")) {
                        rawPlatform = "fb";
                    }
                }

                let source;
                if (rawPlatform === "ig" || rawPlatform === "instagram") {
                    source = "instagram";
                } else if (rawPlatform === "fb" || rawPlatform === "facebook") {
                    source = "facebook";
                } else {
                    console.warn(`[BulkLeadImport] Could not detect platform for row, defaulting to facebook. adName/campaignName/formName checked.`);
                    source = "facebook";
                }

                parsedRows.push({
                    firstName,
                    lastName,
                    email,
                    phone,
                    programNameRaw: null, // ✅ FB export mein program column nahi hota — defaultProgram use hoga
                    nationality: undefined,
                    profession: cellText(row, headerMap.jobTitle) || undefined,
                    city: cellText(row, headerMap.city) || undefined,
                    source,
                    quality: "warm",
                    adSource: {
                        platform: platformMap[rawPlatform] || rawPlatform || "Facebook",
                        externalLeadId,
                        adId: cellText(row, headerMap.adId),
                        adName: cellText(row, headerMap.adName),
                        adsetId: cellText(row, headerMap.adsetId),
                        adsetName: cellText(row, headerMap.adsetName),
                        campaignId: cellText(row, headerMap.campaignId),
                        campaignName: cellText(row, headerMap.campaignName),
                        formId: cellText(row, headerMap.formId),
                        formName: cellText(row, headerMap.formName),
                        isOrganic: cellBoolean(row, headerMap.isOrganic),
                        createdTime: cellDate(row, headerMap.createdTime),
                    },
                });
            } else {
                // ── GENERIC MANUAL LIST MODE ─────────────────────────────
                const firstName = cellText(row, headerMap.firstName);
                if (!firstName) return;

                const source = cellText(row, headerMap.source)?.toLowerCase();
                const quality = cellText(row, headerMap.quality)?.toLowerCase();

                parsedRows.push({
                    firstName,
                    lastName: cellText(row, headerMap.lastName) || "",
                    email,
                    phone: cellText(row, headerMap.phone) || null,
                    programNameRaw: cellText(row, headerMap.program),
                    nationality: cellText(row, headerMap.nationality) || undefined,
                    profession: cellText(row, headerMap.profession) || undefined,
                    city: undefined,
                    source: VALID_SOURCES.includes(source) ? source : "enroll",
                    quality: VALID_QUALITIES.includes(quality) ? quality : "cold",
                    adSource: null,
                });
            }
        });

        if (parsedRows.length === 0) {
            return res.status(400).json({ success: false, message: "No valid rows found" });
        }

        // ✅ file ke andar duplicate email hata do (last occurrence rakho)
        const rowMap = new Map();
        parsedRows.forEach((r) => rowMap.set(r.email, r));
        const uniqueRows = Array.from(rowMap.values());

        const emails = uniqueRows.map((r) => r.email);
        const existingUsers = await User.find({ email: { $in: emails } }).select("name email");
        const userMap = new Map(existingUsers.map((u) => [u.email, u]));

        const preview = [];
        for (const r of uniqueRows) {
            // ✅ Program resolve: pehle row ka apna (generic mode), warna defaultProgram (FB mode)
            let matchedProgram = r.programNameRaw
                ? programByName.get(r.programNameRaw.trim().toLowerCase())
                : null;
            if (!matchedProgram && defaultProgram) matchedProgram = defaultProgram;

            const baseInfo = {
                firstName: r.firstName,
                lastName: r.lastName,
                email: r.email,
                phone: r.phone,
                nationality: r.nationality,
                profession: r.profession,
                city: r.city,
                source: r.source,
                quality: r.quality,
                adSource: r.adSource,
                existingUser: userMap.get(r.email) ? { name: userMap.get(r.email).name } : null,
            };

            if (r.programNameRaw && !matchedProgram) {
                preview.push({ ...baseInfo, status: "program_not_found", requestedProgramName: r.programNameRaw });
                continue;
            }

            if (!matchedProgram) {
                // Koi program hi nahi mila (na row se, na default se) — bina program ke lead bhi allowed hai
                preview.push({ ...baseInfo, status: "eligible", programId: null, programName: null });
                continue;
            }

            const existingLead = await Lead.findOne({ email: r.email, program_id: matchedProgram._id });
            if (existingLead) {
                preview.push({
                    ...baseInfo,
                    status: "duplicate",
                    programId: matchedProgram._id,
                    programName: matchedProgram.name,
                    existingLeadId: existingLead._id,
                });
                continue;
            }

            preview.push({
                ...baseInfo,
                status: "eligible",
                programId: matchedProgram._id,
                programName: matchedProgram.name,
                opportunityValue: matchedProgram.price || 0,
            });
        }

        res.status(200).json({
            success: true,
            isFacebookFormat: headerMap.isFacebookFormat,
            totalRows: uniqueRows.length,
            eligibleCount: preview.filter((p) => p.status === "eligible").length,
            duplicateCount: preview.filter((p) => p.status === "duplicate").length,
            programNotFoundCount: preview.filter((p) => p.status === "program_not_found").length,
            preview,
            availablePrograms: allPrograms.map((p) => ({ _id: p._id, name: p.name, price: p.price })),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────
// STEP 2: CONFIRM
// Payload: [{ firstName, lastName, email, phone, programId, nationality,
//   profession, city, source, quality, adSource }]
// ─────────────────────────────────────────────────────────
exports.confirmBulkLeads = async (req, res) => {
    try {
        const { leads } = req.body;

        if (!Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({ success: false, message: "leads array is required" });
        }

        const created = [];
        const skipped = [];

        for (const item of leads) {
            const {
                firstName, lastName, email, phone, programId,
                nationality, profession, city, source, quality, adSource,
            } = item;

            if (!firstName || !email) {
                skipped.push({ email, reason: "Missing first name or email" });
                continue;
            }

            const cleanEmail = email.toLowerCase().trim();

            if (programId) {
                const existingLead = await Lead.findOne({ email: cleanEmail, program_id: programId });
                if (existingLead) {
                    skipped.push({ email: cleanEmail, reason: "Lead already exists for this email+program" });
                    continue;
                }
            }

            let opportunity_value = 0;
            let programName = null;
            if (programId) {
                const program = await Program.findById(programId).select("name price");
                if (program) {
                    opportunity_value = program.price || 0;
                    programName = program.name;
                }
            }

            // ✅ NAYA — har lead ko round-robin tareeqe se ek-ek karke assign karo
            const assignedManager = await assignLeadManager();

            let user = await User.findOne({ email: cleanEmail });
            let isNewUser = false;
            let plainPassword = null;

            if (!user) {
                isNewUser = true;
                plainPassword = Math.random().toString(36).slice(-8);
                const hashedPassword = await bcrypt.hash(plainPassword, 10);

                user = await User.create({
                    name: `${firstName} ${lastName || ""}`.trim(),
                    email: cleanEmail,
                    phone: phone || null,
                    password: hashedPassword,
                    role: "user",
                    isVerified: true,
                    isActive: true,
                    avatarColor: generateColor(cleanEmail),
                    isTemporaryPassword: true,
                    // ✅ Ad-tracking sirf naye user par set hoti hai — "kis ad ne is account ko janam diya"
                    ...(adSource
                        ? {
                            adSource: {
                                platform: adSource.platform,
                                externalLeadId: adSource.externalLeadId,
                                adId: adSource.adId,
                                adName: adSource.adName,
                                adsetId: adSource.adsetId,
                                adsetName: adSource.adsetName,
                                campaignId: adSource.campaignId,
                                campaignName: adSource.campaignName,
                                formId: adSource.formId,
                                formName: adSource.formName,
                                createdTime: adSource.createdTime,
                            },
                        }
                        : {}),
                });
            }

            const lead = await Lead.create({
                first_name: firstName,
                last_name: lastName || "",
                email: cleanEmail,
                phone: phone || null,
                program_id: programId || null,
                program_name: programName,
                nationality: nationality || undefined,
                profession: profession || undefined,
                city: city || undefined,
                source: source || "enroll",
                quality: quality || "cold",
                opportunity_value,
                user_id: user._id,
                created_by: req.user._id,
                assigned_to: assignedManager,
                ...(adSource ? { adSource } : {}),
            });
            if (isNewUser) {
                try {
                    await sendEmailDynamic({
                        to: cleanEmail,
                        subject: "Your Account Credentials 🔑",
                        templateName: "send-user-credentials",
                        replacements: {
                            UserName: `${firstName} ${lastName || ""}`,
                            UserEmail: cleanEmail,
                            UserPassword: plainPassword,
                            SupportEmail: "alco@support.com",
                            YourCompanyName: "Al-and-co",
                            LoginLink: `https://app.arslanlarik.com/auth?email=${cleanEmail}&password=${plainPassword}`,
                        },
                    });
                } catch (emailErr) {
                    console.error("Credentials email failed:", emailErr.message);
                }
            }

            await logAudit({
                req,
                action: "LEAD_BULK_IMPORTED",
                module: "leads",
                targetId: lead._id,
                after: lead.toObject(),
            });

            created.push(lead);
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