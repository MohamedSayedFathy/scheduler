'use client';

import { AlertTriangle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilterOption {
  id: string;
  label: string;
}

interface TimetableFiltersProps {
  lecturers: FilterOption[];
  studentGroups: FilterOption[];
  rooms: FilterOption[];
  courses: FilterOption[];
  selectedLecturer: string | null;
  selectedStudentGroup: string | null;
  selectedRoom: string | null;
  selectedCourse: string | null;
  onLecturerChange: (value: string | null) => void;
  onStudentGroupChange: (value: string | null) => void;
  onRoomChange: (value: string | null) => void;
  onCourseChange: (value: string | null) => void;
  showConflictsOnly: boolean;
  onShowConflictsOnlyChange: (value: boolean) => void;
}

export function TimetableFilters({
  lecturers,
  studentGroups,
  rooms,
  courses,
  selectedLecturer,
  selectedStudentGroup,
  selectedRoom,
  selectedCourse,
  onLecturerChange,
  onStudentGroupChange,
  onRoomChange,
  onCourseChange,
  showConflictsOnly,
  onShowConflictsOnlyChange,
}: TimetableFiltersProps) {
  const hasFilters = selectedLecturer || selectedStudentGroup || selectedRoom || selectedCourse || showConflictsOnly;

  function clearAll() {
    onLecturerChange(null);
    onStudentGroupChange(null);
    onRoomChange(null);
    onCourseChange(null);
    onShowConflictsOnlyChange(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={selectedLecturer ?? '__all__'}
        onValueChange={(v) => onLecturerChange(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Lecturers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Lecturers</SelectItem>
          {lecturers.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedStudentGroup ?? '__all__'}
        onValueChange={(v) => onStudentGroupChange(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Groups" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Groups</SelectItem>
          {studentGroups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedRoom ?? '__all__'}
        onValueChange={(v) => onRoomChange(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Rooms" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Rooms</SelectItem>
          {rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedCourse ?? '__all__'}
        onValueChange={(v) => onCourseChange(v === '__all__' ? null : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All Courses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={showConflictsOnly ? 'destructive' : 'outline'}
        size="sm"
        onClick={() => onShowConflictsOnlyChange(!showConflictsOnly)}
        aria-pressed={showConflictsOnly}
      >
        <AlertTriangle className="mr-1 h-4 w-4" />
        Conflicts only
      </Button>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="mr-1 h-4 w-4" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
