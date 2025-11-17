import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORE_ID = 768;

let app: Awaited<ReturnType<typeof buildServer>>;

describe('CRUD - Roles and Crew Members', () => {
  // Track created resources for cleanup
  let createdRoleIds: string[] = [];
  let createdCrewIds: string[] = [];

  beforeAll(async () => {
    // Ensure store exists
    await prisma.store.upsert({
      where: { id: STORE_ID },
      update: {},
      create: { id: STORE_ID, name: 'Test Store', minRegisterHours: 2, maxRegisterHours: 8 },
    });
    app = await buildServer();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset tracking arrays
    createdRoleIds = [];
    createdCrewIds = [];
  });

  afterEach(async () => {
    // Clean up all created test data
    try {
      // Delete crew members first (foreign key dependencies)
      if (createdCrewIds.length > 0) {
        await prisma.crewMemberRole.deleteMany({
          where: { crewMemberId: { in: createdCrewIds } },
        });
        await prisma.crewMember.deleteMany({
          where: { id: { in: createdCrewIds } },
        });
      }

      // Delete roles
      if (createdRoleIds.length > 0) {
        await prisma.role.deleteMany({
          where: { id: { in: createdRoleIds } },
        });
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  });

  describe('Roles CRUD', () => {
    it('POST /roles - creates a new role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'REGISTER_UNIQUE' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('REGISTER_UNIQUE');
      expect(Array.isArray(body.crewMembers)).toBe(true);
      createdRoleIds.push(body.id);
    });

    it('POST /roles - rejects empty name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: '' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error).toBeDefined();
    });

    it('GET /roles - lists all roles', async () => {
      // Create a test role first
      const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'ListTestRole' },
      });
      createdRoleIds.push(createRes.json().id);

      const res = await app.inject({
        method: 'GET',
        url: '/roles',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('GET /roles?id=X - fetches single role by id', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'GetByIdRole' },
      });
      const roleId = createRes.json().id;
      createdRoleIds.push(roleId);

      const res = await app.inject({
        method: 'GET',
        url: `/roles?id=${roleId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(roleId);
    });

    it('GET /roles?id=invalid - returns 404 for non-existent role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/roles?id=00000000-0000-0000-0000-000000000000',
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /roles/:name/crew - lists crew for a role by name', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'CrewListRole' },
      });
      createdRoleIds.push(createRes.json().id);

      const res = await app.inject({
        method: 'GET',
        url: '/roles/CrewListRole/crew',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('PUT /roles/:id - removes crew member from role', async () => {
      // Create role
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'RemoveCrewRole' },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      // Create a crew member with the test role (using 7-char ID as per schema)
      const crewRes = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW001',
          name: 'Alice',
          roleIds: [roleId],
        },
      });
      expect(crewRes.statusCode).toBe(200);
      createdCrewIds.push('TCRW001');

      // Now remove the crew member from the role
      const res = await app.inject({
        method: 'PUT',
        url: `/roles/${roleId}`,
        payload: { removeCrewMemberId: 'TCRW001' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('PUT /roles/:id - rejects missing removeCrewMemberId', async () => {
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'RejectTestRole' },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      const res = await app.inject({
        method: 'PUT',
        url: `/roles/${roleId}`,
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('DELETE /roles/:id - deletes a role', async () => {
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'DeleteTestRole' },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      const res = await app.inject({
        method: 'DELETE',
        url: `/roles/${roleId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);

      // Verify the role is gone
      const getRes = await app.inject({
        method: 'GET',
        url: `/roles?id=${roleId}`,
      });
      expect(getRes.statusCode).toBe(404);

      // Remove from tracking since we already deleted it
      createdRoleIds = createdRoleIds.filter((id) => id !== roleId);
    });

    it('DELETE /roles/:id - returns 404 for non-existent role', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/roles/00000000-0000-0000-0000-000000000000',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Crew Members CRUD', () => {
    it('POST /crew - creates a new crew member', async () => {
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'CrewCreateRole' },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      const res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCREW01',
          name: 'Alice Smith',
          roleIds: [roleId],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('TCREW01');
      expect(body.name).toBe('Alice Smith');
      expect(body.roles.length).toBe(1);
      createdCrewIds.push('TCREW01');
    });

    it('POST /crew - rejects missing id or name', async () => {
      let res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { name: 'Missing ID' },
      });
      expect(res.statusCode).toBe(400);

      res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: { id: 'TCRW999' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /crew - lists all crew members', async () => {
      // Create a crew member first
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW002',
          name: 'Alice',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW002');

      const res = await app.inject({
        method: 'GET',
        url: '/crew',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      const testCrew = body.find((c: any) => c.id === 'TCRW002');
      expect(testCrew).toBeDefined();
    });

    it('GET /crew?id=X - fetches single crew member by id', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW003',
          name: 'Bob',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW003');

      const res = await app.inject({
        method: 'GET',
        url: '/crew?id=TCRW003',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe('TCRW003');
    });

    it('GET /crew?id=invalid - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/crew?id=NOEXIST',
      });
      expect(res.statusCode).toBe(404);
    });

    it('PUT /crew/:id - updates crew member fields', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW004',
          name: 'Alice',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW004');

      const res = await app.inject({
        method: 'PUT',
        url: '/crew/TCRW004',
        payload: {
          name: 'Alice Updated',
          blockSize: 2,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Alice Updated');
      expect(body.blockSize).toBe(2);
    });

    it('PUT /crew/:id - replaces roles when roleIds provided', async () => {
      // Create roles
      const role1Res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'ReplaceRole1' },
      });
      const role1Id = role1Res.json().id;
      createdRoleIds.push(role1Id);

      const role2Res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'ReplaceRole2' },
      });
      const role2Id = role2Res.json().id;
      createdRoleIds.push(role2Id);

      // Create crew with role1
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW005',
          name: 'Charlie',
          roleIds: [role1Id],
        },
      });
      createdCrewIds.push('TCRW005');

      // Replace with role2
      const res = await app.inject({
        method: 'PUT',
        url: '/crew/TCRW005',
        payload: { roleIds: [role2Id] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.roles.length).toBe(1);
      expect(body.roles[0].roleId).toBe(role2Id);
    });

    it('PUT /crew/:id - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/crew/NOEXIST',
        payload: { name: 'Will Fail' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /crew/:id/add-role - adds a role to crew member', async () => {
      // Create crew
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW006',
          name: 'Dana',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW006');

      // Create ART role
      const artRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: 'ART_ADD' },
      });
      expect(artRes.statusCode).toBe(200);
      createdRoleIds.push(artRes.json().id);

      const res = await app.inject({
        method: 'POST',
        url: '/crew/TCRW006/add-role',
        payload: { roleName: 'ART_ADD' },
      });
      expect(res.statusCode).toBe(204);

      // Verify role was added
      const getRes = await app.inject({
        method: 'GET',
        url: '/crew?id=TCRW006',
      });
      const crew = getRes.json();
      expect(crew.roles.some((r: any) => r.role.name === 'ART_ADD')).toBe(true);
    });

    it('POST /crew/:id/add-role - rejects duplicate role', async () => {
      // Create a unique role for this test run to avoid name collisions
      const roleName = `DuplicateTest_${Date.now()}`;
      const dupRoleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { name: roleName },
      });
      expect(dupRoleRes.statusCode).toBe(200);
      const dupRoleId = dupRoleRes.json().id;
      createdRoleIds.push(dupRoleId);

      const crewCreate = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW007',
          name: 'Duplicate Test',
          roleIds: [dupRoleId],
        },
      });
      expect(crewCreate.statusCode).toBe(200);
      createdCrewIds.push('TCRW007');

      // Try to add the same role again
      const res = await app.inject({
        method: 'POST',
        url: '/crew/TCRW007/add-role',
        payload: { roleName },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain('already has this role');
    });

    it('POST /crew/:id/add-role - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/crew/NOEXIST/add-role',
        payload: { roleName: 'TestRole' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /crew/:id/add-role - returns 404 for non-existent role', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW008',
          name: 'Eve',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW008');

      const res = await app.inject({
        method: 'POST',
        url: '/crew/TCRW008/add-role',
        payload: { roleName: 'NonExistentRole' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /crew/:id - deletes a crew member', async () => {
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: 'TCRW009',
          name: 'Frank',
          roleIds: [],
        },
      });
      createdCrewIds.push('TCRW009');

      const res = await app.inject({
        method: 'DELETE',
        url: '/crew/TCRW009',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);

      // Verify crew is gone
      const getRes = await app.inject({
        method: 'GET',
        url: '/crew?id=TCRW009',
      });
      expect(getRes.statusCode).toBe(404);

      // Remove from tracking since we already deleted it
      createdCrewIds = createdCrewIds.filter((id) => id !== 'TCRW009');
    });

    it('DELETE /crew/:id - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/crew/NOEXIST',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
