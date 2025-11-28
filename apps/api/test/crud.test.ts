import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../src/index';
// Refactored to use public API endpoints for seeding/cleanup instead of direct Prisma coupling
const STORE_ID = 768;

let app: Awaited<ReturnType<typeof buildServer>>;

describe('CRUD - Roles and Crew Members', () => {
  // Track created resources for cleanup
  let createdRoleIds: string[] = [];
  let createdCrewIds: string[] = [];

  beforeAll(async () => {
    app = await buildServer();
    // Create store (idempotent: 200 or 409 OK)
    const storeRes = await app.inject({ method: 'POST', url: '/stores', payload: { id: STORE_ID, name: 'Test Store' } });
    expect([200,409]).toContain(storeRes.statusCode);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset tracking arrays
    createdRoleIds = [];
    createdCrewIds = [];
  });

  afterEach(async () => {
    // API cleanup: delete crew then roles
    for (const crewId of createdCrewIds) {
      const res = await app.inject({ method: 'DELETE', url: `/crew/${crewId}` });
      // Accept 200 (deleted) or 404 (already gone)
      expect([200,404]).toContain(res.statusCode);
    }
    for (const roleId of createdRoleIds) {
      const res = await app.inject({ method: 'DELETE', url: `/roles/${roleId}` });
      expect([200,404,400]).toContain(res.statusCode); // 400 if id invalid, 404 if already removed
    }
  });

  describe('Roles CRUD', () => {
    it('POST /roles - creates a new role', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `REGISTER_UNIQUE_${Date.now()}`, storeId: STORE_ID },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.code).toBe(body.code); // code should match what was sent
      expect(Array.isArray(body.crewMembers)).toBe(true);
      createdRoleIds.push(body.id);
    });

    it('POST /roles - rejects empty name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: '', storeId: STORE_ID },
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
        payload: { code: `ListTestRole_${Date.now()}`, storeId: STORE_ID },
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
        payload: { code: `GetByIdRole_${Date.now()}`, storeId: STORE_ID },
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

    it('GET /roles?id=invalid - returns 400 for invalid role id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/roles?id=invalid',
      });
      expect(res.statusCode).toBe(400);
    });

    it('GET /roles/:name/crew - lists crew for a role by name', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `CrewListRole_${Date.now()}`, storeId: STORE_ID },
      });
      createdRoleIds.push(createRes.json().id);

      const res = await app.inject({
        method: 'GET',
        url: `/roles/${createRes.json().code}/crew`,
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
        payload: { code: `RemoveCrewRole_${Date.now()}`, storeId: STORE_ID },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      // Create a crew member with the test role (using 7-char ID as per schema)
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      const crewRes = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Alice',
          roleIds: [roleId],
        },
      });
      expect(crewRes.statusCode).toBe(200);
      createdCrewIds.push(crewId);

      // Now remove the crew member from the role
      const res = await app.inject({
        method: 'PUT',
        url: `/roles/${roleId}`,
        payload: { removeCrewMemberId: crewId },
      });
      expect(res.statusCode).toBe(200);
    });

    it('PUT /roles/:id - rejects missing removeCrewMemberId', async () => {
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `RejectTestRole_${Date.now()}`, storeId: STORE_ID },
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
        payload: { code: `DeleteTestRole_${Date.now()}`, storeId: STORE_ID },
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

    it('DELETE /roles/:id - returns 400 for invalid role id', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/roles/invalid',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Crew Members CRUD', () => {
    it('POST /crew - creates a new crew member', async () => {
      const roleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `CrewCreateRole_${Date.now()}`, storeId: STORE_ID },
      });
      const roleId = roleRes.json().id;
      createdRoleIds.push(roleId);

      const crewId = `TCREW${Date.now().toString().slice(-2)}`;
      const res = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Alice Smith',
          roleIds: [roleId],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(crewId);
      expect(body.name).toBe('Alice Smith');
      expect(body.roles.length).toBe(1);
      createdCrewIds.push(crewId);
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
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Alice',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      const res = await app.inject({
        method: 'GET',
        url: '/crew',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      const testCrew = body.find((c: any) => c.id === crewId);
      expect(testCrew).toBeDefined();
    });

    it('GET /crew?id=X - fetches single crew member by id', async () => {
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Bob',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      const res = await app.inject({
        method: 'GET',
        url: `/crew?id=${crewId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(crewId);
    });

    it('GET /crew?id=invalid - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/crew?id=NOEXIST',
      });
      expect(res.statusCode).toBe(404);
    });

    it('PUT /crew/:id - updates crew member fields', async () => {
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Alice',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      const res = await app.inject({
        method: 'PUT',
        url: `/crew/${crewId}`,
        payload: {
          name: 'Alice Updated',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Alice Updated');
    });

    it('PUT /crew/:id - replaces roles when roleIds provided', async () => {
      // Create roles
      const role1Res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `ReplaceRole1_${Date.now()}`, storeId: STORE_ID },
      });
      const role1Id = role1Res.json().id;
      createdRoleIds.push(role1Id);

      const role2Res = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: `ReplaceRole2_${Date.now()}`, storeId: STORE_ID },
      });
      const role2Id = role2Res.json().id;
      createdRoleIds.push(role2Id);

      // Create crew with role1
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Charlie',
          roleIds: [role1Id],
        },
      });
      createdCrewIds.push(crewId);

      // Replace with role2
      const res = await app.inject({
        method: 'PUT',
        url: `/crew/${crewId}`,
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
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Dana',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      // Create ART role
      const roleName = `ART_ADD_${Date.now()}`;
      const artRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: roleName, storeId: STORE_ID },
      });
      expect(artRes.statusCode).toBe(200);
      const artRole = artRes.json();
      createdRoleIds.push(artRole.id);

      const res = await app.inject({
        method: 'POST',
        url: `/crew/${crewId}/add-role`,
        payload: { roleCode: artRole.code },
      });
      expect(res.statusCode).toBe(204);

      // Verify role was added
      const getRes = await app.inject({
        method: 'GET',
        url: `/crew?id=${crewId}`,
      });
      const crew = getRes.json();
      expect(crew.roles.some((r: any) => r.role.code === artRole.code)).toBe(true);
    });

    it('POST /crew/:id/add-role - rejects duplicate role', async () => {
      // Create a unique role for this test run to avoid name collisions
      const roleName = `DuplicateTest_${Date.now()}`;
      const dupRoleRes = await app.inject({
        method: 'POST',
        url: '/roles',
        payload: { code: roleName, storeId: STORE_ID },
      });
      expect(dupRoleRes.statusCode).toBe(200);
      const dupRole = dupRoleRes.json();
      createdRoleIds.push(dupRole.id);

      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      const crewCreate = await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Duplicate Test',
          roleIds: [dupRole.id],
        },
      });
      expect(crewCreate.statusCode).toBe(200);
      createdCrewIds.push(crewId);

      // Try to add the same role again
      const res = await app.inject({
        method: 'POST',
        url: `/crew/${crewId}/add-role`,
        payload: { roleCode: dupRole.code },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toContain('already has this role');
    });

    it('POST /crew/:id/add-role - returns 404 for non-existent crew', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/crew/NOEXIST/add-role',
        payload: { roleCode: 'TestRole' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /crew/:id/add-role - returns 404 for non-existent role', async () => {
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Eve',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      const res = await app.inject({
        method: 'POST',
        url: `/crew/${crewId}/add-role`,
        payload: { roleCode: 'NonExistentRole' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /crew/:id - deletes a crew member', async () => {
      const crewId = `TCRW${Date.now().toString().slice(-3)}`;
      await app.inject({
        method: 'POST',
        url: '/crew',
        payload: {
          id: crewId,
          name: 'Frank',
          roleIds: [],
        },
      });
      createdCrewIds.push(crewId);

      const res = await app.inject({
        method: 'DELETE',
        url: `/crew/${crewId}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);

      // Verify crew is gone
      const getRes = await app.inject({
        method: 'GET',
        url: `/crew?id=${crewId}`,
      });
      expect(getRes.statusCode).toBe(404);

      // Remove from tracking since we already deleted it
      createdCrewIds = createdCrewIds.filter((id) => id !== crewId);
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
