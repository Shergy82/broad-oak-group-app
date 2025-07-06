
'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload } from 'lucide-react';
import type { Shift } from '@/types';

type ParsedShift = Omit<Shift, 'id' | 'status' | 'date'> & { date: Date };

export function FileUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const selectedFile = event.target.files[0];
       if (selectedFile) {
        setFile(selectedFile);
        setError(null);
       }
    }
  };

  const parseDateFromExcel = (excelDate: number): Date => {
    // This formula converts Excel's serial date number to a JS Date.
    // It's timezone-agnostic at this point.
    const d = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    // We then create a new Date object based on the UTC components to ensure it's at UTC midnight.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  };

  const handleImport = async () => {
    if (!file || !db) {
      setError('Please select a file first.');
      return;
    }

    setIsUploading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file data.");
        
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const nameToUidMap = new Map<string, string>();
        const userNames: string[] = [];
        usersSnapshot.forEach(doc => {
            const user = doc.data() as { name: string };
            if (user.name) {
              const trimmedName = user.name.trim();
              nameToUidMap.set(trimmedName.toLowerCase(), doc.id);
              userNames.push(trimmedName);
            }
        });

        // Sort names by length descending to match longer names first (e.g., "John Smith" before "John")
        userNames.sort((a, b) => b.length - a.length);

        const parseDate = (dateValue: any): Date | null => {
            // If XLSX parsing with `cellDates: true` provides a valid JS Date object
            if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
                // Normalize to UTC midnight to strip time and timezone info
                return new Date(Date.UTC(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()));
            }
            // If the cell is a number (Excel's date format)
             if (typeof dateValue === 'number' && dateValue > 1) {
                return parseDateFromExcel(dateValue);
            }
            return null;
        };

        const projectsToCreate = new Map<string, { address: string; bNumber: string }>();
        const projectsCollectionRef = collection(db, 'projects');
        const existingProjectsSnapshot = await getDocs(projectsCollectionRef);
        const existingAddresses = new Set<string>();
        existingProjectsSnapshot.forEach(doc => {
            const data = doc.data();
            if(data.address) {
                existingAddresses.add(data.address.toLowerCase());
            }
        });

        const allNewShiftsFromExcel: ParsedShift[] = [];
        const allUnknownOperatives = new Set<string>();
        const allDatesFound: Date[] = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, blankrows: false, defval: '' });

            if (jsonData.length < 2) {
                console.log(`Skipping sheet "${sheetName}" because it is too short or empty.`);
                continue;
            }

            let dateRowIndex = -1;
            let dates: (Date | null)[] = [];
            // Find the row with dates. It should have at least 3 valid dates.
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i] || [];
                if (row.length > 0) {
                    const potentialDates = row.map(parseDate);
                    if (potentialDates.filter(d => d !== null).length >= 3) {
                        dateRowIndex = i;
                        dates = potentialDates;
                        break;
                    }
                }
            }

            if (dateRowIndex === -1) {
                console.log(`Skipping sheet "${sheetName}" because no valid date row was found.`);
                continue;
            }

            dates.forEach(d => {
                if (d) allDatesFound.push(d);
            });
            
            let currentProjectAddress = '';
            let currentBNumber = '';
            // Start reading data from the row after the date row
            for (let r = dateRowIndex + 1; r < jsonData.length; r++) {
                const rowData = jsonData[r];
                if (!rowData || rowData.every(cell => !cell || cell.toString().trim() === '')) continue;
                
                // Project address is always in the first column of a data row
                const addressCandidate = (rowData[0] || '').toString().trim();
                if (addressCandidate) {
                    currentProjectAddress = addressCandidate;
                    currentBNumber = (rowData[1] || '').toString().trim();
                    
                    if (currentProjectAddress && !existingAddresses.has(currentProjectAddress.toLowerCase()) && !projectsToCreate.has(currentProjectAddress.toLowerCase())) {
                        projectsToCreate.set(currentProjectAddress.toLowerCase(), { address: currentProjectAddress, bNumber: currentBNumber });
                    }
                }

                if (!currentProjectAddress) continue; // Skip rows without a project address

                for (let c = 2; c < rowData.length; c++) {
                    const cellValue = (rowData[c] || '').toString().trim().replace(/[\u2012\u2013\u2014\u2015]/g, '-');
                    const shiftDate = dates[c];

                    // Skip empty cells, holiday markers, etc.
                    if (!cellValue || !shiftDate || cellValue.toLowerCase().includes('holiday') || cellValue.toLowerCase().includes('on hold')) continue;
                    
                    let parsedShift: { task: string; userId: string; type: 'am' | 'pm' | 'all-day' } | null = null;
                    
                    // Match operative name from the cell value
                    for (const name of userNames) {
                        const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const regex = new RegExp(`\\s*-\\s*${escapedName}$`, 'i');
                        const match = cellValue.match(regex);

                        if (match && match.index !== undefined) {
                            let task = cellValue.substring(0, match.index).trim();
                            const userId = nameToUidMap.get(name.toLowerCase());
                            
                            let type: 'am' | 'pm' | 'all-day' = 'all-day';
                            const amPmMatch = task.match(/\b(AM|PM)\b/i);
                            if (amPmMatch) {
                                type = amPmMatch[0].toLowerCase() as 'am' | 'pm';
                                task = task.replace(new RegExp(`\\b${amPmMatch[0]}\\b`, 'i'), '').trim();
                            }

                            if (task && userId) {
                                parsedShift = { task, userId, type };
                                break;
                            }
                        }
                    }

                    if (parsedShift) {
                         allNewShiftsFromExcel.push({
                            ...parsedShift,
                            date: shiftDate,
                            address: currentProjectAddress,
                            task: parsedShift.task,
                            bNumber: currentBNumber,
                        });
                    } else if (cellValue.includes('-')) {
                        const lastDelimiterIndex = cellValue.lastIndexOf('-');
                        const operativeNameCandidate = cellValue.substring(lastDelimiterIndex + 1).trim();
                        if (operativeNameCandidate) allUnknownOperatives.add(operativeNameCandidate);
                    }
                }
            }
        } // End of sheet loop

        if (allDatesFound.length === 0) {
            throw new Error("No valid dates found in any of the spreadsheet tabs. Ensure at least one tab has a valid date row.");
        }
        
        // Find the min/max dates to query Firestore efficiently
        const minDate = new Date(Math.min(...allDatesFound.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDatesFound.map(d => d.getTime())));

        const shiftsQuery = query(
            collection(db, 'shifts'),
            where('date', '>=', Timestamp.fromDate(minDate)),
            where('date', '<=', Timestamp.fromDate(maxDate))
        );
        const shiftsSnapshot = await getDocs(shiftsQuery);
        const existingShiftsMap = new Map<string, Shift & { id: string }>();

        const formatDateKey = (d: Date) => {
          // Format as YYYY-MM-DD
          return d.toISOString().split('T')[0];
        };
        
        shiftsSnapshot.forEach(doc => {
            const shift = { id: doc.id, ...doc.data() } as Shift & { id: string };
            // ** THE FIX IS HERE **
            // We now use Date.UTC to create a date object that represents midnight UTC,
            // which strips timezone information and matches how the Excel dates are processed.
            // This ensures the keys for existing shifts and new shifts match perfectly.
            const shiftDate = new Date(Date.UTC(shift.date.toDate().getUTCFullYear(), shift.date.toDate().getUTCMonth(), shift.date.toDate().getUTCDate()));
            const key = `${shift.userId}-${formatDateKey(shiftDate)}-${shift.type}`;
            existingShiftsMap.set(key, shift);
        });

        const batch = writeBatch(db);
        let shiftsAdded = 0;
        let shiftsUpdated = 0;
        let projectsAdded = 0;

        for (const newShift of allNewShiftsFromExcel) {
            const key = `${newShift.userId}-${formatDateKey(newShift.date)}-${newShift.type}`;
            const existingShift = existingShiftsMap.get(key);

            if (existingShift) {
                // Shift exists. Check if it needs updating.
                const bNumberChanged = (existingShift.bNumber || '') !== (newShift.bNumber || '');
                if (existingShift.task !== newShift.task || existingShift.address !== newShift.address || bNumberChanged) {
                    const shiftDocRef = doc(db, 'shifts', existingShift.id);
                    batch.update(shiftDocRef, {
                        task: newShift.task,
                        address: newShift.address,
                        bNumber: newShift.bNumber,
                    });
                    shiftsUpdated++;
                }
                // Remove from map so it's not deleted later
                existingShiftsMap.delete(key);
            } else {
                // This is a new shift, create it.
                const shiftDocRef = doc(collection(db, 'shifts'));
                batch.set(shiftDocRef, {
                    userId: newShift.userId,
                    date: Timestamp.fromDate(newShift.date),
                    type: newShift.type,
                    status: 'pending-confirmation',
                    address: newShift.address,
                    task: newShift.task,
                    bNumber: newShift.bNumber || '',
                });
                shiftsAdded++;
            }
        }

        // Any shifts left in the map were in the DB but not in the Excel file, so delete them.
        let shiftsDeleted = 0;
        for (const shiftToDelete of existingShiftsMap.values()) {
            batch.delete(doc(db, 'shifts', shiftToDelete.id));
            shiftsDeleted++;
        }
        
        projectsToCreate.forEach(project => {
            const projectDocRef = doc(collection(db, 'projects'));
            batch.set(projectDocRef, project);
            projectsAdded++;
        });

        if (shiftsAdded > 0 || shiftsUpdated > 0 || shiftsDeleted > 0 || projectsAdded > 0) {
            await batch.commit();
        }

        if (allUnknownOperatives.size > 0) {
            toast({
                variant: 'destructive',
                title: 'Partial Import: Operatives Not Found',
                description: `Imported ${shiftsAdded + shiftsUpdated} shifts. The following operatives were not found and their shifts were skipped: ${Array.from(allUnknownOperatives).join(', ')}. Please check spelling or add them as users.`,
            });
        }
        
        let descriptionParts = [];
        if (shiftsAdded > 0) descriptionParts.push(`added ${shiftsAdded} new`);
        if (shiftsUpdated > 0) descriptionParts.push(`updated ${shiftsUpdated}`);
        if (shiftsDeleted > 0) descriptionParts.push(`removed ${shiftsDeleted}`);
        if (projectsAdded > 0) descriptionParts.push(`created ${projectsAdded} new project(s)`);

        if (descriptionParts.length > 0) {
            toast({
                title: 'Schedule Updated',
                description: `Successfully ${descriptionParts.join(', ')} shifts.`,
            });
        } else if (allUnknownOperatives.size === 0) {
            toast({
                title: 'No Changes Needed',
                description: "The schedule in the file matches the current database.",
            });
        }


        setFile(null);
        const fileInput = document.getElementById('shift-file-input') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = "";
        }

      } catch (err: any) {
        console.error('Import failed:', err);
        setError(err.message || 'An unexpected error occurred during import.');
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
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          id="shift-file-input"
          type="file"
          accept=".xlsx, .xls"
          onChange={handleFileChange}
          className="flex-grow file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
        />
        <Button onClick={handleImport} disabled={!file || isUploading} className="w-full sm:w-40">
          {isUploading ? <Spinner /> : <><Upload className="mr-2 h-4 w-4" /> Import Shifts</>}
        </Button>
      </div>
    </div>
  );
}
