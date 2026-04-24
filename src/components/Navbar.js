import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuth();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/salesdesk', label: 'Sales Desk' },
    { path: '/qualityassurance', label: 'Quality Assurance' },
    { path: '/pcd', label: 'PCD' },
    { path: '/dst', label: 'DST' },
    { path: '/engineering', label: 'Engineering' },
    { path: '/delivery', label: 'Delivery' }
  ];

  if (isAdmin) {
    menuItems.push({ path: '/accountmanager', label: 'Account Manager' });
  }

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
