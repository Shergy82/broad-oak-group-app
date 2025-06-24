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
        const jsonData = XLSX.utils.sheet_to_json<ShiftImportRow>(worksheet);

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
              nameToUidMap.set(user.name.toLowerCase(), doc.id);
            }
        });

        const batch = writeBatch(db);
        let shiftsAdded = 0;
        const notFoundNames = new Set<string>();
        const invalidShiftTypes: string[] = [];


        jsonData.forEach((row, index) => {
          const operativeName = row['Operative']?.toLowerCase();
          const shiftType = row['Am/Pm All Day']?.toLowerCase() as 'am' | 'pm' | 'all-day';
          const date = row.Date;
          const address = row['Address'];
          const bNumber = row['B Number'];
          const dailyTask = row['Daily Task'];

          if (!operativeName || !shiftType || !date || !address || !bNumber || !dailyTask) {
            console.warn(`Skipping row ${index + 2} due to missing data.`);
            return;
          }
          
          const validShiftTypes = ['am', 'pm', 'all-day'];
          if (!validShiftTypes.includes(shiftType)) {
            invalidShiftTypes.push(`Row ${index + 2}: '${row['Am/Pm All Day']}'`);
            return;
          }

          const userId = nameToUidMap.get(operativeName);

          if (!userId) {
            notFoundNames.add(row['Operative']);
            return;
          }

          const shiftDocRef = doc(collection(db, 'shifts'));
          
          const newShift: Omit<Shift, 'id'> = {
            userId,
            date: Timestamp.fromDate(new Date(date)),
            type: shiftType,
            status: 'pending-confirmation',
            address,
            bNumber,
            dailyTask,
          };

          batch.set(shiftDocRef, newShift);
          shiftsAdded++;
        });
        
        if (notFoundNames.size > 0) {
            throw new Error(`The following operatives were not found in the database: ${Array.from(notFoundNames).join(', ')}. Please check the names or add them as users before importing their shifts.`);
        }

        if (invalidShiftTypes.length > 0) {
          throw new Error(`Invalid shift types found. Must be 'am', 'pm', or 'all-day'. Errors at: ${invalidShiftTypes.join(', ')}.`);
        }

        if (shiftsAdded === 0) {
            throw new Error("No valid shifts were found to import. Please check the file content and format.");
        }

        await batch.commit();

        toast({
          title: 'Import Successful',
          description: `${shiftsAdded} shifts have been added to the schedule.`,
        });
        
        // Reset the file input visually by clearing the state
        setFile(null);
        // And reset the actual input element
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
          accept=".xlsx, .xls, .csv"
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
