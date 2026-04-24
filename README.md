# CBY Data Monitoring System - React Version

A React-based data monitoring system converted from the original vanilla HTML/CSS/JS implementation.

## Features

- **Authentication**: User login/logout with Supabase authentication
- **Role-based Access**: Admin-only features and pages
- **Navigation**: Responsive navbar with active state management
- **Multiple Modules**: Dashboard, Sales Desk, Quality Assurance, PCD, DST, Engineering, Delivery
- **Account Management**: Admin-only user management interface

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   - Copy `.env.example` to `.env`
   - Update the Supabase URL and anon key:
   ```
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Start the development server**:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Login.js        # Login form component
│   ├── Navbar.js       # Navigation bar
│   └── ProtectedRoute.js # Route protection wrapper
├── contexts/           # React contexts
│   └── AuthContext.js  # Authentication context
├── pages/             # Page components
│   ├── Dashboard.js
│   ├── SalesDesk.js
│   ├── QualityAssurance.js
│   ├── PCD.js
│   ├── DST.js
│   ├── Engineering.js
│   ├── Delivery.js
│   └── AccountManager.js
├── services/          # Business logic and API calls
│   ├── auth.js        # Authentication service
│   └── supabase.js    # Supabase client and service
├── App.js             # Main application component
├── index.js           # Application entry point
└── index.css          # Global styles
```

## Key Differences from Original

1. **React Router**: Replaced iframe-based navigation with React Router
2. **Context API**: Centralized authentication state management
3. **Component-based**: Modular, reusable components instead of monolithic files
4. **Modern JavaScript**: ES6+ syntax and patterns
5. **Environment Variables**: Secure configuration management

## Authentication Flow

1. Users are redirected to `/login` if not authenticated
2. Login uses Supabase authentication
3. Auth state is managed through React Context
4. Protected routes automatically redirect unauthenticated users

## Admin Features

- Account Manager page (admin-only)
- Role-based UI element visibility
- Admin status checking via Supabase user profiles

## Development Notes

- The application maintains the same styling as the original
- All original functionality is preserved but modernized
- Components are structured for easy maintenance and extension
- Authentication is centralized and reusable across components

## Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build` folder.
