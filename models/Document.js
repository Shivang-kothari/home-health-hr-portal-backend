import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Index for faster queries
    },
    credentialName: {
      type: String,
      required: true,
      index: true, // Index for faster queries
    },
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String, // MIME type
      default: "",
    },
    size: {
      type: Number, // file size in bytes
      default: 0,
    },
    // GridFS file ID - stores the actual file data
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // URL if using external storage (S3, etc.)
    url: {
      type: String,
      default: "",
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for faster queries by userId and credentialName
documentSchema.index({ userId: 1, credentialName: 1 });

// Method to get file URL (GridFS or external storage)
documentSchema.methods.getFileUrl = function getFileUrl() {
  if (this.url) {
    return this.url; // External storage (S3, etc.)
  }
  // GridFS URL - will be handled by route
  return `/api/documents/${this._id}/file`;
};

// Method to convert to JSON (exclude fileId for security)
documentSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    _id: this._id,
    userId: this.userId,
    credentialName: this.credentialName,
    name: this.name,
    type: this.type,
    size: this.size,
    url: this.getFileUrl(),
    uploadedAt: this.uploadedAt,
  };
};

const Document = mongoose.model("Document", documentSchema);

export default Document;

