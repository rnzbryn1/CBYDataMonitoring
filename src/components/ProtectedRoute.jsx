import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  console.log('ProtectedRoute - isAuthenticated:', isAuthenticated, 'loading:', loading);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    console.log('Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  console.log('Authenticated, rendering children');
  return children;
};

export default ProtectedRoute;
