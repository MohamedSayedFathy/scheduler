'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ArrowUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface LecturerRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: Date;
}

interface ColumnsOptions {
  onEdit: (lecturer: LecturerRow) => void;
  onDelete: (lecturer: LecturerRow) => void;
  onManageAvailability: (lecturer: LecturerRow) => void;
}

export function getColumns({
  onEdit,
  onDelete,
  onManageAvailability,
}: ColumnsOptions): ColumnDef<LecturerRow>[] {
  return [
    {
      id: 'name',
      accessorFn: (row) =>
        [row.firstName, row.lastName].filter(Boolean).join(' ') || '—',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ getValue }) => {
        const name = getValue<string>();
        return <span className="font-medium">{name}</span>;
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Email
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Added',
      cell: ({ row }) => {
        const date = row.getValue<Date>('createdAt');
        return new Intl.DateTimeFormat('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(new Date(date));
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const lecturer = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(lecturer)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManageAvailability(lecturer)}>
                Manage Availability
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(lecturer)}
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
