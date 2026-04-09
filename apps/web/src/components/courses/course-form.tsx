'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Trash2, UserCheck } from 'lucide-react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/components/ui/use-toast';
import { type CourseSession } from '@/components/courses/columns';
import { SessionForm } from '@/components/courses/session-form';
import { SessionLecturerManager } from '@/components/courses/session-lecturer-manager';
import { api } from '@/lib/trpc/client';

const courseFormSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50, 'Code must be 50 characters or less'),
  name: z.string().min(1, 'Name is required'),
  department: z.string().optional(),
  credits: z.coerce.number().int().min(0).optional().or(z.literal('')),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

const sessionTypeLabels: Record<string, string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
};

interface CourseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {
    code: string;
    name: string;
    department?: string;
    credits?: number;
  }) => void;
  defaultValues?: {
    id: string;
    code: string;
    name: string;
    department?: string | null;
    credits?: number | null;
    sessions: CourseSession[];
  };
  loading?: boolean;
}

export function CourseForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  loading = false,
}: CourseFormProps) {
  const { toast } = useToast();
  const utils = api.useUtils();
  const isEditing = !!defaultValues;

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      name: defaultValues?.name ?? '',
      department: defaultValues?.department ?? '',
      credits: defaultValues?.credits ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        code: defaultValues?.code ?? '',
        name: defaultValues?.name ?? '',
        department: defaultValues?.department ?? '',
        credits: defaultValues?.credits ?? '',
      });
    }
  }, [open, defaultValues, form]);

  const { data: availableLecturers = [] } = api.courses.listLecturers.useQuery(undefined, {
    enabled: isEditing,
  });

  const addSessionMutation = api.courses.addSession.useMutation({
    onSuccess: () => {
      utils.courses.list.invalidate();
      toast({ title: 'Session added', description: 'The session has been added to the course.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const removeSessionMutation = api.courses.removeSession.useMutation({
    onSuccess: () => {
      utils.courses.list.invalidate();
      toast({ title: 'Session removed', description: 'The session has been removed.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  function handleSubmit(values: CourseFormValues) {
    onSubmit({
      code: values.code,
      name: values.name,
      department: values.department || undefined,
      credits: typeof values.credits === 'number' ? values.credits : undefined,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Edit Course' : 'Add Course'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the course details and manage sessions.'
              : 'Fill in the details to create a new course.'}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. CS101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Introduction to Computer Science" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Computer Science" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="credits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credits</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 3"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Course'}
              </Button>
            </form>
          </Form>

          {isEditing && defaultValues && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Sessions</h3>
                {defaultValues.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions yet.</p>
                ) : (
                  <div className="space-y-3">
                    {defaultValues.sessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {sessionTypeLabels[session.sessionType]}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {session.durationSlots} slot{session.durationSlots > 1 ? 's' : ''},{' '}
                              {session.frequencyPerWeek}x/week
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              removeSessionMutation.mutate({ sessionId: session.id })
                            }
                            disabled={removeSessionMutation.isPending}
                            aria-label="Remove session"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="mt-2 border-t pt-2">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <UserCheck className="h-3.5 w-3.5" />
                            Lecturers
                          </div>
                          <SessionLecturerManager
                            sessionId={session.id}
                            assignedLecturers={session.lecturers}
                            availableLecturers={availableLecturers}
                            onMutationSuccess={() => utils.courses.list.invalidate()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <SessionForm
                  onSubmit={(values) =>
                    addSessionMutation.mutate({
                      courseId: defaultValues.id,
                      ...values,
                    })
                  }
                  loading={addSessionMutation.isPending}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
