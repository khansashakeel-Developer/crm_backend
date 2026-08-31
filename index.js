require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { initSocket } = require("./config/socket.js");
const cors = require("cors");
const session = require("express-session");
require("./jobs/payment/paymentCron.js");

const passport = require("./config/passport.js");

// Routes
const authRoute = require("./routes/authRoute.js");
const userRoute = require("./routes/userRoute.js");
const adminRoute = require("./routes/adminRoute.js");
const enrollmentRoute = require("./routes/enrollmentRoute.js");
const financeRoute = require("./routes/financeRoute.js");
const accessRoute = require("./routes/accessRoute.js");
const leadRoute = require("./routes/leadRoute.js");
const programRoute = require("./routes/programRoute.js");
const auditRoute = require("./routes/auditRoute.js");
const lmsRouter = require("./routes/lmsRoute.js");
const instructorRouter = require("./routes/lmsInstructorRoute.js");
const lmsAdminRoute = require("./routes/lmsAdminRoute.js");
const blogRoute = require("./routes/blogRoute.js");
const seoRoute = require("./routes/seoMetaRoutes.js");
const notificationRoute = require("./routes/notificationRoute.js");
const accountRoute = require("./routes/accountRoute.js");
const reportRoute = require("./routes/reportRoute.js");
const guideRoute = require("./routes/guideRoutes.js");
const audioFileAccessRoute = require("./routes/audioFileAccessRoutes.js");
const visitorRoute = require("./routes/visitorRoute.js");
const webinarRoute = require("./routes/webinarRoute.js");
const qboRoute = require("./routes/qboRoutes.js");


const connectDB = require("./config/db.js");

const app = express();
const httpServer = createServer(app); // ← express ko http server mein wrap karo

// ✅ Socket.io init — httpServer pe, app pe nahi
initSocket(httpServer);


// ======================
// ✅ CORS CONFIG (FIXED)
// ======================
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://alco-crm-frontend.vercel.app",
  "https://alco-cms-website.vercel.app",
  "https://arslanlarik.com",
  "https://app.arslanlarik.com",
  "https://www.arslanlarik.com",
  "https://portal.arslanlarik.com",
];

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       // allow requests without origin (like Postman)
//       if (!origin || allowedOrigins.includes(origin)) {
//         return callback(null, true);
//       }
//       return callback(new Error("CORS not allowed: " + origin));
//     },
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ✅ Preflight (VERY IMPORTANT)
// app.options("*", cors(corsOptions)); // ✅ same config
app.options(/.*/, cors(corsOptions));
// ✅ Preflight (VERY IMPORTANT)
// app.options("*", cors());


// ======================
// ✅ BODY PARSER
// ======================
app.use(express.json());


// ======================
// ✅ SESSION & PASSPORT
// ======================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());


// ======================
// ✅ DB CONNECT (SMART WAY)
// ======================
app.use(async (req, res, next) => {
  try {
    if (!global.mongoose?.conn) {
      await connectDB(); // cached connection reuse karega
    }
    next();
  } catch (err) {
    console.error("DB Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});


// ======================
// ✅ ROUTES
// ======================
app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/admin", adminRoute);
app.use("/api/v1/enrollments", enrollmentRoute);
app.use("/api/v1/finance", financeRoute);
app.use("/api/v1/access", accessRoute);
app.use("/api/v1/leads", leadRoute);
app.use("/api/v1/programs", programRoute);
app.use("/api/v1/audit-logs", auditRoute);
app.use("/api/v1/blogs", blogRoute);
app.use("/api/v1/seo", seoRoute);
// Student LMS routes
app.use("/api/v1/learn", lmsRouter);

// Instructor routes
app.use("/api/v1/instructor", instructorRouter);

// Admin LMS content management
app.use("/api/v1/lms", lmsAdminRoute);

app.use("/api/v1/notifications", notificationRoute);

// Admin Account Routes
app.use("/api/v1/accounts", accountRoute);
app.use("/api/v1/reports", reportRoute);
app.use("/api/v1/guides", guideRoute);
app.use("/api/v1/audio-access", audioFileAccessRoute);

//chatbot visitor routes
app.use("/api/v1/visitors", visitorRoute);
app.use('/api/webinars', webinarRoute);
app.use("/api/qbo", qboRoute);

// ======================
// ✅ HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "ALCO CRM Backend Running Successfully",
  });
});


// ======================
// ✅ SERVER START (LOCAL ONLY)
// ======================
if (process.env.NODE_ENV !== "production") {
  connectDB()
    .then(() => {
      console.log("Database Connected");
      app.listen(process.env.PORT || 5000, () => {
        console.log(
          `Server running on http://localhost:${process.env.PORT || 5000}`
        );
      });
    })
    .catch((err) => console.error("DB Error:", err));
}


// ======================
module.exports = app;