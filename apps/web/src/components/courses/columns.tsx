'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ArrowUpDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SessionLecturer {
  id: string;
  sessionId: string;
  userId: string;
}

export interface CourseSession {
  id: string;
  courseId: string;
  sessionType: 'lecture' | 'tutorial' | 'lab';
  durationSlots: number;
  frequencyPerWeek: number;
  lecturers: SessionLecturer[];
}

export interface CourseRow {
  id: string;
  code: string;
  name: string;
  department: string | null;
  credits: number | null;
  sessions: CourseSession[];
}

interface ColumnsOptions {
  onEdit: (course: CourseRow) => void;
  onDelete: (course: CourseRow) => void;
}

export function getColumns({ onEdit, onDelete }: ColumnsOptions): ColumnDef<CourseRow>[] {
  return [
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Code
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: ({ row }) => row.getValue('department') || '-',
    },
    {
      accessorKey: 'credits',
      header: 'Credits',
      cell: ({ row }) => row.getValue('credits') ?? '-',
    },
    {
      id: 'sessionsCount',
      header: 'Sessions',
      cell: ({ row }) => {
        const count = row.original.sessions.length;
        return <Badge variant="secondary">{count}</Badge>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const course = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(course)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(course)}
                className="text-destructive focus:text-destructive"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
