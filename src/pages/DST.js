import React from 'react';

const DST = () => {
  return (
    <div className="container">
      <h2>DST</h2>
      <div className="table-section">
        <h3>DST Records</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Task</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned To</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No DST records available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DST;
