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
import { addDays, isValid, parse } from 'date-fns';

// Define the data structures we will be working with
export type ParsedShift = {
  task: string;
  userId: string;
  userName: string;
  date: Date;
  address: string;
  type: 'am' | 'pm' | 'all-day';
  manager: string;
};

export interface FailedShift {
  date: Date | string | null;
  projectAddress: string;
  cellContent: string;
  reason: string;
  sheetName: string;
  rowNumber: number;
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

// --- Cell Parsing Utilities ---
const getCellValue = (sheet: XLSX.WorkSheet, row: number, col: number): string => {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = sheet[cellAddress];
    // Use .w for formatted text, fallback to .v for raw value
    return cell ? String(cell.w || cell.v || '').trim() : '';
};

const parseDate = (dateStr: string): Date | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;

    // Handles formats like 'Mon 22-Jul', '22-Jul', etc.
    const date = parse(dateStr, 'E dd-MMM', new Date());
    if (isValid(date)) return date;
    
    const date2 = parse(dateStr, 'dd-MMM', new Date());
    if (isValid(date2)) return date2;

    // Handle Excel's date serial number format
    const excelDateNumber = Number(dateStr);
    if (!isNaN(excelDateNumber) && excelDateNumber > 1) {
        // Excel's epoch starts on 1900-01-01, but it has a bug where it thinks 1900 was a leap year.
        // It's safer to treat the number as days since 1899-12-30.
        const excelEpoch = new Date(1899, 11, 30);
        return addDays(excelEpoch, excelDateNumber);
    }
      
    return null;
}

// A more robust check for a date row
const isDateRow = (sheet: XLSX.WorkSheet, row: number): boolean => {
    let dateCount = 0;
    // A row is a date row if it has at least 3 valid dates starting from column F
    for (let C = 5; C < 20; C++) { // Check from col F up to T
        const cellValue = getCellValue(sheet, row, C);
        if (cellValue && parseDate(cellValue)) {
            dateCount++;
        }
    }
    return dateCount >= 3;
};


export function FileUploader({ onImportComplete, onFileSelect, shiftsToPublish, children }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [enabledSheets, setEnabledSheets] = useState<{ [key: string]: boolean }>({});
  const { users, loading: usersLoading } = useAllUsers();
  const { toast } = useToast();

  const userMap = new Map<string, string>();
  if (users) {
    users.forEach(u => userMap.set(u.name.toUpperCase(), u.uid));
  }


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
    console.log("--- Starting File Processing ---");
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    if (usersLoading) {
      setError("Still loading user data. Please wait a moment and try again.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    toast({ title: "Processing File...", description: "Reading shifts from the selected sheets." });

    // Use a timeout to ensure the UI updates before the heavy processing begins
    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            if (!data) {
                 throw new Error("Could not read file data.");
            }
            
            const workbook = XLSX.read(data, { type: 'array' });
            console.log("Workbook parsed. Sheets found:", workbook.SheetNames);
            
            let allShifts: ParsedShift[] = [];
            let allFailed: FailedShift[] = [];
    
            workbook.SheetNames.forEach(sheetName => {
                if (!enabledSheets[sheetName]) {
                    console.log(`Skipping sheet: ${sheetName} (disabled)`);
                    return;
                }
                console.log(`\n--- Processing sheet: ${sheetName} ---`);
                
                const sheet = workbook.Sheets[sheetName];
                const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
                // State machine variables for a single job block
                let currentManager = '';
                let currentAddress = '';
                let dateRowData: { col: number; date: Date }[] = [];
                let inJobBlock = false;
                let inAddressSection = false;
    
                for (let R = range.s.r; R <= range.e.r; R++) {
                    const rowNumForLog = R + 1;
                    const firstColValue = getCellValue(sheet, R, 0); // Column A
    
                    // 1. Find START OF NEW JOB
                    if (firstColValue.toUpperCase() === 'START OF NEW JOB') {
                        console.log(`[Row ${rowNumForLog}] Found 'START OF NEW JOB'. Resetting for new block.`);
                        inJobBlock = true;
                        inAddressSection = false;
                        currentManager = '';
                        currentAddress = '';
                        dateRowData = [];
                        continue; // Skip the rest of the logic for this row
                    }

                    if (!inJobBlock) {
                        continue; // Keep scanning until a job block starts
                    }

                    // 2. Find JOB MANAGER
                    if (firstColValue.toUpperCase() === 'JOB MANAGER') {
                        const managerName = getCellValue(sheet, R + 1, 0); // Name is in the row below
                        if (managerName) {
                            currentManager = managerName;
                            console.log(`[Row ${R + 2}] Found Manager: '${currentManager}'`);
                        }
                        continue;
                    }
                    
                    // 3. Find ADDRESS
                    if (firstColValue.toUpperCase() === 'ADDRESS') {
                        inAddressSection = true;
                        console.log(`[Row ${rowNumForLog}] Found 'ADDRESS' header. Starting address accumulation.`);
                        // The actual address starts on the next line
                        continue;
                    }

                    // 4. Accumulate address lines
                    if (inAddressSection) {
                         // Check for the dark blue boundary line which contains a date
                        const isBoundary = parseDate(firstColValue) !== null;
                        if (isBoundary) {
                            console.log(`[Row ${rowNumForLog}] Found address end boundary. Final Address: "${currentAddress}"`);
                            inAddressSection = false;
                            // Continue to check if this is the date row
                        } else {
                            currentAddress = currentAddress ? `${currentAddress}\n${firstColValue}` : firstColValue;
                        }
                    }

                    // 5. Find the Date Row (light blue)
                    if (isDateRow(sheet, R)) {
                        console.log(`[Row ${rowNumForLog}] Identified as Date Row.`);
                        dateRowData = []; // Reset for this row
                        for (let C = 5; C <= range.e.c; C++) { // Start from column F
                            const dateStr = getCellValue(sheet, R, C);
                            if (!dateStr) break; // Stop at first blank
                            const parsed = parseDate(dateStr);
                            if (parsed) {
                                dateRowData.push({ col: C, date: parsed });
                            }
                        }
                        console.log(`[Row ${rowNumForLog}] Parsed ${dateRowData.length} dates.`);
                        continue; // Date row itself doesn't contain shifts
                    }

                    // 6. Parse Shift Grid Rows
                    if (dateRowData.length > 0) {
                         if (firstColValue.toUpperCase() === 'END OF THIS JOB') {
                             console.log(`[Row ${rowNumForLog}] Found 'END OF THIS JOB'. Ending current block processing.`);
                             inJobBlock = false;
                             continue;
                         }

                        let isShiftRow = false;
                        for (const { col, date } of dateRowData) {
                            const cellContent = getCellValue(sheet, R, col);
                            if (!cellContent) continue;
                            
                            isShiftRow = true; // Mark this as a row containing shifts
                            console.log(`[Row ${rowNumForLog}, Col ${col+1}] Found shift cell: "${cellContent}"`);

                            const parts = cellContent.split('-').map(p => p.trim());
                            if (parts.length < 2) {
                                allFailed.push({ date, projectAddress: currentAddress, cellContent, reason: "Invalid format. Expected 'Task - User'.", sheetName, rowNumber: R + 1 });
                                continue;
                            }

                            const task = parts.slice(0, -1).join('-').trim();
                            const userNameFromCell = parts[parts.length - 1].trim();
                            const userId = userMap.get(userNameFromCell.toUpperCase());

                            if (!userId) {
                                allFailed.push({ date, projectAddress: currentAddress, cellContent, reason: `User '${userNameFromCell}' not found.`, sheetName, rowNumber: R + 1 });
                                continue;
                            }
                            
                            // Determine shift type by checking the cell one row above
                            let shiftType: 'am' | 'pm' | 'all-day' = 'all-day';
                             const cellAbove = getCellValue(sheet, R - 1, col).toUpperCase();
                             if (cellAbove.includes('AM')) {
                                 shiftType = 'am';
                             } else if (cellAbove.includes('PM')) {
                                 shiftType = 'pm';
                             }

                             allShifts.push({
                               task,
                               userName: userNameFromCell,
                               userId,
                               date,
                               address: currentAddress,
                               manager: currentManager,
                               type: shiftType,
                            });
                        }
                        if (isShiftRow) {
                            console.log(`[Row ${rowNumForLog}] Finished parsing shifts for this row.`);
                        }
                    }
                }
            });
            
            console.log("--- Finished All Sheets ---");
            console.log(`Total shifts parsed: ${allShifts.length}`);
            console.log(`Total failed entries: ${allFailed.length}`);

            const result: ReconciliationResult = {
                toCreate: allShifts,
                toUpdate: [],
                toDelete: [],
                failed: allFailed,
            };

            onImportComplete(allFailed, result);
            setIsProcessing(false);
            console.log("--- onImportComplete callback called ---");
    
          } catch (err: any) {
            console.error("Fatal error during file processing:", err);
            setError(`Failed to process file. Error: ${err.message}`);
            toast({ variant: "destructive", title: "Processing Error", description: err.message });
            setIsProcessing(false);
          }
        };
        reader.readAsArrayBuffer(file);
    }, 100);
  };
  
  if (shiftsToPublish) {
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
          <Button onClick={handleProcessFile} disabled={!file || isProcessing || usersLoading} className="w-full sm:w-auto ml-auto">
            {isProcessing ? <Spinner /> : isDryRun ? <><TestTube2 className="mr-2 h-4 w-4" /> Run Test</> : <><Upload className="mr-2 h-4 w-4" /> Import & Publish</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
