import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Navbar from './components/Navbar.jsx';
import Login from './components/Login.jsx';
import PCD from './pages/PCD.jsx';
import AccountManager from './pages/AccountManager.jsx';
import ToastContainer from './components/ToastContainer.jsx';

function App() {
  return (
    <AuthProvider>
      <div className="App">
        <ToastContainer />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Navbar />
                <div className="main-content">
                  <Routes>
                    <Route path="/" element={<PCD />} />
                    <Route path="/pcd" element={<PCD />} />
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
