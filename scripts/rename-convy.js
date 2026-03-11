const fs = require("fs");
const path = require("path");

const walkSync = (dir, filelist = []) => {
  if (!fs.existsSync(dir)) return filelist;
  fs.readdirSync(dir).forEach((file) => {
    const dirFile = path.join(dir, file);
    try {
      if (fs.statSync(dirFile).isDirectory()) {
        // Skip node_modules, .git, etc.
        if (
          !["node_modules", ".git", ".next", "dist", ".gemini"].includes(file)
        ) {
          filelist = walkSync(dirFile, filelist);
        }
      } else {
        if (
          dirFile.endsWith(".ts") ||
          dirFile.endsWith(".tsx") ||
          dirFile.endsWith(".json")
        ) {
          filelist.push(dirFile);
        }
      }
    } catch (err) {}
  });
  return filelist;
};

const directoriesToSearch = [
  path.join(__dirname, "../app"),
  path.join(__dirname, "../components"),
  path.join(__dirname, "../messages"),
  path.join(__dirname, "../workers"),
  path.join(__dirname, "../lib/auth.ts"), // specific file
];

let allFiles = [];
directoriesToSearch.forEach((dir) => {
  if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
    allFiles.push(dir);
  } else {
    allFiles = walkSync(dir, allFiles);
  }
});

// A safe replacement map. We want to avoid breaking URLs (like convy.ai, getConvy) unless it's display text.
// Actually, for display text, "Convy" -> "Convyy".
// "convy" -> "convyy" if it's not part of "convy.com" or "convy.ai" or variable names.
// It's safer to just regex replace specifically.

for (const file of allFiles) {
  let content = fs.readFileSync(file, "utf8");
  let original = content;

  // 1. Replace "Convy" with "Convyy" (case sensitive), except in urls maybe?
  // Given user wants an app re-brand, we replace all "Convy " with "Convyy ", "Convy," with "Convyy,", "Convy." with "Convyy.", ">Convy<" with ">Convyy<", '"Convy"' with '"Convyy"'.

  // Safe boundaries for Convy
  content = content.replace(/\bConvy\b/g, "Convyy");

  // Safe boundaries for convy ONLY in specific display configurations, or just let it rename.
  // Wait, if it renames `convy` to `convyy` everywhere, it might break internal variables like `convy_session_`, `convy_supabase_secret_key`, etc.
  // We should NOT blindly replace "convy" -> "convyy" globally with word boundaries, because of variables.
  // But wait, user said: "all areas where we are using convy to convyy, all the areas on the privacy policy, cookie banners and all areas, even inside the app on headers and other areas like that."

  // Let's manually replace in specific files we know have "convy" as display text:
  if (file.includes("navbar.tsx")) {
    content = content.replace(/>convy</g, ">convyy<");
  }

  if (original !== content) {
    fs.writeFileSync(file, content, "utf8");
    console.log(`Updated: ${file}`);
  }
}
