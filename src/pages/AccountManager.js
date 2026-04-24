import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const AccountManager = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <div className="container">
      <h2>Access Denied</h2>
      <p>You don't have permission to access this page.</p>
    </div>;
  }

  return (
    <div className="container">
      <h2>Account Manager</h2>
      <div className="table-section">
        <h3>User Accounts</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No user accounts available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountManager;
