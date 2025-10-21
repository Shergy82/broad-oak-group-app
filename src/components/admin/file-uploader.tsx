'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, FileWarning, TestTube2, Sheet } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '../ui/label';
import type { UserProfile } from '@/types';
import { useAllUsers } from '@/hooks/use-all-users';

// Define the data structures we will be working with
export type ParsedShift = {
  task: string;
  userId: string;
  userName: string;
  date: Date;
  address: string;
  type: 'am' | 'pm' | 'all-day';
  bNumber?: string;
  manager?: string;
};

export interface FailedShift {
  date: Date | null;
  projectAddress: string;
  cellContent: string;
  reason: string;
  sheetName: string;
}

export interface ReconciliationResult {
  toCreate: ParsedShift[];
  toUpdate: { id: string; data: Partial<any> }[];
  toDelete: string[];
  failed: FailedShift[];
}

interface FileUploaderProps {
  onImportComplete: (failedShifts: FailedShift[], dryRunResult?: ReconciliationResult) => void;
  onFileSelect: () => void;
  shiftsToPublish?: ReconciliationResult | null;
  children?: React.ReactNode;
}

export function FileUploader({ onImportComplete, onFileSelect, shiftsToPublish, children }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [enabledSheets, setEnabledSheets] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();
  const { users } = useAllUsers();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
        setFile(selectedFile);
        setError(null);
        onFileSelect();

        const reader = new FileReader();
        reader.onload = (e) => {
          const data = e.target?.result;
          if (!data) return;
          // Use sheet_names property to correctly get the sheet names
          const workbook = XLSX.read(data, { type: 'array', bookSheets: true });
          const names = workbook.SheetNames;
          setSheetNames(names);
          const initialEnabled: { [key: string]: boolean } = {};
          names.forEach(name => {
            initialEnabled[name] = true;
          });
          setEnabledSheets(initialEnabled);
        };
        reader.readAsArrayBuffer(selectedFile);
      }
    }
  };

  const toggleSheet = (sheetName: string, isEnabled: boolean) => {
    setEnabledSheets(prev => ({ ...prev, [sheetName]: isEnabled }));
  }

  const handleProcessFile = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    setIsProcessing(true);
    setError(null);

    // For now, we will just simulate a successful run with no data
    // In the next steps, we will build the real parsing logic here.
    toast({ title: "Ready to Process", description: "Parsing logic will be added in the next step." });
    
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    onImportComplete([], { toCreate: [], toUpdate: [], toDelete: [], failed: [] });
    
    setIsProcessing(false);
  };
  
  if (shiftsToPublish) {
    // This is for the "Confirm and Publish" step, which we'll handle later.
    // For now, it just contains the button.
    return <div onClick={() => {}}>{children}</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>Import Error</AlertTitle>
          <AlertDescription style={{ whiteSpace: 'pre-wrap' }}>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">
        <Input
          id="shift-file-input"
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          className="w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
        />

        {sheetNames.length > 0 && (
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-medium">Select Sheets to Import</h3>
            <div className="space-y-2">
              {sheetNames.map(name => (
                <div key={name} className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor={`sheet-${name}`} className="flex items-center gap-2 text-sm font-normal">
                    <Sheet className="h-4 w-4 text-muted-foreground" />
                    {name}
                  </Label>
                  <Switch
                    id={`sheet-${name}`}
                    checked={!!enabledSheets[name]}
                    onCheckedChange={(checked) => toggleSheet(name, checked)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex items-center space-x-2">
            <Switch id="dry-run" checked={isDryRun} onCheckedChange={setIsDryRun} />
            <Label htmlFor="dry-run" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Dry Run (Preview changes before publishing)
            </Label>
          </div>
          <Button onClick={handleProcessFile} disabled={!file || isProcessing} className="w-full sm:w-auto ml-auto">
            {isProcessing ? <Spinner /> : isDryRun ? <><TestTube2 className="mr-2 h-4 w-4" /> Run Test</> : <><Upload className="mr-2 h-4 w-4" /> Import & Publish</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
