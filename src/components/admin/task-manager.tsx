
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PlusCircle, Trash2, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

interface Task {
  text: string;
  photoRequired: boolean;
}

interface Trade {
  id: string;
  name: string;
  tasks: Task[];
}

const LOCAL_STORAGE_KEY = 'tradeTasks_v2'; // New key for the new data structure

export function TaskManager() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [newTradeName, setNewTradeName] = useState('');
  const [newSubTaskText, setNewSubTaskText] = useState<{ [key: string]: string }>({});
  const [newSubTaskPhotoRequired, setNewSubTaskPhotoRequired] = useState<{ [key: string]: boolean }>({});
  const { toast } = useToast();

  useEffect(() => {
    try {
      const savedTrades = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedTrades) {
        setTrades(JSON.parse(savedTrades));
      } else {
        // Migration from old format if it exists
        const oldSavedTrades = localStorage.getItem('tradeTasks');
        if (oldSavedTrades) {
          const oldTrades: Array<{id: string, name: string, tasks: string[]}> = JSON.parse(oldSavedTrades);
          const migratedTrades: Trade[] = oldTrades.map(trade => ({
            ...trade,
            tasks: trade.tasks.map(taskText => ({ text: taskText, photoRequired: false }))
          }));
          saveTrades(migratedTrades);
          localStorage.removeItem('tradeTasks');
        }
      }
    } catch (error) {
      console.error('Failed to parse trades from localStorage', error);
      toast({
        variant: 'destructive',
        title: 'Error Loading Data',
        description: 'Could not load previously saved tasks.',
      });
    }
  }, [toast]);

  const saveTrades = (updatedTrades: Trade[]) => {
    setTrades(updatedTrades);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedTrades));
  };

  const handleAddTrade = () => {
    if (!newTradeName.trim()) {
      toast({ variant: 'destructive', title: 'Trade name cannot be empty.' });
      return;
    }
    const newTrade: Trade = {
      id: Date.now().toString(),
      name: newTradeName.trim(),
      tasks: [],
    };
    saveTrades([...trades, newTrade]);
    setNewTradeName('');
    toast({ title: 'Success', description: `Trade "${newTrade.name}" added.` });
  };

  const handleDeleteTrade = (tradeId: string) => {
    const updatedTrades = trades.filter((trade) => trade.id !== tradeId);
    saveTrades(updatedTrades);
    toast({ title: 'Success', description: 'Trade deleted.' });
  };

  const handleAddTask = (tradeId: string) => {
    const taskName = newSubTaskText[tradeId]?.trim();
    if (!taskName) {
      toast({ variant: 'destructive', title: 'Task name cannot be empty.' });
      return;
    }
    const photoRequired = newSubTaskPhotoRequired[tradeId] || false;

    const updatedTrades = trades.map((trade) => {
      if (trade.id === tradeId) {
        return { ...trade, tasks: [...trade.tasks, { text: taskName, photoRequired }] };
      }
      return trade;
    });

    saveTrades(updatedTrades);
    setNewSubTaskText({ ...newSubTaskText, [tradeId]: '' });
    setNewSubTaskPhotoRequired({ ...newSubTaskPhotoRequired, [tradeId]: false });
    toast({ title: 'Success', description: `Task added.` });
  };

  const handleDeleteTask = (tradeId: string, taskIndex: number) => {
    const updatedTrades = trades.map((trade) => {
      if (trade.id === tradeId) {
        const updatedTasks = trade.tasks.filter((_, i) => i !== taskIndex);
        return { ...trade, tasks: updatedTasks };
      }
      return trade;
    });
    saveTrades(updatedTrades);
    toast({ title: 'Success', description: 'Task deleted.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Management</CardTitle>
        <CardDescription>
          Create and manage reusable tasks organized by trade. This data is saved in your browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Input
            placeholder="e.g., Plumber, Electrician..."
            value={newTradeName}
            onChange={(e) => setNewTradeName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddTrade()}
          />
          <Button onClick={handleAddTrade}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Trade
          </Button>
        </div>

        {trades.length > 0 ? (
          <Accordion type="multiple" className="w-full">
            {trades.map((trade) => (
              <AccordionItem key={trade.id} value={trade.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full items-center justify-between">
                    <span className="font-semibold text-lg">{trade.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrade(trade.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-4 bg-muted/30 rounded-b-md">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        placeholder="Add a new sub-task..."
                        value={newSubTaskText[trade.id] || ''}
                        onChange={(e) => setNewSubTaskText({ ...newSubTaskText, [trade.id]: e.target.value })}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddTask(trade.id)}
                      />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id={`photo-required-${trade.id}`}
                            checked={newSubTaskPhotoRequired[trade.id] || false}
                            onCheckedChange={(checked) => setNewSubTaskPhotoRequired({ ...newSubTaskPhotoRequired, [trade.id]: !!checked })}
                          />
                          <Label htmlFor={`photo-required-${trade.id}`} className="text-sm text-muted-foreground">Photo Required</Label>
                        </div>
                        <Button size="sm" onClick={() => handleAddTask(trade.id)}>
                          Add Task
                        </Button>
                      </div>
                    </div>
                    {trade.tasks.length > 0 && (
                      <ul className="space-y-2">
                        {trade.tasks.map((task, index) => (
                          <li
                            key={index}
                            className="flex items-center justify-between p-2 bg-background rounded-md border"
                          >
                            <div className="flex items-center gap-2">
                              <span>{task.text}</span>
                              {task.photoRequired && <Camera className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteTask(trade.id, index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-lg font-semibold">No Trades Created Yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Add a trade using the form above to start organizing your tasks.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
