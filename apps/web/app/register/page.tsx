'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';
import { NavStatsCard, NavDivider } from '@/app/stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';
import { register } from '@/lib/api/auth';

type RegistrationMode = 'crew' | 'invite';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, setUser, setToken } = useAuthStore();

  // Check if there's an invite code in URL
  const urlInviteCode = searchParams.get('code') || '';

  const [mode, setMode] = useState<RegistrationMode>(urlInviteCode ? 'invite' : 'crew');
  const [crewId, setCrewId] = useState('');
  const [inviteCode, setInviteCode] = useState(urlInviteCode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === 'CREW' && user.storeId && user.crewId) {
        router.replace(`/stores/${user.storeId}/crew/${user.crewId}`);
      } else if (user.storeId) {
        router.replace(`/stores/${user.storeId}/home`);
      } else {
        router.replace('/stores/768/home');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Common validation
    if (!username || !password || !name) {
      setError('All fields are required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Mode-specific validation
    if (mode === 'crew') {
      if (!crewId) {
        setError('Crew ID is required');
        return;
      }
      if (crewId.length !== 7) {
        setError('Crew ID must be exactly 7 characters');
        return;
      }
    } else {
      if (!inviteCode) {
        setError('Invite code is required');
        return;
      }
      if (inviteCode.length !== 8) {
        setError('Invite code must be exactly 8 characters');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await register(
        mode === 'crew'
          ? { crewId, username, password, name, role: 'CREW' }
          : { inviteCode, username, password, name }
      );
      setUser(response.user);
      if (response.token) {
        setToken(response.token);
      }

      // Redirect based on role
      const { user: registeredUser } = response;
      if (registeredUser.role === 'CREW' && registeredUser.storeId && registeredUser.crewId) {
        router.push(`/stores/${registeredUser.storeId}/crew/${registeredUser.crewId}`);
      } else if (registeredUser.storeId) {
        router.push(`/stores/${registeredUser.storeId}/home`);
      } else {
        router.push('/stores/768/home');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'transparent' }}>
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Registration form card - top aligned with margin */}
      <div className="min-h-screen flex justify-center" style={{ padding: '24px 0' }}>
        <div
          className="ai-glass-border rounded-[1.5rem]"
          style={{ ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08), width: '600px' }}
        >
          <div
            className="rounded-[1.5rem]"
            style={{
              ...aiGlassLightContentStyle('1.5rem', 0.6),
              padding: '24px',
            }}
          >
            <div className="flex flex-col gap-6">
              {/* Outer card header - Logbook writer / Exit tabs */}
              <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                <div
                  className="ai-glass-border"
                  style={{
                    ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
                  }}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                      padding: '8px',
                    }}
                  >
                    <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                      <NavStatsCard
                        label="Logbook writer"
                        textOnly
                        isActive={true}
                        onClick={() => {}}
                      />
                      <NavStatsCard
                        label="Exit"
                        textOnly
                        isActive={false}
                        onClick={() => router.push('/')}
                      />
                    </nav>
                  </div>
                </div>
              </div>

              {/* Form inner card */}
              <div
                className="ai-glass-border rounded-[1.5rem]"
                style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
              >
                <div
                  className="rounded-[1.5rem]"
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '24px',
                  }}
                >
                  <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    {/* Header row - Sign in / Create account tabs */}
                    <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                      <div
                        className="ai-glass-border"
                        style={{
                          ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
                        }}
                      >
                        <div
                          style={{
                            ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                            padding: '8px',
                          }}
                        >
                          <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                            <NavStatsCard
                              label="Sign into your account"
                              textOnly
                              isActive={false}
                              onClick={() => router.push('/login')}
                            />
                            <NavStatsCard
                              label="Create account"
                              textOnly
                              isActive={true}
                              onClick={() => {}}
                            />
                          </nav>
                        </div>
                      </div>
                    </div>

                    {/* Error message */}
                    {error && (
                      <div
                        style={{
                          padding: '10px 16px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: '12px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '13px',
                          color: 'rgb(185, 28, 28)',
                        }}
                      >
                        {error}
                      </div>
                    )}

                    {/* Form fields card */}
                    <div className="ai-glass-border rounded-[1.5rem]" style={aiGlassLightBorderStyle('1.5rem')}>
                      <div
                        style={{
                          ...aiGlassLightContentStyle('1.5rem', 0.6),
                          padding: '24px',
                        }}
                      >
                        <div className="flex flex-col gap-6">
                          {/* Mode toggle header */}
                          <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
                            <div
                              className="ai-glass-border"
                              style={{
                                ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08),
                              }}
                            >
                              <div
                                style={{
                                  ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                                  padding: '8px',
                                }}
                              >
                                <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                                  <NavStatsCard
                                    label="I have a Crew ID"
                                    textOnly
                                    isActive={mode === 'crew'}
                                    onClick={() => setMode('crew')}
                                  />
                                  <NavStatsCard
                                    label="I have an Invite Code"
                                    textOnly
                                    isActive={mode === 'invite'}
                                    onClick={() => setMode('invite')}
                                  />
                                </nav>
                              </div>
                            </div>
                          </div>

                          {/* Form fields */}
                          <div className="flex flex-col gap-5">
                          {/* Crew ID or Invite Code field */}
                          <div className="flex flex-col gap-2">
                            <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>
                              {mode === 'crew' ? 'Crew ID' : 'Invite Code'}
                            </label>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <input
                                type="text"
                                value={mode === 'crew' ? crewId : inviteCode}
                                onChange={(e) =>
                                  mode === 'crew'
                                    ? setCrewId(e.target.value.toUpperCase())
                                    : setInviteCode(e.target.value.toUpperCase())
                                }
                                placeholder=""
                                maxLength={mode === 'crew' ? 7 : 8}
                                className="focus:outline-none focus:ring-0"
                                disabled={isSubmitting}
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.4),
                                  padding: '10px 18px',
                                  width: '100%',
                                  border: 'none',
                                  outline: 'none',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '14px',
                                  color: '#2C2C2C',
                                  fontWeight: 500,
                                  letterSpacing: mode === 'invite' ? '0.1em' : 'normal',
                                }}
                              />
                            </div>
                          </div>

                          {/* Name field */}
                          <div className="flex flex-col gap-2">
                            <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>
                              Full Name
                            </label>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="focus:outline-none focus:ring-0"
                                disabled={isSubmitting}
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.4),
                                  padding: '10px 18px',
                                  width: '100%',
                                  border: 'none',
                                  outline: 'none',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '14px',
                                  color: '#2C2C2C',
                                  fontWeight: 500,
                                }}
                              />
                            </div>
                          </div>

                          {/* Username field */}
                          <div className="flex flex-col gap-2">
                            <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>
                              Username
                            </label>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="focus:outline-none focus:ring-0"
                                disabled={isSubmitting}
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.4),
                                  padding: '10px 18px',
                                  width: '100%',
                                  border: 'none',
                                  outline: 'none',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '14px',
                                  color: '#2C2C2C',
                                  fontWeight: 500,
                                }}
                              />
                            </div>
                          </div>

                          {/* Password field */}
                          <div className="flex flex-col gap-2">
                            <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>
                              Password
                            </label>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="focus:outline-none focus:ring-0"
                                disabled={isSubmitting}
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.4),
                                  padding: '10px 18px',
                                  width: '100%',
                                  border: 'none',
                                  outline: 'none',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '14px',
                                  color: '#2C2C2C',
                                  fontWeight: 500,
                                }}
                              />
                            </div>
                          </div>

                          {/* Confirm Password field */}
                          <div className="flex flex-col gap-2">
                            <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', fontWeight: 500, color: '#6B6B6B' }}>
                              Confirm Password
                            </label>
                            <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="focus:outline-none focus:ring-0"
                                disabled={isSubmitting}
                                style={{
                                  ...aiGlassLightContentStyle('9999px', 0.4),
                                  padding: '10px 18px',
                                  width: '100%',
                                  border: 'none',
                                  outline: 'none',
                                  fontFamily: 'var(--font-open-sans)',
                                  fontSize: '14px',
                                  color: '#2C2C2C',
                                  fontWeight: 500,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </form>
                </div>
              </div>

              {/* Create account button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: isSubmitting ? 'hsl(0, 50%, 70%)' : 'hsl(0, 84%, 60%)',
                  color: 'white',
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '1.5rem',
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)')}
                onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)')}
              >
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageContent />
    </Suspense>
  );
}
