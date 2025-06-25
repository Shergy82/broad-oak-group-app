
# Push Notifications Troubleshooting Guide

If you are not receiving push notifications after clicking the "Send Test Notification" button, it's likely due to a configuration issue on the backend. Here are the most common causes and how to fix them.

## Step 1: Deploy Your Cloud Function

The code that sends notifications runs on a server as a "Cloud Function". If it hasn't been deployed, nothing can be sent.

1. Open the built-in terminal in Firebase Studio.
2. Run the following command **one time**:
   ```bash
   npx firebase deploy --only functions
   ```
3. Wait for the command to complete. It may take a minute or two. Once it says "Deploy complete!", your function is live.

## Step 2: Configure Your VAPID Keys

Push notifications require special security keys called VAPID keys. You must generate these and tell your server about them.

1. Go to the **Admin** page in your running application.
2. Find the **Push Notification VAPID Keys** card and click **Generate Keys**.
3. **Important:** Two keys (and a command) will appear. You must follow both steps shown on the card:
   - **Step 1:** Copy the **Public Key** and add it to your `.env.local` file.
   - **Step 2:** Copy the entire **Firebase CLI command** and run it in the built-in terminal. This command securely saves your secret Private Key on the server where the Cloud Function can access it.

**If you do not run the command from Step 2, the server will not have the keys and cannot send notifications.**

## Step 3: Subscribe in Your Browser

You must give the website permission to send you notifications.

1.  In the header of the app, find the **bell icon**.
2.  Click the bell icon. Your browser will ask for permission to show notifications.
3.  Click **Allow**.
4.  The icon should change to a **ringing bell** (<BellRing />), which confirms you are subscribed.

## Step 4: Check the Function Logs (If It's Still Not Working)

If you've done all the steps above and it's still not working, the server logs will tell you why.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project.
3.  In the left-hand menu under "Build", click on **Functions**.
4.  Click on the **Logs** tab.
5.  Click the "Send Test Notification" button in your app again.
6.  Look for new log entries in the Firebase Console from `sendShiftNotification`. The logs are now very detailed and will tell you if keys are missing, if the user isn't subscribed, or if another error occurred.
