import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import debugRoutes from "./routes/debug.js";
import documentRoutes from "./routes/documents.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(",") || "*",
    credentials: true,
  })
);
// Increase body size limit to 50MB to handle file uploads with base64 data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Some clients probe the API base URL to test connectivity.
// Provide a lightweight JSON response for /api and /api/health.
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Debug endpoint to check MongoDB data
app.get("/api/debug/users", async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection("users");
    const count = await collection.countDocuments();
    const users = await collection.find({}).limit(5).toArray();
    res.json({
      database: mongoose.connection.name,
      collection: "users",
      count,
      sample: users.map((u) => ({
        _id: u._id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        hireDate: u.hireDate,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export endpoint to get all users as JSON (for importing into MongoDB Compass)
app.get("/api/export/users", async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection("users");
    const users = await collection.find({}).toArray();
    
    // Remove MongoDB-specific fields for cleaner export
    const exportData = users.map((u) => {
      const user = { ...u };
      // Convert ObjectId to string for JSON export
      if (user._id) {
        user._id = user._id.toString();
      }
      return user;
    });
    
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="users-export.json"');
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api", documentRoutes); // Documents routes are now under /api/users/:id/credentials/:credential/documents

// Extract database name from connection string
let dbName = "login-app"; // default
if (mongoUri.includes("/")) {
  const parts = mongoUri.split("/");
  if (parts.length > 3) {
    const dbPart = parts[parts.length - 1].split("?")[0];
    if (dbPart && dbPart.trim() !== "") {
      dbName = dbPart.trim();
    }
  }
}

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    dbName: dbName,
  })
  .then(() => {
    console.log(`Connected to MongoDB - Database: ${mongoose.connection.name}`);
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  });

