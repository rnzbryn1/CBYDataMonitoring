import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import SalesDesk from './pages/SalesDesk';
import QualityAssurance from './pages/QualityAssurance';
import PCD from './pages/PCD';
import DST from './pages/DST';
import Engineering from './pages/Engineering';
import Delivery from './pages/Delivery';
import AccountManager from './pages/AccountManager';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Navbar />
                <div className="main-content">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/salesdesk" element={<SalesDesk />} />
                    <Route path="/qualityassurance" element={<QualityAssurance />} />
                    <Route path="/pcd" element={<PCD />} />
                    <Route path="/dst" element={<DST />} />
                    <Route path="/engineering" element={<Engineering />} />
                    <Route path="/delivery" element={<Delivery />} />
                    <Route path="/accountmanager" element={<AccountManager />} />
                  </Routes>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </AuthProvider>
  );
}

export default App;
