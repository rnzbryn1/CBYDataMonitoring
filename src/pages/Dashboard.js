import React from 'react';

const Dashboard = () => {
  return (
    <div className="container">
      <h2>Dashboard</h2>
      <div className="cards">
        <div className="card">
          <h3>Total Records</h3>
          <p>0</p>
        </div>
        <div className="card">
          <h3>Active Users</h3>
          <p>0</p>
        </div>
        <div className="card">
          <h3>Pending Tasks</h3>
          <p>0</p>
        </div>
        <div className="card">
          <h3>Completed Today</h3>
          <p>0</p>
        </div>
      </div>
      
      <div className="table-section">
        <h3>Recent Activity</h3>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="4">No recent activity</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
