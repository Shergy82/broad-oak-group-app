'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export default function PerformancePage() {
  return (
      <Card>
        <CardHeader>
          <CardTitle>Operative Performance</CardTitle>
          <CardDescription>
            This dashboard provides key performance indicators for each operative based on their shift history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center h-96">
            <Construction className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Under Construction</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The performance metrics dashboard is being built and will be available here soon.
            </p>
          </div>
        </CardContent>
      </Card>
  );
}
