import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../styles/index.css';
import { getCurrentLocale } from '../shared/i18n';

document.documentElement.lang = getCurrentLocale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
