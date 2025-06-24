'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUploader } from '@/components/admin/file-uploader';
import { ShiftScheduleOverview } from '@/components/admin/shift-schedule-overview';

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Import Weekly Shifts from Excel</CardTitle>
           <div className="text-sm text-muted-foreground space-y-2 pt-1">
            <p>
              Upload an .xlsx file to schedule all tasks for one or more projects for one week.
            </p>
            <p className="font-bold text-destructive/90">
              Important: Uploading a file will delete all existing shifts for the dates found in that file and replace them with the new schedule.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Multiple Projects:</strong> You can include multiple projects in a single sheet.
              </li>
              <li>
                <strong>Project Data Columns:</strong>
                <ul className="list-disc pl-5">
                    <li><strong>Column A:</strong> Project Address (first line only).</li>
                    <li><strong>Column B:</strong> Postcode.</li>
                    <li><strong>Column C:</strong> Contract Manager (optional).</li>
                </ul>
                These details apply to all task rows below until a new project is specified in Column A.
              </li>
              <li>
                <strong>Date Row:</strong> The importer will automatically find the row containing the week's dates (e.g., in DD/MM/YYYY format), which must be above the task data. Dates should start from Column D.
              </li>
               <li>
                <strong>Task & Operative Cells:</strong> In the grid, each cell corresponding to a date should contain the task description, a hyphen, and the operative's full name.
                The format must be: <code>Task Description - Operative Name</code>. Spacing around the hyphen does not matter.
              </li>
              <li>
                <strong>Shift Type (AM/PM):</strong> You can optionally add "AM" or "PM" to the task description (e.g., <code>FIT TRAY AM - Phil Shergold</code>). If neither is found, the shift will default to 'All Day'.
              </li>
              <li>
                <strong>Operative Name Matching:</strong> The operative's name in the sheet must exactly match their full name in the user list above.
              </li>
              <li>
                <strong>Ignored Cells:</strong> Any cells that are empty, do not contain a recognized 'Task - Name' format, or contain words like `holiday` or `on hold` will be skipped.
              </li>
            </ul>
            <p className="font-semibold pt-2">Example Structure:</p>
            <pre className="mt-2 rounded-md bg-muted p-4 text-xs font-mono overflow-x-auto">
{`+--------------------------+-----------+------------------+-----------------------------+------------------------------+
| A (Address)              | B (Postcode)| C (Contract Mgr) | D (Date ->)                 | E (Date ->)                  |
+--------------------------+-----------+------------------+-----------------------------+------------------------------+
|                          |           |                  | 09/06/2025                  | 10/06/2025                   |
+--------------------------+-----------+------------------+-----------------------------+------------------------------+
| 9 Eardley Crescent       | SW5 9JS   | Sarah Jones      | FIT TRAY AM - Phil Shergold | STUD WALL PM - Phil Shergold |
+--------------------------+-----------+------------------+-----------------------------+------------------------------+
| 14 Oak Avenue            | NW3 4LP   | Mike Ross        | PLUMBING PREP - John Doe    | EXT. PAINTING - Jane Smith   |
+--------------------------+-----------+------------------+-----------------------------+------------------------------+`}
            </pre>
          </div>
        </CardHeader>
        <CardContent>
          <FileUploader />
        </CardContent>
      </Card>
      <ShiftScheduleOverview />
    </div>
  );
}
