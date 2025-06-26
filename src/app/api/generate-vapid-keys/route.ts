import { NextResponse } from 'next/server';
import * as webPush from 'web-push';

// This route handler runs only on the server.
export async function GET() {
  try {
    // web-push is a server-side library, and it's safe to use it here.
    const vapidKeys = webPush.generateVAPIDKeys();
    return NextResponse.json(vapidKeys);
  } catch (error) {
    console.error('Failed to generate VAPID keys:', error);
    // Return a server error response
    return NextResponse.json(
      { error: 'Failed to generate VAPID keys on the server.' },
      { status: 500 }
    );
  }
}
