// SPDX-FileCopyrightText: 2026 lasse tech, Lars Gossard
// SPDX-License-Identifier: MIT
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { MeProvider } from './lib/store.jsx';
import { lang } from './i18n/index.js';
import './fonts/fonts.css';
import './styles.css';

document.documentElement.lang = lang;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <MeProvider>
        <App />
      </MeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
