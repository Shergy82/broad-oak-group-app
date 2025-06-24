'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, Timestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/shared/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload } from 'lucide-react';
import type { Shift } from '@/types';

// Define the expected structure of a row in the Excel file
interface ShiftImportRow {
  Date: string | number;
  Operative: string;
  Address: string;
  'B Number': string;
  'Daily Task': string;
  'Am/Pm All Day': 'am' | 'pm' | 'all-day';
}

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
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<ShiftImportRow>(worksheet, { blankrows: false });

        if (jsonData.length === 0) {
            throw new Error("The selected Excel file is empty or in the wrong format.");
        }

        // Fetch all users to match names with uids
        const usersCollection = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollection);
        const nameToUidMap = new Map<string, string>();
        usersSnapshot.forEach(doc => {
            const user = doc.data() as { name: string };
            if (user.name) {
              nameToUidMap.set(user.name.trim().toLowerCase(), doc.id);
            }
        });

        const batch = writeBatch(db);
        let shiftsAdded = 0;
        const notFoundNames = new Set<string>();
        const invalidShiftTypes: string[] = [];
        const missingDataRows: number[] = [];

        for (const [index, row] of jsonData.entries()) {
          const rowIndex = index + 2; // Excel rows are 1-based, plus header row
          
          const operativeName = typeof row['Operative'] === 'string' ? row['Operative'].trim() : row['Operative'];
          const shiftTypeRaw = typeof row['Am/Pm All Day'] === 'string' ? row['Am/Pm All Day'].trim().toLowerCase() : row['Am/Pm All Day'];
          const date = row.Date;
          const address = typeof row['Address'] === 'string' ? row['Address'].trim() : row['Address'];
          const bNumber = row['B Number'];
          const dailyTask = typeof row['Daily Task'] === 'string' ? row['Daily Task'].trim() : row['Daily Task'];

          if (!operativeName || !shiftTypeRaw || !date || !address || bNumber === undefined || !dailyTask) {
            missingDataRows.push(rowIndex);
            continue;
          }
          
          const validShiftTypes = ['am', 'pm', 'all-day'];
          const shiftType = String(shiftTypeRaw).toLowerCase();

          if (!validShiftTypes.includes(shiftType)) {
            invalidShiftTypes.push(`Row ${rowIndex}: '${row['Am/Pm All Day']}'`);
            continue;
          }
          
          const userId = nameToUidMap.get(operativeName.toLowerCase());
          
          if (!userId) {
            notFoundNames.add(row['Operative']);
            continue;
          }

          const jsDate = new Date(date);
          // @ts-ignore
          if (isNaN(jsDate)) {
             throw new Error(`Invalid date format found in row ${rowIndex} for value "${row.Date}". Please use a standard format like YYYY-MM-DD.`);
          }

          const shiftDocRef = doc(collection(db, 'shifts'));
          
          const newShift: Omit<Shift, 'id'> = {
            userId,
            date: Timestamp.fromDate(jsDate),
            type: shiftType as 'am' | 'pm' | 'all-day',
            status: 'pending-confirmation',
            address,
            bNumber: String(bNumber).trim(),
            dailyTask,
          };

          batch.set(shiftDocRef, newShift);
          shiftsAdded++;
        }
        
        if (notFoundNames.size > 0) {
            throw new Error(`The following operatives were not found in the database: ${Array.from(notFoundNames).join(', ')}. Please check the names or add them as users before importing their shifts.`);
        }

        if (invalidShiftTypes.length > 0) {
          throw new Error(`Invalid shift types found. Must be 'am', 'pm', or 'all-day'. Errors at: ${invalidShiftTypes.join(', ')}.`);
        }

        if (shiftsAdded === 0 && missingDataRows.length > 0) {
          throw new Error(`Import failed. Required data was missing in all processed rows. Check for empty cells in rows: ${missingDataRows.slice(0, 10).join(', ')}${missingDataRows.length > 10 ? '...' : ''}.`);
        }
        
        if (shiftsAdded === 0) {
            throw new Error("No valid shifts were found to import. Please check that the file content and headers ('Date', 'Operative', 'Address', 'B Number', 'Daily Task', 'Am/Pm All Day') are correct.");
        }

        await batch.commit();

        toast({
          title: 'Import Successful',
          description: `${shiftsAdded} shifts have been added to the schedule.`,
        });
        
        setFile(null);
        const fileInput = document.getElementById('shift-file-input') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = "";
        }

      } catch (err: any) {
        console.error('Import failed:', err);
        let errorMessage = err.message || 'An unexpected error occurred during import.';
        if (errorMessage.includes('permission-denied')) {
          errorMessage = "Permission denied. Please ensure your Firestore security rules allow admins to create shifts."
        }
        setError(errorMessage);
      } finally {
        setIsUploading(false);
      }
    };

    reader.onerror = (err) => {
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
          <AlertDescription>{error}</AlertDescription>
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
