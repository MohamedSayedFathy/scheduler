'use client';

import { AlertTriangle, Check, ChevronsUpDown, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface FilterOption {
  id: string;
  label: string;
}

interface MultiSelectProps {
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  width?: string;
}

function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder,
  width = 'w-[200px]',
}: MultiSelectProps) {
  const selectedSet = new Set(selected);
  const count = selected.length;

  function toggle(id: string) {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  let label: string;
  if (count === 0) {
    label = placeholder;
  } else if (count === 1) {
    const opt = options.find((o) => o.id === selected[0]);
    label = opt?.label ?? '1 selected';
  } else {
    label = `${count} selected`;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn(width, 'justify-between font-normal')}
        >
          <span className="truncate">
            {label}
          </span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {count > 0 && (
              <Badge
                variant="secondary"
                className="h-5 cursor-pointer px-1.5 text-[10px] hover:bg-destructive hover:text-destructive-foreground"
                onClick={clear}
                aria-label={`Clear ${placeholder}`}
              >
                {count}
                <X className="ml-0.5 h-3 w-3" />
              </Badge>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const isSelected = selectedSet.has(opt.id);
                return (
                  <CommandItem
                    key={opt.id}
                    onSelect={() => toggle(opt.id)}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{opt.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TimetableFiltersProps {
  lecturers: FilterOption[];
  studentGroups: FilterOption[];
  rooms: FilterOption[];
  courses: FilterOption[];
  selectedLecturers: string[];
  selectedStudentGroups: string[];
  selectedRooms: string[];
  selectedCourses: string[];
  onLecturersChange: (value: string[]) => void;
  onStudentGroupsChange: (value: string[]) => void;
  onRoomsChange: (value: string[]) => void;
  onCoursesChange: (value: string[]) => void;
  showConflictsOnly: boolean;
  onShowConflictsOnlyChange: (value: boolean) => void;
}

export function TimetableFilters({
  lecturers,
  studentGroups,
  rooms,
  courses,
  selectedLecturers,
  selectedStudentGroups,
  selectedRooms,
  selectedCourses,
  onLecturersChange,
  onStudentGroupsChange,
  onRoomsChange,
  onCoursesChange,
  showConflictsOnly,
  onShowConflictsOnlyChange,
}: TimetableFiltersProps) {
  const hasFilters =
    selectedLecturers.length > 0 ||
    selectedStudentGroups.length > 0 ||
    selectedRooms.length > 0 ||
    selectedCourses.length > 0 ||
    showConflictsOnly;

  function clearAll() {
    onLecturersChange([]);
    onStudentGroupsChange([]);
    onRoomsChange([]);
    onCoursesChange([]);
    onShowConflictsOnlyChange(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <MultiSelectFilter
        options={lecturers}
        selected={selectedLecturers}
        onChange={onLecturersChange}
        placeholder="All Lecturers"
      />
      <MultiSelectFilter
        options={studentGroups}
        selected={selectedStudentGroups}
        onChange={onStudentGroupsChange}
        placeholder="All Groups"
      />
      <MultiSelectFilter
        options={rooms}
        selected={selectedRooms}
        onChange={onRoomsChange}
        placeholder="All Rooms"
      />
      <MultiSelectFilter
        options={courses}
        selected={selectedCourses}
        onChange={onCoursesChange}
        placeholder="All Courses"
      />

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
