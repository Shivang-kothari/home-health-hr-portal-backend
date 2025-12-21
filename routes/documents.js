import express from "express";
import mongoose from "mongoose";
import Document from "../models/Document.js";
import User from "../models/User.js";
import { GridFSBucket } from "mongodb";

const router = express.Router();

// Initialize GridFS
let gridfsBucket;

const initGridFS = () => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      // Connection is open
      gridfsBucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: "documents",
      });
      console.log("✅ GridFS initialized for documents");
      return true;
    } else {
      console.warn("⚠️ MongoDB connection not ready. State:", mongoose.connection.readyState);
      return false;
    }
  } catch (error) {
    console.error("❌ Error initializing GridFS:", error);
    return false;
  }
};

// Initialize when connection is ready
if (mongoose.connection.readyState === 1) {
  initGridFS();
} else {
  mongoose.connection.once("open", () => {
    console.log("📡 MongoDB connection opened, initializing GridFS...");
    initGridFS();
  });
}

// Test route to verify documents API is accessible
router.get("/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Documents API is working",
    gridfsInitialized: !!gridfsBucket,
    mongoState: mongoose.connection.readyState
  });
});

// GET /api/files/:id - Download file from GridFS (direct GridFS fileId)
router.get("/files/:id", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    console.log(`📥 Downloading file from GridFS: ${fileId}`);

    // Ensure GridFS is initialized
    if (!gridfsBucket) {
      initGridFS();
      if (!gridfsBucket) {
        return res.status(503).json({ success: false, message: "File storage not available" });
      }
    }

    // Try to download directly from GridFS using fileId
    const downloadStream = gridfsBucket.openDownloadStream(fileId);

    downloadStream.on("error", (error) => {
      console.error("Error streaming file from GridFS:", error);
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: "File not found" });
      }
    });

    // Get file metadata for headers
    downloadStream.on("file", (file) => {
      res.setHeader("Content-Type", file.contentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.filename || 'document')}"`);
      res.setHeader("Content-Length", file.length);
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error in GET /files/:id:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Error fetching file" });
    }
  }
});

// GET /api/documents/:documentId/file - Download file from GridFS (via Document model)
router.get("/documents/:documentId/file", async (req, res) => {
  try {
    const { documentId } = req.params;

    // Ensure GridFS is initialized
    if (!gridfsBucket) {
      initGridFS();
    }

    // Find document metadata
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Use the fileId from document to download from GridFS
    const fileId = document.fileId;
    const downloadStream = gridfsBucket.openDownloadStream(fileId);

    downloadStream.on("error", (error) => {
      console.error("Error streaming file:", error);
      if (!res.headersSent) {
        res.status(404).json({ success: false, message: "File not found in storage" });
      }
    });

    // Get file metadata for headers
    downloadStream.on("file", (file) => {
      res.setHeader("Content-Type", file.contentType || document.type || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(document.name)}"`);
      res.setHeader("Content-Length", file.length);
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("Error in GET /documents/:documentId/file:", error);
    res.status(500).json({ message: "Error downloading file", error: error.message });
  }
});

// GET /api/users/:id/credentials/:cred/documents - Test route (for debugging)
router.get("/users/:id/credentials/:cred/documents", (req, res) => {
  res.json({
    success: true,
    message: "✅ Route is working! Use POST method to upload files.",
    route: `/api/users/:id/credentials/:cred/documents`,
    method: "POST",
    params: req.params,
    example: {
      url: `/api/users/${req.params.id}/credentials/${req.params.cred}/documents`,
      method: "POST",
      body: {
        name: "example.pdf",
        data: "base64encodeddata...",
        type: "application/pdf",
        size: 1024
      }
    }
  });
});

// POST /api/users/:id/credentials/:cred/documents - Upload a new document
router.post("/users/:id/credentials/:cred/documents", async (req, res) => {
  try {
    const { id, cred } = req.params;
    const { name, data, type, size } = req.body;

    console.log("📤 POST /api/users/:id/credentials/:cred/documents - Received upload request");
    console.log("Params:", { id, cred });
    console.log("Body:", { name: !!name, data: !!data, type, size });

    if (!name || !data) {
      console.error("❌ Missing required fields:", { name: !!name, data: !!data });
      return res.status(400).json({
        success: false,
        message: "File name or data missing",
      });
    }

    // Ensure GridFS is initialized
    if (!gridfsBucket) {
      initGridFS();
      if (!gridfsBucket) {
        return res.status(503).json({
          success: false,
          message: "File storage not available",
        });
      }
    }

    // Verify user exists (optional check - can be removed for faster uploads)
    // const user = await User.findById(id);
    // if (!user) {
    //   return res.status(404).json({ success: false, message: "User not found" });
    // }

    // Convert base64 to buffer
    const buffer = Buffer.from(data, "base64");

    // Upload to GridFS
    const uploadStream = gridfsBucket.openUploadStream(name, {
      contentType: type || "application/octet-stream",
    });

    uploadStream.end(buffer);

    uploadStream.on("finish", async () => {
      try {
        const fileId = uploadStream.id;
        // Create document metadata (for our hybrid system)
        const document = new Document({
          userId: id,
          credentialName: cred,
          name,
          type: type || "",
          size: size || buffer.length,
          fileId: fileId,
        });

        await document.save();

        res.json({
          success: true,
          fileId: fileId, // GridFS fileId - use this to download directly
          name: name,
          type: type || "",
          size: size || buffer.length,
          document: document.toPublicJSON(), // Include full document for frontend
        });
      } catch (error) {
        console.error("Error saving document metadata:", error);
        // Try to delete orphaned file
        try {
          await gridfsBucket.delete(uploadStream.id);
        } catch (deleteError) {
          console.error("Error deleting orphaned file:", deleteError);
        }
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Upload failed",
          });
        }
      }
    });

    uploadStream.on("error", (error) => {
      console.error("UPLOAD ERROR:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Upload failed",
        });
      }
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Upload failed",
      });
    }
  }
});

// GET /api/documents/user/:userId/credential/:credentialName - Get all documents for a credential
router.get("/user/:userId/credential/:credentialName", async (req, res) => {
  try {
    const { userId, credentialName } = req.params;

    const documents = await Document.find({ userId, credentialName }).sort({ uploadedAt: -1 });

    res.json({
      success: true,
      documents: documents.map((doc) => doc.toPublicJSON()),
    });
  } catch (error) {
    console.error("Error in GET /user/:userId/credential/:credentialName:", error);
    res.status(500).json({ message: "Error fetching documents", error: error.message });
  }
});

// DELETE /api/documents/:documentId - Delete a document
router.delete("/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;

    // Ensure GridFS is initialized
    if (!gridfsBucket) {
      initGridFS();
    }

    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Delete from GridFS
    try {
      await gridfsBucket.delete(document.fileId);
    } catch (error) {
      console.error("Error deleting file from GridFS:", error);
      // Continue to delete metadata even if GridFS delete fails
    }

    // Delete metadata
    await Document.findByIdAndDelete(documentId);

    res.json({ success: true, message: "Document deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /:documentId:", error);
    res.status(500).json({ message: "Error deleting document", error: error.message });
  }
});

export default router;

