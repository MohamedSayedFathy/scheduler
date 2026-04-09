/**
 * Create test users in Clerk for demo/testing.
 *
 * Creates users with different roles and adds them to your organization.
 *
 * Usage:
 *   cd apps/web
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/create-test-users.ts
 */

import * as readline from 'readline';

const CLERK_SECRET = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET) {
  console.error('CLERK_SECRET_KEY is not set');
  process.exit(1);
}

const CLERK_API = 'https://api.clerk.com/v1';

const headers = {
  Authorization: `Bearer ${CLERK_SECRET}`,
  'Content-Type': 'application/json',
};

// ── Helpers ─────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function clerkGet(path: string) {
  const res = await fetch(`${CLERK_API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clerk GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function clerkPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Clerk POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Test users to create ────────────────────────────────────────────

const TEST_PASSWORD = 'TestDemo123!';

const TEST_USERS = [
  {
    first_name: 'Admin',
    last_name: 'Demo',
    username: 'admin_demo',
    email: 'admin@demo.scheduler.dev',
    role: 'org:admin',
    description: 'University Admin',
  },
  {
    first_name: 'Ahmed',
    last_name: 'Hassan',
    username: 'ahmed_lecturer',
    email: 'ahmed.lecturer@demo.scheduler.dev',
    role: 'org:lecturer',
    description: 'Lecturer',
  },
  {
    first_name: 'Sara',
    last_name: 'Mahmoud',
    username: 'sara_lecturer',
    email: 'sara.lecturer@demo.scheduler.dev',
    role: 'org:lecturer',
    description: 'Lecturer',
  },
  {
    first_name: 'Student',
    last_name: 'Demo',
    username: 'student_demo',
    email: 'student@demo.scheduler.dev',
    role: 'org:member',
    description: 'Student',
  },
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // Accept org index as CLI arg: `npx tsx scripts/create-test-users.ts 3`
  const cliArg = process.argv[2];

  // 1. List organizations
  console.log('\nFetching organizations from Clerk...\n');
  const orgsResponse = await clerkGet('/organizations?limit=100');
  const orgs = orgsResponse.data ?? orgsResponse;

  if (!orgs.length) {
    console.log('No organizations found in Clerk. Create one first via the app.');
    process.exit(1);
  }

  orgs.forEach((org: { name: string; slug: string; id: string }, i: number) => {
    console.log(`  ${i + 1}. ${org.name} (${org.slug}) — ${org.id}`);
  });

  let choice: number;
  if (cliArg) {
    choice = parseInt(cliArg, 10);
  } else {
    const answer = await prompt(`\nChoose an organization (1-${orgs.length}): `);
    choice = parseInt(answer, 10);
  }

  if (isNaN(choice) || choice < 1 || choice > orgs.length) {
    console.error('Invalid choice.');
    process.exit(1);
  }

  const org = orgs[choice - 1];
  console.log(`\nTarget org: ${org.name} (${org.id})\n`);

  // 1b. Ensure custom roles exist
  console.log('Checking custom roles...');
  const rolesResp = await clerkGet('/organization_roles?limit=100');
  const existingRoleKeys = new Set(
    ((rolesResp.data ?? []) as { key: string }[]).map((r) => r.key),
  );

  const customRoles = [
    { name: 'Lecturer', key: 'org:lecturer', description: 'Lecturer role' },
    { name: 'Student', key: 'org:student', description: 'Student role' },
  ];

  for (const role of customRoles) {
    if (!existingRoleKeys.has(role.key)) {
      await clerkPost('/organization_roles', role);
      console.log(`  [created role] ${role.key}`);
    }
  }

  // 2. Check existing members
  const membersResp = await clerkGet(`/organizations/${org.id}/memberships?limit=100`);
  const existingMembers = membersResp.data ?? membersResp;
  const existingEmails = new Set<string>();

  for (const m of existingMembers) {
    if (m.public_user_data?.identifier) {
      existingEmails.add(m.public_user_data.identifier);
    }
  }

  console.log(`Existing members: ${existingMembers.length}\n`);
  console.log('Will create the following test users:\n');
  console.log('  Email                                  Role              Password');
  console.log('  ─────────────────────────────────────  ────────────────  ─────────────');
  for (const u of TEST_USERS) {
    const skip = existingEmails.has(u.email) ? ' (already member — will skip)' : '';
    console.log(`  ${u.email.padEnd(39)} ${u.description.padEnd(16)}  ${TEST_PASSWORD}${skip}`);
  }

  if (!cliArg) {
    const confirm = await prompt('\nProceed? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      return;
    }
  }

  console.log('');

  // 3. Create users + add to org
  for (const testUser of TEST_USERS) {
    if (existingEmails.has(testUser.email)) {
      console.log(`  [skip] ${testUser.email} — already a member`);
      continue;
    }

    // Check if user already exists in Clerk (but not in this org)
    const searchResp = await clerkGet(
      `/users?email_address=${encodeURIComponent(testUser.email)}&limit=1`,
    );
    const existingUsers = searchResp.data ?? searchResp;
    let userId: string;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      console.log(`  [found] ${testUser.email} — existing Clerk user ${userId}`);
    } else {
      // Create the user
      const created = await clerkPost('/users', {
        first_name: testUser.first_name,
        last_name: testUser.last_name,
        username: testUser.username,
        email_address: [testUser.email],
        password: TEST_PASSWORD,
        skip_password_checks: true,
      });
      userId = created.id;
      console.log(`  [created] ${testUser.email} — ${userId}`);
    }

    // Add to organization with role
    try {
      await clerkPost(`/organizations/${org.id}/memberships`, {
        user_id: userId,
        role: testUser.role,
      });
      console.log(`  [added] ${testUser.email} → ${org.name} as ${testUser.role}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already')) {
        console.log(`  [skip] ${testUser.email} — already in org`);
      } else {
        console.error(`  [error] Adding ${testUser.email} to org: ${msg}`);
      }
    }
  }

  // 4. Summary
  console.log('\n--- Done ---\n');
  console.log('Test accounts:');
  console.log(`  Password for all: ${TEST_PASSWORD}\n`);
  for (const u of TEST_USERS) {
    console.log(`  ${u.description.padEnd(20)} ${u.email}`);
  }
  console.log('\nSign in at your app URL with any of these emails + the password above.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
