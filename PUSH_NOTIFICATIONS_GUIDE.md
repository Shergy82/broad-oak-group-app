# Step-by-Step Guide: Setting Up Push Notifications

This guide will walk you through the entire process of enabling push notifications for your application. I've pre-built all the necessary server files for you to make this as simple as possible.

## Step 1: Install Firebase Tools & Log In

If you haven't already, you'll need the Firebase Command-Line Interface (CLI).

1.  **Install the Tools:** Open your computer's terminal and run this command. You only need to do this once.
    ```bash
    npm install -g firebase-tools
    ```

2.  **Log In to Firebase:** Connect the CLI to your Firebase account. This will open a browser window to authenticate you.
    ```bash
    firebase login
    ```

## Step 2: Install Function Dependencies

The code for your server-side function has been added to the `functions` folder, but you need to install its dependencies.

1.  **Navigate into the functions directory:**
    ```bash
    cd functions
    ```
2.  **Install the dependencies:**
    ```bash
    npm install
    ```
3.  **Navigate back to the root directory:**
    ```bash
    cd ..
    ```

## Step 3: Generate and Configure Your VAPID Keys

VAPID keys are a secure key pair that allows your server to send messages.

1.  **Generate Keys in the App:** Go to the `/admin` page of your running application. In the "Push Notification VAPID Keys" card, click **Generate Keys**. This will display your unique Public Key, Private Key, and a command to run. Keep this page open.

2.  **Set the Public Key:** In your project's code editor, find or create the file named `.env.local` in the root directory. Add your **Public Key** to it like this:
    ```bash
    NEXT_PUBLIC_VAPID_PUBLIC_KEY="PASTE_YOUR_PUBLIC_KEY_HERE"
    ```
    **Important:** You must restart your Next.js development server after saving this file.

3.  **Securely Store Both Keys for the Server:** The **Private Key** is a secret and must not be saved in your code. Copy the full command provided by the key generator on the Admin page (it starts with `firebase functions:config:set...`) and run it in your terminal. This securely stores both keys for your Firebase Function.

## Step 4: Deploy Your Function

Finally, deploy your pre-built function to Firebase. Run this command from the **root directory** of your project.

```bash
firebase deploy --only functions
```

---

**That's it!** Once the function is deployed, your application will be fully configured to send push notifications to users whenever their shifts are created or updated.