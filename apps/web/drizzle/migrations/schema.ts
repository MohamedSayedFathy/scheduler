import { pgTable, index, foreignKey, uuid, varchar, integer, text, timestamp, time, date, unique, boolean, pgEnum } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const constraintSeverity = pgEnum("constraint_severity", ['hard', 'soft'])
export const dayOfWeek = pgEnum("day_of_week", ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
export const roomType = pgEnum("room_type", ['lecture_hall', 'lab', 'tutorial_room', 'seminar_room', 'computer_lab'])
export const scheduleStatus = pgEnum("schedule_status", ['pending', 'solving', 'solved', 'infeasible', 'failed'])
export const sessionType = pgEnum("session_type", ['lecture', 'tutorial', 'lab'])
export const subscriptionPlan = pgEnum("subscription_plan", ['free', 'starter', 'pro', 'enterprise'])
export const subscriptionStatus = pgEnum("subscription_status", ['active', 'past_due', 'cancelled', 'incomplete', 'trialing'])
export const tenantStatus = pgEnum("tenant_status", ['active', 'suspended', 'trial', 'cancelled'])
export const userRole = pgEnum("user_role", ['super_admin', 'university_admin', 'lecturer', 'student'])



export const rooms = pgTable("rooms", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	building: varchar({ length: 255 }),
	capacity: integer().notNull(),
	roomType: roomType("room_type").notNull(),
	equipment: text().array(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		tenantIdIdx: index("rooms_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		roomsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "rooms_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const courses = pgTable("courses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	code: varchar({ length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	department: varchar({ length: 255 }),
	credits: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		tenantIdIdx: index("courses_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		coursesTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "courses_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const courseLecturers = pgTable("course_lecturers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseId: uuid("course_id").notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		courseIdIdx: index("course_lecturers_course_id_idx").using("btree", table.courseId.asc().nullsLast()),
		userIdIdx: index("course_lecturers_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		courseLecturersCourseIdCoursesIdFk: foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "course_lecturers_course_id_courses_id_fk"
		}).onDelete("cascade"),
		courseLecturersUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "course_lecturers_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const courseSessions = pgTable("course_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseId: uuid("course_id").notNull(),
	sessionType: sessionType("session_type").notNull(),
	durationSlots: integer("duration_slots").default(1).notNull(),
	frequencyPerWeek: integer("frequency_per_week").default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		courseIdIdx: index("course_sessions_course_id_idx").using("btree", table.courseId.asc().nullsLast()),
		courseSessionsCourseIdCoursesIdFk: foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "course_sessions_course_id_courses_id_fk"
		}).onDelete("cascade"),
	}
});

export const schedulingConstraints = pgTable("scheduling_constraints", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	constraintType: varchar("constraint_type", { length: 100 }).notNull(),
	severity: constraintSeverity().notNull(),
	weight: integer().default(1).notNull(),
	config: text().default('{}').notNull(),
	description: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		constraintsTenantIdIdx: index("constraints_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		schedulingConstraintsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "scheduling_constraints_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const generatedSchedules = pgTable("generated_schedules", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: text(),
	status: scheduleStatus().default('pending').notNull(),
	solverStats: text("solver_stats"),
	errorMessage: text("error_message"),
	generatedAt: timestamp("generated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		schedulesStatusIdx: index("schedules_status_idx").using("btree", table.status.asc().nullsLast()),
		schedulesTenantIdIdx: index("schedules_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		generatedSchedulesTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "generated_schedules_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const timeSlots = pgTable("time_slots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	dayOfWeek: dayOfWeek("day_of_week").notNull(),
	startTime: time("start_time").notNull(),
	endTime: time("end_time").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	date: date().notNull(),
},
(table) => {
	return {
		dateIdx: index("time_slots_date_idx").using("btree", table.date.asc().nullsLast()),
		tenantIdIdx: index("time_slots_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		timeSlotsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "time_slots_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const tenants = pgTable("tenants", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	slug: varchar({ length: 100 }).notNull(),
	clerkOrgId: varchar("clerk_org_id", { length: 255 }).notNull(),
	domain: varchar({ length: 255 }),
	logoUrl: text("logo_url"),
	timezone: varchar({ length: 100 }).default('UTC').notNull(),
	status: tenantStatus().default('trial').notNull(),
	settings: text(),
	stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		tenantsSlugUnique: unique("tenants_slug_unique").on(table.slug),
		tenantsClerkOrgIdUnique: unique("tenants_clerk_org_id_unique").on(table.clerkOrgId),
	}
});

export const courseStudentGroups = pgTable("course_student_groups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	courseId: uuid("course_id").notNull(),
	studentGroupId: uuid("student_group_id").notNull(),
},
(table) => {
	return {
		courseIdIdx: index("course_student_groups_course_id_idx").using("btree", table.courseId.asc().nullsLast()),
		sgIdIdx: index("course_student_groups_sg_id_idx").using("btree", table.studentGroupId.asc().nullsLast()),
		courseStudentGroupsCourseIdCoursesIdFk: foreignKey({
			columns: [table.courseId],
			foreignColumns: [courses.id],
			name: "course_student_groups_course_id_courses_id_fk"
		}).onDelete("cascade"),
		courseStudentGroupsStudentGroupIdStudentGroupsIdFk: foreignKey({
			columns: [table.studentGroupId],
			foreignColumns: [studentGroups.id],
			name: "course_student_groups_student_group_id_student_groups_id_fk"
		}).onDelete("cascade"),
	}
});

export const studentGroups = pgTable("student_groups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	year: integer(),
	size: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		tenantIdIdx: index("student_groups_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		studentGroupsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "student_groups_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const lecturerAvailability = pgTable("lecturer_availability", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	timeSlotId: uuid("time_slot_id").notNull(),
	available: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		tsIdIdx: index("lecturer_availability_ts_id_idx").using("btree", table.timeSlotId.asc().nullsLast()),
		userIdIdx: index("lecturer_availability_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		lecturerAvailabilityUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "lecturer_availability_user_id_users_id_fk"
		}).onDelete("cascade"),
		lecturerAvailabilityTimeSlotIdTimeSlotsIdFk: foreignKey({
			columns: [table.timeSlotId],
			foreignColumns: [timeSlots.id],
			name: "lecturer_availability_time_slot_id_time_slots_id_fk"
		}).onDelete("cascade"),
	}
});

export const lecturerPreferences = pgTable("lecturer_preferences", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	preferenceType: varchar("preference_type", { length: 100 }).notNull(),
	value: text().notNull(),
	weight: integer().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		userIdIdx: index("lecturer_preferences_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		lecturerPreferencesUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "lecturer_preferences_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	role: userRole().default('student').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		clerkUserIdIdx: index("users_clerk_user_id_idx").using("btree", table.clerkUserId.asc().nullsLast()),
		emailIdx: index("users_email_idx").using("btree", table.email.asc().nullsLast()),
		tenantIdIdx: index("users_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		usersTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "users_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const scheduleEntries = pgTable("schedule_entries", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scheduleId: uuid("schedule_id").notNull(),
	sessionId: uuid("session_id").notNull(),
	roomId: uuid("room_id").notNull(),
	timeSlotId: uuid("time_slot_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		roomIdIdx: index("schedule_entries_room_id_idx").using("btree", table.roomId.asc().nullsLast()),
		scheduleIdIdx: index("schedule_entries_schedule_id_idx").using("btree", table.scheduleId.asc().nullsLast()),
		sessionIdIdx: index("schedule_entries_session_id_idx").using("btree", table.sessionId.asc().nullsLast()),
		tsIdIdx: index("schedule_entries_ts_id_idx").using("btree", table.timeSlotId.asc().nullsLast()),
		scheduleEntriesScheduleIdGeneratedSchedulesIdFk: foreignKey({
			columns: [table.scheduleId],
			foreignColumns: [generatedSchedules.id],
			name: "schedule_entries_schedule_id_generated_schedules_id_fk"
		}).onDelete("cascade"),
		scheduleEntriesSessionIdCourseSessionsIdFk: foreignKey({
			columns: [table.sessionId],
			foreignColumns: [courseSessions.id],
			name: "schedule_entries_session_id_course_sessions_id_fk"
		}).onDelete("cascade"),
		scheduleEntriesRoomIdRoomsIdFk: foreignKey({
			columns: [table.roomId],
			foreignColumns: [rooms.id],
			name: "schedule_entries_room_id_rooms_id_fk"
		}).onDelete("cascade"),
		scheduleEntriesTimeSlotIdTimeSlotsIdFk: foreignKey({
			columns: [table.timeSlotId],
			foreignColumns: [timeSlots.id],
			name: "schedule_entries_time_slot_id_time_slots_id_fk"
		}).onDelete("cascade"),
	}
});

export const auditLogs = pgTable("audit_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	userId: uuid("user_id"),
	action: varchar({ length: 100 }).notNull(),
	entityType: varchar("entity_type", { length: 100 }).notNull(),
	entityId: uuid("entity_id"),
	diff: text(),
	ipAddress: varchar("ip_address", { length: 45 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		createdAtIdx: index("audit_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		entityIdx: index("audit_logs_entity_idx").using("btree", table.entityType.asc().nullsLast(), table.entityId.asc().nullsLast()),
		tenantIdIdx: index("audit_logs_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		userIdIdx: index("audit_logs_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		auditLogsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_logs_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
		auditLogsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "audit_logs_user_id_users_id_fk"
		}).onDelete("set null"),
	}
});

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
	status: subscriptionStatus().default('trialing').notNull(),
	plan: subscriptionPlan().default('free').notNull(),
	seats: integer().default(5).notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }),
	cancelAtPeriodEnd: timestamp("cancel_at_period_end", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		stripeIdIdx: index("subscriptions_stripe_id_idx").using("btree", table.stripeSubscriptionId.asc().nullsLast()),
		tenantIdIdx: index("subscriptions_tenant_id_idx").using("btree", table.tenantId.asc().nullsLast()),
		subscriptionsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "subscriptions_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const sessionLecturers = pgTable("session_lecturers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		sessionIdIdx: index("session_lecturers_session_id_idx").using("btree", table.sessionId.asc().nullsLast()),
		userIdIdx: index("session_lecturers_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		sessionLecturersSessionIdCourseSessionsIdFk: foreignKey({
			columns: [table.sessionId],
			foreignColumns: [courseSessions.id],
			name: "session_lecturers_session_id_course_sessions_id_fk"
		}).onDelete("cascade"),
		sessionLecturersUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "session_lecturers_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});