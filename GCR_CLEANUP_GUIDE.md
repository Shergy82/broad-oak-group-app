# Guide: Manually Cleaning Up Function Build Images

My apologies, you're right. You can't click links directly in the editor. Thank you for pointing that out.

Please **copy the full URL below** and paste it into your web browser's address bar to go to the correct page.

---

### Step 1: Go to the Container Registry Page

1.  **Make sure you are logged into the correct Google Account** in your browser (the same one you use for Firebase).
2.  **Copy this entire link** and paste it into your browser's address bar:
    ```
    https://console.cloud.google.com/gcr/images/broad-oak-build-live/eu/gcf
    ```
    *You mentioned the page flashes and redirects. If this happens, close the tab and try pasting the link again. Sometimes it takes a second try to stay on the correct "Container Registry" page.*

---

### Step 2: Navigate to the Function's Folder

Once you are on the Container Registry page (it should have "gcr.io/broad-oak-build-live/eu/gcf" in the title), you will see a folder named after your function: **`sendShiftNotification`**. Click on it.

---

### Step 3: Delete Old Images

You will now see a list of items with long, random-looking names called "digests". These are your old build files.

1.  At the top of the list, there is a **checkbox**. Check it to select **all** the items.
2.  Click the **DELETE** button at the top of the page.
3.  A pop-up will ask you to confirm. Confirm the deletion.

**Note:** It is completely safe to delete all of these. The correct, new version of your function has already been uploaded, and this folder will be repopulated on the next successful deployment.

---

### Step 4: Re-run the Deployment Command

Once the deletion is complete, go back to the terminal in your IDE and run the deployment command again:
```
npx firebase deploy --only functions
```

This time, the deployment should complete without any cleanup errors.
