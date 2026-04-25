import { useEffect } from 'react';

const Toast = ({ message, type, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getToastStyle = () => {
    switch (type) {
      case 'success':
        return { backgroundColor: '#10b981', color: 'white' };
      case 'error':
        return { backgroundColor: '#ef4444', color: 'white' };
      case 'warning':
        return { backgroundColor: '#f59e0b', color: 'white' };
      case 'info':
        return { backgroundColor: '#3b82f6', color: 'white' };
      default:
        return { backgroundColor: '#1f2a40', color: 'white' };
    }
  };

  return (
    <div
      className="toast"
      style={{
        ...getToastStyle(),
        padding: '12px 20px',
        borderRadius: '8px',
        marginBottom: '10px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        animation: 'slideIn 0.3s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: '250px',
      }}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          fontSize: '16px',
          marginLeft: 'auto',
          padding: '0 4px',
        }}
      >
        &times;
      </button>
    </div>
  );
};

export default Toast;
