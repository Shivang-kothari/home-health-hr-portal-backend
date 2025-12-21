export const credentialKeys = [
  "Professional License",
  "CPR",
  "Driver's License",
  "Car Insurance",
  "OIG",
  "Liability Insurance",
  "Performance Evaluation",
  "Competency",
  "TB Test",
  "TB Form",
  "Flu Shot",
];

export const withCredentialDefaults = (credentials = {}) => {
  const normalized = {};

  credentialKeys.forEach((key) => {
    const entry = credentials[key] || {};
    let dateValue = null; // Use null instead of undefined for MongoDB
    
    // Handle date conversion properly
    if (entry.date !== null && entry.date !== undefined) {
      if (typeof entry.date === "string") {
        // If it's an empty string, set to null
        if (entry.date.trim() === "") {
          dateValue = null;
        } else {
          // Convert string to Date
          const parsedDate = new Date(entry.date);
          // Check if date is valid
          if (!isNaN(parsedDate.getTime())) {
            dateValue = parsedDate;
            console.log(`📅 Date converted for ${key}: "${entry.date}" -> ${dateValue.toISOString()}`);
          } else {
            console.log(`⚠️ Invalid date for ${key}: "${entry.date}"`);
            dateValue = null;
          }
        }
      } else if (entry.date instanceof Date) {
        // Already a Date object - check if valid
        if (!isNaN(entry.date.getTime())) {
          dateValue = entry.date;
          console.log(`📅 Date preserved for ${key}: ${dateValue.toISOString()}`);
        } else {
          console.log(`⚠️ Invalid Date object for ${key}`);
          dateValue = null;
        }
      } else {
        console.log(`⚠️ Unknown date type for ${key}:`, typeof entry.date, entry.date);
      }
    } else {
      console.log(`📅 No date for ${key} (null/undefined)`);
    }
    // If entry.date is null or undefined, dateValue stays null
    
    // CRITICAL: Preserve files array - if entry has files, use them; otherwise use empty array
    // This ensures files are never lost during normalization
    const files = entry.files;
    const filesArray = Array.isArray(files) ? files : [];
    
    // CRITICAL: If files is undefined/null but entry exists, check if it's a falsy value that should be preserved
    // Don't default to empty array if we're not sure
    const finalFiles = (files !== undefined && files !== null) ? filesArray : (entry.files || []);
    
    normalized[key] = {
      date: dateValue,
      notes: entry.notes || "",
      files: finalFiles, // Preserve files array - never lose existing files
    };
    
    // Log if files are being preserved or lost
    if (finalFiles.length > 0) {
      console.log(`📁 withCredentialDefaults: Preserving ${finalFiles.length} files for "${key}"`);
    } else if (files && files.length > 0) {
      console.error(`❌ withCredentialDefaults: Files lost for "${key}"! Had ${files.length} files but now ${finalFiles.length}`);
    }
  });

  return normalized;
};

