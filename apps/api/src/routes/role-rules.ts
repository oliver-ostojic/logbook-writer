import { FastifyInstance } from "fastify";
import {
  PrismaClient,
  RoleRuleType,
  ConstraintType,
  Prisma,
} from "@prisma/client";
import { getUserRole, canManageCrewPreferences } from "../middleware/rbac";

const prisma = new PrismaClient();

// ============== Types ==============

type CreateRoleRuleBody = {
  roleId: number;
  type: RoleRuleType;
  targetRoleId?: number;
  valueInt?: number;
  constraintType: ConstraintType;
  displayName?: string;
  description?: string;
};

type UpdateRoleRuleBody = Partial<CreateRoleRuleBody>;

type CreateCrewRoleRuleBody = {
  crewId: string;
  roleRuleId: number;
  isPriority?: boolean;
  description?: string;
};

type CreateStoreRoleRuleBody = {
  storeId: number;
  roleRuleId: number;
  isPriority?: boolean;
  description?: string;
};

type RoleRuleParams = { id: string };
type CrewRoleRuleParams = { id: string };
type StoreRoleRuleParams = { id: string };

// ============== Route Registration ==============

export function registerRoleRuleRoutes(app: FastifyInstance) {
  // Include related data in responses
  const roleRuleInclude = {
    Role: { select: { id: true, code: true, displayName: true } },
    TargetRole: { select: { id: true, code: true, displayName: true } },
    CrewRoleRules: {
      include: { Crew: { select: { id: true, name: true } } },
    },
    StoreRoleRules: {
      include: { Store: { select: { id: true, name: true } } },
    },
  } satisfies Prisma.RoleRuleInclude;

  // ============== RoleRule CRUD ==============

  // GET /role-rules - List all role rules
  app.get<{ Querystring: { roleId?: string; constraintType?: string; storeId?: string } }>(
    "/role-rules",
    async (req, reply) => {
      const { roleId, constraintType, storeId } = req.query;

      const rules = await prisma.roleRule.findMany({
        where: {
          ...(roleId && { roleId: parseInt(roleId) }),
          ...(constraintType && { constraintType: constraintType as ConstraintType }),
          ...(storeId && { Role: { storeId: parseInt(storeId) } }),
        },
        include: roleRuleInclude,
        orderBy: [{ type: "asc" }, { roleId: "asc" }],
      });

      return reply.send(rules);
    }
  );

  // GET /role-rules/:id - Get a single role rule
  app.get<{ Params: RoleRuleParams }>(
    "/role-rules/:id",
    async (req, reply) => {
      const id = parseInt(req.params.id);

      const rule = await prisma.roleRule.findUnique({
        where: { id },
        include: roleRuleInclude,
      });

      if (!rule) {
        return reply.code(404).send({ error: "RoleRule not found" });
      }

      return reply.send(rule);
    }
  );

  // POST /role-rules - Create a new role rule
  app.post<{ Body: CreateRoleRuleBody }>("/role-rules", async (req, reply) => {
    console.log('=== POST /role-rules ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { roleId, type, targetRoleId, constraintType, valueInt, displayName, description } = req.body;

    if (!roleId || !type || !constraintType) {
      console.error('Validation failed: Missing required fields');
      console.error('roleId:', roleId, 'type:', type, 'constraintType:', constraintType);
      return reply
        .code(400)
        .send({ error: "roleId, type, and constraintType are required" });
    }

    // Validate that role exists
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return reply.code(400).send({ error: `Role ${roleId} not found` });
    }

    // Validate targetRoleId if provided
    if (targetRoleId) {
      const targetRole = await prisma.role.findUnique({
        where: { id: targetRoleId },
      });
      if (!targetRole) {
        return reply
          .code(400)
          .send({ error: `Target role ${targetRoleId} not found` });
      }
    }

    try {
      console.log('Creating RoleRule with data:', {
        roleId,
        type,
        targetRoleId,
        constraintType,
        valueInt,
        displayName,
        description,
      });

      const rule = await prisma.roleRule.create({
        data: {
          roleId,
          type,
          targetRoleId,
          constraintType,
          valueInt,
          displayName,
          description,
        },
        include: roleRuleInclude,
      });

      console.log('RoleRule created successfully:', rule.id);
      return reply.code(201).send(rule);
    } catch (error) {
      console.error('Error creating RoleRule:', error);
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        console.error('Duplicate RoleRule detected');
        return reply
          .code(409)
          .send({ error: "RoleRule with this combination already exists" });
      }
      console.error('Unexpected error:', error);
      throw error;
    }
  });

  // PATCH /role-rules/:id - Update a role rule
  app.patch<{ Params: RoleRuleParams; Body: UpdateRoleRuleBody }>(
    "/role-rules/:id",
    async (req, reply) => {
      const id = parseInt(req.params.id);
      const { roleId, type, targetRoleId, constraintType, valueInt, displayName, description } = req.body;

      try {
        const rule = await prisma.roleRule.update({
          where: { id },
          data: {
            ...(roleId !== undefined && { roleId }),
            ...(type !== undefined && { type }),
            ...(targetRoleId !== undefined && { targetRoleId }),
            ...(constraintType !== undefined && { constraintType }),
            ...(valueInt !== undefined && { valueInt }),
            ...(displayName !== undefined && { displayName }),
            ...(description !== undefined && { description }),
          },
          include: roleRuleInclude,
        });

        return reply.send(rule);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({ error: "RoleRule not found" });
        }
        throw error;
      }
    }
  );

  // DELETE /role-rules/:id - Delete a role rule
  app.delete<{ Params: RoleRuleParams }>(
    "/role-rules/:id",
    async (req, reply) => {
      const id = parseInt(req.params.id);

      try {
        await prisma.roleRule.delete({ where: { id } });
        return reply.code(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({ error: "RoleRule not found" });
        }
        throw error;
      }
    }
  );

  // ============== CrewRoleRule CRUD ==============

  // GET /crew-role-rules - List crew role rules
  app.get<{ Querystring: { crewId?: string; roleRuleId?: string } }>(
    "/crew-role-rules",
    async (req, reply) => {
      const { crewId, roleRuleId } = req.query;

      const rules = await prisma.crewRoleRule.findMany({
        where: {
          ...(crewId && { crewId }),
          ...(roleRuleId && { roleRuleId: parseInt(roleRuleId) }),
        },
        include: {
          Crew: { select: { id: true, name: true } },
          RoleRule: { include: { Role: true, TargetRole: true } },
        },
        orderBy: { crewId: "asc" },
      });

      return reply.send(rules);
    }
  );

  // POST /crew-role-rules - Assign a role rule to a crew member
  // RBAC: Only admin can create crew preferences
  app.post<{ Body: CreateCrewRoleRuleBody }>(
    "/crew-role-rules",
    async (req, reply) => {
      // RBAC check - only admin can create crew role rules
      const userRole = getUserRole(req);
      if (!canManageCrewPreferences(userRole)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only admin can manage crew preferences",
          currentRole: userRole,
        });
      }

      const { crewId, roleRuleId, isPriority, description } = req.body;

      if (!crewId || !roleRuleId) {
        return reply
          .code(400)
          .send({ error: "crewId and roleRuleId are required" });
      }

      // Validate crew exists
      const crew = await prisma.crew.findUnique({ where: { id: crewId } });
      if (!crew) {
        return reply.code(400).send({ error: `Crew ${crewId} not found` });
      }

      // Validate role rule exists
      const roleRule = await prisma.roleRule.findUnique({
        where: { id: roleRuleId },
      });
      if (!roleRule) {
        return reply
          .code(400)
          .send({ error: `RoleRule ${roleRuleId} not found` });
      }

      try {
        const crewRoleRule = await prisma.crewRoleRule.create({
          data: {
            crewId,
            roleRuleId,
            isPriority: isPriority ?? false,
          },
          include: {
            Crew: { select: { id: true, name: true } },
            RoleRule: { include: { Role: true, TargetRole: true } },
          },
        });

        return reply.code(201).send(crewRoleRule);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return reply
            .code(409)
            .send({ error: "Crew already has this role rule assigned" });
        }
        throw error;
      }
    }
  );

  // DELETE /crew-role-rules/:id - Remove a role rule from a crew member
  // RBAC: Only admin can delete crew preferences
  app.delete<{ Params: CrewRoleRuleParams }>(
    "/crew-role-rules/:id",
    async (req, reply) => {
      // RBAC check - only admin can delete crew role rules
      const userRole = getUserRole(req);
      if (!canManageCrewPreferences(userRole)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only admin can manage crew preferences",
          currentRole: userRole,
        });
      }

      const id = parseInt(req.params.id);

      try {
        await prisma.crewRoleRule.delete({ where: { id } });
        return reply.code(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({ error: "CrewRoleRule not found" });
        }
        throw error;
      }
    }
  );

  // ============== StoreRoleRule CRUD ==============

  // GET /store-role-rules - List store role rules
  app.get<{ Querystring: { storeId?: string; roleRuleId?: string } }>(
    "/store-role-rules",
    async (req, reply) => {
      const { storeId, roleRuleId } = req.query;

      const rules = await prisma.storeRoleRule.findMany({
        where: {
          ...(storeId && { storeId: parseInt(storeId) }),
          ...(roleRuleId && { roleRuleId: parseInt(roleRuleId) }),
        },
        include: {
          Store: { select: { id: true, name: true } },
          RoleRule: { include: { Role: true, TargetRole: true } },
        },
        orderBy: { storeId: "asc" },
      });

      return reply.send(rules);
    }
  );

  // POST /store-role-rules - Assign a role rule to a store
  app.post<{ Body: CreateStoreRoleRuleBody }>(
    "/store-role-rules",
    async (req, reply) => {
      const { storeId, roleRuleId, isPriority, description } = req.body;

      if (!storeId || !roleRuleId) {
        return reply
          .code(400)
          .send({ error: "storeId and roleRuleId are required" });
      }

      // Validate store exists
      const store = await prisma.store.findUnique({ where: { id: storeId } });
      if (!store) {
        return reply.code(400).send({ error: `Store ${storeId} not found` });
      }

      // Validate role rule exists
      const roleRule = await prisma.roleRule.findUnique({
        where: { id: roleRuleId },
      });
      if (!roleRule) {
        return reply
          .code(400)
          .send({ error: `RoleRule ${roleRuleId} not found` });
      }

      try {
        const storeRoleRule = await prisma.storeRoleRule.create({
          data: {
            storeId,
            roleRuleId,
            isPriority: isPriority ?? false,
          },
          include: {
            Store: { select: { id: true, name: true } },
            RoleRule: { include: { Role: true, TargetRole: true } },
          },
        });

        return reply.code(201).send(storeRoleRule);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return reply
            .code(409)
            .send({ error: "Store already has this role rule assigned" });
        }
        throw error;
      }
    }
  );

  // DELETE /store-role-rules/:id - Remove a role rule from a store
  app.delete<{ Params: StoreRoleRuleParams }>(
    "/store-role-rules/:id",
    async (req, reply) => {
      const id = parseInt(req.params.id);

      try {
        await prisma.storeRoleRule.delete({ where: { id } });
        return reply.code(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({ error: "StoreRoleRule not found" });
        }
        throw error;
      }
    }
  );

  // ============== Convenience Endpoints ==============

  // GET /stores/:storeId/effective-role-rules - Get all role rules effective for a store
  // This combines store-level rules with role-level rules
  app.get<{ Params: { storeId: string }; Querystring: { crewId?: string } }>(
    "/stores/:storeId/effective-role-rules",
    async (req, reply) => {
      const storeId = parseInt(req.params.storeId);
      const { crewId } = req.query;

      // Get store-level rules
      const storeRules = await prisma.storeRoleRule.findMany({
        where: { storeId },
        include: {
          RoleRule: {
            include: {
              Role: { select: { id: true, code: true, displayName: true } },
              TargetRole: {
                select: { id: true, code: true, displayName: true },
              },
            },
          },
        },
      });

      // If crewId provided, also get crew-specific rules
      let crewRules: typeof storeRules = [];
      if (crewId) {
        const crewRoleRules = await prisma.crewRoleRule.findMany({
          where: { crewId },
          include: {
            RoleRule: {
              include: {
                Role: { select: { id: true, code: true, displayName: true } },
                TargetRole: {
                  select: { id: true, code: true, displayName: true },
                },
              },
            },
          },
        });

        // Convert to same shape for merging
        crewRules = crewRoleRules.map((r) => ({
          ...r,
          storeId: 0, // Mark as crew-level
        })) as typeof storeRules;
      }

      // Combine and dedupe (crew rules take priority)
      const crewRuleIds = new Set(crewRules.map((r) => r.roleRuleId));
      const effectiveRules = [
        ...crewRules.map((r) => ({ ...r, source: "crew" as const })),
        ...storeRules
          .filter((r) => !crewRuleIds.has(r.roleRuleId))
          .map((r) => ({ ...r, source: "store" as const })),
      ];

      return reply.send({
        storeId,
        crewId: crewId || null,
        rules: effectiveRules,
      });
    }
  );
}
