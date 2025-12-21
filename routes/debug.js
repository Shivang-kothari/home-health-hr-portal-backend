import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// Detailed MongoDB connection info
router.get("/connection", async (_req, res) => {
  try {
    const connection = mongoose.connection;
    const db = connection.db;
    
    // Get all databases
    const adminDb = db.admin();
    const dbList = await adminDb.listDatabases();
    
    // Get collections in current database
    const collections = await db.listCollections().toArray();
    
    // Get user count
    const userCount = await db.collection("users").countDocuments();
    
    res.json({
      connection: {
        name: connection.name,
        host: connection.host,
        port: connection.port,
        readyState: connection.readyState, // 1 = connected
      },
      currentDatabase: connection.name,
      allDatabases: dbList.databases.map((d) => ({
        name: d.name,
        size: d.sizeOnDisk,
      })),
      collections: collections.map((c) => c.name),
      users: {
        collection: "users",
        count: userCount,
      },
      connectionString: process.env.MONGODB_URI,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

