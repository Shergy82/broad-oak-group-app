# Guide: Manually Cleaning Up Function Build Images

You've encountered a deployment error where Firebase couldn't automatically clean up old build files. This is **not a code error**, but an issue in the deployment environment. Following these steps will resolve it.

**Why is this happening?**
Every time you deploy a function, a new "build image" is created. Firebase tries to delete the old ones to save space and prevent small storage costs. Sometimes, this cleanup process fails due to a temporary issue or permissions problem. The fix is to delete them manually.

## Step-by-Step Instructions

1.  **Open the Container Registry:**
    Click on this link to go directly to the correct page in the Google Cloud Console. You may need to log in with the same Google account you use for Firebase.
    [https://console.cloud.google.com/gcr/images/broad-oak-build-live/eu/gcf](https://console.cloud.google.com/gcr/images/broad-oak-build-live/eu/gcf)

2.  **Navigate to the Function's Folder:**
    On the page that loads, you will see a folder named after your function: `sendShiftNotification`. Click on it.

3.  **Delete Old Images:**
    You will now see a list of "digests". These are your old build files.
    - Check the box at the top of the list to select **all** the images.
    - Click the **DELETE** button at the top of the page.
    - You will be asked to confirm. Confirm the deletion.

    **Note:** It is completely safe to delete all of these. The correct, new version of your function has already been uploaded, and this folder will be repopulated on the next successful deployment.

4.  **Re-run the Deployment Command:**
    Once the deletion is complete, go back to the terminal in your IDE and run the deployment command again:
    ```
    npx firebase deploy --only functions
    ```

This time, the deployment should complete without any cleanup errors.