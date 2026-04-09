'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const roomFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  building: z.string().optional(),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1'),
  roomType: z.enum(['lecture_hall', 'lab', 'tutorial_room', 'seminar_room', 'computer_lab']),
  equipment: z.string().optional(),
});

type RoomFormValues = z.infer<typeof roomFormSchema>;

const roomTypeLabels: Record<string, string> = {
  lecture_hall: 'Lecture Hall',
  lab: 'Lab',
  tutorial_room: 'Tutorial Room',
  seminar_room: 'Seminar Room',
  computer_lab: 'Computer Lab',
};

interface RoomFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    name: string;
    building?: string;
    capacity: number;
    roomType: 'lecture_hall' | 'lab' | 'tutorial_room' | 'seminar_room' | 'computer_lab';
    equipment?: string[];
  }) => void;
  defaultValues?: {
    name: string;
    building?: string | null;
    capacity: number;
    roomType: 'lecture_hall' | 'lab' | 'tutorial_room' | 'seminar_room' | 'computer_lab';
    equipment?: string[] | null;
  };
  loading?: boolean;
}

export function RoomForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  loading = false,
}: RoomFormProps) {
  const isEditing = !!defaultValues;

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      building: defaultValues?.building ?? '',
      capacity: defaultValues?.capacity ?? 30,
      roomType: defaultValues?.roomType ?? 'lecture_hall',
      equipment: defaultValues?.equipment?.join(', ') ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: defaultValues?.name ?? '',
        building: defaultValues?.building ?? '',
        capacity: defaultValues?.capacity ?? 30,
        roomType: defaultValues?.roomType ?? 'lecture_hall',
        equipment: defaultValues?.equipment?.join(', ') ?? '',
      });
    }
  }, [open, defaultValues, form]);

  function handleSubmit(values: RoomFormValues) {
    const equipment = values.equipment
      ? values.equipment
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    onSubmit({
      name: values.name,
      building: values.building || undefined,
      capacity: values.capacity,
      roomType: values.roomType,
      equipment: equipment && equipment.length > 0 ? equipment : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Room' : 'Add Room'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the room details below.'
              : 'Fill in the details to create a new room.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Room 101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="building"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Building</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Science Building" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capacity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacity</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roomType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select room type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(roomTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="equipment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Equipment</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. projector, whiteboard, computers" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Room'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
