// const mongoose = require("mongoose");

// let cached = global.mongoose;

// if (!cached) {
//   cached = global.mongoose = { conn: null, promise: null };
// }

// async function connectDB() {
//   if (cached.conn) return cached.conn;

//   if (!cached.promise) {
//     cached.promise = mongoose.connect(process.env.ATLAS_URL, {
//       serverSelectionTimeoutMS: 10000,
//       // useNewUrlParser: true,
//       // useUnifiedTopology: true,
//     });
//   }

//   cached.conn = await cached.promise;
//   return cached.conn;
// }

// module.exports = connectDB;
const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.ATLAS_URL, {
        dbName: "alcoCRM",
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
      })
      .then((conn) => {
        console.log("Database Connected Successfully");
        return conn;
      })
      .catch((err) => {
        console.error("DB connection failed:", err.message);
        cached.promise = null; // ✅ Reset so next request can retry
        cached.conn = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
