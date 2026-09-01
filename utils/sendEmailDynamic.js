// const nodemailer = require("nodemailer");

// // ✅ JS templates — Vercel pe fs ki zaroorat nahi
// const templates = {
//     "user-update-admin": require("../template/user-update-admin.js"),
//     "user-password-update-admin": require("../template/user-password-update-admin.js"),
//     "user-role-update-admin": require("../template/user-role-update-admin.js"),
//     "send-user-credentials": require("../template/send-user-credentials.js"),
//     "lead-status-update": require("../template/lead-status-update.js"),
//     "lead-activity-added": require("../template/lead-activity-added.js"),
//     "lead-converted": require("../template/lead-converted.js"),
//     "lead-lost": require("../template/lead-lost.js"),
//     "generate-invoice": require("../template/generate-invoice.js"),
//     "lead-interested": require("../template/lead-interested.js"),
//     "payment-plan-updated": require("../template/payment-plan-updated.js"),
//     "contract-submitted": require("../template/contract-submitted.js"),
//     "send-invoice": require("../template/send-invoice.js"),
//     "send-receipt-receiving": require("../template/send-receipt-receiving.js"), 
//     "book-delivery": require("../template/book-delivery.js"),
// };

// const sendEmailDynamic = async (options) => {
//     const transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//             user: process.env.EMAIL_USER,
//             pass: process.env.EMAIL_PASS,
//         },
//     });

//     let htmlContent = "";

//     if (options.templateName && templates[options.templateName]) {
//         htmlContent = templates[options.templateName];

//         // ✅ {{Key}} placeholders replace karo
//         for (const key in options.replacements) {
//             htmlContent = htmlContent.replace(
//                 new RegExp(`{{${key}}}`, "g"),
//                 options.replacements[key]
//             );
//         }
//     }

//     const mailOptions = {
//         from: `"${process.env.EMAIL_USER || "AL&CO"}" <${process.env.EMAIL_USER}>`,
//         to: options.to,
//         subject: options.subject,
//         html: htmlContent || undefined,
//         text: options.text || undefined,
//     };

//     await transporter.sendMail(mailOptions);
// };

// module.exports = sendEmailDynamic;
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const templates = {
    "user-update-admin": require("../template/user-update-admin.js"),
    "user-password-update-admin": require("../template/user-password-update-admin.js"),
    "user-role-update-admin": require("../template/user-role-update-admin.js"),
    "send-user-credentials": require("../template/send-user-credentials.js"),
    "lead-status-update": require("../template/lead-status-update.js"),
    "lead-activity-added": require("../template/lead-activity-added.js"),
    "lead-converted": require("../template/lead-converted.js"),
    "lead-lost": require("../template/lead-lost.js"),
    "generate-invoice": require("../template/generate-invoice.js"),
    "lead-interested": require("../template/lead-interested.js"),
    "payment-plan-updated": require("../template/payment-plan-updated.js"),
    "contract-submitted": require("../template/contract-submitted.js"),
    "send-invoice": require("../template/send-invoice.js"),
    "send-receipt-receiving": require("../template/send-receipt-receiving.js"),
    "book-delivery": require("../template/book-delivery.js"),
    "receiving-report-admin": require("../template/receiving-report-admin.js"),
    "payments-report-admin": require("../template/payments-report-admin.js"),
    "generate-receiving-invoice": require("../template/generate-receiving-invoice.js"),
};

const sendEmailDynamic = async (options) => {
    let htmlContent = "";

    if (options.templateName && templates[options.templateName]) {
        htmlContent = templates[options.templateName];

        for (const key in options.replacements) {
            htmlContent = htmlContent.replace(
                new RegExp(`{{${key}}}`, "g"),
                options.replacements[key]
            );
        }
    }

    await resend.emails.send({
        // from: `${process.env.EMAIL_USER || "AL&CO"} <connect@arslanlarik.com>`,
        from: "AL&CO <connect@arslanlarik.com>",
        to: options.to,
        subject: options.subject,
        html: htmlContent || undefined,
        text: options.text || undefined,
    });
};

module.exports = sendEmailDynamic;