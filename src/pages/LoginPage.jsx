import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PasswordField from '../components/auth/PasswordField';
import { useAuthStore } from '../auth/useAuthStore';
import { permissionService } from '../security/services/permissionService';
import { PAGE_KEYS, getPageBySlug } from '../security/config/pages';

function resolvePostLoginRoute(access, requestedPath) {
  if (!requestedPath || requestedPath === '/forbidden') {
    return permissionService.getDefaultRoute(access);
  }

  if (requestedPath === '/admin') {
    return permissionService.canAccessPage(access, PAGE_KEYS.ADMIN, 'view')
      ? requestedPath
      : permissionService.getDefaultRoute(access);
  }

  const match = requestedPath.match(/^\/hr\/([^/]+)$/);
  if (match) {
    const pageDefinition = getPageBySlug(match[1]);
    return pageDefinition && permissionService.canAccessPage(access, pageDefinition.key, 'view')
      ? pageDefinition.route
      : permissionService.getDefaultRoute(access);
  }

  return permissionService.getDefaultRoute(access);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);

  const [formState, setFormState] = useState({
    identifier: '',
    password: '',
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    if (!String(formState.identifier || '').trim()) {
      nextErrors.identifier = 'Username or email is required.';
    }
    if (!String(formState.password || '').trim()) {
      nextErrors.password = 'Password is required.';
    }

    setErrors(nextErrors);
    setSubmitError('');

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const snapshot = await login(formState);
      const requestedPath = location.state?.from?.pathname;
      navigate(resolvePostLoginRoute(snapshot.access, requestedPath), { replace: true });
    } catch (error) {
      setSubmitError(error.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="login-shell">
        <div className="login-banner-strip" aria-label="Company banner">
          <div className="login-banner-track">
            <span>Mid Arabia for Contracting</span>
          </div>
        </div>

        <section className="login-hero">
          <div className="login-brand">
            <img src="/assets/logo.png" alt="Mid Arabia logo" />
            <div>
              <span className="login-kicker">Secure Access</span>
              <h1>HR Contracts Dashboard</h1>
              <p>
                Enterprise-ready authentication, modular authorization, and protected HR
                analytics access.
              </p>
            </div>
          </div>

          <div className="login-info-card">
            <h2>Security foundation included</h2>
            <ul>
              <li>Role-based access control with module and page permissions</li>
              <li>Protected routes for HR pages and system administration</li>
              <li>Mock storage structured for future backend integration</li>
            </ul>
          </div>
        </section>

        <section className="login-card">
          <div className="page-header">
            <div>
              <h1>Sign in</h1>
              <p>Use your assigned username or email to continue.</p>
            </div>
          </div>

          {submitError ? <div className="form-error">{submitError}</div> : null}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                value={formState.identifier}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    identifier: event.target.value,
                  }))
                }
                placeholder="superadmin or superadmin@midarabia.local"
                autoComplete="username"
              />
              {errors.identifier ? (
                <span className="field-error">{errors.identifier}</span>
              ) : null}
            </div>

            <PasswordField
              id="password"
              label="Password"
              value={formState.password}
              onChange={(value) =>
                setFormState((current) => ({
                  ...current,
                  password: value,
                }))
              }
              error={errors.password}
              placeholder="Enter your password"
            />

            <button type="submit" className="btn primary login-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
