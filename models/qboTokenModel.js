const mongoose = require("mongoose");

const qboTokenSchema = new mongoose.Schema(
    {
        realmId: { type: String, required: true },
        accessToken: { type: String, required: true },
        refreshToken: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        environment: { type: String, enum: ["sandbox", "production"], required: true, unique: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("QboToken", qboTokenSchema);