'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { type CourseRow, getColumns } from '@/components/courses/columns';
import { CourseForm } from '@/components/courses/course-form';
import { api } from '@/lib/trpc/client';

export function CoursesClient() {
  const { toast } = useToast();
  const utils = api.useUtils();

  const { data: courses, isLoading } = api.courses.list.useQuery();

  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<CourseRow | null>(null);

  const createMutation = api.courses.create.useMutation({
    onSuccess: () => {
      utils.courses.list.invalidate();
      setFormOpen(false);
      toast({ title: 'Course created', description: 'The course has been created successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = api.courses.update.useMutation({
    onSuccess: () => {
      utils.courses.list.invalidate();
      setEditingCourse(null);
      toast({ title: 'Course updated', description: 'The course has been updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = api.courses.delete.useMutation({
    onSuccess: () => {
      utils.courses.list.invalidate();
      setDeletingCourse(null);
      toast({ title: 'Course deleted', description: 'The course has been deleted successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const columns = useMemo(
    () =>
      getColumns({
        onEdit: (course) => setEditingCourse(course),
        onDelete: (course) => setDeletingCourse(course),
      }),
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data: CourseRow[] = (courses ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    department: c.department,
    credits: c.credits,
    sessions: c.sessions.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      sessionType: s.sessionType,
      durationSlots: s.durationSlots,
      frequencyPerWeek: s.frequencyPerWeek,
      lecturers: s.lecturers,
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Courses" description="Manage courses and their sessions">
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Course
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Create your first course to start building your schedule."
          action={{ label: 'Add Course', onClick: () => setFormOpen(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          searchKey="name"
          searchPlaceholder="Search courses..."
        />
      )}

      <CourseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        loading={createMutation.isPending}
      />

      <CourseForm
        open={!!editingCourse}
        onOpenChange={(open) => {
          if (!open) setEditingCourse(null);
        }}
        defaultValues={
          editingCourse
            ? {
                id: editingCourse.id,
                code: editingCourse.code,
                name: editingCourse.name,
                department: editingCourse.department,
                credits: editingCourse.credits,
                sessions: editingCourse.sessions,
              }
            : undefined
        }
        onSubmit={(values) => {
          if (editingCourse) {
            updateMutation.mutate({ id: editingCourse.id, data: values });
          }
        }}
        loading={updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deletingCourse}
        onOpenChange={(open) => {
          if (!open) setDeletingCourse(null);
        }}
        title="Delete Course"
        description={`Are you sure you want to delete "${deletingCourse?.name}"? This will also remove all sessions. This action cannot be undone.`}
        onConfirm={() => {
          if (deletingCourse) {
            deleteMutation.mutate({ id: deletingCourse.id });
          }
        }}
        loading={deleteMutation.isPending}
        destructive
      />
    </div>
  );
}
