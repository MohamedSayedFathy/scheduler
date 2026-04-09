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

const roomTypeLabels: Record<string, string> = {
  lecture_hall: 'Lecture Hall',
  lab: 'Lab',
  tutorial_room: 'Tutorial Room',
  seminar_room: 'Seminar Room',
  computer_lab: 'Computer Lab',
};

export interface RoomRow {
  id: string;
  name: string;
  building: string | null;
  capacity: number;
  roomType: 'lecture_hall' | 'lab' | 'tutorial_room' | 'seminar_room' | 'computer_lab';
  equipment: string[] | null;
}

interface ColumnsOptions {
  onEdit: (room: RoomRow) => void;
  onDelete: (room: RoomRow) => void;
}

export function getColumns({ onEdit, onDelete }: ColumnsOptions): ColumnDef<RoomRow>[] {
  return [
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
      accessorKey: 'building',
      header: 'Building',
      cell: ({ row }) => row.getValue('building') || '-',
    },
    {
      accessorKey: 'roomType',
      header: 'Room Type',
      cell: ({ row }) => {
        const value = row.getValue('roomType') as string;
        return <Badge variant="secondary">{roomTypeLabels[value] ?? value}</Badge>;
      },
    },
    {
      accessorKey: 'capacity',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Capacity
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'equipment',
      header: 'Equipment',
      cell: ({ row }) => {
        const equipment = row.getValue('equipment') as string[] | null;
        if (!equipment || equipment.length === 0) return '-';
        return (
          <div className="flex flex-wrap gap-1">
            {equipment.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const room = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(room)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(room)}
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
