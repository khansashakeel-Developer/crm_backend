const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail.js");
const User = require("../models/userModel.js");
const sendEmailDynamic = require("../utils/sendEmailDynamic.js");
const generateColor = require("../utils/generateColor");
// controllers/adminController.js mein add karo
const ExcelJS = require("exceljs");

// ✅ EXCEL IMPORT — name, email, phone
exports.bulkImportUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Excel file required" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header skip

      const name = row.getCell(1).text?.trim();
      const email = row.getCell(2).text?.trim().toLowerCase();
      const phone = row.getCell(3).text?.trim();

      if (name && email) {
        rows.push({ name, email, phone: phone || null });
      }
    });

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: "No valid rows found" });
    }

    // ✅ file ke andar hi duplicate emails remove (last occurrence rakho)
    const uniqueMap = new Map();
    rows.forEach((r) => uniqueMap.set(r.email, r));
    const uniqueRows = Array.from(uniqueMap.values());

    // ✅ DB mein already existing emails check
    const emails = uniqueRows.map((r) => r.email);
    const existingUsers = await User.find({ email: { $in: emails } }).select("email");
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const toInsert = uniqueRows.filter((r) => !existingEmails.has(r.email));
    const skipped = uniqueRows.filter((r) => existingEmails.has(r.email));

    const docs = toInsert.map((r) => ({
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: "user",
      source: "enroll",
      is_old_user: true,
      needsAccountSetup: true,
      isVerified: false,
      isActive: true,
      isPaid: false,
      avatarColor: generateColor(r.email),
    }));

    const inserted = docs.length > 0 ? await User.insertMany(docs, { ordered: false }) : [];

    res.status(200).json({
      success: true,
      totalRows: rows.length,
      importedCount: inserted.length,
      skippedCount: skipped.length,
      skippedEmails: skipped.map((s) => s.email),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ JSON BULK IMPORT — old users (aapke sample structure ke liye)
// exports.bulkImportOldUsers = async (req, res) => {
//   try {
//     const { users } = req.body; // array of objects

//     if (!Array.isArray(users) || users.length === 0) {
//       return res.status(400).json({ success: false, message: "users array required" });
//     }

//     // ✅ schema fields tak restrict — extra keys (country, notes waghera) drop
//     const cleaned = users
//       .filter((u) => u.name && u.email)
//       .map((u) => ({
//         name: u.name,
//         email: String(u.email).trim().toLowerCase(),
//         phone: u.phone || null,
//         source: u.source || "enroll",
//         role: u.role || "user",
//         is_old_user: true,
//         needsAccountSetup: true,
//         isVerified: false,
//         isActive: u.isActive ?? true,
//         isPaid: u.isPaid ?? false,
//         avatarColor: generateColor(u.email),
//       }));

//     const uniqueMap = new Map();
//     cleaned.forEach((r) => uniqueMap.set(r.email, r));
//     const uniqueRows = Array.from(uniqueMap.values());

//     const emails = uniqueRows.map((r) => r.email);
//     const existingUsers = await User.find({ email: { $in: emails } }).select("email");
//     const existingEmails = new Set(existingUsers.map((u) => u.email));

//     const toInsert = uniqueRows.filter((r) => !existingEmails.has(r.email));
//     const skipped = uniqueRows.filter((r) => existingEmails.has(r.email));

//     const inserted = toInsert.length > 0 ? await User.insertMany(toInsert, { ordered: false }) : [];

//     res.status(200).json({
//       success: true,
//       totalRows: users.length,
//       importedCount: inserted.length,
//       skippedCount: skipped.length,
//       skippedEmails: skipped.map((s) => s.email),
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// ✅ GET ALL USERS
exports.getAllUsers = async (req, res) => {
  try {
    const requesterRole = req.user.role;

    const { page = 1, limit = 10, search = "", role } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // 🔐 Role-based access control
    if (requesterRole === "admin") {
      query.role = { $nin: ["super_admin", "admin"] };
    }

    // 🔎 Search by name, email, phone
    if (search) {
      const searchTerm = search.trim();

      // split by whitespace, remove empty strings
      const words = searchTerm.split(/\s+/).filter(Boolean);

      // each word must match somewhere in name/email/phone
      const wordConditions = words.map((word) => {
        const wordRegex = new RegExp(word, "i");
        return {
          $or: [
            { name: wordRegex },
            { email: wordRegex },
            { phone: wordRegex },
          ],
        };
      });

      const searchClause = { $and: wordConditions };

      if (query.role) {
        query = {
          $and: [{ role: query.role }, searchClause],
        };
      } else {
        query = { ...query, ...searchClause };
      }
    }

    // 🎯 Filter by role (optional, only when not already restricted by search $and)
    if (role) {
      if (query.$and) {
        query.$and.push({ role });
      } else {
        query.role = query.role ? { ...query.role, $eq: role } : role;
      }
    }

    const users = await User.find(query)
      .select("-password")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ GET ALL Assign Roles
exports.getAllAssignRole = async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {
      role: {
        $in: [
          "super_admin",
          "admin",
          "sales_manager",
          "sales_rep",
        ],
      },
    };

    if (search) {
      const regex = new RegExp(search, "i");

      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ GET USER BY ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Admin super_admin ya admin ko nahi dekh sakta
    if (
      req.user.role === "admin" &&
      (user.role === "super_admin" || user.role === "admin")
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ UPDATE ANY USER
exports.updateUser = async (req, res) => {
  try {

    // ❌ Password is blocked here — use /change-password route
    const { password, ...updateFields } = req.body;

    if (password) {
      return res.status(400).json({
        success: false,
        message: "Password change not allowed here. Use /change-password route.",
      });
    }

    const existingUser = await User.findById(req.params.id);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("Existing User:", existingUser);
    console.log("Update Fields:", updateFields);

    // ✅ Detect which fields actually changed
    const changedFields = [];
    for (const key of Object.keys(updateFields)) {
      if (String(existingUser[key]) !== String(updateFields[key])) {
        changedFields.push({
          field: key,
          oldValue: existingUser[key] ?? "N/A",
          newValue: updateFields[key],
        });
      }
    }

    // ✅ Save updated user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true }
    ).select("-password");

    // ✅ Send email only if something actually changed
    if (changedFields.length > 0) {
      const changedRows = changedFields
        .map(
          (c) => `
          <tr>
            <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0;
              border-right:1px solid #e2e8f0; font-weight:600; color:#1a202c;
              text-transform:capitalize;">${c.field}</td>
            <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0;
              border-right:1px solid #e2e8f0; color:#A32D2D;
              text-decoration:line-through;">${c.oldValue}</td>
            <td style="padding:9px 12px; border-bottom:1px solid #e2e8f0;
              color:#0F6E56; font-weight:600;">${c.newValue}</td>
          </tr>
        `
        )
        .join("");

      await sendEmailDynamic({
        to: existingUser.email,
        subject: "Account Details Updated ✏️",
        templateName: "user-update-admin",
        replacements: {
          UserName: existingUser.name,
          ChangedRows: changedRows,
          SupportEmail: "connect@arslanlarik.com",
          YourCompanyName: "Al-and-co",
        },
      });
    }

    res.status(200).json({
      success: true,
      user: updatedUser,
      notified: changedFields.length > 0,
      changedFields: changedFields.map((c) => c.field),
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ DELETE USER BY ID
exports.deleteUserById = async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);

    if (!userToDelete) {
      return res.status(404).json({ message: "User not found" });
    }

    const requesterRole = req.user.role;

    // ✅ Admin, super_admin ya kisi bhi admin ko delete nahi kar sakta
    if (requesterRole === "admin") {
      if (
        userToDelete.role === "super_admin" ||
        userToDelete.role === "admin"
      ) {
        return res.status(403).json({
          message: "You cannot delete an admin or super admin",
        });
      }
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ DELETE ALL USERS
exports.deleteAllUsers = async (req, res) => {
  try {
    const requesterRole = req.user.role;

    if (requesterRole === "super_admin") {
      // ✅ Super admin — sab delete kar sakta hai
      await User.deleteMany({});
    } else if (requesterRole === "admin") {
      // ✅ Admin — sirf non-admin users delete kar sakta hai
      await User.deleteMany({
        role: { $nin: ["super_admin", "admin"] },
      });
    } else {
      return res.status(403).json({ message: "Not authorized" });
    }

    res.status(200).json({
      success: true,
      message: "Users deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CREATE USER (ADMIN)
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // ✅ Duplicate check
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // ✅ Role validation
    const allowedRoles = ["super_admin", "admin", "sales_manager", "sales_rep", "support", "instructor", "finance_manager", "user", "seo"];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarColor = generateColor(email);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "user",
      isVerified: true,
      avatarColor,
      isPlayable: false,
      isTemporaryPassword: true
    });

    // Send email with user credentials after creation
    await sendEmailDynamic({
      to: email,
      subject: "Your Account Credentials 🔑",
      templateName: "send-user-credentials",
      replacements: {
        UserName: name,
        UserEmail: email,
        UserPassword: password,  // Use the plain password here
        SupportEmail: "alco@support.com",
        YourCompanyName: "Al-and-co",
        LoginLink: "https://app.arslanlarik.com/auth?email=" + email + "&password=" + password,
      },
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ✅ ASSIGN ROLE
exports.assignRole = async (req, res) => {
  try {
    const { role } = req.body;

    const allowedRoles = [
      "super_admin",
      "admin",
      "sales_manager",
      "sales_rep",
      "support",
      "finance_manager",
      "user"
    ];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    // ✅ Pehle existing user fetch karo — oldRole ke liye
    const existingUser = await User.findById(req.params.id);

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldRole = existingUser.role;

    // ✅ Role update karo
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select("-password");
    //  if (!user) {
    //   return res.status(404).json({ message: "User not found" }); }
    // ✅ Email bhejo agar role actually change hua
    if (oldRole !== role) {
      await sendEmailDynamic({
        to: user.email,
        subject: "Your Account Role Has Been Updated 🔑",
        templateName: "user-role-update-admin",
        replacements: {
          UserName: user.name,
          OldRole: oldRole,
          NewRole: role,
          SupportEmail: "alco@support.com",
          YourCompanyName: "Al-and-co",
        },
      });
    }

    res.status(200).json({
      success: true,
      message: `Role updated to ${role}`,
      user,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CHANGE USER PASSWORD 
exports.changeUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    await sendEmailDynamic({
      to: user.email,
      subject: "Password Changed 🔐",
      templateName: "user-password-update-admin",
      replacements: {
        UserName: user.name,
        ChangedBy: "Admin",
        DateTime: new Date().toLocaleString(),
        SupportEmail: "connect@arslanlarik.com",
        YourCompanyName: "Al-and-co",
      },
    });

    res.status(200).json({
      success: true,
      message: `Password updated. Notification sent to ${user.email}`,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getAdminRecipients = async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } })
      .select("name email role")
      .lean();

    res.json({ success: true, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};