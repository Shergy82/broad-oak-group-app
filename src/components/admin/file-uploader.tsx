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
  date: Date | null;
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

const findRowsWithText = (sheet: XLSX.WorkSheet, text: string): number[] => {
    const rows: number[] = [];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
        // Check multiple columns for the text
        for (let C = range.s.c; C <= range.e.c; ++C) {
             const cellValue = getCellValue(sheet, R, C);
             if (cellValue.toUpperCase().includes(text.toUpperCase())) {
                rows.push(R);
                break; // Move to next row once found
            }
        }
    }
    return rows.sort((a, b) => a - b);
}

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
  users.forEach(u => userMap.set(u.name.toUpperCase(), u.uid));


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
      console.error("Processing stopped: No file selected.");
      setError('Please select a file first.');
      return;
    }
    if (usersLoading) {
      console.error("Processing stopped: User data is still loading.");
      setError("Still loading user data. Please wait a moment and try again.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    toast({ title: "Processing File...", description: "Reading shifts from the selected sheets." });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        console.log("File loaded into reader.");
        const data = e.target?.result;
        if (!data) {
             console.error("File reader result is empty.");
             throw new Error("Could not read file data.");
        }
        
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });
        console.log("Workbook parsed. Sheets found:", workbook.SheetNames);
        
        let allShifts: ParsedShift[] = [];
        let allFailed: FailedShift[] = [];

        workbook.SheetNames.forEach(sheetName => {
            if (!enabledSheets[sheetName]) {
                console.log(`Skipping sheet: ${sheetName} (disabled)`);
                return;
            }
            console.log(`--- Processing sheet: ${sheetName} ---`);
            
            const sheet = workbook.Sheets[sheetName];
            if (!sheet || !sheet['!ref']) {
                console.warn(`Sheet ${sheetName} is empty or invalid.`);
                return;
            }

            const range = XLSX.utils.decode_range(sheet['!ref']);
            const jobStartRows = findRowsWithText(sheet, "START OF NEW JOB");
            console.log(`Found ${jobStartRows.length} 'START OF NEW JOB' blocks at rows:`, jobStartRows.map(r => r + 1));


            jobStartRows.forEach((jobStartRow, index) => {
                const currentJobNumber = index + 1;
                console.log(`\n[Job ${currentJobNumber}] Processing block starting at row ${jobStartRow + 1}`);

                try {
                    const endOfBlockRow = (index + 1 < jobStartRows.length) ? jobStartRows[index + 1] - 1 : range.e.r;
                    console.log(`[Job ${currentJobNumber}] Block ends at row ${endOfBlockRow + 1}`);

                    // 1. Find Manager
                    const jobManagerHeaderRow = findRowsWithText(sheet, "JOB MANAGER")[index];
                    if (jobManagerHeaderRow === undefined || jobManagerHeaderRow > endOfBlockRow) {
                        console.warn(`[Job ${currentJobNumber}] Could not find 'JOB MANAGER' header in this block.`);
                        return;
                    }
                    const managerName = getCellValue(sheet, jobManagerHeaderRow + 1, 0); // Column A
                    console.log(`[Job ${currentJobNumber}] Found Manager: '${managerName}'`);

                    // 2. Find Address
                    const addressHeaderRow = findRowsWithText(sheet, "ADDRESS")[index];
                    let siteAddress = "";
                    let addressEndRow = -1;

                    if (addressHeaderRow !== undefined && addressHeaderRow < endOfBlockRow) {
                        for (let r = addressHeaderRow + 1; r <= endOfBlockRow; r++) {
                            const cellVal = getCellValue(sheet, r, 0);
                             // The dark blue line with a date is the stop signal
                            if (parseDate(cellVal)) {
                                addressEndRow = r - 1;
                                break;
                            }
                            siteAddress += (siteAddress ? '\n' : '') + cellVal;
                        }
                        if (addressEndRow === -1) addressEndRow = endOfBlockRow; // If no date found, go to end of block
                        console.log(`[Job ${currentJobNumber}] Found Address: "${siteAddress}"`);
                    } else {
                         console.warn(`[Job ${currentJobNumber}] Could not find 'ADDRESS' header in this block.`);
                    }

                    // 3. Find Date Row
                    let dateRow = -1;
                    for (let r = addressEndRow > -1 ? addressEndRow : jobStartRow; r <= endOfBlockRow; r++) {
                        if (isDateRow(sheet, r)) {
                            dateRow = r;
                            break;
                        }
                    }

                    if (dateRow === -1) {
                         console.warn(`[Job ${currentJobNumber}] Could not find a valid date row for this block.`);
                         return;
                    }
                    console.log(`[Job ${currentJobNumber}] Found Date Row at row ${dateRow + 1}`);
                    
                    const dates: { col: number; date: Date }[] = [];
                    for (let c = 5; c <= range.e.c; c++) { // Check from col F onwards
                        const dateStr = getCellValue(sheet, dateRow, c);
                        if (!dateStr && dates.length > 0) {
                            console.log(`[Job ${currentJobNumber}] End of dates at column ${C}.`);
                            break; // Stop at first blank after finding some dates
                        }
                        const parsed = parseDate(dateStr);
                        if (parsed) {
                            dates.push({ col: c, date: parsed });
                        }
                    }
                    console.log(`[Job ${currentJobNumber}] Parsed ${dates.length} dates.`);

                    // 4. Parse Shift Grid
                    const gridStartRow = dateRow + 1;
                    const gridEndRow = endOfBlockRow;
                    console.log(`[Job ${currentJobNumber}] Scanning shift grid from row ${gridStartRow + 1} to ${gridEndRow + 1}`);

                    for (let r = gridStartRow; r <= gridEndRow; r++) {
                         // Check if this row is the start of the next job block and stop
                        const firstCell = getCellValue(sheet, r, 0);
                        if (firstCell.toUpperCase().includes('START OF NEW JOB') || firstCell.toUpperCase().includes('END OF THIS JOB')) {
                            console.log(`[Job ${currentJobNumber}] Reached end of grid at row ${r + 1}`);
                            break;
                        }

                        for (const { col, date } of dates) {
                            const cellContent = getCellValue(sheet, r, col);
                            if (!cellContent) continue;
                            
                            console.log(`[Job ${currentJobNumber}] Found shift cell at (R${r+1}, C${col+1}): "${cellContent}"`);

                            const parts = cellContent.split('-').map(p => p.trim());
                            if (parts.length < 2) {
                                allFailed.push({ date, projectAddress: siteAddress, cellContent, reason: "Invalid format. Expected 'Task - User'.", sheetName, rowNumber: r + 1 });
                                continue;
                            }

                            const task = parts.slice(0, -1).join('-').trim();
                            const userNameFromCell = parts[parts.length - 1].trim();
                            const userId = userMap.get(userNameFromCell.toUpperCase());

                            if (!userId) {
                                allFailed.push({ date, projectAddress: siteAddress, cellContent, reason: `User '${userNameFromCell}' not found in the system.`, sheetName, rowNumber: r + 1 });
                                continue;
                            }

                            let shiftType: 'am' | 'pm' | 'all-day' = 'all-day';
                            const cellAbove = getCellValue(sheet, r - 1, col).toUpperCase();
                            if (cellAbove.includes('AM')) {
                                shiftType = 'am';
                            } else if (cellAbove.includes('PM')) {
                                shiftType = 'pm';
                            }
                            
                            const newShift = {
                              task,
                              userName: userNameFromCell,
                              userId,
                              date,
                              address: siteAddress,
                              manager: managerName,
                              type: shiftType, 
                            };
                            console.log(`[Job ${currentJobNumber}] Successfully parsed shift:`, newShift);
                            allShifts.push(newShift);
                        }
                    }
                } catch (jobError: any) {
                    console.error(`An error occurred while processing Job ${currentJobNumber} in sheet ${sheetName}:`, jobError);
                    // Add a generic failure for this block
                    allFailed.push({ date: null, projectAddress: `Job ${currentJobNumber}`, cellContent: "Block Processing Failed", reason: jobError.message, sheetName, rowNumber: jobStartRow + 1 });
                }
            });
        });

        console.log("--- Finished All Sheets ---");
        console.log(`Total shifts parsed: ${allShifts.length}`);
        console.log(`Total failed entries: ${allFailed.length}`);
        
        const dryRunResult: ReconciliationResult = {
          toCreate: allShifts,
          toUpdate: [],
          toDelete: [],
          failed: allFailed,
        };
        
        onImportComplete(allFailed, dryRunResult);
        console.log("--- onImportComplete callback called ---");

      } catch (err: any) {
        console.error("Fatal error during file processing:", err);
        setError(`Failed to process file. Error: ${err.message}`);
        toast({ variant: "destructive", title: "Processing Error", description: err.message });
      } finally {
        setIsProcessing(false);
         console.log("--- Ending File Processing ---");
      }
    };
    reader.readAsArrayBuffer(file);
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
