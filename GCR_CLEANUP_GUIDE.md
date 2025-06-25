# Guide: Manually Cleaning Up Function Build Images

You've encountered a deployment error where Firebase couldn't automatically clean up old build files. This is **not a code error**, but an issue in the deployment environment. Following these steps will resolve it.

**Why is this happening?**
Every time you deploy a function, a new "build image" is created. Firebase tries to delete the old ones to save space and prevent small storage costs. Sometimes, this cleanup process fails due to a temporary issue or permissions problem. The fix is to delete them manually.

---

## Step 1: Open the Container Registry Page

### Method A: Use the Direct Link (Recommended)

1.  **Make sure you are logged into the correct Google Account** in your browser (the same one you use for Firebase).
2.  Click this link to go directly to the correct page in the Google Cloud Console:
    [https://console.cloud.google.com/gcr/images/broad-oak-build-live/eu/gcf](https://console.cloud.google.com/gcr/images/broad-oak-build-live/eu/gcf)

### Method B: Manual Navigation (If the link doesn't work)

If the link doesn't take you to the right place, follow these steps:

1.  Go to the Google Cloud Console home: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2.  At the top of the page, you'll see a **search bar**. Type `Container Registry` into the search bar and press Enter.
3.  Click on the "Container Registry" result from the search list.
4.  You will see a list of folders. Click on the folder named **`gcf`**.
5.  On the next screen, you will likely see a region folder (e.g., `eu` or `us`). Click on it. You should now be on the correct page.

---

## Step 2: Navigate to the Function's Folder

Once you are on the Container Registry page (it should have "gcr.io/broad-oak-build-live/eu/gcf" or similar in the title), you will see a folder named after your function: **`sendShiftNotification`**. Click on it.

## Step 3: Delete Old Images

You will now see a list of items with long, random-looking names called "digests". These are your old build files.

1.  At the top of the list, there is a **checkbox**. Check it to select **all** the items.
2.  Click the **DELETE** button at the top of the page.
3.  A pop-up will ask you to confirm. Confirm the deletion.

**Note:** It is completely safe to delete all of these. The correct, new version of your function has already been uploaded, and this folder will be repopulated on the next successful deployment.

## Step 4: Re-run the Deployment Command

Once the deletion is complete, go back to the terminal in your IDE and run the deployment command again:
```
npx firebase deploy --only functions
```

This time, the deployment should complete without any cleanup errors.
