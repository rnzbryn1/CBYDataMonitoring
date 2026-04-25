import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuth();

  const menuItems = [
    { path: '/pcd', label: 'PCD' },
    { path: '/accountmanager', label: 'Account Manager' }
  ];

  const handleNavigation = (path) => {
    navigate(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="logo-container">
        <img src="/images/cbylogo.png" alt="Logo" className="logo-img" />
      </div>

      <ul className="menu">
        {menuItems.map((item) => (
          <li
            key={item.path}
            className={location.pathname === item.path ? 'active' : ''}
            onClick={() => handleNavigation(item.path)}
          >
            {item.label}
          </li>
        ))}
      </ul>

      <button onClick={handleLogout} className="logout-btn">
        Logout
      </button>
    </nav>
  );
};

export default Navbar;
