'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, query, where, Timestamp, serverTimestamp, deleteDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, FileWarning, TestTube2, Sheet, XCircle, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import type { Shift, UserProfile, ShiftStatus } from '@/types';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useAllUsers } from '@/hooks/use-all-users';

export type ParsedShift = Omit<Shift, 'id' | 'status' | 'date' | 'createdAt'> & { date: Date };
type UserMapEntry = { uid: string; normalizedName: string; originalName: string; };

export interface FailedShift {
    date: Date | null;
    projectAddress: string;
    cellContent: string;
    reason: string;
    sheetName: string;
}

interface ReconciliationResult {
  toCreate: ParsedShift[];
  toUpdate: { id: string; data: Partial<Shift> }[];
  toDelete: string[];
  failed: FailedShift[];
}

interface FileUploaderProps {
    onImportComplete: (failedShifts: FailedShift[], dryRunResult?: ReconciliationResult) => void;
    onFileSelect: () => void;
    shiftsToPublish?: ReconciliationResult | null;
    children?: React.ReactNode;
}


// --- Helper Functions ---
const levenshtein = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
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
        if (user.normalizedName === normalizedName) return user;
        
        const distance = levenshtein(normalizedName, user.normalizedName);

        if (user.normalizedName.includes(normalizedName)) {
             if (distance < minDistance) {
                minDistance = distance;
                bestMatch = user;
            }
        }

        const firstNameNormalized = normalizeText(user.originalName.split(' ')[0]);
        if (firstNameNormalized === normalizedName) {
             const firstNameDistance = levenshtein(normalizedName, firstNameNormalized);
              if (firstNameDistance < minDistance) {
                minDistance = firstNameDistance;
                bestMatch = user;
            }
        }

        const threshold = Math.max(1, Math.floor(normalizedName.length / 3));
        if (distance <= threshold && distance < minDistance) {
            minDistance = distance;
            bestMatch = user;
        }
    }
    
    if (bestMatch && minDistance <= 3) {
        return bestMatch;
    }

    return null;
}

const parseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    if (typeof dateValue === 'number' && dateValue > 1) {
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
        if (!isNaN(d.getTime())) {
             return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        }
    }
    if (typeof dateValue === 'string') {
        const lowerCell = dateValue.toLowerCase();
        const dateMatch = lowerCell.match(/(\d{1,2})[ -/]+([a-z]{3})/);
         if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const monthStr = dateMatch[2];
            const monthIndex = new Date(Date.parse(monthStr +" 1, 2012")).getMonth();
            if (!isNaN(day) && monthIndex !== -1) {
                 const year = new Date().getFullYear();
                 return new Date(Date.UTC(year, monthIndex, day));
            }
        }

        const dayNameMatch = lowerCell.match(/(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2})[ -/]+([a-z]{3})/);
        if (dayNameMatch) {
            const day = parseInt(dayNameMatch[2], 10);
            const monthStr = dayNameMatch[3];
            const monthIndex = new Date(Date.parse(monthStr +" 1, 2012")).getMonth();
             if (!isNaN(day) && monthIndex !== -1) {
                 const year = new Date().getFullYear();
                 return new Date(Date.UTC(year, monthIndex, day));
            }
        }
    }
    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        return new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()));
    }
    return null;
};


const getShiftKey = (shift: { userId: string; date: Date | Timestamp; task: string; address: string }): string => {
    let datePart: string;
    if (shift.date instanceof Timestamp) {
        const d = shift.date.toDate();
        datePart = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    } else {
        datePart = new Date(Date.UTC(shift.date.getFullYear(), shift.date.getMonth(), shift.date.getDate())).toISOString().slice(0, 10);
    }
    return `${datePart}-${shift.userId}-${normalizeText(shift.address)}-${normalizeText(shift.task)}`;
};
  
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
            const workbook = XLSX.read(data, { type: 'array', bookSheets: true });
            setSheetNames(workbook.SheetNames);
            const initialEnabled: { [key: string]: boolean } = {};
            workbook.SheetNames.forEach(name => {
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
  
  const processAndPublish = async (reconciliationResult: ReconciliationResult) => {
      setIsProcessing(true);
      const { toCreate, toUpdate, toDelete } = reconciliationResult;

      if (toCreate.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
          toast({ title: 'No Changes', description: "The schedule was already up-to-date." });
          onImportComplete(reconciliationResult.failed);
          setIsProcessing(false);
          return;
      }

      try {
        const batch = writeBatch(db);
        
        toCreate.forEach(excelShift => {
            const newShiftData = {
                ...excelShift,
                date: Timestamp.fromDate(excelShift.date),
                status: 'pending-confirmation',
                createdAt: serverTimestamp(),
            };
            batch.set(doc(collection(db, 'shifts')), newShiftData);
        });

        toUpdate.forEach(update => {
            batch.update(doc(db, 'shifts', update.id), update.data);
        });

        toDelete.forEach(shiftId => {
            batch.delete(doc(db, 'shifts', shiftId));
        });
        
        await batch.commit();

        let descriptionParts = [];
        if (toCreate.length > 0) descriptionParts.push(`created ${toCreate.length}`);
        if (toUpdate.length > 0) descriptionParts.push(`updated ${toUpdate.length}`);
        if (toDelete.length > 0) descriptionParts.push(`deleted ${toDelete.length}`);
        
        toast({
            title: 'Import Complete & Reconciled',
            description: `Successfully ${descriptionParts.join(', ')} shift(s).`,
        });
        
        onImportComplete(reconciliationResult.failed);
        setFile(null);
        const fileInput = document.getElementById('shift-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        setSheetNames([]);
        setEnabledSheets({});

      } catch (err: any) {
        console.error('Publishing failed:', err);
        setError(err.message || 'An unexpected error occurred during publishing.');
        onImportComplete(reconciliationResult.failed, reconciliationResult);
      } finally {
        setIsProcessing(false);
      }
  };

  const handleProcessFile = async () => {
    if (shiftsToPublish) {
        await processAndPublish(shiftsToPublish);
        return;
    }
      
    if (!file || !db) {
      setError('Please select a file first.');
      return;
    }
    const sheetsToProcess = sheetNames.filter(name => enabledSheets[name]);
    if (sheetsToProcess.length === 0) {
        setError('No sheets selected. Please enable at least one sheet to import.');
        return;
    }

    setIsProcessing(true);
    setError(null);
    onImportComplete([], { toCreate: [], toUpdate: [], toDelete: [], failed: [] });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data.");
        
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellStyles: true });

        const userMap: UserMapEntry[] = users.map(user => ({
            uid: user.uid,
            normalizedName: normalizeText(user.name),
            originalName: user.name,
        }));
        
        let allParsedShifts: ParsedShift[] = [];
        let allFailedShifts: FailedShift[] = [];
        
        for (const sheetName of sheetsToProcess) {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) continue;

            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false, defval: null });

            const projectBlockStartRows: number[] = [];
            jsonData.forEach((row, i) => {
                const cellA = (row[0] || '').toString().trim().toUpperCase();
                if (cellA.includes('JOB MANAGER')) {
                    projectBlockStartRows.push(i);
                }
            });
            
            if (projectBlockStartRows.length === 0) continue;

            for (let i = 0; i < projectBlockStartRows.length; i++) {
                const blockStartRowIndex = projectBlockStartRows[i];
                const blockEndRowIndex = i + 1 < projectBlockStartRows.length ? projectBlockStartRows[i+1] : jsonData.length;
                
                let manager = jsonData[blockStartRowIndex + 1]?.[0] || 'Unknown Manager';
                let address = '';
                let bNumber = '';
                let dateRow: (Date | null)[] = [];
                let dateRowIndex = -1;

                for (let r = blockStartRowIndex; r < blockEndRowIndex; r++) {
                    const row = jsonData[r] || [];
                    const cellAValue = row[0];

                    if (!address && cellAValue && typeof cellAValue === 'string') {
                        const addrKeywords = ['road', 'street', 'avenue', 'lane', 'drive', 'court', 'close', 'crescent', 'place'];
                        if (addrKeywords.some(kw => cellAValue.toLowerCase().includes(kw))) {
                            address = cellAValue.split('\n').join(', ').trim();
                        }
                    }
                    
                    if (dateRowIndex === -1) {
                        const dayAbbrs = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
                        const monthAbbrs = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                        let dateCellCount = 0;
                        row.forEach(cell => {
                            if (cell instanceof Date) dateCellCount++;
                            else if (typeof cell === 'string') {
                                const lowerCell = cell.toLowerCase();
                                if (dayAbbrs.some(day => lowerCell.startsWith(day)) || monthAbbrs.some(abbr => lowerCell.includes(abbr))) {
                                    dateCellCount++;
                                }
                            }
                        });

                        if (dateCellCount > 2) {
                            dateRowIndex = r;
                            dateRow = row.map(cell => parseDate(cell));
                        }
                    }
                }

                if (!address) {
                     allFailedShifts.push({ date: null, projectAddress: `Block at row ${blockStartRowIndex + 1}`, cellContent: '', reason: 'Could not find Address.', sheetName });
                     continue;
                }
                if (dateRowIndex === -1) {
                    allFailedShifts.push({ date: null, projectAddress: address, cellContent: '', reason: 'Could not find Date Row.', sheetName });
                    continue;
                }
                // Try to find BNumber near address
                const addressRowIndex = jsonData.findIndex(row => (row[0] || '').toString().includes(address));
                if (addressRowIndex > -1) {
                    const bNumCandidate = (jsonData[addressRowIndex-1]?.[0] || '').toString();
                    if(bNumCandidate.match(/^[a-zA-Z]?\d+/)) {
                        bNumber = bNumCandidate;
                    }
                }


                for (let r = dateRowIndex + 1; r < blockEndRowIndex; r++) {
                    const rowData = jsonData[r];
                    if (!rowData || !rowData[0] || typeof rowData[0] !== 'string') continue;
                    
                    const task = rowData[0].trim();
                    
                    for (let c = 1; c < Math.min(rowData.length, dateRow.length); c++) { 
                        const shiftDate = dateRow[c];
                        if (!shiftDate) continue;

                        const cellContentRaw = rowData[c];
                        if (!cellContentRaw || typeof cellContentRaw !== 'string') continue;
                        
                        const usersInCell = cellContentRaw.split(/&|,|\+/g).map(name => name.trim()).filter(Boolean);

                        if (task && usersInCell.length > 0) {
                            for (const userName of usersInCell) {
                                const user = findUser(userName, userMap);
                                if (user) {
                                    allParsedShifts.push({ 
                                        task, 
                                        userId: user.uid, 
                                        userName: user.originalName,
                                        type: 'all-day',
                                        date: shiftDate, 
                                        address, 
                                        bNumber,
                                        manager,
                                    });
                                } else {
                                    allFailedShifts.push({
                                        date: shiftDate,
                                        projectAddress: address,
                                        cellContent: cellContentRaw,
                                        reason: `Could not find user matching "${userName}".`,
                                        sheetName
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        const allDatesFound = allParsedShifts.map(s => s.date).filter((d): d is Date => d !== null);
        if (allDatesFound.length === 0) {
            onImportComplete(allFailedShifts, { toCreate: [], toUpdate: [], toDelete: [], failed: allFailedShifts });
            setIsProcessing(false);
            return;
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
        
        const parsedShiftsMap = new Map<string, ParsedShift>();
        allParsedShifts.forEach(shift => parsedShiftsMap.set(getShiftKey(shift), shift));

        const toCreate = allParsedShifts.filter(p => !existingShiftsMap.has(getShiftKey(p)));
        const toUpdate: { id: string; data: Partial<Shift> }[] = [];
        const toDelete: string[] = [];

        existingShiftsMap.forEach((dbShift, key) => {
            const excelShift = parsedShiftsMap.get(key);
            if (excelShift) {
                const updateData: Partial<Shift> = {};
                if (dbShift.bNumber !== excelShift.bNumber) updateData.bNumber = excelShift.bNumber;
                if (dbShift.manager !== excelShift.manager) updateData.manager = excelShift.manager;
                if (dbShift.userName !== excelShift.userName) updateData.userName = excelShift.userName;
                
                if (Object.keys(updateData).length > 0) {
                    toUpdate.push({ id: dbShift.id, data: updateData });
                }
            } else {
                 const protectedStatuses: ShiftStatus[] = ['completed', 'incomplete', 'on-site'];
                 if(!protectedStatuses.includes(dbShift.status)){
                    toDelete.push(dbShift.id);
                 }
            }
        });
        
        const reconciliationResult: ReconciliationResult = { toCreate, toUpdate, toDelete, failed: allFailedShifts };
        
        if (isDryRun) {
            onImportComplete(allFailedShifts, reconciliationResult);
        } else {
            await processAndPublish(reconciliationResult);
        }

      } catch (err: any) {
        console.error('Import failed:', err);
        setError(err.message || 'An unexpected error occurred during import.');
        onImportComplete([], { toCreate: [], toUpdate: [], toDelete: [], failed: [] });
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
        setError('Failed to read the file.');
        setIsProcessing(false);
    }

    reader.readAsArrayBuffer(file);
  };
  
  if (shiftsToPublish) {
    return <div onClick={handleProcessFile}>{children}</div>;
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
                                checked={enabledSheets[name]}
                                onCheckedChange={(checked) => toggleSheet(name, checked)}
                            />
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center space-x-2">
                <Checkbox id="dry-run" checked={isDryRun} onCheckedChange={(checked) => setIsDryRun(!!checked)} />
                <Label htmlFor="dry-run" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Dry Run
                </Label>
            </div>
            <Button onClick={handleProcessFile} disabled={!file || isProcessing} className="w-full sm:w-auto">
              {isProcessing ? <Spinner /> : isDryRun ? <><TestTube2 className="mr-2 h-4 w-4" /> Run Test</> : <><Upload className="mr-2 h-4 w-4" /> Import Shifts</>}
            </Button>
        </div>
      </div>
    </div>
  );
}
    