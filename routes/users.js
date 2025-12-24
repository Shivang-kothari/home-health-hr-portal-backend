import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import User from "../models/User.js";
import Document from "../models/Document.js";
import { withCredentialDefaults } from "../utils/credentials.js";

const router = express.Router();

const sanitize = (user) => user.toPublicJSON();

const getDocumentsBucket = () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
  return new GridFSBucket(mongoose.connection.db, { bucketName: "documents" });
};

router.get("/", async (req, res) => {
  try {
    const excludeFiles = req.query.excludeFiles === 'true';
    
    if (excludeFiles) {
      // Optimized: exclude file data for list views
      const users = await User.find().select("-password");
      const usersWithoutFiles = users.map(user => user.toPublicJSONWithoutFiles());
      res.json(usersWithoutFiles);
    } else {
      // Full data: include files (for detail views)
      const users = await User.find().select("-password");
      const usersWithFiles = users.map(user => user.toPublicJSON());
      res.json(usersWithFiles);
    }
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Log credentials before sanitizing (including files)
    if (user.credentials instanceof Map) {
      console.log(`📥 GET /:id - User credentials Map size:`, user.credentials.size);
      user.credentials.forEach((value, key) => {
        const filesCount = value?.files?.length || 0;
        console.log(`📥 GET /:id - Credential "${key}":`, {
          hasDate: !!value?.date,
          date: value?.date ? (value.date instanceof Date ? value.date.toISOString() : value.date) : null,
          notes: value?.notes,
          filesCount: filesCount
        });
        if (filesCount > 0) {
          console.log(`📥 GET /:id - Credential "${key}" files:`, value.files.map(f => typeof f === 'string' ? f : f.name));
        }
      });
    } else {
      console.log(`⚠️ GET /:id - User credentials is NOT a Map:`, typeof user.credentials, user.credentials);
    }
    
    // Use toPublicJSON to ensure credentials Map is converted to object (includes files)
    const response = sanitize(user);
    
    // Verify files are in response
    if (response.credentials) {
      Object.keys(response.credentials).forEach(key => {
        const files = response.credentials[key]?.files || [];
        if (files.length > 0) {
          console.log(`📤 GET /:id - Response credential "${key}" has ${files.length} files`);
        }
      });
    }
    
    // CRITICAL: Ensure the fields are always in the GET response
    // Use the actual user values from the database, not the response
    response.ssn = (user.ssn !== undefined && user.ssn !== null) ? String(user.ssn) : "";
    response.mobileNumber = (user.mobileNumber !== undefined && user.mobileNumber !== null) ? String(user.mobileNumber) : "";
    response.address = (user.address !== undefined && user.address !== null) ? String(user.address) : "";
    response.street = (user.street !== undefined && user.street !== null) ? String(user.street) : "";
    response.suiteApt = (user.suiteApt !== undefined && user.suiteApt !== null) ? String(user.suiteApt) : "";
    response.city = (user.city !== undefined && user.city !== null) ? String(user.city) : "";
    response.state = (user.state !== undefined && user.state !== null) ? String(user.state) : "";
    response.zipCode = (user.zipCode !== undefined && user.zipCode !== null) ? String(user.zipCode) : "";
    response.dateOfBirth = user.dateOfBirth || null;
    
    // Reduced logging for performance
    // console.log(`📥 GET /:id - Response credentials count:`, Object.keys(response.credentials || {}).length);
    // console.log(`📥 GET /:id - CRITICAL FIELDS:`, {
    //   ssn: response.ssn,
    //   mobileNumber: response.mobileNumber,
    //   address: response.address,
    //   street: response.street,
    //   suiteApt: response.suiteApt,
    //   city: response.city,
    //   state: response.state,
    //   zipCode: response.zipCode,
    //   dateOfBirth: response.dateOfBirth
    // });
    
    res.json(response);
  } catch (error) {
    console.error("Fetch user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      userName,
      password,
      position,
      status,
      hireDate,
      ssn,
      mobileNumber,
      address,
      street,
      suiteApt,
      city,
      state,
      zipCode,
      dateOfBirth,
      credentials,
    } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    // Convert date strings to Date objects if provided
    // Parse YYYY-MM-DD format as local date to avoid timezone issues
    let hireDateObj = undefined;
    let dateOfBirthObj = undefined;
    
    if (hireDate && typeof hireDate === "string" && hireDate.trim() !== "") {
      const dateStr = hireDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        hireDateObj = new Date(year, month - 1, day);
      } else {
        hireDateObj = new Date(hireDate);
      }
    }
    
    if (dateOfBirth && typeof dateOfBirth === "string" && dateOfBirth.trim() !== "") {
      const dateStr = dateOfBirth.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        dateOfBirthObj = new Date(year, month - 1, day);
      } else {
        dateOfBirthObj = new Date(dateOfBirth);
      }
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      userName,
      password: hashedPassword,
      position,
      status,
      hireDate: hireDateObj,
      ssn,
      mobileNumber,
      address, // Keep for backward compatibility
      street,
      suiteApt,
      city,
      state,
      zipCode,
      dateOfBirth: dateOfBirthObj,
      credentials: withCredentialDefaults(credentials),
    });

    // Ensure data is written to disk
    await user.save();

    console.log(`✅ User created: ${user.email} (ID: ${user._id})`);
    res.status(201).json(sanitize(user));
  } catch (error) {
    console.error("Create user error:", error);
    const message = error.message || "Server error";
    res.status(500).json({ message, error: error.name });
  }
});

router.patch("/:id/credentials", async (req, res) => {
  try {
    const { credential, data } = req.body;
    if (!credential) {
      return res.status(400).json({ message: "Credential name is required" });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // CRITICAL: Ensure credentials is a Map
    // Mongoose uses a special Map type, so we need to handle it carefully
    let credentialsMap;
    
    if (!user.credentials) {
      console.log("🔄 Initializing empty credentials Map");
      credentialsMap = new Map();
      user.credentials = credentialsMap;
    } else if (user.credentials instanceof Map) {
      console.log(`✅ Credentials is already a Map with ${user.credentials.size} entries`);
      credentialsMap = user.credentials;
    } else {
      console.log("🔄 Converting user.credentials to Map in credentials endpoint");
      const existingCreds = user.credentials || {};
      // Create a new Map and populate it
      credentialsMap = new Map();
      if (typeof existingCreds === 'object' && existingCreds !== null) {
        Object.entries(existingCreds).forEach(([key, value]) => {
          credentialsMap.set(key, value);
        });
      }
      // Assign the Map to user.credentials
      user.credentials = credentialsMap;
    }
    
    // Verify it's a Map
    if (!(credentialsMap instanceof Map)) {
      console.error("❌ ERROR: credentialsMap is not a Map!");
      console.error("Type:", typeof credentialsMap, "Value:", credentialsMap);
      throw new Error("Failed to initialize credentials Map");
    }
    
    // Use credentialsMap for all operations
    console.log(`✅ Using credentialsMap with ${credentialsMap.size} entries`);

    const current = credentialsMap.get(credential) || {};
    
    // Normalize files from old format (strings) to new format (objects)
    // CRITICAL: Preserve id, fileId, and _id fields for GridFS documents
    const normalizeFiles = (files) => {
      if (!Array.isArray(files)) return [];
      return files.map(file => {
        // If already an object with proper structure, preserve ALL fields including id/fileId/_id
        if (typeof file === 'object' && file !== null && file.name !== undefined) {
          return {
            // CRITICAL: Preserve GridFS identifiers - these are needed for viewing files
            id: file.id || file.fileId || file._id || undefined,
            fileId: file.fileId || file.id || file._id || undefined,
            _id: file._id || file.id || file.fileId || undefined,
            // Standard file fields
            name: file.name || '',
            data: file.data || '',
            type: file.type || '',
            size: file.size || 0,
            uploadedAt: file.uploadedAt || '',
            // Preserve isDocument flag
            isDocument: file.isDocument !== undefined ? file.isDocument : (file.id || file.fileId || file._id ? true : false)
          };
        }
        // If string (old format), convert to object
        if (typeof file === 'string') {
          return {
            name: file,
            data: '',
            type: '',
            size: 0,
            uploadedAt: '',
            isDocument: false
          };
        }
        return file;
      });
    };
    
    // Normalize files from the request (frontend already merged existing + new)
    const normalizedFiles = normalizeFiles(data.files || current.files || []);
    
    // Convert date string to Date object if provided
    const credentialData = {
      ...current,
      ...data,
      files: normalizedFiles // Use normalized files
    };
    
    if (credentialData.date && typeof credentialData.date === "string" && credentialData.date.trim() !== "") {
      credentialData.date = new Date(credentialData.date);
      console.log(`📅 Credential date converted: "${data.date}" -> ${credentialData.date.toISOString()}`);
    } else if (credentialData.date === "" || !credentialData.date) {
      credentialData.date = null;
      console.log(`📅 Credential date set to null for ${credential}`);
    }

    console.log(`📁 Setting ${normalizedFiles.length} files for credential ${credential}`);
    if (normalizedFiles.length > 0) {
      console.log(`📁 File details:`, normalizedFiles.map(f => ({ name: f.name, hasData: !!f.data, dataLength: f.data?.length || 0 })));
    }
    
    // Set the credential data in the Map
    credentialsMap.set(credential, credentialData);
    
    // CRITICAL: Verify the data is in the Map before saving
    const verifyData = credentialsMap.get(credential);
    console.log(`🔍 Verifying credential data in Map:`, {
      hasFiles: !!verifyData?.files,
      filesCount: verifyData?.files?.length || 0,
      firstFileHasData: verifyData?.files?.[0]?.data ? verifyData.files[0].data.substring(0, 50) + '...' : 'no data'
    });
    
    // Ensure user.credentials points to the Map
    user.credentials = credentialsMap;
    
    // CRITICAL: Mark the entire credentials Map as modified, and also mark the specific credential
    user.markModified('credentials');
    // Also mark the nested credential field to ensure Mongoose tracks the change
    if (user.credentials instanceof Map) {
      user.credentials.set(credential, credentialData);
      // CRITICAL: Also mark the files array specifically for nested arrays in Maps
      const credValue = user.credentials.get(credential);
      if (credValue && credValue.files && credValue.files.length > 0) {
        // Mark the credential itself as modified
        user.markModified(`credentials.${credential}`);
        // Also try marking files specifically (for nested arrays)
        user.markModified(`credentials.${credential}.files`);
        console.log(`✅ Marked credential "${credential}" and its files array as modified`);
      }
    }
    
    // Verify before save
    const beforeSave = user.credentials instanceof Map ? user.credentials.get(credential) : user.credentials?.[credential];
    console.log(`🔍 Before save - credential data:`, {
      isMap: user.credentials instanceof Map,
      mapSize: user.credentials instanceof Map ? user.credentials.size : 'N/A',
      hasFiles: !!beforeSave?.files,
      filesCount: beforeSave?.files?.length || 0,
      files: beforeSave?.files?.map(f => typeof f === 'string' ? f : f.name) || []
    });
    
    // CRITICAL: Verify ALL credentials have their files before save
    if (user.credentials instanceof Map) {
      console.log(`🔍 Before save - All credentials in Map:`);
      user.credentials.forEach((value, key) => {
        const files = value?.files || [];
        if (files.length > 0) {
          console.log(`   "${key}": ${files.length} files`);
        }
      });
    }

    // CRITICAL: One final check - ensure files are still in the Map right before save
    const finalCheck = user.credentials instanceof Map ? user.credentials.get(credential) : user.credentials?.[credential];
    console.log(`🔍 Final check before save - credential data:`, {
      isMap: user.credentials instanceof Map,
      hasFiles: !!finalCheck?.files,
      filesCount: finalCheck?.files?.length || 0,
      files: finalCheck?.files?.map(f => typeof f === 'string' ? f : f.name) || []
    });
    
    // If files are missing, log error but continue (pre-save hook should restore them)
    if (finalCheck?.files?.length === 0 && normalizedFiles.length > 0) {
      console.error(`❌ CRITICAL: Files missing right before save! Expected ${normalizedFiles.length} files but found 0`);
      console.error(`   Attempting to restore files directly...`);
      // Try to restore directly
      if (user.credentials instanceof Map) {
        user.credentials.set(credential, {
          ...finalCheck,
          files: normalizedFiles
        });
        user.markModified('credentials');
        console.log(`   ✅ Restored ${normalizedFiles.length} files directly to Map`);
      }
    }

    await user.save();
    
    // Verify after save by reloading
    const savedUser = await User.findById(req.params.id);
    const afterSave = savedUser.credentials instanceof Map ? savedUser.credentials.get(credential) : savedUser.credentials?.[credential];
    console.log(`🔍 After save - credential data:`, {
      isMap: savedUser.credentials instanceof Map,
      hasFiles: !!afterSave?.files,
      filesCount: afterSave?.files?.length || 0,
      files: afterSave?.files?.map(f => typeof f === 'string' ? f : f.name) || []
    });
    
    // If files are still missing after save, this is a critical error
    if (afterSave?.files?.length === 0 && normalizedFiles.length > 0) {
      console.error(`❌❌❌ CRITICAL ERROR: Files were lost during save!`);
      console.error(`   Expected: ${normalizedFiles.length} files`);
      console.error(`   Got: 0 files`);
      console.error(`   This indicates the pre-save hook is not preserving files correctly.`);
    }
    
    console.log(`✅ Credential updated for user: ${user.email} - ${credential}`);
    res.json(sanitize(user));
  } catch (error) {
    console.error("Update credential error:", error);
    console.error("Error stack:", error.stack);
    console.error("Request body:", JSON.stringify(req.body, null, 2).substring(0, 500)); // Log first 500 chars
    const message = error.message || "Server error";
    res.status(500).json({ message, error: error.name, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

// DELETE /api/users/:id - Delete a user and associated documents/files
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id).select("_id email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find document metadata first so we can attempt GridFS cleanup.
    const documents = await Document.find({ userId: id })
      .select("_id fileId")
      .lean();

    const bucket = getDocumentsBucket();
    let deletedFiles = 0;
    let fileDeleteFailures = 0;
    let skippedFileDeletes = 0;

    if (!bucket && documents.length > 0) {
      skippedFileDeletes = documents.length;
      console.warn(
        "⚠️ GridFS not available; deleting metadata/user only. Orphaned files may remain."
      );
    } else if (bucket && documents.length > 0) {
      // Best-effort delete: continue even if individual deletions fail.
      await Promise.all(
        documents.map(async (doc) => {
          try {
            await bucket.delete(doc.fileId);
            deletedFiles += 1;
          } catch (err) {
            fileDeleteFailures += 1;
            console.error("Error deleting GridFS file:", err?.message || err);
          }
        })
      );
    }

    const deleteDocsResult = await Document.deleteMany({ userId: id });
    await User.findByIdAndDelete(id);

    res.json({
      success: true,
      deletedUserId: id,
      deletedDocuments: deleteDocsResult.deletedCount || 0,
      deletedFiles,
      fileDeleteFailures,
      skippedFileDeletes,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // CRITICAL: Ensure credentials is a Map (Mongoose may return it as plain object)
    // Don't convert here - we'll handle it when we actually need to update credentials
    // Converting here causes issues because Mongoose converts it back to object
    if (user.credentials && !(user.credentials instanceof Map)) {
      console.log("🔄 User.credentials is object (will convert when needed):", typeof user.credentials);
    } else if (user.credentials instanceof Map) {
      console.log("🔄 User.credentials is already a Map with", user.credentials.size, "entries");
    } else {
      console.log("🔄 User.credentials is empty/null");
    }

    const updates = { ...req.body };
    console.log("📥 Received update request for user ID:", req.params.id);
    console.log("📥 Update payload:", JSON.stringify(updates, null, 2));

    // Update basic fields - always update if provided in request
    // Use !== undefined to catch empty strings and null values
    // CRITICAL: Always set these fields even if empty string to ensure they're saved
    if (updates.firstName !== undefined) {
      user.firstName = updates.firstName || "";
      console.log(`✅ Setting firstName: "${user.firstName}"`);
    }
    if (updates.lastName !== undefined) {
      user.lastName = updates.lastName || "";
      console.log(`✅ Setting lastName: "${user.lastName}"`);
    }
    if (updates.email !== undefined) {
      user.email = updates.email || "";
      console.log(`✅ Setting email: "${user.email}"`);
    }
    if (updates.position !== undefined) {
      user.position = updates.position || "";
      console.log(`✅ Setting position: "${user.position}"`);
    }
    if (updates.status !== undefined) {
      user.status = updates.status || "active";
      console.log(`✅ Setting status: "${user.status}"`);
    }
    
    // CRITICAL: Always set these fields if they're in the update
    // This ensures SSN, Mobile Number, Address, and DOB are saved to database
    // Set the fields and explicitly mark them as modified to ensure they're saved
    if (updates.ssn !== undefined) {
      const oldSsn = user.ssn;
      user.ssn = String(updates.ssn || "");
      console.log(`✅ Setting ssn: "${user.ssn}" (was: "${oldSsn}")`);
    }
    if (updates.mobileNumber !== undefined) {
      const oldMobile = user.mobileNumber;
      user.mobileNumber = String(updates.mobileNumber || "");
      console.log(`✅ Setting mobileNumber: "${user.mobileNumber}" (was: "${oldMobile}")`);
    }
    if (updates.address !== undefined) {
      const oldAddress = user.address;
      user.address = String(updates.address || "");
      console.log(`✅ Setting address: "${user.address}" (was: "${oldAddress}")`);
    }
    
    // CRITICAL: Handle new address component fields - ALWAYS set if in updates
    // This is exactly like SSN - must be set and marked as modified
    if (updates.street !== undefined) {
      const oldStreet = user.street;
      user.street = String(updates.street || "");
      console.log(`✅ Setting street: "${user.street}" (was: "${oldStreet}")`);
    }
    if (updates.suiteApt !== undefined) {
      const oldSuiteApt = user.suiteApt;
      user.suiteApt = String(updates.suiteApt || "");
      console.log(`✅ Setting suiteApt: "${user.suiteApt}" (was: "${oldSuiteApt}")`);
    }
    if (updates.city !== undefined) {
      const oldCity = user.city;
      user.city = String(updates.city || "");
      console.log(`✅ Setting city: "${user.city}" (was: "${oldCity}")`);
    }
    if (updates.state !== undefined) {
      const oldState = user.state;
      user.state = String(updates.state || "");
      console.log(`✅ Setting state: "${user.state}" (was: "${oldState}")`);
    }
    if (updates.zipCode !== undefined) {
      const oldZipCode = user.zipCode;
      user.zipCode = String(updates.zipCode || "");
      console.log(`✅ Setting zipCode: "${user.zipCode}" (was: "${oldZipCode}")`);
    }
    
    // CRITICAL: Ensure these fields always have values, even if not in updates
    // This handles cases where fields might be undefined in existing documents
    // ALWAYS set them to ensure they exist in the database, just like SSN
    if (user.ssn === undefined || user.ssn === null) {
      user.ssn = "";
    }
    if (user.mobileNumber === undefined || user.mobileNumber === null) {
      user.mobileNumber = "";
    }
    if (user.address === undefined || user.address === null) {
      user.address = "";
    }
    // CRITICAL: Always ensure address component fields exist in database
    // Set to empty string if undefined/null to ensure they're saved
    if (user.street === undefined || user.street === null) {
      user.street = "";
    }
    if (user.suiteApt === undefined || user.suiteApt === null) {
      user.suiteApt = "";
    }
    if (user.city === undefined || user.city === null) {
      user.city = "";
    }
    if (user.state === undefined || user.state === null) {
      user.state = "";
    }
    if (user.zipCode === undefined || user.zipCode === null) {
      user.zipCode = "";
    }

    // Handle password update
    if (updates.password) {
      user.password = await bcrypt.hash(updates.password, 10);
    }

    // Convert hireDate string to Date object if provided
    // Parse YYYY-MM-DD format as local date to avoid timezone issues
    if (updates.hireDate !== undefined) {
      if (typeof updates.hireDate === "string" && updates.hireDate.trim() !== "") {
        const dateStr = updates.hireDate.trim();
        // If it's in YYYY-MM-DD format, parse it as local date to avoid UTC conversion
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const [year, month, day] = dateStr.split('-').map(Number);
          user.hireDate = new Date(year, month - 1, day);
          console.log(`📅 Setting hireDate: ${dateStr} -> ${user.hireDate}`);
        } else {
          user.hireDate = new Date(updates.hireDate);
        }
      } else {
        user.hireDate = null;
        console.log(`📅 Setting hireDate to null (empty string)`);
      }
    }

    // Convert dateOfBirth string to Date object if provided
    // Parse YYYY-MM-DD format as local date to avoid timezone issues
    // CRITICAL: Always handle dateOfBirth if it's in the update
    if (updates.dateOfBirth !== undefined) {
      if (typeof updates.dateOfBirth === "string" && updates.dateOfBirth.trim() !== "") {
        const dateStr = updates.dateOfBirth.trim();
        // If it's in YYYY-MM-DD format, parse it as local date to avoid UTC conversion
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const [year, month, day] = dateStr.split('-').map(Number);
          user.dateOfBirth = new Date(year, month - 1, day);
          console.log(`📅 Setting dateOfBirth: ${dateStr} -> ${user.dateOfBirth}`);
        } else {
          user.dateOfBirth = new Date(updates.dateOfBirth);
          console.log(`📅 Setting dateOfBirth (non-standard format): ${updates.dateOfBirth} -> ${user.dateOfBirth}`);
        }
      } else {
        user.dateOfBirth = null;
        console.log(`📅 Setting dateOfBirth to null (empty or invalid)`);
      }
      user.markModified('dateOfBirth');
    }
    
    // CRITICAL: Ensure dateOfBirth is always set, even if null
    if (user.dateOfBirth === undefined) {
      user.dateOfBirth = null;
    }

    // Process credentials with proper date conversion
    if (updates.credentials) {
      console.log("📥 Received credentials:", JSON.stringify(updates.credentials, null, 2));
      
      // Normalize credentials (this will handle date conversion)
      const normalizedCreds = withCredentialDefaults(updates.credentials);
      console.log("🔄 Normalized credentials:", JSON.stringify(normalizedCreds, (key, value) => {
        if (value instanceof Date) return value.toISOString();
        return value;
      }, 2));
      
      // CRITICAL: Ensure credentials is a Map before using .set()
      // We already converted it at the start, but Mongoose might have converted it back
      // Force it to be a Map by creating a new one
      console.log("🔍 Before credentials update - type:", typeof user.credentials, "is Map:", user.credentials instanceof Map);
      
      // Always create a fresh Map for credentials
      const credentialsMap = new Map();
      
      // Clear the Map to set fresh data (not needed since it's new, but for clarity)
      // credentialsMap.clear(); // Not needed for new Map
      
      // Set each credential directly on the new Map
      Object.entries(normalizedCreds).forEach(([key, value]) => {
        credentialsMap.set(key, value);
        // Log each credential being set
        if (value.date) {
          console.log(`💾 Route: Setting ${key} with date: ${value.date instanceof Date ? value.date.toISOString() : value.date}`);
        } else {
          console.log(`💾 Route: Setting ${key} with no date (null)`);
        }
      });
      
      console.log("💾 Credentials Map size after setting:", credentialsMap.size);
      
      // Verify dates are in the Map before assigning
      let dateCount = 0;
      credentialsMap.forEach((value, key) => {
        if (value && value.date) {
          dateCount++;
          console.log(`✅ Verified ${key} has date before save: ${value.date instanceof Date ? value.date.toISOString() : value.date}`);
        }
      });
      console.log(`✅ Total credentials with dates before save: ${dateCount} out of ${credentialsMap.size}`);
      
      // Now assign the Map to user.credentials
      // Mongoose will handle the Map conversion internally
      user.credentials = credentialsMap;
      console.log("💾 Assigned Map to user.credentials");
      
      // CRITICAL: Mark credentials as modified so Mongoose saves it
      user.markModified('credentials');
    }

    // Log what we're about to save - verify all fields are set
    console.log(`💾 About to save user: ${user.email} (ID: ${user._id})`);
    console.log(`   firstName: "${user.firstName}", lastName: "${user.lastName}"`);
    console.log(`   email: "${user.email}", position: "${user.position}"`);
    console.log(`   hireDate: ${user.hireDate}, dateOfBirth: ${user.dateOfBirth}`);
    console.log(`   ssn: "${user.ssn}", mobileNumber: "${user.mobileNumber}"`);
    console.log(`   address: "${user.address}", street: "${user.street}", city: "${user.city}", state: "${user.state}", zipCode: "${user.zipCode}"`);
    console.log(`   status: "${user.status}"`);
    
    // CRITICAL: Before saving, ensure all address component fields are explicitly set
    // This is exactly like SSN - must be set to ensure they're saved to MongoDB
    // Set them explicitly even if not in updates to ensure they exist in database
    user.street = user.street !== undefined && user.street !== null ? String(user.street) : "";
    user.suiteApt = user.suiteApt !== undefined && user.suiteApt !== null ? String(user.suiteApt) : "";
    user.city = user.city !== undefined && user.city !== null ? String(user.city) : "";
    user.state = user.state !== undefined && user.state !== null ? String(user.state) : "";
    user.zipCode = user.zipCode !== undefined && user.zipCode !== null ? String(user.zipCode) : "";
    
    // Also ensure SSN and mobileNumber are set
    user.ssn = user.ssn !== undefined && user.ssn !== null ? String(user.ssn) : "";
    user.mobileNumber = user.mobileNumber !== undefined && user.mobileNumber !== null ? String(user.mobileNumber) : "";
    user.address = user.address !== undefined && user.address !== null ? String(user.address) : "";
    
    // Save the user (this will trigger pre-save hooks)
    // CRITICAL: Explicitly mark these fields as modified to ensure they're saved to database
    // This is essential for fields that might not exist in older documents
    // MUST mark as modified to ensure MongoDB saves them, just like SSN
    user.markModified('ssn');
    user.markModified('mobileNumber');
    user.markModified('address');
    user.markModified('street');
    user.markModified('suiteApt');
    user.markModified('city');
    user.markModified('state');
    user.markModified('zipCode');
    user.markModified('dateOfBirth');
    
    console.log(`💾 About to save - Field values before save:`, {
      ssn: user.ssn,
      mobileNumber: user.mobileNumber,
      address: user.address,
      street: user.street,
      suiteApt: user.suiteApt,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      dateOfBirth: user.dateOfBirth
    });
    
    const savedDoc = await user.save();
    console.log(`✅ User saved successfully: ${user.email} (ID: ${user._id})`);
    console.log(`✅ Saved document fields:`, {
      firstName: savedDoc.firstName,
      lastName: savedDoc.lastName,
      email: savedDoc.email,
      position: savedDoc.position,
      ssn: savedDoc.ssn,
      mobileNumber: savedDoc.mobileNumber,
      address: savedDoc.address,
      street: savedDoc.street,
      suiteApt: savedDoc.suiteApt,
      city: savedDoc.city,
      state: savedDoc.state,
      zipCode: savedDoc.zipCode,
      status: savedDoc.status,
      hireDate: savedDoc.hireDate,
      dateOfBirth: savedDoc.dateOfBirth
    });
    
    // CRITICAL: Reload the user from database to get the saved data
    const savedUser = await User.findById(req.params.id);
    if (!savedUser) {
      return res.status(404).json({ message: "User not found after save" });
    }
    
    // Also get lean version to verify what's actually stored in database
    const savedUserLean = await User.findById(req.params.id).lean();
    
    console.log(`🔄 Reloaded user from database after save:`);
    console.log(`   firstName: "${savedUser.firstName}", lastName: "${savedUser.lastName}"`);
    console.log(`   email: "${savedUser.email}", position: "${savedUser.position}"`);
    console.log(`   hireDate: ${savedUser.hireDate}, dateOfBirth: ${savedUser.dateOfBirth}`);
    console.log(`   ssn: "${savedUser.ssn}", mobileNumber: "${savedUser.mobileNumber}"`);
    console.log(`   address: "${savedUser.address}", street: "${savedUser.street}", city: "${savedUser.city}", state: "${savedUser.state}", zipCode: "${savedUser.zipCode}"`);
    console.log(`   status: "${savedUser.status}"`);
    
    // CRITICAL: Verify the four fields are in the database
    if (savedUserLean) {
      console.log(`🔍 Database verification (lean) - CRITICAL FIELDS:`, {
        ssn: savedUserLean.ssn || "MISSING",
        mobileNumber: savedUserLean.mobileNumber || "MISSING",
        address: savedUserLean.address || "MISSING",
        street: savedUserLean.street || "MISSING",
        suiteApt: savedUserLean.suiteApt || "MISSING",
        city: savedUserLean.city || "MISSING",
        state: savedUserLean.state || "MISSING",
        zipCode: savedUserLean.zipCode || "MISSING",
        dateOfBirth: savedUserLean.dateOfBirth || "MISSING",
        firstName: savedUserLean.firstName,
        lastName: savedUserLean.lastName,
        status: savedUserLean.status
      });
    }
    
    console.log(`🔄 Reloaded user from DB after save`);
    if (updates.credentials) {
      console.log(`   Credentials updated:`, Object.keys(updates.credentials || {}).length, "credentials");
      
      // Verify dates after save in the reloaded user
      if (savedUser.credentials instanceof Map) {
        console.log(`   Reloaded user credentials Map size:`, savedUser.credentials.size);
        if (savedUser.credentials.size === 0) {
          console.log(`⚠️ WARNING: Reloaded user has EMPTY credentials Map!`);
          console.log(`   This means credentials were NOT saved to the database.`);
        }
        savedUser.credentials.forEach((value, key) => {
          if (value && value.date) {
            console.log(`✅ Reloaded - ${key} has date: ${value.date instanceof Date ? value.date.toISOString() : value.date}`);
          } else {
            console.log(`⚠️ Reloaded - ${key} has NO date`);
          }
        });
      } else {
        console.log(`⚠️ Reloaded user credentials is NOT a Map:`, typeof savedUser.credentials);
      }
      
      // Also check the raw document
      const rawDoc = savedUser.toObject();
      console.log(`🔍 Raw document credentials type:`, typeof rawDoc.credentials);
      if (rawDoc.credentials && typeof rawDoc.credentials === 'object') {
        console.log(`🔍 Raw document credentials keys:`, Object.keys(rawDoc.credentials));
      }
    }

    const response = sanitize(savedUser);
    
    // CRITICAL: Ensure the fields are always in the response
    // Explicitly set them to ensure they're never undefined
    // Use the actual saved values from the database, not the response
    response.ssn = (savedUser.ssn !== undefined && savedUser.ssn !== null) ? String(savedUser.ssn) : "";
    response.mobileNumber = (savedUser.mobileNumber !== undefined && savedUser.mobileNumber !== null) ? String(savedUser.mobileNumber) : "";
    response.address = (savedUser.address !== undefined && savedUser.address !== null) ? String(savedUser.address) : "";
    response.street = (savedUser.street !== undefined && savedUser.street !== null) ? String(savedUser.street) : "";
    response.suiteApt = (savedUser.suiteApt !== undefined && savedUser.suiteApt !== null) ? String(savedUser.suiteApt) : "";
    response.city = (savedUser.city !== undefined && savedUser.city !== null) ? String(savedUser.city) : "";
    response.state = (savedUser.state !== undefined && savedUser.state !== null) ? String(savedUser.state) : "";
    response.zipCode = (savedUser.zipCode !== undefined && savedUser.zipCode !== null) ? String(savedUser.zipCode) : "";
    response.dateOfBirth = savedUser.dateOfBirth || null;
    
    console.log("📤 Sending response with user data:");
    console.log("   firstName:", response.firstName);
    console.log("   lastName:", response.lastName);
    console.log("   email:", response.email);
    console.log("   position:", response.position);
    console.log("   hireDate:", response.hireDate);
    console.log("   ⭐ CRITICAL FIELDS:");
    console.log("   dateOfBirth:", response.dateOfBirth);
    console.log("   ssn:", response.ssn);
    console.log("   mobileNumber:", response.mobileNumber);
    console.log("   address:", response.address);
    console.log("   street:", response.street);
    console.log("   suiteApt:", response.suiteApt);
    console.log("   city:", response.city);
    console.log("   state:", response.state);
    console.log("   zipCode:", response.zipCode);
    console.log("   status:", response.status);
    console.log("📤 Response credentials count:", Object.keys(response.credentials || {}).length);
    
    res.json(response);
  } catch (error) {
    console.error("Update user error:", error);
    const message = error.message || "Server error";
    res.status(500).json({ message, error: error.name });
  }
});

export default router;

