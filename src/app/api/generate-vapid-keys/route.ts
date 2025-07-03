
import { NextResponse } from 'next/server';
import * as webPush from 'web-push';

export async function GET() {
  try {
    const vapidKeys = webPush.generateVAPIDKeys();
    return NextResponse.json(vapidKeys);
  } catch (error) {
    console.error('Error generating VAPID keys:', error);
    // It's good practice to not expose detailed internal errors to the client.
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to generate VAPID keys.', details: errorMessage },
      { status: 500 }
    );
  }
}
