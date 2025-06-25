'use server';

// This function will only ever run on the server.
export async function generateVapidKeysAction(): Promise<{ publicKey: string; privateKey: string }> {
  const webPush = require('web-push');
  return webPush.generateVAPIDKeys();
}
