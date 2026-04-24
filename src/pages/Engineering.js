import React from 'react';

const Engineering = () => {
  return (
    <div className="container">
      <h2>Engineering</h2>
      <div className="table-section">
        <h3>Engineering Projects</h3>
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
              <td colSpan="6">No engineering projects available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Engineering;
