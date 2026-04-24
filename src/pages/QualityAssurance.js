import React from 'react';

const QualityAssurance = () => {
  return (
    <div className="container">
      <h2>Quality Assurance</h2>
      <div className="table-section">
        <h3>QA Records</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Product</th>
              <th>Test Type</th>
              <th>Result</th>
              <th>Tester</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No QA records available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QualityAssurance;
