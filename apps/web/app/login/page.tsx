'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { useAuthStore } from '@/lib/authStore';
import { login } from '@/lib/api/auth';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser } = useAuthStore();
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
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0eee6' }}>
        <div className="text-gray-500">Loading...</div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen relative"
      style={{ backgroundColor: '#f0eee6' }}
    >
      {/* Brand title - fixed at top center */}
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2"
        style={{ zIndex: 10 }}
      >
        <div
          className="ai-glass-border"
          style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}
        >
          <div
            style={{ ...aiGlassLightContentStyle('9999px', 0.6), padding: '16px' }}
          >
            {/* Inner pill for the title text */}
            <div
              className="ai-glass-border"
              style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}
            >
              <div
                style={{
                  ...aiGlassLightContentStyle('9999px', 0.6),
                  padding: '12px 48px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '20px',
                    color: '#2C2C2C',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Logbook </span>
                  <span style={{ fontWeight: 600 }}>writer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            {/* Login form - inner card */}
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
                  {/* Title row - Sign in left, Create account right */}
                  <div className="flex justify-between items-center">
                    {/* Sign into your account - left */}
                    <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          padding: '10px 20px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#2C2C2C',
                          }}
                        >
                          Sign into your account
                        </span>
                      </div>
                    </div>

                    {/* Create account - right */}
                    <a
                      href="/register"
                      className="ai-glass-border"
                      style={{ ...aiGlassLightBorderStyle('9999px'), textDecoration: 'none' }}
                    >
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          padding: '10px 20px',
                          transition: 'filter 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(0.94)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'none'}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: 'hsl(0, 84%, 60%)',
                          }}
                        >
                          Create account
                        </span>
                      </div>
                    </a>
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

                  {/* Username and Password fields in glass pill card */}
                  <div className="ai-glass-border rounded-[1.5rem]" style={aiGlassLightBorderStyle('1.5rem')}>
                    <div
                      style={{
                        ...aiGlassLightContentStyle('1.5rem', 0.6),
                        padding: '24px',
                      }}
                    >
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
