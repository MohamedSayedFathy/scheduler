import { relations } from "drizzle-orm/relations";
import { tenants, rooms, courses, courseLecturers, users, courseSessions, schedulingConstraints, generatedSchedules, timeSlots, courseStudentGroups, studentGroups, lecturerAvailability, lecturerPreferences, scheduleEntries, auditLogs, subscriptions, sessionLecturers } from "./schema";

export const roomsRelations = relations(rooms, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [rooms.tenantId],
		references: [tenants.id]
	}),
	scheduleEntries: many(scheduleEntries),
}));

export const tenantsRelations = relations(tenants, ({many}) => ({
	rooms: many(rooms),
	courses: many(courses),
	schedulingConstraints: many(schedulingConstraints),
	generatedSchedules: many(generatedSchedules),
	timeSlots: many(timeSlots),
	studentGroups: many(studentGroups),
	users: many(users),
	auditLogs: many(auditLogs),
	subscriptions: many(subscriptions),
}));

export const coursesRelations = relations(courses, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [courses.tenantId],
		references: [tenants.id]
	}),
	courseLecturers: many(courseLecturers),
	courseSessions: many(courseSessions),
	courseStudentGroups: many(courseStudentGroups),
}));

export const courseLecturersRelations = relations(courseLecturers, ({one}) => ({
	course: one(courses, {
		fields: [courseLecturers.courseId],
		references: [courses.id]
	}),
	user: one(users, {
		fields: [courseLecturers.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	courseLecturers: many(courseLecturers),
	lecturerAvailabilities: many(lecturerAvailability),
	lecturerPreferences: many(lecturerPreferences),
	tenant: one(tenants, {
		fields: [users.tenantId],
		references: [tenants.id]
	}),
	auditLogs: many(auditLogs),
	sessionLecturers: many(sessionLecturers),
}));

export const courseSessionsRelations = relations(courseSessions, ({one, many}) => ({
	course: one(courses, {
		fields: [courseSessions.courseId],
		references: [courses.id]
	}),
	scheduleEntries: many(scheduleEntries),
	sessionLecturers: many(sessionLecturers),
}));

export const schedulingConstraintsRelations = relations(schedulingConstraints, ({one}) => ({
	tenant: one(tenants, {
		fields: [schedulingConstraints.tenantId],
		references: [tenants.id]
	}),
}));

export const generatedSchedulesRelations = relations(generatedSchedules, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [generatedSchedules.tenantId],
		references: [tenants.id]
	}),
	scheduleEntries: many(scheduleEntries),
}));

export const timeSlotsRelations = relations(timeSlots, ({one, many}) => ({
	tenant: one(tenants, {
		fields: [timeSlots.tenantId],
		references: [tenants.id]
	}),
	lecturerAvailabilities: many(lecturerAvailability),
	scheduleEntries: many(scheduleEntries),
}));

export const courseStudentGroupsRelations = relations(courseStudentGroups, ({one}) => ({
	course: one(courses, {
		fields: [courseStudentGroups.courseId],
		references: [courses.id]
	}),
	studentGroup: one(studentGroups, {
		fields: [courseStudentGroups.studentGroupId],
		references: [studentGroups.id]
	}),
}));

export const studentGroupsRelations = relations(studentGroups, ({one, many}) => ({
	courseStudentGroups: many(courseStudentGroups),
	tenant: one(tenants, {
		fields: [studentGroups.tenantId],
		references: [tenants.id]
	}),
}));

export const lecturerAvailabilityRelations = relations(lecturerAvailability, ({one}) => ({
	user: one(users, {
		fields: [lecturerAvailability.userId],
		references: [users.id]
	}),
	timeSlot: one(timeSlots, {
		fields: [lecturerAvailability.timeSlotId],
		references: [timeSlots.id]
	}),
}));

export const lecturerPreferencesRelations = relations(lecturerPreferences, ({one}) => ({
	user: one(users, {
		fields: [lecturerPreferences.userId],
		references: [users.id]
	}),
}));

export const scheduleEntriesRelations = relations(scheduleEntries, ({one}) => ({
	generatedSchedule: one(generatedSchedules, {
		fields: [scheduleEntries.scheduleId],
		references: [generatedSchedules.id]
	}),
	courseSession: one(courseSessions, {
		fields: [scheduleEntries.sessionId],
		references: [courseSessions.id]
	}),
	room: one(rooms, {
		fields: [scheduleEntries.roomId],
		references: [rooms.id]
	}),
	timeSlot: one(timeSlots, {
		fields: [scheduleEntries.timeSlotId],
		references: [timeSlots.id]
	}),
}));

export const auditLogsRelations = relations(auditLogs, ({one}) => ({
	tenant: one(tenants, {
		fields: [auditLogs.tenantId],
		references: [tenants.id]
	}),
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	tenant: one(tenants, {
		fields: [subscriptions.tenantId],
		references: [tenants.id]
	}),
}));

export const sessionLecturersRelations = relations(sessionLecturers, ({one}) => ({
	courseSession: one(courseSessions, {
		fields: [sessionLecturers.sessionId],
		references: [courseSessions.id]
	}),
	user: one(users, {
		fields: [sessionLecturers.userId],
		references: [users.id]
	}),
}));