'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Download } from 'lucide-react';
import type { Project, ProjectFile } from '@/types';

interface ProjectFilesProps {
  project: Project;
}

export function ProjectFiles({ project }: ProjectFilesProps) {
  const { toast } = useToast();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db || !project) return;
    const filesQuery = query(collection(db, `projects/${project.id}/files`), orderBy('uploadedAt', 'desc'));
    
    const unsubscribe = onSnapshot(filesQuery, (snapshot) => {
      const fetchedFiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectFile));
      setFiles(fetchedFiles);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching project files:", error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not fetch project files. Please check permissions.',
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [project, toast]);

  const formatFileSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold">Attached Files</h4>
      
      {isLoading ? (
        <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
        </div>
      ) : files.length === 0 ? (
        <div className="text-center text-muted-foreground p-4 border-dashed border rounded-lg">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm">No files have been attached to this project yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead className="w-[100px] text-right">Size</TableHead>
                        <TableHead className="w-[80px] text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                {files.map(file => (
                    <TableRow key={file.id}>
                        <TableCell className="font-medium truncate max-w-[200px]">{file.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">{formatFileSize(file.size)}</TableCell>
                        <TableCell className="text-right">
                            <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Download className="h-4 w-4" />
                                </Button>
                            </a>
                        </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </div>
      )}
    </div>
  );
}
