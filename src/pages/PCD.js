import React from 'react';

const PCD = () => {
  return (
    <div className="container">
      <h2>PCD</h2>
      <div className="table-section">
        <h3>PCD Records</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Project</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Assigned To</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No PCD records available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PCD;
