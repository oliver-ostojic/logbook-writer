'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle, GlassPillCard } from '@/components/ui/ai-glass';
import { NavStatsCard, NavDivider } from '@/app/stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';
import { login } from '@/lib/api/auth';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, setToken } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && username && password && !isSubmitting) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      // CREW users go to their crew page
      if (user.role === 'CREW' && user.storeId && user.crewId) {
        router.replace(`/stores/${user.storeId}/crew/${user.crewId}`);
      } else if (user.role === 'ADMIN') {
        // ADMIN users go to admin dashboard
        router.replace('/admin');
      } else if (user.storeId) {
        // MATE/CAPTAIN go to their store's home
        router.replace(`/stores/${user.storeId}/home`);
      } else {
        // Fallback
        router.replace('/login');
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await login({ username, password });
      setUser(response.user);
      if (response.token) {
        setToken(response.token);
      }

      // Redirect based on role
      const { user: loggedInUser } = response;
      if (loggedInUser.role === 'CREW' && loggedInUser.storeId && loggedInUser.crewId) {
        router.push(`/stores/${loggedInUser.storeId}/crew/${loggedInUser.crewId}`);
      } else if (loggedInUser.role === 'ADMIN') {
        router.push('/admin');
      } else if (loggedInUser.storeId) {
        router.push(`/stores/${loggedInUser.storeId}/home`);
      } else {
        router.push('/login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth
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

      {/* Outer wrapper card containing login form and continue button - centered */}
      <div className="min-h-screen flex items-center justify-center">
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
                      onClick={() => {
                        // Send message to parent window to close overlay
                        if (window.parent !== window) {
                          window.parent.postMessage({ type: 'CLOSE_LOGBOOK_OVERLAY' }, '*');
                        } else {
                          // Fallback if not in iframe
                          router.push('/');
                        }
                      }}
                    />
                  </nav>
                </div>
              </div>
            </div>

            {/* Login form card */}
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
                            isActive={true}
                            onClick={() => {}}
                          />
                          <NavStatsCard
                            label="Create account"
                            textOnly
                            isActive={false}
                            onClick={() => router.push('/register')}
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

                  {/* Username and Password fields */}
                  <div className="flex flex-col gap-5">
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
                          onKeyDown={handleKeyDown}
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
                          onKeyDown={handleKeyDown}
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
                </form>
              </div>
            </div>

            {/* Continue button - inside outer card, full width */}
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
              {isSubmitting ? 'Signing in...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
