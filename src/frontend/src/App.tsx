import { Suspense, useState, useEffect } from 'react';
import WavetableEditor from './components/WavetableEditor';
import './App.css';

function App() {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Check if the API is accessible
    fetch(import.meta.env.VITE_API_URL + '/health')
      .then(response => response.json())
      .catch(err => {
        console.error('API connection error:', err);
        setError(err);
      });
  }, []);

  if (error) {
    return (
      <div className="error-container">
        <h1>Something went wrong</h1>
        <p>Error connecting to API: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Suspense fallback={<div>Loading...</div>}>
        <WavetableEditor />
      </Suspense>
    </div>
  );
}

export default App;
