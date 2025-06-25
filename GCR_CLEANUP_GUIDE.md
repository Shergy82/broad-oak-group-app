
# Guide: Cleaning Up Build Files with the Command Line

My sincerest apologies for this frustrating situation. You are completely right—the Google Cloud Console is phasing out the old Container Registry, which is why the web page isn't working.

To fix this, we will bypass the broken web page and use a single command in the terminal. This is a more direct and reliable method.

---

### Step 1: Run the Cleanup Command

1.  Open the **built-in terminal** in your IDE.
2.  **Copy the entire command below** and paste it into the terminal, then press Enter. This command will find and delete all the old, stuck build files for your function.

```
gcloud container images delete gcr.io/broad-oak-build-live/eu/gcf/sendShiftNotification --force-delete-tags --quiet
```
*You may be asked to authorize the command. If so, please approve it.*

---

### Step 2: Re-run the Deployment Command

Once the cleanup command has finished, the old files will be gone. Now you can deploy the new version of the function without any issues.

Run the deployment command again in the terminal:

```
npx firebase deploy --only functions
```

---

This should resolve the deployment error permanently. Thank you again for your incredible patience.
