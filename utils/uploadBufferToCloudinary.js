// utils/uploadBufferToCloudinary.js
const cloudinary = require("cloudinary").v2;

module.exports = function uploadBufferToCloudinary(buffer, { folder, filename }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto", public_id: filename?.replace(/\.[^/.]+$/, "") },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
};