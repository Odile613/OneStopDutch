import { access, copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy only the audio files referenced by each course manifest into
 * public/Audio. Contact 1 keeps reading from the sibling DutchLearning project;
 * Contact 2+ read from source-materials/<course-id>/.
 *
 *   npm run sync:audio
 *   MATERIALS_DIR=/path/to/materials-root npm run sync:audio
 */
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coursesDir = join(projectRoot, "src", "data", "courses");
const sourceMaterials = join(projectRoot, "source-materials");
const contact1Root = resolve(
  process.env.MATERIALS_DIR ?? join(projectRoot, "..", "DutchLearning"),
);

let copied = 0;
let totalBytes = 0;
let missing = 0;

const courseIds = (await readdir(coursesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const courseId of courseIds) {
  const manifestPath = join(coursesDir, courseId, "audio-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    continue; // course has no audio yet
  }

  const courseRoot =
    courseId === "contact-1" ? contact1Root : join(sourceMaterials, courseId);

  for (const track of manifest) {
    const source = track.source
      ? join(courseRoot, track.source)
      : join(courseRoot, track.file);
    const destination = join(
      projectRoot,
      "public",
      track.file.replace(/^materials\//, ""),
    );
    try {
      await access(source);
    } catch {
      console.warn(`Missing source file, skipped: ${source}`);
      missing += 1;
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    totalBytes += (await stat(destination)).size;
    copied += 1;
  }
}

console.log(
  `Copied ${copied} tracks (${(totalBytes / 1024 / 1024).toFixed(1)} MB) to public/Audio.` +
    (missing ? ` ${missing} source file(s) missing.` : ""),
);
