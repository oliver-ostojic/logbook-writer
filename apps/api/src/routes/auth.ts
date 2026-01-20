import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AUTH_CONFIG, JWTPayload } from '../config/auth.config';

const prisma = new PrismaClient();

// Request body types
interface LoginBody {
  username: string;
  password: string;
}

interface RegisterBody {
  username: string;
  password: string;
  name: string;
  role?: UserRole;
  storeId?: number;
  crewId?: string; // Required for CREW role
  inviteCode?: string; // Required for MATE/CAPTAIN role
}

interface CreateInviteCodeBody {
  targetRole: 'CAPTAIN' | 'MATE';
  storeId: number;
  expiresInDays?: number; // Default: 7 days
}

// Generate a random 8-character alphanumeric code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded ambiguous chars (I, O, 0, 1)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

// Helper to set JWT cookie
function setAuthCookie(reply: FastifyReply, token: string) {
  reply.setCookie(AUTH_CONFIG.jwt.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  });
}

// Helper to clear JWT cookie
function clearAuthCookie(reply: FastifyReply) {
  reply.clearCookie(AUTH_CONFIG.jwt.cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

export function registerAuthRoutes(app: FastifyInstance) {
  // POST /auth/login - Login and get JWT cookie
  app.post<{ Body: LoginBody }>('/auth/login', async (req, reply) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        Crew: { select: { id: true, name: true } },
        Store: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }

    // Create JWT payload
    const payload: JWTPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
      crewId: user.crewId,
    };

    // Sign JWT
    const token = app.jwt.sign(payload, { expiresIn: AUTH_CONFIG.jwt.expiresIn });

    // Set cookie
    setAuthCookie(reply, token);

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        crewId: user.crewId,
        crew: user.Crew,
        store: user.Store,
      },
    };
  });

  // POST /auth/logout - Clear JWT cookie
  app.post('/auth/logout', async (req, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  // POST /auth/register - Register a new user
  // CREW: Self-register with valid crewId
  // MATE/CAPTAIN: Requires invite code (role is determined from invite code)
  // ADMIN: Requires ADMIN auth
  app.post<{ Body: RegisterBody }>('/auth/register', async (req, reply) => {
    const { username, password, name, role: requestedRole, storeId, crewId, inviteCode } = req.body;

    // Validate required fields
    if (!username || !password || !name) {
      return reply.code(400).send({ error: 'Username, password, and name are required' });
    }

    if (password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }

    // Check if username is taken
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return reply.code(409).send({ error: 'Username already taken' });
    }

    // If invite code is provided, use invite code flow (for MATE/CAPTAIN)
    if (inviteCode) {
      // Find and validate invite code
      const invite = await prisma.inviteCode.findUnique({
        where: { code: inviteCode },
        include: { Store: true },
      });

      if (!invite) {
        return reply.code(404).send({ error: 'Invalid invite code' });
      }

      if (invite.usedById) {
        return reply.code(400).send({ error: 'This invite code has already been used' });
      }

      if (new Date() > invite.expiresAt) {
        return reply.code(400).send({ error: 'This invite code has expired' });
      }

      // Use the role from the invite code
      const role = invite.targetRole;
      const resolvedStoreId = invite.storeId;

      // Hash password
      const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.bcrypt.saltRounds);

      // Create user and mark invite code as used in a transaction
      const user = await prisma.$transaction(async (tx) => {
        // Create user
        const newUser = await tx.user.create({
          data: {
            username,
            passwordHash,
            name,
            role,
            storeId: resolvedStoreId,
            crewId: null,
          },
          include: {
            Store: { select: { id: true, name: true } },
          },
        });

        // Mark invite code as used
        await tx.inviteCode.update({
          where: { id: invite.id },
          data: {
            usedById: newUser.id,
            usedAt: new Date(),
          },
        });

        return newUser;
      });

      // Auto-login: create JWT and set cookie
      const payload: JWTPayload = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        crewId: user.crewId,
      };
      const token = app.jwt.sign(payload, { expiresIn: AUTH_CONFIG.jwt.expiresIn });
      setAuthCookie(reply, token);

      return reply.code(201).send({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          crewId: user.crewId,
          crew: null,
          store: user.Store,
        },
      });
    }

    // Default to CREW registration if no invite code
    const role = requestedRole || 'CREW';

    // For CREW registration: validate crewId
    if (role === 'CREW') {
      if (!crewId) {
        return reply.code(400).send({ error: 'crewId is required for CREW registration' });
      }

      // Validate crewId exists
      const crew = await prisma.crew.findUnique({
        where: { id: crewId },
        include: { User: true },
      });

      if (!crew) {
        return reply.code(404).send({ error: 'Crew member not found' });
      }

      // Check if crew already has a user
      if (crew.User) {
        return reply.code(409).send({ error: 'This crew member already has an account' });
      }

      // Use crew's storeId
      const resolvedStoreId = crew.storeId;

      // Hash password
      const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.bcrypt.saltRounds);

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          name,
          role: 'CREW',
          storeId: resolvedStoreId,
          crewId,
        },
        include: {
          Crew: { select: { id: true, name: true } },
          Store: { select: { id: true, name: true } },
        },
      });

      // Auto-login: create JWT and set cookie
      const payload: JWTPayload = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
        crewId: user.crewId,
      };
      const token = app.jwt.sign(payload, { expiresIn: AUTH_CONFIG.jwt.expiresIn });
      setAuthCookie(reply, token);

      return reply.code(201).send({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          crewId: user.crewId,
          crew: user.Crew,
          store: user.Store,
        },
      });
    }

    // For MATE/CAPTAIN without invite code - they need one
    if (role === 'MATE' || role === 'CAPTAIN') {
      return reply.code(400).send({ error: 'Invite code is required for MATE/CAPTAIN registration' });
    }

    // For ADMIN registration: requires existing ADMIN auth
    if (role === 'ADMIN') {
      let currentUser: JWTPayload | null = null;
      try {
        const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
        if (token) {
          currentUser = app.jwt.verify<JWTPayload>(token);
        }
      } catch {
        // No valid token
      }

      if (!currentUser || currentUser.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Only ADMIN can create ADMIN users' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, AUTH_CONFIG.bcrypt.saltRounds);

      // Create admin user
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          name,
          role: 'ADMIN',
          storeId: null,
          crewId: null,
        },
      });

      return reply.code(201).send({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          crewId: user.crewId,
          store: null,
        },
      });
    }

    // Unknown role
    return reply.code(400).send({ error: 'Invalid role' });
  });

  // GET /auth/me - Get current authenticated user
  app.get('/auth/me', async (req, reply) => {
    try {
      const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }

      const payload = app.jwt.verify<JWTPayload>(token);

      // Fetch fresh user data
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        include: {
          Crew: { select: { id: true, name: true } },
          Store: { select: { id: true, name: true } },
        },
      });

      if (!user) {
        clearAuthCookie(reply);
        return reply.code(401).send({ error: 'User not found' });
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          storeId: user.storeId,
          crewId: user.crewId,
          crew: user.Crew,
          store: user.Store,
        },
      };
    } catch {
      clearAuthCookie(reply);
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });

  // POST /auth/change-password - Change password for authenticated user
  app.post<{ Body: ChangePasswordBody }>('/auth/change-password', async (req, reply) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return reply.code(400).send({ error: 'New password must be at least 6 characters' });
    }

    // Verify authentication
    let payload: JWTPayload;
    try {
      const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      payload = app.jwt.verify<JWTPayload>(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    // Fetch user
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return reply.code(401).send({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, AUTH_CONFIG.bcrypt.saltRounds);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return { ok: true };
  });

  // POST /auth/invite-codes - Create an invite code
  // ADMIN can create codes for CAPTAIN (any store)
  // CAPTAIN can create codes for MATE (their store only)
  app.post<{ Body: CreateInviteCodeBody }>('/auth/invite-codes', async (req, reply) => {
    const { targetRole, storeId, expiresInDays = 7 } = req.body;

    // Validate required fields
    if (!targetRole || !storeId) {
      return reply.code(400).send({ error: 'targetRole and storeId are required' });
    }

    if (targetRole !== 'CAPTAIN' && targetRole !== 'MATE') {
      return reply.code(400).send({ error: 'targetRole must be CAPTAIN or MATE' });
    }

    // Verify authentication
    let currentUser: JWTPayload;
    try {
      const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      currentUser = app.jwt.verify<JWTPayload>(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    // Permission checks
    if (targetRole === 'CAPTAIN') {
      // Only ADMIN can create CAPTAIN invite codes
      if (currentUser.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Only ADMIN can create CAPTAIN invite codes' });
      }
    } else if (targetRole === 'MATE') {
      // CAPTAIN can create MATE codes for their store, ADMIN can create for any store
      if (currentUser.role !== 'CAPTAIN' && currentUser.role !== 'ADMIN') {
        return reply.code(403).send({ error: 'Only CAPTAIN or ADMIN can create MATE invite codes' });
      }
      if (currentUser.role === 'CAPTAIN' && currentUser.storeId !== storeId) {
        return reply.code(403).send({ error: 'CAPTAIN can only create invite codes for their own store' });
      }
    }

    // Validate store exists
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return reply.code(404).send({ error: 'Store not found' });
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateInviteCode();
      const existing = await prisma.inviteCode.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return reply.code(500).send({ error: 'Failed to generate unique invite code' });
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Create invite code
    const inviteCode = await prisma.inviteCode.create({
      data: {
        code,
        targetRole,
        storeId,
        createdById: currentUser.id,
        expiresAt,
      },
      include: {
        Store: { select: { id: true, name: true } },
        CreatedBy: { select: { id: true, name: true, role: true } },
      },
    });

    return reply.code(201).send({
      inviteCode: {
        id: inviteCode.id,
        code: inviteCode.code,
        targetRole: inviteCode.targetRole,
        store: inviteCode.Store,
        createdBy: inviteCode.CreatedBy,
        expiresAt: inviteCode.expiresAt,
        createdAt: inviteCode.createdAt,
      },
    });
  });

  // GET /auth/invite-codes - List invite codes created by current user
  app.get('/auth/invite-codes', async (req, reply) => {
    // Verify authentication
    let currentUser: JWTPayload;
    try {
      const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      currentUser = app.jwt.verify<JWTPayload>(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    // Only CAPTAIN and ADMIN can view invite codes
    if (currentUser.role !== 'CAPTAIN' && currentUser.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Only CAPTAIN or ADMIN can view invite codes' });
    }

    // Build query based on role
    const where: any = {};
    if (currentUser.role === 'CAPTAIN') {
      // CAPTAIN can only see codes they created
      where.createdById = currentUser.id;
    }
    // ADMIN can see all codes

    const inviteCodes = await prisma.inviteCode.findMany({
      where,
      include: {
        Store: { select: { id: true, name: true } },
        CreatedBy: { select: { id: true, name: true, role: true } },
        UsedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      inviteCodes: inviteCodes.map((ic) => ({
        id: ic.id,
        code: ic.code,
        targetRole: ic.targetRole,
        store: ic.Store,
        createdBy: ic.CreatedBy,
        usedBy: ic.UsedBy,
        usedAt: ic.usedAt,
        expiresAt: ic.expiresAt,
        createdAt: ic.createdAt,
        isExpired: new Date() > ic.expiresAt,
        isUsed: !!ic.usedById,
      })),
    };
  });

  // DELETE /auth/invite-codes/:id - Delete an unused invite code
  app.delete<{ Params: { id: string } }>('/auth/invite-codes/:id', async (req, reply) => {
    const { id } = req.params;

    // Verify authentication
    let currentUser: JWTPayload;
    try {
      const token = req.cookies[AUTH_CONFIG.jwt.cookieName];
      if (!token) {
        return reply.code(401).send({ error: 'Not authenticated' });
      }
      currentUser = app.jwt.verify<JWTPayload>(token);
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    // Find the invite code
    const inviteCode = await prisma.inviteCode.findUnique({ where: { id } });
    if (!inviteCode) {
      return reply.code(404).send({ error: 'Invite code not found' });
    }

    // Permission check: creator or ADMIN can delete
    if (inviteCode.createdById !== currentUser.id && currentUser.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'You can only delete your own invite codes' });
    }

    // Can't delete used codes
    if (inviteCode.usedById) {
      return reply.code(400).send({ error: 'Cannot delete a used invite code' });
    }

    await prisma.inviteCode.delete({ where: { id } });

    return { ok: true };
  });
}
