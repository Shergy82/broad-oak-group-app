
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, query, where, Timestamp, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload } from 'lucide-react';
import type { Shift, UserProfile, ShiftStatus } from '@/types';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

type ParsedShift = Omit<Shift, 'id' | 'status' | 'date' | 'createdAt'> & { date: Date };
type UserMapEntry = { uid: string; normalizedName: string; originalName: string; };

export interface FailedShift {
    sheetName: string;
    date: Date | null;
    projectAddress: string;
    cellContent: string;
    reason: string;
}

interface DryRunResult {
    found: ParsedShift[];
    failed: FailedShift[];
}

interface FileUploaderProps {
    onImportComplete: (failedShifts: FailedShift[], dryRunResult?: DryRunResult) => void;
    onFileSelect: () => void;
}


// --- Helper Functions ---
const levenshtein = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

const normalizeText = (text: string) => (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const findUser = (name: string, userMap: UserMapEntry[]): UserMapEntry | null => {
    const normalizedName = normalizeText(name);
    if (!normalizedName) return null;

    let bestMatch: UserMapEntry | null = null;
    let minDistance = Infinity;

    for (const user of userMap) {
        // Direct match on normalized full name
        if (user.normalizedName === normalizedName) {
            return user;
        }

        const distance = levenshtein(normalizedName, user.normalizedName);
        const nameParts = user.originalName.split(' ');
        const firstNameNormalized = nameParts.length > 0 ? normalizeText(nameParts[0]) : '';
        
        // Prioritize matches where the input is a substring of the full name or first name
        if (user.normalizedName.includes(normalizedName) || (firstNameNormalized && firstNameNormalized.includes(normalizedName))) {
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = user;
            }
        }
        
        // Allow for small typos (threshold is 25% of name length, but at least 1)
        const threshold = Math.max(1, Math.floor(normalizedName.length / 4));
        if (distance <= threshold && distance < minDistance) {
            minDistance = distance;
            bestMatch = user;
        }
    }
    
    // Only return a fuzzy match if it's reasonably close (e.g., distance < 3)
    if (bestMatch && minDistance < 3) {
        return bestMatch;
    }

    return null;
}

const parseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    if (dateValue instanceof Date) {
        const d = dateValue;
        // Check for invalid date
        if (isNaN(d.getTime())) return null;
        // Standardize to UTC to avoid timezone shifts during processing
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    
    // Handle Excel's serial number format for dates
    if (typeof dateValue === 'number' && dateValue > 1) {
        // Excel's epoch starts on 1900-01-01 but incorrectly treats 1900 as a leap year.
        // The number of days between 1900-01-01 and 1970-01-01 is 25569.
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const d = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
        if (isNaN(d.getTime())) return null;
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    // Handle string dates like "DD/MM/YYYY" or "DD-MM-YYYY"
    if (typeof dateValue === 'string') {
        const parts = dateValue.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
        if (parts) {
            const day = parseInt(parts[1], 10);
            const month = parseInt(parts[2], 10) - 1; // JS months are 0-indexed
            const year = parseInt(parts[3], 10);
            if (year > 1900 && month >= 0 && month < 12 && day > 0 && day <= 31) {
                const d = new Date(Date.UTC(year, month, day));
                if (!isNaN(d.getTime())) return d;
            }
        }
    }
    return null;
};

// A simple check to see if a string is likely to be a project address
const isLikelyAddress = (str: string): boolean => {
    if (!str || typeof str !== 'string' || str.length < 5) return false;
    const lowerCaseStr = str.toLowerCase();
    
    // Exclude common header or ignored keywords
    const excludedKeywords = ['week commencing', 'project address', 'job address', 'information:', 'house:', 'completion date'];
    if (excludedKeywords.some(keyword => lowerCaseStr.startsWith(keyword))) {
        return false;
    }
    
    // An address usually contains both letters and numbers
    if (!/\d/.test(str) || !/[a-zA-Z]/.test(str)) return false;

    // An address usually has at least two parts (e.g., number and street name)
    if (str.trim().split(/\s+/).length < 2) return false;
    
    return true;
};

export function FileUploader({ onImportComplete, onFileSelect }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
       if (selectedFile) {
        setFile(selectedFile);
        setError(null);
        onFileSelect();
       }
    }
  };
  
  // Creates a unique, consistent key for a shift based on its core properties
  const getShiftKey = (shift: { userId: string; date: Date | Timestamp; type: 'am' | 'pm' | 'all-day'; address: string; }): string => {
    const d = (shift.date as any).toDate ? (shift.date as Timestamp).toDate() : (shift.date as Date);
    const normalizedDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return `${normalizedDate.toISOString().slice(0, 10)}-${shift.userId}-${shift.type}-${normalizeText(shift.address)}`;
  };


  const handleImport = async () => {
    if (!file || !db) {
      setError('Please select a file first.');
      return;
    }

    setIsUploading(true);
    setError(null);
    onImportComplete([], undefined); // Clear previous reports

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data.");
        
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const userMap: UserMapEntry[] = usersSnapshot.docs.map(doc => {
            const user = doc.data() as UserProfile;
            return {
                uid: doc.id,
                normalizedName: normalizeText(user.name),
                originalName: user.name,
            };
        });
        
        const shiftsFromExcel: ParsedShift[] = [];
        const failedShifts: FailedShift[] = [];
        const allDatesFound: Date[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false, defval: '' });
            
            let dateRow: (Date | null)[] = [];
            let dateRowIndex = -1;
            let projectAddress = '';
            let bNumber = '';
            let manager = '';
            
            // --- New Block-Based Parsing Logic ---
            for (let r = 0; r < jsonData.length; r++) {
                const row = jsonData[r] || [];
                const firstCell = (row[0] || '').toString().trim();

                // --- 1. Detect start of a new project block ---
                // A new block is identified by a cell in Column A that looks like an address.
                if (isLikelyAddress(firstCell)) {
                    // Reset context for the new block
                    projectAddress = firstCell;
                    bNumber = (row[1] || '').toString().trim();
                    manager = (row[2] || '').toString().trim(); // Assuming manager is in Col C
                    dateRow = [];
                    dateRowIndex = -1;
                    
                    // --- 2. Find the date row *within* this new block ---
                    // Search in the next few rows for the date row
                    for (let i = r + 1; i < Math.min(r + 5, jsonData.length); i++) {
                        const potentialDateRow = jsonData[i] || [];
                        const potentialDates = potentialDateRow.map(parseDate);
                        const validDateCount = potentialDates.filter(d => d !== null).length;
                        
                        // A date row must have at least 3 valid dates
                        if (validDateCount >= 3) {
                            dateRow = potentialDates;
                            dateRowIndex = i;
                            dateRow.forEach(d => { if (d) allDatesFound.push(d); });
                            break; // Found the date row for this block
                        }
                    }

                    // If no date row found, we can't process this block
                    if (dateRowIndex === -1) continue;

                    // --- 3. Parse shifts for this block ---
                    // Start parsing from the row after the date row
                    // and continue until we hit the next project block or end of data
                    for (let shiftRowIndex = dateRowIndex + 1; shiftRowIndex < jsonData.length; shiftRowIndex++) {
                        const shiftRowData = jsonData[shiftRowIndex] || [];
                        const nextBlockIdentifier = (shiftRowData[0] || '').toString().trim();

                        // If we encounter a new address, this block is finished.
                        if (isLikelyAddress(nextBlockIdentifier)) {
                            r = shiftRowIndex - 1; // Move the outer loop to the row before the new block
                            break;
                        }

                        // Skip empty rows
                        if (!shiftRowData.some(cell => cell.toString().trim() !== '')) continue;
                        
                        for (let c = 0; c < shiftRowData.length; c++) {
                            const shiftDate = dateRow[c];
                            if (!shiftDate) continue; // Skip if there's no date for this column
                            
                            const cellValue = (shiftRowData[c] || '').toString().replace(/\r?\n|\r/g, " ").trim().replace(/[\u2012\u2013\u2014\u2015]/g, '-');
                            
                            if (!cellValue || cellValue.toLowerCase().includes('holiday') || cellValue.toLowerCase().includes('on hold')) {
                                continue;
                            }
                            
                            const parts = cellValue.split('-').map(p => p.trim());
                            if (parts.length < 2) continue; // Must be at least "Task - User"

                            const namePart = parts.pop()!;
                            let task = parts.join('-').trim().toUpperCase();
                            
                            const nameCandidates = namePart.split(/[/&+,]/).map(name => name.trim()).filter(Boolean);

                            for (const name of nameCandidates) {
                                const foundUser = findUser(name, userMap);
                                
                                if (foundUser) {
                                    let type: 'am' | 'pm' | 'all-day' = 'all-day';
                                    const amPmMatch = task.match(/\b(AM|PM)\b/i);
                                    if (amPmMatch) {
                                        type = amPmMatch[0].toLowerCase() as 'am' | 'pm';
                                        task = task.replace(new RegExp(`\\s*\\b${amPmMatch[0]}\\b`, 'i'), '').trim();
                                    }
                                    shiftsFromExcel.push({ task, userId: foundUser.uid, type, date: shiftDate, address: projectAddress, bNumber, manager });
                                } else {
                                    if (shiftDate >= today) {
                                        failedShifts.push({ sheetName, date: shiftDate, projectAddress, cellContent: cellValue, reason: `Unrecognized Operative: "${name}".` });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        if (dryRun) {
            onImportComplete(failedShifts, { found: shiftsFromExcel, failed: failedShifts });
            setIsUploading(false);
            return;
        }

        // --- Reconciliation Logic (only if not a dry run) ---
        if (allDatesFound.length === 0) {
            throw new Error("No valid shifts found in any sheet. Please ensure at least one sheet has a valid date row and shift data.");
        }

        const minDate = new Date(Math.min(...allDatesFound.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDatesFound.map(d => d.getTime())));

        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('date', '>=', Timestamp.fromDate(minDate)),
            where('date', '<=', Timestamp.fromDate(maxDate))
        );
        const existingShiftsSnapshot = await getDocs(shiftsQuery);

        const existingShiftsMap = new Map<string, Shift>();
        existingShiftsSnapshot.forEach(doc => {
            const shiftData = { id: doc.id, ...doc.data() } as Shift;
            existingShiftsMap.set(getShiftKey(shiftData), shiftData);
        });

        const excelShiftsMap = new Map<string, ParsedShift>();
        for (const excelShift of shiftsFromExcel) {
          excelShiftsMap.set(getShiftKey(excelShift), excelShift);
        }

        const batch = writeBatch(db);
        let shiftsCreated = 0;
        let shiftsUpdated = 0;
        let shiftsDeleted = 0;

        const protectedStatuses: ShiftStatus[] = ['completed', 'incomplete'];

        for (const [key, excelShift] of excelShiftsMap.entries()) {
            const existingShift = existingShiftsMap.get(key);

            if (existingShift) {
                if (existingShift.task !== excelShift.task || existingShift.bNumber !== (excelShift.bNumber || '') || existingShift.manager !== (excelShift.manager || '')) {
                     if (!protectedStatuses.includes(existingShift.status)) {
                        batch.update(doc(db, 'shifts', existingShift.id), { task: excelShift.task, bNumber: excelShift.bNumber || '', manager: excelShift.manager || '' });
                        shiftsUpdated++;
                     }
                }
                existingShiftsMap.delete(key);
            } else {
                const newShiftData = {
                    ...excelShift,
                    date: Timestamp.fromDate(excelShift.date),
                    status: 'pending-confirmation',
                    createdAt: serverTimestamp(),
                };
                batch.set(doc(collection(db, 'shifts')), newShiftData);
                shiftsCreated++;
            }
        }

        for (const [key, shiftToDelete] of existingShiftsMap.entries()) {
             if (!protectedStatuses.includes(shiftToDelete.status)) {
                batch.delete(doc(db, 'shifts', shiftToDelete.id));
                shiftsDeleted++;
             }
        }
        
        if (shiftsCreated > 0 || shiftsUpdated > 0 || shiftsDeleted > 0) {
            await batch.commit();
        }
        
        let descriptionParts = [];
        if (shiftsCreated > 0) descriptionParts.push(`created ${shiftsCreated} new shift(s)`);
        if (shiftsUpdated > 0) descriptionParts.push(`updated ${shiftsUpdated} shift(s)`);
        if (shiftsDeleted > 0) descriptionParts.push(`deleted ${shiftsDeleted} old shift(s)`);

        if (descriptionParts.length > 0) {
            toast({
                title: 'Import Complete & Reconciled',
                description: `Successfully processed the file: ${descriptionParts.join(', ')}.`,
            });
        } else if (failedShifts.length === 0) {
            toast({
                title: 'No Changes Detected',
                description: "The schedule was up-to-date. No changes were made.",
            });
        }
        
        onImportComplete(failedShifts, undefined);

        setFile(null);
        const fileInput = document.getElementById('shift-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = "";

      } catch (err: any) {
        console.error('Import failed:', err);
        setError(err.message || 'An unexpected error occurred during import.');
        onImportComplete([], undefined);
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = () => {
        setError('Failed to read the file.');
        setIsUploading(false);
    }

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Import Error</AlertTitle>
          <AlertDescription style={{ whiteSpace: 'pre-wrap' }}>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Input
          id="shift-file-input"
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          className="flex-grow file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
        />
         <div className="flex items-center space-x-2 self-start sm:self-center">
            <Checkbox id="dry-run" checked={dryRun} onCheckedChange={(checked) => setDryRun(checked as boolean)} />
            <Label htmlFor="dry-run" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Dry Run
            </Label>
        </div>
        <Button onClick={handleImport} disabled={!file || isUploading} className="w-full sm:w-auto">
          {isUploading ? <Spinner /> : <><Upload className="mr-2 h-4 w-4" /> {dryRun ? 'Test Import' : 'Import Shifts'}</>}
        </Button>
      </div>
    </div>
  );
}

