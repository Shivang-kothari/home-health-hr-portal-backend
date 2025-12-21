import mongoose from "mongoose";
import { withCredentialDefaults } from "../utils/credentials.js";

// Schema for file objects stored in credentials
const fileSchema = new mongoose.Schema(
  {
    // CRITICAL: GridFS identifiers - these MUST be preserved
    id: { type: String }, // GridFS fileId for direct download
    fileId: { type: String }, // Alias for GridFS fileId
    _id: { type: String }, // Document model _id (optional)
    // Standard file fields
    name: { type: String, default: "" }, // Changed from required to default ""
    data: { type: String, default: "" }, // base64 encoded file data, changed from required to default ""
    type: { type: String, default: "" }, // MIME type
    size: { type: Number, default: 0 }, // file size in bytes
    uploadedAt: { type: String, default: "" }, // ISO date string
    isDocument: { type: Boolean, default: false }, // Flag to indicate GridFS document
  },
  { _id: false, strict: false } // Allow additional fields for backward compatibility
);

const credentialSchema = new mongoose.Schema(
  {
    date: { type: Date },
    notes: { type: String, default: "" },
    files: { type: [fileSchema], default: [] }, // Changed from [String] to [fileSchema]
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    userName: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, unique: true, required: true },
    password: { type: String },
    position: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive", "Active", "Inactive"],
      default: "active",
    },
    hireDate: { type: Date },
    ssn: { type: String, trim: true, default: "" },
    mobileNumber: { type: String, trim: true, default: "" },
    // Address fields - separate components
    address: { type: String, trim: true, default: "" }, // Keep for backward compatibility
    street: { type: String, trim: true, default: "" },
    suiteApt: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    zipCode: { type: String, trim: true, default: "" },
    dateOfBirth: { type: Date },
    credentials: {
      type: Map,
      of: credentialSchema,
      default: {},
      // CRITICAL: Remove the getter that converts Map to object - this was causing files to be lost
      // The getter was converting the Map to an object, which loses nested array data
      // get: (value) => Object.fromEntries(value || []), // REMOVED - was causing file loss
    },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function toPublicJSON() {
  // Get the document as a plain object
  const obj = this.toObject({ getters: true, virtuals: false });
  delete obj.password;
  
  // Ensure all fields are explicitly included, even if undefined in database
  // This is critical for fields that might not exist in older documents
  // CRITICAL: Always return these fields as strings to ensure they're never undefined
  obj.firstName = obj.firstName || "";
  obj.lastName = obj.lastName || "";
  obj.email = obj.email || "";
  obj.position = obj.position || "";
  obj.status = obj.status || "active";
  // Use the actual document value, not obj, to ensure we get the real value
  obj.ssn = (this.ssn !== undefined && this.ssn !== null) ? String(this.ssn) : "";
  obj.mobileNumber = (this.mobileNumber !== undefined && this.mobileNumber !== null) ? String(this.mobileNumber) : "";
  obj.address = (this.address !== undefined && this.address !== null) ? String(this.address) : "";
  // Address component fields
  obj.street = (this.street !== undefined && this.street !== null) ? String(this.street) : "";
  obj.suiteApt = (this.suiteApt !== undefined && this.suiteApt !== null) ? String(this.suiteApt) : "";
  obj.city = (this.city !== undefined && this.city !== null) ? String(this.city) : "";
  obj.state = (this.state !== undefined && this.state !== null) ? String(this.state) : "";
  obj.zipCode = (this.zipCode !== undefined && this.zipCode !== null) ? String(this.zipCode) : "";
  obj.hireDate = this.hireDate || null;
  obj.dateOfBirth = this.dateOfBirth || null;
  
  // CRITICAL: Convert credentials Map to plain object manually
  // toObject() doesn't always properly convert Maps
  if (this.credentials && this.credentials instanceof Map) {
    const credsObj = {};
    this.credentials.forEach((value, key) => {
      if (value) {
        // Handle files - ensure they're in the correct format
        // CRITICAL: Preserve id, fileId, and _id fields for GridFS documents
        const files = value.files || [];
        const normalizedFiles = files.map(file => {
          if (typeof file === 'object' && file !== null) {
            return {
              // CRITICAL: Preserve GridFS identifiers
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
          // Old format: string filename
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
        
        credsObj[key] = {
          date: value.date || null,
          notes: value.notes || "",
          files: normalizedFiles,
        };
      }
    });
    obj.credentials = credsObj;
    // Reduced logging for performance
    // console.log(`📤 toPublicJSON: Converted Map to object with ${Object.keys(credsObj).length} credentials`);
  } else if (obj.credentials && typeof obj.credentials === "object" && !(obj.credentials instanceof Map)) {
    // Already an object (from toObject), but ensure it's properly formatted
    const credsObj = {};
    Object.keys(obj.credentials).forEach((key) => {
      const cred = obj.credentials[key];
      if (cred) {
        // Handle files - ensure they're in the correct format
        const files = cred.files || [];
        const normalizedFiles = files.map(file => {
          if (typeof file === 'object' && file !== null) {
            return {
              // CRITICAL: Preserve GridFS identifiers
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
          // Old format: string filename
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
        
        credsObj[key] = {
          date: cred.date || null,
          notes: cred.notes || "",
          files: normalizedFiles,
        };
      }
    });
    obj.credentials = credsObj;
    // Reduced logging for performance
    // console.log(`📤 toPublicJSON: Formatted object with ${Object.keys(credsObj).length} credentials`);
  } else {
    // No credentials or empty
    obj.credentials = obj.credentials || {};
    // Reduced logging for performance
    // console.log(`⚠️ toPublicJSON: No credentials found, using empty object`);
  }
  
  // Reduced logging for performance
  // console.log(`📤 toPublicJSON returning fields:`, {
  //   ssn: obj.ssn,
  //   mobileNumber: obj.mobileNumber,
  //   address: obj.address,
  //   street: obj.street,
  //   suiteApt: obj.suiteApt,
  //   city: obj.city,
  //   state: obj.state,
  //   zipCode: obj.zipCode,
  //   dateOfBirth: obj.dateOfBirth
  // });
  
  return obj;
};

// Optimized version that excludes file data for list views
userSchema.methods.toPublicJSONWithoutFiles = function toPublicJSONWithoutFiles() {
  const obj = this.toPublicJSON();
  
  // Remove file data from credentials, keep only metadata
  if (obj.credentials && typeof obj.credentials === "object") {
    Object.keys(obj.credentials).forEach((key) => {
      if (obj.credentials[key] && obj.credentials[key].files) {
        // Replace files array with just file count and names (no base64 data)
        // CRITICAL: Preserve GridFS identifiers even when removing data
        obj.credentials[key].files = obj.credentials[key].files.map(file => ({
          // CRITICAL: Preserve GridFS identifiers
          id: file.id || file.fileId || file._id || undefined,
          fileId: file.fileId || file.id || file._id || undefined,
          _id: file._id || file.id || file.fileId || undefined,
          // Standard file fields (excluding data to save bandwidth)
          name: file.name || '',
          type: file.type || '',
          size: file.size || 0,
          uploadedAt: file.uploadedAt || '',
          isDocument: file.isDocument !== undefined ? file.isDocument : (file.id || file.fileId || file._id ? true : false)
          // Exclude 'data' field to save bandwidth
        }));
      }
    });
  }
  
  return obj;
};

// Ultra-lightweight version for login - only essential user info, no credentials
userSchema.methods.toLoginJSON = function toLoginJSON() {
  return {
    _id: this._id,
    firstName: this.firstName || "",
    lastName: this.lastName || "",
    email: this.email || "",
    position: this.position || "",
    status: this.status || "active",
    userName: this.userName || "",
    hireDate: this.hireDate || null,
    // Exclude credentials entirely for login - not needed
    // Exclude all other fields to minimize payload
  };
};

userSchema.pre("save", function ensureCredentials(next) {
  try {
    // CRITICAL: First, capture files from the original credentials BEFORE any conversion
    // This ensures we don't lose files during the conversion process
    // Handle both Map and object cases
    const originalFilesMap = new Map();
    if (this.credentials instanceof Map) {
      console.log(`📁 Pre-save: Starting - credentials Map has ${this.credentials.size} entries`);
      this.credentials.forEach((value, key) => {
        const files = value?.files || [];
        console.log(`📁 Pre-save: Checking "${key}":`, {
          hasValue: !!value,
          hasFiles: !!value?.files,
          filesType: Array.isArray(files) ? 'array' : typeof files,
          filesLength: files.length,
          firstFile: files.length > 0 ? (typeof files[0] === 'string' ? files[0] : files[0].name) : 'none'
        });
        if (files.length > 0) {
          originalFilesMap.set(key, files);
          console.log(`📁 Pre-save: ✅ Captured ${files.length} files for "${key}" from original Map`);
        } else {
          console.log(`📁 Pre-save: ⚠️ No files found for "${key}" in original Map`);
        }
      });
      console.log(`📁 Pre-save: Captured files for ${originalFilesMap.size} credentials`);
    } else if (this.credentials && typeof this.credentials === 'object') {
      // CRITICAL: Handle case where credentials is already an object (from previous save)
      console.log(`📁 Pre-save: Starting - credentials is an object with ${Object.keys(this.credentials).length} keys`);
      Object.keys(this.credentials).forEach((key) => {
        const value = this.credentials[key];
        const files = value?.files || [];
        console.log(`📁 Pre-save: Checking "${key}" (object):`, {
          hasValue: !!value,
          hasFiles: !!value?.files,
          filesType: Array.isArray(files) ? 'array' : typeof files,
          filesLength: files.length,
          firstFile: files.length > 0 ? (typeof files[0] === 'string' ? files[0] : files[0].name) : 'none'
        });
        if (files.length > 0) {
          originalFilesMap.set(key, files);
          console.log(`📁 Pre-save: ✅ Captured ${files.length} files for "${key}" from original object`);
        } else {
          console.log(`📁 Pre-save: ⚠️ No files found for "${key}" in original object`);
        }
      });
      console.log(`📁 Pre-save: Captured files for ${originalFilesMap.size} credentials from object`);
    } else {
      console.log(`📁 Pre-save: ⚠️ credentials is NOT a Map or object, type: ${typeof this.credentials}, value:`, this.credentials);
    }
    
    // Check if credentials Map already has data (was set directly in route handler)
    const mapHasData = this.credentials instanceof Map && this.credentials.size > 0;
    // Reduced logging for performance
    // console.log("🔍 Pre-save hook - credentials Map has data:", mapHasData, "size:", this.credentials instanceof Map ? this.credentials.size : "N/A");
    
    let current = {};
    
    // Handle both Map and plain object cases
    if (!this.credentials) {
      current = {};
    } else if (this.credentials instanceof Map) {
      // If it's a Map, convert to plain object
      // CRITICAL: Convert Mongoose subdocuments to plain objects
      if (this.credentials.size > 0) {
        this.credentials.forEach((value, key) => {
          // Convert Mongoose subdocument to plain object to preserve dates
          if (value && typeof value.toObject === 'function') {
            const obj = value.toObject();
            // CRITICAL: Restore files from original if they were lost
            if (originalFilesMap.has(key)) {
              obj.files = originalFilesMap.get(key);
              console.log(`📁 Pre-save: Restored ${obj.files.length} files for "${key}" from original Map`);
            }
            current[key] = obj;
          } else if (value && typeof value === 'object') {
            // Already a plain object, but ensure dates are preserved
            // Handle files - can be array of strings (old format) or array of objects (new format)
            const files = value.files || [];
            console.log(`📁 Pre-save: Processing credential "${key}" with ${files.length} files`);
            
            // CRITICAL: Use files from original Map if available, otherwise use normalized files
            let filesToUse = files;
            if (originalFilesMap.has(key)) {
              filesToUse = originalFilesMap.get(key);
              console.log(`📁 Pre-save: Using ${filesToUse.length} files from original Map for "${key}"`);
            }
            
            const normalizedFiles = filesToUse.map(file => {
              // If file is already an object, return it as-is (PRESERVE ALL DATA INCLUDING GRIDFS IDs)
              if (typeof file === 'object' && file !== null) {
                const fileObj = {
                  // CRITICAL: Preserve GridFS identifiers - these are needed for viewing files
                  id: file.id || file.fileId || file._id || undefined,
                  fileId: file.fileId || file.id || file._id || undefined,
                  _id: file._id || file.id || file.fileId || undefined,
                  // Standard file fields
                  name: file.name || '',
                  data: file.data || '', // CRITICAL: Preserve base64 data
                  type: file.type || '',
                  size: file.size || 0,
                  uploadedAt: file.uploadedAt || '',
                  // Preserve isDocument flag
                  isDocument: file.isDocument !== undefined ? file.isDocument : (file.id || file.fileId || file._id ? true : false)
                };
                if (file.data && file.data.length > 0) {
                  console.log(`📁 Pre-save: Preserving file "${fileObj.name}" with ${fileObj.data.length} chars of data`);
                } else if (fileObj.id || fileObj.fileId) {
                  console.log(`📁 Pre-save: Preserving GridFS document "${fileObj.name}" with id: ${fileObj.id || fileObj.fileId}`);
                }
                return fileObj;
              }
              // If file is a string (old format), convert to object format
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
            
            current[key] = {
              date: value.date || null,
              notes: value.notes || "",
              files: normalizedFiles, // CRITICAL: Preserve normalized files
            };
            console.log(`📁 Pre-save: Credential "${key}" now has ${normalizedFiles.length} files in current object`);
          } else {
            current[key] = value;
          }
        });
      }
    } else if (typeof this.credentials === "object" && this.credentials !== null) {
      // If it's already a plain object, use it directly
      // CRITICAL: But restore files from originalFilesMap if available
      current = {};
      Object.keys(this.credentials).forEach((key) => {
        const value = this.credentials[key];
        // Use files from originalFilesMap if captured, otherwise use value.files
        const files = originalFilesMap.has(key) ? originalFilesMap.get(key) : (value?.files || []);
        
        if (files.length > 0) {
          console.log(`📁 Pre-save: Using ${files.length} files for "${key}" from ${originalFilesMap.has(key) ? 'originalFilesMap' : 'object'}`);
        }
        
        current[key] = {
          date: value?.date || null,
          notes: value?.notes || "",
          files: files // Use files from originalFilesMap if available
        };
      });
    }
    
    // Reduced logging for performance
    // console.log("🔍 Pre-save hook - current credentials:", JSON.stringify(current, (key, value) => {
    //   if (value instanceof Date) return value.toISOString();
    //   return value;
    // }, 2));
    
    // Get normalized credentials with defaults
    // This will preserve existing dates and add defaults for missing credentials
    // CRITICAL: withCredentialDefaults preserves files from current, so we need to ensure current has files
    const normalized = withCredentialDefaults(current);
    
    // CRITICAL: After normalization, ALWAYS restore files from originalFilesMap
    // This ensures files are never lost, even if withCredentialDefaults doesn't preserve them
    if (originalFilesMap.size > 0) {
      originalFilesMap.forEach((files, key) => {
        if (files.length > 0) {
          // Always restore files from the original Map
          if (!normalized[key]) {
            normalized[key] = { date: null, notes: "", files: [] };
          }
          normalized[key].files = files; // Restore original files
          console.log(`✅ Pre-save: Restored ${files.length} files for "${key}" from original Map (after normalization)`);
        }
      });
    }
    
    // Also check if any files were lost during normalization
    // Check both Map and object cases
    if (this.credentials instanceof Map) {
      this.credentials.forEach((value, key) => {
        const originalFiles = value?.files || [];
        const normalizedFiles = normalized[key]?.files || [];
        
        // If original has files but normalized doesn't, restore them
        if (originalFiles.length > 0 && normalizedFiles.length === 0) {
          console.error(`❌ CRITICAL: Files lost for "${key}" during normalization! Restoring from original Map...`);
          console.error(`   Original files:`, originalFiles.map(f => typeof f === 'string' ? f : f.name));
          normalized[key].files = originalFiles;
        } else if (originalFiles.length > 0 && normalizedFiles.length > 0) {
          // Verify files are preserved
          console.log(`✅ Pre-save: Credential "${key}" files preserved: ${normalizedFiles.length} files`);
        }
      });
    } else if (this.credentials && typeof this.credentials === 'object') {
      // Also check object case
      Object.keys(this.credentials).forEach((key) => {
        const value = this.credentials[key];
        const originalFiles = value?.files || [];
        const normalizedFiles = normalized[key]?.files || [];
        
        // If original has files but normalized doesn't, restore them
        if (originalFiles.length > 0 && normalizedFiles.length === 0) {
          console.error(`❌ CRITICAL: Files lost for "${key}" during normalization (object)! Restoring...`);
          console.error(`   Original files:`, originalFiles.map(f => typeof f === 'string' ? f : f.name));
          normalized[key].files = originalFiles;
        } else if (originalFiles.length > 0 && normalizedFiles.length > 0) {
          console.log(`✅ Pre-save: Credential "${key}" files preserved (object): ${normalizedFiles.length} files`);
        }
      });
    }
    
    // CRITICAL: Log files before and after normalization to debug file loss
    Object.keys(normalized).forEach(key => {
      const beforeFiles = current[key]?.files || [];
      const afterFiles = normalized[key]?.files || [];
      if (beforeFiles.length > 0 || afterFiles.length > 0) {
        console.log(`📁 Pre-save: Credential "${key}" files - before: ${beforeFiles.length}, after: ${afterFiles.length}`);
        if (beforeFiles.length > 0 && afterFiles.length === 0) {
          console.error(`❌ CRITICAL: Files lost for "${key}" during normalization!`);
          console.error(`   Before files:`, beforeFiles.map(f => typeof f === 'string' ? f : f.name));
        }
      }
    });
    // Reduced logging for performance
    // console.log("✅ Pre-save hook - normalized credentials:", JSON.stringify(normalized, (key, value) => {
    //   if (value instanceof Date) return value.toISOString();
    //   return value;
    // }, 2));
    
    // Count how many credentials have dates in normalized
    let normalizedDateCount = 0;
    Object.values(normalized).forEach(v => {
      if (v && v.date) normalizedDateCount++;
    });
    // Reduced logging for performance
    // console.log(`✅ Pre-save: Normalized has ${normalizedDateCount} credentials with dates`);
    
    // Ensure credentials is a Map (Mongoose will handle this, but we ensure it)
    // CRITICAL: Always create a fresh Map, don't try to use .clear() or .set() on existing one
    const credentialsMap = new Map();
    
    // Set all normalized credentials in the new Map
    // CRITICAL: Ensure files are preserved when setting in the Map
    Object.entries(normalized).forEach(([key, value]) => {
      // Double-check: if originalFilesMap has files for this key, use those instead
      if (originalFilesMap.has(key) && originalFilesMap.get(key).length > 0) {
        const originalFiles = originalFilesMap.get(key);
        const credentialValue = {
          ...value,
          files: originalFiles // Always use original files if available
        };
        credentialsMap.set(key, credentialValue);
        console.log(`✅ Pre-save: Setting credential "${key}" in Map with ${originalFiles.length} files from original`);
      } else {
        credentialsMap.set(key, value);
        if (value.files && value.files.length > 0) {
          console.log(`✅ Pre-save: Setting credential "${key}" in Map with ${value.files.length} files from normalized`);
        }
      }
    });
    
    // CRITICAL: Final verification - check if any files are missing
    if (originalFilesMap.size > 0) {
      originalFilesMap.forEach((files, key) => {
        if (files.length > 0) {
          const mapValue = credentialsMap.get(key);
          const mapFiles = mapValue?.files || [];
          if (mapFiles.length === 0) {
            console.error(`❌ CRITICAL: Files still missing for "${key}" after setting in Map! Force restoring...`);
            credentialsMap.set(key, {
              ...mapValue,
              files: files
            });
            console.log(`✅ Pre-save: Force restored ${files.length} files for "${key}"`);
          }
        }
      });
    }
    
    // Now assign the Map to this.credentials
    this.credentials = credentialsMap;
    
    // CRITICAL: Final verification and force restore if needed
    if (originalFilesMap.size > 0) {
      console.log(`📊 Pre-save: Final verification - Files in Map:`);
      originalFilesMap.forEach((files, key) => {
        const mapValue = credentialsMap.get(key);
        const mapFiles = mapValue?.files || [];
        console.log(`   "${key}": original=${files.length}, in Map=${mapFiles.length}`);
        
        // If files are still missing, force restore them
        if (files.length > 0 && mapFiles.length === 0) {
          console.error(`❌ CRITICAL: Files still missing for "${key}" after all restoration attempts! Force restoring one more time...`);
          credentialsMap.set(key, {
            ...mapValue,
            files: files
          });
          this.credentials = credentialsMap; // Re-assign to ensure Mongoose tracks it
          console.log(`✅ Pre-save: Force restored ${files.length} files for "${key}" one final time`);
        }
      });
    }
    
    // CRITICAL: Mark credentials as modified to ensure Mongoose saves it
    this.markModified('credentials');
    // Reduced logging for performance
    
    // Verify the Map has the data before save (use credentialsMap, not this.credentials)
    let hasDates = 0;
    credentialsMap.forEach((value, key) => {
      if (value && value.date) {
        hasDates++;
        // Reduced logging for performance
      }
    });
    // Reduced logging for performance
    
    // Verify after assignment (only log errors)
    if (!(this.credentials instanceof Map)) {
      console.error(`❌ ERROR: this.credentials is NOT a Map after assignment! Type: ${typeof this.credentials}`);
    }
    
    if (hasDates === 0 && normalizedDateCount > 0) {
      console.error(`❌ ERROR: Dates were in normalized but NOT set in Map!`);
    }
  } catch (error) {
    console.error("❌ Error in ensureCredentials pre-save hook:", error);
    // Fallback: initialize with defaults
    try {
      const normalized = withCredentialDefaults({});
      const fallbackMap = new Map();
      Object.entries(normalized).forEach(([key, value]) => {
        fallbackMap.set(key, value);
      });
      this.credentials = fallbackMap;
      console.log("🔄 Fallback: Initialized credentials Map with defaults");
    } catch (fallbackError) {
      console.error("❌ Fallback also failed:", fallbackError);
    }
  }
  
  next();
});

userSchema.pre("findOneAndUpdate", function normalizeUpdate(next) {
  if (this._update.credentials) {
    this._update.credentials = withCredentialDefaults(this._update.credentials);
  }
  // Note: We handle hireDate and dateOfBirth conversion in the route handler
  // to have better control and avoid double conversion
  next();
});

const User = mongoose.model("User", userSchema);

export default User;

