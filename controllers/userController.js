const User = require("../models/userModel.js");
const bcrypt = require("bcryptjs");

// ✅ GET ALL USERS 
// exports.getAllUsers = async (req, res) => {
//   try {
//     const requesterRole = req.user.role;

//     let query = {};

//     if (requesterRole === "admin") {
//       // Admin: see all except admins
//       query = {
//         role: { $nin: ["super_admin", "admin"] },
//       };
//     }
//     else if (requesterRole === "sales_manager") {
//       // Sales manager: see only reps + normal users
//       query = {
//         role: { $in: ["sales_rep", "user"] },
//       };
//     }
//     // super_admin → no query filter (see all)

//     const users = await User.find(query).select("-password");

//     res.status(200).json({
//       success: true,
//       count: users.length,
//       users,
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
exports.getAllUsers = async (req, res) => {
  try {
    const requesterRole = req.user.role;
    const { page = 1, limit = 10, search, role } = req.query;

    let query = {};

    if (requesterRole === "admin") {
      query.role = { $nin: ["super_admin", "admin"] };
    } else if (requesterRole === "sales_manager") {
      query.role = { $in: ["sales_rep", "user"] };
    }
    // super_admin → no restriction

    // ── Role filter (sales_manager apne allowed roles ke andar hi filter kar sake) ──
    if (role) {
      if (requesterRole === "sales_manager") {
        if (["sales_rep", "user"].includes(role)) query.role = role;
      } else {
        query.role = role;
      }
    }

        // ── Search ──
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ GET OWN PROFILE
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ UPDATE OWN PROFILE
// exports.updateProfile = async (req, res) => {
//   try {
//     const { name } = req.body;

//     const user = await User.findByIdAndUpdate(
//       req.user.id,
//       { name },
//       { new: true }
//     ).select("-password");

//     res.status(200).json({
//       success: true,
//       user,
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
exports.updateProfile = async (req, res) => {
  try {
    const {
      name,
      fatherHusbandName,
      cnic,
      bankAccountNumber,
      currentAddress,
      emergencyContactName,
      emergencyContactPhone,
      occupation,
    } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (fatherHusbandName !== undefined) updateData.fatherHusbandName = fatherHusbandName;
    if (cnic !== undefined) updateData.cnic = cnic;
    if (bankAccountNumber !== undefined) updateData.bankAccountNumber = bankAccountNumber;
    if (currentAddress !== undefined) updateData.currentAddress = currentAddress;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (occupation !== undefined) updateData.occupation = occupation;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select("-password");

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CHANGE PASSWORD
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id).select("+password");

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Old password incorrect" });
    }

    if (user.isTemporaryPassword) {
      user.isTemporaryPassword = false;
      await user.save();
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CHANGE Document
exports.uploadUserDocument = async (req, res) => {
  const { type, label, url, fileType } = req.body;

  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      $push: {
        documents: { type, label, url, fileType },
      },
    },
    { new: true }
  );

  res.json({ success: true, documents: user.documents });
};

// ✅ DELETE Document
exports.deleteUserDocument = async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      $pull: {
        documents: { _id: req.params.docId },
      },
    },
    { new: true }
  );

  res.json({ success: true, documents: user.documents });
};

// ✅ DELETE OWN ACCOUNT
exports.deleteMyAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};