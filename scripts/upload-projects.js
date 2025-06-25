/**
 * To run this script:
 * 1. Make sure you have downloaded your `serviceAccountKey.json` and placed it in this `scripts` folder.
 * 2. Organize your files in the `project_files_to_upload` directory (it will be created if it doesn't exist).
 *    - Create a subfolder for each project.
 *    - The folder name MUST be in the format: "Project Address /// Project B Number"
 *      (e.g., "123 Main Street, Anytown /// B-12345")
 *    - Place all files for that project inside its folder.
 * 3. Run the script from your project root:
 *    node scripts/upload-projects.js
 *
 * This script will upload the files to Firebase Storage and create/update the corresponding
 * project and file entries in Firestore.
 */
const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');

// --- Configuration ---
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
const uploadDirPath = path.join(__dirname, 'project_files_to_upload');

// --- Initialization ---
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.appspot.com`
  });
} catch (error) {
  console.error('Error: Could not initialize Firebase Admin SDK.');
  console.error('Please make sure your `serviceAccountKey.json` file exists in the `/scripts` directory.');
  console.error('Also ensure you have set up and enabled Firebase Storage in your project.');
  process.exit(1);
}

const db = admin.firestore();
const bucket = admin.storage().bucket();
console.log('Firebase Admin SDK initialized successfully.');

const projectsCache = new Map();

async function findOrCreateProject(address, bNumber) {
    const projectCacheKey = `${address}-${bNumber}`.toLowerCase();
    if (projectsCache.has(projectCacheKey)) {
        return projectsCache.get(projectCacheKey);
    }

    const projectsRef = db.collection('projects');
    const q = projectsRef.where('address', '==', address).where('bNumber', '==', bNumber);
    const querySnapshot = await q.get();

    let projectId;
    if (!querySnapshot.empty) {
        projectId = querySnapshot.docs[0].id;
        console.log(`Found existing project: '${address}' (ID: ${projectId})`);
    } else {
        const newProjectRef = await db.collection('projects').add({
            address: address,
            bNumber: bNumber,
        });
        projectId = newProjectRef.id;
        console.log(`Created new project: '${address}' (ID: ${projectId})`);
    }

    projectsCache.set(projectCacheKey, projectId);
    return projectId;
}

async function uploadFile(filePath, projectId) {
    const fileName = path.basename(filePath);
    const destination = `projects/${projectId}/${fileName}`;

    console.log(`  -> Uploading '${fileName}' to Firebase Storage...`);
    const [uploadedFile] = await bucket.upload(filePath, {
        destination: destination,
        metadata: {
            contentType: mime.lookup(fileName) || 'application/octet-stream',
        },
        public: true, // Make the file public right away
    });

    const publicUrl = uploadedFile.publicUrl();
    const [metadata] = await uploadedFile.getMetadata();

    console.log(`  -> Upload successful. Public URL: ${publicUrl}`);
    return {
        name: fileName,
        url: publicUrl,
        size: parseInt(metadata.size, 10),
        type: metadata.contentType,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function processProjectFolder(projectFolderPath) {
    const folderName = path.basename(projectFolderPath);
    const parts = folderName.split('///').map(p => p.trim());

    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        console.warn(`Skipping folder with invalid name format: "${folderName}". Expected "Address /// B Number".`);
        return;
    }
    const [address, bNumber] = parts;

    try {
        const projectId = await findOrCreateProject(address, bNumber);
        const files = await fs.readdir(projectFolderPath);

        if (files.length === 0) {
            console.log(`No files found in "${folderName}", skipping.`);
            return;
        }

        for (const fileName of files) {
            const filePath = path.join(projectFolderPath, fileName);
            const stats = await fs.stat(filePath);
            if (stats.isFile() && fileName !== '.DS_Store') { // Ignore system files
                const fileData = await uploadFile(filePath, projectId);
                await db.collection('projects').doc(projectId).collection('files').add(fileData);
                console.log(`  -> Added file record '${fileName}' to Firestore.`);
            }
        }
    } catch (error) {
        console.error(`Failed to process project folder "${folderName}":`, error);
    }
}


async function startUpload() {
  try {
    // Create the directory if it doesn't exist.
    try {
      await fs.access(uploadDirPath);
    } catch {
      console.log(`Upload directory not found. Creating it at: ${uploadDirPath}`);
      await fs.mkdir(uploadDirPath, { recursive: true });
    }

    const projectFolders = await fs.readdir(uploadDirPath, { withFileTypes: true });
    
    console.log(`\nStarting upload from "${uploadDirPath}"...\n`);

    if (projectFolders.length === 0) {
      console.log('No project folders found in the upload directory. Please add project folders and files to continue.');
      return;
    }

    for (const dirent of projectFolders) {
      if (dirent.isDirectory()) {
        await processProjectFolder(path.join(uploadDirPath, dirent.name));
      }
    }

    console.log('\n-------------------------------------');
    console.log('Processing complete.');
    console.log('-------------------------------------\n');

  } catch (error) {
    console.error('An unexpected error occurred:', error);
  }
}

startUpload();
