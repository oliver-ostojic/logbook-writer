'use client';

import { useState } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual auth logic
    console.log('Login submitted:', { username, password });
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-6 relative"
      style={{ backgroundColor: '#f0eee6' }}
    >
      {/* Brand title - outer card with pill shape matching inner */}
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

      {/* Outer wrapper card containing login form and continue button */}
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
                      href="/signup"
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
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'hsl(0, 84%, 60%)',
                color: 'white',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '1.5rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 55%)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'hsl(0, 84%, 60%)'}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
