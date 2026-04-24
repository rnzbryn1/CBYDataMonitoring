import React from 'react';

const SalesDesk = () => {
  return (
    <div className="container">
      <h2>Sales Desk</h2>
      <div className="table-section">
        <h3>Sales Data</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Customer</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No sales data available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesDesk;
