import React from 'react';

const Delivery = () => {
  return (
    <div className="container">
      <h2>Delivery</h2>
      <div className="table-section">
        <h3>Delivery Records</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Delivery Date</th>
              <th>Tracking</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan="6">No delivery records available</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Delivery;
