export const AUTH_CONFIG = {
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production-PLEASE',
    expiresIn: '7d',
    cookieName: 'auth_token',
  },
  bcrypt: {
    saltRounds: 12,
  },
  registration: {
    allowCrewSelfRegister: true, // CREW role can self-register with valid crewId
  },
};

// JWT payload structure
export interface JWTPayload {
  id: string;
  username: string;
  name: string;
  role: 'CREW' | 'MATE' | 'CAPTAIN' | 'ADMIN';
  storeId: number | null;
  crewId: string | null;
}
