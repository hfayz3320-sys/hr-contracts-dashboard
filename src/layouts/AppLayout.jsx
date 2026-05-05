import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuthStore } from '../auth/useAuthStore';

export default function AppLayout() {
  const initialized = useAuthStore((state) => state.initialized);
  const bootstrapping = useAuthStore((state) => state.bootstrapping);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (!initialized || bootstrapping) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-card">
          <img src="/assets/logo.png" alt="Mid Arabia logo" />
          <h1>HR Contracts Dashboard</h1>
          <p>Loading security context and protected modules...</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
